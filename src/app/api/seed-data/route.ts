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
              contact_person: 'Budi Santoso', email: 'budi@nike.co.id', phone: '+62215678901',
              address: 'Jl. TB Simatupang No. 18, Jakarta', city: 'Jakarta',
              tax_id: '01.234.567.8-901.000', is_active: true, payment_terms: 'NET_30',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-002', supplier_name: 'PT Zara Distribution', supplier_type: 'DISTRIBUTOR',
              contact_person: 'Maria Garcia', email: 'maria@zara.co.id', phone: '+62216789012',
              address: 'Jl. Jend. Sudirman Kav. 52, Jakarta', city: 'Jakarta',
              tax_id: '02.345.678.9-012.000', is_active: true, payment_terms: 'NET_60',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-003', supplier_name: 'CV Local Java Suppliers', supplier_type: 'LOCAL',
              contact_person: 'Agus Wijaya', email: 'agus@localjava.co.id', phone: '+62247890123',
              address: 'Jl. Pemuda No. 45, Semarang', city: 'Semarang',
              tax_id: '03.456.789.0-123.000', is_active: true, payment_terms: 'COD',
            },
            status: 'IN_REVIEW' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-004', supplier_name: 'PT Starbucks Coffee Indonesia', supplier_type: 'MANUFACTURER',
              contact_person: 'Linda Tan', email: 'linda@starbucks.co.id', phone: '+62218901234',
              address: 'Jl. Prof. Dr. Satrio Kav. 6, Jakarta', city: 'Jakarta',
              tax_id: '04.567.890.1-234.000', is_active: true, payment_terms: 'NET_30',
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              supplier_code: 'SUP-005', supplier_name: 'PT Unilever Indonesia', supplier_type: 'WHOLESALER',
              contact_person: 'Dewi Sartika', email: 'dewi@unilever.co.id', phone: '+62219012345',
              address: 'Jl. Gatot Subroto Kav. 35, Jakarta', city: 'Jakarta',
              tax_id: '05.678.901.2-345.000', is_active: true, payment_terms: 'NET_90',
            },
            status: 'DRAFT' as const,
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
              expiry_date: '2024-12-31', store_type: '', region: '', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-002', article_code: 'ART-002', price_type: 'REGULAR',
              price: 65000, currency: 'IDR', effective_date: '2024-01-01',
              expiry_date: '2024-12-31', store_type: '', region: '', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-003', article_code: 'ART-001', price_type: 'PROMOTIONAL',
              price: 1499000, currency: 'IDR', effective_date: '2024-06-01',
              expiry_date: '2024-08-31', store_type: 'SPECIALTY', region: 'JABODETABEK', is_active: true,
            },
            status: 'IN_REVIEW' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-004', article_code: 'ART-003', price_type: 'WHOLESALE',
              price: 420000, currency: 'IDR', effective_date: '2024-01-01',
              expiry_date: '2024-12-31', store_type: 'HYPERMARKET', region: '', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              pricing_code: 'PRC-005', article_code: 'ART-004', price_type: 'COST',
              price: 650000, currency: 'IDR', effective_date: '2024-01-01',
              expiry_date: '2024-12-31', store_type: '', region: '', is_active: true,
            },
            status: 'DRAFT' as const,
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
              promo_code: 'PROMO-001', promo_name: 'Summer Sale 2024', promo_type: 'DISCOUNT',
              discount_type: 'PERCENTAGE', discount_value: 25,
              start_date: '2024-06-01', end_date: '2024-08-31',
              applicable_categories: 'CLOTHING,FOOTWEAR', min_purchase: 500000,
              max_discount: 500000, store_type: '', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-002', promo_name: 'Buy 1 Get 1 Coffee', promo_type: 'BOGO',
              discount_type: 'PERCENTAGE', discount_value: 100,
              start_date: '2024-03-01', end_date: '2024-12-31',
              applicable_categories: 'FOOD', min_purchase: 0,
              max_discount: 65000, store_type: 'SPECIALTY', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-003', promo_name: 'Back to School Bundle', promo_type: 'BUNDLE',
              discount_type: 'PERCENTAGE', discount_value: 15,
              start_date: '2024-07-01', end_date: '2024-09-30',
              applicable_categories: 'STATIONERY,ELECTRONICS', min_purchase: 200000,
              max_discount: 300000, store_type: '', is_active: true,
            },
            status: 'IN_REVIEW' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-004', promo_name: 'Flash Sale Electronics', promo_type: 'FLASH_SALE',
              discount_type: 'PERCENTAGE', discount_value: 40,
              start_date: '2024-04-15', end_date: '2024-04-16',
              applicable_categories: 'ELECTRONICS', min_purchase: 1000000,
              max_discount: 2000000, store_type: 'HYPERMARKET', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              promo_code: 'PROMO-005', promo_name: 'Year End Clearance', promo_type: 'DISCOUNT',
              discount_type: 'PERCENTAGE', discount_value: 30,
              start_date: '2024-12-01', end_date: '2024-12-31',
              applicable_categories: 'CLOTHING,HOUSEHOLD', min_purchase: 0,
              max_discount: 1000000, store_type: '', is_active: true,
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
        // Indonesian retail catalog with cascading category/sub_category pairs
        // and MULTISELECT tags stored as comma-separated valueCodes.
        const articleData = [
          {
            payload: {
              article_code: 'ART-001', article_name: 'Nike Air Zoom Pegasus 40', category: 'SEPATU',
              sub_category: 'SEPATU_RUNNING', brand: 'Nike', uom: 'PCS', purchase_price: 1200000,
              selling_price: 1899000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Air Zoom Pegasus 40 — sepatu lari ringan dengan respons cushioning terbaik', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              article_code: 'ART-002', article_name: 'Aerostreet Sneakers Classic', category: 'SEPATU',
              sub_category: 'SEPATU_SNEAKERS', brand: 'Aerostreet', uom: 'PCS', purchase_price: 180000,
              selling_price: 325000, tags: 'BEST_SELLER', description: 'Sneakers lokal aerostreet model klasik, nyaman untuk harian', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              article_code: 'ART-003', article_name: 'Adidas Adiform Command School', category: 'SEPATU',
              sub_category: 'SEPATU_SEKOLAH', brand: 'Adidas', uom: 'PCS', purchase_price: 450000,
              selling_price: 799000, tags: 'FEATURED', description: 'Sepatu sekolah Adidas hitam putih, material kulit sintetis premium', is_active: true,
            },
            status: 'ACTIVE' as const,
          },
          {
            payload: {
              article_code: 'ART-004', article_name: 'Eiger Ransel Adventure 30L', category: 'TAS',
              sub_category: 'TAS_RANSEL', brand: 'Eiger', uom: 'PCS', purchase_price: 350000,
              selling_price: 599000, tags: 'BEST_SELLER,PREMIUM', description: 'Tas ransel Eiger 30L waterproof untuk outdoor & travel', is_active: true,
            },
            status: 'DRAFT' as const,
          },
          {
            payload: {
              article_code: 'ART-005', article_name: 'Casio G-Shock GA-2100', category: 'AKSESORIS',
              sub_category: 'AKS_JAM_TANGAN', brand: 'Casio', uom: 'PCS', purchase_price: 1450000,
              selling_price: 2199000, tags: 'EXCLUSIVE,PREMIUM', description: 'Jam tangan Casio G-Shock GA-2100 "Casioak" resin carbon core', is_active: true,
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
              store_code: 'STR-001', store_name: 'MAP Grand Indonesia', region: 'JABODETABEK',
              city: 'Jakarta', address: 'Grand Indonesia Mall Lt.1, Jl. MH Thamrin No.1',
              phone: '+62212555789', store_type: 'HYPERMARKET', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-002', store_name: 'MAP Pondok Indah Mall', region: 'JABODETABEK',
              city: 'Jakarta', address: 'Pondok Indah Mall, Jl. Metro Pondok Indah',
              phone: '+62212789012', store_type: 'SUPERMARKET', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-003', store_name: 'MAP Surabaya Tunjungan', region: 'EAST_JAVA',
              city: 'Surabaya', address: 'Tunjungan Plaza, Jl. Tunjungan No. 65-71',
              phone: '+62315678901', store_type: 'HYPERMARKET', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-004', store_name: 'Starbucks Pacific Place', region: 'JABODETABEK',
              city: 'Jakarta', address: 'Pacific Place Mall Lt.G, Jl. SCBD',
              phone: '+62212555432', store_type: 'SPECIALTY', is_active: true,
            },
          },
          {
            payload: {
              store_code: 'STR-005', store_name: 'Sports Arena Senayan', region: 'JABODETABEK',
              city: 'Jakarta', address: 'Senayan City Mall Lt.3, Jl. Asia Afrika',
              phone: '+62215789012', store_type: 'SPECIALTY', is_active: true,
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
