import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { ROLE_TYPE_INFO, hasPermission } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// GET /api/admin/roles - List all roles with permission counts, company info, and assigned users
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

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
        company: { select: { id: true, companyCode: true, companyName: true } },
        _count: { select: { rolePermissions: true, userRoles: true } },
        rolePermissions: {
          include: {
            module: { select: { id: true, moduleCode: true, moduleName: true } },
          },
        },
        userRoles: {
          include: {
            user: { select: { id: true, username: true, displayName: true } },
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
      isGlobal: r.isGlobal,
      companyId: r.companyId,
      company: r.company,
      color: r.color,
      icon: r.icon,
      dataScope: r.dataScope,
      scopeConfig: r.scopeConfig,
      permissionCount: r._count.rolePermissions,
      userCount: r._count.userRoles,
      assignedUsers: r.userRoles.map((ur) => ({
        id: ur.user.id,
        username: ur.user.username,
        displayName: ur.user.displayName,
      })),
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

// POST /api/admin/roles - Create role (supports companyId for multi-tenant)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { roleName, description, roleType, scope, permissions, companyId, dataScope, scopeConfig } = body;

    if (!roleName) {
      return NextResponse.json({ error: 'roleName is required' }, { status: 400 });
    }

    // Validate MODULE_LEVEL scope requires at least one permission
    const resolvedScope = scope || 'MODULE_LEVEL';
    if ((resolvedScope === 'MODULE_LEVEL' || resolvedScope === 'MODULE') && (!permissions || permissions.length === 0)) {
      return NextResponse.json({ error: 'Module-level scope requires at least one module to be selected' }, { status: 400 });
    }

    // Resolve companyId — default to SYSTEM for global roles, otherwise required
    const resolvedCompanyId = companyId || 'SYSTEM';

    // Check for duplicate (scoped to companyId)
    const existing = await db.sysRole.findUnique({
      where: { companyId_roleName: { companyId: resolvedCompanyId, roleName } },
    });
    if (existing) {
      return NextResponse.json({ error: 'User Group name already exists for this account' }, { status: 409 });
    }

    const typeInfo = ROLE_TYPE_INFO[roleType || 'VIEWER'];
    const resolvedColor = typeInfo?.color || '#6b7280';
    const resolvedIcon = typeInfo?.icon || 'Shield';
    const isViewer = (roleType || 'VIEWER') === 'VIEWER';

    const role = await db.sysRole.create({
      data: {
        roleName,
        description,
        roleType: roleType || 'VIEWER',
        scope: scope || 'MODULE_LEVEL',
        isSystem: false,
        isGlobal: resolvedCompanyId === 'SYSTEM',
        companyId: resolvedCompanyId,
        color: resolvedColor,
        icon: resolvedIcon,
        dataScope: dataScope || null,
        scopeConfig: scopeConfig || null,
        rolePermissions: {
          create: (permissions || []).map((p: {
            moduleId: string;
            canRead?: boolean; canCreate?: boolean; canEdit?: boolean;
            canDelete?: boolean; canApprove?: boolean; canExport?: boolean;
            canImport?: boolean; canBulkUpdate?: boolean;
            columnRestrictions?: string; rowFilter?: string;
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

    await logAudit({
      action: AuditAction.ROLE_ASSIGN,
      entityType: 'SysRole',
      entityId: role.id,
      description: `User Group "${roleName}" created with type ${roleType || 'VIEWER'}`,
      newValues: { roleName, description, roleType, companyId: resolvedCompanyId, permissionCount: (permissions || []).length },
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

    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { id, roleName, description, roleType, scope, permissions, dataScope, scopeConfig } = body;

    if (!id) {
      return NextResponse.json({ error: 'Role id is required' }, { status: 400 });
    }

    const existing = await db.sysRole.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User Group not found' }, { status: 404 });
    }

    // Check for duplicate name if changing
    if (roleName && roleName !== existing.roleName) {
      const duplicate = await db.sysRole.findUnique({
        where: { companyId_roleName: { companyId: existing.companyId, roleName } },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'User Group name already exists for this account' }, { status: 409 });
      }
    }

    const resolvedRoleType = roleType || existing.roleType || 'VIEWER';
    const typeInfo = ROLE_TYPE_INFO[resolvedRoleType];
    const resolvedColor = typeInfo?.color || existing.color || '#6b7280';
    const resolvedIcon = typeInfo?.icon || existing.icon || 'Shield';

    const role = await db.sysRole.update({
      where: { id },
      data: {
        ...(roleName !== undefined && { roleName }),
        ...(description !== undefined && { description }),
        ...(roleType !== undefined && { roleType, color: resolvedColor, icon: resolvedIcon }),
        ...(scope !== undefined && { scope }),
        ...(dataScope !== undefined && { dataScope: dataScope || null }),
        ...(scopeConfig !== undefined && { scopeConfig: scopeConfig || null }),
      },
    });

    if (permissions !== undefined) {
      const isViewer = role.roleType === 'VIEWER';

      await db.rolePermission.deleteMany({ where: { roleId: id } });

      if (permissions.length > 0) {
        await db.rolePermission.createMany({
          data: permissions.map((p: {
            moduleId: string;
            canRead?: boolean; canCreate?: boolean; canEdit?: boolean;
            canDelete?: boolean; canApprove?: boolean; canExport?: boolean;
            canImport?: boolean; canBulkUpdate?: boolean;
            columnRestrictions?: string; rowFilter?: string;
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

    await logAudit({
      action: AuditAction.ROLE_ASSIGN,
      entityType: 'SysRole',
      entityId: id,
      description: `User Group "${existing.roleName}" updated`,
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

    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

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
      return NextResponse.json({ error: 'User Group not found' }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json({ error: 'Cannot delete system user group' }, { status: 403 });
    }

    await db.sysRole.delete({ where: { id } });

    await logAudit({
      action: AuditAction.ROLE_REMOVE,
      entityType: 'SysRole',
      entityId: id,
      description: `User Group "${existing.roleName}" deleted`,
      severity: 'critical',
      oldValues: { roleName: existing.roleName, roleType: existing.roleType },
      req: request,
    });

    return NextResponse.json({ message: 'User Group deleted' });
  } catch (error) {
    console.error('Admin Roles DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
