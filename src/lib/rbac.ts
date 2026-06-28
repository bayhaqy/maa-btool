import { type TokenPayload } from './auth';
import { db } from './db';

// ============================================================
// A. Granular Permission Types
// ============================================================

export const PERMISSIONS = {
  // Data permissions
  DATA_READ: 'data:read',
  DATA_WRITE: 'data:write',
  DATA_DELETE: 'data:delete',
  DATA_APPROVE: 'data:approve',

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
// B. Role-Permission Mapping
// ============================================================

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['*'], // Full access to ALL permissions

  'Manager': [
    'data:read', 'data:write', 'data:delete', 'data:approve',
    'schema:read',
    'audit:read',
    'ai:read',
    'doc:read', 'doc:write',
    'hierarchy:read', 'hierarchy:write',
    'bulk:read', 'bulk:write',
  ],

  'Data Entry': [
    'data:read', 'data:write',
    'schema:read',
    'ai:read',
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
  ],

  'Doc Writer': [
    'data:read',
    'schema:read',
    'doc:read', 'doc:write',
  ],

  'API Manager': [
    'data:read',
    'integration:read', 'integration:write',
    'api:manage',
    'doc:read',
  ],

  'SFTP Manager': [
    'data:read',
    'integration:read',
    'sftp:manage',
    'doc:read',
  ],

  'AI User': [
    'data:read',
    'ai:read',
    'doc:read',
  ],
};

// ============================================================
// C. Helper Functions
// ============================================================

/**
 * Check if any of the user's roles grant the specified permission.
 * Super Admin (*) always returns true.
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
 * Require a permission — throws an error if not granted.
 * Useful in API routes where you want a guard-clause pattern.
 */
export function requirePermission(roles: string[], permission: string): void {
  if (!hasPermission(roles, permission)) {
    throw new Error(`Insufficient permissions. Required: ${permission}`);
  }
}

/**
 * Filter a list of items by permission. Returns only items where the
 * user has the permission returned by getPermission for that item.
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
 * Compatible with the existing checkAuthAndPermission pattern.
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
  action: 'read' | 'write' | 'delete' | 'approve'
): Promise<boolean> {
  // Super Admin bypasses all checks
  if (roles.includes('Super Admin')) return true;

  // Check role-level permissions
  const actionMap: Record<string, string> = {
    read: 'data:read',
    write: 'data:write',
    delete: 'data:delete',
    approve: 'data:approve',
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
      case 'write': return p.canWrite;
      case 'delete': return p.canDelete;
      case 'approve': return p.canApprove;
    }
  });
}

/**
 * Legacy-compatible helper: check auth + permission in one call.
 * Returns an error object or empty object if allowed.
 */
export function requirePermissionLegacy(roles: string[], permission: string): { allowed: boolean; error?: string } {
  if (!hasPermission(roles, permission)) {
    return { allowed: false, error: `Insufficient permissions. Required: ${permission}` };
  }
  return { allowed: true };
}

// Keep the old function name as alias for backward compatibility
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
