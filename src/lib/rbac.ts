import { type TokenPayload } from './auth';
import { db } from './db';

// ============================================================
// A. Granular Permission Types (STIBO RBAC — Privilege Rules)
// Stibo terminology:
//   "User Group" = Role (UI term remains "Role" for familiarity)
//   "Privilege Rule" = Permission
//   "Account" = Company/Tenant
//   "Action Set" = Permission category
// Stibo roles: Viewer, Editor, Approver, Data Steward, Company Admin, Administrator, System Admin
// ============================================================

export const PERMISSIONS = {
  // Data permissions (Action Set: Data)
  DATA_READ: 'data:read',
  DATA_CREATE: 'data:create',
  DATA_EDIT: 'data:edit',
  DATA_DELETE: 'data:delete',
  DATA_APPROVE: 'data:approve',
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  DATA_BULK: 'data:bulk',

  // Schema permissions (Action Set: Schema)
  SCHEMA_READ: 'schema:read',
  SCHEMA_WRITE: 'schema:write', // Super Admin only

  // Admin permissions (Action Set: Admin)
  ADMIN_READ: 'admin:read',
  ADMIN_WRITE: 'admin:write', // Super Admin only

  // Audit permissions (Action Set: Audit)
  AUDIT_READ: 'audit:read',

  // AI permissions (Action Set: AI)
  AI_READ: 'ai:read',
  AI_WRITE: 'ai:write', // Super Admin + Company Admin (within own tenant)
  AI_CONFIG_VIEW: 'ai:config:view',  // View company-scoped AI config
  AI_CONFIG_EDIT: 'ai:config:edit', // Edit company-scoped AI config

  // Integration permissions (Action Set: Integration)
  INTEGRATION_READ: 'integration:read',
  INTEGRATION_WRITE: 'integration:write', // Super Admin only

  // DAM permissions (Action Set: Digital Assets)
  DAM_READ: 'dam:read',
  DAM_UPLOAD: 'dam:upload',
  DAM_DELETE: 'dam:delete',
  DAM_MANAGE: 'dam:manage',

  // Tenant management permissions (Action Set: Tenant/Account)
  TENANT_READ: 'tenant:read',       // View company settings, branding, onboarding status
  TENANT_MANAGE: 'tenant:manage',   // Manage company settings, branding, onboarding
  TENANT_USERS: 'tenant:users',     // Manage users within own company
  TENANT_ROLES: 'tenant:roles',     // Manage roles within own company

  // Legacy compatibility
  DOC_READ: 'doc:read',
  DOC_WRITE: 'doc:write',
  HIERARCHY_READ: 'hierarchy:read',
  HIERARCHY_WRITE: 'hierarchy:write',
  BULK_READ: 'bulk:read',
  BULK_WRITE: 'bulk:write',
  API_MANAGE: 'api:manage',
  SFTP_MANAGE: 'sftp:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Stibo terminology mapping for UI reference
export const STIBO_TERMS = {
  ROLE: 'User Group',       // Display: "Role (User Group)"
  PERMISSION: 'Privilege Rule',
  COMPANY: 'Account',
  PERMISSION_CATEGORY: 'Action Set',
} as const;

// ============================================================
// B. STIBO Role-Permission Mapping
// Viewer: READ-ONLY across all accessible modules
// Editor: Can create/edit records but NOT delete/approve
// Approver: Can review and approve changes
// Data Steward: Can correct data, manage quality
// Company Admin: Can manage users/roles/AI within own company (Account) only
// Administrator: Can configure system, manage users
// System Admin: Full access
// ============================================================

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['*'], // Full access to ALL permissions (System Admin)

  'Administrator': [
    'data:read', 'data:create', 'data:edit', 'data:delete', 'data:approve', 'data:export', 'data:import', 'data:bulk',
    'schema:read', 'schema:write',
    'admin:read', 'admin:write',
    'audit:read',
    'ai:read', 'ai:write', 'ai:config:view', 'ai:config:edit',
    'dam:read', 'dam:upload', 'dam:delete', 'dam:manage',
    'doc:read', 'doc:write',
    'hierarchy:read', 'hierarchy:write',
    'bulk:read', 'bulk:write',
    'integration:read', 'integration:write',
    'api:manage', 'sftp:manage',
    'tenant:read', 'tenant:manage',
  ],

  // Company Admin: manages users/roles/AI within their own company/tenant only.
  // Cannot manage other companies, system-wide settings, or create/delete companies.
  'Company Admin': [
    'data:read', 'data:create', 'data:edit', 'data:delete', 'data:approve', 'data:export', 'data:import', 'data:bulk',
    'schema:read',
    'audit:read',
    'ai:read', 'ai:write', 'ai:config:view', 'ai:config:edit',
    'dam:read', 'dam:upload', 'dam:delete', 'dam:manage',
    'doc:read', 'doc:write',
    'hierarchy:read', 'hierarchy:write',
    'bulk:read', 'bulk:write',
    // Tenant-scoped: own company only (enforced by hasPermission context)
    'tenant:read', 'tenant:manage', 'tenant:users', 'tenant:roles',
  ],

  'Data Steward': [
    'data:read', 'data:create', 'data:edit', 'data:delete', 'data:approve', 'data:export',
    'schema:read',
    'audit:read',
    'ai:read',
    'dam:read', 'dam:upload', 'dam:delete',
    'doc:read', 'doc:write',
    'hierarchy:read', 'hierarchy:write',
    'bulk:read', 'bulk:write',
  ],

  'Approver': [
    'data:read', 'data:edit', 'data:approve', 'data:export',
    'schema:read',
    'audit:read',
    'ai:read',
    'dam:read', 'dam:upload',
    'doc:read',
    'hierarchy:read',
    'bulk:read',
  ],

  'Editor': [
    'data:read', 'data:create', 'data:edit', 'data:export',
    'schema:read',
    'ai:read',
    'dam:read', 'dam:upload',
    'doc:read',
    'hierarchy:read',
    'bulk:read', 'bulk:write',
  ],

  'Viewer': [
    'data:read',
    'schema:read',
    'audit:read',
    'doc:read',
    'hierarchy:read',
    'dam:read',
    'ai:read',
  ],

  'API Manager': [
    'data:read', 'data:export',
    'integration:read', 'integration:write',
    'api:manage',
    'doc:read',
  ],

  'SFTP Manager': [
    'data:read', 'data:import', 'data:export',
    'integration:read',
    'sftp:manage',
    'doc:read',
  ],
};

// STIBO: Role type descriptions for UI
export const ROLE_TYPE_INFO: Record<string, { label: string; description: string; color: string; icon: string }> = {
  'VIEWER': { label: 'Viewer', description: 'Read-only access to data and reports', color: '#6b7280', icon: 'Eye' },
  'EDITOR': { label: 'Editor', description: 'Can create and edit records, cannot delete or approve', color: '#3b82f6', icon: 'Pencil' },
  'APPROVER': { label: 'Approver', description: 'Can review and approve record changes', color: '#8b5cf6', icon: 'CheckCircle' },
  'DATA_STEWARD': { label: 'Data Steward', description: 'Can correct data, manage quality and stewardship', color: '#f59e0b', icon: 'Shield' },
  'COMPANY_ADMIN': { label: 'Company Admin', description: 'Manage users, roles, and AI config within own company (Account)', color: '#0ea5e9', icon: 'Building2' },
  'ADMINISTRATOR': { label: 'Administrator', description: 'Can configure system, manage users and settings', color: '#ef4444', icon: 'Settings' },
  'SYSTEM_ADMIN': { label: 'System Admin', description: 'Full unrestricted access to all features', color: '#dc2626', icon: 'Crown' },
  'API': { label: 'API Manager', description: 'Can manage API keys and integration configurations', color: '#10b981', icon: 'Globe' },
  'SFTP': { label: 'SFTP Manager', description: 'Can manage SFTP configurations and sync schedules', color: '#6366f1', icon: 'Globe' },
};

// ============================================================
// C. Helper Functions
// ============================================================

/** Context object for company-aware permission checks */
export interface PermissionContext {
  userCompanyId?: string;
  targetCompanyId?: string;
}

/**
 * Check if any of the user's roles grant the specified permission.
 * Super Admin (*) always returns true.
 * Viewer roles are strictly read-only - no write operations allowed.
 *
 * When a PermissionContext is provided, tenant-scoped permissions (tenant:*)
 * are additionally validated: Company Admin roles only grant tenant permissions
 * when the targetCompanyId matches the user's own company.
 */
export function hasPermission(
  roles: string[],
  permission: string,
  context?: PermissionContext,
): boolean {
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role] || [];
    if (perms.includes('*')) return true;
    if (perms.includes(permission)) {
      // Tenant-scoped permission: enforce company boundary for Company Admin
      if (permission.startsWith('tenant:') && context?.userCompanyId && context?.targetCompanyId) {
        // Super Admin bypasses company checks (handled by '*' above)
        // Company Admin can only exercise tenant permissions within their own company
        if (role === 'Company Admin' && context.userCompanyId !== context.targetCompanyId) {
          continue; // Skip — this role doesn't grant permission for this target company
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * Check if any of the user's roles grant at least one of the specified permissions.
 */
export function hasAnyPermission(
  roles: string[],
  permissions: string[],
  context?: PermissionContext,
): boolean {
  return permissions.some(p => hasPermission(roles, p, context));
}

/**
 * Check if user has write-level permission (anything beyond read).
 * Viewer users should ALWAYS return false for write operations.
 */
export function canWrite(roles: string[]): boolean {
  return hasAnyPermission(roles, [
    'data:create', 'data:edit', 'data:delete', 'data:approve',
    'schema:write', 'admin:write', 'ai:write',
    'dam:upload', 'dam:delete', 'dam:manage',
    'integration:write', 'bulk:write',
    'tenant:manage', 'tenant:users', 'tenant:roles',
  ]);
}

/**
 * Require a permission — throws an error if not granted.
 */
export function requirePermission(roles: string[], permission: string, context?: PermissionContext): void {
  if (!hasPermission(roles, permission, context)) {
    throw new Error(`Insufficient permissions. Required: ${permission}`);
  }
}

/**
 * Filter a list of items by permission.
 */
export function filterByPermission<T>(
  items: T[],
  roles: string[],
  getPermission: (item: T) => string,
): T[] {
  return items.filter(item => hasPermission(roles, getPermission(item)));
}

/**
 * Require a permission — returns an error object instead of throwing.
 */
export function checkPermission(roles: string[], permission: string, context?: PermissionContext): { allowed: boolean; error?: string } {
  if (!hasPermission(roles, permission, context)) {
    return { allowed: false, error: `Insufficient permissions. Required: ${permission}` };
  }
  return { allowed: true };
}

// Check if user can access a specific module with a specific action
export async function checkModulePermission(
  roles: string[],
  moduleId: string,
  action: 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'import' | 'bulk'
): Promise<boolean> {
  // Super Admin bypasses all checks
  if (roles.includes('Super Admin')) return true;

  // Check role-level permissions
  const actionMap: Record<string, string> = {
    read: 'data:read',
    create: 'data:create',
    edit: 'data:edit',
    delete: 'data:delete',
    approve: 'data:approve',
    export: 'data:export',
    import: 'data:import',
    bulk: 'data:bulk',
  };

  if (!hasPermission(roles, actionMap[action])) return false;

  // Check granular RolePermission for the specific module
  const roleIds = await db.sysRole.findMany({
    where: { roleName: { in: roles } },
    select: { id: true },
  });

  const permissions = await db.rolePermission.findMany({
    where: {
      roleId: { in: roleIds.map(r => r.id) },
      moduleId,
    },
  });

  if (permissions.length === 0) return true; // If no specific permissions set, allow based on role

  return permissions.some(p => {
    switch (action) {
      case 'read': return p.canRead;
      case 'create': return p.canCreate;
      case 'edit': return p.canEdit;
      case 'delete': return p.canDelete;
      case 'approve': return p.canApprove;
      case 'export': return p.canExport;
      case 'import': return p.canImport;
      case 'bulk': return p.canBulkUpdate;
    }
  });
}

/**
 * Legacy-compatible helper: check auth + permission in one call.
 */
export function requirePermissionLegacy(roles: string[], permission: string): { allowed: boolean; error?: string } {
  if (!hasPermission(roles, permission)) {
    return { allowed: false, error: `Insufficient permissions. Required: ${permission}` };
  }
  return { allowed: true };
}

export { requirePermissionLegacy as checkRequirePermission };

// Helper for API routes: get token + check permission
export function checkAuthAndPermission(
  tokenPayload: TokenPayload | null,
  permission: string
): { error?: string; status?: number } {
  if (!tokenPayload) {
    return { error: 'Unauthorized', status: 401 };
  }
  const check = requirePermissionLegacy(tokenPayload.roles, permission);
  if (!check.allowed) {
    return { error: check.error || 'Access denied', status: 403 };
  }
  return {};
}

// Check if user is Super Admin
export function isSuperAdmin(roles: string[]): boolean {
  return roles.includes('Super Admin');
}

// Check if user is Company Admin (admin of their own company, NOT necessarily Super Admin)
export function isCompanyAdmin(roles: string[]): boolean {
  return roles.includes('Company Admin');
}

// Check if user is Viewer only (read-only)
export function isViewerOnly(roles: string[]): boolean {
  return roles.length > 0 && roles.every(role => {
    const perms = ROLE_PERMISSIONS[role] || [];
    return perms.length > 0 && perms.every(p =>
      p === '*' || p.endsWith(':read') || p === 'doc:read' || p === 'hierarchy:read'
    );
  });
}

// ============================================================
// D. Tenant-Scoped Role Functions
// ============================================================

/**
 * Get tenant-scoped roles for a specific company.
 * Returns roles that belong to the given companyId PLUS any global roles
 * (isGlobal=true, companyId='SYSTEM').
 *
 * Stibo: A User Group (Role) is scoped to an Account (Company).
 * Global roles like Super Admin transcend tenant boundaries.
 */
export async function getTenantRoles(companyId: string): Promise<
  Array<{ id: string; roleName: string; roleType: string; description: string | null; isSystem: boolean; isGlobal: boolean }>
> {
  const roles = await db.sysRole.findMany({
    where: {
      OR: [
        { companyId },                          // Company-scoped roles
        { companyId: 'SYSTEM', isGlobal: true },  // Global roles (e.g. Super Admin)
      ],
    },
    orderBy: [{ isGlobal: 'desc' }, { roleName: 'asc' }],
    select: {
      id: true,
      roleName: true,
      roleType: true,
      description: true,
      isSystem: true,
      isGlobal: true,
    },
  });
  return roles;
}

/**
 * Check if a user can manage a specific tenant (Account).
 * Rules:
 *  - Super Admin can manage ANY tenant
 *  - Company Admin can manage ONLY their own tenant
 *  - All other roles: cannot manage tenants
 */
export function canManageTenant(
  companyId: string,
  userCompanyId: string,
  roles: string[],
): boolean {
  // Super Admin can manage any tenant
  if (isSuperAdmin(roles)) return true;

  // Company Admin can manage only their own tenant
  if (isCompanyAdmin(roles) && companyId === userCompanyId) return true;

  return false;
}

/**
 * Check if a user can manage users within a specific tenant.
 * Same rules as canManageTenant — Super Admin for any tenant,
 * Company Admin for their own tenant only.
 */
export function canManageTenantUsers(
  companyId: string,
  userCompanyId: string,
  roles: string[],
): boolean {
  if (isSuperAdmin(roles)) return true;
  if (isCompanyAdmin(roles) && companyId === userCompanyId) {
    return hasPermission(roles, 'tenant:users', { userCompanyId, targetCompanyId: companyId });
  }
  return false;
}

/**
 * Check if a user can manage roles within a specific tenant.
 */
export function canManageTenantRoles(
  companyId: string,
  userCompanyId: string,
  roles: string[],
): boolean {
  if (isSuperAdmin(roles)) return true;
  if (isCompanyAdmin(roles) && companyId === userCompanyId) {
    return hasPermission(roles, 'tenant:roles', { userCompanyId, targetCompanyId: companyId });
  }
  return false;
}
