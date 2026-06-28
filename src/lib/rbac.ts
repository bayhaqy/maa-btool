import { type TokenPayload } from './auth';
import { db } from './db';

// ============================================================
// A. Granular Permission Types (STIBO RBAC)
// Stibo roles: Viewer, Editor, Approver, Data Steward, Administrator, System Admin
// ============================================================

export const PERMISSIONS = {
  // Data permissions
  DATA_READ: 'data:read',
  DATA_CREATE: 'data:create',
  DATA_EDIT: 'data:edit',
  DATA_DELETE: 'data:delete',
  DATA_APPROVE: 'data:approve',
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  DATA_BULK: 'data:bulk',

  // Schema permissions
  SCHEMA_READ: 'schema:read',
  SCHEMA_WRITE: 'schema:write', // Super Admin only

  // Admin permissions
  ADMIN_READ: 'admin:read',
  ADMIN_WRITE: 'admin:write', // Super Admin only

  // Audit permissions
  AUDIT_READ: 'audit:read',

  // AI permissions
  AI_READ: 'ai:read',
  AI_WRITE: 'ai:write', // Super Admin only

  // Integration permissions
  INTEGRATION_READ: 'integration:read',
  INTEGRATION_WRITE: 'integration:write', // Super Admin only

  // DAM permissions
  DAM_READ: 'dam:read',
  DAM_UPLOAD: 'dam:upload',
  DAM_DELETE: 'dam:delete',
  DAM_MANAGE: 'dam:manage',

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

// ============================================================
// B. STIBO Role-Permission Mapping
// Viewer: READ-ONLY across all accessible modules
// Editor: Can create/edit records but NOT delete/approve
// Approver: Can review and approve changes
// Data Steward: Can correct data, manage quality
// Administrator: Can configure system, manage users
// System Admin: Full access
// ============================================================

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['*'], // Full access to ALL permissions

  'Administrator': [
    'data:read', 'data:create', 'data:edit', 'data:delete', 'data:approve', 'data:export', 'data:import', 'data:bulk',
    'schema:read', 'schema:write',
    'admin:read', 'admin:write',
    'audit:read',
    'ai:read', 'ai:write',
    'dam:read', 'dam:upload', 'dam:delete', 'dam:manage',
    'doc:read', 'doc:write',
    'hierarchy:read', 'hierarchy:write',
    'bulk:read', 'bulk:write',
    'integration:read', 'integration:write',
    'api:manage', 'sftp:manage',
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
  'ADMINISTRATOR': { label: 'Administrator', description: 'Can configure system, manage users and settings', color: '#ef4444', icon: 'Settings' },
  'SYSTEM_ADMIN': { label: 'System Admin', description: 'Full unrestricted access to all features', color: '#dc2626', icon: 'Crown' },
};

// ============================================================
// C. Helper Functions
// ============================================================

/**
 * Check if any of the user's roles grant the specified permission.
 * Super Admin (*) always returns true.
 * Viewer roles are strictly read-only - no write operations allowed.
 */
export function hasPermission(roles: string[], permission: string): boolean {
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role] || [];
    if (perms.includes('*')) return true;
    if (perms.includes(permission)) return true;
  }
  return false;
}

/**
 * Check if any of the user's roles grant at least one of the specified permissions.
 */
export function hasAnyPermission(roles: string[], permissions: string[]): boolean {
  return permissions.some(p => hasPermission(roles, p));
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
  ]);
}

/**
 * Require a permission — throws an error if not granted.
 */
export function requirePermission(roles: string[], permission: string): void {
  if (!hasPermission(roles, permission)) {
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
export function checkPermission(roles: string[], permission: string): { allowed: boolean; error?: string } {
  if (!hasPermission(roles, permission)) {
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

// Check if user is Viewer only (read-only)
export function isViewerOnly(roles: string[]): boolean {
  return roles.length > 0 && roles.every(role => {
    const perms = ROLE_PERMISSIONS[role] || [];
    return perms.length > 0 && perms.every(p =>
      p === '*' || p.endsWith(':read') || p === 'doc:read' || p === 'hierarchy:read'
    );
  });
}
