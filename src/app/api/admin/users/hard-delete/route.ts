import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';

/**
 * POST /api/admin/users/hard-delete
 *
 * Super Admin only. Permanently deletes a user and cascades cleanup of
 * related rows:
 *   - UserRole .............. deleted (Cascade)
 *   - AuditLog .............. userId nullified (SetNull)
 *   - ApprovalTicket:
 *       requestedById ....... reassigned to admin (RESTRICT)
 *       reviewedById ........ nullified (already nullable)
 *   - AsyncBatchJob ......... reassigned to admin (RESTRICT)
 *   - DataRecord.lockedBy ... nullified where locked (reassign via updateMany)
 *   - DataVersion ........... reassigned to admin (RESTRICT)
 *   - Documentation ......... authorId nullified (already nullable)
 *   - ApiKey ................ reassigned to admin (RESTRICT, nullable but keep)
 *   - AiConversation ........ reassigned to admin (RESTRICT)
 *   - AiMessage ............. userId nullified (already nullable)
 *
 * This is IRREVERSIBLE. The frontend shows a confirmation dialog requiring
 * the user to type the target username to confirm.
 *
 * Body: { userId: string }
 * Returns: { success: true, deletedUserId, deletedUsername }
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
      //    remain owned (could also nullify, but admin ownership is safer
      //    for audit purposes).
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
    await db.auditLog.create({
      data: {
        userId: adminPayload.userId,
        action: 'USER_DELETE',
        entityType: 'SysUser',
        entityId: userId,
        description: `Permanently deleted user "${target.username}" (${target.email})`,
        // metadata is stored as JSON string in some deployments; we use
        // the description for the human-readable trail.
      },
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
