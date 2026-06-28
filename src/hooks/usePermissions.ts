/**
 * usePermissions — React hook for Stibo-style RBAC permission checks
 *
 * This hook reads the current user's roles from the app store and provides
 * granular permission checking. It uses the RBAC system defined in @/lib/rbac.
 *
 * Usage:
 *   const perms = usePermissions();
 *   if (perms.canCreate) { ... }
 *   <Button disabled={!perms.canEdit}>Edit</Button>
 */

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import {
  hasPermission,
  canWrite as checkCanWrite,
  isSuperAdmin as checkIsSuperAdmin,
  isViewerOnly as checkIsViewerOnly,
  PERMISSIONS,
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

  // DAM permissions
  canUploadAssets: boolean;
  canDeleteAssets: boolean;
  canManageAssets: boolean;

  // Integration permissions
  canEditIntegration: boolean;

  // Utility
  canWrite: boolean;          // Any write operation
  isViewerOnly: boolean;      // Strictly read-only user
  isSuperAdmin: boolean;      // Full access
  isReadOnly: boolean;        // Same as isViewerOnly — convenience alias

  // Generic permission check
  hasPermission: (permission: string) => boolean;

  // Role info
  roles: string[];
}

export function usePermissions(): PermissionSet {
  const user = useAppStore((s) => s.user);

  return useMemo(() => {
    const roles = user?.roles ?? [];

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

      canUploadAssets: hasPermission(roles, PERMISSIONS.DAM_UPLOAD),
      canDeleteAssets: hasPermission(roles, PERMISSIONS.DAM_DELETE),
      canManageAssets: hasPermission(roles, PERMISSIONS.DAM_MANAGE),

      canEditIntegration: hasPermission(roles, PERMISSIONS.INTEGRATION_WRITE),

      canWrite: checkCanWrite(roles),
      isViewerOnly: checkIsViewerOnly(roles),
      isSuperAdmin: checkIsSuperAdmin(roles),
      isReadOnly: checkIsViewerOnly(roles),

      hasPermission: (permission: string) => hasPermission(roles, permission),

      roles,
    };

    return perms;
  }, [user?.roles]);
}
