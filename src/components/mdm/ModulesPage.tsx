'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  Database, Plus, MoreVertical, Pencil, Trash2, ArrowRight,
  Package, DollarSign, Building2, Store, Truck, Tag, Gift,
  Copy, Download, Clock, FileText, BarChart3, Users, ToggleLeft,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

const moduleIcons: Record<string, React.ElementType> = {
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift,
};

interface ModuleStat {
  id: string;
  moduleCode: string;
  moduleName: string;
  moduleIcon: string;
  description: string | null;
  requireApproval: boolean;
  sortOrder: number;
  fieldCount: number;
  recordCount: number;
  lastModified: string | null;
  activeCount: number;
  draftCount: number;
}

export default function ModulesPage() {
  const { token, navigate, user } = useAppStore();
  const canManage = user?.roles?.includes('Super Admin') ?? false;
  const [modules, setModules] = useState<any[]>([]);
  const [moduleStats, setModuleStats] = useState<ModuleStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editModule, setEditModule] = useState<any>(null);
  const [form, setForm] = useState({ moduleCode: '', moduleName: '', moduleIcon: 'Database', description: '', requireApproval: true, sortOrder: 0, isActive: true });
  const [saving, setSaving] = useState(false);

  // Quick edit dialog (name, description, requireApproval)
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [quickEditModule, setQuickEditModule] = useState<any>(null);
  const [quickEditForm, setQuickEditForm] = useState({ moduleName: '', description: '', requireApproval: true });
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  // Clone dialog
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<any>(null);
  const [cloneForm, setCloneForm] = useState({ moduleCode: '', moduleName: '', moduleIcon: 'Database', description: '', requireApproval: true });
  const [cloneSaving, setCloneSaving] = useState(false);

  useEffect(() => {
    loadModules();
  }, [token]);

  const loadModules = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Load both modules and stats in parallel
      const [modRes, statsRes] = await Promise.all([
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/modules?action=stats', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const modData = await modRes.json();
      setModules(modData.modules || []);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setModuleStats(statsData.stats || []);
      }
    } catch {
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  const getModuleStats = (moduleId: string): ModuleStat | undefined => {
    return moduleStats.find((s) => s.id === moduleId);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Unknown';
    }
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (editModule) {
        const res = await fetch('/api/modules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editModule.id, ...form }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
        toast.success('Module updated successfully');
      } else {
        const res = await fetch('/api/modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
        toast.success('Module created successfully');
      }
      setDialogOpen(false);
      setEditModule(null);
      setForm({ moduleCode: '', moduleName: '', moduleIcon: 'Database', description: '', requireApproval: true, sortOrder: 0, isActive: true });
      loadModules();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Are you sure you want to delete this module?')) return;
    try {
      const res = await fetch('/api/modules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return; }
      toast.success('Module deleted');
      loadModules();
    } catch {
      toast.error('Network error');
    }
  };

  const handleClone = async () => {
    if (!token || !cloneSource) return;
    setCloneSaving(true);
    try {
      const res = await fetch(`/api/modules?action=clone&sourceId=${cloneSource.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cloneForm),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to clone'); return; }
      toast.success(`Module cloned as "${cloneForm.moduleName}"`);
      setCloneDialogOpen(false);
      setCloneSource(null);
      loadModules();
    } catch {
      toast.error('Network error');
    } finally {
      setCloneSaving(false);
    }
  };

  const handleExport = async (mod: any) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/modules?action=export&id=${mod.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to export'); return; }

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mod.moduleCode}_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Module exported');
    } catch {
      toast.error('Failed to export module');
    }
  };

  const openEdit = (m: any) => {
    setEditModule(m);
    setForm({
      moduleCode: m.moduleCode,
      moduleName: m.moduleName,
      moduleIcon: m.moduleIcon || 'Database',
      description: m.description || '',
      requireApproval: m.requireApproval,
      sortOrder: m.sortOrder ?? 0,
      isActive: m.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const openQuickEdit = (m: any) => {
    setQuickEditModule(m);
    setQuickEditForm({
      moduleName: m.moduleName || '',
      description: m.description || '',
      requireApproval: m.requireApproval ?? true,
    });
    setQuickEditOpen(true);
  };

  const handleQuickEditSave = async () => {
    if (!token || !quickEditModule) return;
    setQuickEditSaving(true);
    try {
      const res = await fetch('/api/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: quickEditModule.id,
          moduleCode: quickEditModule.moduleCode,
          moduleName: quickEditForm.moduleName,
          moduleIcon: quickEditModule.moduleIcon,
          description: quickEditForm.description,
          requireApproval: quickEditForm.requireApproval,
          sortOrder: quickEditModule.sortOrder ?? 0,
          isActive: quickEditModule.isActive ?? true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
      toast.success('Module updated successfully');
      setQuickEditOpen(false);
      setQuickEditModule(null);
      loadModules();
    } catch {
      toast.error('Network error');
    } finally {
      setQuickEditSaving(false);
    }
  };

  const openCreate = () => {
    setEditModule(null);
    setForm({ moduleCode: '', moduleName: '', moduleIcon: 'Database', description: '', requireApproval: true, sortOrder: 0, isActive: true });
    setDialogOpen(true);
  };

  const openClone = (m: any) => {
    setCloneSource(m);
    setCloneForm({
      moduleCode: `${m.moduleCode}_COPY`,
      moduleName: `${m.moduleName} (Copy)`,
      moduleIcon: m.moduleIcon || 'Database',
      description: m.description || '',
      requireApproval: m.requireApproval,
    });
    setCloneDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Modules</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage master data modules and their schemas</p>
        </div>
        {canManage && (
          <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> New Module
          </Button>
        )}
      </div>

      {/* Summary Stats */}
      {modules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <Database className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{modules.length}</p>
                <p className="text-xs text-muted-foreground">Total Modules</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50">
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{modules.reduce((sum: number, m: any) => sum + (m.fieldCount || 0), 0)}</p>
                <p className="text-xs text-muted-foreground">Total Fields</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-50">
                <BarChart3 className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{moduleStats.reduce((sum, s) => sum + s.activeCount, 0)}</p>
                <p className="text-xs text-muted-foreground">Active Records</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{moduleStats.reduce((sum, s) => sum + s.draftCount, 0)}</p>
                <p className="text-xs text-muted-foreground">Draft Records</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {modules.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No modules yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Create your first master data module to get started.</p>
            <Button className="mt-4 bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Create Module
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((m) => {
            const Icon = moduleIcons[m.moduleIcon] || Database;
            const stats = getModuleStats(m.id);
            return (
              <Card key={m.id} className="shadow-sm hover:shadow-md transition-shadow group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-red-50">
                        <Icon className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{m.moduleName}</CardTitle>
                        <CardDescription className="text-xs font-mono">{m.moduleCode}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={() => openQuickEdit(m)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => navigate('module-detail', { moduleId: m.id })}>
                            <ArrowRight className="w-4 h-4 mr-2" /> Open Builder
                          </DropdownMenuItem>
                          {canManage && (
                            <DropdownMenuItem onClick={() => openQuickEdit(m)}>
                              <Pencil className="w-4 h-4 mr-2" /> Quick Edit
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <DropdownMenuItem onClick={() => openEdit(m)}>
                              <Settings2 className="w-4 h-4 mr-2" /> Full Edit
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <DropdownMenuItem onClick={() => openClone(m)}>
                              <Copy className="w-4 h-4 mr-2" /> Duplicate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleExport(m)}>
                            <Download className="w-4 h-4 mr-2" /> Export JSON
                          </DropdownMenuItem>
                          {canManage && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(m.id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">{m.description || 'No description'}</p>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-1.5 rounded-md bg-muted/50">
                      <p className="text-sm font-semibold">{m.fieldCount || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Fields</p>
                    </div>
                    <div className="text-center p-1.5 rounded-md bg-muted/50">
                      <p className="text-sm font-semibold">{stats?.activeCount ?? m.recordCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Active</p>
                    </div>
                    <div className="text-center p-1.5 rounded-md bg-muted/50">
                      <p className="text-sm font-semibold">{stats?.draftCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Draft</p>
                    </div>
                  </div>

                  {/* Tags Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {m.requireApproval ? (
                      <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">Approval Required</Badge>
                    ) : (
                      <Badge className="text-xs bg-green-50 text-green-700 border-green-200">Auto-approve</Badge>
                    )}
                    {stats?.lastModified && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatDate(stats.lastModified)}
                      </Badge>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full justify-center text-red-600 hover:text-red-700 hover:bg-red-50 h-9"
                    onClick={() => navigate('module-detail', { moduleId: m.id })}
                  >
                    Open Builder <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editModule ? 'Edit Module' : 'Create Module'}</DialogTitle>
            <DialogDescription>
              {editModule ? 'Update module configuration' : 'Define a new master data module'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-2">
              <Label>Module Code</Label>
              <Input
                placeholder="e.g. ARTICLE_MASTER"
                value={form.moduleCode}
                onChange={(e) => setForm({ ...form, moduleCode: e.target.value.toUpperCase() })}
                disabled={!!editModule}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Module Name</Label>
              <Input
                placeholder="e.g. Article Master"
                value={form.moduleName}
                onChange={(e) => setForm({ ...form, moduleName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Module Icon</Label>
              <Select value={form.moduleIcon} onValueChange={(v) => setForm({ ...form, moduleIcon: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(moduleIcons).map(([name, IconComp]) => (
                    <SelectItem key={name} value={name}>
                      <div className="flex items-center gap-2">
                        <IconComp className="w-4 h-4" />
                        <span>{name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this module"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="text-sm">Require Approval</Label>
                  <p className="text-[10px] text-muted-foreground">Need approval before activation</p>
                </div>
                <Switch
                  checked={form.requireApproval}
                  onCheckedChange={(checked) => setForm({ ...form, requireApproval: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="text-sm">Active</Label>
                  <p className="text-[10px] text-muted-foreground">Enable this module</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.moduleCode || !form.moduleName} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editModule ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate Module</DialogTitle>
            <DialogDescription>
              Clone &quot;{cloneSource?.moduleName}&quot; with all fields, validations, and business rules
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Module Code</Label>
              <Input
                placeholder="e.g. ARTICLE_MASTER_COPY"
                value={cloneForm.moduleCode}
                onChange={(e) => setCloneForm({ ...cloneForm, moduleCode: e.target.value.toUpperCase() })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>New Module Name</Label>
              <Input
                placeholder="e.g. Article Master (Copy)"
                value={cloneForm.moduleName}
                onChange={(e) => setCloneForm({ ...cloneForm, moduleName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Module Icon</Label>
              <Select value={cloneForm.moduleIcon} onValueChange={(v) => setCloneForm({ ...cloneForm, moduleIcon: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(moduleIcons).map(([name, IconComp]) => (
                    <SelectItem key={name} value={name}>
                      <div className="flex items-center gap-2">
                        <IconComp className="w-4 h-4" />
                        <span>{name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Description for the cloned module"
                value={cloneForm.description}
                onChange={(e) => setCloneForm({ ...cloneForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="text-sm">Require Approval</Label>
                <p className="text-[10px] text-muted-foreground">Records need approval before activation</p>
              </div>
              <Switch
                checked={cloneForm.requireApproval}
                onCheckedChange={(checked) => setCloneForm({ ...cloneForm, requireApproval: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)} disabled={cloneSaving}>Cancel</Button>
            <Button onClick={handleClone} disabled={cloneSaving || !cloneForm.moduleCode || !cloneForm.moduleName} className="bg-red-600 hover:bg-red-700 text-white">
              {cloneSaving ? 'Cloning...' : 'Clone Module'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Edit Dialog — name, description, require approval */}
      <Dialog open={quickEditOpen} onOpenChange={setQuickEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Quick Edit Module
            </DialogTitle>
            <DialogDescription>
              Update &quot;{quickEditModule?.moduleName}&quot; — name, description, and approval setting
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Module Name</Label>
              <Input
                placeholder="e.g. Article Master"
                value={quickEditForm.moduleName}
                onChange={(e) => setQuickEditForm({ ...quickEditForm, moduleName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this module"
                value={quickEditForm.description}
                onChange={(e) => setQuickEditForm({ ...quickEditForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="text-sm">Require Approval</Label>
                <p className="text-[10px] text-muted-foreground">Records need approval before activation</p>
              </div>
              <Switch
                checked={quickEditForm.requireApproval}
                onCheckedChange={(checked) => setQuickEditForm({ ...quickEditForm, requireApproval: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickEditOpen(false)} disabled={quickEditSaving}>Cancel</Button>
            <Button onClick={handleQuickEditSave} disabled={quickEditSaving || !quickEditForm.moduleName} className="bg-red-600 hover:bg-red-700 text-white">
              {quickEditSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
