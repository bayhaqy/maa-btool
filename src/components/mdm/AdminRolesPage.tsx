'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Shield, Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminRolesPage() {
  const { token } = useAppStore();
  const [roles, setRoles] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<any>(null);
  const [form, setForm] = useState({
    roleName: '', description: '',
    permissions: [] as Array<{ moduleId: string; canRead: boolean; canWrite: boolean; canDelete: boolean; canApprove: boolean }>,
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

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (editRole) {
        const res = await fetch('/api/admin/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editRole.id, roleName: form.roleName, description: form.description, permissions: form.permissions }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Role updated');
      } else {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Role created');
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

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Delete this role?')) return;
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Role deleted');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (r: any) => {
    setEditRole(r);
    setForm({
      roleName: r.roleName,
      description: r.description || '',
      permissions: r.permissions?.map((p: any) => ({
        moduleId: p.moduleId,
        canRead: p.canRead,
        canWrite: p.canWrite,
        canDelete: p.canDelete,
        canApprove: p.canApprove,
      })) || [],
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditRole(null);
    setForm({
      roleName: '', description: '',
      permissions: modules.map((m) => ({
        moduleId: m.id, canRead: false, canWrite: false, canDelete: false, canApprove: false,
      })),
    });
    setDialogOpen(true);
  };

  const togglePermission = (moduleId: string, perm: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.map((p) =>
        p.moduleId === moduleId ? { ...p, [perm]: !p[perm as keyof typeof p] } : p
      ),
    }));
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Role Management</h2>
          <p className="text-muted-foreground text-sm mt-1">Configure roles and module permissions</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Role
        </Button>
      </div>

      <div className="space-y-4">
        {roles.map((role) => (
          <Card key={role.id} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-600" />
                  {role.roleName}
                </CardTitle>
                <CardDescription>{role.description || 'No description'}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{role.userCount || 0} users</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(role)}>
                      <Pencil className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(role.id)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              {role.permissions?.length > 0 ? (
                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Module</TableHead>
                        <TableHead className="text-center">Read</TableHead>
                        <TableHead className="text-center">Write</TableHead>
                        <TableHead className="text-center">Delete</TableHead>
                        <TableHead className="text-center">Approve</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {role.permissions.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{p.module?.moduleName || '-'}</TableCell>
                          <TableCell className="text-center">{p.canRead ? '✅' : '❌'}</TableCell>
                          <TableCell className="text-center">{p.canWrite ? '✅' : '❌'}</TableCell>
                          <TableCell className="text-center">{p.canDelete ? '✅' : '❌'}</TableCell>
                          <TableCell className="text-center">{p.canApprove ? '✅' : '❌'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No permissions configured</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editRole ? 'Edit Role' : 'Create Role'}</DialogTitle>
            <DialogDescription>Configure role name and module permissions</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Permissions Matrix</Label>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead className="text-center">Read</TableHead>
                      <TableHead className="text-center">Write</TableHead>
                      <TableHead className="text-center">Delete</TableHead>
                      <TableHead className="text-center">Approve</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modules.map((m) => {
                      const perm = form.permissions.find((p) => p.moduleId === m.id);
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm font-medium">{m.moduleName}</TableCell>
                          {['canRead', 'canWrite', 'canDelete', 'canApprove'].map((p) => (
                            <TableCell key={p} className="text-center">
                              <Switch
                                checked={perm ? perm[p as keyof typeof perm] as boolean : false}
                                onCheckedChange={() => {
                                  if (perm) {
                                    togglePermission(m.id, p);
                                  } else {
                                    setForm((prev) => ({
                                      ...prev,
                                      permissions: [...prev.permissions, {
                                        moduleId: m.id,
                                        canRead: p === 'canRead',
                                        canWrite: p === 'canWrite',
                                        canDelete: p === 'canDelete',
                                        canApprove: p === 'canApprove',
                                      }],
                                    }));
                                  }
                                }}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.roleName} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editRole ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
