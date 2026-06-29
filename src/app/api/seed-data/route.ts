import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { jsonVal } from '@/lib/db-json';

export async function POST(request: NextRequest) {
  try {
    // ── Authorization ────────────────────────────────────────────────────
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

    // Get companies
    const companyMAPI = await db.tenantCompany.findFirst({ where: { companyCode: 'MAPI' } });
    const companyMAPA = await db.tenantCompany.findFirst({ where: { companyCode: 'MAPA' } });
    const companyMBA = await db.tenantCompany.findFirst({ where: { companyCode: 'MBA' } });
    const companyMAPD = await db.tenantCompany.findFirst({ where: { companyCode: 'MAPD' } });
    if (!companyMAPI || !companyMAPA || !companyMBA || !companyMAPD) {
      return NextResponse.json({ error: 'Required companies not found. Run /api/seed first.' }, { status: 400 });
    }

    // Get default user
    const user = await db.sysUser.findFirst({ where: { username: 'superadmin' } });
    if (!user) {
      return NextResponse.json({ error: 'Superadmin user not found. Run /api/seed first.' }, { status: 400 });
    }

    // Get additional users for createdById (fallback to superadmin if not found — old DB may have different usernames)
    const userAdminMAPI = await db.sysUser.findFirst({ where: { username: 'admin_mapi' } }) || user;
    const userEditorMAPI = await db.sysUser.findFirst({ where: { username: 'editor_mapi1' } }) || user;
    const userAdminMAPA = await db.sysUser.findFirst({ where: { username: 'admin_mapa' } }) || user;
    const userEditorMBA = await db.sysUser.findFirst({ where: { username: 'editor_mba1' } }) || user;

    // Get all modules — create missing modules if needed (idempotent)
    let modules = await db.metaModule.findMany();

    const requiredModules = [
      { moduleCode: 'ARTICLE_MASTER', moduleName: 'Article Master', moduleIcon: 'Package', entityType: 'PRODUCT', description: 'Manage article/product master data', requireApproval: true, sortOrder: 1 },
      { moduleCode: 'STORE_MASTER', moduleName: 'Store Master', moduleIcon: 'Store', entityType: 'LOCATION', description: 'Store location master data management', requireApproval: false, sortOrder: 2 },
      { moduleCode: 'SUPPLIER_MASTER', moduleName: 'Supplier Master', moduleIcon: 'Truck', entityType: 'SUPPLIER', description: 'Manage supplier master data', requireApproval: true, sortOrder: 3 },
      { moduleCode: 'PRICING_MASTER', moduleName: 'Pricing Master', moduleIcon: 'Tag', entityType: 'PRODUCT', description: 'Manage pricing data', requireApproval: true, sortOrder: 4 },
      { moduleCode: 'PROMOTION_MASTER', moduleName: 'Promotion Master', moduleIcon: 'Gift', entityType: 'PRODUCT', description: 'Manage promotional campaigns', requireApproval: true, sortOrder: 5 },
      { moduleCode: 'CUSTOMER_MASTER', moduleName: 'Customer Master', moduleIcon: 'Users', entityType: 'CUSTOMER', description: 'Customer and loyalty member data management', requireApproval: true, sortOrder: 6 },
      { moduleCode: 'BRAND_MASTER', moduleName: 'Brand Master', moduleIcon: 'Award', entityType: 'PRODUCT', description: 'Brand registry and brand master data management', requireApproval: true, sortOrder: 7 },
      { moduleCode: 'CATEGORY_MASTER', moduleName: 'Category Master', moduleIcon: 'LayoutGrid', entityType: 'PRODUCT', description: 'Product categories and taxonomy management', requireApproval: true, sortOrder: 8 },
      { moduleCode: 'INVENTORY_MASTER', moduleName: 'Inventory Master', moduleIcon: 'Warehouse', entityType: 'LOCATION', description: 'Stock and inventory data management', requireApproval: true, sortOrder: 9 },
      { moduleCode: 'EMPLOYEE_MASTER', moduleName: 'Employee Master', moduleIcon: 'UserCheck', entityType: 'CUSTOMER', description: 'Employee directory and HR data management', requireApproval: true, sortOrder: 10 },
      { moduleCode: 'BUDGET', moduleName: 'Budget', moduleIcon: 'DollarSign', entityType: 'PRODUCT', description: 'Budget planning and tracking', requireApproval: true, sortOrder: 11 },
      { moduleCode: 'ASSET', moduleName: 'Asset', moduleIcon: 'Building2', entityType: 'ASSET', description: 'Asset management and tracking', requireApproval: true, sortOrder: 12 },
    ];

    // Create any missing modules
    for (const rm of requiredModules) {
      if (!modules.find(m => m.moduleCode === rm.moduleCode)) {
        await db.metaModule.create({ data: rm });
        console.info(`[seed-data] Created missing module: ${rm.moduleCode}`);
      }
    }
    // Refresh modules list after creating missing ones
    modules = await db.metaModule.findMany();

    const getModule = (code: string) => modules.find(m => m.moduleCode === code);
    const moduleMap: Record<string, string> = {};
    for (const m of modules) { moduleMap[m.moduleCode] = m.id; }

    // Count records per module
    const counts: Record<string, number> = {};
    for (const m of modules) {
      counts[m.moduleCode] = await db.dataRecord.count({ where: { moduleId: m.id } });
    }

    const summary: Record<string, number> = {};
    const now = new Date();

    // Helper: create records with versions and approval tickets
    async function createRecordsWithAudit(
      moduleCode: string,
      records: Array<{ payload: Record<string, unknown>; status: string; companyId?: string; createdById?: string }>,
    ) {
      const mod = getModule(moduleCode);
      if (!mod) return;
      if ((counts[moduleCode] ?? 0) > 0) return;

      const created: Array<{ record: { id: string; currentPayload: string }; status: string }> = [];
      for (const item of records) {
        const compId = item.companyId || companyMAPI!.id;
        const creatorId = item.createdById || user!.id;
        const record = await db.dataRecord.create({
          data: {
            moduleId: mod.id, companyId: compId, status: item.status,
            currentPayload: jsonVal(item.payload),
            createdById: creatorId, updatedById: creatorId,
          },
        });
        created.push({ record: { id: record.id, currentPayload: record.currentPayload }, status: item.status });
      }

      // Create DataVersion for ACTIVE records
      for (const item of created.filter(c => c.status === 'ACTIVE')) {
        await db.dataVersion.create({
          data: {
            recordId: item.record.id, payloadSnapshot: item.record.currentPayload,
            versionNumber: 1, changedById: user!.id, changeReason: 'Initial creation (auto-approved)', status: 'ACTIVE',
          },
        });
      }

      // Create ApprovalTicket for IN_REVIEW records
      for (const item of created.filter(c => c.status === 'IN_REVIEW')) {
        await db.approvalTicket.create({
          data: {
            recordId: item.record.id, requestedById: user!.id, status: 'PENDING', deltaPayload: item.record.currentPayload,
          },
        });
      }

      summary[moduleCode] = records.length;
    }

    // ============================================================
    // ARTICLE_MASTER (25+ products)
    // ============================================================
    await createRecordsWithAudit('ARTICLE_MASTER', [
      { payload: { article_code: 'ART-001', article_name: 'Nike Air Max 90', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Nike', uom: 'PCS', purchase_price: 1100000, selling_price: 1799000, tags: 'BEST_SELLER,PREMIUM', description: 'Nike Air Max 90 — iconic silhouette with visible Air cushioning', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-002', article_name: 'Nike Air Jordan 1 Retro High OG', category: 'FOOTWEAR', sub_category: 'BASKETBALL_SHOES', brand: 'Jordan', uom: 'PCS', purchase_price: 2500000, selling_price: 3899000, tags: 'EXCLUSIVE,PREMIUM', description: 'Air Jordan 1 Retro High OG — the icon that started it all', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id, createdById: userAdminMAPA?.id },
      { payload: { article_code: 'ART-003', article_name: 'Nike Dunk Low Retro', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Nike', uom: 'PCS', purchase_price: 980000, selling_price: 1599000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Dunk Low Retro — classic basketball-turned-lifestyle sneaker', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-004', article_name: 'Nike Air Force 1 Low', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Nike', uom: 'PCS', purchase_price: 750000, selling_price: 1299000, tags: 'BEST_SELLER', description: 'Nike Air Force 1 Low — the essential white sneaker', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-005', article_name: 'Adidas Ultraboost Light', category: 'FOOTWEAR', sub_category: 'RUNNING_SHOES', brand: 'Adidas', uom: 'PCS', purchase_price: 2200000, selling_price: 3299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Adidas Ultraboost Light with the lightest BOOST midsole ever', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { article_code: 'ART-006', article_name: 'Adidas Stan Smith', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Adidas', uom: 'PCS', purchase_price: 650000, selling_price: 1099000, tags: 'BEST_SELLER', description: 'Adidas Stan Smith — the classic white tennis shoe since 1971', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-007', article_name: 'Adidas NMD R1', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Adidas', uom: 'PCS', purchase_price: 1200000, selling_price: 1999000, tags: 'FEATURED', description: 'Adidas NMD R1 — progressive design meets BOOST comfort', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-008', article_name: 'Adidas Superstar', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Adidas', uom: 'PCS', purchase_price: 550000, selling_price: 999000, tags: 'BEST_SELLER', description: 'Adidas Superstar — the shell toe icon since 1969', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-009', article_name: 'Puma RS-X Reinvention', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Puma', uom: 'PCS', purchase_price: 900000, selling_price: 1499000, tags: 'NEW_ARRIVAL', description: 'Puma RS-X Reinvention — bold chunky design with RS technology', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-010', article_name: 'Puma Suede Classic XXI', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Puma', uom: 'PCS', purchase_price: 500000, selling_price: 899000, tags: 'BEST_SELLER', description: 'Puma Suede Classic — the B-Boy icon since 1968', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-011', article_name: 'Converse Chuck Taylor All Star High', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Converse', uom: 'PCS', purchase_price: 450000, selling_price: 799000, tags: 'BEST_SELLER', description: 'Converse Chuck Taylor — the most iconic sneaker of all time', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-012', article_name: 'Vans Old Skool', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Vans', uom: 'PCS', purchase_price: 400000, selling_price: 749000, tags: 'BEST_SELLER', description: 'Vans Old Skool — the classic side stripe skate shoe', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-013', article_name: 'Under Armour Curry 10', category: 'FOOTWEAR', sub_category: 'BASKETBALL_SHOES', brand: 'Under Armour', uom: 'PCS', purchase_price: 2100000, selling_price: 3299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'UA Curry 10 — Stephen Curry signature basketball shoe with UA Flow', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-014', article_name: 'New Balance 574 Classic', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'New Balance', uom: 'PCS', purchase_price: 700000, selling_price: 1199000, tags: 'BEST_SELLER', description: 'New Balance 574 — the quintessential NB lifestyle runner', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-015', article_name: 'The North Face ThermoBall Eco Jacket', category: 'APPAREL', sub_category: 'JACKETS', brand: 'The North Face', uom: 'PCS', purchase_price: 1800000, selling_price: 2999000, tags: 'PREMIUM,FEATURED', description: 'TNF ThermoBall Eco — sustainable insulation jacket for outdoor', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-016', article_name: 'Timberland 6-Inch Premium Boot', category: 'FOOTWEAR', sub_category: 'BOOTS', brand: 'Timberland', uom: 'PCS', purchase_price: 1900000, selling_price: 3199000, tags: 'PREMIUM,EXCLUSIVE', description: 'Timberland 6-Inch Premium Boot — the iconic waterproof boot', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-017', article_name: "Levi's 501 Original Fit Jeans", category: 'APPAREL', sub_category: 'PANTS', brand: "Levi's", uom: 'PCS', purchase_price: 650000, selling_price: 1099000, tags: 'BEST_SELLER', description: "Levi's 501 — the original blue jean since 1873", is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-018', article_name: 'Tommy Hilfiger Classic Polo', category: 'APPAREL', sub_category: 'T_SHIRTS', brand: 'Tommy Hilfiger', uom: 'PCS', purchase_price: 550000, selling_price: 899000, tags: 'PREMIUM', description: 'Tommy Hilfiger Classic Polo — timeless preppy style', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-019', article_name: 'Starbucks Tumbler Matte Black 473ml', category: 'ACCESSORIES', sub_category: 'BAGS', brand: 'Starbucks', uom: 'PCS', purchase_price: 180000, selling_price: 350000, tags: 'NEW_ARRIVAL,FEATURED', description: 'Starbucks matte black tumbler, vacuum insulated 473ml', is_active: true }, status: 'ACTIVE', companyId: companyMBA.id, createdById: userEditorMBA?.id },
      { payload: { article_code: 'ART-020', article_name: 'Nike Dri-FIT Miler Tee', category: 'APPAREL', sub_category: 'T_SHIRTS', brand: 'Nike', uom: 'PCS', purchase_price: 280000, selling_price: 449000, tags: 'BEST_SELLER', description: 'Nike Dri-FIT Miler running tee with moisture-wicking fabric', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-021', article_name: 'Adidas Tiro Track Jacket', category: 'APPAREL', sub_category: 'JACKETS', brand: 'Adidas', uom: 'PCS', purchase_price: 750000, selling_price: 1299000, tags: 'NEW_ARRIVAL', description: 'Adidas Tiro — the ultimate football warm-up jacket', is_active: true }, status: 'IN_REVIEW' },
      { payload: { article_code: 'ART-022', article_name: 'Nike Air Zoom Pegasus 40', category: 'FOOTWEAR', sub_category: 'RUNNING_SHOES', brand: 'Nike', uom: 'PCS', purchase_price: 1200000, selling_price: 1899000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Air Zoom Pegasus 40 — responsive ZoomX cushioning', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-023', article_name: 'Casio G-Shock GA-2100', category: 'ACCESSORIES', sub_category: 'WATCHES', brand: 'Casio', uom: 'PCS', purchase_price: 1450000, selling_price: 2199000, tags: 'EXCLUSIVE,PREMIUM', description: 'Casio G-Shock GA-2100 "Casioak" resin carbon core', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-024', article_name: 'Nike Sportswear Club Fleece Hoodie', category: 'APPAREL', sub_category: 'HOODIES', brand: 'Nike', uom: 'PCS', purchase_price: 450000, selling_price: 749000, tags: 'BEST_SELLER', description: 'Nike Club Fleece Hoodie — soft, warm, and versatile', is_active: true }, status: 'ACTIVE' },
      { payload: { article_code: 'ART-025', article_name: 'Puma x AMI Suede XL', category: 'FOOTWEAR', sub_category: 'CASUAL_SNEAKERS', brand: 'Puma', uom: 'PCS', purchase_price: 1500000, selling_price: 2499000, tags: 'LIMITED,EXCLUSIVE', description: 'Puma x AMI Suede XL — the Parisian collab on the classic silhouette', is_active: true }, status: 'DRAFT' },
    ]);

    // ============================================================
    // STORE_MASTER (20+ stores)
    // ============================================================
    await createRecordsWithAudit('STORE_MASTER', [
      { payload: { store_code: 'STR-001', store_name: 'MAP Active Grand Indonesia', mall_name: 'Grand Indonesia', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Grand Indonesia Mall Lt.1, Jl. MH Thamrin No.1', phone: '+62212955789', store_type: 'FLAGSHIP', operating_hours: '10:00-22:00', area_sqm: 450, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-002', store_name: 'Nike Plaza Indonesia', mall_name: 'Plaza Indonesia', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Plaza Indonesia Lt.2, Jl. MH Thamrin Kav. 28-30', phone: '+62212903456', store_type: 'FLAGSHIP', operating_hours: '10:00-22:00', area_sqm: 380, is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { store_code: 'STR-003', store_name: 'MAP Active Pondok Indah Mall', mall_name: 'Pondok Indah Mall', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Pondok Indah Mall 2 Lt.2, Jl. Metro Pondok Indah', phone: '+62212789012', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 250, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-004', store_name: 'Adidas Senayan City', mall_name: 'Senayan City', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Senayan City Mall Lt.3, Jl. Asia Afrika', phone: '+62215789012', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 200, is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { store_code: 'STR-005', store_name: 'MAP Active Pacific Place', mall_name: 'Pacific Place', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Pacific Place Mall Lt.3, Jl. SCBD', phone: '+62212555432', store_type: 'FLAGSHIP', operating_hours: '10:00-22:00', area_sqm: 350, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-006', store_name: 'Nike Mall Kelapa Gading', mall_name: 'Mall Kelapa Gading', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Mall Kelapa Gading 5 Lt.2, Jl. Boulevard Raya', phone: '+62214523678', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 220, is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { store_code: 'STR-007', store_name: 'Starbucks Taman Anggrek', mall_name: 'Taman Anggrek Mall', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Taman Anggrek Mall Lt.G, Jl. S. Parman', phone: '+62215678123', store_type: 'SPECIALTY', operating_hours: '07:00-23:00', area_sqm: 120, is_active: true }, status: 'ACTIVE', companyId: companyMBA.id, createdById: userEditorMBA?.id },
      { payload: { store_code: 'STR-008', store_name: 'MAP Active Plaza Senayan', mall_name: 'Plaza Senayan', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Plaza Senayan Lt.2, Jl. Asia Afrika No.8', phone: '+62215728394', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 200, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-009', store_name: 'Nike Lot 10 Bandung', mall_name: 'Lot 10 Mall', region: 'WEST_JAVA', city: 'Bandung', province: 'Jawa Barat', address: 'Lot 10 Mall Lt.1, Jl. Dago No.48', phone: '+62224203678', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 180, is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { store_code: 'STR-010', store_name: 'MAP Active Paris Van Java', mall_name: 'Paris Van Java Mall', region: 'WEST_JAVA', city: 'Bandung', province: 'Jawa Barat', address: 'PVJ Mall Lt.2, Jl. Sukajadi No.131-139', phone: '+62222045678', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 230, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-011', store_name: 'MAP Active Tunjungan Plaza Surabaya', mall_name: 'Tunjungan Plaza', region: 'EAST_JAVA', city: 'Surabaya', province: 'Jawa Timur', address: 'Tunjungan Plaza Lt.3, Jl. Tunjungan No.65-71', phone: '+62315678901', store_type: 'FLAGSHIP', operating_hours: '10:00-22:00', area_sqm: 400, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-012', store_name: 'Nike Pakuwon Mall Surabaya', mall_name: 'Pakuwon Mall', region: 'EAST_JAVA', city: 'Surabaya', province: 'Jawa Timur', address: 'Pakuwon Mall Lt.2, Jl. Puncak Indah Lontar', phone: '+62317534256', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 190, is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { store_code: 'STR-013', store_name: 'Starbucks Beachwalk Bali', mall_name: 'Beachwalk Mall', region: 'BALI_NT', city: 'Badung', province: 'Bali', address: 'Beachwalk Mall Lt.1, Jl. Pantai Kuta', phone: '+62361764532', store_type: 'SPECIALTY', operating_hours: '08:00-23:00', area_sqm: 150, is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { store_code: 'STR-014', store_name: 'MAP Active Sun Plaza Medan', mall_name: 'Sun Plaza', region: 'SUMATRA', city: 'Medan', province: 'Sumatera Utara', address: 'Sun Plaza Lt.2, Jl. Zainul Arifin', phone: '+62614528901', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 210, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-015', store_name: 'MAP Active Trans Studio Mall Makassar', mall_name: 'Trans Studio Mall', region: 'SULAWESI', city: 'Makassar', province: 'Sulawesi Selatan', address: 'Trans Studio Mall Lt.2, Jl. Metro Tanjung Bunga', phone: '+624118456723', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 200, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-016', store_name: 'Nike Malioboro Mall Yogyakarta', mall_name: 'Malioboro Mall', region: 'CENTRAL_JAVA', city: 'Yogyakarta', province: 'DI Yogyakarta', address: 'Malioboro Mall Lt.2, Jl. Malioboro No.52-58', phone: '+62274563782', store_type: 'STANDARD', operating_hours: '10:00-22:00', area_sqm: 170, is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { store_code: 'STR-017', store_name: 'Pizza Hut Ciputra World Jakarta', mall_name: 'Ciputra World', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Ciputra World Lt.4, Jl. Prof. Dr. Satrio', phone: '+62212967834', store_type: 'SPECIALTY', operating_hours: '10:00-22:00', area_sqm: 180, is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { store_code: 'STR-018', store_name: 'MAP Active Central Park Jakarta', mall_name: 'Central Park Mall', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Central Park Mall Lt.2, Jl. Letjen S. Parman', phone: '+62215689701', store_type: 'FLAGSHIP', operating_hours: '10:00-22:00', area_sqm: 350, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-019', store_name: 'MAP Active BOTANI Square Bogor', mall_name: 'Botani Square', region: 'WEST_JAVA', city: 'Bogor', province: 'Jawa Barat', address: 'Botani Square Lt.2, Jl. Pajajaran No.55-58', phone: '+622518376254', store_type: 'OUTLET', operating_hours: '10:00-22:00', area_sqm: 150, is_active: true }, status: 'ACTIVE' },
      { payload: { store_code: 'STR-020', store_name: 'Starbucks Grand Indonesia', mall_name: 'Grand Indonesia', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Grand Indonesia West Mall Lt.1, Jl. MH Thamrin No.1', phone: '+62212555790', store_type: 'SPECIALTY', operating_hours: '07:00-23:00', area_sqm: 130, is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
    ]);

    // ============================================================
    // CUSTOMER_MASTER (20+ customers with Indonesian names)
    // ============================================================
    await createRecordsWithAudit('CUSTOMER_MASTER', [
      { payload: { customer_code: 'CUS-001', full_name: 'Budi Santoso', email: 'budi.santoso@gmail.com', phone: '+62812345678', membership_tier: 'GOLD', total_points: 12500, total_spent: 15000000, join_date: '2022-03-15', preferred_store: 'MAP Active Grand Indonesia', gender: 'MALE', date_of_birth: '1985-07-20', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-002', full_name: 'Siti Nurhaliza', email: 'siti.nurhaliza@yahoo.com', phone: '+62823456789', membership_tier: 'PLATINUM', total_points: 45000, total_spent: 55000000, join_date: '2021-01-10', preferred_store: 'Nike Plaza Indonesia', gender: 'FEMALE', date_of_birth: '1990-01-11', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-003', full_name: 'Ahmad Fauzi', email: 'ahmad.fauzi@outlook.com', phone: '+62834567890', membership_tier: 'SILVER', total_points: 5000, total_spent: 5000000, join_date: '2023-06-22', preferred_store: 'MAP Active Pacific Place', gender: 'MALE', date_of_birth: '1992-05-30', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-004', full_name: 'Dewi Lestari', email: 'dewi.lestari@gmail.com', phone: '+62845678901', membership_tier: 'GOLD', total_points: 18000, total_spent: 22000000, join_date: '2022-08-14', preferred_store: 'MAP Active Pondok Indah Mall', gender: 'FEMALE', date_of_birth: '1988-11-05', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-005', full_name: 'Rudi Hartono', email: 'rudi.hartono@gmail.com', phone: '+62856789012', membership_tier: 'REGULAR', total_points: 1200, total_spent: 1200000, join_date: '2024-01-05', preferred_store: 'MAP Active Central Park Jakarta', gender: 'MALE', date_of_birth: '1995-03-18', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-006', full_name: 'Rina Marlina', email: 'rina.marlina@yahoo.com', phone: '+62867890123', membership_tier: 'SILVER', total_points: 7500, total_spent: 8500000, join_date: '2023-02-28', preferred_store: 'MAP Active Tunjungan Plaza', gender: 'FEMALE', date_of_birth: '1991-09-12', city: 'Surabaya' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-007', full_name: 'Yoga Pratama', email: 'yoga.pratama@gmail.com', phone: '+62878901234', membership_tier: 'GOLD', total_points: 15000, total_spent: 18000000, join_date: '2022-05-10', preferred_store: 'Nike Mall Kelapa Gading', gender: 'MALE', date_of_birth: '1987-12-25', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-008', full_name: 'Putri Handayani', email: 'putri.handayani@outlook.com', phone: '+62889012345', membership_tier: 'PLATINUM', total_points: 38000, total_spent: 42000000, join_date: '2021-06-01', preferred_store: 'MAP Active Grand Indonesia', gender: 'FEMALE', date_of_birth: '1983-04-08', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-009', full_name: 'Fajar Nugroho', email: 'fajar.nugroho@gmail.com', phone: '+62890123456', membership_tier: 'REGULAR', total_points: 800, total_spent: 900000, join_date: '2024-03-15', preferred_store: 'MAP Active Paris Van Java', gender: 'MALE', date_of_birth: '1998-08-14', city: 'Bandung' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-010', full_name: 'Maya Indah', email: 'maya.indah@yahoo.com', phone: '+62801234567', membership_tier: 'SILVER', total_points: 6200, total_spent: 7200000, join_date: '2023-04-20', preferred_store: 'Starbucks Pacific Place', gender: 'FEMALE', date_of_birth: '1993-02-28', city: 'Jakarta' }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { customer_code: 'CUS-011', full_name: 'Hendra Wijaya', email: 'hendra.wijaya@gmail.com', phone: '+62811234567', membership_tier: 'GOLD', total_points: 11200, total_spent: 13500000, join_date: '2022-09-05', preferred_store: 'Adidas Senayan City', gender: 'MALE', date_of_birth: '1986-06-15', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-012', full_name: 'Andi Saputra', email: 'andi.saputra@gmail.com', phone: '+62821345678', membership_tier: 'REGULAR', total_points: 500, total_spent: 600000, join_date: '2024-05-01', preferred_store: 'MAP Active Sun Plaza Medan', gender: 'MALE', date_of_birth: '1997-10-22', city: 'Medan' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-013', full_name: 'Lina Susanti', email: 'lina.susanti@yahoo.com', phone: '+62832456789', membership_tier: 'SILVER', total_points: 4800, total_spent: 5800000, join_date: '2023-07-12', preferred_store: 'MAP Active Trans Studio Mall Makassar', gender: 'FEMALE', date_of_birth: '1994-04-03', city: 'Makassar' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-014', full_name: 'Dian Purnama', email: 'dian.purnama@gmail.com', phone: '+62843567890', membership_tier: 'GOLD', total_points: 14000, total_spent: 16500000, join_date: '2022-11-08', preferred_store: 'Nike Malioboro Mall Yogyakarta', gender: 'MALE', date_of_birth: '1989-01-30', city: 'Yogyakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-015', full_name: 'Ratna Sari', email: 'ratna.sari@outlook.com', phone: '+62854678901', membership_tier: 'PLATINUM', total_points: 52000, total_spent: 68000000, join_date: '2020-08-20', preferred_store: 'MAP Active Grand Indonesia', gender: 'FEMALE', date_of_birth: '1982-07-17', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-016', full_name: 'Wahyu Hidayat', email: 'wahyu.hidayat@gmail.com', phone: '+62865789012', membership_tier: 'SILVER', total_points: 3500, total_spent: 4200000, join_date: '2023-10-01', preferred_store: 'MAP Active BOTANI Square Bogor', gender: 'MALE', date_of_birth: '1996-11-09', city: 'Bogor' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-017', full_name: 'Citra Dewi', email: 'citra.dewi@yahoo.com', phone: '+62876890123', membership_tier: 'REGULAR', total_points: 1500, total_spent: 1800000, join_date: '2024-02-14', preferred_store: 'Starbucks Beachwalk Bali', gender: 'FEMALE', date_of_birth: '1999-05-20', city: 'Badung' }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { customer_code: 'CUS-018', full_name: 'Reza Mahendra', email: 'reza.mahendra@gmail.com', phone: '+62887901234', membership_tier: 'GOLD', total_points: 16500, total_spent: 19500000, join_date: '2022-04-25', preferred_store: 'MAP Active Pacific Place', gender: 'MALE', date_of_birth: '1984-09-13', city: 'Jakarta' }, status: 'ACTIVE' },
      { payload: { customer_code: 'CUS-019', full_name: 'Nita Kusuma', email: 'nita.kusuma@outlook.com', phone: '+62898012345', membership_tier: 'SILVER', total_points: 5800, total_spent: 6900000, join_date: '2023-01-18', preferred_store: 'MAP Active Plaza Senayan', gender: 'FEMALE', date_of_birth: '1990-12-01', city: 'Jakarta' }, status: 'IN_REVIEW' },
      { payload: { customer_code: 'CUS-020', full_name: 'Joko Prasetyo', email: 'joko.prasetyo@gmail.com', phone: '+62809123456', membership_tier: 'REGULAR', total_points: 300, total_spent: 350000, join_date: '2024-06-10', preferred_store: 'MAP Active Lot 10 Bandung', gender: 'MALE', date_of_birth: '2000-03-05', city: 'Bandung' }, status: 'DRAFT' },
    ]);

    // ============================================================
    // BRAND_MASTER (15+ brands)
    // ============================================================
    await createRecordsWithAudit('BRAND_MASTER', [
      { payload: { brand_code: 'BRD-001', brand_name: 'Nike', brand_origin: 'USA', parent_company: 'Nike Inc.', category: 'Footwear, Apparel, Accessories', website: 'https://www.nike.com', description: 'Global leader in athletic footwear, apparel, and equipment' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-002', brand_name: 'Adidas', brand_origin: 'Germany', parent_company: 'Adidas AG', category: 'Footwear, Apparel, Accessories', website: 'https://www.adidas.com', description: 'German multinational sportswear corporation' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-003', brand_name: 'Puma', brand_origin: 'Germany', parent_company: 'Puma SE', category: 'Footwear, Apparel, Accessories', website: 'https://www.puma.com', description: 'German multinational sportswear and casual footwear manufacturer' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-004', brand_name: 'Converse', brand_origin: 'USA', parent_company: 'Nike Inc.', category: 'Footwear, Apparel', website: 'https://www.converse.com', description: 'American lifestyle brand known for the iconic Chuck Taylor' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-005', brand_name: 'Vans', brand_origin: 'USA', parent_company: 'VF Corporation', category: 'Footwear, Apparel', website: 'https://www.vans.com', description: 'American manufacturer of skateboarding shoes and related apparel' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-006', brand_name: 'Under Armour', brand_origin: 'USA', parent_company: 'Under Armour Inc.', category: 'Footwear, Apparel, Accessories', website: 'https://www.underarmour.com', description: 'American sports equipment company' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-007', brand_name: 'New Balance', brand_origin: 'USA', parent_company: 'New Balance Athletics Inc.', category: 'Footwear, Apparel', website: 'https://www.newbalance.com', description: 'American sports footwear and apparel brand' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-008', brand_name: 'The North Face', brand_origin: 'USA', parent_company: 'VF Corporation', category: 'Apparel, Outdoor Equipment', website: 'https://www.thenorthface.com', description: 'American outdoor recreation product company' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-009', brand_name: 'Timberland', brand_origin: 'USA', parent_company: 'VF Corporation', category: 'Footwear, Apparel', website: 'https://www.timberland.com', description: 'American manufacturer and retailer of outdoor wear' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-010', brand_name: "Levi's", brand_origin: 'USA', parent_company: 'Levi Strauss & Co.', category: 'Apparel', website: 'https://www.levi.com', description: 'American clothing company known worldwide for its denim jeans' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-011', brand_name: 'Tommy Hilfiger', brand_origin: 'USA', parent_company: 'PVH Corp.', category: 'Apparel, Accessories', website: 'https://www.tommy.com', description: 'American premium clothing brand' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-012', brand_name: 'Starbucks', brand_origin: 'USA', parent_company: 'Starbucks Corporation', category: 'Food & Beverage', website: 'https://www.starbucks.com', description: 'American multinational chain of coffeehouses' }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { brand_code: 'BRD-013', brand_name: 'Zara', brand_origin: 'Spain', parent_company: 'Inditex', category: 'Apparel, Accessories', website: 'https://www.zara.com', description: 'Spanish apparel retailer known for fast fashion' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-014', brand_name: 'H&M', brand_origin: 'Sweden', parent_company: 'H&M Group', category: 'Apparel, Accessories', website: 'https://www.hm.com', description: 'Swedish multinational clothing retailer' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-015', brand_name: 'Marks & Spencer', brand_origin: 'UK', parent_company: 'Marks and Spencer Group plc', category: 'Apparel, Food, Home', website: 'https://www.marksandspencer.com', description: 'British multinational retailer' }, status: 'ACTIVE' },
      { payload: { brand_code: 'BRD-016', brand_name: 'Jordan', brand_origin: 'USA', parent_company: 'Nike Inc.', category: 'Footwear, Apparel', website: 'https://www.nike.com/jordan', description: 'Basketball brand created for Michael Jordan' }, status: 'ACTIVE' },
    ]);

    // ============================================================
    // CATEGORY_MASTER (15+ categories)
    // ============================================================
    await createRecordsWithAudit('CATEGORY_MASTER', [
      { payload: { category_code: 'CAT-001', category_name: 'Footwear', parent_category: '', level: 0, description: 'All types of shoes and footwear', is_active: true, sort_order: 0 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-002', category_name: 'Apparel', parent_category: '', level: 0, description: 'Clothing and apparel items', is_active: true, sort_order: 1 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-003', category_name: 'Accessories', parent_category: '', level: 0, description: 'Fashion and lifestyle accessories', is_active: true, sort_order: 2 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-004', category_name: 'Sports Equipment', parent_category: '', level: 0, description: 'Sports and fitness equipment', is_active: true, sort_order: 3 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-005', category_name: 'Food & Beverage', parent_category: '', level: 0, description: 'Food, beverages, and related items', is_active: true, sort_order: 4 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-006', category_name: 'Beauty', parent_category: '', level: 0, description: 'Beauty and personal care products', is_active: true, sort_order: 5 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-007', category_name: 'Home & Living', parent_category: '', level: 0, description: 'Home decor and lifestyle products', is_active: true, sort_order: 6 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-008', category_name: 'Running Shoes', parent_category: 'CAT-001', level: 1, description: 'Shoes designed for running and jogging', is_active: true, sort_order: 0 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-009', category_name: 'Basketball Shoes', parent_category: 'CAT-001', level: 1, description: 'Shoes designed for basketball', is_active: true, sort_order: 1 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-010', category_name: 'Casual Sneakers', parent_category: 'CAT-001', level: 1, description: 'Casual and lifestyle sneakers', is_active: true, sort_order: 2 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-011', category_name: 'T-Shirts', parent_category: 'CAT-002', level: 1, description: 'Casual and athletic t-shirts', is_active: true, sort_order: 0 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-012', category_name: 'Jackets', parent_category: 'CAT-002', level: 1, description: 'Outerwear and jackets', is_active: true, sort_order: 1 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-013', category_name: 'Bags', parent_category: 'CAT-003', level: 1, description: 'Backpacks, tote bags, and accessories', is_active: true, sort_order: 0 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-014', category_name: 'Watches', parent_category: 'CAT-003', level: 1, description: 'Digital and analog watches', is_active: true, sort_order: 1 }, status: 'ACTIVE' },
      { payload: { category_code: 'CAT-015', category_name: 'Coffee & Beverages', parent_category: 'CAT-005', level: 1, description: 'Coffee, tea, and beverage products', is_active: true, sort_order: 0 }, status: 'ACTIVE' },
    ]);

    // ============================================================
    // SUPPLIER_MASTER (10+ suppliers)
    // ============================================================
    await createRecordsWithAudit('SUPPLIER_MASTER', [
      { payload: { supplier_code: 'SUP-001', supplier_name: 'PT Nike Indonesia', supplier_type: 'MANUFACTURER', contact_person: 'Bambang Kusumo', email: 'procurement@nike.co.id', phone: '+62215550101', address: 'Jl. Industri No. 5, Kawasan Industri Pulogadung', city: 'Jakarta', tax_id: '01.234.567.8-091.000', is_active: true, payment_terms: 'NET_30' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-002', supplier_name: 'PT Adidas Indonesia', supplier_type: 'MANUFACTURER', contact_person: 'Siti Rahmawati', email: 'supply.id@adidas.com', phone: '+62215550102', address: 'Jl. MH Thamrin No. 28', city: 'Jakarta', tax_id: '01.345.678.9-092.000', is_active: true, payment_terms: 'NET_30' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-003', supplier_name: 'PT Puma Southeast Asia', supplier_type: 'DISTRIBUTOR', contact_person: 'Andi Wijaya', email: 'sea.orders@puma.com', phone: '+62215550103', address: 'Jl. Sudirman Kav. 52-53', city: 'Jakarta', tax_id: '01.456.789.0-093.000', is_active: true, payment_terms: 'NET_60' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-004', supplier_name: 'PT Under Armour Asia Pacific', supplier_type: 'DISTRIBUTOR', contact_person: 'Maya Putri', email: 'apac.supply@underarmour.com', phone: '+62215550104', address: 'SCBD Lot 14, Jl. Jend. Sudirman', city: 'Jakarta', tax_id: '01.567.890.1-094.000', is_active: true, payment_terms: 'NET_30' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-005', supplier_name: 'PT New Balance Indonesia', supplier_type: 'DISTRIBUTOR', contact_person: 'Rudi Hartono', email: 'id.supply@newbalance.com', phone: '+62215550105', address: 'Jl. Gajah Mada No. 88', city: 'Jakarta', tax_id: '01.678.901.2-095.000', is_active: true, payment_terms: 'NET_30' }, status: 'IN_REVIEW' },
      { payload: { supplier_code: 'SUP-006', supplier_name: 'PT Converse Indonesia', supplier_type: 'DISTRIBUTOR', contact_person: 'Yoga Pratama', email: 'indo@converse.com', phone: '+62215550106', address: 'Jl. Kemang Raya No. 15', city: 'Jakarta', tax_id: '01.789.012.3-096.000', is_active: true, payment_terms: 'NET_30' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-007', supplier_name: 'VF Corporation Asia', supplier_type: 'MANUFACTURER', contact_person: 'Hendra Wijaya', email: 'apac@vfc.com', phone: '+62215550107', address: 'Jl. HR Rasuna Said Kav. C-17', city: 'Jakarta', tax_id: '01.890.123.4-097.000', is_active: true, payment_terms: 'NET_60' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-008', supplier_name: 'PT Levi Strauss Indonesia', supplier_type: 'MANUFACTURER', contact_person: 'Dewi Anggraini', email: 'id@levi.com', phone: '+62215550108', address: 'Jl. Jend. Sudirman Kav. 32', city: 'Jakarta', tax_id: '01.901.234.5-098.000', is_active: true, payment_terms: 'NET_30' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-009', supplier_name: 'PT Starbucks Indonesia', supplier_type: 'DISTRIBUTOR', contact_person: 'Bambang Suryadi', email: 'supply@starbucks.co.id', phone: '+62215550109', address: 'Jl. Mega Kuningan Barat III', city: 'Jakarta', tax_id: '01.012.345.6-099.000', is_active: true, payment_terms: 'NET_30' }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { supplier_code: 'SUP-010', supplier_name: 'PT Inditex Indonesia', supplier_type: 'DISTRIBUTOR', contact_person: 'Maria Santos', email: 'id.supply@inditex.com', phone: '+62215550110', address: 'Jl. Gatot Subroto Kav. 36', city: 'Jakarta', tax_id: '01.123.456.7-100.000', is_active: true, payment_terms: 'NET_60' }, status: 'ACTIVE' },
      { payload: { supplier_code: 'SUP-011', supplier_name: 'PVH Asia Pacific', supplier_type: 'DISTRIBUTOR', contact_person: 'Tommy Lim', email: 'apac@pvh.com', phone: '+62215550111', address: 'Jl. Asia Afrika No. 8', city: 'Jakarta', tax_id: '01.234.567.8-101.000', is_active: true, payment_terms: 'NET_30' }, status: 'DRAFT' },
    ]);

    // ============================================================
    // PRICING_MASTER (15+ records)
    // ============================================================
    await createRecordsWithAudit('PRICING_MASTER', [
      { payload: { pricing_code: 'PRC-001', article_code: 'ART-001', price_type: 'REGULAR', price: 1799000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'FLAGSHIP', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-002', article_code: 'ART-001', price_type: 'COST', price: 1100000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'FLAGSHIP', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-003', article_code: 'ART-002', price_type: 'REGULAR', price: 3899000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'FLAGSHIP', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-004', article_code: 'ART-003', price_type: 'REGULAR', price: 1599000, currency: 'IDR', effective_date: '2024-02-01', expiry_date: '2025-01-31', store_type: 'STANDARD', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-005', article_code: 'ART-005', price_type: 'REGULAR', price: 3299000, currency: 'IDR', effective_date: '2024-01-15', expiry_date: '2024-12-31', store_type: 'FLAGSHIP', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-006', article_code: 'ART-006', price_type: 'REGULAR', price: 1099000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'STANDARD', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-007', article_code: 'ART-011', price_type: 'REGULAR', price: 799000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'STANDARD', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-008', article_code: 'ART-014', price_type: 'REGULAR', price: 1199000, currency: 'IDR', effective_date: '2024-03-01', expiry_date: '2025-02-28', store_type: 'STANDARD', region: 'EAST_JAVA', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-009', article_code: 'ART-015', price_type: 'REGULAR', price: 2999000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'FLAGSHIP', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-010', article_code: 'ART-019', price_type: 'REGULAR', price: 350000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'SPECIALTY', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-011', article_code: 'ART-001', price_type: 'PROMOTIONAL', price: 1439000, currency: 'IDR', effective_date: '2024-07-01', expiry_date: '2024-07-31', store_type: 'FLAGSHIP', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-012', article_code: 'ART-004', price_type: 'WHOLESALE', price: 950000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'OUTLET', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-013', article_code: 'ART-022', price_type: 'REGULAR', price: 1899000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'STANDARD', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-014', article_code: 'ART-016', price_type: 'REGULAR', price: 3199000, currency: 'IDR', effective_date: '2024-01-01', expiry_date: '2024-12-31', store_type: 'FLAGSHIP', region: 'JABODETABEK', is_active: true }, status: 'ACTIVE' },
      { payload: { pricing_code: 'PRC-015', article_code: 'ART-023', price_type: 'REGULAR', price: 2199000, currency: 'IDR', effective_date: '2024-04-01', expiry_date: '2025-03-31', store_type: 'STANDARD', region: 'JABODETABEK', is_active: true }, status: 'IN_REVIEW' },
    ]);

    // ============================================================
    // PROMOTION_MASTER (10+ promotions)
    // ============================================================
    await createRecordsWithAudit('PROMOTION_MASTER', [
      { payload: { promo_code: 'PROMO-001', promo_name: 'MAP Club Member Day 2024', promo_type: 'DISCOUNT', discount_type: 'PERCENTAGE', discount_value: 20, start_date: '2024-03-15', end_date: '2024-03-17', applicable_categories: 'FOOTWEAR,APPAREL,ACCESSORIES', min_purchase: 500000, max_discount: 500000, store_type: 'FLAGSHIP', is_active: true }, status: 'ACTIVE' },
      { payload: { promo_code: 'PROMO-002', promo_name: 'End of Season Sale Summer 2024', promo_type: 'DISCOUNT', discount_type: 'PERCENTAGE', discount_value: 30, start_date: '2024-06-01', end_date: '2024-07-31', applicable_categories: 'APPAREL,FOOTWEAR', min_purchase: 0, max_discount: 1000000, store_type: 'STANDARD', is_active: true }, status: 'ACTIVE' },
      { payload: { promo_code: 'PROMO-003', promo_name: 'Nike Running Week', promo_type: 'DISCOUNT', discount_type: 'PERCENTAGE', discount_value: 15, start_date: '2024-05-01', end_date: '2024-05-07', applicable_categories: 'RUNNING_SHOES', min_purchase: 1000000, max_discount: 300000, store_type: 'SPECIALTY', is_active: true }, status: 'ACTIVE' },
      { payload: { promo_code: 'PROMO-004', promo_name: 'Buy 1 Get 1 Socks', promo_type: 'BOGO', discount_type: 'BUY_X_GET_Y', discount_value: 100, start_date: '2024-04-01', end_date: '2024-04-30', applicable_categories: 'ACCESSORIES', min_purchase: 0, max_discount: 200000, store_type: 'STANDARD', is_active: true }, status: 'ACTIVE' },
      { payload: { promo_code: 'PROMO-005', promo_name: 'Jordan Brand Exclusive', promo_type: 'DISCOUNT', discount_type: 'FIXED_AMOUNT', discount_value: 200000, start_date: '2024-09-01', end_date: '2024-09-30', applicable_categories: 'BASKETBALL_SHOES', min_purchase: 2000000, max_discount: 200000, store_type: 'FLAGSHIP', is_active: true }, status: 'ACTIVE' },
      { payload: { promo_code: 'PROMO-006', promo_name: 'Year End Clearance 2024', promo_type: 'DISCOUNT', discount_type: 'PERCENTAGE', discount_value: 40, start_date: '2024-12-01', end_date: '2024-12-31', applicable_categories: 'APPAREL,FOOTWEAR,ACCESSORIES', min_purchase: 0, max_discount: 1500000, store_type: 'OUTLET', is_active: true }, status: 'DRAFT' },
      { payload: { promo_code: 'PROMO-007', promo_name: 'Back to School Bundle 2024', promo_type: 'BUNDLE', discount_type: 'PERCENTAGE', discount_value: 15, start_date: '2024-07-01', end_date: '2024-07-31', applicable_categories: 'FOOTWEAR,ACCESSORIES', min_purchase: 750000, max_discount: 200000, store_type: 'STANDARD', is_active: true }, status: 'IN_REVIEW' },
      { payload: { promo_code: 'PROMO-008', promo_name: 'Flash Sale 11.11', promo_type: 'FLASH_SALE', discount_type: 'PERCENTAGE', discount_value: 25, start_date: '2024-11-11', end_date: '2024-11-11', applicable_categories: 'FOOTWEAR,APPAREL', min_purchase: 1000000, max_discount: 750000, store_type: 'STANDARD', is_active: true }, status: 'ACTIVE' },
      { payload: { promo_code: 'PROMO-009', promo_name: 'Starbucks Loyalty Double Points', promo_type: 'LOYALTY', discount_type: 'PERCENTAGE', discount_value: 10, start_date: '2024-04-01', end_date: '2024-06-30', applicable_categories: 'FOOD_BEVERAGE', min_purchase: 100000, max_discount: 50000, store_type: 'SPECIALTY', is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { promo_code: 'PROMO-010', promo_name: 'Adidas Creator Club Exclusive', promo_type: 'DISCOUNT', discount_type: 'PERCENTAGE', discount_value: 20, start_date: '2024-08-01', end_date: '2024-08-31', applicable_categories: 'FOOTWEAR,APPAREL', min_purchase: 1500000, max_discount: 400000, store_type: 'FLAGSHIP', is_active: true }, status: 'ACTIVE' },
      { payload: { promo_code: 'PROMO-011', promo_name: 'Independence Day Sale 2024', promo_type: 'DISCOUNT', discount_type: 'PERCENTAGE', discount_value: 17, start_date: '2024-08-17', end_date: '2024-08-19', applicable_categories: 'FOOTWEAR,APPAREL,ACCESSORIES', min_purchase: 500000, max_discount: 500000, store_type: 'STANDARD', is_active: true }, status: 'ACTIVE' },
    ]);

    // ============================================================
    // INVENTORY_MASTER (20+ records)
    // ============================================================
    await createRecordsWithAudit('INVENTORY_MASTER', [
      { payload: { inventory_code: 'INV-001', article_code: 'ART-001', store_code: 'STR-001', quantity_on_hand: 45, quantity_reserved: 5, quantity_available: 40, reorder_point: 10, last_count_date: '2024-06-01', warehouse_location: 'A-01-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-002', article_code: 'ART-002', store_code: 'STR-002', quantity_on_hand: 12, quantity_reserved: 2, quantity_available: 10, reorder_point: 5, last_count_date: '2024-06-01', warehouse_location: 'A-02-03', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-003', article_code: 'ART-003', store_code: 'STR-001', quantity_on_hand: 30, quantity_reserved: 3, quantity_available: 27, reorder_point: 8, last_count_date: '2024-06-01', warehouse_location: 'A-01-02', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-004', article_code: 'ART-004', store_code: 'STR-003', quantity_on_hand: 55, quantity_reserved: 8, quantity_available: 47, reorder_point: 15, last_count_date: '2024-05-28', warehouse_location: 'B-01-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-005', article_code: 'ART-005', store_code: 'STR-005', quantity_on_hand: 8, quantity_reserved: 1, quantity_available: 7, reorder_point: 5, last_count_date: '2024-06-01', warehouse_location: 'C-02-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-006', article_code: 'ART-006', store_code: 'STR-004', quantity_on_hand: 22, quantity_reserved: 4, quantity_available: 18, reorder_point: 10, last_count_date: '2024-05-30', warehouse_location: 'A-03-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-007', article_code: 'ART-011', store_code: 'STR-001', quantity_on_hand: 60, quantity_reserved: 10, quantity_available: 50, reorder_point: 20, last_count_date: '2024-06-01', warehouse_location: 'B-02-02', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-008', article_code: 'ART-012', store_code: 'STR-010', quantity_on_hand: 35, quantity_reserved: 5, quantity_available: 30, reorder_point: 12, last_count_date: '2024-05-25', warehouse_location: 'A-01-03', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-009', article_code: 'ART-015', store_code: 'STR-001', quantity_on_hand: 5, quantity_reserved: 1, quantity_available: 4, reorder_point: 3, last_count_date: '2024-06-01', warehouse_location: 'C-01-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-010', article_code: 'ART-016', store_code: 'STR-002', quantity_on_hand: 7, quantity_reserved: 2, quantity_available: 5, reorder_point: 3, last_count_date: '2024-05-20', warehouse_location: 'D-01-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-011', article_code: 'ART-019', store_code: 'STR-007', quantity_on_hand: 100, quantity_reserved: 15, quantity_available: 85, reorder_point: 30, last_count_date: '2024-06-01', warehouse_location: 'E-01-01', is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { inventory_code: 'INV-012', article_code: 'ART-022', store_code: 'STR-011', quantity_on_hand: 25, quantity_reserved: 3, quantity_available: 22, reorder_point: 8, last_count_date: '2024-05-28', warehouse_location: 'A-02-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-013', article_code: 'ART-008', store_code: 'STR-004', quantity_on_hand: 18, quantity_reserved: 2, quantity_available: 16, reorder_point: 10, last_count_date: '2024-06-01', warehouse_location: 'A-04-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-014', article_code: 'ART-014', store_code: 'STR-014', quantity_on_hand: 15, quantity_reserved: 2, quantity_available: 13, reorder_point: 5, last_count_date: '2024-05-30', warehouse_location: 'B-01-02', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-015', article_code: 'ART-020', store_code: 'STR-001', quantity_on_hand: 80, quantity_reserved: 12, quantity_available: 68, reorder_point: 25, last_count_date: '2024-06-01', warehouse_location: 'B-03-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-016', article_code: 'ART-009', store_code: 'STR-018', quantity_on_hand: 20, quantity_reserved: 3, quantity_available: 17, reorder_point: 8, last_count_date: '2024-05-25', warehouse_location: 'A-01-04', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-017', article_code: 'ART-023', store_code: 'STR-005', quantity_on_hand: 3, quantity_reserved: 1, quantity_available: 2, reorder_point: 5, last_count_date: '2024-06-01', warehouse_location: 'C-03-01', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-018', article_code: 'ART-010', store_code: 'STR-010', quantity_on_hand: 28, quantity_reserved: 4, quantity_available: 24, reorder_point: 10, last_count_date: '2024-05-28', warehouse_location: 'A-02-02', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-019', article_code: 'ART-017', store_code: 'STR-008', quantity_on_hand: 40, quantity_reserved: 6, quantity_available: 34, reorder_point: 15, last_count_date: '2024-06-01', warehouse_location: 'B-01-03', is_active: true }, status: 'ACTIVE' },
      { payload: { inventory_code: 'INV-020', article_code: 'ART-024', store_code: 'STR-006', quantity_on_hand: 50, quantity_reserved: 8, quantity_available: 42, reorder_point: 20, last_count_date: '2024-05-30', warehouse_location: 'A-03-02', is_active: true }, status: 'IN_REVIEW' },
    ]);

    // ============================================================
    // EMPLOYEE_MASTER (15+ employees)
    // ============================================================
    await createRecordsWithAudit('EMPLOYEE_MASTER', [
      { payload: { employee_code: 'EMP-001', full_name: 'Rudi Hartono', email: 'rudi.hartono@map.co.id', phone: '+62811111111', department: 'STORE_OPS', position: 'Store Manager', store_code: 'STR-001', join_date: '2019-03-15', status: 'ACTIVE', is_active: true }, status: 'ACTIVE' },
      { payload: { employee_code: 'EMP-002', full_name: 'Siti Nurhaliza', email: 'siti.nurhaliza@map.co.id', phone: '+62822222222', department: 'MERCHANDISING', position: 'Senior Merchandiser', store_code: 'STR-002', join_date: '2020-06-01', status: 'ACTIVE', is_active: true }, status: 'ACTIVE' },
      { payload: { employee_code: 'EMP-003', full_name: 'Budi Santoso', email: 'budi.santoso@mapactive.co.id', phone: '+62833333333', department: 'STORE_OPS', position: 'Assistant Store Manager', store_code: 'STR-001', join_date: '2021-01-10', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { employee_code: 'EMP-004', full_name: 'Dewi Lestari', email: 'dewi.lestari@mapactive.co.id', phone: '+62844444444', department: 'SALES', position: 'Sales Lead', store_code: 'STR-004', join_date: '2021-08-20', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { employee_code: 'EMP-005', full_name: 'Ahmad Fauzi', email: 'ahmad.fauzi@mapboga.co.id', phone: '+62855555555', department: 'STORE_OPS', position: 'Shift Supervisor', store_code: 'STR-007', join_date: '2022-02-14', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { employee_code: 'EMP-006', full_name: 'Yoga Pratama', email: 'yoga.pratama@mapactive.co.id', phone: '+62866666666', department: 'STORE_OPS', position: 'Store Manager', store_code: 'STR-006', join_date: '2020-09-01', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { employee_code: 'EMP-007', full_name: 'Rina Marlina', email: 'rina.marlina@mapactive.co.id', phone: '+62877777777', department: 'MERCHANDISING', position: 'Visual Merchandiser', store_code: 'STR-005', join_date: '2022-04-05', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { employee_code: 'EMP-008', full_name: 'Putri Handayani', email: 'putri.handayani@map.co.id', phone: '+62888888888', department: 'HR', position: 'HR Business Partner', store_code: '', join_date: '2019-11-15', status: 'ACTIVE', is_active: true }, status: 'ACTIVE' },
      { payload: { employee_code: 'EMP-009', full_name: 'Fajar Nugroho', email: 'fajar.nugroho@mapactive.co.id', phone: '+62899999999', department: 'STORE_OPS', position: 'Sales Associate', store_code: 'STR-009', join_date: '2023-01-20', status: 'PROBATION', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { employee_code: 'EMP-010', full_name: 'Maya Indah', email: 'maya.indah@mapboga.co.id', phone: '+62810101010', department: 'STORE_OPS', position: 'Barista Lead', store_code: 'STR-020', join_date: '2021-07-01', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { employee_code: 'EMP-011', full_name: 'Hendra Wijaya', email: 'hendra.wijaya@mapactive.co.id', phone: '+62811111112', department: 'SALES', position: 'Regional Sales Manager', store_code: '', join_date: '2018-05-10', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { employee_code: 'EMP-012', full_name: 'Bambang Kusumo', email: 'bambang.kusumo@mapboga.co.id', phone: '+62812121212', department: 'OPERATIONS', position: 'Operations Manager', store_code: '', join_date: '2017-03-20', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
      { payload: { employee_code: 'EMP-013', full_name: 'Lina Susanti', email: 'lina.susanti@map.co.id', phone: '+62813131313', department: 'FINANCE', position: 'Finance Analyst', store_code: '', join_date: '2022-06-15', status: 'ACTIVE', is_active: true }, status: 'ACTIVE' },
      { payload: { employee_code: 'EMP-014', full_name: 'Dian Purnama', email: 'dian.purnama@mapactive.co.id', phone: '+62814141414', department: 'STORE_OPS', position: 'Store Manager', store_code: 'STR-016', join_date: '2020-11-01', status: 'ON_LEAVE', is_active: true }, status: 'ACTIVE', companyId: companyMAPA.id },
      { payload: { employee_code: 'EMP-015', full_name: 'Andi Saputra', email: 'andi.saputra@mapboga.co.id', phone: '+62815151515', department: 'SUPPLY_CHAIN', position: 'Supply Chain Coordinator', store_code: '', join_date: '2023-03-01', status: 'ACTIVE', is_active: true }, status: 'ACTIVE', companyId: companyMBA.id },
    ]);

    // ============================================================
    // BUDGET MODULE
    // ============================================================
    await createRecordsWithAudit('BUDGET', [
      { payload: { budget_code: 'BGT-2024-001', budget_name: 'Marketing Budget 2024', department: 'MARKETING', fiscal_year: '2024', amount: 500000000, spent_amount: 125000000, start_date: '2024-01-01', end_date: '2024-12-31', status: 'ACTIVE' }, status: 'ACTIVE' },
      { payload: { budget_code: 'BGT-2024-002', budget_name: 'IT Infrastructure 2024', department: 'IT', fiscal_year: '2024', amount: 1200000000, spent_amount: 450000000, start_date: '2024-01-01', end_date: '2024-12-31', status: 'ACTIVE' }, status: 'ACTIVE' },
      { payload: { budget_code: 'BGT-2024-003', budget_name: 'HR Development 2024', department: 'HR', fiscal_year: '2024', amount: 300000000, spent_amount: 180000000, start_date: '2024-01-01', end_date: '2024-12-31', status: 'ACTIVE' }, status: 'ACTIVE' },
      { payload: { budget_code: 'BGT-2024-004', budget_name: 'Operations Budget Q1', department: 'OPERATIONS', fiscal_year: '2024', amount: 750000000, spent_amount: 200000000, start_date: '2024-01-01', end_date: '2024-03-31', status: 'IN_REVIEW' }, status: 'IN_REVIEW' },
      { payload: { budget_code: 'BGT-2024-005', budget_name: 'Sales Promotion 2024', department: 'SALES', fiscal_year: '2024', amount: 250000000, spent_amount: 0, start_date: '2024-01-01', end_date: '2024-12-31', status: 'PLANNED' }, status: 'DRAFT' },
    ]);

    // ============================================================
    // ASSET MODULE
    // ============================================================
    await createRecordsWithAudit('ASSET', [
      { payload: { asset_code: 'AST-001', asset_name: 'Company Vehicle Toyota Innova', asset_type: 'VEHICLE', location: 'Jakarta HQ Parking', purchase_date: '2022-03-15', purchase_value: 350000000, current_value: 280000000, condition: 'GOOD' }, status: 'ACTIVE' },
      { payload: { asset_code: 'AST-002', asset_name: 'Server Room Equipment', asset_type: 'IT_EQUIPMENT', location: 'Jakarta HQ 5th Floor', purchase_date: '2023-01-10', purchase_value: 500000000, current_value: 400000000, condition: 'GOOD' }, status: 'ACTIVE' },
      { payload: { asset_code: 'AST-003', asset_name: 'Office Furniture 15th Floor', asset_type: 'FURNITURE', location: 'Jakarta HQ 15th Floor', purchase_date: '2021-06-20', purchase_value: 75000000, current_value: 50000000, condition: 'FAIR' }, status: 'DRAFT' },
      { payload: { asset_code: 'AST-004', asset_name: 'MacBook Pro Team', asset_type: 'IT_EQUIPMENT', location: 'Jakarta HQ Various', purchase_date: '2024-01-05', purchase_value: 120000000, current_value: 105000000, condition: 'NEW' }, status: 'IN_REVIEW' },
      { payload: { asset_code: 'AST-005', asset_name: 'Warehouse Building Cakung', asset_type: 'BUILDING', location: 'Cakung, East Jakarta', purchase_date: '2018-09-01', purchase_value: 5000000000, current_value: 5500000000, condition: 'GOOD' }, status: 'ACTIVE' },
    ]);

    // ============================================================
    // BUSINESS RULES (10+ rules)
    // ============================================================
    const existingRules = await db.businessRule.count();
    if (existingRules === 0 && modules.length > 0) {
      const articleModule = getModule('ARTICLE_MASTER');
      const pricingModule = getModule('PRICING_MASTER');
      const storeModule = getModule('STORE_MASTER');
      const supplierModule = getModule('SUPPLIER_MASTER');
      const customerModule = getModule('CUSTOMER_MASTER');
      const promotionModule = getModule('PROMOTION_MASTER');

      const rules = [
        {
          name: 'Article Name Required',
          description: 'Article name is mandatory for all product records.',
          ruleType: 'CONDITION', conditionType: 'CROSS_FIELD', conditionJson: jsonVal({ field: 'article_name', operator: 'IS_REQUIRED', when: { status: 'ACTIVE' } }),
          actionType: 'BLOCK', actionJson: undefined, errorMessage: 'Article name is required for active records.', severity: 'ERROR', trigger: 'SAVE', scope: 'RECORD',
          moduleId: articleModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 1,
        },
        {
          name: 'Article Code Uniqueness',
          description: 'Article codes must be unique across the entire catalog.',
          ruleType: 'CONDITION', conditionType: 'UNIQUENESS', conditionJson: jsonVal({ field: 'article_code', scope: 'module' }),
          actionType: 'BLOCK', actionJson: undefined, errorMessage: 'Article code must be unique.', severity: 'ERROR', trigger: 'IMPORT', scope: 'BULK',
          moduleId: articleModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 2,
        },
        {
          name: 'Selling Price Range Validation',
          description: 'Selling price must be between IDR 10,000 and IDR 100,000,000.',
          ruleType: 'CONDITION', conditionType: 'RANGE', conditionJson: jsonVal({ field: 'selling_price', min: 10000, max: 100000000 }),
          actionType: 'BLOCK', actionJson: undefined, errorMessage: 'Selling price must be between IDR 10,000 and IDR 100,000,000.', severity: 'ERROR', trigger: 'SAVE', scope: 'RECORD',
          moduleId: articleModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 3,
        },
        {
          name: 'Promotion End Date After Start Date',
          description: 'Promotion end date must be after start date.',
          ruleType: 'CONDITION', conditionType: 'CROSS_FIELD', conditionJson: jsonVal({ field1: 'end_date', operator: 'GREATER_THAN', field2: 'start_date' }),
          actionType: 'BLOCK', actionJson: undefined, errorMessage: 'End date must be after start date.', severity: 'ERROR', trigger: 'SAVE', scope: 'RECORD',
          moduleId: promotionModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 4,
        },
        {
          name: 'Article Completeness Check',
          description: 'Articles must have brand AND category to be approved.',
          ruleType: 'CONDITION', conditionType: 'COMPLETENESS', conditionJson: jsonVal({ requiredFields: ['article_name', 'article_code', 'brand', 'category'], when: { status: 'ACTIVE' } }),
          actionType: 'BLOCK', actionJson: undefined, errorMessage: 'Article must have name, code, brand, and category to be active.', severity: 'ERROR', trigger: 'APPROVE', scope: 'RECORD',
          moduleId: articleModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 5,
        },
        {
          name: 'Auto-Set Draft Status on Create',
          description: 'When a new article is created, automatically set status to DRAFT.',
          ruleType: 'ACTION', conditionType: 'CROSS_FIELD', conditionJson: jsonVal({ on: 'CREATE' }),
          actionType: 'SET_STATUS', actionJson: jsonVal({ status: 'DRAFT' }), errorMessage: 'Auto-set draft status on create', severity: 'INFO', trigger: 'SAVE', scope: 'RECORD',
          moduleId: articleModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 6,
        },
        {
          name: 'Email Format Validation',
          description: 'Email must follow standard format pattern.',
          ruleType: 'CONDITION', conditionType: 'PATTERN', conditionJson: jsonVal({ field: 'email', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' }),
          actionType: 'WARN', actionJson: undefined, errorMessage: 'Please enter a valid email address.', severity: 'WARNING', trigger: 'SAVE', scope: 'RECORD',
          moduleId: supplierModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 7,
        },
        {
          name: 'Price Must Be Positive',
          description: 'All pricing records must have a positive price value.',
          ruleType: 'CONDITION', conditionType: 'RANGE', conditionJson: jsonVal({ field: 'price', min: 0, max: null }),
          actionType: 'BLOCK', actionJson: undefined, errorMessage: 'Price must be greater than 0.', severity: 'ERROR', trigger: 'SAVE', scope: 'RECORD',
          moduleId: pricingModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 8,
        },
        {
          name: 'Store Phone Format',
          description: 'Store phone numbers must start with +62.',
          ruleType: 'CONDITION', conditionType: 'PATTERN', conditionJson: jsonVal({ field: 'phone', pattern: '^\\+62' }),
          actionType: 'WARN', actionJson: undefined, errorMessage: 'Phone number should start with +62 (Indonesia).', severity: 'WARNING', trigger: 'SAVE', scope: 'RECORD',
          moduleId: storeModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 9,
        },
        {
          name: 'Customer Loyalty Tier Points',
          description: 'Gold members must have at least 10,000 points.',
          ruleType: 'CONDITION', conditionType: 'CROSS_FIELD', conditionJson: jsonVal({ field1: 'membership_tier', operator: 'EQUALS', value1: 'GOLD', field2: 'total_points', operator2: 'GREATER_THAN_OR_EQUAL', value2: 10000 }),
          actionType: 'WARN', actionJson: undefined, errorMessage: 'Gold tier customers should have at least 10,000 points.', severity: 'WARNING', trigger: 'SAVE', scope: 'RECORD',
          moduleId: customerModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 10,
        },
        {
          name: 'Discount Value Positive',
          description: 'Discount value in promotions must be positive.',
          ruleType: 'CONDITION', conditionType: 'RANGE', conditionJson: jsonVal({ field: 'discount_value', min: 0 }),
          actionType: 'BLOCK', actionJson: undefined, errorMessage: 'Discount value must be positive.', severity: 'ERROR', trigger: 'SAVE', scope: 'RECORD',
          moduleId: promotionModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 11,
        },
        {
          name: 'Data Completeness Score Calculator',
          description: 'Calculate a completeness score (0-100) for each record based on filled vs total fields.',
          ruleType: 'FUNCTION', conditionType: 'COMPLETENESS', conditionJson: jsonVal({ formula: '(filled_fields / total_fields) * 100' }),
          actionType: 'SET_VALUE', actionJson: jsonVal({ targetField: 'completeness_score' }), errorMessage: undefined, severity: 'INFO', trigger: 'SAVE', scope: 'RECORD',
          moduleId: articleModule?.id || modules[0]?.id || '', isActive: true, sortOrder: 12,
        },
      ];

      let rulesCreated = 0;
      for (const rule of rules) {
        try {
          await db.businessRule.create({ data: rule as any });
          rulesCreated++;
        } catch (e) {
          console.error('[seed-data] Failed to create business rule:', rule.name, e);
        }
      }
      summary['BUSINESS_RULES'] = rulesCreated;
    }

    // ============================================================
    // DIGITAL ASSETS (15+ assets)
    // ============================================================
    const existingAssets = await db.digitalAsset.count();
    if (existingAssets === 0) {
      const digitalAssetsData = [
        { assetType: 'IMAGE', fileName: 'nike_air_max_90.jpg', originalFileName: 'nike_air_max_90_hero.jpg', filePath: 'https://placehold.co/800x800/f97316/white?text=Nike+Air+Max+90', fileSize: 245000, mimeType: 'image/jpeg', title: 'Nike Air Max 90 Hero', description: 'Product hero image for Nike Air Max 90', altText: 'Nike Air Max 90 - Orange colorway', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'nike', 'footwear']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPA.id },
        { assetType: 'IMAGE', fileName: 'jordan_1_retro.jpg', originalFileName: 'jordan_1_retro_high.jpg', filePath: 'https://placehold.co/800x800/dc2626/white?text=Jordan+1+Retro', fileSize: 198000, mimeType: 'image/jpeg', title: 'Jordan 1 Retro High OG', description: 'Product image for Air Jordan 1 Retro High OG', altText: 'Air Jordan 1 Retro High OG', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'jordan', 'basketball']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPA.id },
        { assetType: 'IMAGE', fileName: 'nike_dunk_low.jpg', originalFileName: 'nike_dunk_low_retro.jpg', filePath: 'https://placehold.co/800x800/16a34a/white?text=Nike+Dunk+Low', fileSize: 210000, mimeType: 'image/jpeg', title: 'Nike Dunk Low Retro', description: 'Product image for Nike Dunk Low Retro', altText: 'Nike Dunk Low Retro', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'nike', 'sneakers']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPA.id },
        { assetType: 'IMAGE', fileName: 'adidas_ultraboost.jpg', originalFileName: 'adidas_ultraboost_light.jpg', filePath: 'https://placehold.co/800x800/2563eb/white?text=Ultraboost+Light', fileSize: 220000, mimeType: 'image/jpeg', title: 'Adidas Ultraboost Light', description: 'Product image for Adidas Ultraboost Light', altText: 'Adidas Ultraboost Light', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'adidas', 'running']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPA.id },
        { assetType: 'IMAGE', fileName: 'puma_rsx.jpg', originalFileName: 'puma_rsx_reinvention.jpg', filePath: 'https://placehold.co/800x800/7c3aed/white?text=Puma+RS-X', fileSize: 185000, mimeType: 'image/jpeg', title: 'Puma RS-X Reinvention', description: 'Product image for Puma RS-X', altText: 'Puma RS-X Reinvention', category: 'Product', status: 'APPROVED', tags: jsonVal(['hero', 'puma', 'sneakers']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'converse_chuck_taylor.jpg', originalFileName: 'converse_chuck_taylor_high.jpg', filePath: 'https://placehold.co/800x800/1f2937/white?text=Converse+Chuck+70', fileSize: 175000, mimeType: 'image/jpeg', title: 'Converse Chuck 70 High', description: 'Product image for Converse Chuck Taylor', altText: 'Converse Chuck 70 High', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'converse', 'classic']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'vans_old_skool.jpg', originalFileName: 'vans_old_skool_classic.jpg', filePath: 'https://placehold.co/800x800/1e293b/white?text=Vans+Old+Skool', fileSize: 165000, mimeType: 'image/jpeg', title: 'Vans Old Skool', description: 'Product image for Vans Old Skool', altText: 'Vans Old Skool Classic', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'vans', 'skate']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'tnf_thermoball.jpg', originalFileName: 'tnf_thermoball_jacket.jpg', filePath: 'https://placehold.co/800x800/059669/white?text=TNF+ThermoBall', fileSize: 230000, mimeType: 'image/jpeg', title: 'The North Face ThermoBall Jacket', description: 'Product image for TNF ThermoBall Eco Jacket', altText: 'TNF ThermoBall Eco Jacket', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'tnf', 'outdoor', 'jacket']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'timberland_6inch.jpg', originalFileName: 'timberland_6inch_boot.jpg', filePath: 'https://placehold.co/800x800/92400e/white?text=Timberland+6+Inch', fileSize: 215000, mimeType: 'image/jpeg', title: 'Timberland 6-Inch Premium Boot', description: 'Product image for Timberland 6-Inch Boot', altText: 'Timberland 6-Inch Premium Boot', category: 'Product', status: 'APPROVED', tags: jsonVal(['hero', 'timberland', 'boots']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'starbucks_tumbler.jpg', originalFileName: 'starbucks_tumbler_matte.jpg', filePath: 'https://placehold.co/800x800/064e3b/white?text=Starbucks+Tumbler', fileSize: 145000, mimeType: 'image/jpeg', title: 'Starbucks Matte Black Tumbler', description: 'Product image for Starbucks tumbler', altText: 'Starbucks Matte Black Tumbler 473ml', category: 'Product', status: 'PUBLISHED', tags: jsonVal(['hero', 'starbucks', 'tumbler']), width: 800, height: 800, dpi: 72, colorSpace: 'sRGB', companyId: companyMBA.id },
        { assetType: 'IMAGE', fileName: 'nike_logo.png', originalFileName: 'nike_logo_official.png', filePath: 'https://placehold.co/400x200/111111/white?text=NIKE', fileSize: 52000, mimeType: 'image/png', title: 'Nike Logo', description: 'Official Nike swoosh logo', altText: 'Nike Logo', category: 'Brand', status: 'PUBLISHED', tags: jsonVal(['logo', 'brand', 'nike']), width: 400, height: 200, dpi: 150, colorSpace: 'sRGB', companyId: companyMAPA.id },
        { assetType: 'IMAGE', fileName: 'adidas_logo.png', originalFileName: 'adidas_logo_official.png', filePath: 'https://placehold.co/400x200/111111/white?text=ADIDAS', fileSize: 48000, mimeType: 'image/png', title: 'Adidas Logo', description: 'Official Adidas three stripes logo', altText: 'Adidas Logo', category: 'Brand', status: 'PUBLISHED', tags: jsonVal(['logo', 'brand', 'adidas']), width: 400, height: 200, dpi: 150, colorSpace: 'sRGB', companyId: companyMAPA.id },
        { assetType: 'IMAGE', fileName: 'puma_logo.png', originalFileName: 'puma_logo_official.png', filePath: 'https://placehold.co/400x200/111111/white?text=PUMA', fileSize: 45000, mimeType: 'image/png', title: 'Puma Logo', description: 'Official Puma leaping cat logo', altText: 'Puma Logo', category: 'Brand', status: 'APPROVED', tags: jsonVal(['logo', 'brand', 'puma']), width: 400, height: 200, dpi: 150, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'store_grand_indonesia.jpg', originalFileName: 'map_active_grand_indonesia.jpg', filePath: 'https://placehold.co/1920x1080/64748b/white?text=Grand+Indonesia+Store', fileSize: 380000, mimeType: 'image/jpeg', title: 'Grand Indonesia Store Front', description: 'Store front photo of MAP Active Grand Indonesia', altText: 'MAP Active Grand Indonesia Store', category: 'Store', status: 'PUBLISHED', tags: jsonVal(['store', 'flagship', 'jakarta']), width: 1920, height: 1080, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'store_pacific_place.jpg', originalFileName: 'map_active_pacific_place.jpg', filePath: 'https://placehold.co/1920x1080/64748b/white?text=Pacific+Place+Store', fileSize: 350000, mimeType: 'image/jpeg', title: 'Pacific Place Store Front', description: 'Store front photo of MAP Active Pacific Place', altText: 'MAP Active Pacific Place Store', category: 'Store', status: 'APPROVED', tags: jsonVal(['store', 'flagship', 'jakarta']), width: 1920, height: 1080, dpi: 72, colorSpace: 'sRGB', companyId: companyMAPI.id },
        { assetType: 'IMAGE', fileName: 'starbucks_beachwalk.jpg', originalFileName: 'starbucks_beachwalk_bali.jpg', filePath: 'https://placehold.co/1920x1080/064e3b/white?text=Starbucks+Beachwalk', fileSize: 320000, mimeType: 'image/jpeg', title: 'Starbucks Beachwalk Bali', description: 'Store photo of Starbucks Beachwalk Bali', altText: 'Starbucks Beachwalk Bali Store', category: 'Store', status: 'PUBLISHED', tags: jsonVal(['store', 'starbucks', 'bali']), width: 1920, height: 1080, dpi: 72, colorSpace: 'sRGB', companyId: companyMBA.id },
      ];

      for (const asset of digitalAssetsData) {
        try {
          await db.digitalAsset.create({ data: asset as any });
        } catch (e) {
          console.error('[seed-data] Failed to create digital asset:', asset.title, e);
        }
      }
      summary['DIGITAL_ASSETS'] = digitalAssetsData.length;
    }

    // ============================================================
    // STEWARDSHIP TASKS (sample tasks)
    // ============================================================
    const existingTasks = await db.stewardshipTask.count();
    if (existingTasks === 0) {
      const stewardUser = await db.sysUser.findFirst({ where: { username: { in: ['steward_mapi', 'datasteward'] } } }) || user;
      const articleMod = getModule('ARTICLE_MASTER');
      const storeMod = getModule('STORE_MASTER');

      if (articleMod || storeMod) {
        const tasks = [
          { moduleId: articleMod?.id || '', taskType: 'QUALITY_REVIEW', title: 'Review Article ART-025 Data Quality', description: 'Puma x AMI Suede XL is in DRAFT status — check completeness before approval', priority: 'HIGH', status: 'PENDING', assignedTo: stewardUser?.id, assignedBy: user.id, dueDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), context: jsonVal({ article_code: 'ART-025', reason: 'DRAFT record needs quality review' }) },
          { moduleId: articleMod?.id || '', taskType: 'DATA_ENRICHMENT', title: 'Add missing product images for ART-007', description: 'Adidas NMD R1 missing product images — upload hero and lifestyle shots', priority: 'NORMAL', status: 'IN_PROGRESS', assignedTo: stewardUser?.id, assignedBy: user.id, dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), context: jsonVal({ article_code: 'ART-007', missingFields: ['images'] }) },
          { moduleId: storeMod?.id || '', taskType: 'DATA_CORRECTION', title: 'Fix store phone format STR-008', description: 'Phone number for MAP Active Plaza Senayan may have incorrect format', priority: 'LOW', status: 'COMPLETED', assignedTo: stewardUser?.id, assignedBy: user.id, completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), resolution: 'Phone number format verified and corrected', context: jsonVal({ store_code: 'STR-008' }) },
          { moduleId: articleMod?.id || '', taskType: 'QUALITY_REVIEW', title: 'Validate pricing for ART-021 Adidas Tiro Jacket', description: 'Article in IN_REVIEW status — validate pricing data before approval', priority: 'NORMAL', status: 'PENDING', assignedTo: stewardUser?.id, assignedBy: user.id, dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), context: jsonVal({ article_code: 'ART-021', status: 'IN_REVIEW' }) },
          { moduleId: articleMod?.id || '', taskType: 'DATA_ENRICHMENT', title: 'Enrich brand data for ART-017 and ART-018', description: "Levi's 501 and Tommy Hilfiger Polo need sub_category assignment", priority: 'NORMAL', status: 'PENDING', assignedTo: stewardUser?.id, assignedBy: user.id, dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), context: jsonVal({ article_codes: ['ART-017', 'ART-018'], missingFields: ['sub_category'] }) },
        ].filter(t => t.moduleId);

        for (const task of tasks) {
          try {
            await db.stewardshipTask.create({ data: task as any });
          } catch (e) {
            console.error('[seed-data] Failed to create stewardship task:', task.title, e);
          }
        }
        summary['STEWARDSHIP_TASKS'] = tasks.length;
      }
    }

    // ============================================================
    // WORKFLOW TEMPLATES
    // ============================================================
    const existingTemplates = await db.workflowTemplate.count();
    if (existingTemplates === 0) {
      // Standard Product Approval Workflow
      const productTemplate = await db.workflowTemplate.create({
        data: {
          name: 'Product Approval Workflow', description: 'Standard workflow for product data approval',
          moduleScope: 'ARTICLE_MASTER', stepCount: 4,
          stepConfig: jsonVal({
            states: [
              { id: 'draft', name: 'Draft', type: 'DRAFT', color: '#6b7280' },
              { id: 'in_review', name: 'In Review', type: 'IN_REVIEW', color: '#f59e0b' },
              { id: 'approved', name: 'Approved', type: 'APPROVED', color: '#10b981' },
              { id: 'rejected', name: 'Rejected', type: 'REJECTED', color: '#ef4444' },
            ],
            transitions: [
              { from: 'draft', to: 'in_review', name: 'Submit for Review' },
              { from: 'in_review', to: 'approved', name: 'Approve' },
              { from: 'in_review', to: 'rejected', name: 'Reject' },
              { from: 'rejected', to: 'draft', name: 'Resubmit' },
            ],
          }),
          slaConfig: jsonVal({ defaultDeadlineHours: 48 }),
          isActive: true,
        },
      });

      const productStates = await Promise.all([
        db.workflowState.create({ data: { templateId: productTemplate.id, stateCode: 'DRAFT', stateName: 'Draft', stateType: 'DRAFT', color: '#6b7280', isInitial: true, isFinal: false, sortOrder: 0 } }),
        db.workflowState.create({ data: { templateId: productTemplate.id, stateCode: 'IN_REVIEW', stateName: 'In Review', stateType: 'IN_REVIEW', color: '#f59e0b', isInitial: false, isFinal: false, sortOrder: 1 } }),
        db.workflowState.create({ data: { templateId: productTemplate.id, stateCode: 'APPROVED', stateName: 'Approved', stateType: 'APPROVED', color: '#10b981', isInitial: false, isFinal: false, sortOrder: 2 } }),
        db.workflowState.create({ data: { templateId: productTemplate.id, stateCode: 'REJECTED', stateName: 'Rejected', stateType: 'REJECTED', color: '#ef4444', isInitial: false, isFinal: false, sortOrder: 3 } }),
      ]);

      const psMap = Object.fromEntries(productStates.map(s => [s.stateCode, s.id]));

      for (const t of [
        { fromStateCode: 'DRAFT', toStateCode: 'IN_REVIEW', transitionName: 'Submit for Review', requiredRole: 'Editor', isAuto: false, notifyRoles: ['Data Steward'], sortOrder: 0 },
        { fromStateCode: 'IN_REVIEW', toStateCode: 'APPROVED', transitionName: 'Approve', requiredRole: 'Administrator', isAuto: false, notifyRoles: ['Editor'], sortOrder: 1 },
        { fromStateCode: 'IN_REVIEW', toStateCode: 'REJECTED', transitionName: 'Reject', requiredRole: 'Administrator', isAuto: false, notifyRoles: ['Editor'], sortOrder: 2 },
        { fromStateCode: 'REJECTED', toStateCode: 'DRAFT', transitionName: 'Resubmit', requiredRole: 'Editor', isAuto: false, notifyRoles: ['Administrator'], sortOrder: 3 },
      ]) {
        await db.workflowTransition.create({
          data: {
            templateId: productTemplate.id, fromStateId: psMap[t.fromStateCode], toStateId: psMap[t.toStateCode],
            transitionName: t.transitionName, requiredRole: t.requiredRole, isAuto: t.isAuto,
            notifyRoles: t.notifyRoles ? jsonVal(t.notifyRoles) : null, sortOrder: t.sortOrder,
          },
        });
      }

      summary['WORKFLOW_TEMPLATES'] = 1;
    }

    // ============================================================
    // TENANT AI CONFIG (if not exists)
    // ============================================================
    const existingAiConfig = await db.tenantAiConfig.findFirst({ where: { companyId: companyMAPA.id } });
    if (!existingAiConfig) {
      try {
        await db.tenantAiConfig.create({
          data: {
            companyId: companyMAPA.id, provider: 'custom',
            apiKey: process.env.CUSTOM_AI_API_KEY || 'placeholder-replace-in-production',
            model: 'glm-5.1', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            temperature: 0.7, maxTokens: 4096, isActive: true,
          },
        });
        summary['TENANT_AI_CONFIG'] = 1;
      } catch (e) {
        console.error('[seed-data] Failed to create TenantAiConfig:', e);
      }
    }

    // ============================================================
    // APP SETTINGS (Global AI Config — if not exists)
    // ============================================================
    const existingProvider = await db.appSettings.findFirst({ where: { settingKey: 'AI_PROVIDER' } });
    if (!existingProvider) {
      try {
        await Promise.all([
          db.appSettings.create({ data: { settingKey: 'AI_PROVIDER', settingValue: 'gemini' } }),
          db.appSettings.create({ data: { settingKey: 'AI_API_KEY', settingValue: process.env.GEMINI_API_KEY || 'placeholder-replace-in-production' } }),
          db.appSettings.create({ data: { settingKey: 'AI_MODEL', settingValue: 'gemini-2.0-flash' } }),
        ]);
        summary['APP_SETTINGS'] = 3;
      } catch (e) {
        console.error('[seed-data] Failed to create AppSettings:', e);
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
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : String(error);
    return NextResponse.json(
      { error: 'Failed to seed sample data', details: message },
      { status: 500 }
    );
  }
}
