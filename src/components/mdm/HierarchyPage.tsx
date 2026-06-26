'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Network, Plus, MoreVertical, Pencil, Trash2, ArrowRight, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function HierarchyPage() {
  const { token, navigate } = useAppStore();
  const [hierarchies, setHierarchies] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ moduleId: '', hierarchyName: '', description: '' });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [hRes, mRes] = await Promise.all([
        fetch('/api/hierarchies', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const hData = await hRes.json();
      const mData = await mRes.json();
      setHierarchies(hData.hierarchies || []);
      setModules(mData.modules || []);
    } catch {
      toast.error('Failed to load hierarchies');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (editItem) {
        const res = await fetch('/api/hierarchies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editItem.id, hierarchyName: form.hierarchyName, description: form.description }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Hierarchy updated');
      } else {
        const res = await fetch('/api/hierarchies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Hierarchy created');
      }
      setDialogOpen(false);
      setEditItem(null);
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Delete this hierarchy and all its nodes?')) return;
    try {
      const res = await fetch('/api/hierarchies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return; }
      toast.success('Hierarchy deleted');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (h: any) => {
    setEditItem(h);
    setForm({ moduleId: h.moduleId, hierarchyName: h.hierarchyName, description: h.description || '' });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({ moduleId: modules[0]?.id || '', hierarchyName: '', description: '' });
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Hierarchy Manager</h2>
          <p className="text-muted-foreground text-sm mt-1">Organize master data into tree structures</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> New Hierarchy
        </Button>
      </div>

      {hierarchies.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <Network className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No hierarchies</h3>
            <p className="text-muted-foreground text-sm mt-1">Create a hierarchy to organize your master data.</p>
            <Button className="mt-4 bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Create Hierarchy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hierarchies.map((h) => (
            <Card key={h.id} className="shadow-sm hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-teal-50">
                      <Network className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{h.hierarchyName}</CardTitle>
                      <CardDescription className="text-xs">{h.module?.moduleName}</CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 p-1.5 rounded-md hover:bg-background/80 transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate('hierarchy-detail', { hierarchyId: h.id })}>
                        <ArrowRight className="w-4 h-4 mr-2" /> Open Tree
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(h)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(h.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {h.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{h.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{h.nodeCount || 0} nodes</Badge>
                </div>
                <Button
                  variant="ghost"
                  className="w-full mt-3 justify-center text-teal-600 hover:text-teal-700 hover:bg-teal-50 h-9"
                  onClick={() => navigate('hierarchy-detail', { hierarchyId: h.id })}
                >
                  Open Tree <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Hierarchy' : 'Create Hierarchy'}</DialogTitle>
            <DialogDescription>Define the hierarchy structure</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Module</Label>
              <Select value={form.moduleId} onValueChange={(v) => setForm({ ...form, moduleId: v })} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                <SelectContent>
                  {modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.moduleName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hierarchy Name</Label>
              <Input
                value={form.hierarchyName}
                onChange={(e) => setForm({ ...form, hierarchyName: e.target.value })}
                placeholder="e.g. Product Category Tree"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.hierarchyName || !form.moduleId} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
