import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getTokenFromHeaders,
  hashPassword,
  verifyPassword,
} from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { validateInput, sanitizeString } from '@/lib/api-security';
import { requiresReAuth } from '@/lib/session';

/**
 * POST /api/auth/change-password
 *
 * Allows the currently authenticated user to change their own password.
 * Requires:
 *   - Valid Bearer token (any authenticated user)
 *   - Body: { currentPassword: string, newPassword: string }
 *
 * Validates:
 *   - currentPassword matches the user's stored passwordHash
 *   - newPassword is at least 6 characters and differs from currentPassword
 *
 * On success, updates `SysUser.passwordHash` and writes an audit log entry.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth: any authenticated user can change their own password ───────
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: write endpoints per user ───────────────────────────
    const rl = rateLimitByCategory('write', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    // ── Re-auth check for sensitive operation ──────────────────────────
    const reAuth = requiresReAuth(tokenPayload, 'password_change');
    if (reAuth.required) {
      return NextResponse.json(
        { error: reAuth.reason || 'Re-authentication required for password change' },
        { status: 401 }
      );
    }

    // ── Parse + validate body ────────────────────────────────────────────
    let body: { currentPassword?: unknown; newPassword?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validation = validateInput(body, { currentPassword: 'string', newPassword: 'string' });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join(', ') }, { status: 400 });
    }

    const { currentPassword, newPassword } = body;

    if (typeof currentPassword !== 'string' || !currentPassword) {
      return NextResponse.json(
        { error: 'Current password is required' },
        { status: 400 }
      );
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters' },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'New password must differ from the current password' },
        { status: 400 }
      );
    }

    // ── Look up the user ─────────────────────────────────────────────────
    const user = await db.sysUser.findUnique({
      where: { id: tokenPayload.userId },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── Verify current password ──────────────────────────────────────────
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      // ── Audit: failed password change ──────────────────────────────────
      await logAudit({
        action: AuditAction.AUTH_PASSWORD_CHANGE,
        entityType: 'SysUser',
        entityId: user.id,
        description: `Failed password change attempt for user "${user.username}"`,
        severity: 'warning',
        req: request,
      });

      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // ── Hash + persist ───────────────────────────────────────────────────
    const oldHashPreview = user.passwordHash.substring(0, 10) + '...';
    const newHash = await hashPassword(newPassword);
    await db.sysUser.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // ── Audit log ────────────────────────────────────────────────────────
    await logAudit({
      action: AuditAction.AUTH_PASSWORD_CHANGE,
      entityType: 'SysUser',
      entityId: user.id,
      description: `User "${user.username}" changed their own password.`,
      oldValues: { passwordHash: oldHashPreview },
      newValues: { passwordHash: newHash.substring(0, 10) + '...' },
      severity: 'warning',
      req: request,
    });

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change-password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
