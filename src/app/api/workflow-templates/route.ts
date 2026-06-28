import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepConfig {
  name: string;
  assigneeRole: string;
  deadlineHours: number;
  isParallel: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/workflow-templates — List templates
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

    const where: Record<string, unknown> = { isActive: true };
    if (moduleScope) {
      where.moduleScope = moduleScope;
    }

    const templates = await db.workflowTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('WorkflowTemplates GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/workflow-templates — Create template (superadmin only)
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
    const { name, description, moduleScope, stepConfig } = body as {
      name: string;
      description?: string;
      moduleScope?: string;
      stepConfig: StepConfig[];
    };

    if (!name || !stepConfig || !Array.isArray(stepConfig) || stepConfig.length === 0) {
      return NextResponse.json({ error: 'name and stepConfig (non-empty array) are required' }, { status: 400 });
    }

    // Validate step config entries
    for (const step of stepConfig) {
      if (!step.name || !step.assigneeRole) {
        return NextResponse.json(
          { error: `Each step must have a name and assigneeRole. Invalid step: ${JSON.stringify(step)}` },
          { status: 400 }
        );
      }
    }

    const template = await db.workflowTemplate.create({
      data: {
        name,
        description: description || null,
        moduleScope: moduleScope || null,
        stepCount: stepConfig.length,
        stepConfig: JSON.stringify(stepConfig),
      },
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
    const { id, name, description, moduleScope, stepConfig, isActive } = body as {
      id: string;
      name?: string;
      description?: string;
      moduleScope?: string;
      stepConfig?: StepConfig[];
      isActive?: boolean;
    };

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.workflowTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (moduleScope !== undefined) updateData.moduleScope = moduleScope;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (stepConfig !== undefined) {
      if (!Array.isArray(stepConfig) || stepConfig.length === 0) {
        return NextResponse.json({ error: 'stepConfig must be a non-empty array' }, { status: 400 });
      }
      for (const step of stepConfig) {
        if (!step.name || !step.assigneeRole) {
          return NextResponse.json(
            { error: `Each step must have a name and assigneeRole. Invalid step: ${JSON.stringify(step)}` },
            { status: 400 }
          );
        }
      }
      updateData.stepConfig = JSON.stringify(stepConfig);
      updateData.stepCount = stepConfig.length;
    }

    const template = await db.workflowTemplate.update({
      where: { id },
      data: updateData,
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
