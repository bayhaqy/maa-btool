import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission, isSuperAdmin } from '@/lib/rbac';
import { logAudit, sanitizeInput } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/business-rules — list all business rules with enhanced filtering
// Any authenticated user with data:read can view.
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    const conditionType = searchParams.get('conditionType');
    const actionType = searchParams.get('actionType');
    const trigger = searchParams.get('trigger');
    const isActive = searchParams.get('isActive');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    // Build where clause — moduleId is no longer required; if absent, return all rules
    const where: Record<string, unknown> = {};
    if (moduleId) where.moduleId = moduleId;
    if (conditionType) where.conditionType = conditionType;
    if (actionType) where.actionType = actionType;
    if (trigger) where.trigger = trigger;
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }
    if (search) {
      where.name = { contains: search };
    }

    const skip = (page - 1) * limit;

    const [rules, total] = await Promise.all([
      db.businessRule.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
        },
      }),
      db.businessRule.count({ where }),
    ]);

    // Compute summary stats
    const [
      totalRules,
      activeRules,
      inactiveRules,
    ] = await Promise.all([
      db.businessRule.count(),
      db.businessRule.count({ where: { isActive: true } }),
      db.businessRule.count({ where: { isActive: false } }),
    ]);

    // Type distribution
    const allRules = await db.businessRule.findMany({
      select: { conditionType: true, actionType: true, trigger: true },
    });

    const conditionTypeDistribution: Record<string, number> = {};
    const actionTypeDistribution: Record<string, number> = {};
    const triggerDistribution: Record<string, number> = {};

    allRules.forEach((r) => {
      conditionTypeDistribution[r.conditionType] = (conditionTypeDistribution[r.conditionType] || 0) + 1;
      actionTypeDistribution[r.actionType] = (actionTypeDistribution[r.actionType] || 0) + 1;
      triggerDistribution[r.trigger] = (triggerDistribution[r.trigger] || 0) + 1;
    });

    return NextResponse.json({
      rules,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalRules,
        activeRules,
        inactiveRules,
        conditionTypeDistribution,
        actionTypeDistribution,
        triggerDistribution,
      },
    });
  } catch (error) {
    console.error('BusinessRules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/business-rules — create a business rule
// Requires data:write permission (Manager or Super Admin)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow Super Admin or Manager+ with data:write
    const canWrite = isSuperAdmin(tokenPayload.roles) ||
      tokenPayload.roles.some(r => ['Manager'].includes(r));
    if (!canWrite) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Manager or Super Admin required.' },
        { status: 403 }
      );
    }

    // Rate limiting
    const rl = rateLimit(`business-rules-post:${tokenPayload.userId}`, { limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const {
      moduleId, name, description,
      conditionType, conditionJson,
      actionType, actionJson, errorMessage,
      trigger, sortOrder, isActive,
    } = body;

    if (!moduleId || !name || !conditionType || !conditionJson || !actionType || !trigger) {
      return NextResponse.json(
        { error: 'moduleId, name, conditionType, conditionJson, actionType, and trigger are required' },
        { status: 400 },
      );
    }

    // Validate conditionType
    const validConditionTypes = ['CROSS_FIELD', 'REQUIRED_IF', 'LOV_CROSS', 'SCRIPTED'];
    if (!validConditionTypes.includes(conditionType)) {
      return NextResponse.json(
        { error: `Invalid conditionType. Must be one of: ${validConditionTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate actionType
    const validActionTypes = ['BLOCK', 'WARN', 'SET_VALUE', 'SEND_EMAIL'];
    if (!validActionTypes.includes(actionType)) {
      return NextResponse.json(
        { error: `Invalid actionType. Must be one of: ${validActionTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate trigger
    const validTriggers = ['SAVE', 'APPROVE', 'IMPORT', 'TRANSITION'];
    if (!validTriggers.includes(trigger)) {
      return NextResponse.json(
        { error: `Invalid trigger. Must be one of: ${validTriggers.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate module exists
    const metaModule = await db.metaModule.findUnique({ where: { id: sanitizeInput(moduleId) } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // Validate conditionJson is valid JSON
    try {
      JSON.parse(conditionJson);
    } catch {
      return NextResponse.json({ error: 'conditionJson must be valid JSON' }, { status: 422 });
    }

    if (actionJson) {
      try {
        JSON.parse(actionJson);
      } catch {
        return NextResponse.json({ error: 'actionJson must be valid JSON' }, { status: 422 });
      }
    }

    const rule = await db.businessRule.create({
      data: {
        moduleId: sanitizeInput(moduleId),
        name: sanitizeInput(name),
        description: description ? sanitizeInput(description) : null,
        conditionType: String(conditionType),
        conditionJson: String(conditionJson),
        actionType: String(actionType),
        actionJson: actionJson ? String(actionJson) : null,
        errorMessage: errorMessage ? sanitizeInput(errorMessage) : null,
        trigger: String(trigger),
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    });

    // Audit log
    await logAudit({
      userId: tokenPayload.userId,
      action: 'CREATE_BUSINESS_RULE',
      entityType: 'BusinessRule',
      entityId: rule.id,
      moduleName: metaModule.moduleCode,
      description: `Created business rule: ${name}`,
      newValues: { conditionType, actionType, trigger, isActive: rule.isActive },
      companyId: tokenPayload.companyId,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error('BusinessRules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/business-rules — update a business rule
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canWrite = isSuperAdmin(tokenPayload.roles) ||
      tokenPayload.roles.some(r => ['Manager'].includes(r));
    if (!canWrite) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Manager or Super Admin required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.businessRule.findUnique({
      where: { id: sanitizeInput(id) },
      include: { module: { select: { moduleCode: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Business rule not found' }, { status: 404 });
    }

    // Validate fields if provided
    if (body.conditionType) {
      const validConditionTypes = ['CROSS_FIELD', 'REQUIRED_IF', 'LOV_CROSS', 'SCRIPTED'];
      if (!validConditionTypes.includes(body.conditionType)) {
        return NextResponse.json(
          { error: `Invalid conditionType. Must be one of: ${validConditionTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (body.actionType) {
      const validActionTypes = ['BLOCK', 'WARN', 'SET_VALUE', 'SEND_EMAIL'];
      if (!validActionTypes.includes(body.actionType)) {
        return NextResponse.json(
          { error: `Invalid actionType. Must be one of: ${validActionTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (body.trigger) {
      const validTriggers = ['SAVE', 'APPROVE', 'IMPORT', 'TRANSITION'];
      if (!validTriggers.includes(body.trigger)) {
        return NextResponse.json(
          { error: `Invalid trigger. Must be one of: ${validTriggers.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Build update data only from provided fields (whitelist)
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = sanitizeInput(body.name);
    if (body.description !== undefined) update.description = body.description ? sanitizeInput(body.description) : null;
    if (body.conditionType !== undefined) update.conditionType = String(body.conditionType);
    if (body.conditionJson !== undefined) {
      try { JSON.parse(body.conditionJson); } catch {
        return NextResponse.json({ error: 'conditionJson must be valid JSON' }, { status: 422 });
      }
      update.conditionJson = String(body.conditionJson);
    }
    if (body.actionType !== undefined) update.actionType = String(body.actionType);
    if (body.actionJson !== undefined) {
      if (body.actionJson) {
        try { JSON.parse(body.actionJson); } catch {
          return NextResponse.json({ error: 'actionJson must be valid JSON' }, { status: 422 });
        }
      }
      update.actionJson = body.actionJson ? String(body.actionJson) : null;
    }
    if (body.errorMessage !== undefined) update.errorMessage = body.errorMessage ? sanitizeInput(body.errorMessage) : null;
    if (body.trigger !== undefined) update.trigger = String(body.trigger);
    if (body.isActive !== undefined) update.isActive = !!body.isActive;
    if (body.sortOrder !== undefined) update.sortOrder = Number(body.sortOrder) || 0;

    const rule = await db.businessRule.update({
      where: { id: sanitizeInput(id) },
      data: update,
    });

    // Audit log
    await logAudit({
      userId: tokenPayload.userId,
      action: 'UPDATE_BUSINESS_RULE',
      entityType: 'BusinessRule',
      entityId: id,
      moduleName: existing.module.moduleCode,
      description: `Updated business rule: ${existing.name}`,
      oldValues: {
        name: existing.name,
        conditionType: existing.conditionType,
        actionType: existing.actionType,
        trigger: existing.trigger,
        isActive: existing.isActive,
      },
      newValues: update,
      companyId: tokenPayload.companyId,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('BusinessRules PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/business-rules — delete a business rule (Super Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can delete business rules' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.businessRule.findUnique({
      where: { id: sanitizeInput(id) },
      include: { module: { select: { moduleCode: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Business rule not found' }, { status: 404 });
    }

    await db.businessRule.delete({ where: { id: sanitizeInput(id) } });

    // Audit log
    await logAudit({
      userId: tokenPayload.userId,
      action: 'DELETE_BUSINESS_RULE',
      entityType: 'BusinessRule',
      entityId: id,
      moduleName: existing.module.moduleCode,
      description: `Deleted business rule: ${existing.name}`,
      oldValues: {
        name: existing.name,
        conditionType: existing.conditionType,
        actionType: existing.actionType,
        trigger: existing.trigger,
      },
      companyId: tokenPayload.companyId,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('BusinessRules DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
