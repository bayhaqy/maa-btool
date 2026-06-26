import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'maa-btool-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRY = '8h';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  companyId: string;
  companyCode: string;
  roles: string[];
  /** Present only on tokens issued via impersonation. */
  impersonated?: boolean;
  /** The original Super Admin user that initiated the impersonation, if any. */
  impersonatedBy?: {
    userId: string;
    username: string;
  } | null;
}

export async function hashPassword(password: string): Promise<string> {
  try {
    return await bcrypt.hash(password, 4);
  } catch {
    // Fallback: simple hash for sandbox environments
    const crypto = await import('crypto');
    return 'sha256:' + crypto.createHash('sha256').update(password).digest('hex');
  }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith('sha256:')) {
      const crypto = await import('crypto');
      const computed = 'sha256:' + crypto.createHash('sha256').update(password).digest('hex');
      return computed === hash;
    }
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function getTokenFromHeaders(headers: Headers): TokenPayload | null {
  const authHeader = headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  return verifyToken(token);
}

export function setAuthCookies(accessToken: string, refreshToken: string) {
  // This is used server-side
  return {
    'Set-Cookie': [
      `access_token=${accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${8 * 60 * 60}`,
      `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 60 * 60}`,
    ].join(', '),
  };
}

export const STATUS_DRAFT = 'DRAFT';
export const STATUS_IN_REVIEW = 'IN_REVIEW';
export const STATUS_ACTIVE = 'ACTIVE';
export const STATUS_REVISION_PENDING = 'REVISION_PENDING';
export const STATUS_REJECTED = 'REJECTED';
export const STATUS_ARCHIVED = 'ARCHIVED';

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  ACTIVE: 'Active',
  REVISION_PENDING: 'Revision Pending',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  IN_REVIEW: 'bg-amber-50 text-amber-700 border-amber-300',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  REVISION_PENDING: 'bg-sky-50 text-sky-700 border-sky-300',
  REJECTED: 'bg-red-50 text-red-700 border-red-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 border-slate-300',
};

// Valid state transitions
export const STATE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['ACTIVE', 'REJECTED', 'DRAFT'],
  ACTIVE: ['REVISION_PENDING', 'ARCHIVED'],
  REVISION_PENDING: ['IN_REVIEW', 'ACTIVE'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(currentStatus: string, targetStatus: string): boolean {
  return STATE_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

/**
 * Get a user's full permissions including module-level access and allowed pages.
 * @param userId - The user's ID
 * @returns Object with modules, allowedPages, and isSuperAdmin
 */
export async function getUserPermissions(userId: string): Promise<{
  modules: Array<{
    moduleId: string;
    moduleCode: string;
    moduleName: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canApprove: boolean;
  }>;
  allowedPages: string[];
  isSuperAdmin: boolean;
}> {
  // Get user with roles
  const user = await db.sysUser.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!user) {
    return { modules: [], allowedPages: [], isSuperAdmin: false };
  }

  const roleNames = user.userRoles.map(ur => ur.role.roleName);
  const isSA = roleNames.includes('Super Admin');

  // Get all active modules
  const modules = await db.metaModule.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  // Get role-level permissions for each module
  const roleIds = user.userRoles.map(ur => ur.roleId);
  const rolePermissions = await db.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
  });

  // Build module permissions
  const modulePerms = modules.map(mod => {
    const perms = rolePermissions.filter(rp => rp.moduleId === mod.id);
    const hasExplicitPerms = perms.length > 0;

    // If Super Admin or no explicit permissions set, derive from role
    if (isSA) {
      return {
        moduleId: mod.id,
        moduleCode: mod.moduleCode,
        moduleName: mod.moduleName,
        canRead: true,
        canWrite: true,
        canDelete: true,
        canApprove: true,
      };
    }

    if (!hasExplicitPerms) {
      // No explicit permissions - derive from role defaults
      const canRead = roleNames.some(r =>
        ['Manager', 'Data Entry', 'Viewer', 'Doc Writer', 'API Manager', 'SFTP Manager', 'AI User'].includes(r)
      );
      const canWrite = roleNames.some(r => ['Manager', 'Data Entry'].includes(r));
      return {
        moduleId: mod.id,
        moduleCode: mod.moduleCode,
        moduleName: mod.moduleName,
        canRead,
        canWrite,
        canDelete: roleNames.includes('Manager'),
        canApprove: roleNames.includes('Manager'),
      };
    }

    // Use explicit permissions (OR across all roles)
    return {
      moduleId: mod.id,
      moduleCode: mod.moduleCode,
      moduleName: mod.moduleName,
      canRead: perms.some(p => p.canRead),
      canWrite: perms.some(p => p.canWrite),
      canDelete: perms.some(p => p.canDelete),
      canApprove: perms.some(p => p.canApprove),
    };
  });

  // Determine allowed pages based on roles
  const allowedPages: string[] = ['dashboard'];
  if (isSA || roleNames.some(r => ['Manager', 'Data Entry', 'Viewer'].includes(r))) {
    allowedPages.push('modules', 'records', 'workflow', 'hierarchy', 'audit', 'bulk-import');
  }
  if (isSA || roleNames.includes('Doc Writer')) {
    allowedPages.push('documentation');
  }
  if (isSA || roleNames.includes('API Manager')) {
    allowedPages.push('api-management');
  }
  if (isSA) {
    allowedPages.push('admin', 'settings', 'about');
  }
  if (isSA || roleNames.includes('AI User')) {
    allowedPages.push('ai-assistant');
  }

  return {
    modules: modulePerms,
    allowedPages,
    isSuperAdmin: isSA,
  };
}
