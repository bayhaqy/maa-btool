import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission, isSuperAdmin } from '@/lib/rbac';

// GET /api/business-rules?moduleId=xxx — list all business rules for a module
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

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId query parameter is required' }, { status: 400 });
    }

    const rules = await db.businessRule.findMany({
      where: { moduleId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('BusinessRules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/business-rules — create a business rule (Super Admin only)
// Body: { moduleId, name, description?, conditionType, conditionJson,
//         actionType, actionJson?, errorMessage?, trigger, sortOrder? }
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can manage business rules' }, { status: 403 });
    }

    const body = await request.json();
    const {
      moduleId, name, description,
      conditionType, conditionJson,
      actionType, actionJson, errorMessage,
      trigger, sortOrder,
    } = body;

    if (!moduleId || !name || !conditionType || !conditionJson || !actionType || !trigger) {
      return NextResponse.json(
        { error: 'moduleId, name, conditionType, conditionJson, actionType, and trigger are required' },
        { status: 400 },
      );
    }

    // Validate module exists
    const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
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
        moduleId,
        name: String(name),
        description: description ? String(description) : null,
        conditionType: String(conditionType),
        conditionJson: String(conditionJson),
        actionType: String(actionType),
        actionJson: actionJson ? String(actionJson) : null,
        errorMessage: errorMessage ? String(errorMessage) : null,
        trigger: String(trigger),
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error('BusinessRules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/business-rules — update a business rule (Super Admin only)
// Body: { id, ...fields }
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can manage business rules' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.businessRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Business rule not found' }, { status: 404 });
    }

    // Build update data only from provided fields (whitelist)
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name);
    if (body.description !== undefined) update.description = body.description ? String(body.description) : null;
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
    if (body.errorMessage !== undefined) update.errorMessage = body.errorMessage ? String(body.errorMessage) : null;
    if (body.trigger !== undefined) update.trigger = String(body.trigger);
    if (body.isActive !== undefined) update.isActive = !!body.isActive;
    if (body.sortOrder !== undefined) update.sortOrder = Number(body.sortOrder) || 0;

    const rule = await db.businessRule.update({ where: { id }, data: update });
    return NextResponse.json({ rule });
  } catch (error) {
    console.error('BusinessRules PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/business-rules — delete a business rule (Super Admin only)
// Body: { id }
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can manage business rules' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.businessRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Business rule not found' }, { status: 404 });
    }

    await db.businessRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('BusinessRules DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
