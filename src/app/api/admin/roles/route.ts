import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';

// GET /api/admin/roles - List all roles with permission counts
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can manage roles
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can manage roles.' }, { status: 403 });
    }

    const roles = await db.sysRole.findMany({
      orderBy: { roleName: 'asc' },
      include: {
        _count: { select: { rolePermissions: true, userRoles: true } },
        rolePermissions: {
          include: {
            module: { select: { id: true, moduleCode: true, moduleName: true } },
          },
        },
      },
    });

    const formattedRoles = roles.map((r) => ({
      id: r.id,
      roleName: r.roleName,
      description: r.description,
      permissionCount: r._count.rolePermissions,
      userCount: r._count.userRoles,
      permissions: r.rolePermissions.map((p) => ({
        id: p.id,
        moduleId: p.moduleId,
        module: p.module,
        canRead: p.canRead,
        canWrite: p.canWrite,
        canDelete: p.canDelete,
        canApprove: p.canApprove,
        columnRestrictions: p.columnRestrictions,
        rowFilter: p.rowFilter,
      })),
    }));

    return NextResponse.json({ roles: formattedRoles });
  } catch (error) {
    console.error('Admin Roles GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/roles - Create role
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can create roles
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can create roles.' }, { status: 403 });
    }

    const body = await request.json();
    const { roleName, description, permissions } = body;

    if (!roleName) {
      return NextResponse.json({ error: 'roleName is required' }, { status: 400 });
    }

    // Check for duplicate
    const existing = await db.sysRole.findUnique({ where: { roleName } });
    if (existing) {
      return NextResponse.json({ error: 'Role name already exists' }, { status: 409 });
    }

    const role = await db.sysRole.create({
      data: {
        roleName,
        description,
        rolePermissions: {
          create: (permissions || []).map((p: {
            moduleId: string;
            canRead?: boolean;
            canWrite?: boolean;
            canDelete?: boolean;
            canApprove?: boolean;
            columnRestrictions?: string;
            rowFilter?: string;
          }) => ({
            moduleId: p.moduleId,
            canRead: p.canRead ?? false,
            canWrite: p.canWrite ?? false,
            canDelete: p.canDelete ?? false,
            canApprove: p.canApprove ?? false,
            columnRestrictions: p.columnRestrictions,
            rowFilter: p.rowFilter,
          })),
        },
      },
      include: {
        rolePermissions: {
          include: {
            module: { select: { id: true, moduleCode: true, moduleName: true } },
          },
        },
      },
    });

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    console.error('Admin Roles POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/roles - Update role
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can update roles
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can update roles.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, roleName, description, permissions } = body;

    if (!id) {
      return NextResponse.json({ error: 'Role id is required' }, { status: 400 });
    }

    const existing = await db.sysRole.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Check for duplicate name if changing
    if (roleName && roleName !== existing.roleName) {
      const duplicate = await db.sysRole.findUnique({ where: { roleName } });
      if (duplicate) {
        return NextResponse.json({ error: 'Role name already exists' }, { status: 409 });
      }
    }

    // Update role basic info
    const role = await db.sysRole.update({
      where: { id },
      data: {
        ...(roleName !== undefined && { roleName }),
        ...(description !== undefined && { description }),
      },
    });

    // Update permissions if provided
    if (permissions !== undefined) {
      // Delete existing permissions
      await db.rolePermission.deleteMany({ where: { roleId: id } });

      // Create new permissions
      if (permissions.length > 0) {
        await db.rolePermission.createMany({
          data: permissions.map((p: {
            moduleId: string;
            canRead?: boolean;
            canWrite?: boolean;
            canDelete?: boolean;
            canApprove?: boolean;
            columnRestrictions?: string;
            rowFilter?: string;
          }) => ({
            roleId: id,
            moduleId: p.moduleId,
            canRead: p.canRead ?? false,
            canWrite: p.canWrite ?? false,
            canDelete: p.canDelete ?? false,
            canApprove: p.canApprove ?? false,
            columnRestrictions: p.columnRestrictions,
            rowFilter: p.rowFilter,
          })),
        });
      }
    }

    // Fetch updated role with relations
    const updatedRole = await db.sysRole.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            module: { select: { id: true, moduleCode: true, moduleName: true } },
          },
        },
      },
    });

    return NextResponse.json({ role: updatedRole });
  } catch (error) {
    console.error('Admin Roles PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/roles - Delete role
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can delete roles
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can delete roles.' }, { status: 403 });
    }

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Role id is required' }, { status: 400 });
    }

    const existing = await db.sysRole.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    await db.sysRole.delete({ where: { id } });
    return NextResponse.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('Admin Roles DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
