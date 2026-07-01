import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { jsonVal } from '@/lib/db-json';

export async function POST(request: NextRequest) {
  try {
    // ── Force reseed support ──────────────────────────────────────────────
    const url = new URL(request.url);
    const forceReseed = url.searchParams.get('force') === 'true';
    
    if (forceReseed && (await db.sysUser.count()) === 0) {
      console.info('[seed] Force reseed requested — wiping partial data...');
      try {
        // Try PostgreSQL first
        const tablenames = await db.$queryRaw<Array<{ tablename: string }>>`
          SELECT tablename FROM pg_tables WHERE schemaname='public'
        `;
        for (const { tablename } of tablenames) {
          if (tablename !== '_prisma_migrations') {
            try { await db.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`); } catch {}
          }
        }
      } catch {
        // Fallback for SQLite
        try {
          const tables = await db.$queryRaw<Array<{ name: string }>>`
            SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite%'
          `;
          for (const { name } of tables) {
            try { await db.$executeRawUnsafe(`DELETE FROM "${name}";`); } catch {}
          }
        } catch {}
      }
      console.info('[seed] All tables truncated.');
    }
    
    // ── Authorization ────────────────────────────────────────────────────
    const userCount = await db.sysUser.count();
    const isFirstRun = userCount === 0;
    
    // Allow seed via secret token (for CI/CD migration)
    const urlAuth = new URL(request.url);
    const secretParam = urlAuth.searchParams.get('secret');
    const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
    const authenticatedViaSecret = secretParam && VERCEL_TOKEN && secretParam === VERCEL_TOKEN;

    if (!isFirstRun && !authenticatedViaSecret) {
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

    if (userCount > 0 && !forceReseed) {
      return NextResponse.json({ message: 'Database already seeded. Use ?force=true to re-seed (Super Admin only).' });
    }

    // If force reseed AND authenticated as superadmin, wipe all data first
    if (forceReseed && userCount > 0) {
      console.info('[seed] Force re-seed: wiping existing data...');
      try {
        // Try PostgreSQL
        const tablenames = await db.$queryRaw<Array<{ tablename: string }>>`
          SELECT tablename FROM pg_tables WHERE schemaname='public'
        `;
        for (const { tablename } of tablenames) {
          if (tablename !== '_prisma_migrations') {
            try { await db.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`); } catch {}
          }
        }
      } catch {
        // Fallback for SQLite
        try {
          const tables = await db.$queryRaw<Array<{ name: string }>>`
            SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite%'
          `;
          for (const { name } of tables) {
            try { await db.$executeRawUnsafe(`DELETE FROM "${name}";`); } catch {}
          }
        } catch {}
      }
      console.info('[seed] All tables truncated for re-seed.');
    }

    // ============================================================
    // 1. CREATE COMPANIES (MAP Group - 6 companies)
    // ============================================================
    const companies = await Promise.all([
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPI', companyName: 'PT Mitra Adiperkasa Tbk',
          description: 'Parent company — Retail fashion & lifestyle conglomerate',
          industry: 'RETAIL', parentCode: null,
          website: 'https://www.map.co.id', phone: '+622129668888', email: 'info@map.co.id',
          address: 'Menara Mitra Adiperkasa, Jl. Jend. Sudirman Kav. 25-26, Jakarta 12920',
          onboardingStatus: 'ACTIVE', provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPA', companyName: 'PT MAP Aktif Adiperkasa Tbk',
          description: 'Sports & lifestyle retail division (Nike, Adidas, Converse, etc.)',
          industry: 'RETAIL', parentCode: 'MAPI',
          website: 'https://www.mapactive.co.id', phone: '+622129668801', email: 'info@mapactive.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 17, Jakarta 12920',
          onboardingStatus: 'ACTIVE', provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MBA', companyName: 'PT MAP Boga Adiperkasa Tbk',
          description: 'Food & Beverage retail division (Starbucks, Pizza Hut, etc.)',
          industry: 'F&B', parentCode: 'MAPI',
          website: 'https://www.mapboga.co.id', phone: '+622129668802', email: 'info@mapboga.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 18, Jakarta 12920',
          onboardingStatus: 'ACTIVE', provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPD', companyName: 'PT MAP Digital Adiperkasa',
          description: 'E-commerce and digital platform division',
          industry: 'DIGITAL', parentCode: 'MAPI',
          website: 'https://www.mapdigital.co.id', phone: '+622129668803', email: 'info@mapdigital.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 19, Jakarta 12920',
          onboardingStatus: 'ACTIVE', provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPP', companyName: 'PT MAP Properti Adiperkasa',
          description: 'Property and real estate management division',
          industry: 'PROPERTY', parentCode: 'MAPI',
          website: 'https://www.mapproperti.co.id', phone: '+622129668804', email: 'info@mapproperti.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 20, Jakarta 12920',
          onboardingStatus: 'ACTIVE', provisionedAt: new Date(),
        },
      }),
      db.tenantCompany.create({
        data: {
          companyCode: 'MAPL', companyName: 'PT MAP Logistics Adiperkasa',
          description: 'Logistics and supply chain management division',
          industry: 'LOGISTICS', parentCode: 'MAPI',
          website: 'https://www.maplogistics.co.id', phone: '+622129668805', email: 'info@maplogistics.co.id',
          address: 'Menara Mitra Adiperkasa Lt. 21, Jakarta 12920',
          onboardingStatus: 'ACTIVE', provisionedAt: new Date(),
        },
      }),
    ]);

    const [companyMAPI, companyMAPA, companyMBA, companyMAPD, companyMAPP, companyMAPL] = companies;

    // ============================================================
    // 2. CREATE ROLES (Stibo role types with per-company scope)
    // ============================================================
    // Global/System roles
    const roleSuperAdmin = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Super Admin', description: 'Full access to all modules and administrative functions', roleType: 'SYSTEM_ADMIN', isGlobal: true, isSystem: true, scope: 'GLOBAL' } });
    
    // Shared functional roles
    const roleAdministrator = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Administrator', description: 'Can read, create, edit, and approve records across modules', roleType: 'ADMINISTRATOR', scope: 'GLOBAL' } });
    const roleEditor = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Editor', description: 'Can read, create, and edit records in assigned modules', roleType: 'EDITOR', scope: 'MODULE_LEVEL' } });
    const roleViewer = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Viewer', description: 'Read-only access to assigned modules', roleType: 'VIEWER', scope: 'MODULE_LEVEL' } });
    const roleDataSteward = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Data Steward', description: 'Can manage data quality, corrections, and knowledge base', roleType: 'DATA_STEWARD', scope: 'MODULE_LEVEL' } });
    const roleApprover = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Approver', description: 'Can review and approve data management tasks', roleType: 'APPROVER', scope: 'MODULE_LEVEL' } });

    // Per-company Company Admin roles
    const roleCompanyAdminMAPI = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'Company Admin MAPI', description: 'MAPI company-level administrator', roleType: 'ADMINISTRATOR', scope: 'GLOBAL', color: '#dc2626' } });
    const roleCompanyAdminMAPA = await db.sysRole.create({ data: { companyId: companyMAPA.id, roleName: 'Company Admin MAPA', description: 'MAPA company-level administrator', roleType: 'ADMINISTRATOR', scope: 'GLOBAL', color: '#dc2626' } });
    const roleCompanyAdminMBA = await db.sysRole.create({ data: { companyId: companyMBA.id, roleName: 'Company Admin MBA', description: 'MBA company-level administrator', roleType: 'ADMINISTRATOR', scope: 'GLOBAL', color: '#dc2626' } });
    const roleCompanyAdminMAPD = await db.sysRole.create({ data: { companyId: companyMAPD.id, roleName: 'Company Admin MAPD', description: 'MAPD company-level administrator', roleType: 'ADMINISTRATOR', scope: 'GLOBAL', color: '#dc2626' } });
    const roleCompanyAdminMAPP = await db.sysRole.create({ data: { companyId: companyMAPP.id, roleName: 'Company Admin MAPP', description: 'MAPP company-level administrator', roleType: 'ADMINISTRATOR', scope: 'GLOBAL', color: '#dc2626' } });
    const roleCompanyAdminMAPL = await db.sysRole.create({ data: { companyId: companyMAPL.id, roleName: 'Company Admin MAPL', description: 'MAPL company-level administrator', roleType: 'ADMINISTRATOR', scope: 'GLOBAL', color: '#dc2626' } });

    // Specialized roles with MODULE scope
    const roleApiManager = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'API Manager', description: 'Can manage API keys and integration configurations', roleType: 'ADMINISTRATOR', scope: 'MODULE_LEVEL', color: '#7c3aed' } });
    const roleSftpManager = await db.sysRole.create({ data: { companyId: companyMAPI.id, roleName: 'SFTP Manager', description: 'Can manage SFTP configurations and sync schedules', roleType: 'ADMINISTRATOR', scope: 'MODULE_LEVEL', color: '#0891b2' } });

    // Data Steward per company
    const roleStewardMAPA = await db.sysRole.create({ data: { companyId: companyMAPA.id, roleName: 'Data Steward MAPA', description: 'MAPA data quality steward', roleType: 'DATA_STEWARD', scope: 'MODULE_LEVEL', color: '#d97706' } });
    const roleStewardMBA = await db.sysRole.create({ data: { companyId: companyMBA.id, roleName: 'Data Steward MBA', description: 'MBA data quality steward', roleType: 'DATA_STEWARD', scope: 'MODULE_LEVEL', color: '#d97706' } });

    const allRoles = [roleSuperAdmin, roleAdministrator, roleEditor, roleViewer, roleDataSteward, roleApprover,
      roleCompanyAdminMAPI, roleCompanyAdminMAPA, roleCompanyAdminMBA, roleCompanyAdminMAPD, roleCompanyAdminMAPP, roleCompanyAdminMAPL,
      roleApiManager, roleSftpManager, roleStewardMAPA, roleStewardMBA];

    // ============================================================
    // 3. CREATE USERS (28 users across all companies)
    // ============================================================
    const pwHash = await hashPassword('Admin@123');

    const users = await Promise.all([
      // ── MAPI Users ──────────────────────────────
      db.sysUser.create({ data: { username: 'superadmin', email: 'superadmin@map.co.id', passwordHash: pwHash, displayName: 'Super Admin', companyId: companyMAPI.id, userRoles: { create: { roleId: roleSuperAdmin.id, companyId: companyMAPI.id } } } }),
      db.sysUser.create({ data: { username: 'admin_mapi', email: 'admin.mapi@map.co.id', passwordHash: pwHash, displayName: 'Rudi Hartono', companyId: companyMAPI.id, userRoles: { create: { roleId: roleCompanyAdminMAPI.id, companyId: companyMAPI.id } } } }),
      db.sysUser.create({ data: { username: 'steward_mapi', email: 'steward.mapi@map.co.id', passwordHash: pwHash, displayName: 'Siti Nurhaliza', companyId: companyMAPI.id, userRoles: { create: { roleId: roleDataSteward.id, companyId: companyMAPI.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mapi1', email: 'editor1.mapi@map.co.id', passwordHash: pwHash, displayName: 'Budi Santoso', companyId: companyMAPI.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPI.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mapi2', email: 'editor2.mapi@map.co.id', passwordHash: pwHash, displayName: 'Dewi Lestari', companyId: companyMAPI.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPI.id } } } }),
      db.sysUser.create({ data: { username: 'viewer_mapi', email: 'viewer.mapi@map.co.id', passwordHash: pwHash, displayName: 'Ahmad Fauzi', companyId: companyMAPI.id, userRoles: { create: { roleId: roleViewer.id, companyId: companyMAPI.id } } } }),
      db.sysUser.create({ data: { username: 'approver_mapi', email: 'approver.mapi@map.co.id', passwordHash: pwHash, displayName: 'Ratna Sari', companyId: companyMAPI.id, userRoles: { create: { roleId: roleApprover.id, companyId: companyMAPI.id } } } }),

      // ── MAPA Users ──────────────────────────────
      db.sysUser.create({ data: { username: 'admin_mapa', email: 'admin.mapa@mapactive.co.id', passwordHash: pwHash, displayName: 'Hendra Wijaya', companyId: companyMAPA.id, userRoles: { create: { roleId: roleCompanyAdminMAPA.id, companyId: companyMAPA.id } } } }),
      db.sysUser.create({ data: { username: 'steward_mapa', email: 'steward.mapa@mapactive.co.id', passwordHash: pwHash, displayName: 'Rina Marlina', companyId: companyMAPA.id, userRoles: { create: { roleId: roleStewardMAPA.id, companyId: companyMAPA.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mapa1', email: 'editor1.mapa@mapactive.co.id', passwordHash: pwHash, displayName: 'Yoga Pratama', companyId: companyMAPA.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPA.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mapa2', email: 'editor2.mapa@mapactive.co.id', passwordHash: pwHash, displayName: 'Putri Handayani', companyId: companyMAPA.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPA.id } } } }),
      db.sysUser.create({ data: { username: 'viewer_mapa', email: 'viewer.mapa@mapactive.co.id', passwordHash: pwHash, displayName: 'Fajar Nugroho', companyId: companyMAPA.id, userRoles: { create: { roleId: roleViewer.id, companyId: companyMAPA.id } } } }),

      // ── MBA Users ──────────────────────────────
      db.sysUser.create({ data: { username: 'admin_mba', email: 'admin.mba@mapboga.co.id', passwordHash: pwHash, displayName: 'Bambang Kusumo', companyId: companyMBA.id, userRoles: { create: { roleId: roleCompanyAdminMBA.id, companyId: companyMBA.id } } } }),
      db.sysUser.create({ data: { username: 'steward_mba', email: 'steward.mba@mapboga.co.id', passwordHash: pwHash, displayName: 'Maya Indah', companyId: companyMBA.id, userRoles: { create: { roleId: roleStewardMBA.id, companyId: companyMBA.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mba1', email: 'editor1.mba@mapboga.co.id', passwordHash: pwHash, displayName: 'Andi Saputra', companyId: companyMBA.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMBA.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mba2', email: 'editor2.mba@mapboga.co.id', passwordHash: pwHash, displayName: 'Lina Susanti', companyId: companyMBA.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMBA.id } } } }),
      db.sysUser.create({ data: { username: 'viewer_mba', email: 'viewer.mba@mapboga.co.id', passwordHash: pwHash, displayName: 'Dian Purnama', companyId: companyMBA.id, userRoles: { create: { roleId: roleViewer.id, companyId: companyMBA.id } } } }),

      // ── MAPD Users ──────────────────────────────
      db.sysUser.create({ data: { username: 'admin_mapd', email: 'admin.mapd@mapdigital.co.id', passwordHash: pwHash, displayName: 'Reza Mahendra', companyId: companyMAPD.id, userRoles: { create: { roleId: roleCompanyAdminMAPD.id, companyId: companyMAPD.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mapd', email: 'editor.mapd@mapdigital.co.id', passwordHash: pwHash, displayName: 'Nita Kusuma', companyId: companyMAPD.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPD.id } } } }),
      db.sysUser.create({ data: { username: 'viewer_mapd', email: 'viewer.mapd@mapdigital.co.id', passwordHash: pwHash, displayName: 'Teguh Prasetyo', companyId: companyMAPD.id, userRoles: { create: { roleId: roleViewer.id, companyId: companyMAPD.id } } } }),

      // ── MAPP Users ──────────────────────────────
      db.sysUser.create({ data: { username: 'admin_mapp', email: 'admin.mapp@mapproperti.co.id', passwordHash: pwHash, displayName: 'Wahyu Hidayat', companyId: companyMAPP.id, userRoles: { create: { roleId: roleCompanyAdminMAPP.id, companyId: companyMAPP.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mapp', email: 'editor.mapp@mapproperti.co.id', passwordHash: pwHash, displayName: 'Citra Dewi', companyId: companyMAPP.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPP.id } } } }),
      db.sysUser.create({ data: { username: 'viewer_mapp', email: 'viewer.mapp@mapproperti.co.id', passwordHash: pwHash, displayName: 'Surya Antono', companyId: companyMAPP.id, userRoles: { create: { roleId: roleViewer.id, companyId: companyMAPP.id } } } }),

      // ── MAPL Users ──────────────────────────────
      db.sysUser.create({ data: { username: 'admin_mapl', email: 'admin.mapl@maplogistics.co.id', passwordHash: pwHash, displayName: 'Joko Widodo S.', companyId: companyMAPL.id, userRoles: { create: { roleId: roleCompanyAdminMAPL.id, companyId: companyMAPL.id } } } }),
      db.sysUser.create({ data: { username: 'editor_mapl', email: 'editor.mapl@maplogistics.co.id', passwordHash: pwHash, displayName: 'Endah Rahayu', companyId: companyMAPL.id, userRoles: { create: { roleId: roleEditor.id, companyId: companyMAPL.id } } } }),
      db.sysUser.create({ data: { username: 'viewer_mapl', email: 'viewer.mapl@maplogistics.co.id', passwordHash: pwHash, displayName: 'Agus Prabowo', companyId: companyMAPL.id, userRoles: { create: { roleId: roleViewer.id, companyId: companyMAPL.id } } } }),

      // ── Specialized Users ──────────────────────
      db.sysUser.create({ data: { username: 'api_manager', email: 'api.manager@map.co.id', passwordHash: pwHash, displayName: 'Irfan Hakim', companyId: companyMAPI.id, userRoles: { create: { roleId: roleApiManager.id, companyId: companyMAPI.id } } } }),
      db.sysUser.create({ data: { username: 'sftp_manager', email: 'sftp.manager@map.co.id', passwordHash: pwHash, displayName: 'Lukman Hakim', companyId: companyMAPI.id, userRoles: { create: { roleId: roleSftpManager.id, companyId: companyMAPI.id } } } }),
    ]);

    const [userSuperAdmin, userAdminMAPI, userStewardMAPI, userEditorMAPI1, userEditorMAPI2, userViewerMAPI, userApproverMAPI,
      userAdminMAPA, userStewardMAPA, userEditorMAPA1, userEditorMAPA2, userViewerMAPA,
      userAdminMBA, userStewardMBA, userEditorMBA1, userEditorMBA2, userViewerMBA,
      userAdminMAPD, userEditorMAPD, userViewerMAPD,
      userAdminMAPP, userEditorMAPP, userViewerMAPP,
      userAdminMAPL, userEditorMAPL, userViewerMAPL,
      userApiManager, userSftpManager] = users;

    // ============================================================
    // 4. CREATE MODULES (12 modules — comprehensive retail MDM)
    // ============================================================
    const modules = await Promise.all([
      db.metaModule.create({ data: { moduleCode: 'ARTICLE_MASTER', moduleName: 'Article Master', moduleIcon: 'Package', entityType: 'PRODUCT', description: 'Manage article/product master data including SKU, descriptions, and categories', requireApproval: true, sortOrder: 1 } }),
      db.metaModule.create({ data: { moduleCode: 'STORE_MASTER', moduleName: 'Store Master', moduleIcon: 'Store', entityType: 'LOCATION', description: 'Store location master data management', requireApproval: false, sortOrder: 2 } }),
      db.metaModule.create({ data: { moduleCode: 'SUPPLIER_MASTER', moduleName: 'Supplier Master', moduleIcon: 'Truck', entityType: 'SUPPLIER', description: 'Manage supplier master data including contacts, types, and payment terms', requireApproval: true, sortOrder: 3 } }),
      db.metaModule.create({ data: { moduleCode: 'PRICING_MASTER', moduleName: 'Pricing Master', moduleIcon: 'Tag', entityType: 'PRODUCT', description: 'Manage pricing data including regular, promotional, cost, and wholesale prices', requireApproval: true, sortOrder: 4 } }),
      db.metaModule.create({ data: { moduleCode: 'PROMOTION_MASTER', moduleName: 'Promotion Master', moduleIcon: 'Gift', entityType: 'PRODUCT', description: 'Manage promotional campaigns including discounts, BOGO, bundles, and flash sales', requireApproval: true, sortOrder: 5 } }),
      db.metaModule.create({ data: { moduleCode: 'CUSTOMER_MASTER', moduleName: 'Customer Master', moduleIcon: 'Users', entityType: 'CUSTOMER', description: 'Customer and loyalty member data management', requireApproval: true, sortOrder: 6 } }),
      db.metaModule.create({ data: { moduleCode: 'BRAND_MASTER', moduleName: 'Brand Master', moduleIcon: 'Award', entityType: 'PRODUCT', description: 'Brand registry and brand master data management', requireApproval: true, sortOrder: 7 } }),
      db.metaModule.create({ data: { moduleCode: 'CATEGORY_MASTER', moduleName: 'Category Master', moduleIcon: 'LayoutGrid', entityType: 'PRODUCT', description: 'Product categories and taxonomy management', requireApproval: true, sortOrder: 8 } }),
      db.metaModule.create({ data: { moduleCode: 'INVENTORY_MASTER', moduleName: 'Inventory Master', moduleIcon: 'Warehouse', entityType: 'LOCATION', description: 'Stock and inventory data management across stores and warehouses', requireApproval: true, sortOrder: 9 } }),
      db.metaModule.create({ data: { moduleCode: 'EMPLOYEE_MASTER', moduleName: 'Employee Master', moduleIcon: 'UserCheck', entityType: 'CUSTOMER', description: 'Employee directory and HR data management', requireApproval: true, sortOrder: 10 } }),
      db.metaModule.create({ data: { moduleCode: 'BUDGET', moduleName: 'Budget', moduleIcon: 'DollarSign', entityType: 'PRODUCT', description: 'Budget planning and tracking with approval workflow', requireApproval: true, sortOrder: 11 } }),
      db.metaModule.create({ data: { moduleCode: 'ASSET', moduleName: 'Asset', moduleIcon: 'Building2', entityType: 'ASSET', description: 'Asset management and tracking across the organization', requireApproval: true, sortOrder: 12 } }),
    ]);

    const [moduleArticle, moduleStore, moduleSupplier, modulePricing, modulePromotion,
      moduleCustomer, moduleBrand, moduleCategory, moduleInventory, moduleEmployee,
      moduleBudget, moduleAsset] = modules;

    // ============================================================
    // 5. CREATE FIELDS FOR EACH MODULE
    // ============================================================

    // Article Master Fields (12 fields)
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

    // Store Master Fields (12 fields)
    const storeFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'store_code', fieldName: 'Store Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. STR-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'store_name', fieldName: 'Store Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Store name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'mall_name', fieldName: 'Mall Name', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Mall name', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'region', fieldName: 'Region', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select region', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'city', fieldName: 'City', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'City', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'province', fieldName: 'Province', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Province', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'address', fieldName: 'Address', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Full address', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'phone', fieldName: 'Phone', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: '+62...', sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'store_type', fieldName: 'Store Type', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select type', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'operating_hours', fieldName: 'Operating Hours', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'e.g. 10:00-22:00', sortOrder: 10 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'area_sqm', fieldName: 'Area (sqm)', dataType: 'NUMBER', isRequired: false, isUnique: false, placeholder: '0', sortOrder: 11 } }),
      db.metaField.create({ data: { moduleId: moduleStore.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 12 } }),
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

    // Customer Master Fields (12 fields)
    const customerFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'customer_code', fieldName: 'Customer Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. CUS-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'full_name', fieldName: 'Full Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Customer full name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'email', fieldName: 'Email', dataType: 'EMAIL', isRequired: false, isUnique: false, placeholder: 'customer@email.com', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'phone', fieldName: 'Phone', dataType: 'PHONE', isRequired: false, isUnique: false, placeholder: '+62...', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'membership_tier', fieldName: 'Membership Tier', dataType: 'SELECT', isRequired: false, isUnique: false, defaultValue: 'REGULAR', placeholder: 'Select tier', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'total_points', fieldName: 'Total Points', dataType: 'NUMBER', isRequired: false, isUnique: false, defaultValue: '0', placeholder: '0', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'total_spent', fieldName: 'Total Spent', dataType: 'CURRENCY', isRequired: false, isUnique: false, defaultValue: '0', placeholder: '0.00', unitOfMeasure: 'IDR', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'join_date', fieldName: 'Join Date', dataType: 'DATE', isRequired: false, isUnique: false, sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'preferred_store', fieldName: 'Preferred Store', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Store name', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'gender', fieldName: 'Gender', dataType: 'SELECT', isRequired: false, isUnique: false, placeholder: 'Select gender', sortOrder: 10 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'date_of_birth', fieldName: 'Date of Birth', dataType: 'DATE', isRequired: false, isUnique: false, sortOrder: 11 } }),
      db.metaField.create({ data: { moduleId: moduleCustomer.id, fieldCode: 'city', fieldName: 'City', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'City', sortOrder: 12 } }),
    ]);

    // Brand Master Fields (8 fields)
    const brandFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'brand_code', fieldName: 'Brand Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. BRD-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'brand_name', fieldName: 'Brand Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Brand name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'brand_origin', fieldName: 'Country of Origin', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'e.g. USA, Germany', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'parent_company', fieldName: 'Parent Company', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Parent company name', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'category', fieldName: 'Category', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'e.g. Footwear, Apparel', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'website', fieldName: 'Website', dataType: 'URL', isRequired: false, isUnique: false, placeholder: 'https://...', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'description', fieldName: 'Description', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Brand description', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleBrand.id, fieldCode: 'logo', fieldName: 'Brand Logo', dataType: 'IMAGE', isRequired: false, isUnique: false, placeholder: 'Upload brand logo', sortOrder: 8 } }),
    ]);

    // Category Master Fields (7 fields)
    const categoryFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleCategory.id, fieldCode: 'category_code', fieldName: 'Category Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. CAT-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleCategory.id, fieldCode: 'category_name', fieldName: 'Category Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Category name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleCategory.id, fieldCode: 'parent_category', fieldName: 'Parent Category', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Parent category code', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleCategory.id, fieldCode: 'level', fieldName: 'Level', dataType: 'INTEGER', isRequired: false, isUnique: false, defaultValue: '0', placeholder: '0', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleCategory.id, fieldCode: 'description', fieldName: 'Description', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Category description', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleCategory.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleCategory.id, fieldCode: 'sort_order', fieldName: 'Sort Order', dataType: 'INTEGER', isRequired: false, isUnique: false, defaultValue: '0', sortOrder: 7 } }),
    ]);

    // Inventory Master Fields (10 fields)
    const inventoryFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'inventory_code', fieldName: 'Inventory Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. INV-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'article_code', fieldName: 'Article Code', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'e.g. ART-001', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'store_code', fieldName: 'Store Code', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'e.g. STR-001', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'quantity_on_hand', fieldName: 'Quantity on Hand', dataType: 'INTEGER', isRequired: true, isUnique: false, defaultValue: '0', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'quantity_reserved', fieldName: 'Quantity Reserved', dataType: 'INTEGER', isRequired: false, isUnique: false, defaultValue: '0', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'quantity_available', fieldName: 'Quantity Available', dataType: 'INTEGER', isRequired: false, isUnique: false, defaultValue: '0', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'reorder_point', fieldName: 'Reorder Point', dataType: 'INTEGER', isRequired: false, isUnique: false, defaultValue: '10', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'last_count_date', fieldName: 'Last Count Date', dataType: 'DATE', isRequired: false, isUnique: false, sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'warehouse_location', fieldName: 'Warehouse Location', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'Bin/Shelf location', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: moduleInventory.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 10 } }),
    ]);

    // Employee Master Fields (10 fields)
    const employeeFields = await Promise.all([
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'employee_code', fieldName: 'Employee Code', dataType: 'TEXT', isRequired: true, isUnique: true, placeholder: 'e.g. EMP-001', sortOrder: 1 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'full_name', fieldName: 'Full Name', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Employee full name', sortOrder: 2 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'email', fieldName: 'Email', dataType: 'EMAIL', isRequired: true, isUnique: false, placeholder: 'employee@map.co.id', sortOrder: 3 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'phone', fieldName: 'Phone', dataType: 'PHONE', isRequired: false, isUnique: false, placeholder: '+62...', sortOrder: 4 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'department', fieldName: 'Department', dataType: 'SELECT', isRequired: true, isUnique: false, placeholder: 'Select department', sortOrder: 5 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'position', fieldName: 'Position', dataType: 'TEXT', isRequired: true, isUnique: false, placeholder: 'Job title', sortOrder: 6 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'store_code', fieldName: 'Assigned Store', dataType: 'TEXT', isRequired: false, isUnique: false, placeholder: 'e.g. STR-001', sortOrder: 7 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'join_date', fieldName: 'Join Date', dataType: 'DATE', isRequired: false, isUnique: false, sortOrder: 8 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'status', fieldName: 'Status', dataType: 'SELECT', isRequired: false, isUnique: false, defaultValue: 'ACTIVE', sortOrder: 9 } }),
      db.metaField.create({ data: { moduleId: moduleEmployee.id, fieldCode: 'is_active', fieldName: 'Active', dataType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: 'true', sortOrder: 10 } }),
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
      // Store Code validation
      db.fieldValidation.create({ data: { fieldId: storeFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Store code must contain only uppercase letters, numbers, and hyphens' } }),
      // Supplier Code validations
      db.fieldValidation.create({ data: { fieldId: supplierFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Supplier code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: supplierFields[0].id, ruleType: 'MIN_LENGTH', ruleValue: '3', errorMessage: 'Supplier code must be at least 3 characters' } }),
      db.fieldValidation.create({ data: { fieldId: supplierFields[1].id, ruleType: 'MIN_LENGTH', ruleValue: '2', errorMessage: 'Supplier name must be at least 2 characters' } }),
      // Pricing Code validations
      db.fieldValidation.create({ data: { fieldId: pricingFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Pricing code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: pricingFields[3].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Price cannot be negative' } }),
      // Promo Code validations
      db.fieldValidation.create({ data: { fieldId: promotionFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Promo code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: promotionFields[4].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Discount value cannot be negative' } }),
      // Customer Code validations
      db.fieldValidation.create({ data: { fieldId: customerFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Customer code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: customerFields[1].id, ruleType: 'MIN_LENGTH', ruleValue: '2', errorMessage: 'Full name must be at least 2 characters' } }),
      db.fieldValidation.create({ data: { fieldId: customerFields[5].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Total points cannot be negative' } }),
      db.fieldValidation.create({ data: { fieldId: customerFields[6].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Total spent cannot be negative' } }),
      // Brand Code validations
      db.fieldValidation.create({ data: { fieldId: brandFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Brand code must contain only uppercase letters, numbers, and hyphens' } }),
      // Category Code validations
      db.fieldValidation.create({ data: { fieldId: categoryFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Category code must contain only uppercase letters, numbers, and hyphens' } }),
      // Inventory Code validations
      db.fieldValidation.create({ data: { fieldId: inventoryFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Inventory code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: inventoryFields[3].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Quantity on hand cannot be negative' } }),
      // Employee Code validations
      db.fieldValidation.create({ data: { fieldId: employeeFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Employee code must contain only uppercase letters, numbers, and hyphens' } }),
      // Budget Code validation
      db.fieldValidation.create({ data: { fieldId: budgetFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Budget code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: budgetFields[4].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Budget amount cannot be negative' } }),
      // Asset Code validation
      db.fieldValidation.create({ data: { fieldId: assetFields[0].id, ruleType: 'REGEX', ruleValue: '^[A-Z0-9-]+$', errorMessage: 'Asset code must contain only uppercase letters, numbers, and hyphens' } }),
      db.fieldValidation.create({ data: { fieldId: assetFields[5].id, ruleType: 'MIN_VALUE', ruleValue: '0', errorMessage: 'Purchase value cannot be negative' } }),
    ]);

    // ============================================================
    // 7. CREATE LOOKUP DATA (expanded with more lookups)
    // ============================================================
    await Promise.all([
      db.lookupMaster.create({
        data: {
          lookupCode: 'UOM', lookupName: 'Unit of Measure', description: 'Standard units of measure', category: 'System',
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
          lookupCode: 'CATEGORY', lookupName: 'Article Category', description: 'mapclub.com product categories (MAP Active Adiperkasa)', category: 'Custom',
          values: { create: [
            { valueCode: 'FOOTWEAR', displayValue: 'Footwear', sortOrder: 0 },
            { valueCode: 'APPAREL', displayValue: 'Apparel', sortOrder: 1 },
            { valueCode: 'ACCESSORIES', displayValue: 'Accessories', sortOrder: 2 },
            { valueCode: 'SPORTS_EQUIPMENT', displayValue: 'Sports Equipment', sortOrder: 3 },
            { valueCode: 'OUTDOOR', displayValue: 'Outdoor', sortOrder: 4 },
            { valueCode: 'FOOD_BEVERAGE', displayValue: 'Food & Beverage', sortOrder: 5 },
            { valueCode: 'BEAUTY', displayValue: 'Beauty', sortOrder: 6 },
            { valueCode: 'HOME_LIVING', displayValue: 'Home & Living', sortOrder: 7 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'SUB_CATEGORY', lookupName: 'Article Sub Category', description: 'Sub-category with cascading relation to Category', category: 'Custom',
          values: { create: [
            { valueCode: 'RUNNING_SHOES', displayValue: 'Running Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 0 },
            { valueCode: 'BASKETBALL_SHOES', displayValue: 'Basketball Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 1 },
            { valueCode: 'CASUAL_SNEAKERS', displayValue: 'Casual Sneakers', parentValueCode: 'FOOTWEAR', sortOrder: 2 },
            { valueCode: 'SANDALS', displayValue: 'Sandals', parentValueCode: 'FOOTWEAR', sortOrder: 3 },
            { valueCode: 'FORMAL_SHOES', displayValue: 'Formal Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 4 },
            { valueCode: 'TRAINING_SHOES', displayValue: 'Training Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 5 },
            { valueCode: 'BOOTS', displayValue: 'Boots', parentValueCode: 'FOOTWEAR', sortOrder: 6 },
            { valueCode: 'T_SHIRTS', displayValue: 'T-Shirts', parentValueCode: 'APPAREL', sortOrder: 7 },
            { valueCode: 'HOODIES', displayValue: 'Hoodies', parentValueCode: 'APPAREL', sortOrder: 8 },
            { valueCode: 'JACKETS', displayValue: 'Jackets', parentValueCode: 'APPAREL', sortOrder: 9 },
            { valueCode: 'PANTS', displayValue: 'Pants', parentValueCode: 'APPAREL', sortOrder: 10 },
            { valueCode: 'SHORTS', displayValue: 'Shorts', parentValueCode: 'APPAREL', sortOrder: 11 },
            { valueCode: 'DRESSES', displayValue: 'Dresses', parentValueCode: 'APPAREL', sortOrder: 12 },
            { valueCode: 'BAGS', displayValue: 'Bags', parentValueCode: 'ACCESSORIES', sortOrder: 13 },
            { valueCode: 'HATS', displayValue: 'Hats', parentValueCode: 'ACCESSORIES', sortOrder: 14 },
            { valueCode: 'SOCKS', displayValue: 'Socks', parentValueCode: 'ACCESSORIES', sortOrder: 15 },
            { valueCode: 'WATCHES', displayValue: 'Watches', parentValueCode: 'ACCESSORIES', sortOrder: 16 },
            { valueCode: 'SUNGLASSES', displayValue: 'Sunglasses', parentValueCode: 'ACCESSORIES', sortOrder: 17 },
            { valueCode: 'BELTS', displayValue: 'Belts', parentValueCode: 'ACCESSORIES', sortOrder: 18 },
            { valueCode: 'BASKETBALL', displayValue: 'Basketball', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 19 },
            { valueCode: 'FOOTBALL', displayValue: 'Football', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 20 },
            { valueCode: 'TENNIS', displayValue: 'Tennis', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 21 },
            { valueCode: 'SWIMMING', displayValue: 'Swimming', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 22 },
            { valueCode: 'GYM_EQUIPMENT', displayValue: 'Gym Equipment', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 23 },
            { valueCode: 'CAMPING', displayValue: 'Camping', parentValueCode: 'OUTDOOR', sortOrder: 24 },
            { valueCode: 'HIKING', displayValue: 'Hiking', parentValueCode: 'OUTDOOR', sortOrder: 25 },
            { valueCode: 'COFFEE', displayValue: 'Coffee & Beverages', parentValueCode: 'FOOD_BEVERAGE', sortOrder: 26 },
            { valueCode: 'FOOD', displayValue: 'Food', parentValueCode: 'FOOD_BEVERAGE', sortOrder: 27 },
            { valueCode: 'SKINCARE', displayValue: 'Skincare', parentValueCode: 'BEAUTY', sortOrder: 28 },
            { valueCode: 'FRAGRANCE', displayValue: 'Fragrance', parentValueCode: 'BEAUTY', sortOrder: 29 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'ARTICLE_TAGS', lookupName: 'Article Tags', description: 'Multi-select tag list for articles', category: 'Custom',
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
          lookupCode: 'DEPARTMENT', lookupName: 'Department', description: 'Company departments', category: 'System',
          values: { create: [
            { valueCode: 'FINANCE', displayValue: 'Finance', sortOrder: 0 },
            { valueCode: 'MARKETING', displayValue: 'Marketing', sortOrder: 1 },
            { valueCode: 'OPERATIONS', displayValue: 'Operations', sortOrder: 2 },
            { valueCode: 'HR', displayValue: 'Human Resources', sortOrder: 3 },
            { valueCode: 'IT', displayValue: 'IT', sortOrder: 4 },
            { valueCode: 'SALES', displayValue: 'Sales', sortOrder: 5 },
            { valueCode: 'MERCHANDISING', displayValue: 'Merchandising', sortOrder: 6 },
            { valueCode: 'STORE_OPS', displayValue: 'Store Operations', sortOrder: 7 },
            { valueCode: 'SUPPLY_CHAIN', displayValue: 'Supply Chain', sortOrder: 8 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'ASSET_TYPE', lookupName: 'Asset Type', description: 'Types of assets', category: 'Custom',
          values: { create: [
            { valueCode: 'VEHICLE', displayValue: 'Vehicle', sortOrder: 0 },
            { valueCode: 'IT_EQUIPMENT', displayValue: 'IT Equipment', sortOrder: 1 },
            { valueCode: 'FURNITURE', displayValue: 'Furniture', sortOrder: 2 },
            { valueCode: 'BUILDING', displayValue: 'Building', sortOrder: 3 },
            { valueCode: 'MACHINERY', displayValue: 'Machinery', sortOrder: 4 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'ASSET_CONDITION', lookupName: 'Asset Condition', description: 'Asset condition ratings', category: 'Custom',
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
          lookupCode: 'REGION', lookupName: 'Region', description: 'Geographic regions', category: 'Custom',
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
          lookupCode: 'STORE_TYPE', lookupName: 'Store Type', description: 'Types of retail stores', category: 'Custom',
          values: { create: [
            { valueCode: 'FLAGSHIP', displayValue: 'Flagship Store', sortOrder: 0 },
            { valueCode: 'STANDARD', displayValue: 'Standard Store', sortOrder: 1 },
            { valueCode: 'OUTLET', displayValue: 'Outlet Store', sortOrder: 2 },
            { valueCode: 'POP_UP', displayValue: 'Pop-up Store', sortOrder: 3 },
            { valueCode: 'SPECIALTY', displayValue: 'Specialty Store', sortOrder: 4 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'BUDGET_STATUS', lookupName: 'Budget Status', description: 'Status of budget items', category: 'Custom',
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
          lookupCode: 'SUPPLIER_TYPE', lookupName: 'Supplier Type', description: 'Types of suppliers', category: 'Custom',
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
          lookupCode: 'PAYMENT_TERMS', lookupName: 'Payment Terms', description: 'Payment terms for suppliers', category: 'Custom',
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
          lookupCode: 'PRICE_TYPE', lookupName: 'Price Type', description: 'Types of pricing', category: 'Custom',
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
          lookupCode: 'PROMO_TYPE', lookupName: 'Promo Type', description: 'Types of promotions', category: 'Custom',
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
          lookupCode: 'DISCOUNT_TYPE', lookupName: 'Discount Type', description: 'Types of discounts', category: 'Custom',
          values: { create: [
            { valueCode: 'PERCENTAGE', displayValue: 'Percentage (%)', sortOrder: 0 },
            { valueCode: 'FIXED_AMOUNT', displayValue: 'Fixed Amount', sortOrder: 1 },
            { valueCode: 'BUY_X_GET_Y', displayValue: 'Buy X Get Y', sortOrder: 2 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'MEMBERSHIP_TIER', lookupName: 'Membership Tier', description: 'Customer loyalty membership tiers', category: 'Custom',
          values: { create: [
            { valueCode: 'REGULAR', displayValue: 'Regular', sortOrder: 0 },
            { valueCode: 'SILVER', displayValue: 'Silver', sortOrder: 1 },
            { valueCode: 'GOLD', displayValue: 'Gold', sortOrder: 2 },
            { valueCode: 'PLATINUM', displayValue: 'Platinum', sortOrder: 3 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'CURRENCY', lookupName: 'Currency', description: 'Currency codes', category: 'ISO',
          values: { create: [
            { valueCode: 'IDR', displayValue: 'Indonesian Rupiah (IDR)', sortOrder: 0 },
            { valueCode: 'USD', displayValue: 'US Dollar (USD)', sortOrder: 1 },
            { valueCode: 'SGD', displayValue: 'Singapore Dollar (SGD)', sortOrder: 2 },
            { valueCode: 'EUR', displayValue: 'Euro (EUR)', sortOrder: 3 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'BRAND', lookupName: 'Brand', description: 'Product brands (MAP Group)', category: 'Custom',
          values: { create: [
            { valueCode: 'NIKE', displayValue: 'Nike', parentValueCode: 'FOOTWEAR', sortOrder: 0 },
            { valueCode: 'ADIDAS', displayValue: 'Adidas', parentValueCode: 'FOOTWEAR', sortOrder: 1 },
            { valueCode: 'PUMA', displayValue: 'Puma', parentValueCode: 'FOOTWEAR', sortOrder: 2 },
            { valueCode: 'NEW_BALANCE', displayValue: 'New Balance', parentValueCode: 'FOOTWEAR', sortOrder: 3 },
            { valueCode: 'ASICS', displayValue: 'Asics', parentValueCode: 'FOOTWEAR', sortOrder: 4 },
            { valueCode: 'SKECHERS', displayValue: 'Skechers', parentValueCode: 'FOOTWEAR', sortOrder: 5 },
            { valueCode: 'CONVERSE', displayValue: 'Converse', parentValueCode: 'FOOTWEAR', sortOrder: 6 },
            { valueCode: 'VANS', displayValue: 'Vans', parentValueCode: 'FOOTWEAR', sortOrder: 7 },
            { valueCode: 'REEBOK', displayValue: 'Reebok', parentValueCode: 'FOOTWEAR', sortOrder: 8 },
            { valueCode: 'UNDER_ARMOUR', displayValue: 'Under Armour', parentValueCode: 'FOOTWEAR', sortOrder: 9 },
            { valueCode: 'TIMBERLAND', displayValue: 'Timberland', parentValueCode: 'FOOTWEAR', sortOrder: 10 },
            { valueCode: 'COLUMBIA', displayValue: 'Columbia', parentValueCode: 'FOOTWEAR', sortOrder: 11 },
            { valueCode: 'ZARA', displayValue: 'Zara', parentValueCode: 'APPAREL', sortOrder: 12 },
            { valueCode: 'HM', displayValue: 'H&M', parentValueCode: 'APPAREL', sortOrder: 13 },
            { valueCode: 'UNIQLO', displayValue: 'Uniqlo', parentValueCode: 'APPAREL', sortOrder: 14 },
            { valueCode: 'STARBUCKS', displayValue: 'Starbucks', parentValueCode: 'FOOD_BEVERAGE', sortOrder: 15 },
            { valueCode: 'PIZZA_HUT', displayValue: 'Pizza Hut', parentValueCode: 'FOOD_BEVERAGE', sortOrder: 16 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'COLOR', lookupName: 'Color', description: 'Common product colors', category: 'Custom',
          values: { create: [
            { valueCode: 'BLACK', displayValue: 'Black', sortOrder: 0 },
            { valueCode: 'WHITE', displayValue: 'White', sortOrder: 1 },
            { valueCode: 'RED', displayValue: 'Red', sortOrder: 2 },
            { valueCode: 'BLUE', displayValue: 'Blue', sortOrder: 3 },
            { valueCode: 'GREEN', displayValue: 'Green', sortOrder: 4 },
            { valueCode: 'GREY', displayValue: 'Grey', sortOrder: 5 },
            { valueCode: 'NAVY', displayValue: 'Navy', sortOrder: 6 },
            { valueCode: 'PINK', displayValue: 'Pink', sortOrder: 7 },
            { valueCode: 'BROWN', displayValue: 'Brown', sortOrder: 8 },
            { valueCode: 'BEIGE', displayValue: 'Beige', sortOrder: 9 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'SIZE_SHOES', lookupName: 'Size (Shoes)', description: 'Shoe sizes (EU)', category: 'Custom',
          values: { create: [
            { valueCode: '38', displayValue: '38', parentValueCode: 'FOOTWEAR', sortOrder: 0 },
            { valueCode: '39', displayValue: '39', parentValueCode: 'FOOTWEAR', sortOrder: 1 },
            { valueCode: '40', displayValue: '40', parentValueCode: 'FOOTWEAR', sortOrder: 2 },
            { valueCode: '41', displayValue: '41', parentValueCode: 'FOOTWEAR', sortOrder: 3 },
            { valueCode: '42', displayValue: '42', parentValueCode: 'FOOTWEAR', sortOrder: 4 },
            { valueCode: '43', displayValue: '43', parentValueCode: 'FOOTWEAR', sortOrder: 5 },
            { valueCode: '44', displayValue: '44', parentValueCode: 'FOOTWEAR', sortOrder: 6 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'SIZE_APPAREL', lookupName: 'Size (Apparel)', description: 'Apparel sizes (letter)', category: 'Custom',
          values: { create: [
            { valueCode: 'XS', displayValue: 'XS', parentValueCode: 'APPAREL', sortOrder: 0 },
            { valueCode: 'S', displayValue: 'S', parentValueCode: 'APPAREL', sortOrder: 1 },
            { valueCode: 'M', displayValue: 'M', parentValueCode: 'APPAREL', sortOrder: 2 },
            { valueCode: 'L', displayValue: 'L', parentValueCode: 'APPAREL', sortOrder: 3 },
            { valueCode: 'XL', displayValue: 'XL', parentValueCode: 'APPAREL', sortOrder: 4 },
            { valueCode: 'XXL', displayValue: 'XXL', parentValueCode: 'APPAREL', sortOrder: 5 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'GENDER', lookupName: 'Gender', description: 'Gender options', category: 'System',
          values: { create: [
            { valueCode: 'MALE', displayValue: 'Male', sortOrder: 0 },
            { valueCode: 'FEMALE', displayValue: 'Female', sortOrder: 1 },
            { valueCode: 'OTHER', displayValue: 'Other', sortOrder: 2 },
          ] },
        },
      }),
      db.lookupMaster.create({
        data: {
          lookupCode: 'EMPLOYEE_STATUS', lookupName: 'Employee Status', description: 'Employment status', category: 'Custom',
          values: { create: [
            { valueCode: 'ACTIVE', displayValue: 'Active', sortOrder: 0 },
            { valueCode: 'ON_LEAVE', displayValue: 'On Leave', sortOrder: 1 },
            { valueCode: 'PROBATION', displayValue: 'Probation', sortOrder: 2 },
            { valueCode: 'RESIGNED', displayValue: 'Resigned', sortOrder: 3 },
          ] },
        },
      }),
    ]);

    // ============================================================
    // 8. CREATE ROLE PERMISSIONS (Stibo granular permissions)
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

    // API Manager - Read + export + import for API modules
    await db.rolePermission.createMany({
      data: modules.map((m) => ({
        roleId: roleApiManager.id, moduleId: m.id, companyId: companyMAPI.id,
        canRead: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false,
        canExport: true, canImport: true, canBulkUpdate: false,
      })),
    });

    // SFTP Manager - Read + export + import
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

    // Per-company Company Admin roles — full permissions for their company
    for (const [role, comp] of [
      [roleCompanyAdminMAPI, companyMAPI], [roleCompanyAdminMAPA, companyMAPA],
      [roleCompanyAdminMBA, companyMBA], [roleCompanyAdminMAPD, companyMAPD],
      [roleCompanyAdminMAPP, companyMAPP], [roleCompanyAdminMAPL, companyMAPL],
    ] as const) {
      await db.rolePermission.createMany({
        data: modules.map((m) => ({
          roleId: role.id, moduleId: m.id, companyId: comp.id,
          canRead: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true,
          canExport: true, canImport: true, canBulkUpdate: true,
        })),
      });
    }

    // Data Steward per company (MAPA, MBA)
    for (const [role, comp] of [
      [roleStewardMAPA, companyMAPA], [roleStewardMBA, companyMBA],
    ] as const) {
      await db.rolePermission.createMany({
        data: modules.map((m) => ({
          roleId: role.id, moduleId: m.id, companyId: comp.id,
          canRead: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false,
          canExport: true, canImport: false, canBulkUpdate: true,
        })),
      });
    }

    // ============================================================
    // 8b. LINK SELECT FIELDS TO LOOKUP MASTERS
    // ============================================================
    const lookupMasters = await db.lookupMaster.findMany();
    const lookupByCode: Record<string, string> = {};
    for (const lm of lookupMasters) {
      lookupByCode[lm.lookupCode] = lm.id;
    }

    const fieldLookupUpdates: Array<{ fieldCode: string; lookupCode: string }> = [
      { fieldCode: 'category', lookupCode: 'CATEGORY' },
      { fieldCode: 'sub_category', lookupCode: 'SUB_CATEGORY' },
      { fieldCode: 'uom', lookupCode: 'UOM' },
      { fieldCode: 'tags', lookupCode: 'ARTICLE_TAGS' },
      { fieldCode: 'department', lookupCode: 'DEPARTMENT' },
      { fieldCode: 'status', lookupCode: 'BUDGET_STATUS' },
      { fieldCode: 'asset_type', lookupCode: 'ASSET_TYPE' },
      { fieldCode: 'condition', lookupCode: 'ASSET_CONDITION' },
      { fieldCode: 'region', lookupCode: 'REGION' },
      { fieldCode: 'store_type', lookupCode: 'STORE_TYPE' },
      { fieldCode: 'supplier_type', lookupCode: 'SUPPLIER_TYPE' },
      { fieldCode: 'payment_terms', lookupCode: 'PAYMENT_TERMS' },
      { fieldCode: 'price_type', lookupCode: 'PRICE_TYPE' },
      { fieldCode: 'promo_type', lookupCode: 'PROMO_TYPE' },
      { fieldCode: 'discount_type', lookupCode: 'DISCOUNT_TYPE' },
      { fieldCode: 'membership_tier', lookupCode: 'MEMBERSHIP_TIER' },
      { fieldCode: 'gender', lookupCode: 'GENDER' },
    ];

    for (const { fieldCode, lookupCode } of fieldLookupUpdates) {
      const lookupId = lookupByCode[lookupCode];
      if (!lookupId) {
        console.warn(`Lookup ${lookupCode} not found, skipping field ${fieldCode}`);
        continue;
      }
      await db.metaField.updateMany({ where: { fieldCode }, data: { lookupId } });
    }

    // ============================================================
    // 9. CREATE SAMPLE HIERARCHIES (3 hierarchies)
    // ============================================================
    // Product Category Hierarchy
    const hierarchyProduct = await db.hierarchyModel.create({
      data: {
        moduleId: moduleCategory.id, hierarchyName: 'Product Category Hierarchy',
        hierarchyType: 'CLASSIFICATION', description: 'Product taxonomy hierarchy for MAP retail',
      },
    });

    const nodeFootwear = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyProduct.id, nodeLabel: 'Footwear', materializedPath: '', depthLevel: 0, sortOrder: 0 } });
    const nodeApparel = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyProduct.id, nodeLabel: 'Apparel', materializedPath: '', depthLevel: 0, sortOrder: 1 } });
    const nodeAccessories = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyProduct.id, nodeLabel: 'Accessories', materializedPath: '', depthLevel: 0, sortOrder: 2 } });
    const nodeSports = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyProduct.id, nodeLabel: 'Sports Equipment', materializedPath: '', depthLevel: 0, sortOrder: 3 } });
    const nodeFnB = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyProduct.id, nodeLabel: 'Food & Beverage', materializedPath: '', depthLevel: 0, sortOrder: 4 } });

    await db.hierarchyNode.createMany({ data: [
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeFootwear.id, nodeLabel: 'Running Shoes', materializedPath: nodeFootwear.id, depthLevel: 1, sortOrder: 0 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeFootwear.id, nodeLabel: 'Basketball Shoes', materializedPath: nodeFootwear.id, depthLevel: 1, sortOrder: 1 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeFootwear.id, nodeLabel: 'Casual Sneakers', materializedPath: nodeFootwear.id, depthLevel: 1, sortOrder: 2 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeFootwear.id, nodeLabel: 'Boots', materializedPath: nodeFootwear.id, depthLevel: 1, sortOrder: 3 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeApparel.id, nodeLabel: 'T-Shirts', materializedPath: nodeApparel.id, depthLevel: 1, sortOrder: 0 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeApparel.id, nodeLabel: 'Jackets', materializedPath: nodeApparel.id, depthLevel: 1, sortOrder: 1 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeApparel.id, nodeLabel: 'Pants', materializedPath: nodeApparel.id, depthLevel: 1, sortOrder: 2 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeAccessories.id, nodeLabel: 'Bags', materializedPath: nodeAccessories.id, depthLevel: 1, sortOrder: 0 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeAccessories.id, nodeLabel: 'Watches', materializedPath: nodeAccessories.id, depthLevel: 1, sortOrder: 1 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeSports.id, nodeLabel: 'Basketball', materializedPath: nodeSports.id, depthLevel: 1, sortOrder: 0 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeSports.id, nodeLabel: 'Gym Equipment', materializedPath: nodeSports.id, depthLevel: 1, sortOrder: 1 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeFnB.id, nodeLabel: 'Coffee & Beverages', materializedPath: nodeFnB.id, depthLevel: 1, sortOrder: 0 },
      { hierarchyId: hierarchyProduct.id, parentNodeId: nodeFnB.id, nodeLabel: 'Food', materializedPath: nodeFnB.id, depthLevel: 1, sortOrder: 1 },
    ] });

    // Geographic Hierarchy
    const hierarchyGeo = await db.hierarchyModel.create({
      data: {
        moduleId: moduleStore.id, hierarchyName: 'Geographic Hierarchy',
        hierarchyType: 'GEO', description: 'Geographic organization of stores across Indonesia',
      },
    });

    const nodeIndonesia = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyGeo.id, nodeLabel: 'Indonesia', materializedPath: '', depthLevel: 0, sortOrder: 0 } });
    const nodeJava = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyGeo.id, parentNodeId: nodeIndonesia.id, nodeLabel: 'Java', materializedPath: nodeIndonesia.id, depthLevel: 1, sortOrder: 0 } });
    const nodeSumatra = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyGeo.id, parentNodeId: nodeIndonesia.id, nodeLabel: 'Sumatra', materializedPath: nodeIndonesia.id, depthLevel: 1, sortOrder: 1 } });
    const nodeSulawesi = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyGeo.id, parentNodeId: nodeIndonesia.id, nodeLabel: 'Sulawesi', materializedPath: nodeIndonesia.id, depthLevel: 1, sortOrder: 2 } });
    const nodeBaliNT = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyGeo.id, parentNodeId: nodeIndonesia.id, nodeLabel: 'Bali & Nusa Tenggara', materializedPath: nodeIndonesia.id, depthLevel: 1, sortOrder: 3 } });

    await db.hierarchyNode.createMany({ data: [
      { hierarchyId: hierarchyGeo.id, parentNodeId: nodeJava.id, nodeLabel: 'DKI Jakarta', materializedPath: `${nodeIndonesia.id}/${nodeJava.id}`, depthLevel: 2, sortOrder: 0 },
      { hierarchyId: hierarchyGeo.id, parentNodeId: nodeJava.id, nodeLabel: 'West Java', materializedPath: `${nodeIndonesia.id}/${nodeJava.id}`, depthLevel: 2, sortOrder: 1 },
      { hierarchyId: hierarchyGeo.id, parentNodeId: nodeJava.id, nodeLabel: 'Central Java', materializedPath: `${nodeIndonesia.id}/${nodeJava.id}`, depthLevel: 2, sortOrder: 2 },
      { hierarchyId: hierarchyGeo.id, parentNodeId: nodeJava.id, nodeLabel: 'East Java', materializedPath: `${nodeIndonesia.id}/${nodeJava.id}`, depthLevel: 2, sortOrder: 3 },
      { hierarchyId: hierarchyGeo.id, parentNodeId: nodeSumatra.id, nodeLabel: 'North Sumatra', materializedPath: `${nodeIndonesia.id}/${nodeSumatra.id}`, depthLevel: 2, sortOrder: 0 },
      { hierarchyId: hierarchyGeo.id, parentNodeId: nodeSumatra.id, nodeLabel: 'South Sumatra', materializedPath: `${nodeIndonesia.id}/${nodeSumatra.id}`, depthLevel: 2, sortOrder: 1 },
      { hierarchyId: hierarchyGeo.id, parentNodeId: nodeSulawesi.id, nodeLabel: 'South Sulawesi', materializedPath: `${nodeIndonesia.id}/${nodeSulawesi.id}`, depthLevel: 2, sortOrder: 0 },
    ] });

    // Organization Hierarchy
    const hierarchyOrg = await db.hierarchyModel.create({
      data: {
        moduleId: moduleEmployee.id, hierarchyName: 'Organization Hierarchy',
        hierarchyType: 'ORG', description: 'MAP Group organizational structure',
      },
    });

    const nodeMAPGroup = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyOrg.id, nodeLabel: 'MAP Group', materializedPath: '', depthLevel: 0, sortOrder: 0 } });
    const nodeMAPIDiv = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMAPGroup.id, nodeLabel: 'MAPI — Retail Division', materializedPath: nodeMAPGroup.id, depthLevel: 1, sortOrder: 0 } });
    const nodeMAPADiv = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMAPGroup.id, nodeLabel: 'MAPA — Sports & Lifestyle', materializedPath: nodeMAPGroup.id, depthLevel: 1, sortOrder: 1 } });
    const nodeMBADiv = await db.hierarchyNode.create({ data: { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMAPGroup.id, nodeLabel: 'MBA — Food & Beverage', materializedPath: nodeMAPGroup.id, depthLevel: 1, sortOrder: 2 } });

    await db.hierarchyNode.createMany({ data: [
      { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMAPIDiv.id, nodeLabel: 'Store Operations', materializedPath: `${nodeMAPGroup.id}/${nodeMAPIDiv.id}`, depthLevel: 2, sortOrder: 0 },
      { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMAPIDiv.id, nodeLabel: 'Merchandising', materializedPath: `${nodeMAPGroup.id}/${nodeMAPIDiv.id}`, depthLevel: 2, sortOrder: 1 },
      { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMAPADiv.id, nodeLabel: 'Nike Store Ops', materializedPath: `${nodeMAPGroup.id}/${nodeMAPADiv.id}`, depthLevel: 2, sortOrder: 0 },
      { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMAPADiv.id, nodeLabel: 'Adidas Store Ops', materializedPath: `${nodeMAPGroup.id}/${nodeMAPADiv.id}`, depthLevel: 2, sortOrder: 1 },
      { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMBADiv.id, nodeLabel: 'Starbucks Ops', materializedPath: `${nodeMAPGroup.id}/${nodeMBADiv.id}`, depthLevel: 2, sortOrder: 0 },
      { hierarchyId: hierarchyOrg.id, parentNodeId: nodeMBADiv.id, nodeLabel: 'Pizza Hut Ops', materializedPath: `${nodeMAPGroup.id}/${nodeMBADiv.id}`, depthLevel: 2, sortOrder: 1 },
    ] });

    // ============================================================
    // 10. CREATE DOCUMENTATION SEED DATA
    // ============================================================
    await Promise.all([
      db.documentation.create({
        data: {
          title: 'Getting Started with MAA BTOOL', slug: 'getting-started',
          content: `# Getting Started with MAA BTOOL\n\nWelcome to MAA BTOOL Enterprise Master Data Management system. This guide will help you get started with the platform.\n\n## Prerequisites\n- Valid user account with assigned role\n- Access to the MAPI network\n\n## First Steps\n1. **Login** - Use your credentials to access the system\n2. **Explore Modules** - Navigate to the Modules page to see available data modules\n3. **Browse Records** - Select a module to view existing master data records\n4. **Create Records** - Use the Create button to add new master data entries\n\n## User Roles\n- **Super Admin**: Full access to all features\n- **Administrator**: Read, create, edit, and approve records\n- **Editor**: Create and edit records\n- **Viewer**: Read-only access\n- **Data Steward**: Manage data quality and documentation\n- **API Manager**: Manage API keys\n- **SFTP Manager**: Manage SFTP configurations\n- **Approver**: Review and approve records\n\n## Need Help?\nContact your system administrator or check the FAQ section.`,
          category: 'GETTING_STARTED', tags: 'getting-started,onboarding,welcome', authorId: userStewardMAPI.id, isPublished: true, viewCount: 142, sortOrder: 1,
        },
      }),
      db.documentation.create({
        data: {
          title: 'How to Create Master Data', slug: 'how-to-create-master-data',
          content: `# How to Create Master Data\n\nThis guide walks you through creating new master data records in MAA BTOOL.\n\n## Step 1: Select a Module\nNavigate to **Data Records** and select the module you want to create data for.\n\n## Step 2: Click Create\nClick the **Create** button to open the record form.\n\n## Step 3: Fill in Required Fields\nFields marked with a red asterisk (*) are required.\n\n## Step 4: Submit\nClick **Save as Draft** or **Submit for Review** depending on your workflow.`,
          category: 'HOW_TO', tags: 'create,data,records,tutorial', authorId: userStewardMAPI.id, isPublished: true, viewCount: 89, sortOrder: 2,
        },
      }),
      db.documentation.create({
        data: {
          title: 'API Integration Guide', slug: 'api-integration-guide',
          content: `# API Integration Guide\n\nMAA BTOOL provides a RESTful API for integrating with external systems.\n\n## Authentication\nAll API requests require a Bearer token in the Authorization header.\n\n## Available Endpoints\n- \`GET /api/modules\` - List all modules\n- \`GET /api/records?moduleId=xxx\` - List records\n- \`POST /api/records\` - Create record\n- \`PUT /api/records?action=update\` - Update record`,
          category: 'API_DOCS', tags: 'api,integration,rest', authorId: userStewardMAPI.id, isPublished: true, viewCount: 67, sortOrder: 3,
        },
      }),
      db.documentation.create({
        data: {
          title: 'SFTP Setup Tutorial', slug: 'sftp-setup-tutorial',
          content: `# SFTP Setup Tutorial\n\nLearn how to configure SFTP connections for automated data synchronization.`,
          category: 'HOW_TO', tags: 'sftp,setup,tutorial', authorId: userStewardMAPI.id, isPublished: true, viewCount: 34, sortOrder: 4,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Best Practices for Data Quality', slug: 'best-practices-data-quality',
          content: `# Best Practices for Data Quality\n\nMaintaining high-quality master data is critical for business operations.`,
          category: 'BEST_PRACTICES', tags: 'data-quality,best-practices', authorId: userStewardMAPI.id, isPublished: true, viewCount: 56, sortOrder: 5,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Frequently Asked Questions', slug: 'frequently-asked-questions',
          content: `# Frequently Asked Questions\n\n## General\n\n**Q: What is MAA BTOOL?**\nA: MAA BTOOL is the Enterprise MDM system for the MAPI Group.\n\n**Q: How do I get an account?**\nA: Contact your system administrator.`,
          category: 'FAQ', tags: 'faq,questions,help', authorId: userStewardMAPI.id, isPublished: true, viewCount: 203, sortOrder: 6,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Approval Workflow Guide', slug: 'approval-workflow-guide',
          content: `# Approval Workflow Guide\n\nUnderstanding the record lifecycle and approval process in MAA BTOOL.`,
          category: 'HOW_TO', tags: 'approval,workflow,process', authorId: userStewardMAPI.id, isPublished: true, viewCount: 45, sortOrder: 7,
        },
      }),
      db.documentation.create({
        data: {
          title: 'Bulk Import/Export Guide', slug: 'bulk-import-export-guide',
          content: `# Bulk Import/Export Guide\n\nLearn how to efficiently import and export master data in bulk.`,
          category: 'HOW_TO', tags: 'bulk,import,export', authorId: userStewardMAPI.id, isPublished: true, viewCount: 38, sortOrder: 8,
        },
      }),
    ]);

    // ============================================================
    // 11. CREATE API KEYS SEED DATA
    // ============================================================
    const crypto = await import('crypto');
    const prodKeyRaw = `mapi_prod_${crypto.randomBytes(16).toString('hex')}`;
    const testKeyRaw = `mapi_test_${crypto.randomBytes(16).toString('hex')}`;

    await Promise.all([
      db.apiKey.create({
        data: {
          keyName: 'Production API Key', keyHash: crypto.createHash('sha256').update(prodKeyRaw).digest('hex'),
          keyPrefix: prodKeyRaw.substring(0, 12), companyId: companyMAPI.id, userId: userApiManager.id,
          permissions: 'READ,WRITE', rateLimit: 1000, isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      }),
      db.apiKey.create({
        data: {
          keyName: 'Testing API Key', keyHash: crypto.createHash('sha256').update(testKeyRaw).digest('hex'),
          keyPrefix: testKeyRaw.substring(0, 12), companyId: companyMAPI.id, userId: userApiManager.id,
          permissions: 'READ', rateLimit: 100, isActive: true,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    // ============================================================
    // 12. CREATE SFTP CONFIG SEED DATA
    // ============================================================
    await Promise.all([
      db.sftpConfig.create({
        data: {
          configName: 'MAPI ERP Sync', host: 'sftp.mapi-erp.internal', port: 22, username: 'mdm_sync_user',
          authType: 'PASSWORD', authCredential: 'encrypted_password_placeholder', remotePath: '/inbound/mdm',
          schedule: '0 */6 * * *', syncDirection: 'INBOUND', filePattern: '*.csv',
          moduleId: moduleArticle.id, companyId: companyMAPI.id, isActive: true,
        },
      }),
      db.sftpConfig.create({
        data: {
          configName: 'MAPA WMS Feed', host: 'sftp.mapa-wms.internal', port: 22, username: 'wms_sync_user',
          authType: 'SSH_KEY', authCredential: 'encrypted_ssh_key_placeholder', remotePath: '/sync/bidirectional',
          schedule: '0 2 * * *', syncDirection: 'BIDIRECTIONAL', filePattern: '*.xml',
          moduleId: moduleStore.id, companyId: companyMAPA.id, isActive: true,
        },
      }),
    ]);

    // ============================================================
    // 13. CREATE TENANT AI CONFIG
    // ============================================================
    await db.tenantAiConfig.create({
      data: {
        companyId: companyMAPA.id, provider: 'custom',
        apiKey: process.env.CUSTOM_AI_API_KEY || 'placeholder-replace-in-production',
        model: 'glm-5.1', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        temperature: 0.7, maxTokens: 4096, isActive: true,
      },
    });

    // ============================================================
    // 14. CREATE APP SETTINGS (Global AI Config)
    // ============================================================
    await Promise.all([
      db.appSettings.create({ data: { settingKey: 'AI_PROVIDER', settingValue: 'gemini' } }),
      db.appSettings.create({ data: { settingKey: 'AI_API_KEY', settingValue: process.env.GEMINI_API_KEY || 'placeholder-replace-in-production' } }),
      db.appSettings.create({ data: { settingKey: 'AI_MODEL', settingValue: 'gemini-2.0-flash' } }),
    ]);

    // ============================================================
    // DONE - Return summary
    // ============================================================
    return NextResponse.json({
      message: 'Database seeded successfully with MAP Group data',
      summary: {
        companies: companies.length,
        roles: allRoles.length,
        users: users.length,
        modules: modules.length,
        documentation: 8,
        apiKeys: 2,
        sftpConfigs: 2,
        hierarchies: 3,
        lookups: lookupMasters.length + 18, // approximate
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
