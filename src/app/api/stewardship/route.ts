import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission, isSuperAdmin } from '@/lib/rbac';
import { logAudit, sanitizeInput } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/stewardship — List stewardship tasks
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const taskType = searchParams.get('taskType');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assignedTo');
    const moduleId = searchParams.get('moduleId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (taskType) where.taskType = taskType;
    if (priority) where.priority = priority;
    if (assignedTo) where.assignedTo = assignedTo;
    if (moduleId) where.moduleId = moduleId;

    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      db.stewardshipTask.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          module: {
            select: {
              id: true,
              moduleCode: true,
              moduleName: true,
            },
          },
          record: {
            select: {
              id: true,
              status: true,
              currentPayload: true,
              updatedAt: true,
            },
          },
          assignee: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
            },
          },
          assigner: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
            },
          },
        },
      }),
      db.stewardshipTask.count({ where }),
    ]);

    // Compute summary stats
    const [
      pendingCount,
      inProgressCount,
      completedCount,
      escalatedCount,
    ] = await Promise.all([
      db.stewardshipTask.count({ where: { status: 'PENDING' } }),
      db.stewardshipTask.count({ where: { status: 'IN_PROGRESS' } }),
      db.stewardshipTask.count({ where: { status: 'COMPLETED' } }),
      db.stewardshipTask.count({ where: { status: 'ESCALATED' } }),
    ]);

    // Derive implicit tasks from approval tickets that are pending
    const pendingApprovals = await db.approvalTicket.findMany({
      where: { status: 'PENDING' },
      take: 10,
      orderBy: { createdAt: 'asc' },
      include: {
        record: {
          select: {
            id: true,
            status: true,
            currentPayload: true,
            module: {
              select: {
                id: true,
                moduleCode: true,
                moduleName: true,
              },
            },
          },
        },
        requestedBy: {
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    const approvalTasks = pendingApprovals.map((ticket) => ({
      id: `approval-${ticket.id}`,
      taskType: 'QUALITY_REVIEW',
      title: `Approval review for record in ${ticket.record.module.moduleName}`,
      description: `Record submitted by ${ticket.requestedBy.displayName || ticket.requestedBy.username} requires review`,
      priority: ticket.priority,
      status: 'PENDING' as const,
      assignedTo: ticket.reviewedById || null,
      dueDate: ticket.deadline?.toISOString() || null,
      createdAt: ticket.createdAt.toISOString(),
      module: ticket.record.module,
      recordId: ticket.recordId,
      source: 'APPROVAL',
    }));

    return NextResponse.json({
      tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        pending: pendingCount,
        inProgress: inProgressCount,
        completed: completedCount,
        escalated: escalatedCount,
        total: pendingCount + inProgressCount + completedCount + escalatedCount,
      },
      approvalTasks,
    });
  } catch (error) {
    console.error('Stewardship GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/stewardship — Create or assign a stewardship task
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:write');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    // Rate limiting
    const rl = rateLimit(`stewardship-post:${tokenPayload!.userId}`, { limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const {
      moduleId,
      recordId,
      taskType,
      title,
      description,
      priority,
      assignedTo,
      dueDate,
      context,
    } = body;

    if (!moduleId || !title) {
      return NextResponse.json(
        { error: 'moduleId and title are required' },
        { status: 400 }
      );
    }

    // Validate module exists
    const metaModule = await db.metaModule.findUnique({ where: { id: sanitizeInput(moduleId) } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // Validate record exists if provided
    if (recordId) {
      const record = await db.dataRecord.findUnique({ where: { id: sanitizeInput(recordId) } });
      if (!record) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }
    }

    // Validate assignee exists if provided
    if (assignedTo) {
      const user = await db.sysUser.findUnique({ where: { id: sanitizeInput(assignedTo) } });
      if (!user) {
        return NextResponse.json({ error: 'Assigned user not found' }, { status: 404 });
      }
    }

    const validTaskTypes = ['QUALITY_REVIEW', 'OWNERSHIP_ASSIGN', 'DATA_CORRECTION', 'ENRICHMENT', 'DEDUP_REVIEW'];
    const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

    if (taskType && !validTaskTypes.includes(taskType)) {
      return NextResponse.json(
        { error: `Invalid taskType. Must be one of: ${validTaskTypes.join(', ')}` },
        { status: 400 }
      );
    }

    if (priority && !validPriorities.includes(priority)) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` },
        { status: 400 }
      );
    }

    const task = await db.stewardshipTask.create({
      data: {
        moduleId: sanitizeInput(moduleId),
        recordId: recordId ? sanitizeInput(recordId) : null,
        taskType: taskType || 'QUALITY_REVIEW',
        title: sanitizeInput(title),
        description: description ? sanitizeInput(description) : null,
        priority: priority || 'NORMAL',
        status: 'PENDING',
        assignedTo: assignedTo ? sanitizeInput(assignedTo) : null,
        assignedBy: tokenPayload!.userId,
        dueDate: dueDate ? new Date(dueDate) : null,
        context: context ? (typeof context === 'string' ? context : JSON.stringify(context)) : null,
      },
      include: {
        module: {
          select: { id: true, moduleCode: true, moduleName: true },
        },
        assignee: {
          select: { id: true, username: true, displayName: true, email: true },
        },
        assigner: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
    });

    // Audit log
    await logAudit({
      userId: tokenPayload!.userId,
      action: 'CREATE_STEWARDSHIP_TASK',
      entityType: 'StewardshipTask',
      entityId: task.id,
      moduleName: metaModule.moduleCode,
      description: `Created stewardship task: ${title}`,
      newValues: { taskType: task.taskType, priority: task.priority, assignedTo: task.assignedTo },
      companyId: tokenPayload!.companyId,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Stewardship POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/stewardship — Update task status (complete, reassign, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:write');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const body = await request.json();
    const { id, status, assignedTo, priority, resolution, dueDate } = body;

    if (!id) {
      return NextResponse.json({ error: 'Task id is required' }, { status: 400 });
    }

    const existing = await db.stewardshipTask.findUnique({ where: { id: sanitizeInput(id) } });
    if (!existing) {
      return NextResponse.json({ error: 'Stewardship task not found' }, { status: 404 });
    }

    // Validate status transition
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ESCALATED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate assignee exists if being reassigned
    if (assignedTo) {
      const user = await db.sysUser.findUnique({ where: { id: sanitizeInput(assignedTo) } });
      if (!user) {
        return NextResponse.json({ error: 'Assigned user not found' }, { status: 404 });
      }
    }

    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    if (assignedTo) update.assignedTo = sanitizeInput(assignedTo);
    if (priority) update.priority = priority;
    if (resolution) update.resolution = sanitizeInput(resolution);
    if (dueDate) update.dueDate = new Date(dueDate);

    // Auto-set completedAt when completing
    if (status === 'COMPLETED') {
      update.completedAt = new Date();
    }

    const task = await db.stewardshipTask.update({
      where: { id: sanitizeInput(id) },
      data: update,
      include: {
        module: {
          select: { id: true, moduleCode: true, moduleName: true },
        },
        assignee: {
          select: { id: true, username: true, displayName: true, email: true },
        },
        assigner: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
    });

    // Audit log
    await logAudit({
      userId: tokenPayload!.userId,
      action: status === 'COMPLETED' ? 'COMPLETE_STEWARDSHIP_TASK' : 'UPDATE_STEWARDSHIP_TASK',
      entityType: 'StewardshipTask',
      entityId: id,
      moduleName: existing.moduleId,
      description: `Updated stewardship task "${existing.title}" to status: ${status || existing.status}`,
      oldValues: { status: existing.status, assignedTo: existing.assignedTo, priority: existing.priority },
      newValues: update,
      companyId: tokenPayload!.companyId,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Stewardship PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
