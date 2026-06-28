/**
 * usePermissions — React hook for Stibo-style RBAC permission checks
 *
 * This hook reads the current user's roles from the app store and provides
 * granular permission checking. It uses the RBAC system defined in @/lib/rbac.
 *
 * Multi-tenant aware: tenant-scoped permissions (tenant:*) are validated
 * against the user's own companyId to enforce company boundary isolation.
 *
 * Usage:
 *   const perms = usePermissions();
 *   if (perms.canCreate) { ... }
 *   <Button disabled={!perms.canEdit}>Edit</Button>
 *   if (perms.canManageTenant) { ... }
 */

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import {
  hasPermission,
  canWrite as checkCanWrite,
  isSuperAdmin as checkIsSuperAdmin,
  isCompanyAdmin as checkIsCompanyAdmin,
  isViewerOnly as checkIsViewerOnly,
  canManageTenant as checkCanManageTenant,
  PERMISSIONS,
  type PermissionContext,
} from '@/lib/rbac';

export interface PermissionSet {
  // Core permission checks
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
  canImport: boolean;
  canBulk: boolean;

  // Schema permissions
  canEditSchema: boolean;

  // Admin permissions
  canAdmin: boolean;

  // AI permissions
  canEditAI: boolean;

  // Company-scoped AI config permissions
  canViewCompanyAiConfig: boolean;
  canEditCompanyAiConfig: boolean;

  // DAM permissions
  canUploadAssets: boolean;
  canDeleteAssets: boolean;
  canManageAssets: boolean;

  // Integration permissions
  canEditIntegration: boolean;

  // Tenant management permissions
  canManageTenant: boolean;    // Can manage own company settings/branding/onboarding
  isCompanyAdmin: boolean;     // Is Company Admin (NOT necessarily Super Admin)

  // Utility
  canWrite: boolean;          // Any write operation
  isViewerOnly: boolean;      // Strictly read-only user
  isSuperAdmin: boolean;      // Full access
  isReadOnly: boolean;        // Same as isViewerOnly — convenience alias

  // Generic permission check
  hasPermission: (permission: string) => boolean;

  // Role info
  roles: string[];

  // User's company context
  companyId: string | null;
}

export function usePermissions(): PermissionSet {
  const user = useAppStore((s) => s.user);

  return useMemo(() => {
    const roles = user?.roles ?? [];
    const companyId = user?.companyId ?? null;

    // Build permission context for tenant-scoped checks
    // When checking tenant permissions, the user's own companyId is both
    // the source and the target (i.e. "can I manage MY company?")
    const tenantContext: PermissionContext = {
      userCompanyId: companyId ?? undefined,
      targetCompanyId: companyId ?? undefined,
    };

    const perms: PermissionSet = {
      canCreate: hasPermission(roles, PERMISSIONS.DATA_CREATE),
      canEdit: hasPermission(roles, PERMISSIONS.DATA_EDIT),
      canDelete: hasPermission(roles, PERMISSIONS.DATA_DELETE),
      canApprove: hasPermission(roles, PERMISSIONS.DATA_APPROVE),
      canExport: hasPermission(roles, PERMISSIONS.DATA_EXPORT),
      canImport: hasPermission(roles, PERMISSIONS.DATA_IMPORT),
      canBulk: hasPermission(roles, PERMISSIONS.DATA_BULK),

      canEditSchema: hasPermission(roles, PERMISSIONS.SCHEMA_WRITE),

      canAdmin: hasPermission(roles, PERMISSIONS.ADMIN_WRITE),

      canEditAI: hasPermission(roles, PERMISSIONS.AI_WRITE),

      // Company-scoped AI config: Super Admin or Company Admin of own company
      canViewCompanyAiConfig: hasPermission(roles, PERMISSIONS.AI_CONFIG_VIEW, tenantContext),
      canEditCompanyAiConfig: hasPermission(roles, PERMISSIONS.AI_CONFIG_EDIT, tenantContext),

      canUploadAssets: hasPermission(roles, PERMISSIONS.DAM_UPLOAD),
      canDeleteAssets: hasPermission(roles, PERMISSIONS.DAM_DELETE),
      canManageAssets: hasPermission(roles, PERMISSIONS.DAM_MANAGE),

      canEditIntegration: hasPermission(roles, PERMISSIONS.INTEGRATION_WRITE),

      // Tenant management: Super Admin for any tenant, Company Admin for own tenant
      canManageTenant: companyId
        ? checkCanManageTenant(companyId, companyId, roles)
        : false,
      isCompanyAdmin: checkIsCompanyAdmin(roles),

      canWrite: checkCanWrite(roles),
      isViewerOnly: checkIsViewerOnly(roles),
      isSuperAdmin: checkIsSuperAdmin(roles),
      isReadOnly: checkIsViewerOnly(roles),

      hasPermission: (permission: string) => hasPermission(roles, permission, tenantContext),

      roles,

      companyId,
    };

    return perms;
  }, [user?.roles, user?.companyId]);
}
