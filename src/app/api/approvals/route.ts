import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders, STATUS_ACTIVE, STATUS_REJECTED } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';

// GET /api/approvals?status=PENDING or ?status=all
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Any user with data:read can view approval tickets
    if (!hasPermission(tokenPayload.roles, 'data:read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING';

    const where: Record<string, unknown> = {};
    if (status !== 'all') {
      where.status = status;
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

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error('Approvals GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/approvals?action=approve - Approve ticket (requires data:approve permission)
// PUT /api/approvals?action=reject - Reject ticket (requires data:approve permission)
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only users with data:approve permission can approve/reject
    if (!hasPermission(tokenPayload.roles, 'data:approve')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only managers and admins can approve/reject.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();
    const { ticketId, reviewNotes } = body;

    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
    }

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
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

    if (action === 'approve') {
      const updatedTicket = await db.approvalTicket.update({
        where: { id: ticketId },
        data: {
          status: 'APPROVED',
          reviewedById: tokenPayload.userId,
          reviewNotes: reviewNotes || 'Approved',
          reviewedAt: new Date(),
        },
      });

      const updatedRecord = await db.dataRecord.update({
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

      return NextResponse.json({ ticket: updatedTicket, record: updatedRecord });
    }

    if (action === 'reject') {
      const updatedTicket = await db.approvalTicket.update({
        where: { id: ticketId },
        data: {
          status: 'REJECTED',
          reviewedById: tokenPayload.userId,
          reviewNotes: reviewNotes || 'Rejected',
          reviewedAt: new Date(),
        },
      });

      const updatedRecord = await db.dataRecord.update({
        where: { id: ticket.recordId },
        data: {
          status: STATUS_REJECTED,
          updatedById: tokenPayload.userId,
        },
      });

      return NextResponse.json({ ticket: updatedTicket, record: updatedRecord });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Approvals PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
