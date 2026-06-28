import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders, STATUS_ACTIVE, STATUS_REJECTED } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowHistoryEntry {
  step: number;
  userId: string;
  action: string;
  timestamp: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// GET /api/approvals?status=PENDING or ?status=all
// Supports filtering by priority, workflowType, deadlineStatus
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'data:read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // ── Rate limit: read endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING';
    const priority = searchParams.get('priority');
    const workflowType = searchParams.get('workflowType');
    const deadlineStatus = searchParams.get('deadlineStatus');

    const where: Record<string, unknown> = {};
    if (status !== 'all') {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }
    if (workflowType) {
      where.workflowType = workflowType;
    }
    if (deadlineStatus === 'overdue') {
      where.deadline = { lt: new Date().toISOString() };
      where.status = 'PENDING';
    } else if (deadlineStatus === 'upcoming') {
      const now = new Date();
      const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      where.deadline = { gte: now.toISOString(), lte: soon.toISOString() };
      where.status = 'PENDING';
    }

    const tickets = await db.approvalTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        record: {
          include: {
            module: { select: { id: true, moduleCode: true, moduleName: true } },
            company: { select: { id: true, companyCode: true, companyName: true } },
          },
        },
        requestedBy: { select: { id: true, username: true, displayName: true, email: true } },
        reviewedBy: { select: { id: true, username: true, displayName: true } },
      },
    });

    // Compute statistics
    const allPending = await db.approvalTicket.count({ where: { status: 'PENDING' } });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const approvedToday = await db.approvalTicket.count({
      where: { status: 'APPROVED', reviewedAt: { gte: todayStart.toISOString() } },
    });
    const overdueCount = await db.approvalTicket.count({
      where: {
        status: 'PENDING',
        deadline: { lt: new Date().toISOString() },
      },
    });

    // Average resolution time for approved tickets (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const resolvedTickets = await db.approvalTicket.findMany({
      where: {
        status: { in: ['APPROVED', 'REJECTED'] },
        reviewedAt: { not: null },
        createdAt: { gte: thirtyDaysAgo.toISOString() },
      },
      select: { createdAt: true, reviewedAt: true },
    });

    let avgResolutionMs = 0;
    if (resolvedTickets.length > 0) {
      const totalMs = resolvedTickets.reduce((acc, t) => {
        if (t.reviewedAt) {
          return acc + (new Date(t.reviewedAt).getTime() - new Date(t.createdAt).getTime());
        }
        return acc;
      }, 0);
      avgResolutionMs = totalMs / resolvedTickets.length;
    }
    const avgResolutionHours = Math.round(avgResolutionMs / (1000 * 60 * 60) * 10) / 10;

    return NextResponse.json({
      tickets,
      stats: {
        totalPending: allPending,
        approvedToday,
        overdue: overdueCount,
        avgResolutionHours,
      },
    });
  } catch (error) {
    console.error('Approvals GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/approvals?action=approve|reject|bulk-approve|bulk-reject|delegate|reassign
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'data:approve')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only managers and admins can approve/reject.' }, { status: 403 });
    }

    // ── Rate limit: write endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('write', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // ------- BULK APPROVE / REJECT -------
    if (action === 'bulk-approve' || action === 'bulk-reject') {
      const { ticketIds, reviewNotes } = body as { ticketIds: string[]; reviewNotes?: string };
      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        return NextResponse.json({ error: 'ticketIds array is required' }, { status: 400 });
      }

      const isApprove = action === 'bulk-approve';
      const results: { id: string; success: boolean; error?: string }[] = [];

      for (const ticketId of ticketIds) {
        try {
          const ticket = await db.approvalTicket.findUnique({
            where: { id: ticketId },
            include: { record: true },
          });

          if (!ticket) {
            results.push({ id: ticketId, success: false, error: 'Not found' });
            continue;
          }

          if (ticket.status !== 'PENDING') {
            results.push({ id: ticketId, success: false, error: 'Not PENDING' });
            continue;
          }

          // Separation of duties check
          if (ticket.requestedById === tokenPayload.userId) {
            results.push({ id: ticketId, success: false, error: 'Cannot approve own request (SoD)' });
            continue;
          }

          // Add workflow history entry
          const history = parseWorkflowHistory(ticket.workflowHistory);
          history.push({
            step: ticket.currentStep,
            userId: tokenPayload.userId,
            action: isApprove ? 'APPROVED' : 'REJECTED',
            timestamp: new Date().toISOString(),
            notes: reviewNotes || (isApprove ? 'Bulk approved' : 'Bulk rejected'),
          });

          const updateData: Record<string, unknown> = {
            status: isApprove ? 'APPROVED' : 'REJECTED',
            reviewedById: tokenPayload.userId,
            reviewNotes: reviewNotes || (isApprove ? 'Bulk approved' : 'Bulk rejected'),
            reviewedAt: new Date(),
            workflowHistory: JSON.stringify(history),
          };

          // For multi-step: check if we need to advance or complete
          if (ticket.workflowType === 'MULTI_STEP' && isApprove && ticket.currentStep < ticket.totalSteps) {
            const nextStep = ticket.currentStep + 1;
            updateData.status = 'PENDING';
            updateData.currentStep = nextStep;
            updateData.reviewedAt = null;
            updateData.reviewedById = null;
            updateData.reviewNotes = null;

            // Parse step config to get next step name
            try {
              const stepConfig = JSON.parse(ticket.stepName || '[]');
              if (Array.isArray(stepConfig) && stepConfig[nextStep - 1]) {
                updateData.stepName = stepConfig[nextStep - 1].name || `Step ${nextStep}`;
              }
            } catch {
              updateData.stepName = `Step ${nextStep}`;
            }

            // Set deadline for next step
            const stepConfig = parseStepConfig(ticket.stepName);
            if (stepConfig[nextStep - 1]?.deadlineHours) {
              const deadline = new Date();
              deadline.setHours(deadline.getHours() + stepConfig[nextStep - 1].deadlineHours);
              updateData.deadline = deadline.toISOString();
            }
          }

          await db.approvalTicket.update({
            where: { id: ticketId },
            data: updateData,
          });

          // Only update record status if the workflow is complete
          const isComplete = isApprove
            ? (ticket.workflowType === 'MULTI_STEP' ? ticket.currentStep >= ticket.totalSteps : true)
            : true;

          if (isComplete) {
            if (isApprove) {
              await db.dataRecord.update({
                where: { id: ticket.recordId },
                data: {
                  status: STATUS_ACTIVE,
                  updatedById: tokenPayload.userId,
                },
              });

              const maxVersion = await db.dataVersion.findFirst({
                where: { recordId: ticket.recordId },
                orderBy: { versionNumber: 'desc' },
                select: { versionNumber: true },
              });

              const record = await db.dataRecord.findUnique({ where: { id: ticket.recordId } });
              if (record) {
                await db.dataVersion.create({
                  data: {
                    recordId: ticket.recordId,
                    payloadSnapshot: record.currentPayload,
                    versionNumber: (maxVersion?.versionNumber ?? 0) + 1,
                    changedById: tokenPayload.userId,
                    changeReason: reviewNotes || 'Approved',
                    status: STATUS_ACTIVE,
                  },
                });
              }
            } else {
              await db.dataRecord.update({
                where: { id: ticket.recordId },
                data: {
                  status: STATUS_REJECTED,
                  updatedById: tokenPayload.userId,
                },
              });
            }
          }

          results.push({ id: ticketId, success: true });
        } catch (err) {
          results.push({ id: ticketId, success: false, error: String(err) });
        }
      }

      return NextResponse.json({ results });
    }

    // ------- SINGLE APPROVE / REJECT -------
    if (action === 'approve' || action === 'reject') {
      const { ticketId, reviewNotes } = body;

      if (!ticketId) {
        return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
      }

      const ticket = await db.approvalTicket.findUnique({
        where: { id: ticketId },
        include: { record: true },
      });

      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      if (ticket.status !== 'PENDING') {
        return NextResponse.json({ error: 'Ticket is not in PENDING status' }, { status: 422 });
      }

      // Separation of duties check: creator cannot approve their own request
      if (ticket.requestedById === tokenPayload.userId) {
        return NextResponse.json(
          { error: 'Separation of Duties violation: You cannot approve your own request' },
          { status: 403 }
        );
      }

      const isApprove = action === 'approve';

      // Add workflow history entry
      const history = parseWorkflowHistory(ticket.workflowHistory);
      history.push({
        step: ticket.currentStep,
        userId: tokenPayload.userId,
        action: isApprove ? 'APPROVED' : 'REJECTED',
        timestamp: new Date().toISOString(),
        notes: reviewNotes || (isApprove ? 'Approved' : 'Rejected'),
      });

      const updateData: Record<string, unknown> = {
        status: isApprove ? 'APPROVED' : 'REJECTED',
        reviewedById: tokenPayload.userId,
        reviewNotes: reviewNotes || (isApprove ? 'Approved' : 'Rejected'),
        reviewedAt: new Date(),
        workflowHistory: JSON.stringify(history),
      };

      // For multi-step: advance to next step instead of completing
      if (isApprove && ticket.workflowType === 'MULTI_STEP' && ticket.currentStep < ticket.totalSteps) {
        const nextStep = ticket.currentStep + 1;
        updateData.status = 'PENDING';
        updateData.currentStep = nextStep;
        updateData.reviewedAt = null;
        updateData.reviewedById = null;
        updateData.reviewNotes = null;
        updateData.stepName = `Step ${nextStep}`;

        // Set deadline for next step
        const stepConfig = parseStepConfig(ticket.stepName);
        if (stepConfig[nextStep - 1]?.deadlineHours) {
          const deadline = new Date();
          deadline.setHours(deadline.getHours() + stepConfig[nextStep - 1].deadlineHours);
          updateData.deadline = deadline.toISOString();
        }
      }

      const updatedTicket = await db.approvalTicket.update({
        where: { id: ticketId },
        data: updateData,
      });

      // Only update record status if workflow is complete
      const isWorkflowComplete = isApprove
        ? (ticket.workflowType === 'MULTI_STEP' ? ticket.currentStep >= ticket.totalSteps : true)
        : true;

      let updatedRecord: Awaited<ReturnType<typeof db.dataRecord.update>> | null = null;
      if (isWorkflowComplete) {
        if (isApprove) {
          updatedRecord = await db.dataRecord.update({
            where: { id: ticket.recordId },
            data: {
              status: STATUS_ACTIVE,
              updatedById: tokenPayload.userId,
            },
          });

          const maxVersion = await db.dataVersion.findFirst({
            where: { recordId: ticket.recordId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });

          await db.dataVersion.create({
            data: {
              recordId: ticket.recordId,
              payloadSnapshot: updatedRecord.currentPayload,
              versionNumber: (maxVersion?.versionNumber ?? 0) + 1,
              changedById: tokenPayload.userId,
              changeReason: reviewNotes || 'Approved',
              status: STATUS_ACTIVE,
            },
          });
        } else {
          updatedRecord = await db.dataRecord.update({
            where: { id: ticket.recordId },
            data: {
              status: STATUS_REJECTED,
              updatedById: tokenPayload.userId,
            },
          });
        }
      }

      return NextResponse.json({ ticket: updatedTicket, record: updatedRecord });
    }

    // ------- DELEGATE -------
    if (action === 'delegate') {
      const { ticketId, delegateToUserId, reviewNotes } = body;
      if (!ticketId || !delegateToUserId) {
        return NextResponse.json({ error: 'ticketId and delegateToUserId are required' }, { status: 400 });
      }

      const ticket = await db.approvalTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      if (ticket.status !== 'PENDING') {
        return NextResponse.json({ error: 'Ticket is not in PENDING status' }, { status: 422 });
      }

      // Verify delegate user exists and has approve permission
      const delegateUser = await db.sysUser.findUnique({
        where: { id: delegateToUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!delegateUser || !delegateUser.isActive) {
        return NextResponse.json({ error: 'Delegate user not found or inactive' }, { status: 404 });
      }

      const delegateRoles = delegateUser.userRoles.map(ur => ur.role.roleName);
      if (!hasPermission(delegateRoles, 'data:approve')) {
        return NextResponse.json({ error: 'Delegate user does not have approval permissions' }, { status: 403 });
      }

      // Separation of duties: cannot delegate to the requester
      if (delegateToUserId === ticket.requestedById) {
        return NextResponse.json(
          { error: 'Separation of Duties violation: Cannot delegate to the original requester' },
          { status: 403 }
        );
      }

      // Add workflow history entry
      const history = parseWorkflowHistory(ticket.workflowHistory);
      history.push({
        step: ticket.currentStep,
        userId: tokenPayload.userId,
        action: 'DELEGATED',
        timestamp: new Date().toISOString(),
        notes: reviewNotes || `Delegated to user ${delegateToUserId}`,
      });

      const updatedTicket = await db.approvalTicket.update({
        where: { id: ticketId },
        data: {
          delegatedFrom: tokenPayload.userId,
          reviewedById: null, // Clear current reviewer so delegate can pick up
          workflowHistory: JSON.stringify(history),
          reviewNotes: reviewNotes || `Delegated by ${tokenPayload.username}`,
        },
      });

      return NextResponse.json({ ticket: updatedTicket });
    }

    // ------- REASSIGN -------
    if (action === 'reassign') {
      const { ticketId, reassignToUserId, reviewNotes } = body;
      if (!ticketId || !reassignToUserId) {
        return NextResponse.json({ error: 'ticketId and reassignToUserId are required' }, { status: 400 });
      }

      // Only Super Admin can reassign
      if (!checkSuperAdmin(tokenPayload.roles)) {
        return NextResponse.json({ error: 'Only Super Admin can reassign tickets' }, { status: 403 });
      }

      const ticket = await db.approvalTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      if (ticket.status !== 'PENDING') {
        return NextResponse.json({ error: 'Ticket is not in PENDING status' }, { status: 422 });
      }

      const reassignUser = await db.sysUser.findUnique({
        where: { id: reassignToUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!reassignUser || !reassignUser.isActive) {
        return NextResponse.json({ error: 'Reassign target user not found or inactive' }, { status: 404 });
      }

      const reassignRoles = reassignUser.userRoles.map(ur => ur.role.roleName);
      if (!hasPermission(reassignRoles, 'data:approve')) {
        return NextResponse.json({ error: 'Target user does not have approval permissions' }, { status: 403 });
      }

      // Add workflow history entry
      const history = parseWorkflowHistory(ticket.workflowHistory);
      history.push({
        step: ticket.currentStep,
        userId: tokenPayload.userId,
        action: 'REASSIGNED',
        timestamp: new Date().toISOString(),
        notes: reviewNotes || `Reassigned to user ${reassignToUserId}`,
      });

      const updatedTicket = await db.approvalTicket.update({
        where: { id: ticketId },
        data: {
          reviewedById: null,
          delegatedFrom: null,
          workflowHistory: JSON.stringify(history),
          reviewNotes: reviewNotes || `Reassigned by admin`,
        },
      });

      return NextResponse.json({ ticket: updatedTicket });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Approvals PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/approvals — Create new approval ticket (used internally)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      recordId,
      deltaPayload,
      workflowType = 'SIMPLE',
      totalSteps = 1,
      stepName,
      deadline,
      priority = 'NORMAL',
      parentTicketId,
    } = body as {
      recordId: string;
      deltaPayload?: string;
      workflowType?: string;
      totalSteps?: number;
      stepName?: string;
      deadline?: string;
      priority?: string;
      parentTicketId?: string;
    };

    if (!recordId) {
      return NextResponse.json({ error: 'recordId is required' }, { status: 400 });
    }

    // Build initial workflow history
    const history: WorkflowHistoryEntry[] = [
      {
        step: 1,
        userId: tokenPayload.userId,
        action: 'CREATED',
        timestamp: new Date().toISOString(),
        notes: `Workflow created (${workflowType}, ${totalSteps} steps)`,
      },
    ];

    const ticket = await db.approvalTicket.create({
      data: {
        recordId,
        requestedById: tokenPayload.userId,
        status: 'PENDING',
        deltaPayload: deltaPayload || null,
        workflowType,
        currentStep: 1,
        totalSteps,
        stepName: stepName || 'Review',
        deadline: deadline ? new Date(deadline) : null,
        priority,
        parentTicketId: parentTicketId || null,
        workflowHistory: JSON.stringify(history),
      },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error('Approvals POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseWorkflowHistory(raw: string | null | undefined): WorkflowHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface StepConfig {
  name: string;
  assigneeRole: string;
  deadlineHours: number;
  isParallel: boolean;
}

function parseStepConfig(raw: string | null | undefined): StepConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
