'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users, Plus, MoreVertical, Pencil, Trash2, UserCheck, UserX, UserCog, ShieldAlert, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsersPage() {
  const { token, user: currentUser, impersonate } = useAppStore();
  const perms = usePermissions();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({
    username: '', email: '', password: '', displayName: '',
    companyId: '', roleIds: [] as string[], isActive: true,
  });
  const [saving, setSaving] = useState(false);

  // Hard-delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Impersonation in-flight state
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [uRes, rRes, cRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const uData = await uRes.json();
      const rData = await rRes.json();
      const cData = await cRes.json();
      setUsers(uData.users || []);
      setRoles(rData.roles || []);
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

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (editUser) {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            id: editUser.id,
            email: form.email,
            displayName: form.displayName,
            isActive: form.isActive,
            roleIds: form.roleIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('User updated');
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('User created');
      }
      setDialogOpen(false);
      setEditUser(null);
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (id: string) => {
    if (!token || !confirm('Deactivate this user? They will be unable to sign in but their data is preserved.')) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('User deactivated');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleHardDelete = async () => {
    if (!token || !deleteTarget) return;
    // Require the user to type the exact username to confirm.
    if (deleteConfirmText !== deleteTarget.username) {
      toast.error('Username confirmation does not match');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/users/hard-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete user'); return; }
      toast.success(`Permanently deleted "${data.deletedUsername}"`);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setDeleting(false);
    }
  };

  const handleImpersonate = async (u: any) => {
    if (!token) return;
    if (u.id === currentUser?.userId) {
      toast.error('Cannot impersonate yourself');
      return;
    }
    setImpersonatingId(u.id);
    try {
      const res = await fetch('/api/admin/users/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: u.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to impersonate'); return; }
      impersonate(data.token, data.user);
      toast.success(`Now signed in as ${data.user.username}`);
    } catch {
      toast.error('Network error');
    } finally {
      setImpersonatingId(null);
    }
  };

  const openEdit = (u: any) => {
    setEditUser(u);
    setForm({
      username: u.username,
      email: u.email,
      password: '',
      displayName: u.displayName || '',
      companyId: u.companyId,
      roleIds: u.roles?.map((r: any) => r.id) || [],
      isActive: u.isActive,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditUser(null);
    setForm({
      username: '', email: '', password: '', displayName: '',
      companyId: companies[0]?.id || '',
      roleIds: [], isActive: true,
    });
    setDialogOpen(true);
  };

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
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage system users and their access</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.userId;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.username}
                        {isSelf && (
                          <Badge variant="outline" className="ml-2 text-[10px] border-red-200 bg-red-50 text-red-700">
                            you
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell className="text-sm">{u.displayName || '-'}</TableCell>
                      <TableCell className="text-sm">{u.company?.companyName || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.map((r: any) => (
                            <Badge key={r.id} variant="outline" className="text-xs">{r.roleName}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(
                          'text-xs border',
                          u.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                        )}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => openEdit(u)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleImpersonate(u)}
                              disabled={isSelf || impersonatingId === u.id}
                            >
                              {impersonatingId === u.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <UserCog className="w-4 h-4 mr-2" />
                              )}
                              Impersonate
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-amber-700" onClick={() => handleSoftDelete(u.id)}>
                              {u.isActive ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setDeleteTarget(u);
                                setDeleteConfirmText('');
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editUser ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription>{editUser ? 'Update user information' : 'Add a new system user'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editUser} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              </div>
              {!editUser && (
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })} disabled={!!editUser}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={form.roleIds.includes(r.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({ ...form, roleIds: [...form.roleIds, r.id] });
                        } else {
                          setForm({ ...form, roleIds: form.roleIds.filter((id) => id !== r.id) });
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{r.roleName}</span>
                  </label>
                ))}
              </div>
            </div>
            {editUser && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label>Active</Label>
                <Switch checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: c })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editUser ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard-Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Permanently delete user
            </DialogTitle>
            <DialogDescription>
              This action is <span className="font-semibold text-destructive">irreversible</span>.
              The user and all their session data will be removed. Related records
              (approvals, audit logs, documentation authorship) will be reassigned
              to you or anonymized.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Username:</span>
                  <span className="font-mono font-medium">{deleteTarget.username}</span>
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-mono text-xs">{deleteTarget.email}</span>
                  <span className="text-muted-foreground">Roles:</span>
                  <span className="text-xs">{deleteTarget.roles?.map((r: any) => r.roleName).join(', ') || '—'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-text" className="text-sm">
                  Type <span className="font-mono font-semibold">{deleteTarget.username}</span> to confirm
                </Label>
                <Input
                  id="confirm-text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTarget.username}
                  autoComplete="off"
                  className="font-mono"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleHardDelete}
              disabled={deleting || deleteConfirmText !== deleteTarget?.username}
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
