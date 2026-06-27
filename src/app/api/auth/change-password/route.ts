import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getTokenFromHeaders,
  hashPassword,
  verifyPassword,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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
 *
 * Note: we deliberately do NOT invalidate other sessions — the existing JWT
 * remains valid until its natural expiry. If session invalidation is needed,
 * add a `tokenVersion` column and bump it here, then check it in
 * `verifyToken`.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth: any authenticated user can change their own password ───────
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      // The token pointed at a user that no longer exists.
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── Verify current password ──────────────────────────────────────────
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      // Use the same generic message as login to avoid leaking info.
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // ── Hash + persist ───────────────────────────────────────────────────
    const newHash = await hashPassword(newPassword);
    await db.sysUser.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // ── Audit log ────────────────────────────────────────────────────────
    await logAudit({
      userId: user.id,
      action: 'PASSWORD_CHANGE',
      entityType: 'SysUser',
      entityId: user.id,
      description: `User "${user.username}" changed their own password.`,
      companyId: tokenPayload.companyId,
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
