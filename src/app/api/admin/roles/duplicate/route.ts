/**
 * Role Duplication API
 *
 * POST /api/admin/roles/duplicate
 *
 * Copies a user group (role) to another company/account.
 * The role name, type, scope, description, and privilege rules are copied.
 * Users are NOT copied.
 *
 * Only Super Admin can duplicate roles across companies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin, hasPermission } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require Super Admin for cross-company duplication
    if (!isSuperAdmin(tokenPayload.roles)) {
      // Company Admin can duplicate within their own company
      if (!hasPermission(tokenPayload.roles, 'admin:write')) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { sourceRoleId, targetCompanyId } = body;

    if (!sourceRoleId || !targetCompanyId) {
      return NextResponse.json(
        { error: 'sourceRoleId and targetCompanyId are required' },
        { status: 400 }
      );
    }

    // Fetch the source role with permissions
    const sourceRole = await db.sysRole.findUnique({
      where: { id: sourceRoleId },
      include: {
        rolePermissions: {
          select: {
            moduleId: true,
            canRead: true, canCreate: true, canEdit: true, canDelete: true,
            canApprove: true, canExport: true, canImport: true, canBulkUpdate: true,
            columnRestrictions: true, rowFilter: true,
          },
        },
      },
    });

    if (!sourceRole) {
      return NextResponse.json({ error: 'Source user group not found' }, { status: 404 });
    }

    // Verify target company exists
    const targetCompany = await db.tenantCompany.findUnique({ where: { id: targetCompanyId } });
    if (!targetCompany) {
      return NextResponse.json({ error: 'Target account not found' }, { status: 404 });
    }

    // Check if role with same name already exists in target company
    const existingRole = await db.sysRole.findUnique({
      where: { companyId_roleName: { companyId: targetCompanyId, roleName: sourceRole.roleName } },
    });

    if (existingRole) {
      return NextResponse.json(
        { error: `A user group named "${sourceRole.roleName}" already exists in account "${targetCompany.companyName}"` },
        { status: 409 }
      );
    }

    // Create the duplicated role
    const newRole = await db.sysRole.create({
      data: {
        roleName: sourceRole.roleName,
        description: sourceRole.description,
        roleType: sourceRole.roleType,
        scope: sourceRole.scope,
        isSystem: false,
        isGlobal: false,
        companyId: targetCompanyId,
        color: sourceRole.color,
        icon: sourceRole.icon,
        rolePermissions: {
          create: sourceRole.rolePermissions.map((p) => ({
            moduleId: p.moduleId,
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
        },
      },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
      },
    });

    await logAudit({
      action: AuditAction.ROLE_ASSIGN,
      entityType: 'SysRole',
      entityId: newRole.id,
      description: `User Group "${sourceRole.roleName}" duplicated from company ${sourceRole.companyId} to "${targetCompany.companyName}"`,
      newValues: { roleName: newRole.roleName, companyId: targetCompanyId, sourceRoleId },
      req: request,
    });

    return NextResponse.json({
      success: true,
      message: `User Group "${sourceRole.roleName}" duplicated to "${targetCompany.companyName}"`,
      role: {
        id: newRole.id,
        roleName: newRole.roleName,
        company: newRole.company,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Role Duplicate POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
