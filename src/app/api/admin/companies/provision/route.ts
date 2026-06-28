/**
 * Company Provisioning / Lifecycle API
 *
 * POST /api/admin/companies/provision
 *
 * Actions:
 *  - provision (default): Provisions a PENDING company → creates default roles → sets ACTIVE
 *  - suspend: Sets company onboardingStatus to SUSPENDED
 *  - activate: Sets company onboardingStatus back to ACTIVE (from SUSPENDED)
 *
 * Only Super Admin can perform these actions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';
import { ROLE_TYPE_INFO } from '@/lib/rbac';

// ── Default role definitions for provisioning ──────────────────────────

interface DefaultRoleDef {
  roleName: string;
  description: string;
  roleType: string;
  isSystem: boolean;
  color: string;
  icon: string;
  scope: string;
}

const DEFAULT_ROLES: DefaultRoleDef[] = [
  {
    roleName: 'Viewer',
    description: 'Read-only access to data and reports within this company',
    roleType: 'VIEWER',
    isSystem: true,
    color: ROLE_TYPE_INFO.VIEWER.color,
    icon: ROLE_TYPE_INFO.VIEWER.icon,
    scope: 'MODULE',
  },
  {
    roleName: 'Editor',
    description: 'Can create and edit records, cannot delete or approve',
    roleType: 'EDITOR',
    isSystem: false,
    color: ROLE_TYPE_INFO.EDITOR.color,
    icon: ROLE_TYPE_INFO.EDITOR.icon,
    scope: 'MODULE',
  },
  {
    roleName: 'Approver',
    description: 'Can review and approve record changes',
    roleType: 'APPROVER',
    isSystem: false,
    color: ROLE_TYPE_INFO.APPROVER.color,
    icon: ROLE_TYPE_INFO.APPROVER.icon,
    scope: 'MODULE',
  },
  {
    roleName: 'Company Admin',
    description: 'Manage users, roles, and AI config within own company (Account)',
    roleType: 'COMPANY_ADMIN',
    isSystem: false,
    color: ROLE_TYPE_INFO.COMPANY_ADMIN.color,
    icon: ROLE_TYPE_INFO.COMPANY_ADMIN.icon,
    scope: 'GLOBAL',
  },
];

type PermFlags = {
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
  canImport: boolean;
  canBulkUpdate: boolean;
};

const ROLE_PERMISSION_MAP: Record<string, PermFlags> = {
  VIEWER: {
    canRead: true, canCreate: false, canEdit: false, canDelete: false,
    canApprove: false, canExport: false, canImport: false, canBulkUpdate: false,
  },
  EDITOR: {
    canRead: true, canCreate: true, canEdit: true, canDelete: false,
    canApprove: false, canExport: true, canImport: false, canBulkUpdate: true,
  },
  APPROVER: {
    canRead: true, canCreate: true, canEdit: true, canDelete: false,
    canApprove: true, canExport: true, canImport: false, canBulkUpdate: false,
  },
  COMPANY_ADMIN: {
    canRead: true, canCreate: true, canEdit: true, canDelete: true,
    canApprove: true, canExport: true, canImport: true, canBulkUpdate: true,
  },
};

export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can manage account lifecycle' }, { status: 403 });
    }

    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { companyId, action } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const company = await db.tenantCompany.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // ── PROVISION action (default) ────────────────────────────────────
    if (!action || action === 'provision') {
      if (company.onboardingStatus !== 'PENDING') {
        return NextResponse.json(
          { error: `Account is not in PENDING status. Current status: ${company.onboardingStatus}` },
          { status: 422 }
        );
      }

      // Create default roles
      const modules = await db.metaModule.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, moduleCode: true },
      });

      const createdRoles: Array<{ id: string; roleName: string; roleType: string }> = [];

      // Set to PROVISIONING first
      await db.tenantCompany.update({
        where: { id: companyId },
        data: { onboardingStatus: 'PROVISIONING' },
      });

      await db.$transaction(async (tx) => {
        for (const roleDef of DEFAULT_ROLES) {
          const existingRole = await tx.sysRole.findUnique({
            where: { companyId_roleName: { companyId, roleName: roleDef.roleName } },
          });

          if (existingRole) {
            createdRoles.push({ id: existingRole.id, roleName: existingRole.roleName, roleType: existingRole.roleType });
            continue;
          }

          const permFlags = ROLE_PERMISSION_MAP[roleDef.roleType] || ROLE_PERMISSION_MAP.VIEWER;
          const permissionCreates = modules.map((mod) => ({
            moduleId: mod.id,
            canRead: permFlags.canRead,
            canCreate: permFlags.canCreate,
            canEdit: permFlags.canEdit,
            canDelete: permFlags.canDelete,
            canApprove: permFlags.canApprove,
            canExport: permFlags.canExport,
            canImport: permFlags.canImport,
            canBulkUpdate: permFlags.canBulkUpdate,
          }));

          const role = await tx.sysRole.create({
            data: {
              roleName: roleDef.roleName,
              description: roleDef.description,
              roleType: roleDef.roleType,
              scope: roleDef.scope,
              isSystem: roleDef.isSystem,
              isGlobal: false,
              companyId,
              color: roleDef.color,
              icon: roleDef.icon,
              rolePermissions: { create: permissionCreates },
            },
          });

          createdRoles.push({ id: role.id, roleName: role.roleName, roleType: role.roleType });
        }

        // Set to ACTIVE after roles are created
        await tx.tenantCompany.update({
          where: { id: companyId },
          data: { onboardingStatus: 'ACTIVE', provisionedAt: new Date() },
        });
      });

      await logAudit({
        action: AuditAction.SETTINGS_CHANGE,
        entityType: 'TenantCompany',
        entityId: companyId,
        description: `Account "${company.companyName}" (${company.companyCode}) provisioned with ${createdRoles.length} default roles`,
        newValues: { onboardingStatus: 'ACTIVE', roles: createdRoles.map(r => ({ roleName: r.roleName, roleType: r.roleType })) },
        oldValues: { onboardingStatus: 'PENDING' },
        severity: 'warning',
        req: request,
      });

      return NextResponse.json({
        success: true,
        message: `Account "${company.companyName}" provisioned successfully`,
        company: { id: company.id, companyCode: company.companyCode, companyName: company.companyName, onboardingStatus: 'ACTIVE' },
        roles: createdRoles,
      }, { status: 201 });
    }

    // ── SUSPEND action ────────────────────────────────────────────────
    if (action === 'suspend') {
      if (company.onboardingStatus !== 'ACTIVE') {
        return NextResponse.json(
          { error: `Can only suspend ACTIVE accounts. Current status: ${company.onboardingStatus}` },
          { status: 422 }
        );
      }

      await db.tenantCompany.update({
        where: { id: companyId },
        data: { onboardingStatus: 'SUSPENDED', isActive: false },
      });

      await logAudit({
        action: AuditAction.SETTINGS_CHANGE,
        entityType: 'TenantCompany',
        entityId: companyId,
        description: `Account "${company.companyName}" suspended`,
        oldValues: { onboardingStatus: 'ACTIVE', isActive: true },
        newValues: { onboardingStatus: 'SUSPENDED', isActive: false },
        severity: 'warning',
        req: request,
      });

      return NextResponse.json({
        success: true,
        message: `Account "${company.companyName}" suspended`,
        company: { id: company.id, companyCode: company.companyCode, onboardingStatus: 'SUSPENDED' },
      });
    }

    // ── ACTIVATE action ───────────────────────────────────────────────
    if (action === 'activate') {
      if (company.onboardingStatus !== 'SUSPENDED') {
        return NextResponse.json(
          { error: `Can only activate SUSPENDED accounts. Current status: ${company.onboardingStatus}` },
          { status: 422 }
        );
      }

      await db.tenantCompany.update({
        where: { id: companyId },
        data: { onboardingStatus: 'ACTIVE', isActive: true },
      });

      await logAudit({
        action: AuditAction.SETTINGS_CHANGE,
        entityType: 'TenantCompany',
        entityId: companyId,
        description: `Account "${company.companyName}" activated`,
        oldValues: { onboardingStatus: 'SUSPENDED', isActive: false },
        newValues: { onboardingStatus: 'ACTIVE', isActive: true },
        req: request,
      });

      return NextResponse.json({
        success: true,
        message: `Account "${company.companyName}" activated`,
        company: { id: company.id, companyCode: company.companyCode, onboardingStatus: 'ACTIVE' },
      });
    }

    return NextResponse.json({ error: 'Unknown action. Use: provision, suspend, or activate' }, { status: 400 });
  } catch (error) {
    console.error('Company Lifecycle POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
