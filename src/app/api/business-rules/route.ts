import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { logAudit, sanitizeInput } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stibo-aligned valid enums
const VALID_RULE_TYPES = ['CONDITION', 'ACTION', 'FUNCTION'];
const VALID_CONDITION_TYPES = ['CROSS_FIELD', 'LOV_CROSS', 'SCRIPTED', 'REQUIRED_IF', 'COMPLETENESS', 'UNIQUENESS', 'RANGE', 'PATTERN'];
const VALID_ACTION_TYPES = ['BLOCK', 'SET_VALUE', 'SEND_EMAIL', 'WARN', 'SET_STATUS', 'TRANSITION', 'TRIGGER_WEBHOOK', 'CREATE_TASK'];
const VALID_SEVERITIES = ['ERROR', 'WARNING', 'INFO'];
const VALID_TRIGGERS = ['SAVE', 'APPROVE', 'IMPORT', 'TRANSITION', 'SCHEDULED'];
const VALID_SCOPES = ['RECORD', 'BULK', 'ALL'];

// GET /api/business-rules — list all business rules with enhanced filtering
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:read')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: data:read' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    const ruleType = searchParams.get('ruleType');
    const conditionType = searchParams.get('conditionType');
    const actionType = searchParams.get('actionType');
    const severity = searchParams.get('severity');
    const trigger = searchParams.get('trigger');
    const scope = searchParams.get('scope');
    const isActive = searchParams.get('isActive');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    // Build where clause
    const where: Record<string, unknown> = {};
    if (moduleId) where.moduleId = moduleId;
    if (ruleType) where.ruleType = ruleType;
    if (conditionType) where.conditionType = conditionType;
    if (actionType) where.actionType = actionType;
    if (severity) where.severity = severity;
    if (trigger) where.trigger = trigger;
    if (scope) where.scope = scope;
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
      select: { ruleType: true, conditionType: true, actionType: true, severity: true, trigger: true, scope: true },
    });

    const ruleTypeDistribution: Record<string, number> = {};
    const conditionTypeDistribution: Record<string, number> = {};
    const actionTypeDistribution: Record<string, number> = {};
    const severityDistribution: Record<string, number> = {};
    const triggerDistribution: Record<string, number> = {};
    const scopeDistribution: Record<string, number> = {};

    allRules.forEach((r) => {
      ruleTypeDistribution[r.ruleType] = (ruleTypeDistribution[r.ruleType] || 0) + 1;
      conditionTypeDistribution[r.conditionType] = (conditionTypeDistribution[r.conditionType] || 0) + 1;
      actionTypeDistribution[r.actionType] = (actionTypeDistribution[r.actionType] || 0) + 1;
      severityDistribution[r.severity] = (severityDistribution[r.severity] || 0) + 1;
      triggerDistribution[r.trigger] = (triggerDistribution[r.trigger] || 0) + 1;
      scopeDistribution[r.scope] = (scopeDistribution[r.scope] || 0) + 1;
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
        ruleTypeDistribution,
        conditionTypeDistribution,
        actionTypeDistribution,
        severityDistribution,
        triggerDistribution,
        scopeDistribution,
      },
    });
  } catch (error) {
    console.error('BusinessRules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/business-rules — create a business rule
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canWrite = hasPermission(tokenPayload.roles, 'schema:write');
    if (!canWrite) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: schema:write' },
        { status: 403 }
      );
    }

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
      ruleType, conditionType, conditionJson,
      actionType, actionJson, errorMessage,
      severity, trigger, scope,
      sortOrder, isActive,
    } = body;

    // Validation
    if (!moduleId || !name || !conditionJson || !trigger) {
      return NextResponse.json(
        { error: 'moduleId, name, conditionJson, and trigger are required' },
        { status: 400 },
      );
    }

    if (ruleType && !VALID_RULE_TYPES.includes(ruleType)) {
      return NextResponse.json(
        { error: `Invalid ruleType. Must be one of: ${VALID_RULE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (conditionType && !VALID_CONDITION_TYPES.includes(conditionType)) {
      return NextResponse.json(
        { error: `Invalid conditionType. Must be one of: ${VALID_CONDITION_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (actionType && !VALID_ACTION_TYPES.includes(actionType)) {
      return NextResponse.json(
        { error: `Invalid actionType. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!VALID_TRIGGERS.includes(trigger)) {
      return NextResponse.json(
        { error: `Invalid trigger. Must be one of: ${VALID_TRIGGERS.join(', ')}` },
        { status: 400 }
      );
    }

    if (scope && !VALID_SCOPES.includes(scope)) {
      return NextResponse.json(
        { error: `Invalid scope. Must be one of: ${VALID_SCOPES.join(', ')}` },
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

    // Determine defaults based on ruleType
    const resolvedRuleType = ruleType || 'CONDITION';
    let resolvedConditionType = conditionType || 'CROSS_FIELD';
    let resolvedActionType = actionType || 'BLOCK';
    const resolvedSeverity = severity || 'ERROR';
    const resolvedScope = scope || 'RECORD';

    // For CONDITION rules, actionType should be derived from severity behavior
    // For ACTION rules, conditionType might be SCRIPTED or CROSS_FIELD
    if (resolvedRuleType === 'FUNCTION') {
      resolvedConditionType = 'SCRIPTED';
      resolvedActionType = 'SET_VALUE';
    }

    const rule = await db.businessRule.create({
      data: {
        moduleId: sanitizeInput(moduleId),
        name: sanitizeInput(name),
        description: description ? sanitizeInput(description) : null,
        ruleType: resolvedRuleType,
        conditionType: resolvedConditionType,
        conditionJson: String(conditionJson),
        actionType: resolvedActionType,
        actionJson: actionJson ? String(actionJson) : null,
        errorMessage: errorMessage ? sanitizeInput(errorMessage) : null,
        severity: resolvedSeverity,
        trigger: String(trigger),
        scope: resolvedScope,
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
      newValues: { ruleType: resolvedRuleType, conditionType: resolvedConditionType, actionType: resolvedActionType, severity: resolvedSeverity, trigger, scope: resolvedScope, isActive: rule.isActive },
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

    const canWrite = hasPermission(tokenPayload.roles, 'schema:write');
    if (!canWrite) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: schema:write' },
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
    if (body.ruleType && !VALID_RULE_TYPES.includes(body.ruleType)) {
      return NextResponse.json(
        { error: `Invalid ruleType. Must be one of: ${VALID_RULE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    if (body.conditionType && !VALID_CONDITION_TYPES.includes(body.conditionType)) {
      return NextResponse.json(
        { error: `Invalid conditionType. Must be one of: ${VALID_CONDITION_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    if (body.actionType && !VALID_ACTION_TYPES.includes(body.actionType)) {
      return NextResponse.json(
        { error: `Invalid actionType. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` },
        { status: 400 }
      );
    }
    if (body.trigger && !VALID_TRIGGERS.includes(body.trigger)) {
      return NextResponse.json(
        { error: `Invalid trigger. Must be one of: ${VALID_TRIGGERS.join(', ')}` },
        { status: 400 }
      );
    }
    if (body.scope && !VALID_SCOPES.includes(body.scope)) {
      return NextResponse.json(
        { error: `Invalid scope. Must be one of: ${VALID_SCOPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Build update data only from provided fields (whitelist)
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = sanitizeInput(body.name);
    if (body.description !== undefined) update.description = body.description ? sanitizeInput(body.description) : null;
    if (body.ruleType !== undefined) update.ruleType = String(body.ruleType);
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
    if (body.severity !== undefined) update.severity = String(body.severity);
    if (body.trigger !== undefined) update.trigger = String(body.trigger);
    if (body.scope !== undefined) update.scope = String(body.scope);
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
        ruleType: existing.ruleType,
        conditionType: existing.conditionType,
        actionType: existing.actionType,
        severity: existing.severity,
        trigger: existing.trigger,
        scope: existing.scope,
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
    if (!tokenPayload || !hasPermission(tokenPayload.roles, 'schema:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: schema:write' }, { status: 403 });
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
        ruleType: existing.ruleType,
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
