'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Building2, Crown,
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
    dataScope: '' as string, assignedBrands: '', assignedCountries: '', assignedTeams: '',
  });
  const [saving, setSaving] = useState(false);

  // Company filter for multi-tenant isolation
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');

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

  // Auto-set company filter for non-Super-Admin users
  useEffect(() => {
    if (!perms.isSuperAdmin && currentUser?.companyId && companyFilter === 'ALL') {
      setCompanyFilter(currentUser.companyId);
    }
  }, [perms.isSuperAdmin, currentUser?.companyId, companyFilter]);

  // ── Filtered data based on company ──────────────────────────────────
  const filteredUsers = useMemo(() => {
    if (companyFilter === 'ALL') return users;
    return users.filter((u) => u.companyId === companyFilter);
  }, [users, companyFilter]);

  const filteredRoles = useMemo(() => {
    if (companyFilter === 'ALL') return roles;
    // Show roles that belong to the selected company + global roles
    return roles.filter((r) => r.isGlobal || r.companyId === companyFilter);
  }, [roles, companyFilter]);

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
            dataScope: form.dataScope || null,
            assignedBrands: form.assignedBrands || null,
            assignedCountries: form.assignedCountries || null,
            assignedTeams: form.assignedTeams || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('User updated');
      } else {
        // Auto-set companyId based on filter
        const companyIdToUse = form.companyId || (companyFilter !== 'ALL' ? companyFilter : '');
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...form, companyId: companyIdToUse }),
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
    if (!perms.isSuperAdmin) {
      toast.error('Only Super Admins can impersonate users');
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
      dataScope: u.dataScope || '',
      assignedBrands: u.assignedBrands || '',
      assignedCountries: u.assignedCountries || '',
      assignedTeams: u.assignedTeams || '',
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditUser(null);
    const defaultCompanyId = companyFilter !== 'ALL' ? companyFilter : (companies[0]?.id || '');
    setForm({
      username: '', email: '', password: '', displayName: '',
      companyId: defaultCompanyId,
      roleIds: [], isActive: true,
      dataScope: '', assignedBrands: '', assignedCountries: '', assignedTeams: '',
    });
    setDialogOpen(true);
  };

  const isCompanyAdmin = (u: any) => {
    return u.roles?.some((r: any) => r.roleName === 'Company Admin');
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">User & Group Management</h2>
            <p className="text-muted-foreground text-sm mt-1">Manage users and their group assignments (Stibo User Groups)</p>
          </div>

        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      {/* Company Filter */}
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
            Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>User Groups</TableHead>
                  <TableHead>Data Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No users found for the selected account
                    </TableCell>
                  </TableRow>
                )}
                {filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser?.userId;
                  const isAdmin = isCompanyAdmin(u);
                  return (
                    <TableRow key={u.id} className={!u.isActive ? 'opacity-60' : undefined}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.username}
                          {isSelf && (
                            <Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-700">
                              you
                            </Badge>
                          )}
                          {isAdmin && (
                            <Badge className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200">
                              <Crown className="w-3 h-3 mr-0.5" /> Account Admin
                            </Badge>
                          )}
                        </div>
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
                        <Badge variant="outline" className={cn(
                          'text-xs border',
                          u.dataScope === 'ALL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          u.dataScope === 'BRAND' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          u.dataScope === 'COUNTRY' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                          u.dataScope === 'TEAM' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                          u.dataScope === 'CUSTOM' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        )}>
                          {u.dataScope || 'COMPANY'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            'text-xs border',
                            u.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                          )}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          {editUser?.id === u.id ? null : (
                            <Switch
                              checked={u.isActive}
                              onCheckedChange={() => handleSoftDelete(u.id)}
                              className="scale-75"
                            />
                          )}
                        </div>
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
                            {perms.isSuperAdmin && (
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
                            )}
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
            <DialogDescription>
              {editUser ? 'Update user information and group assignments' : 'Add a new user to the system'}
            </DialogDescription>
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
              <Label>Account</Label>
              <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })} disabled={!!editUser}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {companies.filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName} ({c.companyCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>User Groups (Group Assignment)</Label>
              <div className="flex flex-wrap gap-2">
                {filteredRoles.map((r) => (
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
                    {r.isGlobal && (
                      <Badge variant="outline" className="text-[10px]">Global</Badge>
                    )}
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
            <div className="space-y-2">
              <Label>Data Scope (RLS)</Label>
              <Select value={form.dataScope || 'COMPANY'} onValueChange={(v) => setForm({ ...form, dataScope: v === 'COMPANY' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select data scope" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY">Company (default)</SelectItem>
                  <SelectItem value="ALL">All (no restrictions)</SelectItem>
                  <SelectItem value="BRAND">Brand-scoped</SelectItem>
                  <SelectItem value="COUNTRY">Country-scoped</SelectItem>
                  <SelectItem value="TEAM">Team-scoped</SelectItem>
                  <SelectItem value="CUSTOM">Custom (brand + country + team)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Controls which data records this user can access</p>
            </div>
            {(form.dataScope === 'BRAND' || form.dataScope === 'CUSTOM') && (
              <div className="space-y-2">
                <Label>Assigned Brands (JSON array)</Label>
                <Input
                  placeholder='e.g. ["Nike","Adidas","New Balance"]'
                  value={form.assignedBrands}
                  onChange={(e) => setForm({ ...form, assignedBrands: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">User will only see records matching these brands</p>
              </div>
            )}
            {(form.dataScope === 'COUNTRY' || form.dataScope === 'CUSTOM') && (
              <div className="space-y-2">
                <Label>Assigned Countries (JSON array)</Label>
                <Input
                  placeholder='e.g. ["ID","SG","MY"]'
                  value={form.assignedCountries}
                  onChange={(e) => setForm({ ...form, assignedCountries: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">User will only see records matching these country codes</p>
              </div>
            )}
            {(form.dataScope === 'TEAM' || form.dataScope === 'CUSTOM') && (
              <div className="space-y-2">
                <Label>Assigned Teams (JSON array)</Label>
                <Input
                  placeholder='e.g. ["Map Corporate","MAPI Operations"]'
                  value={form.assignedTeams}
                  onChange={(e) => setForm({ ...form, assignedTeams: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">User will only see records for their assigned teams</p>
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
              The user and all their session data will be removed.
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
                  <span className="text-muted-foreground">User Groups:</span>
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
