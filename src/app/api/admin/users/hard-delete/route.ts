// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * POST /api/admin/users/hard-delete
 *
 * Super Admin only. Permanently deletes a user and cascades cleanup of
 * related rows.
 *
 * This is IRREVERSIBLE. The frontend shows a confirmation dialog requiring
 * the user to type the target username to confirm.
 *
 * Body: { userId: string }
 * Returns: { success: true, deletedUserId, deletedUsername }
 */
export async function POST(request: NextRequest) {
  // ── Auth: require admin:write permission ──────────────────────────────────────────
  const adminPayload = getTokenFromHeaders(request.headers);
  if (!adminPayload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(adminPayload.roles, 'admin:write')) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Required: admin:write' },
      { status: 403 },
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

  // ── Refuse to delete yourself ─────────────────────────────────────────
  if (userId === adminPayload.userId) {
    return NextResponse.json(
      { error: 'Cannot delete your own account' },
      { status: 422 },
    );
  }

  // ── Load target user (for audit + safety) ─────────────────────────────
  const target = await db.sysUser.findUnique({
    where: { id: userId },
    include: {
      company: { select: { companyName: true } },
      userRoles: { include: { role: { select: { roleName: true } } } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // ── Cascade delete / reassign related rows ────────────────────────────
  try {
    await db.$transaction([
      // 1. User-role links — always safe to delete (Cascade).
      db.userRole.deleteMany({ where: { userId } }),

      // 2. Approval tickets where this user is the requester — RESTRICT FK,
      //    reassign to the admin performing the delete.
      db.approvalTicket.updateMany({
        where: { requestedById: userId },
        data: { requestedById: adminPayload.userId },
      }),
      // 3. Approval tickets where this user is the reviewer — nullable FK,
      //    set to null.
      db.approvalTicket.updateMany({
        where: { reviewedById: userId },
        data: { reviewedById: null },
      }),

      // 4. AsyncBatchJob — RESTRICT FK, reassign to admin.
      db.asyncBatchJob.updateMany({
        where: { userId },
        data: { userId: adminPayload.userId },
      }),

      // 5. DataRecord.lockedBy — nullable scalar FK, nullify.
      db.dataRecord.updateMany({
        where: { lockedBy: userId },
        data: { lockedBy: null },
      }),

      // 6. DataVersion — RESTRICT FK, reassign to admin.
      db.dataVersion.updateMany({
        where: { userId },
        data: { userId: adminPayload.userId },
      }),

      // 7. Documentation.authorId — nullable FK, nullify.
      db.documentation.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      }),

      // 8. ApiKey.userId — nullable FK, reassign to admin so the keys
      //    remain owned.
      db.apiKey.updateMany({
        where: { userId },
        data: { userId: adminPayload.userId },
      }),

      // 9. AiConversation — RESTRICT FK, reassign to admin.
      db.aiConversation.updateMany({
        where: { userId },
        data: { userId: adminPayload.userId },
      }),

      // 10. AiMessage.userId — nullable FK, nullify.
      db.aiMessage.updateMany({
        where: { userId },
        data: { userId: null },
      }),

      // 11. AuditLog.userId — nullable FK (SetNull onDelete), nullify.
      db.auditLog.updateMany({
        where: { userId },
        data: { userId: null },
      }),
    ]);

    // 12. Finally, delete the user.
    await db.sysUser.delete({ where: { id: userId } });

    // 13. Write an audit entry for the deletion itself.
    await logAudit({
      action: AuditAction.USER_DELETE,
      entityType: 'SysUser',
      entityId: userId,
      description: `Permanently deleted user "${target.username}" (${target.email})`,
      severity: 'critical',
      req: request,
    });
  } catch (err) {
    console.error('Hard-delete user error:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Failed to delete user: ${err.message}`
            : 'Failed to delete user',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    deletedUserId: userId,
    deletedUsername: target.username,
  });
}
