import { type TokenPayload } from './auth';
import { db } from './db';

// Role hierarchy and permissions
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['*'], // Full access
  'Manager': ['data:read', 'data:write', 'data:delete', 'data:approve', 'doc:read', 'doc:write', 'hierarchy:read', 'hierarchy:write', 'bulk:read', 'bulk:write', 'audit:read'],
  'Data Entry': ['data:read', 'data:write', 'doc:read', 'hierarchy:read', 'bulk:read', 'bulk:write', 'audit:read'],
  'Viewer': ['data:read', 'doc:read', 'hierarchy:read', 'audit:read'],
  'Doc Writer': ['doc:read', 'doc:write', 'data:read'],
  'API Manager': ['api:manage', 'data:read', 'doc:read'],
  'SFTP Manager': ['sftp:manage', 'data:read', 'doc:read'],
  'AI User': ['ai:use', 'data:read', 'doc:read'],
};

export function hasPermission(roles: string[], permission: string): boolean {
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role] || [];
    if (perms.includes('*')) return true;
    if (perms.includes(permission)) return true;
  }
  return false;
}

export function hasAnyPermission(roles: string[], permissions: string[]): boolean {
  return permissions.some(p => hasPermission(roles, p));
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

export function requirePermission(roles: string[], permission: string): { allowed: boolean; error?: string } {
  if (!hasPermission(roles, permission)) {
    return { allowed: false, error: `Insufficient permissions. Required: ${permission}` };
  }
  return { allowed: true };
}

// Helper for API routes: get token + check permission
export function checkAuthAndPermission(
  tokenPayload: TokenPayload | null,
  permission: string
): { error?: string; status?: number } {
  if (!tokenPayload) {
    return { error: 'Unauthorized', status: 401 };
  }
  const check = requirePermission(tokenPayload.roles, permission);
  if (!check.allowed) {
    return { error: check.error || 'Access denied', status: 403 };
  }
  return {};
}

// Check if user is Super Admin
export function isSuperAdmin(roles: string[]): boolean {
  return roles.includes('Super Admin');
}
