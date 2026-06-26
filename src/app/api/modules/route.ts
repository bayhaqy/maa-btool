import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission, isSuperAdmin } from '@/lib/rbac';

// GET /api/modules - List all modules (with field counts)
// GET /api/modules?action=detail&id=xxx - Get module with fields, validations, and lookup data
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'detail' && id) {
      const metaModule = await db.metaModule.findUnique({
        where: { id },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              validations: true,
              lookupMaster: {
                include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
              },
            },
          },
        },
      });

      if (!metaModule) {
        return NextResponse.json({ error: 'Module not found' }, { status: 404 });
      }

      return NextResponse.json({ module: metaModule });
    }

    // List all active modules with field counts
    const modules = await db.metaModule.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { fields: { where: { isActive: true } } } },
      },
    });

    return NextResponse.json({
      modules: modules.map((m) => ({
        ...m,
        fieldCount: m._count.fields,
        _count: undefined,
      })),
    });
  } catch (error) {
    console.error('Modules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/modules - Create module (Super Admin only)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can create modules' }, { status: 403 });
    }

    const body = await request.json();
    const { moduleCode, moduleName, moduleIcon, description, requireApproval } = body;

    if (!moduleCode || !moduleName) {
      return NextResponse.json({ error: 'moduleCode and moduleName are required' }, { status: 400 });
    }

    const existing = await db.metaModule.findUnique({ where: { moduleCode } });
    if (existing) {
      return NextResponse.json({ error: 'Module code already exists' }, { status: 409 });
    }

    const metaModule = await db.metaModule.create({
      data: {
        moduleCode,
        moduleName,
        moduleIcon: moduleIcon || 'Database',
        description,
        requireApproval: requireApproval ?? true,
      },
    });

    return NextResponse.json({ module: metaModule }, { status: 201 });
  } catch (error) {
    console.error('Modules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/modules - Update module (Super Admin only)
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can update modules' }, { status: 403 });
    }

    const body = await request.json();
    const { id, moduleCode, moduleName, moduleIcon, description, requireApproval, sortOrder } = body;

    if (!id) {
      return NextResponse.json({ error: 'Module id is required' }, { status: 400 });
    }

    const existing = await db.metaModule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    if (moduleCode && moduleCode !== existing.moduleCode) {
      const duplicate = await db.metaModule.findUnique({ where: { moduleCode } });
      if (duplicate) {
        return NextResponse.json({ error: 'Module code already exists' }, { status: 409 });
      }
    }

    const metaModule = await db.metaModule.update({
      where: { id },
      data: {
        ...(moduleCode !== undefined && { moduleCode }),
        ...(moduleName !== undefined && { moduleName }),
        ...(moduleIcon !== undefined && { moduleIcon }),
        ...(description !== undefined && { description }),
        ...(requireApproval !== undefined && { requireApproval }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json({ module: metaModule });
  } catch (error) {
    console.error('Modules PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/modules - Soft delete (Super Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can delete modules' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Module id is required' }, { status: 400 });
    }

    const existing = await db.metaModule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    const metaModule = await db.metaModule.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ module: metaModule });
  } catch (error) {
    console.error('Modules DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
