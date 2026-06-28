import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StateInput {
  stateCode: string;
  stateName: string;
  stateType: string;
  color: string;
  isInitial: boolean;
  isFinal: boolean;
  sortOrder: number;
}

interface TransitionInput {
  fromStateCode: string;
  toStateCode: string;
  transitionName: string;
  condition?: string;
  requiredRole?: string;
  isAuto?: boolean;
  notifyRoles?: string[];
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// GET /api/workflow-templates — List templates with states & transitions
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

    const { searchParams } = new URL(request.url);
    const moduleScope = searchParams.get('moduleScope');
    const id = searchParams.get('id');

    // Single template with full details
    if (id) {
      const template = await db.workflowTemplate.findUnique({
        where: { id },
        include: {
          states: { orderBy: { sortOrder: 'asc' } },
          transitions: {
            orderBy: { sortOrder: 'asc' },
            include: { fromState: true, toState: true },
          },
        },
      });
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      return NextResponse.json({ template });
    }

    const where: Record<string, unknown> = { isActive: true };
    if (moduleScope) {
      where.moduleScope = moduleScope;
    }

    const templates = await db.workflowTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        states: { orderBy: { sortOrder: 'asc' } },
        transitions: {
          orderBy: { sortOrder: 'asc' },
          include: { fromState: true, toState: true },
        },
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('WorkflowTemplates GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/workflow-templates — Create template with states & transitions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can create workflow templates' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      moduleScope,
      states: statesInput,
      transitions: transitionsInput,
      autoApproveRules,
      slaConfig,
    } = body as {
      name: string;
      description?: string;
      moduleScope?: string;
      states: StateInput[];
      transitions: TransitionInput[];
      autoApproveRules?: string;
      slaConfig?: string;
    };

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!statesInput || !Array.isArray(statesInput) || statesInput.length === 0) {
      return NextResponse.json({ error: 'At least one state is required' }, { status: 400 });
    }

    // Validate at least one initial state
    if (!statesInput.some(s => s.isInitial)) {
      return NextResponse.json({ error: 'At least one state must be marked as initial' }, { status: 400 });
    }

    // Create template with states and transitions in a transaction
    const template = await db.$transaction(async (tx) => {
      const tpl = await tx.workflowTemplate.create({
        data: {
          name,
          description: description || null,
          moduleScope: moduleScope || null,
          stepCount: statesInput.length,
          stepConfig: JSON.stringify(statesInput),
          autoApproveRules: autoApproveRules || null,
          slaConfig: slaConfig || null,
        },
      });

      // Create states
      const stateRecords = [];
      for (const s of statesInput) {
        const state = await tx.workflowState.create({
          data: {
            templateId: tpl.id,
            stateCode: s.stateCode,
            stateName: s.stateName,
            stateType: s.stateType || 'DRAFT',
            color: s.color || '#6b7280',
            isInitial: s.isInitial || false,
            isFinal: s.isFinal || false,
            sortOrder: s.sortOrder ?? 0,
          },
        });
        stateRecords.push(state);
      }

      // Create transitions
      if (transitionsInput && Array.isArray(transitionsInput)) {
        for (const t of transitionsInput) {
          const fromState = stateRecords.find(s => s.stateCode === t.fromStateCode);
          const toState = stateRecords.find(s => s.stateCode === t.toStateCode);
          if (!fromState || !toState) continue;

          await tx.workflowTransition.create({
            data: {
              templateId: tpl.id,
              fromStateId: fromState.id,
              toStateId: toState.id,
              transitionName: t.transitionName || `${t.fromStateCode} → ${t.toStateCode}`,
              condition: t.condition || null,
              requiredRole: t.requiredRole || null,
              isAuto: t.isAuto || false,
              notifyRoles: t.notifyRoles ? JSON.stringify(t.notifyRoles) : null,
              sortOrder: t.sortOrder ?? 0,
            },
          });
        }
      }

      // Return with relations
      return tx.workflowTemplate.findUnique({
        where: { id: tpl.id },
        include: {
          states: { orderBy: { sortOrder: 'asc' } },
          transitions: {
            orderBy: { sortOrder: 'asc' },
            include: { fromState: true, toState: true },
          },
        },
      });
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('WorkflowTemplates POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/workflow-templates — Update template
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can update workflow templates' }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      name,
      description,
      moduleScope,
      states: statesInput,
      transitions: transitionsInput,
      autoApproveRules,
      slaConfig,
      isActive,
    } = body as {
      id: string;
      name?: string;
      description?: string;
      moduleScope?: string;
      states?: StateInput[];
      transitions?: TransitionInput[];
      autoApproveRules?: string;
      slaConfig?: string;
      isActive?: boolean;
    };

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.workflowTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Simple field updates (no states/transitions change)
    if (!statesInput && !transitionsInput) {
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (moduleScope !== undefined) updateData.moduleScope = moduleScope;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (autoApproveRules !== undefined) updateData.autoApproveRules = autoApproveRules;
      if (slaConfig !== undefined) updateData.slaConfig = slaConfig;

      const template = await db.workflowTemplate.update({
        where: { id },
        data: updateData,
        include: {
          states: { orderBy: { sortOrder: 'asc' } },
          transitions: {
            orderBy: { sortOrder: 'asc' },
            include: { fromState: true, toState: true },
          },
        },
      });
      return NextResponse.json({ template });
    }

    // Full rebuild with states and transitions
    const template = await db.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (moduleScope !== undefined) updateData.moduleScope = moduleScope;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (autoApproveRules !== undefined) updateData.autoApproveRules = autoApproveRules;
      if (slaConfig !== undefined) updateData.slaConfig = slaConfig;

      // Delete old transitions and states, recreate
      await tx.workflowTransition.deleteMany({ where: { templateId: id } });
      await tx.workflowState.deleteMany({ where: { templateId: id } });

      const finalStates = statesInput || [];
      if (finalStates.length > 0) {
        updateData.stepCount = finalStates.length;
        updateData.stepConfig = JSON.stringify(finalStates);
      }

      await tx.workflowTemplate.update({ where: { id }, data: updateData });

      // Recreate states
      const stateRecords = [];
      for (const s of finalStates) {
        const state = await tx.workflowState.create({
          data: {
            templateId: id,
            stateCode: s.stateCode,
            stateName: s.stateName,
            stateType: s.stateType || 'DRAFT',
            color: s.color || '#6b7280',
            isInitial: s.isInitial || false,
            isFinal: s.isFinal || false,
            sortOrder: s.sortOrder ?? 0,
          },
        });
        stateRecords.push(state);
      }

      // Recreate transitions
      const finalTransitions = transitionsInput || [];
      for (const t of finalTransitions) {
        const fromState = stateRecords.find(s => s.stateCode === t.fromStateCode);
        const toState = stateRecords.find(s => s.stateCode === t.toStateCode);
        if (!fromState || !toState) continue;

        await tx.workflowTransition.create({
          data: {
            templateId: id,
            fromStateId: fromState.id,
            toStateId: toState.id,
            transitionName: t.transitionName || `${t.fromStateCode} → ${t.toStateCode}`,
            condition: t.condition || null,
            requiredRole: t.requiredRole || null,
            isAuto: t.isAuto || false,
            notifyRoles: t.notifyRoles ? JSON.stringify(t.notifyRoles) : null,
            sortOrder: t.sortOrder ?? 0,
          },
        });
      }

      return tx.workflowTemplate.findUnique({
        where: { id },
        include: {
          states: { orderBy: { sortOrder: 'asc' } },
          transitions: {
            orderBy: { sortOrder: 'asc' },
            include: { fromState: true, toState: true },
          },
        },
      });
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error('WorkflowTemplates PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/workflow-templates — Delete template (soft delete)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can delete workflow templates' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    const existing = await db.workflowTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Soft delete
    const template = await db.workflowTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error('WorkflowTemplates DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
