import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  try {
    // ── Authorization ────────────────────────────────────────────────────
    // Seed-data populates sample records into every module. Like /api/seed,
    // it must be callable from the anonymous on-mount flow on first run.
    // Rule:
    //   - If NO users exist at all (truly empty DB) → allow without auth.
    //   - Otherwise → require Super Admin.
    const userCount = await db.sysUser.count();
    const isFirstRun = userCount === 0;

    if (!isFirstRun) {
      const tokenPayload = getTokenFromHeaders(request.headers);
      if (!tokenPayload) {
        console.warn('[seed-data] Blocked unauthenticated re-seed attempt.');
        return NextResponse.json(
          { error: 'Unauthorized. Database is already seeded — authentication required.' },
          { status: 401 }
        );
      }
      if (!isSuperAdmin(tokenPayload.roles)) {
        console.warn(`[seed-data] Blocked non-super-admin re-seed attempt by user "${tokenPayload.username}".`);
        return NextResponse.json(
          { error: 'Forbidden. Only Super Admins may re-seed sample data.' },
          { status: 403 }
        );
      }
      console.info(`[seed-data] Authorized re-seed requested by Super Admin "${tokenPayload.username}".`);
    } else {
      console.info('[seed-data] First-run: allowing unauthenticated sample-data seed (database is empty).');
    }

    // Get default company (MAPI) and user (superadmin)
    const company = await db.tenantCompany.findFirst({ where: { companyCode: 'MAPI' } });
    if (!company) {
      return NextResponse.json({ error: 'MAPI company not found. Run /api/seed first.' }, { status: 400 });
    }

    const user = await db.sysUser.findFirst({ where: { username: 'superadmin' } });
    if (!user) {
      return NextResponse.json({ error: 'Superadmin user not found. Run /api/seed first.' }, { status: 400 });
    }

    // Get all modules
    const modules = await db.metaModule.findMany();
    const getModule = (code: string) => modules.find(m => m.moduleCode === code);
    const moduleMap: Record<string, string> = {};
    for (const m of modules) {
      moduleMap[m.moduleCode] = m.id;
    }

    // Count records per module
    const counts: Record<string, number> = {};
    for (const m of modules) {
      counts[m.moduleCode] = await db.dataRecord.count({ where: { moduleId: m.id } });
    }

    const summary: Record<string, number> = {};
    const now = new Date();

    // ============================================================
    // BUDGET MODULE
    // ============================================================
    if ((counts['BUDGET'] ?? 0) === 0) {
      const budgetModule = getModule('BUDGET');
      if (budgetModule) {
        const budgetData = [
          {
            payload: {
              budget_code: 'BGT-2024-001', budget_name: 'Marketing Budget 2024', department: 'MARKETING',
              fiscal_year: '2024', amount: 500000000, spent_amount: 125000000,
              start_date: '2024-01-01', end_date: '2024-12-31', status: 'PLANNED',
            },
            status: 'DRAFT' as const,
          },
          {
            payload: {
              budget_code: 'BGT-2024-002', budget_name: 'IT Infrastructure 2024', department: 'IT',
              fiscal_year: '2024', amount: 1200000000, spent_amount: 450000000,
              start_date: '2024-01-01', end_date: '2024-12-31', status: 'ACTIVE',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              budget_code: 'BGT-2024-003', budget_name: 'HR Development 2024', department: 'HR',
              fiscal_year: '2024', amount: 300000000, spent_amount: 180000000,
              start_date: '2024-01-01', end_date: '2024-12-31', status: 'ACTIVE',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              budget_code: 'BGT-2024-004', budget_name: 'Operations Budget Q1', department: 'OPERATIONS',
              fiscal_year: '2024', amount: 750000000, spent_amount: 200000000,
              start_date: '2024-01-01', end_date: '2024-03-31', status: 'IN_REVIEW',
            },
            status: 'IN_REVIEW' as const,
          },
          {
            payload: {
              budget_code: 'BGT-2024-005', budget_name: 'Sales Promotion 2024', department: 'SALES',
              fiscal_year: '2024', amount: 250000000, spent_amount: 0,
              start_date: '2024-01-01', end_date: '2024-12-31', status: 'DRAFT',
            },
            status: 'DRAFT' as const,
          },
        ];

        const createdBudgets = [];
        for (const item of budgetData) {
          const record = await db.dataRecord.create({
            data: {
              moduleId: budgetModule.id,
              companyId: company.id,
              status: item.status,
              currentPayload: JSON.stringify(item.payload),
              createdById: user.id,
              updatedById: user.id,
            },
          });
          createdBudgets.push({ record, status: item.status, payload: item.payload });
        }

        // Create DataVersion for ACTIVE records
        for (const item of createdBudgets.filter(b => b.status === 'ACTIVE')) {
          await db.dataVersion.create({
            data: {
              recordId: item.record.id,
              payloadSnapshot: item.record.currentPayload,
              versionNumber: 1,
              changedById: user.id,
              changeReason: 'Initial creation (auto-approved)',
              status: 'ACTIVE',
            },
          });
        }

        // Create ApprovalTicket for IN_REVIEW records
        for (const item of createdBudgets.filter(b => b.status === 'IN_REVIEW')) {
          await db.approvalTicket.create({
            data: {
              recordId: item.record.id,
              requestedById: user.id,
              status: 'PENDING',
              deltaPayload: item.record.currentPayload,
            },
          });
        }

        summary['BUDGET'] = budgetData.length;
      }
    }

    // ============================================================
    // ASSET MODULE
    // ============================================================
    if ((counts['ASSET'] ?? 0) === 0) {
      const assetModule = getModule('ASSET');
      if (assetModule) {
        const assetData = [
          {
            payload: {
              asset_code: 'AST-001', asset_name: 'Company Vehicle Toyota Innova', asset_type: 'VEHICLE',
              location: 'Jakarta HQ Parking', purchase_date: '2022-03-15', purchase_value: 350000000,
              current_value: 280000000, condition: 'GOOD',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              asset_code: 'AST-002', asset_name: 'Server Room Equipment', asset_type: 'IT_EQUIPMENT',
              location: 'Jakarta HQ 5th Floor', purchase_date: '2023-01-10', purchase_value: 500000000,
              current_value: 400000000, condition: 'GOOD',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              asset_code: 'AST-003', asset_name: 'Office Furniture 15th Floor', asset_type: 'FURNITURE',
              location: 'Jakarta HQ 15th Floor', purchase_date: '2021-06-20', purchase_value: 75000000,
              current_value: 50000000, condition: 'FAIR',
            },
            status: 'DRAFT' as const,
          },
          {
            payload: {
              asset_code: 'AST-004', asset_name: 'MacBook Pro Team', asset_type: 'IT_EQUIPMENT',
              location: 'Jakarta HQ Various', purchase_date: '2024-01-05', purchase_value: 120000000,
              current_value: 105000000, condition: 'NEW',
            },
            status: 'IN_REVIEW' as const,
          },
          {
            payload: {
              asset_code: 'AST-005', asset_name: 'Warehouse Building Cakung', asset_type: 'BUILDING',
              location: 'Cakung, East Jakarta', purchase_date: '2018-09-01', purchase_value: 5000000000,
              current_value: 5500000000, condition: 'GOOD',
            },
            status: 'ACTIVE' as const,
          },
        ];

        const createdAssets = [];
        for (const item of assetData) {
          const record = await db.dataRecord.create({
            data: {
              moduleId: assetModule.id,
              companyId: company.id,
              status: item.status,
              currentPayload: JSON.stringify(item.payload),
              createdById: user.id,
              updatedById: user.id,
            },
          });
          createdAssets.push({ record, status: item.status });
        }

        // Create DataVersion for ACTIVE records
        for (const item of createdAssets.filter(a => a.status === 'ACTIVE')) {
          await db.dataVersion.create({
            data: {
              recordId: item.record.id,
              payloadSnapshot: item.record.currentPayload,
              versionNumber: 1,
              changedById: user.id,
              changeReason: 'Initial creation (auto-approved)',
              status: 'ACTIVE',
            },
          });
        }

        // Create ApprovalTicket for IN_REVIEW records
        for (const item of createdAssets.filter(a => a.status === 'IN_REVIEW')) {
          await db.approvalTicket.create({
            data: {
              recordId: item.record.id,
              requestedById: user.id,
              status: 'PENDING',
              deltaPayload: item.record.currentPayload,
            },
          });
        }

        summary['ASSET'] = assetData.length;
      }
    }

    // ============================================================
    // SUPPLIER MASTER MODULE
    // ============================================================
    if ((counts['SUPPLIER_MASTER'] ?? 0) === 0) {
      const supplierModule = getModule('SUPPLIER_MASTER');
      if (supplierModule) {
        const supplierData = [
          {
            payload: {
              supplier_code: 'SUP-001', supplier_name: 'PT Nike Indonesia', supplier_type: 'MANUFACTURER',
              contact_person: 'Budi Santoso', email: 'procurement@nike.co.id', phone: '+62215550101',
              address: 'Jl. Industri No. 5, Kawasan Industri Pulogadung', city: 'Jakarta',
              tax_id: '01.234.567.8-091.000', is_active: true, payment_terms: 'NET_30',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-002', supplier_name: 'PT Adidas Indonesia', supplier_type: 'MANUFACTURER',
              contact_person: 'Siti Rahmawati', email: 'supply.id@adidas.com', phone: '+62215550102',
              address: 'Jl. MH Thamrin No. 28', city: 'Jakarta',
              tax_id: '01.345.678.9-092.000', is_active: true, payment_terms: 'NET_30',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-003', supplier_name: 'PT Puma Southeast Asia', supplier_type: 'DISTRIBUTOR',
              contact_person: 'Andi Wijaya', email: 'sea.orders@puma.com', phone: '+62215550103',
              address: 'Jl. Sudirman Kav. 52-53', city: 'Jakarta',
              tax_id: '01.456.789.0-093.000', is_active: true, payment_terms: 'NET_60',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-004', supplier_name: 'PT Under Armour Asia Pacific', supplier_type: 'DISTRIBUTOR',
              contact_person: 'Maya Putri', email: 'apac.supply@underarmour.com', phone: '+62215550104',
              address: 'SCBD Lot 14, Jl. Jend. Sudirman', city: 'Jakarta',
              tax_id: '01.567.890.1-094.000', is_active: true, payment_terms: 'NET_30',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-005', supplier_name: 'PT New Balance Indonesia', supplier_type: 'DISTRIBUTOR',
              contact_person: 'Rudi Hartono', email: 'id.supply@newbalance.com', phone: '+62215550105',
              address: 'Jl. Gajah Mada No. 88', city: 'Jakarta',
              tax_id: '01.678.901.2-095.000', is_active: true, payment_terms: 'NET_30',
            },
            status: 'IN_REVIEW' as const,
          },
        ];

        const createdSuppliers = [];
        for (const item of supplierData) {
          const record = await db.dataRecord.create({
            data: {
              moduleId: supplierModule.id,
              companyId: company.id,
              status: item.status,
              currentPayload: JSON.stringify(item.payload),
              createdById: user.id,
              updatedById: user.id,
            },
          });
          createdSuppliers.push({ record, status: item.status });
        }

        // Create DataVersion for ACTIVE records
        for (const item of createdSuppliers.filter(s => s.status === 'ACTIVE')) {
          await db.dataVersion.create({
            data: {
              recordId: item.record.id,
              payloadSnapshot: item.record.currentPayload,
              versionNumber: 1,
              changedById: user.id,
              changeReason: 'Initial creation (auto-approved)',
              status: 'ACTIVE',
            },
          });
        }

        // Create ApprovalTicket for IN_REVIEW records
        for (const item of createdSuppliers.filter(s => s.status === 'IN_REVIEW')) {
          await db.approvalTicket.create({
            data: {
              recordId: item.record.id,
              requestedById: user.id,
              status: 'PENDING',
              deltaPayload: item.record.currentPayload,
            },
          });
        }

        summary['SUPPLIER_MASTER'] = supplierData.length;
      }
    }

    // ============================================================
    // PRICING MASTER MODULE
    // ============================================================
    if ((counts['PRICING_MASTER'] ?? 0) === 0) {
      const pricingModule = getModule('PRICING_MASTER');
      if (pricingModule) {
        const pricingData = [
          {
            payload: {
              pricing_code: 'PRC-001', article_code: 'ART-001', price_type: 'REGULAR',
              price: 1899000, currency: 'IDR', effective_date: '2024-01-01',
              expiry_date: '2024-12-31', store_type: 'HYPERMARKET', region: 'JABODETABEK', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-002', article_code: 'ART-001', price_type: 'COST',
              price: 1200000, currency: 'IDR', effective_date: '2024-01-01',
              expiry_date: '2024-12-31', store_type: 'HYPERMARKET', region: 'JABODETABEK', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-003', article_code: 'ART-002', price_type: 'REGULAR',
              price: 3299000, currency: 'IDR', effective_date: '2024-02-01',
              expiry_date: '2025-01-31', store_type: 'HYPERMARKET', region: 'JABODETABEK', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-004', article_code: 'ART-010', price_type: 'REGULAR',
              price: 1299000, currency: 'IDR', effective_date: '2024-01-15',
              expiry_date: '2024-12-31', store_type: 'SPECIALTY', region: 'JABODETABEK', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-005', article_code: 'ART-012', price_type: 'PROMOTIONAL',
              price: 1399000, currency: 'IDR', effective_date: '2024-07-01',
              expiry_date: '2024-07-31', store_type: 'SUPERMARKET', region: 'WEST_JAVA', is_active: true,
            },
            status: 'IN_REVIEW' as const,
          },
        ];

        const createdPricings = [];
        for (const item of pricingData) {
          const record = await db.dataRecord.create({
            data: {
              moduleId: pricingModule.id,
              companyId: company.id,
              status: item.status,
              currentPayload: JSON.stringify(item.payload),
              createdById: user.id,
              updatedById: user.id,
            },
          });
          createdPricings.push({ record, status: item.status });
        }

        // Create DataVersion for ACTIVE records
        for (const item of createdPricings.filter(p => p.status === 'ACTIVE')) {
          await db.dataVersion.create({
            data: {
              recordId: item.record.id,
              payloadSnapshot: item.record.currentPayload,
              versionNumber: 1,
              changedById: user.id,
              changeReason: 'Initial creation (auto-approved)',
              status: 'ACTIVE',
            },
          });
        }

        // Create ApprovalTicket for IN_REVIEW records
        for (const item of createdPricings.filter(p => p.status === 'IN_REVIEW')) {
          await db.approvalTicket.create({
            data: {
              recordId: item.record.id,
              requestedById: user.id,
              status: 'PENDING',
              deltaPayload: item.record.currentPayload,
            },
          });
        }

        summary['PRICING_MASTER'] = pricingData.length;
      }
    }

    // ============================================================
    // PROMOTION MASTER MODULE
    // ============================================================
    if ((counts['PROMOTION_MASTER'] ?? 0) === 0) {
      const promoModule = getModule('PROMOTION_MASTER');
      if (promoModule) {
        const promoData = [
          {
            payload: {
              promo_code: 'PROMO-001', promo_name: 'mapclub Summer Sale 2024', promo_type: 'DISCOUNT',
              discount_type: 'PERCENTAGE', discount_value: 25,
              start_date: '2024-06-01', end_date: '2024-07-31',
              applicable_categories: 'APPAREL,FOOTWEAR', min_purchase: 500000,
              max_discount: 500000, store_type: 'HYPERMARKET', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-002', promo_name: 'Nike Running Week', promo_type: 'DISCOUNT',
              discount_type: 'PERCENTAGE', discount_value: 15,
              start_date: '2024-05-01', end_date: '2024-05-07',
              applicable_categories: 'RUNNING_SHOES', min_purchase: 1000000,
              max_discount: 300000, store_type: 'SPECIALTY', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-003', promo_name: 'Back to School Bundle', promo_type: 'BUNDLE',
              discount_type: 'PERCENTAGE', discount_value: 15,
              start_date: '2024-07-01', end_date: '2024-07-31',
              applicable_categories: 'FOOTWEAR,ACCESSORIES', min_purchase: 750000,
              max_discount: 200000, store_type: 'SUPERMARKET', is_active: true,
            },
            status: 'IN_REVIEW' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-004', promo_name: 'Jordan Brand Exclusive', promo_type: 'DISCOUNT',
              discount_type: 'FIXED', discount_value: 200000,
              start_date: '2024-09-01', end_date: '2024-09-30',
              applicable_categories: 'BASKETBALL_SHOES', min_purchase: 2000000,
              max_discount: 200000, store_type: 'SPECIALTY', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-005', promo_name: 'Year End Clearance', promo_type: 'DISCOUNT',
              discount_type: 'PERCENTAGE', discount_value: 30,
              start_date: '2024-12-01', end_date: '2024-12-31',
              applicable_categories: 'APPAREL,FOOTWEAR,ACCESSORIES', min_purchase: 0,
              max_discount: 1000000, store_type: 'HYPERMARKET', is_active: true,
            },
            status: 'DRAFT' as const,
          },
        ];

        const createdPromos = [];
        for (const item of promoData) {
          const record = await db.dataRecord.create({
            data: {
              moduleId: promoModule.id,
              companyId: company.id,
              status: item.status,
              currentPayload: JSON.stringify(item.payload),
              createdById: user.id,
              updatedById: user.id,
            },
          });
          createdPromos.push({ record, status: item.status });
        }

        // Create DataVersion for ACTIVE records
        for (const item of createdPromos.filter(p => p.status === 'ACTIVE')) {
          await db.dataVersion.create({
            data: {
              recordId: item.record.id,
              payloadSnapshot: item.record.currentPayload,
              versionNumber: 1,
              changedById: user.id,
              changeReason: 'Initial creation (auto-approved)',
              status: 'ACTIVE',
            },
          });
        }

        // Create ApprovalTicket for IN_REVIEW records
        for (const item of createdPromos.filter(p => p.status === 'IN_REVIEW')) {
          await db.approvalTicket.create({
            data: {
              recordId: item.record.id,
              requestedById: user.id,
              status: 'PENDING',
              deltaPayload: item.record.currentPayload,
            },
          });
        }

        summary['PROMOTION_MASTER'] = promoData.length;
      }
    }

    // ============================================================
    // ARTICLE MASTER MODULE (if also empty)
    // ============================================================
    if ((counts['ARTICLE_MASTER'] ?? 0) === 0) {
      const articleModule = getModule('ARTICLE_MASTER');
      if (articleModule) {
        // mapclub.com product catalog with cascading category/sub_category pairs
        const articleData = [
          {
            payload: {
              article_code: 'ART-001', article_name: 'Nike Air Zoom Pegasus 40', category: 'FOOTWEAR',
              sub_category: 'RUNNING_SHOES', brand: 'Nike', uom: 'PCS', purchase_price: 1200000,
              selling_price: 1899000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Air Zoom Pegasus 40 — lightweight running shoe with responsive ZoomX cushioning', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              article_code: 'ART-002', article_name: 'Adidas Ultraboost Light', category: 'FOOTWEAR',
              sub_category: 'RUNNING_SHOES', brand: 'Adidas', uom: 'PCS', purchase_price: 2200000,
              selling_price: 3299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Adidas Ultraboost Light with the lightest BOOST midsole ever created', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              article_code: 'ART-003', article_name: 'Nike Air Jordan 1 Retro High OG', category: 'FOOTWEAR',
              sub_category: 'BASKETBALL_SHOES', brand: 'Jordan', uom: 'PCS', purchase_price: 2500000,
              selling_price: 3899000, tags: 'EXCLUSIVE,PREMIUM', description: 'Air Jordan 1 Retro High OG — the icon that started it all', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              article_code: 'ART-004', article_name: 'Converse Chuck 70 High', category: 'FOOTWEAR',
              sub_category: 'CASUAL_SNEAKERS', brand: 'Converse', uom: 'PCS', purchase_price: 850000,
              selling_price: 1299000, tags: 'BEST_SELLER', description: 'Converse Chuck 70 High-top classic with premium canvas', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              article_code: 'ART-005', article_name: 'Nike Dri-FIT Miler Tee', category: 'APPAREL',
              sub_category: 'T_SHIRTS', brand: 'Nike', uom: 'PCS', purchase_price: 280000,
              selling_price: 449000, tags: 'BEST_SELLER', description: 'Nike Dri-FIT Miler running tee with moisture-wicking fabric', is_active: true,
            },
            status: 'IN_REVIEW' as const,
          },
        ];

        const createdArticles = [];
        for (const item of articleData) {
          const record = await db.dataRecord.create({
            data: {
              moduleId: articleModule.id,
              companyId: company.id,
              status: item.status,
              currentPayload: JSON.stringify(item.payload),
              createdById: user.id,
              updatedById: user.id,
            },
          });
          createdArticles.push({ record, status: item.status });
        }

        for (const item of createdArticles.filter(a => a.status === 'ACTIVE')) {
          await db.dataVersion.create({
            data: {
              recordId: item.record.id,
              payloadSnapshot: item.record.currentPayload,
              versionNumber: 1,
              changedById: user.id,
              changeReason: 'Initial creation (auto-approved)',
              status: 'ACTIVE',
            },
          });
        }

        for (const item of createdArticles.filter(a => a.status === 'IN_REVIEW')) {
          await db.approvalTicket.create({
            data: {
              recordId: item.record.id,
              requestedById: user.id,
              status: 'PENDING',
              deltaPayload: item.record.currentPayload,
            },
          });
        }

        summary['ARTICLE_MASTER'] = articleData.length;
      }
    }

    // ============================================================
    // STORE MASTER MODULE (if also empty)
    // ============================================================
    if ((counts['STORE_MASTER'] ?? 0) === 0) {
      const storeModule = getModule('STORE_MASTER');
      if (storeModule) {
        const storeData = [
          {
            payload: {
              store_code: 'STR-001', store_name: 'mapclub Grand Indonesia', region: 'JABODETABEK',
              city: 'Jakarta', address: 'Grand Indonesia Mall Lt.1, Jl. MH Thamrin No.1',
              phone: '+62212555789', store_type: 'HYPERMARKET', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-002', store_name: 'mapclub Pondok Indah Mall', region: 'JABODETABEK',
              city: 'Jakarta', address: 'Pondok Indah Mall Lt.2, Jl. Metro Pondok Indah',
              phone: '+62212789012', store_type: 'SUPERMARKET', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-003', store_name: 'mapclub Tunjungan Plaza Surabaya', region: 'EAST_JAVA',
              city: 'Surabaya', address: 'Tunjungan Plaza Lt.3, Jl. Tunjungan No. 65-71',
              phone: '+62315678901', store_type: 'HYPERMARKET', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-004', store_name: 'Nike Plaza Indonesia', region: 'JABODETABEK',
              city: 'Jakarta', address: 'Plaza Indonesia Lt.2, Jl. MH Thamrin Kav. 28-30',
              phone: '+62212903456', store_type: 'SPECIALTY', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-005', store_name: 'mapclub Bandung Indah Plaza', region: 'WEST_JAVA',
              city: 'Bandung', address: 'Bandung Indah Plaza Lt.1, Jl. Merdeka No. 60',
              phone: '+62224567890', store_type: 'SUPERMARKET', is_active: true,
            },
          },
        ];

        // Store Master has requireApproval: false, so all records should be ACTIVE
        const createdStores = [];
        for (const item of storeData) {
          const record = await db.dataRecord.create({
            data: {
              moduleId: storeModule.id,
              companyId: company.id,
              status: 'ACTIVE',
              currentPayload: JSON.stringify(item.payload),
              createdById: user.id,
              updatedById: user.id,
            },
          });
          createdStores.push({ record });
        }

        // Create DataVersion for all store records (all ACTIVE since no approval required)
        for (const item of createdStores) {
          await db.dataVersion.create({
            data: {
              recordId: item.record.id,
              payloadSnapshot: item.record.currentPayload,
              versionNumber: 1,
              changedById: user.id,
              changeReason: 'Initial creation (no approval required)',
              status: 'ACTIVE',
            },
          });
        }

        summary['STORE_MASTER'] = storeData.length;
      }
    }

    const totalCreated = Object.values(summary).reduce((sum, count) => sum + count, 0);

    return NextResponse.json({
      message: totalCreated > 0
        ? `Sample data seeded successfully. Created records for: ${Object.entries(summary).map(([k, v]) => `${k} (${v})`).join(', ')}`
        : 'All modules already have data. No new records created.',
      summary,
      totalCreated,
    });
  } catch (error) {
    console.error('[seed-data] Error:', error);
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : String(error);
    return NextResponse.json(
      { error: 'Failed to seed sample data', details: message },
      { status: 500 }
    );
  }
}
