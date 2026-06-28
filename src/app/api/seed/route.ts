import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  try {
    // ── Authorization ────────────────────────────────────────────────────
    // This endpoint populates the database with seed data. To remain
    // compatible with the auto-seed-on-mount flow in /src/app/page.tsx
    // (which runs WITHOUT a logged-in user) we allow unauthenticated
    // access ONLY when the database is truly empty (first-run setup).
    // Once any user exists, only Super Admins may re-trigger seeding.
    const userCount = await db.sysUser.count();
    const isFirstRun = userCount === 0;

    if (!isFirstRun) {
      const tokenPayload = getTokenFromHeaders(request.headers);
      if (!tokenPayload) {
        console.warn('[seed] Blocked unauthenticated re-seed attempt.');
        return NextResponse.json(
          { error: 'Unauthorized. Database is already seeded — authentication required.' },
          { status: 401 }
        );
      }
      if (!isSuperAdmin(tokenPayload.roles)) {
        console.warn(`[seed] Blocked non-super-admin re-seed attempt by user "${tokenPayload.username}".`);
        return NextResponse.json(
          { error: 'Forbidden. Only Super Admins may re-seed the database.' },
          { status: 403 }
        );
      }
      console.info(`[seed] Authorized re-seed requested by Super Admin "${tokenPayload.username}".`);
    } else {
      console.info('[seed] First-run: allowing unauthenticated seed (database is empty).');
    }

    // If already seeded AND we got here (i.e. caller is Super Admin), bail
    // with a friendly message instead of duplicating data. The first-run
    // path falls through because userCount is 0.
    if (userCount > 0) {
      return NextResponse.json({ message: 'Database already seeded. Delete the db file and run db:push first to re-seed.' });
    }

    // ============================================================
    // 1. CREATE COMPANIES (MAPI Group)
    // ============================================================
    const companies = await Promise.all([
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPI',
          companyName: 'PT Mitra Adiperkasa Tbk',
          description: 'Parent company - Retail lifestyle conglomerate',
          industry: 'RETAIL',
          parentCode: null,
          website: 'https://www.map.co.id',
          phone: '+622129668888',
          email: 'info@map.co.id',
          address: 'Menara Mitra Adiperkasa, Jl. Jend. Sudirman Kav. 25-26, Jakarta 12920',
          onboardingStatus: 'ACTIVE',
          provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPA',
          companyName: 'PT MAP Aktif Adiperkasa Tbk',
          description: 'Sports & lifestyle retail division',
          industry: 'RETAIL',
          parentCode: 'MAPI',
          website: 'https://www.mapactive.co.id',
          phone: '+622129668801',
          email: 'info@mapactive.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 17, Jakarta 12920',
          onboardingStatus: 'ACTIVE',
          provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MBA',
          companyName: 'PT MAP Boga Adiperkasa Tbk',
          description: 'Food & Beverage retail division (Starbucks, Pizza Hut, etc.)',
          industry: 'F&B',
          parentCode: 'MAPI',
          website: 'https://www.mapboga.co.id',
          phone: '+622129668802',
          email: 'info@mapboga.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 18, Jakarta 12920',
          onboardingStatus: 'ACTIVE',
          provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPD',
          companyName: 'PT MAP Digital Adiperkasa',
          description: 'E-commerce and digital platform division',
          industry: 'DIGITAL',
          parentCode: 'MAPI',
          website: 'https://www.mapdigital.co.id',
          phone: '+622129668803',
          email: 'info@mapdigital.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 19, Jakarta 12920',
          onboardingStatus: 'ACTIVE',
          provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPP',
          companyName: 'PT MAP Properti Adiperkasa',
          description: 'Property and real estate management division',
          industry: 'PROPERTY',
          parentCode: 'MAPI',
          website: 'https://www.mapproperti.co.id',
          phone: '+622129668804',
          email: 'info@mapproperti.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 20, Jakarta 12920',
          onboardingStatus: 'ACTIVE',
          provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPL',
          companyName: 'PT MAP Logistics Adiperkasa',
          description: 'Logistics and supply chain management division',
          industry: 'LOGISTICS',
          parentCode: 'MAPI',
          website: 'https://www.maplogistics.co.id',
          phone: '+622129668805',
          email: 'info@maplogistics.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 21, Jakarta 12920',
          onboardingStatus: 'ACTIVE',
          provisionedAt: new Date(),
        },
      }),
    ]);

    const [companyMAPI, companyMAPA, companyMBA, companyMAPD, companyMAPP, companyMAPL] = companies;

    // ============================================================
    // 2. CREATE ROLES (Stibo role types with companyId scope)
    // ============================================================
    const roles = await Promise.all([
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Super Admin', description: 'Full access to all modules and administrative functions', roleType: 'SYSTEM_ADMIN', isGlobal: true, isSystem: true, scope: 'GLOBAL' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Administrator', description: 'Can read, create, edit, and approve records across modules', roleType: 'ADMINISTRATOR', scope: 'GLOBAL' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Editor', description: 'Can read, create, and edit records in assigned modules', roleType: 'EDITOR', scope: 'MODULE' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Viewer', description: 'Read-only access to assigned modules', roleType: 'VIEWER', scope: 'MODULE' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Data Steward', description: 'Can manage data quality, corrections, and knowledge base', roleType: 'DATA_STEWARD', scope: 'MODULE' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'API Manager', description: 'Can manage API keys and integration configurations', roleType: 'API', scope: 'MODULE' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'SFTP Manager', description: 'Can manage SFTP configurations and sync schedules', roleType: 'SFTP', scope: 'MODULE' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Approver', description: 'Can review and approve data management tasks', roleType: 'APPROVER', scope: 'MODULE' } }),
      db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Company Admin', description: 'Company-level administrator for tenant management', roleType: 'COMPANY_ADMIN', scope: 'GLOBAL' } }),
    ]);

    const [roleSuperAdmin, roleAdministrator, roleEditor, roleViewer, roleDataSteward, roleApiManager, roleSftpManager, roleApprover, roleCompanyAdmin] = roles;

    // ============================================================
    // 3. CREATE USERS
    // ============================================================
    const passwords = await Promise.all([
      hashPassword('Admin@123'),
      hashPassword('Administrator@123'),
      hashPassword('Editor@123'),
      hashPassword('Administrator@123'),
      hashPassword('Editor@123'),
      hashPassword('DataSteward@123'),
      hashPassword('ApiManager@123'),
      hashPassword('SftpManager@123'),
      hashPassword('Approver@123'),
      hashPassword('Viewer@123'),
    ]);

    const [
      pwSuperAdmin, pwAdminMAPI, pwEditorMAPI, pwAdminMAPA,
      pwEditorMBA, pwDataSteward, pwApiManager, pwSftpManager, pwApprover, pwViewer,
    ] = passwords;

    const users = await Promise.all([
      db.sysUser.create({
        data: {
          username: 'superadmin', email: 'superadmin@map.co.id', passwordHash: pwSuperAdmin,
          displayName: 'Super Admin', companyId: companyMAPI.id,
          userRoles: { create: { roleId: roleSuperAdmin.id, companyId: companyMAPI.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'admin_mapi', email: 'admin.mapi@map.co.id', passwordHash: pwAdminMAPI,
          displayName: 'MAPI Administrator', companyId: companyMAPI.id,
          userRoles: { create: { roleId: roleAdministrator.id, companyId: companyMAPI.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'editor_mapi', email: 'editor.mapi@map.co.id', passwordHash: pwEditorMAPI,
          displayName: 'MAPI Editor', companyId: companyMAPI.id,
          userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPI.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'admin_mapa', email: 'admin.mapa@mapactive.co.id', passwordHash: pwAdminMAPA,
          displayName: 'MAPA Administrator', companyId: companyMAPA.id,
          userRoles: { create: { roleId: roleAdministrator.id, companyId: companyMAPA.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'editor_mba', email: 'editor.mba@mapboga.co.id', passwordHash: pwEditorMBA,
          displayName: 'MBA Editor', companyId: companyMBA.id,
          userRoles: { create: { roleId: roleEditor.id, companyId: companyMBA.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'datasteward', email: 'datasteward@map.co.id', passwordHash: pwDataSteward,
          displayName: 'Data Steward', companyId: companyMAPI.id,
          userRoles: { create: { roleId: roleDataSteward.id, companyId: companyMAPI.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'api_manager', email: 'api.manager@map.co.id', passwordHash: pwApiManager,
          displayName: 'API Manager', companyId: companyMAPI.id,
          userRoles: { create: { roleId: roleApiManager.id, companyId: companyMAPI.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'sftp_manager', email: 'sftp.manager@maplogistics.co.id', passwordHash: pwSftpManager,
          displayName: 'SFTP Manager', companyId: companyMAPL.id,
          userRoles: { create: { roleId: roleSftpManager.id, companyId: companyMAPL.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'approver', email: 'approver@map.co.id', passwordHash: pwApprover,
          displayName: 'Approver', companyId: companyMAPI.id,
          userRoles: { create: { roleId: roleApprover.id, companyId: companyMAPI.id } },
        },
      }),
      db.sysUser.create({
        data: {
          username: 'viewer', email: 'viewer@map.co.id', passwordHash: pwViewer,
          displayName: 'Viewer', companyId: companyMAPI.id,
          userRoles: { create: { roleId: roleViewer.id, companyId: companyMAPI.id } },
        },
      }),
    ]);

    const [userSuperAdmin, userAdminMAPI, userEditorMAPI, userAdminMAPA, userEditorMBA, userDataSteward, userApiManager, userSftpManager, userApprover, userViewer] = users;

    // ============================================================
    // 4. CREATE MODULES (7 existing)
    // ============================================================
    const modules = await Promise.all([
      db.metaModule.create({
        data: {
          moduleCode: 'ARTICLE_MASTER', moduleName: 'Article Master', moduleIcon: 'Package',
          description: 'Manage article/product master data including SKU, descriptions, and categories',
          requireApproval: true, sortOrder: 1,
        },
      }),
      db.metaModule.create({
        data: {
          moduleCode: 'BUDGET', moduleName: 'Budget', moduleIcon: 'DollarSign',
          description: 'Budget planning and tracking with approval workflow',
          requireApproval: true, sortOrder: 2,
        },
      }),
      db.metaModule.create({
        data: {
          moduleCode: 'ASSET', moduleName: 'Asset', moduleIcon: 'Building2',
          description: 'Asset management and tracking across the organization',
          requireApproval: true, sortOrder: 3,
        },
      }),
      db.metaModule.create({
        data: {
          moduleCode: 'STORE_MASTER', moduleName: 'Store Master', moduleIcon: 'Store',
          description: 'Store location master data management',
          requireApproval: false, sortOrder: 4,
        },
      }),
      db.metaModule.create({
        data: {
          moduleCode: 'SUPPLIER_MASTER', moduleName: 'Supplier Master', moduleIcon: 'Truck',
          description: 'Manage supplier master data including contacts, types, and payment terms',
          requireApproval: true, sortOrder: 5,
        },
      }),
      db.metaModule.create({
        data: {
          moduleCode: 'PRICING_MASTER', moduleName: 'Pricing Master', moduleIcon: 'Tag',
          description: 'Manage pricing data including regular, promotional, cost, and wholesale prices',
          requireApproval: true, sortOrder: 6,
        },
      }),
      db.metaModule.create({
        data: {
          moduleCode: 'PROMOTION_MASTER', moduleName: 'Promotion Master', moduleIcon: 'Gift',
          description: 'Manage promotional campaigns including discounts, BOGO, bundles, and flash sales',
          requireApproval: true, sortOrder: 7,
        },
      }),
    ]);

    const [moduleArticle, moduleBudget, moduleAsset, moduleStore, moduleSupplier, modulePricing, modulePromotion] = modules;

    // ============================================================
    // 5. CREATE FIELDS FOR EACH MODULE (with IMAGE fields added)
    // ============================================================

    // Article Master Fields (12 fields — added cascading sub_category + MULTISELECT tags)
    // sub_category now uses cascadesFromFieldCode='category' so its options are
    // filtered by the chosen category (e.g. Sepatu → Sepatu Running/Sneakers/Sekolah).
    const articleFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'article_code', fieldName: 'Article Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. ART-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'article_name', fieldName: 'Article Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Product name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'category', fieldName: 'Category', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select category', sortOrder: 3, description: 'Pilih kategori utama. Sub Category akan menyesuaikan pilihan.' } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'sub_category', fieldName: 'Sub Category', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select sub-category', sortOrder: 4, cascadesFromFieldCode: 'category', description: 'Pilihan sub-kategori tergantung pada Category yang dipilih.' } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'brand', fieldName: 'Brand', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Brand name', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'uom', fieldName: 'Unit of Measure', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'e.g. PCS, KG, LTR', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'purchase_price', fieldName: 'Purchase Price', dataType: 'NUMBER', isRequired: false, isUnique: false, placeholder: '0.00', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'selling_price', fieldName: 'Selling Price', dataType: 'NUMBER', isRequired: false, isUnique: false, placeholder: '0.00', sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'tags', fieldName: 'Tags', dataType: 'MULTISELECT', isRequired: false, isUnique: false, placeholder: 'Pick tags', sortOrder: 9, description: 'Multi-value list field (New Arrival, Best Seller, etc.)' } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'description', fieldName: 'Description', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Article description', sortOrder: 10 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 11 } }),
      db.metaField.create({ data: { moduleId: moduleArticle.id, fieldCode: 'images', fieldName: 'Product Images', dataType: 'IMAGE', isRequired: false, isUnique: false, placeholder: 'Upload product images', sortOrder: 12 } }),
    ]);

    // Budget Fields
    const budgetFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'budget_code', fieldName: 'Budget Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. BGT-2024-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'budget_name', fieldName: 'Budget Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Budget name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'department', fieldName: 'Department', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select department', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'fiscal_year', fieldName: 'Fiscal Year', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'e.g. 2024', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'amount', fieldName: 'Amount', dataType: 'NUMBER', isRequired: true, isUnique: false, placeholder: '0.00', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'spent_amount', fieldName: 'Spent Amount', dataType: 'NUMBER', isRequired: false, isUnique: false, defaultValue: '0', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'start_date', fieldName: 'Start Date', dataType: 'DATE', isRequired: true, isUnique: false, sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'end_date', fieldName: 'End Date', dataType: 'DATE', isRequired: true, isUnique: false, sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleBudget.id, fieldCode: 'status', fieldName: 'Budget Status', dataType: 'SELECT', isRequired: false, isUnique: false, defaultValue: 'PLANNED', sortOrder: 9 } }),
    ]);

    // Asset Fields
    const assetFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'asset_code', fieldName: 'Asset Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. AST-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'asset_name', fieldName: 'Asset Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Asset name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'asset_type', fieldName: 'Asset Type', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select type', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'location', fieldName: 'Location', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Physical location', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'purchase_date', fieldName: 'Purchase Date', dataType: 'DATE', isRequired: true, isUnique: false, sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'purchase_value', fieldName: 'Purchase Value', dataType: 'NUMBER', isRequired: true, isUnique: false, placeholder: '0.00', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'current_value', fieldName: 'Current Value', dataType: 'NUMBER', isRequired: false, isUnique: false, placeholder: '0.00', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleAsset.id, fieldCode: 'condition', fieldName: 'Condition', dataType: 'SELECT', isRequired: false, isUnique: false, defaultValue: 'GOOD', sortOrder: 8 } }),
    ]);

    // Store Master Fields (10 fields - added store_photos)
    const storeFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'store_code', fieldName: 'Store Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. STR-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'store_name', fieldName: 'Store Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Store name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'region', fieldName: 'Region', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select region', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'city', fieldName: 'City', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'City', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'address', fieldName: 'Address', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Full address', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'phone', fieldName: 'Phone', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: '+62...', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'store_type', fieldName: 'Store Type', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select type', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'opening_date', fieldName: 'Opening Date', dataType: 'DATE', isRequired: false, isUnique: false, sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'store_photos', fieldName: 'Store Photos', dataType: 'IMAGE', isRequired: false, isUnique: false, placeholder: 'Upload store photos', sortOrder: 10 } }),
    ]);

    // Supplier Master Fields
    const supplierFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'supplier_code', fieldName: 'Supplier Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. SUP-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'supplier_name', fieldName: 'Supplier Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Supplier name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'supplier_type', fieldName: 'Supplier Type', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select supplier type', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'contact_person', fieldName: 'Contact Person', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Contact person name', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'email', fieldName: 'Email', dataType: 'EMAIL', isRequired: false, isUnique: false, placeholder: 'supplier@example.com', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'phone', fieldName: 'Phone', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: '+62...', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'address', fieldName: 'Address', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Full address', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'city', fieldName: 'City', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'City', sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'tax_id', fieldName: 'Tax ID', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'NPWP number', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 10 } }),
      db.metaField.create({ data: { moduleId: moduleSupplier.id, fieldCode: 'payment_terms', fieldName: 'Payment Terms', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select payment terms', sortOrder: 11 } }),
    ]);

    // Pricing Master Fields
    const pricingFields = await Promise.all([
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'pricing_code', fieldName: 'Pricing Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. PRC-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'article_code', fieldName: 'Article Code', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'e.g. ART-001', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'price_type', fieldName: 'Price Type', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select price type', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'price', fieldName: 'Price', dataType: 'NUMBER', isRequired: true, isUnique: false, placeholder: '0.00', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'currency', fieldName: 'Currency', dataType: 'TEXT', isRequired: false, isUnique: false, defaultValue: 'IDR', placeholder: 'e.g. IDR', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'effective_date', fieldName: 'Effective Date', dataType: 'DATE', isRequired: true, isUnique: false, sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'expiry_date', fieldName: 'Expiry Date', dataType: 'DATE', isRequired: false, isUnique: false, sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'store_type', fieldName: 'Store Type', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select store type', sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'region', fieldName: 'Region', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select region', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: modulePricing.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 10 } }),
    ]);

    // Promotion Master Fields
    const promotionFields = await Promise.all([
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'promo_code', fieldName: 'Promo Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. PROMO-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'promo_name', fieldName: 'Promo Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Promotion name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'promo_type', fieldName: 'Promo Type', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select promo type', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'discount_type', fieldName: 'Discount Type', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select discount type', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'discount_value', fieldName: 'Discount Value', dataType: 'NUMBER', isRequired: true, isUnique: false, placeholder: '0.00', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'start_date', fieldName: 'Start Date', dataType: 'DATE', isRequired: true, isUnique: false, sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'end_date', fieldName: 'End Date', dataType: 'DATE', isRequired: true, isUnique: false, sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'applicable_categories', fieldName: 'Applicable Categories', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'e.g. FOOD,ELECTRONICS', sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'min_purchase', fieldName: 'Min Purchase', dataType: 'NUMBER', isRequired: false, isUnique: false, defaultValue: '0', placeholder: '0.00', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'max_discount', fieldName: 'Max Discount', dataType: 'NUMBER', isRequired: false, isUnique: false, placeholder: '0.00', sortOrder: 10 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'store_type', fieldName: 'Store Type', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select store type', sortOrder: 11 } }),
      db.metaField.create({ data: { moduleId: modulePromotion.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 12 } }),
    ]);

    // ============================================================
    // 6. CREATE FIELD VALIDATIONS
    // ============================================================
    await Promise.all([
      // Article Code validations
      db.fieldValidation.create({ data: { fieldId: articleFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Article code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: articleFields[0].id, ruleType: 'MIN_LENGTH', ruleValue: '3', errorMessage: 'Article code must be at least 3 characters' } }),
      db.fieldValidation.create({ data: { fieldId: articleFields[0].id, ruleType: 'MAX_LENGTH', ruleValue: '20', errorMessage: 'Article code must be at most 20 characters' } }),
      db.fieldValidation.create({ data: { fieldId: articleFields[1].id, ruleType: 'MIN_LENGTH', ruleValue: '2', errorMessage: 'Article name must be at least 2 characters' } }),
      db.fieldValidation.create({ data: { fieldId: articleFields[1].id, ruleType: 'MAX_LENGTH', ruleValue: '200', errorMessage: 'Article name must be at most 200 characters' } }),
      db.fieldValidation.create({ data: { fieldId: articleFields[6].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Purchase price cannot be negative' } }),
      db.fieldValidation.create({ data: { fieldId: articleFields[7].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Selling price cannot be negative' } }),
      // Budget Code validation
      db.fieldValidation.create({ data: { fieldId: budgetFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Budget code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: budgetFields[4].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Budget amount cannot be negative' } }),
      // Asset Code validation
      db.fieldValidation.create({ data: { fieldId: assetFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Asset code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: assetFields[5].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Purchase value cannot be negative' } }),
      // Store Code validation
      db.fieldValidation.create({ data: { fieldId: storeFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Store code must contain only uppercase letters, numbers, and hyphens' } }),
      // Supplier Code validations
      db.fieldValidation.create({ data: { fieldId: supplierFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Supplier code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: supplierFields[0].id, ruleType: 'MIN_LENGTH', ruleValue: '3', errorMessage: 'Supplier code must be at least 3 characters' } }),
      db.fieldValidation.create({ data: { fieldId: supplierFields[0].id, ruleType: 'MAX_LENGTH', ruleValue: '20', errorMessage: 'Supplier code must be at most 20 characters' } }),
      db.fieldValidation.create({ data: { fieldId: supplierFields[1].id, ruleType: 'MIN_LENGTH', ruleValue: '2', errorMessage: 'Supplier name must be at least 2 characters' } }),
      db.fieldValidation.create({ data: { fieldId: supplierFields[1].id, ruleType: 'MAX_LENGTH', ruleValue: '200', errorMessage: 'Supplier name must be at most 200 characters' } }),
      // Pricing Code validations
      db.fieldValidation.create({ data: { fieldId: pricingFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Pricing code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: pricingFields[0].id, ruleType: 'MIN_LENGTH', ruleValue: '3', errorMessage: 'Pricing code must be at least 3 characters' } }),
      db.fieldValidation.create({ data: { fieldId: pricingFields[0].id, ruleType: 'MAX_LENGTH', ruleValue: '20', errorMessage: 'Pricing code must be at most 20 characters' } }),
      db.fieldValidation.create({ data: { fieldId: pricingFields[3].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Price cannot be negative' } }),
      // Promo Code validations
      db.fieldValidation.create({ data: { fieldId: promotionFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Promo code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: promotionFields[0].id, ruleType: 'MIN_LENGTH', ruleValue: '3', errorMessage: 'Promo code must be at least 3 characters' } }),
      db.fieldValidation.create({ data: { fieldId: promotionFields[0].id, ruleType: 'MAX_LENGTH', ruleValue: '20', errorMessage: 'Promo code must be at most 20 characters' } }),
      db.fieldValidation.create({ data: { fieldId: promotionFields[4].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Discount value cannot be negative' } }),
    ]);

    // ============================================================
    // 7. CREATE LOOKUP DATA
    // ============================================================
    await Promise.all([
      db.lookupMaster.create({
        data: {
          lookupCode: 'UOM', lookupName: 'Unit of Measure', description: 'Standard units of measure',
          values: { create: [
            { valueCode: 'PCS', displayValue: 'Pieces', sortOrder: 0 },
            { valueCode: 'KG', displayValue: 'Kilograms', sortOrder: 1 },
            { valueCode: 'LTR', displayValue: 'Liters', sortOrder: 2 },
            { valueCode: 'MTR', displayValue: 'Meters', sortOrder: 3 },
            { valueCode: 'BOX', displayValue: 'Box', sortOrder: 4 },
            { valueCode: 'PACK', displayValue: 'Pack', sortOrder: 5 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'CATEGORY', lookupName: 'Article Category', description: 'mapclub.com product categories (MAP Active Adiperkasa)',
          values: { create: [
            { valueCode: 'FOOTWEAR', displayValue: 'Footwear', sortOrder: 0 },
            { valueCode: 'APPAREL', displayValue: 'Apparel', sortOrder: 1 },
            { valueCode: 'ACCESSORIES', displayValue: 'Accessories', sortOrder: 2 },
            { valueCode: 'SPORTS_EQUIPMENT', displayValue: 'Sports Equipment', sortOrder: 3 },
            { valueCode: 'OUTDOOR', displayValue: 'Outdoor', sortOrder: 4 },
          ] },
        },
      }),
      // Sub-category lookup with parentValueCode → cascading dropdowns.
      // Each child value points back to a CATEGORY value via parentValueCode,
      // so the form filters sub_category options based on the chosen category.
      db.lookupMaster.create({
        data: {
          lookupCode: 'SUB_CATEGORY', lookupName: 'Article Sub Category', description: 'Sub-category with cascading relation to Category (mapclub.com taxonomy)',
          values: { create: [
            // FOOTWEAR children (6)
            { valueCode: 'RUNNING_SHOES', displayValue: 'Running Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 0 },
            { valueCode: 'BASKETBALL_SHOES', displayValue: 'Basketball Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 1 },
            { valueCode: 'CASUAL_SNEAKERS', displayValue: 'Casual Sneakers', parentValueCode: 'FOOTWEAR', sortOrder: 2 },
            { valueCode: 'SANDALS', displayValue: 'Sandals', parentValueCode: 'FOOTWEAR', sortOrder: 3 },
            { valueCode: 'FORMAL_SHOES', displayValue: 'Formal Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 4 },
            { valueCode: 'TRAINING_SHOES', displayValue: 'Training Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 5 },
            // APPAREL children (6)
            { valueCode: 'T_SHIRTS', displayValue: 'T-Shirts', parentValueCode: 'APPAREL', sortOrder: 6 },
            { valueCode: 'HOODIES', displayValue: 'Hoodies', parentValueCode: 'APPAREL', sortOrder: 7 },
            { valueCode: 'JACKETS', displayValue: 'Jackets', parentValueCode: 'APPAREL', sortOrder: 8 },
            { valueCode: 'PANTS', displayValue: 'Pants', parentValueCode: 'APPAREL', sortOrder: 9 },
            { valueCode: 'SHORTS', displayValue: 'Shorts', parentValueCode: 'APPAREL', sortOrder: 10 },
            { valueCode: 'COMPRESSION_WEAR', displayValue: 'Compression Wear', parentValueCode: 'APPAREL', sortOrder: 11 },
            // ACCESSORIES children (6)
            { valueCode: 'BAGS', displayValue: 'Bags', parentValueCode: 'ACCESSORIES', sortOrder: 12 },
            { valueCode: 'HATS', displayValue: 'Hats', parentValueCode: 'ACCESSORIES', sortOrder: 13 },
            { valueCode: 'SOCKS', displayValue: 'Socks', parentValueCode: 'ACCESSORIES', sortOrder: 14 },
            { valueCode: 'WATCHES', displayValue: 'Watches', parentValueCode: 'ACCESSORIES', sortOrder: 15 },
            { valueCode: 'SUNGLASSES', displayValue: 'Sunglasses', parentValueCode: 'ACCESSORIES', sortOrder: 16 },
            { valueCode: 'BELTS', displayValue: 'Belts', parentValueCode: 'ACCESSORIES', sortOrder: 17 },
            // SPORTS_EQUIPMENT children (6)
            { valueCode: 'BASKETBALL', displayValue: 'Basketball', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 18 },
            { valueCode: 'FOOTBALL', displayValue: 'Football', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 19 },
            { valueCode: 'TENNIS', displayValue: 'Tennis', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 20 },
            { valueCode: 'SWIMMING', displayValue: 'Swimming', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 21 },
            { valueCode: 'YOGA', displayValue: 'Yoga', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 22 },
            { valueCode: 'GYM_EQUIPMENT', displayValue: 'Gym Equipment', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 23 },
            // OUTDOOR children (4)
            { valueCode: 'CAMPING', displayValue: 'Camping', parentValueCode: 'OUTDOOR', sortOrder: 24 },
            { valueCode: 'HIKING', displayValue: 'Hiking', parentValueCode: 'OUTDOOR', sortOrder: 25 },
            { valueCode: 'CYCLING', displayValue: 'Cycling', parentValueCode: 'OUTDOOR', sortOrder: 26 },
            { valueCode: 'RUNNING_GEAR', displayValue: 'Running Gear', parentValueCode: 'OUTDOOR', sortOrder: 27 },
          ] },
        },
      }),
      // MULTISELECT source for the Article tags field
      db.lookupMaster.create({
        data: {
          lookupCode: 'ARTICLE_TAGS', lookupName: 'Article Tags', description: 'Multi-select tag list for articles (New Arrival, Best Seller, etc.)',
          values: { create: [
            { valueCode: 'NEW_ARRIVAL', displayValue: 'New Arrival', sortOrder: 0 },
            { valueCode: 'BEST_SELLER', displayValue: 'Best Seller', sortOrder: 1 },
            { valueCode: 'SALE', displayValue: 'Sale', sortOrder: 2 },
            { valueCode: 'FEATURED', displayValue: 'Featured', sortOrder: 3 },
            { valueCode: 'LIMITED', displayValue: 'Limited Edition', sortOrder: 4 },
            { valueCode: 'EXCLUSIVE', displayValue: 'Exclusive', sortOrder: 5 },
            { valueCode: 'PREMIUM', displayValue: 'Premium', sortOrder: 6 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'DEPARTMENT', lookupName: 'Department', description: 'Company departments',
          values: { create: [
            { valueCode: 'FINANCE', displayValue: 'Finance', sortOrder: 0 },
            { valueCode: 'MARKETING', displayValue: 'Marketing', sortOrder: 1 },
            { valueCode: 'OPERATIONS', displayValue: 'Operations', sortOrder: 2 },
            { valueCode: 'HR', displayValue: 'Human Resources', sortOrder: 3 },
            { valueCode: 'IT', displayValue: 'IT', sortOrder: 4 },
            { valueCode: 'SALES', displayValue: 'Sales', sortOrder: 5 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'ASSET_TYPE', lookupName: 'Asset Type', description: 'Types of assets',
          values: { create: [
            { valueCode: 'VEHICLE', displayValue: 'Vehicle', sortOrder: 0 },
            { valueCode: 'EQUIPMENT', displayValue: 'Equipment', sortOrder: 1 },
            { valueCode: 'FURNITURE', displayValue: 'Furniture', sortOrder: 2 },
            { valueCode: 'IT_EQUIPMENT', displayValue: 'IT Equipment', sortOrder: 3 },
            { valueCode: 'BUILDING', displayValue: 'Building', sortOrder: 4 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'ASSET_CONDITION', lookupName: 'Asset Condition', description: 'Condition of assets',
          values: { create: [
            { valueCode: 'NEW', displayValue: 'New', sortOrder: 0 },
            { valueCode: 'GOOD', displayValue: 'Good', sortOrder: 1 },
            { valueCode: 'FAIR', displayValue: 'Fair', sortOrder: 2 },
            { valueCode: 'POOR', displayValue: 'Poor', sortOrder: 3 },
            { valueCode: 'DISPOSED', displayValue: 'Disposed', sortOrder: 4 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'REGION', lookupName: 'Region', description: 'Geographic regions',
          values: { create: [
            { valueCode: 'JABODETABEK', displayValue: 'Jabodetabek', sortOrder: 0 },
            { valueCode: 'WEST_JAVA', displayValue: 'West Java', sortOrder: 1 },
            { valueCode: 'CENTRAL_JAVA', displayValue: 'Central Java', sortOrder: 2 },
            { valueCode: 'EAST_JAVA', displayValue: 'East Java', sortOrder: 3 },
            { valueCode: 'SUMATRA', displayValue: 'Sumatra', sortOrder: 4 },
            { valueCode: 'KALIMANTAN', displayValue: 'Kalimantan', sortOrder: 5 },
            { valueCode: 'SULAWESI', displayValue: 'Sulawesi', sortOrder: 6 },
            { valueCode: 'BALI_NT', displayValue: 'Bali & Nusa Tenggara', sortOrder: 7 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'STORE_TYPE', lookupName: 'Store Type', description: 'Types of retail stores',
          values: { create: [
            { valueCode: 'HYPERMARKET', displayValue: 'Hypermarket', sortOrder: 0 },
            { valueCode: 'SUPERMARKET', displayValue: 'Supermarket', sortOrder: 1 },
            { valueCode: 'MINIMARKET', displayValue: 'Minimarket', sortOrder: 2 },
            { valueCode: 'CONVENIENCE', displayValue: 'Convenience Store', sortOrder: 3 },
            { valueCode: 'SPECIALTY', displayValue: 'Specialty Store', sortOrder: 4 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'BUDGET_STATUS', lookupName: 'Budget Status', description: 'Status of budget items',
          values: { create: [
            { valueCode: 'PLANNED', displayValue: 'Planned', sortOrder: 0 },
            { valueCode: 'APPROVED', displayValue: 'Approved', sortOrder: 1 },
            { valueCode: 'ACTIVE', displayValue: 'Active', sortOrder: 2 },
            { valueCode: 'CLOSED', displayValue: 'Closed', sortOrder: 3 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'SUPPLIER_TYPE', lookupName: 'Supplier Type', description: 'Types of suppliers',
          values: { create: [
            { valueCode: 'MANUFACTURER', displayValue: 'Manufacturer', sortOrder: 0 },
            { valueCode: 'DISTRIBUTOR', displayValue: 'Distributor', sortOrder: 1 },
            { valueCode: 'WHOLESALER', displayValue: 'Wholesaler', sortOrder: 2 },
            { valueCode: 'LOCAL', displayValue: 'Local', sortOrder: 3 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'PAYMENT_TERMS', lookupName: 'Payment Terms', description: 'Payment terms for suppliers',
          values: { create: [
            { valueCode: 'NET_30', displayValue: 'Net 30', sortOrder: 0 },
            { valueCode: 'NET_60', displayValue: 'Net 60', sortOrder: 1 },
            { valueCode: 'NET_90', displayValue: 'Net 90', sortOrder: 2 },
            { valueCode: 'COD', displayValue: 'Cash on Delivery', sortOrder: 3 },
            { valueCode: 'CBD', displayValue: 'Cash Before Delivery', sortOrder: 4 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'PRICE_TYPE', lookupName: 'Price Type', description: 'Types of pricing',
          values: { create: [
            { valueCode: 'REGULAR', displayValue: 'Regular', sortOrder: 0 },
            { valueCode: 'PROMOTIONAL', displayValue: 'Promotional', sortOrder: 1 },
            { valueCode: 'COST', displayValue: 'Cost', sortOrder: 2 },
            { valueCode: 'WHOLESALE', displayValue: 'Wholesale', sortOrder: 3 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'PROMO_TYPE', lookupName: 'Promo Type', description: 'Types of promotions',
          values: { create: [
            { valueCode: 'DISCOUNT', displayValue: 'Discount', sortOrder: 0 },
            { valueCode: 'BOGO', displayValue: 'Buy One Get One', sortOrder: 1 },
            { valueCode: 'BUNDLE', displayValue: 'Bundle', sortOrder: 2 },
            { valueCode: 'FLASH_SALE', displayValue: 'Flash Sale', sortOrder: 3 },
            { valueCode: 'LOYALTY', displayValue: 'Loyalty', sortOrder: 4 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'DISCOUNT_TYPE', lookupName: 'Discount Type', description: 'Types of discounts',
          values: { create: [
            { valueCode: 'PERCENTAGE', displayValue: 'Percentage (%)', sortOrder: 0 },
            { valueCode: 'FIXED_AMOUNT', displayValue: 'Fixed Amount', sortOrder: 1 },
            { valueCode: 'BUY_X_GET_Y', displayValue: 'Buy X Get Y', sortOrder: 2 },
          ] },
        },
      }),
    ]);

    // ============================================================
    // 8. CREATE ROLE PERMISSIONS (Stibo granular permissions with companyId)
    // ============================================================

    // Super Admin - All permissions for all modules (global)
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleSuperAdmin.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true,
        canExport: true, canImport: true, canBulkUpdate: true,
      })),
    });

    // Administrator - Can read, create, edit, approve (no delete)
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleAdministrator.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true,
        canExport: true, canImport: true, canBulkUpdate: false,
      })),
    });

    // Editor - Can read, create, edit (no delete, no approve)
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleEditor.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false,
        canExport: false, canImport: false, canBulkUpdate: false,
      })),
    });

    // Viewer - Can only read (Stibo VIEWER — strictly read-only)
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleViewer.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false,
        canExport: false, canImport: false, canBulkUpdate: false,
      })),
    });

    // Data Steward - Read + edit for data quality/corrections
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleDataSteward.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false,
        canExport: true, canImport: false, canBulkUpdate: true,
      })),
    });

    // API Manager - Read access to all modules
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleApiManager.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false,
        canExport: true, canImport: true, canBulkUpdate: false,
      })),
    });

    // SFTP Manager - Read access to all modules
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleSftpManager.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false,
        canExport: true, canImport: true, canBulkUpdate: false,
      })),
    });

    // Approver - Read + approve across modules
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleApprover.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: false, canEdit: false, canDelete: false, canApprove: true,
        canExport: false, canImport: false, canBulkUpdate: false,
      })),
    });

    // Company Admin - Read, create, edit, approve for company scope (no delete)
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleCompanyAdmin.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true,
        canExport: true, canImport: true, canBulkUpdate: true,
      })),
    });

    // ============================================================
    // 8b. LINK SELECT FIELDS TO LOOKUP MASTERS
    // ============================================================

    // Get all lookup masters by code
    const lookupMasters = await db.lookupMaster.findMany();
    const lookupByCode: Record<string, string> = {};
    for (const lm of lookupMasters) {
      lookupByCode[lm.lookupCode] = lm.id;
    }

    // Link SELECT/LOOKUP fields to their lookup masters
    const fieldLookupUpdates: Array<{ fieldCode: string; lookupCode: string }> = [
      // Article Master
      { fieldCode: 'category', lookupCode: 'CATEGORY' },
      { fieldCode: 'sub_category', lookupCode: 'SUB_CATEGORY' }, // cascading child of category
      { fieldCode: 'uom', lookupCode: 'UOM' },
      { fieldCode: 'tags', lookupCode: 'ARTICLE_TAGS' }, // MULTISELECT source
      // Budget
      { fieldCode: 'department', lookupCode: 'DEPARTMENT' },
      { fieldCode: 'status', lookupCode: 'BUDGET_STATUS' },
      // Asset
      { fieldCode: 'asset_type', lookupCode: 'ASSET_TYPE' },
      { fieldCode: 'condition', lookupCode: 'ASSET_CONDITION' },
      // Store Master
      { fieldCode: 'region', lookupCode: 'REGION' },
      { fieldCode: 'store_type', lookupCode: 'STORE_TYPE' },
      // Supplier Master
      { fieldCode: 'supplier_type', lookupCode: 'SUPPLIER_TYPE' },
      { fieldCode: 'payment_terms', lookupCode: 'PAYMENT_TERMS' },
      // Pricing Master
      { fieldCode: 'price_type', lookupCode: 'PRICE_TYPE' },
      { fieldCode: 'store_type', lookupCode: 'STORE_TYPE' }, // Shared with Store Master
      { fieldCode: 'region', lookupCode: 'REGION' },
      // Promotion Master
      { fieldCode: 'promo_type', lookupCode: 'PROMO_TYPE' },
      { fieldCode: 'discount_type', lookupCode: 'DISCOUNT_TYPE' },
      { fieldCode: 'store_type', lookupCode: 'STORE_TYPE' },
    ];

    for (const { fieldCode, lookupCode } of fieldLookupUpdates) {
      const lookupId = lookupByCode[lookupCode];
      if (!lookupId) {
        console.warn(`Lookup ${lookupCode} not found, skipping field ${fieldCode}`);
        continue;
      }
      // Update ALL fields with this fieldCode (may be shared across modules)
      await db.metaField.updateMany({
        where: { fieldCode },
        data: { lookupId },
      });
    }

    // ============================================================
    // 9. CREATE SAMPLE HIERARCHY
    // ============================================================
    const hierarchy = await db.hierarchyModel.create({
      data: {
        moduleId: moduleArticle.id,
        hierarchyName: 'Article Hierarchy',
        description: 'Product categorization hierarchy for articles',
      },
    });

    const nodeFood = await db.hierarchyNode.create({
      data: { hierarchyId: hierarchy.id, nodeLabel: 'Food & Beverage', materializedPath: '', depthLevel: 0, sortOrder: 0 },
    });
    const nodeElectronics = await db.hierarchyNode.create({
      data: { hierarchyId: hierarchy.id, nodeLabel: 'Electronics', materializedPath: '', depthLevel: 0, sortOrder: 1 },
    });
    const nodeClothing = await db.hierarchyNode.create({
      data: { hierarchyId: hierarchy.id, nodeLabel: 'Clothing & Apparel', materializedPath: '', depthLevel: 0, sortOrder: 2 },
    });

    await db.hierarchyNode.createMany({
      data: [
        { hierarchyId: hierarchy.id, parentNodeId: nodeFood.id, nodeLabel: 'Snacks', materializedPath: nodeFood.id, depthLevel: 1, sortOrder: 0 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeFood.id, nodeLabel: 'Beverages', materializedPath: nodeFood.id, depthLevel: 1, sortOrder: 1 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeFood.id, nodeLabel: 'Dairy', materializedPath: nodeFood.id, depthLevel: 1, sortOrder: 2 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeElectronics.id, nodeLabel: 'Mobile Phones', materializedPath: nodeElectronics.id, depthLevel: 1, sortOrder: 0 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeElectronics.id, nodeLabel: 'Laptops', materializedPath: nodeElectronics.id, depthLevel: 1, sortOrder: 1 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeElectronics.id, nodeLabel: 'Accessories', materializedPath: nodeElectronics.id, depthLevel: 1, sortOrder: 2 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeClothing.id, nodeLabel: 'Men', materializedPath: nodeClothing.id, depthLevel: 1, sortOrder: 0 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeClothing.id, nodeLabel: 'Women', materializedPath: nodeClothing.id, depthLevel: 1, sortOrder: 1 },
        { hierarchyId: hierarchy.id, parentNodeId: nodeClothing.id, nodeLabel: 'Kids', materializedPath: nodeClothing.id, depthLevel: 1, sortOrder: 2 },
      ],
    });

    // ============================================================
    // 10. CREATE SAMPLE DATA RECORDS
    // ============================================================

    // ARTICLE_MASTER records in MAPI company — Indonesian retail catalog with
    // cascading category/sub_category pairs (Sepatu→Running, Tas→Ransel, etc.)
    // and MULTISELECT tags stored as comma-separated valueCodes.
    const articleRecords = await Promise.all([
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-001', article_name: 'Nike Air Zoom Pegasus 40', category: 'SEPATU', sub_category: 'SEPATU_RUNNING', brand: 'Nike', uom: 'PCS', purchase_price: 1200000, selling_price: 1899000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Air Zoom Pegasus 40 — sepatu lari ringan dengan respons cushioning terbaik', is_active: true }),
          createdById: userSuperAdmin.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-002', article_name: 'Aerostreet Sneakers Classic', category: 'SEPATU', sub_category: 'SEPATU_SNEAKERS', brand: 'Aerostreet', uom: 'PCS', purchase_price: 180000, selling_price: 325000, tags: 'BEST_SELLER', description: 'Sneakers lokal aerostreet model klasik, nyaman untuk harian', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userEditorMAPI.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-003', article_name: 'Adidas Adiform Command School', category: 'SEPATU', sub_category: 'SEPATU_SEKOLAH', brand: 'Adidas', uom: 'PCS', purchase_price: 450000, selling_price: 799000, tags: 'FEATURED', description: 'Sepatu sekolah Adidas hitam putih, material kulit sintetis premium', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-004', article_name: 'Eiger Ransel Adventure 30L', category: 'TAS', sub_category: 'TAS_RANSEL', brand: 'Eiger', uom: 'PCS', purchase_price: 350000, selling_price: 599000, tags: 'BEST_SELLER,PREMIUM', description: 'Tas ransel Eiger 30L waterproof untuk outdoor & travel', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-005', article_name: 'Consina Briefcase Kerja', category: 'TAS', sub_category: 'TAS_KERJA', brand: 'Consina', uom: 'PCS', purchase_price: 425000, selling_price: 750000, tags: 'PREMIUM', description: 'Tas kerja briefcase Consina kulit PU, muat laptop 15 inch', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userAdminMAPI.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-006', article_name: 'Uniqlo Dry EZ Pria Kaos', category: 'PAKAIAN', sub_category: 'PAKAIAN_PRIA', brand: 'Uniqlo', uom: 'PCS', purchase_price: 79000, selling_price: 149000, tags: 'NEW_ARRIVAL', description: 'Kaos Uniqlo Dry EZ pria, material kering cepat & anti kusut', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-007', article_name: 'Casio G-Shock GA-2100', category: 'AKSESORIS', sub_category: 'AKS_JAM_TANGAN', brand: 'Casio', uom: 'PCS', purchase_price: 1450000, selling_price: 2199000, tags: 'EXCLUSIVE,PREMIUM', description: 'Jam tangan Casio G-Shock GA-2100 "Casioak" resin carbon core', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'DRAFT',
          currentPayload: JSON.stringify({ article_code: 'ART-008', article_name: 'Komachi Sandal Jepang Slide', category: 'SEPATU', sub_category: 'SEPATU_SANDAL', brand: 'Komachi', uom: 'PCS', purchase_price: 35000, selling_price: 79000, tags: 'SALE', description: 'Sandal jepang slide Komachi empuk, anti slip', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userEditorMAPI.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'IN_REVIEW',
          currentPayload: JSON.stringify({ article_code: 'ART-009', article_name: 'Timbuk2 Messenger Tas Tangan', category: 'TAS', sub_category: 'TAS_TANGAN', brand: 'Timbuk2', uom: 'PCS', purchase_price: 650000, selling_price: 1199000, tags: 'LIMITED,FEATURED', description: 'Tas tangan messenger Timbuk2 edisi terbatas, waterproof liner', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userAdminMAPI.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleArticle.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ article_code: 'ART-010', article_name: 'Dr. Martens 1460 Boot', category: 'SEPATU', sub_category: 'SEPATU_BOOT', brand: 'Dr. Martens', uom: 'PCS', purchase_price: 1850000, selling_price: 2899000, tags: 'PREMIUM,EXCLUSIVE', description: 'Dr. Martens 1460 boot 8-eye klasik, kulit premium Made In England', is_active: true }),
          createdById: userEditorMAPI.id, updatedById: userSuperAdmin.id,
        },
      }),
    ]);

    // STORE_MASTER records
    const storeRecords = await Promise.all([
      db.dataRecord.create({
        data: {
          moduleId: moduleStore.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ store_code: 'STR-001', store_name: 'MAP Grand Indonesia', region: 'JABODETABEK', city: 'Jakarta', address: 'Grand Indonesia Mall Lt.1, Jl. MH Thamrin No.1', phone: '+62212555789', store_type: 'HYPERMARKET', is_active: true }),
          createdById: userSuperAdmin.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleStore.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ store_code: 'STR-002', store_name: 'MAP Pondok Indah Mall', region: 'JABODETABEK', city: 'Jakarta', address: 'Pondok Indah Mall, Jl. Metro Pondok Indah', phone: '+62212789012', store_type: 'SUPERMARKET', is_active: true }),
          createdById: userSuperAdmin.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleStore.id, companyId: companyMAPI.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ store_code: 'STR-003', store_name: 'MAP Surabaya Tunjungan', region: 'EAST_JAVA', city: 'Surabaya', address: 'Tunjungan Plaza, Jl. Tunjungan No. 65-71', phone: '+62315678901', store_type: 'HYPERMARKET', is_active: true }),
          createdById: userSuperAdmin.id, updatedById: userSuperAdmin.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleStore.id, companyId: companyMBA.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ store_code: 'STR-004', store_name: 'Starbucks Pacific Place', region: 'JABODETABEK', city: 'Jakarta', address: 'Pacific Place Mall Lt.G, Jl. SCBD', phone: '+62212555432', store_type: 'SPECIALTY', is_active: true }),
          createdById: userEditorMBA.id, updatedById: userEditorMBA.id,
        },
      }),
      db.dataRecord.create({
        data: {
          moduleId: moduleStore.id, companyId: companyMAPA.id, status: 'ACTIVE',
          currentPayload: JSON.stringify({ store_code: 'STR-005', store_name: 'Sports Arena Senayan', region: 'JABODETABEK', city: 'Jakarta', address: 'Senayan City Mall Lt.3, Jl. Asia Afrika', phone: '+62215789012', store_type: 'SPECIALTY', is_active: true }),
          createdById: userAdminMAPA.id, updatedById: userAdminMAPA.id,
        },
      }),
    ]);

    // Create version snapshots for ALL records (with rich version history)
    for (const record of [...articleRecords, ...storeRecords]) {
      // Version 1: initial creation
      await db.dataVersion.create({
        data: {
          recordId: record.id,
          payloadSnapshot: record.currentPayload,
          versionNumber: 1,
          changedById: record.createdById,
          changeReason: 'Initial creation',
          status: 'DRAFT',
        },
      });
    }

    // Add version 2 (update) for first 5 article records
    for (let i = 0; i < Math.min(5, articleRecords.length); i++) {
      const rec = articleRecords[i];
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(rec.currentPayload); } catch { /* */ }

      // Modify selling price to simulate an update
      const updatedPayload = { ...payload, selling_price: Number(payload.selling_price || 0) * 1.05, tags: (payload.tags || '') + ',UPDATED' };
      await db.dataVersion.create({
        data: {
          recordId: rec.id,
          payloadSnapshot: JSON.stringify(updatedPayload),
          versionNumber: 2,
          changedById: userAdminMAPI.id,
          changeReason: 'Price adjustment — 5% increase applied',
          status: rec.status,
        },
      });
    }

    // Add version 3 (status transition to ACTIVE) for first 3 article records
    for (let i = 0; i < Math.min(3, articleRecords.length); i++) {
      const rec = articleRecords[i];
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(rec.currentPayload); } catch { /* */ }
      const activatedPayload = { ...payload, is_active: true };

      await db.dataVersion.create({
        data: {
          recordId: rec.id,
          payloadSnapshot: JSON.stringify(activatedPayload),
          versionNumber: 3,
          changedById: userSuperAdmin.id,
          changeReason: 'Approved and activated after review',
          status: 'ACTIVE',
        },
      });
    }

    // Add version 2 for store records (address update)
    for (const rec of storeRecords) {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(rec.currentPayload); } catch { /* */ }
      const updatedPayload = { ...payload, phone: String(payload.phone || '').replace('+62', '+62-21') };

      await db.dataVersion.create({
        data: {
          recordId: rec.id,
          payloadSnapshot: JSON.stringify(updatedPayload),
          versionNumber: 2,
          changedById: userSuperAdmin.id,
          changeReason: 'Phone number format update',
          status: 'ACTIVE',
        },
      });
    }

    // Create approval tickets with diverse statuses for workflow statistics
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // PENDING ticket for IN_REVIEW article
    await db.approvalTicket.create({
      data: {
        recordId: articleRecords[4].id,
        requestedById: userEditorMAPI.id,
        status: 'PENDING',
        deltaPayload: articleRecords[4].currentPayload,
      },
    });

    // APPROVED tickets (for last 7 days — spread across different days)
    for (let i = 0; i < 5; i++) {
      const recIdx = i % articleRecords.length;
      const daysAgo = i + 1;
      const createdAt = new Date(now.getTime() - daysAgo * dayMs - 4 * 3600000);
      const reviewedAt = new Date(createdAt.getTime() + 4 * 3600000); // 4h later

      await db.approvalTicket.create({
        data: {
          recordId: articleRecords[recIdx].id,
          requestedById: userEditorMAPI.id,
          reviewedById: userAdminMAPI.id,
          status: 'APPROVED',
          deltaPayload: articleRecords[recIdx].currentPayload,
          reviewNotes: 'Looks good. Approved.',
          createdAt,
          reviewedAt,
        },
      });
    }

    // REJECTED tickets (for last 7 days)
    const rejectionReasons = [
      'Incomplete data — missing brand field',
      'Price too low — below cost threshold',
      'Duplicate record — already exists as ART-003',
    ];
    for (let i = 0; i < 3; i++) {
      const recIdx = (i + 2) % articleRecords.length;
      const daysAgo = i + 2;
      const createdAt = new Date(now.getTime() - daysAgo * dayMs - 2 * 3600000);
      const reviewedAt = new Date(createdAt.getTime() + 2 * 3600000);

      await db.approvalTicket.create({
        data: {
          recordId: articleRecords[recIdx].id,
          requestedById: userEditorMAPI.id,
          reviewedById: userSuperAdmin.id,
          status: 'REJECTED',
          deltaPayload: articleRecords[recIdx].currentPayload,
          reviewNotes: rejectionReasons[i],
          createdAt,
          reviewedAt,
        },
      });
    }

    // More APPROVED tickets from earlier (older than 7 days)
    for (let i = 0; i < 4; i++) {
      const recIdx = (i + 3) % articleRecords.length;
      const daysAgo = 10 + i;
      const createdAt = new Date(now.getTime() - daysAgo * dayMs - 6 * 3600000);
      const reviewedAt = new Date(createdAt.getTime() + 6 * 3600000);

      await db.approvalTicket.create({
        data: {
          recordId: articleRecords[recIdx].id,
          requestedById: userEditorMAPI.id,
          reviewedById: userAdminMAPI.id,
          status: 'APPROVED',
          deltaPayload: articleRecords[recIdx].currentPayload,
          reviewNotes: 'Verified and approved.',
          createdAt,
          reviewedAt,
        },
      });
    }

    // ============================================================
    // 11. CREATE DOCUMENTATION SEED DATA
    // ============================================================
    await Promise.all([
      db.documentation.create({
        data: {
          title: 'Getting Started with MAA BTOOL',
          slug: 'getting-started',
          content: `# Getting Started with MAA BTOOL\n\nWelcome to MAA BTOOL Enterprise Master Data Management system. This guide will help you get started with the platform.\n\n## Prerequisites\n- Valid user account with assigned role\n- Access to the MAPI network\n\n## First Steps\n1. **Login** - Use your credentials to access the system\n2. **Explore Modules** - Navigate to the Modules page to see available data modules\n3. **Browse Records** - Select a module to view existing master data records\n4. **Create Records** - Use the Create button to add new master data entries\n\n## User Roles\n- **Super Admin**: Full access to all features\n- **Administrator**: Read, create, edit, and approve records\n- **Editor**: Create and edit records\n- **Viewer**: Read-only access\n- **Data Steward**: Manage data quality and documentation\n- **API Manager**: Manage API keys\n- **SFTP Manager**: Manage SFTP configurations\n- **Approver**: Review and approve records\n\n## Need Help?\nContact your system administrator or check the FAQ section.`,
          category: 'GETTING_STARTED',
          tags: 'getting-started,onboarding,welcome',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 142,
          sortOrder: 1,
        },
      }),
      db.documentation.create({
        data: {
          title: 'How to Create Master Data',
          slug: 'how-to-create-master-data',
          content: `# How to Create Master Data\n\nThis guide walks you through creating new master data records in MAA BTOOL.\n\n## Step 1: Select a Module\nNavigate to **Data Records** and select the module you want to create data for (e.g., Article Master, Store Master).\n\n## Step 2: Click Create\nClick the **Create** button to open the record form.\n\n## Step 3: Fill in Required Fields\nFields marked with a red asterisk (*) are required. Fill in all mandatory information:\n- **Article Code**: Unique identifier (e.g., ART-001)\n- **Article Name**: Descriptive name\n- **Category**: Select from dropdown\n- **UOM**: Unit of Measure\n\n## Step 4: Submit\nClick **Save as Draft** or **Submit for Review** depending on your workflow.\n\n## Validation Rules\n- Article codes must follow the pattern: uppercase letters, numbers, and hyphens\n- Prices cannot be negative\n- Required fields must be filled before submission\n\n## Approval Workflow\nIf the module requires approval, your record will start in DRAFT status and need to be reviewed by an Administrator or Super Admin.`,
          category: 'HOW_TO',
          tags: 'create,data,records,tutorial',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 89,
          sortOrder: 2,
        },
      }),
      db.documentation.create({
        data: {
          title: 'API Integration Guide',
          slug: 'api-integration-guide',
          content: `# API Integration Guide\n\nMAA BTOOL provides a RESTful API for integrating with external systems.\n\n## Authentication\nAll API requests require a Bearer token in the Authorization header:\n\n\`\`\`\nAuthorization: Bearer <your-jwt-token>\n\`\`\`\n\n## API Key Management\n1. Navigate to **API Keys** section\n2. Create a new API key with appropriate permissions\n3. Use the key in your integration code\n\n## Available Endpoints\n\n### Modules\n- \`GET /api/modules\` - List all modules\n- \`GET /api/fields?moduleId=xxx\` - Get module fields\n\n### Records\n- \`GET /api/records?moduleId=xxx\` - List records\n- \`POST /api/records\` - Create record\n- \`PUT /api/records?action=update\` - Update record\n- \`PUT /api/records?action=transition\` - Change record status\n\n### Bulk Operations\n- \`POST /api/bulk?action=import\` - Import data\n- \`GET /api/bulk?action=export\` - Export data\n\n## Rate Limiting\n- Production keys: 1000 requests/minute\n- Testing keys: 100 requests/minute\n\n## Error Codes\n- \`401\` - Unauthorized (invalid or missing token)\n- \`403\` - Forbidden (insufficient permissions)\n- \`422\` - Validation error\n- \`500\` - Server error`,
          category: 'API_DOCS',
          tags: 'api,integration,rest,authentication',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 67,
          sortOrder: 3,
        },
      }),
      db.documentation.create({
        data: {
          title: 'SFTP Setup Tutorial',
          slug: 'sftp-setup-tutorial',
          content: `# SFTP Setup Tutorial\n\nLearn how to configure SFTP connections for automated data synchronization.\n\n## Prerequisites\n- SFTP server credentials (host, port, username, password/key)\n- Appropriate network access\n- SFTP Manager role assigned\n\n## Setting Up an SFTP Connection\n\n1. Navigate to **SFTP Configuration** section\n2. Click **Add New Configuration**\n3. Fill in the connection details:\n   - **Config Name**: A descriptive name (e.g., "MAPI ERP Sync")\n   - **Host**: SFTP server hostname\n   - **Port**: Usually 22\n   - **Username**: SFTP account username\n   - **Auth Type**: Password or SSH Key\n   - **Remote Path**: Directory path on the server\n   - **Sync Direction**: INBOUND, OUTBOUND, or BIDIRECTIONAL\n   - **File Pattern**: Glob pattern for file matching (e.g., *.csv)\n\n4. Select the **Module** to associate the sync with\n5. Set the **Schedule** (cron expression) for automatic sync\n6. Click **Save**\n\n## Testing the Connection\nAfter saving, use the **Test Connection** button to verify connectivity.\n\n## Monitoring Syncs\nCheck the sync logs for status, files synced, and any errors.`,
          category: 'HOW_TO',
          tags: 'sftp,setup,tutorial,integration',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 34,
          sortOrder: 4,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Best Practices for Data Quality',
          slug: 'best-practices-data-quality',
          content: `# Best Practices for Data Quality\n\nMaintaining high-quality master data is critical for business operations. Follow these best practices.\n\n## 1. Consistent Naming Conventions\n- Use standardized codes (e.g., ART-001, STR-001)\n- Follow uppercase conventions for codes\n- Use descriptive names for display values\n\n## 2. Required Fields\n- Always fill in required fields completely\n- Don't use placeholder values like "TBD" or "N/A"\n- If a field is genuinely not applicable, leave it blank\n\n## 3. Data Validation\n- Article codes must match the pattern: ^[A-Z0-9-]+$\n- Prices and amounts cannot be negative\n- Email fields must contain valid email addresses\n- URLs must start with http:// or https://\n\n## 4. Approval Workflow\n- Always submit records for review before activating\n- Reviewers should verify all fields, not just required ones\n- Use review notes to communicate issues\n\n## 5. Regular Data Audits\n- Review records periodically for accuracy\n- Archive outdated records instead of deleting them\n- Use the Audit Log to track changes\n\n## 6. Bulk Operations\n- Use the template download feature for bulk imports\n- Validate data before importing\n- Start with small batches for testing\n\n## 7. Image Management\n- Upload high-quality product images\n- Use consistent image dimensions\n- Set primary images for each record`,
          category: 'BEST_PRACTICES',
          tags: 'data-quality,best-practices,guidelines',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 56,
          sortOrder: 5,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Frequently Asked Questions',
          slug: 'frequently-asked-questions',
          content: `# Frequently Asked Questions\n\n## General\n\n**Q: What is MAA BTOOL?**\nA: MAA BTOOL is the Enterprise Master Data Management system for the MAPI Group, managing product, store, supplier, pricing, and promotion data across all subsidiaries.\n\n**Q: How do I get an account?**\nA: Contact your system administrator. Accounts are created by Super Admins only.\n\n**Q: What companies are supported?**\nA: MAPI, MAPA, MBA, MAPD, MAPP, and MAPL - all MAPI Group subsidiaries.\n\n## Data Management\n\n**Q: Why is my record in DRAFT status?**\nA: Records start as DRAFT when the module requires approval. Submit it for review to move to IN_REVIEW status.\n\n**Q: How do I approve a record?**\nA: Navigate to the Workflow page, find the pending approval, and click Approve or Reject.\n\n**Q: Can I edit an ACTIVE record?**\nA: Yes, but editing an ACTIVE record creates a new DRAFT version. The original stays active until the draft is approved.\n\n**Q: What happens when I archive a record?**\nA: Archived records are soft-deleted and no longer appear in default views. They can be recovered by a Super Admin.\n\n## Technical\n\n**Q: What file formats are supported for bulk import?**\nA: TSV (tab-separated), CSV, and Excel (.xlsx, .xls) formats are supported.\n\n**Q: Is there an API available?**\nA: Yes, see the API Integration Guide for details on REST API endpoints.\n\n**Q: How do I upload product images?**\nA: Open a record detail, and use the image upload feature on IMAGE type fields.`,
          category: 'FAQ',
          tags: 'faq,questions,help',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 203,
          sortOrder: 6,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Approval Workflow Guide',
          slug: 'approval-workflow-guide',
          content: `# Approval Workflow Guide\n\nUnderstanding the record lifecycle and approval process in MAA BTOOL.\n\n## Record Status Lifecycle\n\n\`\`\`\nDRAFT → IN_REVIEW → ACTIVE → REVISION_PENDING → IN_REVIEW\n  ↓         ↓          ↓              ↓\nARCHIVED  REJECTED   ARCHIVED       ACTIVE\n            ↓\n          DRAFT\n\`\`\`\n\n## Status Descriptions\n- **DRAFT**: Initial state, editable by Editor users\n- **IN_REVIEW**: Submitted for approval, awaiting Administrator review\n- **ACTIVE**: Approved and live in the system\n- **REVISION_PENDING**: Active record needs updates\n- **REJECTED**: Reviewer declined the changes\n- **ARCHIVED**: Soft-deleted, no longer active\n\n## Approval Process\n1. Editor user creates a record (DRAFT)\n2. Editor user submits for review (DRAFT → IN_REVIEW)\n3. An approval ticket is automatically created\n4. Administrator reviews and either:\n   - **Approves** (IN_REVIEW → ACTIVE): Record becomes live\n   - **Rejects** (IN_REVIEW → REJECTED): Record goes back to DRAFT\n5. Rejected records can be revised and resubmitted\n\n## Reviewing Records\n- Navigate to **Workflow** page\n- Review the delta (changes) in the approval ticket\n- Add review notes for your decision\n- Click Approve or Reject\n\n## Super Admin Privileges\nSuper Admins can:\n- Approve their own records\n- Bypass approval for modules that normally require it\n- Change any record status directly`,
          category: 'HOW_TO',
          tags: 'approval,workflow,process',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 45,
          sortOrder: 7,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Bulk Import/Export Guide',
          slug: 'bulk-import-export-guide',
          content: `# Bulk Import/Export Guide\n\nLearn how to efficiently import and export master data in bulk.\n\n## Exporting Data\n1. Navigate to **Bulk Import** page\n2. Select the module to export\n3. Click **Export** to download as TSV\n4. The file contains all current field headers and data\n\n## Importing Data\n\n### Method 1: Paste Data\n1. Select the target module\n2. Paste TSV-formatted data into the text area\n3. First row must be headers matching field codes\n4. Click **Import** to process\n\n### Method 2: Upload File\n1. Switch to the **Upload File** tab\n2. Drag & drop or select a file (.xlsx, .xls, .csv)\n3. Preview the detected headers and row count\n4. Click **Import** to process\n\n## Download Template\nUse the **Download Template** button to get a pre-formatted template with all field headers for the selected module.\n\n## Import Rules\n- **Required fields** must be populated\n- **Validation rules** apply (regex, min/max length, min/max value)\n- Duplicate codes will be rejected\n- Each row creates a new DRAFT record\n\n## Tips\n- Start with a small test file (5-10 rows)\n- Check the Audit Log for import results\n- Use consistent date formats (YYYY-MM-DD)\n- Numbers should not have thousand separators`,
          category: 'HOW_TO',
          tags: 'bulk,import,export,data',
          authorId: userDataSteward.id,
          isPublished: true,
          viewCount: 38,
          sortOrder: 8,
        },
      }),
    ]);

    // ============================================================
    // 12. CREATE API KEYS SEED DATA
    // ============================================================
    const crypto = await import('crypto');
    const prodKeyRaw = `mapi_prod_${crypto.randomBytes(16).toString('hex')}`;
    const testKeyRaw = `mapi_test_${crypto.randomBytes(16).toString('hex')}`;

    await Promise.all([
      db.apiKey.create({
        data: {
          keyName: 'Production API Key',
          keyHash: crypto.createHash('sha256').update(prodKeyRaw).digest('hex'),
          keyPrefix: prodKeyRaw.substring(0, 12),
          companyId: companyMAPI.id,
          userId: userApiManager.id,
          permissions: 'READ,WRITE',
          rateLimit: 1000,
          isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      }),
      db.apiKey.create({
        data: {
          keyName: 'Testing API Key',
          keyHash: crypto.createHash('sha256').update(testKeyRaw).digest('hex'),
          keyPrefix: testKeyRaw.substring(0, 12),
          companyId: companyMAPI.id,
          userId: userApiManager.id,
          permissions: 'READ',
          rateLimit: 100,
          isActive: true,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        },
      }),
    ]);

    // ============================================================
    // 13. CREATE SFTP CONFIG SEED DATA
    // ============================================================
    await Promise.all([
      db.sftpConfig.create({
        data: {
          configName: 'MAPI ERP Sync',
          host: 'sftp.mapi-erp.internal',
          port: 22,
          username: 'mdm_sync_user',
          authType: 'PASSWORD',
          authCredential: 'encrypted_password_placeholder',
          remotePath: '/inbound/mdm',
          schedule: '0 */6 * * *',
          syncDirection: 'INBOUND',
          filePattern: '*.csv',
          moduleId: moduleArticle.id,
          companyId: companyMAPI.id,
          isActive: true,
        },
      }),
      db.sftpConfig.create({
        data: {
          configName: 'MAPA WMS Feed',
          host: 'sftp.mapa-wms.internal',
          port: 22,
          username: 'wms_sync_user',
          authType: 'SSH_KEY',
          authCredential: 'encrypted_ssh_key_placeholder',
          remotePath: '/sync/bidirectional',
          schedule: '0 2 * * *',
          syncDirection: 'BIDIRECTIONAL',
          filePattern: '*.xml',
          moduleId: moduleStore.id,
          companyId: companyMAPA.id,
          isActive: true,
        },
      }),
    ]);

    // ============================================================
    // DONE - Return summary
    // ============================================================
    return NextResponse.json({
      message: 'Database seeded successfully with MAPI Group data',
      summary: {
        companies: companies.length,
        roles: roles.length,
        users: users.length,
        modules: modules.length,
        articleRecords: articleRecords.length,
        storeRecords: storeRecords.length,
        documentation: 8,
        apiKeys: 2,
        sftpConfigs: 2,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Seed failed', details: message },
      { status: 500 }
    );
  }
}
