import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { ROLE_TYPE_INFO } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

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

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
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
      roleType: r.roleType,
      scope: r.scope,
      isSystem: r.isSystem,
      color: r.color,
      icon: r.icon,
      permissionCount: r._count.rolePermissions,
      userCount: r._count.userRoles,
      permissions: r.rolePermissions.map((p) => ({
        id: p.id,
        moduleId: p.moduleId,
        module: p.module,
        canRead: p.canRead,
        canCreate: p.canCreate,
        canEdit: p.canEdit,
        canDelete: p.canDelete,
        canApprove: p.canApprove,
        canExport: p.canExport,
        canImport: p.canImport,
        canBulkUpdate: p.canBulkUpdate,
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

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { roleName, description, roleType, scope, permissions } = body;

    if (!roleName) {
      return NextResponse.json({ error: 'roleName is required' }, { status: 400 });
    }

    // Check for duplicate
    const existing = await db.sysRole.findUnique({ where: { roleName } });
    if (existing) {
      return NextResponse.json({ error: 'Role name already exists' }, { status: 409 });
    }

    // Resolve color/icon from ROLE_TYPE_INFO
    const typeInfo = ROLE_TYPE_INFO[roleType || 'VIEWER'];
    const resolvedColor = typeInfo?.color || '#6b7280';
    const resolvedIcon = typeInfo?.icon || 'Shield';

    // For VIEWER type, force all write permissions off
    const isViewer = (roleType || 'VIEWER') === 'VIEWER';

    const role = await db.sysRole.create({
      data: {
        roleName,
        description,
        roleType: roleType || 'VIEWER',
        scope: scope || 'MODULE',
        isSystem: false,
        color: resolvedColor,
        icon: resolvedIcon,
        rolePermissions: {
          create: (permissions || []).map((p: {
            moduleId: string;
            canRead?: boolean;
            canCreate?: boolean;
            canEdit?: boolean;
            canDelete?: boolean;
            canApprove?: boolean;
            canExport?: boolean;
            canImport?: boolean;
            canBulkUpdate?: boolean;
            columnRestrictions?: string;
            rowFilter?: string;
          }) => ({
            moduleId: p.moduleId,
            canRead: p.canRead ?? false,
            canCreate: isViewer ? false : (p.canCreate ?? false),
            canEdit: isViewer ? false : (p.canEdit ?? false),
            canDelete: isViewer ? false : (p.canDelete ?? false),
            canApprove: isViewer ? false : (p.canApprove ?? false),
            canExport: isViewer ? false : (p.canExport ?? false),
            canImport: isViewer ? false : (p.canImport ?? false),
            canBulkUpdate: isViewer ? false : (p.canBulkUpdate ?? false),
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

    // ── Audit: role create ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.ROLE_ASSIGN,
      entityType: 'SysRole',
      entityId: role.id,
      description: `Role "${roleName}" created with type ${roleType || 'VIEWER'}`,
      newValues: { roleName, description, roleType, permissionCount: (permissions || []).length },
      req: request,
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

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { id, roleName, description, roleType, scope, permissions } = body;

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

    // Resolve color/icon from ROLE_TYPE_INFO
    const resolvedRoleType = roleType || existing.roleType || 'VIEWER';
    const typeInfo = ROLE_TYPE_INFO[resolvedRoleType];
    const resolvedColor = typeInfo?.color || existing.color || '#6b7280';
    const resolvedIcon = typeInfo?.icon || existing.icon || 'Shield';

    // Update role basic info
    const role = await db.sysRole.update({
      where: { id },
      data: {
        ...(roleName !== undefined && { roleName }),
        ...(description !== undefined && { description }),
        ...(roleType !== undefined && { roleType, color: resolvedColor, icon: resolvedIcon }),
        ...(scope !== undefined && { scope }),
      },
    });

    // Update permissions if provided
    if (permissions !== undefined) {
      // For VIEWER type, force all write permissions off
      const isViewer = role.roleType === 'VIEWER';

      // Delete existing permissions
      await db.rolePermission.deleteMany({ where: { roleId: id } });

      // Create new permissions
      if (permissions.length > 0) {
        await db.rolePermission.createMany({
          data: permissions.map((p: {
            moduleId: string;
            canRead?: boolean;
            canCreate?: boolean;
            canEdit?: boolean;
            canDelete?: boolean;
            canApprove?: boolean;
            canExport?: boolean;
            canImport?: boolean;
            canBulkUpdate?: boolean;
            columnRestrictions?: string;
            rowFilter?: string;
          }) => ({
            roleId: id,
            moduleId: p.moduleId,
            canRead: p.canRead ?? false,
            canCreate: isViewer ? false : (p.canCreate ?? false),
            canEdit: isViewer ? false : (p.canEdit ?? false),
            canDelete: isViewer ? false : (p.canDelete ?? false),
            canApprove: isViewer ? false : (p.canApprove ?? false),
            canExport: isViewer ? false : (p.canExport ?? false),
            canImport: isViewer ? false : (p.canImport ?? false),
            canBulkUpdate: isViewer ? false : (p.canBulkUpdate ?? false),
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

    // ── Audit: role update ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.ROLE_ASSIGN,
      entityType: 'SysRole',
      entityId: id,
      description: `Role "${existing.roleName}" updated`,
      oldValues: { roleName: existing.roleName, description: existing.description, roleType: existing.roleType },
      newValues: { roleName, description, roleType, permissionCount: permissions?.length },
      severity: 'warning',
      req: request,
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

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
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

    // Prevent deletion of system roles
    if (existing.isSystem) {
      return NextResponse.json({ error: 'Cannot delete system role' }, { status: 403 });
    }

    await db.sysRole.delete({ where: { id } });

    // ── Audit: role delete ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.ROLE_REMOVE,
      entityType: 'SysRole',
      entityId: id,
      description: `Role "${existing.roleName}" deleted`,
      severity: 'critical',
      oldValues: { roleName: existing.roleName, roleType: existing.roleType },
      req: request,
    });

    return NextResponse.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('Admin Roles DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
