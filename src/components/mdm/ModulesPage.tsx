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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  Database, Plus, MoreVertical, Pencil, Trash2, ArrowRight,
  Package, DollarSign, Building2, Store, Truck, Tag, Gift,
} from 'lucide-react';
import { toast } from 'sonner';

const moduleIcons: Record<string, React.ElementType> = {
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift,
};

export default function ModulesPage() {
  const { token, navigate, user } = useAppStore();
  const canManage = user?.roles?.includes('Super Admin') ?? false;
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editModule, setEditModule] = useState<any>(null);
  const [form, setForm] = useState({ moduleCode: '', moduleName: '', moduleIcon: 'Database', description: '', requireApproval: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadModules();
  }, [token]);

  const loadModules = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setModules(data.modules || []);
    } catch {
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
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
      setForm({ moduleCode: '', moduleName: '', moduleIcon: 'Database', description: '', requireApproval: true });
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

  const openEdit = (m: any) => {
    setEditModule(m);
    setForm({
      moduleCode: m.moduleCode,
      moduleName: m.moduleName,
      moduleIcon: m.moduleIcon,
      description: m.description || '',
      requireApproval: m.requireApproval,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditModule(null);
    setForm({ moduleCode: '', moduleName: '', moduleIcon: 'Database', description: '', requireApproval: true });
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
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
            return (
              <Card key={m.id} className="shadow-sm hover:shadow-md transition-shadow group">
                <CardHeader className="pb-3">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate('module-detail', { moduleId: m.id })}>
                          <ArrowRight className="w-4 h-4 mr-2" /> Open Builder
                        </DropdownMenuItem>
                        {canManage && (
                          <DropdownMenuItem onClick={() => openEdit(m)}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                        )}
                        {canManage && (
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{m.description || 'No description'}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{m.fieldCount || 0} fields</Badge>
                    {m.requireApproval ? (
                      <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">Approval Required</Badge>
                    ) : (
                      <Badge className="text-xs bg-green-50 text-green-700 border-green-200">Auto-approve</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full mt-3 justify-center text-red-600 hover:text-red-700 hover:bg-red-50 h-9"
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
          <div className="space-y-4 py-2">
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
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this module"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Require Approval</Label>
                <p className="text-xs text-muted-foreground">Records need approval before activation</p>
              </div>
              <Switch
                checked={form.requireApproval}
                onCheckedChange={(checked) => setForm({ ...form, requireApproval: checked })}
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
    </div>
  );
}
