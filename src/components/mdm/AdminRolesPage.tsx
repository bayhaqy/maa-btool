'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
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
  CheckCircle, Crown, Settings, AlertTriangle, Info,
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
  color: string | null;
  icon: string | null;
  permissionCount: number;
  userCount: number;
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
  const { token } = useAppStore();
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleData | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleData | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    roleName: '',
    description: '',
    roleType: 'VIEWER' as string,
    scope: 'MODULE' as string,
    permissions: [] as PermissionRow[],
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [rRes, mRes] = await Promise.all([
        fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const rData = await rRes.json();
      const mData = await mRes.json();
      setRoles(rData.roles || []);
      setModules(mData.modules || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const payload = {
        id: editRole?.id,
        roleName: form.roleName,
        description: form.description,
        roleType: form.roleType,
        scope: form.scope,
        permissions: form.permissions,
      };

      if (editRole) {
        const res = await fetch('/api/admin/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update role'); return; }
        toast.success('Role updated successfully');
      } else {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create role'); return; }
        toast.success('Role created successfully');
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
      if (!res.ok) { toast.error(data.error || 'Failed to delete role'); return; }
      toast.success('Role deleted successfully');
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (r: RoleData) => {
    setEditRole(r);
    setForm({
      roleName: r.roleName,
      description: r.description || '',
      roleType: r.roleType || 'VIEWER',
      scope: r.scope || 'MODULE',
      permissions: r.permissions?.map((p) => ({
        moduleId: p.moduleId,
        canRead: p.canRead,
        canCreate: p.canCreate,
        canEdit: p.canEdit,
        canDelete: p.canDelete,
        canApprove: p.canApprove,
        canExport: p.canExport,
        canImport: p.canImport,
        canBulkUpdate: p.canBulkUpdate,
      })) || [],
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditRole(null);
    setForm({
      roleName: '',
      description: '',
      roleType: 'VIEWER',
      scope: 'MODULE',
      permissions: modules.map((m) => ({
        moduleId: m.id,
        canRead: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
        canImport: false,
        canBulkUpdate: false,
      })),
    });
    setDialogOpen(true);
  };

  const togglePermission = (moduleId: string, permKey: string) => {
    // Prevent toggling write permissions for VIEWER
    if (isViewerType && permKey !== 'canRead') return;

    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.map((p) =>
        p.moduleId === moduleId ? { ...p, [permKey]: !p[permKey as keyof PermissionRow] } : p
      ),
    }));
  };

  // Toggle all write permissions for a module
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

  // Ensure permission entry exists for a module
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

  // ── Compute role type stats ──────────────────────────────────────
  const roleTypeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    Object.keys(ROLE_TYPE_INFO).forEach((key) => { stats[key] = 0; });
    roles.forEach((r) => {
      const rt = r.roleType || 'VIEWER';
      stats[rt] = (stats[rt] || 0) + 1;
    });
    return stats;
  }, [roles]);

  // ── Loading State ────────────────────────────────────────────────
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
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Role Management</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Configure Stibo RBAC roles and granular module permissions
          </p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Role
        </Button>
      </div>

      {/* ── Role Type Summary Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
        {roles.length === 0 && (
          <Card className="shadow-sm">
            <CardContent className="p-8 text-center">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No roles configured yet</p>
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Create First Role
              </Button>
            </CardContent>
          </Card>
        )}

        {roles.map((role) => {
          const roleType = role.roleType || 'VIEWER';
          const typeInfo = ROLE_TYPE_INFO[roleType];
          const style = getRoleTypeBadgeStyle(roleType);
          const isExpanded = expandedRoles.has(role.id);
          const isViewer = roleType === 'VIEWER';

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

                    {/* Role type badge */}
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

                    {/* READ-ONLY badge for Viewer */}
                    {isViewer && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                        <Lock className="w-3 h-3 mr-1" /> READ-ONLY
                      </Badge>
                    )}

                    {/* System role badge */}
                    {role.isSystem && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                        <Lock className="w-3 h-3 mr-1" /> System
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {role.description || typeInfo?.description || 'No description'}
                  </CardDescription>

                  {/* Meta info row */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                    </span>
                    <span>•</span>
                    <span>{role.permissionCount} module permission{role.permissionCount !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>Scope: {role.scope || 'MODULE'}</span>
                  </div>
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
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(role)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit Role
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleRoleExpand(role.id)}>
                        <Eye className="w-4 h-4 mr-2" /> {isExpanded ? 'Hide' : 'View'} Permissions
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
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Role
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
                      <span>All write permissions are disabled for Viewer roles (READ-ONLY)</span>
                    </div>
                  )}
                </CardContent>
              )}

              {isExpanded && (!role.permissions || role.permissions.length === 0) && (
                <CardContent className="pt-0">
                  <Separator className="mb-4" />
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No module permissions configured for this role
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
              {editRole ? 'Edit Role' : 'Create New Role'}
            </DialogTitle>
            <DialogDescription>
              Configure role name, type, and granular module permissions following Stibo RBAC best practices
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
            {/* Role info section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="roleName" className="text-sm font-medium">Role Name *</Label>
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
                  placeholder="Brief description of the role"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Role Type Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Role Type *</Label>
                <Select
                  value={form.roleType}
                  onValueChange={handleRoleTypeChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role type" />
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
                  onValueChange={(v) => setForm({ ...form, scope: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MODULE">
                      <div className="flex items-center gap-2">
                        <span>Module-level</span>
                        <span className="text-muted-foreground text-xs">— Per-module permissions</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="GLOBAL">
                      <div className="flex items-center gap-2">
                        <span>Global</span>
                        <span className="text-muted-foreground text-xs">— All modules access</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Role type info banner */}
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
                    {ROLE_TYPE_INFO[form.roleType].label} Role
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ROLE_TYPE_INFO[form.roleType].description}
                  </p>
                  {isViewerType && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> All write permissions are disabled — this is a READ-ONLY role
                    </p>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* ── Permission Matrix ──────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Permission Matrix</Label>
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
                              <TooltipContent>Toggle all write permissions</TooltipContent>
                            </Tooltip>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modules.map((m) => {
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
                                        // Add new entry
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

              {isViewerType && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Viewer is a <strong>READ-ONLY</strong> role type. All write permissions (Create, Edit, Delete, Approve, Export, Import, Bulk) are disabled.</span>
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
              disabled={saving || !form.roleName.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Saving...' : editRole ? 'Update Role' : 'Create Role'}
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
              Delete Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the role <strong>&ldquo;{roleToDelete?.roleName}&rdquo;</strong>?
              This action cannot be undone. All users with this role will lose its permissions.
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
              {saving ? 'Deleting...' : 'Delete Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
