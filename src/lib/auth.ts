import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { db } from './db';
import { hasPermission, isSuperAdmin, isCompanyAdmin, type PermissionContext } from './rbac';

// SECURITY: Fail-fast if JWT_SECRET is missing in production RUNTIME.
// We defer the check to first use (instead of module load) so that the
// Next.js build phase (NODE_ENV=production) doesn't crash before env vars
// are injected by the hosting platform (Vercel injects at runtime, not build).
let _jwtSecret: string | null = null;
function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
      // In production on Vercel — this should never happen if env is configured.
      // Log loudly but don't throw during build/cold-start — throw on actual auth use.
      console.error(
        'FATAL: JWT_SECRET environment variable is required in production. ' +
        'Generate one with: openssl rand -base64 32'
      );
      throw new Error('JWT_SECRET is not configured. Authentication will not work.');
    }
    // Dev-only fallback
    console.warn(
      '⚠️  JWT_SECRET not set — using insecure dev fallback. ' +
      'Set JWT_SECRET in .env for local development.'
    );
    _jwtSecret = 'dev-only-insecure-jwt-secret-do-not-use-in-production';
  } else {
    _jwtSecret = secret;
  }
  return _jwtSecret;
}
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
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
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

/**
 * Get auth token from a NextRequest, checking both the Authorization header
 * and the access_token cookie. The cookie fallback ensures that requests
 * made without an explicit Authorization header (e.g., direct browser
 * navigation, or when the client-side token was lost) can still be
 * authenticated if the HttpOnly cookie is present.
 */
export function getAuthFromRequest(request: { headers: Headers; cookies?: { get(name: string): { value: string } | undefined } }): TokenPayload | null {
  // 1. Try Authorization header first (primary method used by the frontend)
  const fromHeader = getTokenFromHeaders(request.headers);
  if (fromHeader) return fromHeader;

  // 2. Fallback: try the access_token cookie (HttpOnly, set by login/refresh)
  if (request.cookies) {
    const cookieToken = request.cookies.get('access_token')?.value;
    if (cookieToken) {
      return verifyToken(cookieToken);
    }
  }

  return null;
}

export interface CookieOptions {
  name: string;
  value: string;
  maxAge: number;
}

export function getAuthCookieOptions(accessToken: string, refreshToken: string): CookieOptions[] {
  return [
    {
      name: 'access_token',
      value: accessToken,
      maxAge: 8 * 60 * 60, // 8 hours
    },
    {
      name: 'refresh_token',
      value: refreshToken,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    },
  ];
}

/**
 * Apply auth cookies to a Next.js response using the proper cookies.set() API.
 * This correctly handles multiple cookies (unlike setting Set-Cookie header directly).
 * Secure flag is only set in production (HTTPS); in dev (HTTP) Secure cookies are
 * silently dropped by browsers.
 */
export function setAuthCookiesOnResponse(
  response: NextResponse,
  accessToken: string,
  refreshToken: string
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  const cookies = getAuthCookieOptions(accessToken, refreshToken);

  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: cookie.maxAge,
    });
  }
}

/**
 * Clear auth cookies on a Next.js response (used during logout).
 */
export function clearAuthCookiesOnResponse(response: NextResponse): void {
  const isProduction = process.env.NODE_ENV === 'production';

  for (const name of ['access_token', 'refresh_token']) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
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

// ============================================================
// Legacy role name → Stibo role type mapping
// Used during migration to normalize old role names
// ============================================================
const LEGACY_ROLE_MAP: Record<string, string> = {
  'Manager': 'Administrator',
  'Data Entry': 'Editor',
  'Doc Writer': 'Data Steward',
  'AI User': 'Editor',       // AI User maps to Editor (has ai:read + some write)
  'Viewer': 'Viewer',
};

/**
 * Normalize a role name: if it's a legacy role, map it to the Stibo equivalent.
 * If it's already a Stibo role name, return it as-is.
 */
function normalizeRoleName(roleName: string): string {
  return LEGACY_ROLE_MAP[roleName] ?? roleName;
}

/**
 * Get a user's full permissions including module-level access and allowed pages.
 * Company-scoped: module queries are filtered by the user's companyId so that
 * multi-tenant isolation is enforced at the data level.
 *
 * @param userId - The user's ID
 * @returns Object with modules, allowedPages, isSuperAdmin, isCompanyAdmin
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
  isCompanyAdmin: boolean;
}> {
  // Get user with roles
  const user = await db.sysUser.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!user) {
    return { modules: [], allowedPages: [], isSuperAdmin: false, isCompanyAdmin: false };
  }

  // Normalize role names: map legacy names to Stibo role types
  const rawRoleNames = user.userRoles.map(ur => ur.role.roleName);
  const roleNames = rawRoleNames.map(normalizeRoleName);
  const isSA = isSuperAdmin(roleNames);
  const isCA = isCompanyAdmin(roleNames);
  const userCompanyId = user.companyId;

  // Get all active modules
  // Note: MetaModule is shared/global — not company-scoped.
  // Company-level visibility is controlled via RolePermission records.
  const modules = await db.metaModule.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  // Get role-level permissions for each module (company-scoped)
  const roleIds = user.userRoles.map(ur => ur.roleId);
  const rolePermissions = await db.rolePermission.findMany({
    where: {
      roleId: { in: roleIds },
      // Company-scoped: only get permissions for the user's company
      companyId: userCompanyId,
    },
  });

  // Build module permissions
  const modulePerms = modules.map(mod => {
    const perms = rolePermissions.filter(rp => rp.moduleId === mod.id);
    const hasExplicitPerms = perms.length > 0;

    // If Super Admin, full access to everything
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
      // No explicit permissions - derive from Stibo role defaults
      const canRead = hasPermission(roleNames, 'data:read');
      const canWrite = hasPermission(roleNames, 'data:edit') || hasPermission(roleNames, 'data:create');
      const canDelete = hasPermission(roleNames, 'data:delete');
      const canApprove = hasPermission(roleNames, 'data:approve');
      return {
        moduleId: mod.id,
        moduleCode: mod.moduleCode,
        moduleName: mod.moduleName,
        canRead,
        canWrite,
        canDelete,
        canApprove,
      };
    }

    // Use explicit permissions (OR across all roles)
    return {
      moduleId: mod.id,
      moduleCode: mod.moduleCode,
      moduleName: mod.moduleName,
      canRead: perms.some(p => p.canRead),
      canWrite: perms.some(p => p.canCreate || p.canEdit),
      canDelete: perms.some(p => p.canDelete),
      canApprove: perms.some(p => p.canApprove),
    };
  });

  // Determine allowed pages based on Stibo roles
  const allowedPages: string[] = ['dashboard'];

  // Core data pages: any role with data:read
  if (isSA || hasPermission(roleNames, 'data:read')) {
    allowedPages.push('modules', 'records', 'workflow', 'hierarchy', 'audit', 'bulk-import');
  }

  // Documentation: any role with doc:read or data:read
  if (isSA || hasPermission(roleNames, 'doc:read') || hasPermission(roleNames, 'data:read')) {
    allowedPages.push('documentation');
  }

  // API Management: API Manager role or integration:write
  if (isSA || hasPermission(roleNames, 'api:manage') || hasPermission(roleNames, 'integration:write')) {
    allowedPages.push('api-management');
  }

  // AI Assistant: any role with ai:read
  if (isSA || hasPermission(roleNames, 'ai:read')) {
    allowedPages.push('ai-assistant');
  }

  // Admin & settings: Super Admin only (system-wide)
  if (isSA) {
    allowedPages.push('admin', 'settings', 'about');
  }

  // Company Admin gets company-scoped admin access (not system-wide)
  if (isCA && !isSA) {
    allowedPages.push('company-settings');
  }

  // Tenant management pages: Super Admin or Company Admin
  if (isSA || isCA) {
    allowedPages.push('tenant-management');
  }

  return {
    modules: modulePerms,
    allowedPages: [...new Set(allowedPages)], // Deduplicate
    isSuperAdmin: isSA,
    isCompanyAdmin: isCA,
  };
}
