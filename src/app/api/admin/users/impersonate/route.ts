import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getTokenFromHeaders,
  generateAccessToken,
  type TokenPayload,
} from '@/lib/auth';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * POST /api/admin/users/impersonate
 *
 * Super Admin only. Issues a new access token that authenticates as the
 * target user (with their roles, company, etc.) but is marked as
 * `impersonated: true` and carries the original Super Admin identity in
 * `impersonatedBy`. The frontend uses these fields to render an "Exit
 * Impersonation" banner and to restore the original session.
 *
 * Body: { userId: string }
 * Returns: { token, user } — same shape as /api/auth/login.
 */
export async function POST(request: NextRequest) {
  // ── Auth: require Super Admin ──────────────────────────────────────────
  const adminPayload = getTokenFromHeaders(request.headers);
  if (!adminPayload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!adminPayload.roles.includes('Super Admin')) {
    return NextResponse.json(
      { error: 'Forbidden — Super Admin role required' },
      { status: 403 },
    );
  }
  // Refuse nested impersonation: an already-impersonating token cannot
  // impersonate someone else.
  if (adminPayload.impersonated) {
    return NextResponse.json(
      { error: 'Cannot impersonate while already impersonating. Restore your session first.' },
      { status: 422 },
    );
  }

  // ── Rate limit: admin endpoints ────────────────────────────────────
  const rl = rateLimitByCategory('admin', adminPayload.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  const body = await request.json().catch(() => ({}));
  const { userId } = body as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // ── Load target user ──────────────────────────────────────────────────
  const target = await db.sysUser.findUnique({
    where: { id: userId },
    include: {
      company: { select: { id: true, companyCode: true, companyName: true } },
      userRoles: { include: { role: { select: { id: true, roleName: true } } } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (!target.isActive) {
    return NextResponse.json(
      { error: 'Cannot impersonate an inactive user' },
      { status: 422 },
    );
  }
  // Refuse to impersonate yourself.
  if (target.id === adminPayload.userId) {
    return NextResponse.json(
      { error: 'Cannot impersonate yourself' },
      { status: 422 },
    );
  }

  const roleNames = target.userRoles.map((ur) => ur.role.roleName);

  // ── Mint a new token marked as impersonated ───────────────────────────
  const payload: TokenPayload = {
    userId: target.id,
    username: target.username,
    email: target.email,
    companyId: target.company?.id ?? target.companyId,
    companyCode: target.company?.companyCode ?? '',
    roles: roleNames,
    impersonated: true,
    impersonatedBy: {
      userId: adminPayload.userId,
      username: adminPayload.username,
    },
  };
  const token = generateAccessToken(payload);

  // ── Audit log entry ───────────────────────────────────────────────────
  await logAudit({
    action: AuditAction.USER_IMPERSONATE,
    entityType: 'SysUser',
    entityId: target.id,
    description: `Super Admin "${adminPayload.username}" impersonated user "${target.username}" (${roleNames.join(', ') || 'no roles'})`,
    newValues: {
      targetUserId: target.id,
      targetUsername: target.username,
      targetRoles: roleNames,
    },
    severity: 'critical',
    req: request,
  });

  return NextResponse.json({
    token,
    user: {
      userId: target.id,
      username: target.username,
      email: target.email,
      companyId: payload.companyId,
      companyCode: payload.companyCode,
      roles: roleNames,
      impersonated: true,
      impersonatedBy: payload.impersonatedBy,
    },
  });
}
