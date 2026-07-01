'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { ROLE_TYPE_INFO } from '@/lib/rbac';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Shield, Plus, MoreVertical, Pencil, Trash2, Eye, Users, Lock,
  CheckCircle, Crown, Settings, AlertTriangle, Info, ShieldAlert,
  Building2, Copy, Globe, LayoutGrid, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────
interface PermissionRow {
  moduleId: string;
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
  canImport: boolean;
  canBulkUpdate: boolean;
}

interface RoleData {
  id: string;
  roleName: string;
  description: string | null;
  roleType: string;
  scope: string;
  isSystem: boolean;
  isGlobal: boolean;
  companyId: string;
  color: string | null;
  icon: string | null;
  dataScope: string | null;
  scopeConfig: string | null;
  permissionCount: number;
  userCount: number;
  assignedUsers?: Array<{ id: string; username: string; displayName: string | null }>;
  company?: { id: string; companyCode: string; companyName: string } | null;
  permissions: Array<{
    id: string;
    moduleId: string;
    module: { id: string; moduleCode: string; moduleName: string };
    canRead: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    canExport: boolean;
    canImport: boolean;
    canBulkUpdate: boolean;
    columnRestrictions: string | null;
    rowFilter: string | null;
  }>;
}

// ── Permission column definitions ──────────────────────────────────
const PERMISSION_COLUMNS = [
  { key: 'canRead', label: 'Read', shortLabel: 'R' },
  { key: 'canCreate', label: 'Create', shortLabel: 'C' },
  { key: 'canEdit', label: 'Edit', shortLabel: 'E' },
  { key: 'canDelete', label: 'Delete', shortLabel: 'D' },
  { key: 'canApprove', label: 'Approve', shortLabel: 'A' },
  { key: 'canExport', label: 'Export', shortLabel: 'Ex' },
  { key: 'canImport', label: 'Import', shortLabel: 'Im' },
  { key: 'canBulkUpdate', label: 'Bulk', shortLabel: 'B' },
] as const;

const WRITE_PERMISSION_KEYS = ['canCreate', 'canEdit', 'canDelete', 'canApprove', 'canExport', 'canImport', 'canBulkUpdate'] as const;

// ── Role type icon map ─────────────────────────────────────────────
const ROLE_ICON_MAP: Record<string, React.ReactNode> = {
  Eye: <Eye className="w-4 h-4" />,
  Pencil: <Pencil className="w-4 h-4" />,
  CheckCircle: <CheckCircle className="w-4 h-4" />,
  Shield: <Shield className="w-4 h-4" />,
  Settings: <Settings className="w-4 h-4" />,
  Crown: <Crown className="w-4 h-4" />,
  Building2: <Building2 className="w-4 h-4" />,
};

// ── Role type badge colors ─────────────────────────────────────────
function getRoleTypeBadgeStyle(roleType: string): { bg: string; text: string; border: string } {
  const info = ROLE_TYPE_INFO[roleType];
  const color = info?.color || '#6b7280';
  return {
    bg: `${color}18`,
    text: color,
    border: `${color}40`,
  };
}

// ── Main Component ─────────────────────────────────────────────────
export default function AdminRolesPage() {
  const { token, user: currentUser } = useAppStore();
  const perms = usePermissions();
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleData | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleData | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [expandedUserLists, setExpandedUserLists] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    roleName: '',
    description: '',
    roleType: 'VIEWER' as string,
    scope: 'MODULE_LEVEL' as string,
    permissions: [] as PermissionRow[],
    selectedModuleIds: [] as string[],
    dataScope: '' as string,
    scopeConfigBrands: '',
    scopeConfigCountries: '',
    scopeConfigTeams: '',
  });
  const [saving, setSaving] = useState(false);

  // Company filter for multi-tenant isolation
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');

  // Duplicate to company dialog
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<RoleData | null>(null);
  const [duplicateTargetCompanyId, setDuplicateTargetCompanyId] = useState<string>('');
  const [duplicating, setDuplicating] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [rRes, mRes, cRes] = await Promise.all([
        fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const rData = await rRes.json();
      const mData = await mRes.json();
      const cData = await cRes.json();
      setRoles(rData.roles || []);
      setModules(mData.modules || []);
      setCompanies(cData.companies || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-set company filter for non-Super-Admin users
  useEffect(() => {
    if (!perms.isSuperAdmin && currentUser?.companyId && companyFilter === 'ALL') {
      setCompanyFilter(currentUser.companyId);
    }
  }, [perms.isSuperAdmin, currentUser?.companyId, companyFilter]);

  // ── Filtered roles based on company ──────────────────────────────────
  const filteredRoles = useMemo(() => {
    if (companyFilter === 'ALL') return roles;
    // Show roles that belong to the selected company + global roles (isGlobal=true)
    return roles.filter((r) => r.isGlobal || r.companyId === companyFilter);
  }, [roles, companyFilter]);

  // Determine if current form roleType is VIEWER (read-only)
  const isViewerType = form.roleType === 'VIEWER';

  // When roleType changes, enforce viewer read-only constraints
  const handleRoleTypeChange = (newType: string) => {
    setForm((prev) => {
      const isViewer = newType === 'VIEWER';
      return {
        ...prev,
        roleType: newType,
        permissions: prev.permissions.map((p) => ({
          ...p,
          canRead: isViewer ? true : p.canRead,
          canCreate: isViewer ? false : p.canCreate,
          canEdit: isViewer ? false : p.canEdit,
          canDelete: isViewer ? false : p.canDelete,
          canApprove: isViewer ? false : p.canApprove,
          canExport: isViewer ? false : p.canExport,
          canImport: isViewer ? false : p.canImport,
          canBulkUpdate: isViewer ? false : p.canBulkUpdate,
        })),
      };
    });
  };

  // Handle scope change: when switching to GLOBAL, auto-select all modules
  const handleScopeChange = (newScope: string) => {
    setForm((prev) => {
      if (newScope === 'GLOBAL') {
        // For GLOBAL scope, include all modules with default permissions
        const isViewer = prev.roleType === 'VIEWER';
        const allModuleIds = modules.map((m) => m.id);
        const existingPermMap = new Map(prev.permissions.map((p) => [p.moduleId, p]));
        const newPerms = modules.map((m) => {
          const existing = existingPermMap.get(m.id);
          if (existing) return existing;
          return {
            moduleId: m.id,
            canRead: true,
            canCreate: isViewer ? false : false,
            canEdit: isViewer ? false : false,
            canDelete: isViewer ? false : false,
            canApprove: isViewer ? false : false,
            canExport: isViewer ? false : false,
            canImport: isViewer ? false : false,
            canBulkUpdate: isViewer ? false : false,
          };
        });
        return { ...prev, scope: newScope, selectedModuleIds: allModuleIds, permissions: newPerms };
      } else {
        return { ...prev, scope: newScope };
      }
    });
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const scopeConfig: Record<string, string[]> = {};
      if (form.scopeConfigBrands) {
        try { scopeConfig.brands = JSON.parse(form.scopeConfigBrands); } catch { /* ignore */ }
      }
      if (form.scopeConfigCountries) {
        try { scopeConfig.countries = JSON.parse(form.scopeConfigCountries); } catch { /* ignore */ }
      }
      if (form.scopeConfigTeams) {
        try { scopeConfig.teams = JSON.parse(form.scopeConfigTeams); } catch { /* ignore */ }
      }

      const payload = {
        id: editRole?.id,
        roleName: form.roleName,
        description: form.description,
        roleType: form.roleType,
        scope: form.scope,
        permissions: form.permissions,
        dataScope: form.dataScope || null,
        scopeConfig: Object.keys(scopeConfig).length > 0 ? JSON.stringify(scopeConfig) : null,
        // Auto-assign companyId based on filter for new roles
        ...(!editRole && companyFilter !== 'ALL' ? { companyId: companyFilter } : {}),
      };

      if (editRole) {
        const res = await fetch('/api/admin/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update user group'); return; }
        toast.success('User Group updated successfully');
      } else {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create user group'); return; }
        toast.success('User Group created successfully');
      }
      setDialogOpen(false);
      setEditRole(null);
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !roleToDelete) return;
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: roleToDelete.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete user group'); return; }
      toast.success('User Group deleted successfully');
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleDuplicateToCompany = async () => {
    if (!token || !duplicateSource || !duplicateTargetCompanyId) return;
    setDuplicating(true);
    try {
      const res = await fetch('/api/admin/roles/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sourceRoleId: duplicateSource.id,
          targetCompanyId: duplicateTargetCompanyId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to duplicate user group'); return; }
      toast.success(`User Group "${duplicateSource.roleName}" duplicated to target account`);
      setDuplicateDialogOpen(false);
      setDuplicateSource(null);
      setDuplicateTargetCompanyId('');
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setDuplicating(false);
    }
  };

  const openEdit = (r: RoleData) => {
    setEditRole(r);
    const perms = r.permissions?.map((p) => ({
      moduleId: p.moduleId,
      canRead: p.canRead,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      canApprove: p.canApprove,
      canExport: p.canExport,
      canImport: p.canImport,
      canBulkUpdate: p.canBulkUpdate,
    })) || [];
    // Normalize scope: treat 'MODULE' as 'MODULE_LEVEL' for backward compatibility
    const normalizedScope = (r.scope === 'MODULE' || r.scope === 'MODULE_LEVEL') ? 'MODULE_LEVEL' : r.scope || 'MODULE_LEVEL';
    // Parse scopeConfig for RLS
    let scopeConfigBrands = '';
    let scopeConfigCountries = '';
    let scopeConfigTeams = '';
    if (r.scopeConfig) {
      try {
        const config = typeof r.scopeConfig === 'string' ? JSON.parse(r.scopeConfig) : r.scopeConfig;
        if (config.brands) scopeConfigBrands = JSON.stringify(config.brands);
        if (config.countries) scopeConfigCountries = JSON.stringify(config.countries);
        if (config.teams) scopeConfigTeams = JSON.stringify(config.teams);
      } catch { /* ignore */ }
    }
    setForm({
      roleName: r.roleName,
      description: r.description || '',
      roleType: r.roleType || 'VIEWER',
      scope: normalizedScope,
      permissions: perms,
      selectedModuleIds: perms.map((p) => p.moduleId),
      dataScope: r.dataScope || '',
      scopeConfigBrands,
      scopeConfigCountries,
      scopeConfigTeams,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditRole(null);
    setForm({
      roleName: '',
      description: '',
      roleType: 'VIEWER',
      scope: 'MODULE_LEVEL',
      permissions: [],
      selectedModuleIds: [],
      dataScope: '',
      scopeConfigBrands: '',
      scopeConfigCountries: '',
      scopeConfigTeams: '',
    });
    setDialogOpen(true);
  };

  // Toggle a module in/out of the selectedModuleIds set
  const toggleModuleSelection = (moduleId: string, selected: boolean) => {
    setForm((prev) => {
      let newSelectedIds: string[];
      let newPermissions: PermissionRow[];

      if (selected) {
        newSelectedIds = [...prev.selectedModuleIds, moduleId];
        // Add a default permission entry if not present
        if (!prev.permissions.find((p) => p.moduleId === moduleId)) {
          const isViewer = prev.roleType === 'VIEWER';
          newPermissions = [...prev.permissions, {
            moduleId,
            canRead: true, // Default: read access
            canCreate: isViewer ? false : false,
            canEdit: isViewer ? false : false,
            canDelete: isViewer ? false : false,
            canApprove: isViewer ? false : false,
            canExport: isViewer ? false : false,
            canImport: isViewer ? false : false,
            canBulkUpdate: isViewer ? false : false,
          }];
        } else {
          newPermissions = prev.permissions;
        }
      } else {
        newSelectedIds = prev.selectedModuleIds.filter((id) => id !== moduleId);
        // Remove permission entry for unselected module
        newPermissions = prev.permissions.filter((p) => p.moduleId !== moduleId);
      }

      return { ...prev, selectedModuleIds: newSelectedIds, permissions: newPermissions };
    });
  };

  // Select all modules
  const selectAllModules = () => {
    setForm((prev) => {
      const isViewer = prev.roleType === 'VIEWER';
      const allModuleIds = modules.map((m) => m.id);
      const existingPermModuleIds = new Set(prev.permissions.map((p) => p.moduleId));
      // Add default permission entries for any modules not yet in permissions
      const newPerms = [...prev.permissions];
      for (const mId of allModuleIds) {
        if (!existingPermModuleIds.has(mId)) {
          newPerms.push({
            moduleId: mId,
            canRead: true,
            canCreate: isViewer ? false : false,
            canEdit: isViewer ? false : false,
            canDelete: isViewer ? false : false,
            canApprove: isViewer ? false : false,
            canExport: isViewer ? false : false,
            canImport: isViewer ? false : false,
            canBulkUpdate: isViewer ? false : false,
          });
        }
      }
      return { ...prev, selectedModuleIds: allModuleIds, permissions: newPerms };
    });
  };

  // Deselect all modules
  const deselectAllModules = () => {
    setForm((prev) => ({ ...prev, selectedModuleIds: [], permissions: [] }));
  };

  const togglePermission = (moduleId: string, permKey: string) => {
    if (isViewerType && permKey !== 'canRead') return;

    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.map((p) =>
        p.moduleId === moduleId ? { ...p, [permKey]: !p[permKey as keyof PermissionRow] } : p
      ),
    }));
  };

  const toggleAllWrite = (moduleId: string, enable: boolean) => {
    if (isViewerType) return;
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.map((p) =>
        p.moduleId === moduleId ? {
          ...p,
          canCreate: enable,
          canEdit: enable,
          canDelete: enable,
          canApprove: enable,
          canExport: enable,
          canImport: enable,
          canBulkUpdate: enable,
        } : p
      ),
    }));
  };

  const ensurePermission = (moduleId: string): PermissionRow => {
    const existing = form.permissions.find((p) => p.moduleId === moduleId);
    if (existing) return existing;
    const base: PermissionRow = {
      moduleId,
      canRead: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
      canImport: false,
      canBulkUpdate: false,
    };
    setForm((prev) => ({ ...prev, permissions: [...prev.permissions, base] }));
    return base;
  };

  const toggleRoleExpand = (roleId: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const toggleUserList = (roleId: string) => {
    setExpandedUserLists((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  // ── Compute role type stats ──────────────────────────────────────
  const roleTypeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    Object.keys(ROLE_TYPE_INFO).forEach((key) => { stats[key] = 0; });
    filteredRoles.forEach((r) => {
      const rt = r.roleType || 'VIEWER';
      stats[rt] = (stats[rt] || 0) + 1;
    });
    return stats;
  }, [filteredRoles]);

  // ── Loading State ────────────────────────────────────────────────
  if (!perms.canAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <ShieldAlert className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">You do not have permission to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-11 w-28" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">User Groups & Privilege Rules</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Configure user groups and their privilege rules (Stibo RBAC)
            </p>
          </div>

        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add User Group
        </Button>
      </div>

      {/* ── Company Filter ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <Label className="text-sm font-medium whitespace-nowrap">Filter by Account:</Label>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            {perms.isSuperAdmin && (
              <SelectItem value="ALL">All Accounts</SelectItem>
            )}
            {companies.filter((c) => c.isActive).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.companyName} ({c.companyCode})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {companyFilter !== 'ALL' && (
          <Badge variant="outline" className="text-xs">
            Showing {filteredRoles.length} group{filteredRoles.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* ── Role Type Summary Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
        {Object.entries(ROLE_TYPE_INFO).map(([key, info]) => {
          const style = getRoleTypeBadgeStyle(key);
          const count = roleTypeStats[key] || 0;
          return (
            <Card key={key} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {ROLE_ICON_MAP[info.icon] || <Shield className="w-4 h-4" />}
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: style.text }}>
                    {key.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{info.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Role Cards ──────────────────────────────────────────── */}
      <div className="space-y-4">
        {filteredRoles.length === 0 && (
          <Card className="shadow-sm">
            <CardContent className="p-8 text-center">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No user groups found for the selected account</p>
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Create First User Group
              </Button>
            </CardContent>
          </Card>
        )}

        {filteredRoles.map((role) => {
          const roleType = role.roleType || 'VIEWER';
          const typeInfo = ROLE_TYPE_INFO[roleType];
          const style = getRoleTypeBadgeStyle(roleType);
          const isExpanded = expandedRoles.has(role.id);
          const isViewer = roleType === 'VIEWER';
          const isUserListExpanded = expandedUserLists.has(role.id);
          const companyName = role.company?.companyName || (role.isGlobal ? 'System' : '-');

          return (
            <Card key={role.id} className="shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {ROLE_ICON_MAP[typeInfo?.icon || role.icon || 'Shield'] || <Shield className="w-4 h-4" />}
                      </div>
                      {role.roleName}
                    </CardTitle>

                    {/* Group Type badge */}
                    <Badge
                      className="text-xs font-semibold border"
                      style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        borderColor: style.border,
                      }}
                    >
                      {typeInfo?.label || roleType}
                    </Badge>

                    {/* Global badge */}
                    {role.isGlobal && (
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                        <Globe className="w-3 h-3 mr-1" /> Global
                      </Badge>
                    )}

                    {/* READ-ONLY badge for Viewer */}
                    {isViewer && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        <Lock className="w-3 h-3 mr-1" /> READ-ONLY
                      </Badge>
                    )}

                    {/* System role badge */}
                    {role.isSystem && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        <Lock className="w-3 h-3 mr-1" /> System
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {role.description || typeInfo?.description || 'No description'}
                  </CardDescription>

                  {/* Meta info row */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> {companyName}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <button
                        className="hover:underline cursor-pointer"
                        onClick={() => toggleUserList(role.id)}
                      >
                        {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                      </button>
                    </span>
                    <span>•</span>
                    <span>{role.permissionCount} privilege rule{role.permissionCount !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>Scope: {role.scope === 'MODULE' || role.scope === 'MODULE_LEVEL' ? 'Module-level' : role.scope === 'GLOBAL' ? 'Global' : role.scope || 'Module-level'}</span>
                    {role.dataScope && (
                      <>
                        <span>•</span>
                        <Badge variant="outline" className="text-[10px]">
                          RLS: {role.dataScope}
                        </Badge>
                      </>
                    )}
                  </div>

                  {/* ── Expandable User List ──────────────────────── */}
                  {isUserListExpanded && (
                    <div className="mt-2 rounded-lg border bg-muted/30 p-2 text-sm">
                      <p className="text-xs font-semibold mb-1 text-muted-foreground">Assigned Users:</p>
                      {role.assignedUsers && role.assignedUsers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {role.assignedUsers.map((u) => (
                            <Badge key={u.id} variant="outline" className="text-xs">
                              {u.displayName || u.username}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No users assigned to this group</p>
                      )}
                    </div>
                  )}

                  {/* ── Module assignment display (MODULE_LEVEL scope) ── */}
                  {(role.scope === 'MODULE_LEVEL' || role.scope === 'MODULE') && role.permissions && role.permissions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {role.permissions.map((p) => (
                        <Badge key={p.moduleId} variant="secondary" className="text-[10px]">
                          {p.module?.moduleName || p.moduleId}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {(role.scope === 'MODULE_LEVEL' || role.scope === 'MODULE') && (!role.permissions || role.permissions.length === 0) && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span>No modules assigned — edit this group to select modules</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => toggleRoleExpand(role.id)}
                  >
                    {isExpanded ? 'Collapse' : 'Expand'}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => openEdit(role)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit User Group
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleRoleExpand(role.id)}>
                        <Eye className="w-4 h-4 mr-2" /> {isExpanded ? 'Hide' : 'View'} Privilege Rules
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleUserList(role.id)}>
                        <Users className="w-4 h-4 mr-2" /> {isUserListExpanded ? 'Hide' : 'Show'} Users
                      </DropdownMenuItem>
                      {/* Duplicate to Company */}
                      <DropdownMenuItem
                        onClick={() => {
                          setDuplicateSource(role);
                          setDuplicateTargetCompanyId('');
                          setDuplicateDialogOpen(true);
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" /> Duplicate to Account
                      </DropdownMenuItem>
                      {!role.isSystem && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setRoleToDelete(role);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete User Group
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              {/* ── Expanded Permission Matrix ──────────────────── */}
              {isExpanded && role.permissions?.length > 0 && (
                <CardContent className="pt-0">
                  <Separator className="mb-4" />
                  <div className="max-h-80 overflow-y-auto custom-scrollbar rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[140px] sticky left-0 bg-background z-10">Module</TableHead>
                          {PERMISSION_COLUMNS.map((col) => (
                            <TableHead key={col.key} className="text-center px-2 min-w-[60px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{col.shortLabel}</span>
                                </TooltipTrigger>
                                <TooltipContent>{col.label}</TooltipContent>
                              </Tooltip>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {role.permissions.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm font-medium sticky left-0 bg-background z-10">
                              {p.module?.moduleName || '-'}
                            </TableCell>
                            {PERMISSION_COLUMNS.map((col) => {
                              const val = p[col.key as keyof typeof p];
                              const isWritePerm = WRITE_PERMISSION_KEYS.includes(col.key as typeof WRITE_PERMISSION_KEYS[number]);
                              return (
                                <TableCell key={col.key} className="text-center px-2">
                                  <span
                                    className={cn(
                                      'inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold',
                                      val
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                        : isWritePerm && isViewer
                                          ? 'bg-muted text-muted-foreground/30'
                                          : 'bg-muted/50 text-muted-foreground/50'
                                    )}
                                  >
                                    {val ? '✓' : '—'}
                                  </span>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {isViewer && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-amber-600 dark:text-amber-400">
                      <Lock className="w-3.5 h-3.5" />
                      <span>All write privilege rules are disabled for Viewer groups (READ-ONLY)</span>
                    </div>
                  )}
                </CardContent>
              )}

              {isExpanded && (!role.permissions || role.permissions.length === 0) && (
                <CardContent className="pt-0">
                  <Separator className="mb-4" />
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No privilege rules configured for this user group
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Create / Edit Dialog ────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editRole ? 'Edit User Group' : 'Create New User Group'}
            </DialogTitle>
            <DialogDescription>
              Configure user group name, group type, and granular privilege rules following Stibo RBAC best practices
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
            {/* User Group info section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="roleName" className="text-sm font-medium">Group Name *</Label>
                <Input
                  id="roleName"
                  placeholder="e.g. Regional Manager"
                  value={form.roleName}
                  onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleDesc" className="text-sm font-medium">Description</Label>
                <Input
                  id="roleDesc"
                  placeholder="Brief description of the user group"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Group Type Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Group Type *</Label>
                <Select
                  value={form.roleType}
                  onValueChange={handleRoleTypeChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select group type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_TYPE_INFO).map(([key, info]) => {
                      const style = getRoleTypeBadgeStyle(key);
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center"
                              style={{ backgroundColor: style.bg, color: style.text }}
                            >
                              {ROLE_ICON_MAP[info.icon] || <Shield className="w-3 h-3" />}
                            </div>
                            <span>{info.label}</span>
                            <span className="text-muted-foreground text-xs">— {info.description}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Scope Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Scope</Label>
                <Select
                  value={form.scope}
                  onValueChange={handleScopeChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MODULE_LEVEL">
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4" />
                        <span>Module-level</span>
                        <span className="text-muted-foreground text-xs">— Select specific modules</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="GLOBAL">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <span>Global</span>
                        <span className="text-muted-foreground text-xs">— All modules access</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Auto-assigned account info */}
            {!editRole && companyFilter !== 'ALL' && (
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">This user group will be assigned to:</span>
                <Badge variant="outline" className="text-xs">
                  {companies.find((c) => c.id === companyFilter)?.companyName || 'Selected Account'}
                </Badge>
              </div>
            )}

            {/* Group type info banner */}
            {form.roleType && ROLE_TYPE_INFO[form.roleType] && (
              <div
                className="flex items-start gap-3 rounded-lg p-3 border"
                style={{
                  backgroundColor: getRoleTypeBadgeStyle(form.roleType).bg,
                  borderColor: getRoleTypeBadgeStyle(form.roleType).border,
                }}
              >
                <div style={{ color: getRoleTypeBadgeStyle(form.roleType).text }}>
                  {ROLE_ICON_MAP[ROLE_TYPE_INFO[form.roleType].icon] || <Info className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: getRoleTypeBadgeStyle(form.roleType).text }}>
                    {ROLE_TYPE_INFO[form.roleType].label} Group
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ROLE_TYPE_INFO[form.roleType].description}
                  </p>
                  {isViewerType && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> All write privilege rules are disabled — this is a READ-ONLY group
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Module Selection (only for MODULE_LEVEL scope) ──────── */}
            {form.scope === 'MODULE_LEVEL' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Select Modules</Label>
                    <Badge variant="outline" className="text-xs">
                      {form.selectedModuleIds.length} of {modules.length} selected
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={selectAllModules}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={deselectAllModules}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                {modules.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No modules available. Create modules first.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {modules.map((m) => {
                      const isSelected = form.selectedModuleIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleModuleSelection(m.id, !isSelected)}
                          className={cn(
                            'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-sm',
                            isSelected
                              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                              : 'border-muted bg-background hover:border-muted-foreground/30 hover:bg-accent/30'
                          )}
                        >
                          <div className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                            isSelected
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-muted-foreground/40'
                          )}>
                            {isSelected && <CheckCircle className="w-3 h-3" />}
                          </div>
                          <span className={cn(
                            'truncate',
                            isSelected ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                          )}>
                            {m.moduleName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {form.selectedModuleIds.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Module-level scope requires at least one module to be selected. Select modules above to configure privilege rules.</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Global scope info ──────────────────────────────── */}
            {form.scope === 'GLOBAL' && (
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20 text-sm">
                <Globe className="w-4 h-4 text-blue-600" />
                <span className="text-blue-700 dark:text-blue-400">Global scope grants access to <strong>all modules</strong>. Configure privilege rules per module below.</span>
              </div>
            )}

            <Separator />

            {/* ── RLS Data Scope ──────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Data Scope (Row-Level Security)</Label>
              </div>
              <Select value={form.dataScope || 'COMPANY'} onValueChange={(v) => setForm({ ...form, dataScope: v === 'COMPANY' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select data scope" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY">Company (default)</SelectItem>
                  <SelectItem value="ALL">All (no row-level restrictions)</SelectItem>
                  <SelectItem value="BRAND">Brand-scoped</SelectItem>
                  <SelectItem value="COUNTRY">Country-scoped</SelectItem>
                  <SelectItem value="TEAM">Team-scoped</SelectItem>
                  <SelectItem value="CUSTOM">Custom (brand + country + team)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Controls which data rows users with this role can access within permitted modules</p>
              {(form.dataScope === 'BRAND' || form.dataScope === 'CUSTOM') && (
                <div className="space-y-1">
                  <Label className="text-xs">Allowed Brands (JSON array)</Label>
                  <Input
                    placeholder='e.g. ["Nike","Adidas","New Balance"]'
                    value={form.scopeConfigBrands}
                    onChange={(e) => setForm({ ...form, scopeConfigBrands: e.target.value })}
                  />
                </div>
              )}
              {(form.dataScope === 'COUNTRY' || form.dataScope === 'CUSTOM') && (
                <div className="space-y-1">
                  <Label className="text-xs">Allowed Countries (JSON array)</Label>
                  <Input
                    placeholder='e.g. ["ID","SG","MY"]'
                    value={form.scopeConfigCountries}
                    onChange={(e) => setForm({ ...form, scopeConfigCountries: e.target.value })}
                  />
                </div>
              )}
              {(form.dataScope === 'TEAM' || form.dataScope === 'CUSTOM') && (
                <div className="space-y-1">
                  <Label className="text-xs">Allowed Teams (JSON array)</Label>
                  <Input
                    placeholder='e.g. ["Map Corporate","MAPI Operations"]'
                    value={form.scopeConfigTeams}
                    onChange={(e) => setForm({ ...form, scopeConfigTeams: e.target.value })}
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* ── Privilege Rule Matrix ──────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Privilege Rule Matrix
                  {form.scope === 'MODULE_LEVEL' && form.selectedModuleIds.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">({form.selectedModuleIds.length} module{form.selectedModuleIds.length !== 1 ? 's' : ''})</span>
                  )}
                </Label>
                {!isViewerType && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          permissions: prev.permissions.map((p) => ({
                            ...p,
                            canRead: true,
                            canCreate: true,
                            canEdit: true,
                            canDelete: true,
                            canApprove: true,
                            canExport: true,
                            canImport: true,
                            canBulkUpdate: true,
                          })),
                        }));
                      }}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          permissions: prev.permissions.map((p) => ({
                            ...p,
                            canRead: false,
                            canCreate: false,
                            canEdit: false,
                            canDelete: false,
                            canApprove: false,
                            canExport: false,
                            canImport: false,
                            canBulkUpdate: false,
                          })),
                        }));
                      }}
                    >
                      Clear All
                    </Button>
                  </div>
                )}
              </div>

              {(form.scope === 'MODULE_LEVEL' && form.selectedModuleIds.length === 0) ? (
                <div className="border rounded-lg p-8 text-center bg-muted/20">
                  <LayoutGrid className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Select modules above to configure privilege rules</p>
                </div>
              ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[40vh] overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px] sticky left-0 bg-background z-20">Module</TableHead>
                        {PERMISSION_COLUMNS.map((col) => {
                          const isWrite = WRITE_PERMISSION_KEYS.includes(col.key as typeof WRITE_PERMISSION_KEYS[number]);
                          return (
                            <TableHead key={col.key} className="text-center px-2 min-w-[68px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={cn(
                                    'cursor-help flex flex-col items-center',
                                    isWrite && isViewerType && 'opacity-30'
                                  )}>
                                    <span className="text-xs">{col.shortLabel}</span>
                                    <span className="text-[10px] text-muted-foreground hidden lg:block">{col.label}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {col.label}
                                  {isWrite && isViewerType && ' (Disabled for Viewer)'}
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                          );
                        })}
                        {!isViewerType && (
                          <TableHead className="text-center px-2 min-w-[68px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-xs">All W</span>
                              </TooltipTrigger>
                              <TooltipContent>Toggle all write privilege rules</TooltipContent>
                            </Tooltip>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(form.scope === 'MODULE_LEVEL'
                        ? modules.filter((m) => form.selectedModuleIds.includes(m.id))
                        : modules
                      ).map((m) => {
                        const perm = form.permissions.find((p) => p.moduleId === m.id) || ensurePermission(m.id);
                        const allWriteOn = WRITE_PERMISSION_KEYS.every((k) => perm[k as keyof PermissionRow] as boolean);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="text-sm font-medium sticky left-0 bg-background z-10">
                              {m.moduleName}
                            </TableCell>
                            {PERMISSION_COLUMNS.map((col) => {
                              const isWrite = WRITE_PERMISSION_KEYS.includes(col.key as typeof WRITE_PERMISSION_KEYS[number]);
                              const isDisabled = isViewerType && isWrite;
                              return (
                                <TableCell key={col.key} className="text-center px-2">
                                  <Switch
                                    checked={perm[col.key as keyof PermissionRow] as boolean}
                                    disabled={isDisabled}
                                    onCheckedChange={() => {
                                      if (!form.permissions.find((p) => p.moduleId === m.id)) {
                                        setForm((prev) => ({
                                          ...prev,
                                          permissions: [...prev.permissions, {
                                            moduleId: m.id,
                                            canRead: col.key === 'canRead',
                                            canCreate: col.key === 'canCreate' && !isViewerType,
                                            canEdit: col.key === 'canEdit' && !isViewerType,
                                            canDelete: col.key === 'canDelete' && !isViewerType,
                                            canApprove: col.key === 'canApprove' && !isViewerType,
                                            canExport: col.key === 'canExport' && !isViewerType,
                                            canImport: col.key === 'canImport' && !isViewerType,
                                            canBulkUpdate: col.key === 'canBulkUpdate' && !isViewerType,
                                          }],
                                        }));
                                      } else {
                                        togglePermission(m.id, col.key);
                                      }
                                    }}
                                    className={cn(
                                      isDisabled && 'opacity-30 cursor-not-allowed'
                                    )}
                                  />
                                </TableCell>
                              );
                            })}
                            {!isViewerType && (
                              <TableCell className="text-center px-2">
                                <Switch
                                  checked={allWriteOn}
                                  onCheckedChange={(v) => toggleAllWrite(m.id, v)}
                                  className="scale-90"
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {isViewerType && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Viewer is a <strong>READ-ONLY</strong> group type. All write privilege rules (Create, Edit, Delete, Approve, Export, Import, Bulk) are disabled.</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.roleName.trim() || (form.scope === 'MODULE_LEVEL' && form.selectedModuleIds.length === 0)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Saving...' : editRole ? 'Update User Group' : 'Create User Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────────── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete User Group
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the user group <strong>&ldquo;{roleToDelete?.roleName}&rdquo;</strong>?
              This action cannot be undone. All users with this group will lose its privilege rules.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? 'Deleting...' : 'Delete User Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Duplicate to Company Dialog ─────────────────────────── */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5" />
              Duplicate to Account
            </DialogTitle>
            <DialogDescription>
              Copy user group <strong>&ldquo;{duplicateSource?.roleName}&rdquo;</strong> to another account.
              The group name, type, scope, and privilege rules will be copied. Users are not copied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Target Account</Label>
              <Select value={duplicateTargetCompanyId} onValueChange={setDuplicateTargetCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target account" />
                </SelectTrigger>
                <SelectContent>
                  {companies
                    .filter((c) => c.isActive && c.id !== duplicateSource?.companyId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyName} ({c.companyCode})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)} disabled={duplicating}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicateToCompany}
              disabled={duplicating || !duplicateTargetCompanyId}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {duplicating ? 'Duplicating...' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
