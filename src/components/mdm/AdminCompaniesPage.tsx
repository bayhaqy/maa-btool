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
  Building2, Plus, MoreVertical, Pencil, Trash2, ShieldAlert,
  Rocket, PauseCircle, PlayCircle, Users, Database, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Tier badge styling ──────────────────────────────────────────
const TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  STARTER: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
  PROFESSIONAL: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  ENTERPRISE: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

const ONBOARDING_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  PROVISIONING: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  ACTIVE: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  SUSPENDED: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

interface CompanyForm {
  companyCode: string;
  companyName: string;
  description: string;
  industry: string;
  logoUrl: string;
  website: string;
  address: string;
  phone: string;
  email: string;
  tenantTier: string;
  maxUsers: number;
  maxRecords: number;
  dataRetentionDays: number;
  onboardingStatus: string;
  isActive: boolean;
}

const defaultForm: CompanyForm = {
  companyCode: '',
  companyName: '',
  description: '',
  industry: '',
  logoUrl: '',
  website: '',
  address: '',
  phone: '',
  email: '',
  tenantTier: 'PROFESSIONAL',
  maxUsers: 50,
  maxRecords: 100000,
  dataRetentionDays: 365,
  onboardingStatus: 'PENDING',
  isActive: true,
};

export default function AdminCompaniesPage() {
  const { token } = useAppStore();
  const perms = usePermissions();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<CompanyForm>({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch {
      toast.error('Failed to load accounts');
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
        const res = await fetch('/api/admin/companies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            id: editItem.id,
            companyName: form.companyName,
            description: form.description,
            industry: form.industry,
            logoUrl: form.logoUrl,
            website: form.website,
            address: form.address,
            phone: form.phone,
            email: form.email,
            tenantTier: form.tenantTier,
            maxUsers: form.maxUsers,
            maxRecords: form.maxRecords,
            dataRetentionDays: form.dataRetentionDays,
            onboardingStatus: form.onboardingStatus,
            isActive: form.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Account updated');
      } else {
        const res = await fetch('/api/admin/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            companyCode: form.companyCode,
            companyName: form.companyName,
            description: form.description,
            industry: form.industry,
            tenantTier: form.tenantTier,
            maxUsers: form.maxUsers,
            maxRecords: form.maxRecords,
            dataRetentionDays: form.dataRetentionDays,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Account created');
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
    if (!token || !confirm('Deactivate this account?')) return;
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Account deactivated');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleProvision = async (companyId: string) => {
    if (!token) return;
    setProvisioningId(companyId);
    try {
      const res = await fetch('/api/admin/companies/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Provisioning failed'); return; }
      toast.success('Account provisioned successfully — default roles created and status set to ACTIVE');
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setProvisioningId(null);
    }
  };

  const handleSuspend = async (companyId: string) => {
    if (!token || !confirm('Suspend this account? Users will not be able to access the system.')) return;
    try {
      const res = await fetch('/api/admin/companies/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, action: 'suspend' }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Account suspended');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleActivate = async (companyId: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/companies/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, action: 'activate' }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Account activated');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (c: any) => {
    setEditItem(c);
    setForm({
      companyCode: c.companyCode || '',
      companyName: c.companyName || '',
      description: c.description || '',
      industry: c.industry || '',
      logoUrl: c.logoUrl || '',
      website: c.website || '',
      address: c.address || '',
      phone: c.phone || '',
      email: c.email || '',
      tenantTier: c.tenantTier || 'PROFESSIONAL',
      maxUsers: c.maxUsers || 50,
      maxRecords: c.maxRecords || 100000,
      dataRetentionDays: c.dataRetentionDays || 365,
      onboardingStatus: c.onboardingStatus || 'PENDING',
      isActive: c.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({ ...defaultForm });
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
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Account Management</h2>
            <p className="text-muted-foreground text-sm mt-1">Manage tenant accounts (Stibo STEP Instances)</p>
          </div>

        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Account
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Onboarding</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No accounts configured yet
                    </TableCell>
                  </TableRow>
                )}
                {companies.map((c) => {
                  const tierStyle = TIER_STYLES[c.tenantTier || 'PROFESSIONAL'] || TIER_STYLES.PROFESSIONAL;
                  const onbStyle = ONBOARDING_STYLES[c.onboardingStatus || 'PENDING'] || ONBOARDING_STYLES.PENDING;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{c.companyCode}</span>
                          <Badge variant="outline" className="text-[10px] border-muted">Account</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{c.companyName}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-xs border font-semibold', tierStyle.bg, tierStyle.text, tierStyle.border)}>
                          {c.tenantTier || 'PROFESSIONAL'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-xs border', onbStyle.bg, onbStyle.text, onbStyle.border)}>
                          {c.onboardingStatus || 'PENDING'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          {c.userCount || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <Database className="w-3.5 h-3.5 text-muted-foreground" />
                          {c.recordCount || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {c.maxUsers || 50} users / {((c.maxRecords || 100000) / 1000).toFixed(0)}k records
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(
                          'text-xs border',
                          c.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                        )}>
                          {c.isActive ? 'Active' : 'Inactive'}
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
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit Account
                            </DropdownMenuItem>
                            {c.onboardingStatus === 'PENDING' && (
                              <DropdownMenuItem
                                onClick={() => handleProvision(c.id)}
                                disabled={provisioningId === c.id}
                              >
                                {provisioningId === c.id ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Rocket className="w-4 h-4 mr-2" />
                                )}
                                Provision
                              </DropdownMenuItem>
                            )}
                            {c.onboardingStatus === 'ACTIVE' && (
                              <DropdownMenuItem className="text-amber-700" onClick={() => handleSuspend(c.id)}>
                                <PauseCircle className="w-4 h-4 mr-2" /> Suspend
                              </DropdownMenuItem>
                            )}
                            {c.onboardingStatus === 'SUSPENDED' && (
                              <DropdownMenuItem className="text-green-700" onClick={() => handleActivate(c.id)}>
                                <PlayCircle className="w-4 h-4 mr-2" /> Activate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(c.id)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Deactivate
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Account' : 'Create Account'}</DialogTitle>
            <DialogDescription>
              {editItem ? 'Update tenant account information' : 'Add a new tenant account (Stibo STEP Instance)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Code *</Label>
                <Input
                  value={form.companyCode}
                  onChange={(e) => setForm({ ...form, companyCode: e.target.value.toUpperCase() })}
                  disabled={!!editItem}
                  className="font-mono"
                  placeholder="e.g. ACME"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Name *</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="e.g. Acme Corporation"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of the account"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="e.g. Manufacturing"
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St, City"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 555-0100"
                />
              </div>
            </div>

            {/* Tenant Configuration */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Tenant Configuration
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tenant Tier</Label>
                  <Select
                    value={form.tenantTier}
                    onValueChange={(v) => setForm({ ...form, tenantTier: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STARTER">
                        <span className="flex items-center gap-2">
                          <Badge className={cn('text-[10px] border', TIER_STYLES.STARTER.bg, TIER_STYLES.STARTER.text, TIER_STYLES.STARTER.border)}>STARTER</Badge>
                          <span className="text-muted-foreground text-xs">— Basic</span>
                        </span>
                      </SelectItem>
                      <SelectItem value="PROFESSIONAL">
                        <span className="flex items-center gap-2">
                          <Badge className={cn('text-[10px] border', TIER_STYLES.PROFESSIONAL.bg, TIER_STYLES.PROFESSIONAL.text, TIER_STYLES.PROFESSIONAL.border)}>PROFESSIONAL</Badge>
                          <span className="text-muted-foreground text-xs">— Standard</span>
                        </span>
                      </SelectItem>
                      <SelectItem value="ENTERPRISE">
                        <span className="flex items-center gap-2">
                          <Badge className={cn('text-[10px] border', TIER_STYLES.ENTERPRISE.bg, TIER_STYLES.ENTERPRISE.text, TIER_STYLES.ENTERPRISE.border)}>ENTERPRISE</Badge>
                          <span className="text-muted-foreground text-xs">— Premium</span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editItem && (
                  <div className="space-y-2">
                    <Label>Onboarding Status</Label>
                    <Select
                      value={form.onboardingStatus}
                      onValueChange={(v) => setForm({ ...form, onboardingStatus: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED'].map((s) => {
                          const sty = ONBOARDING_STYLES[s];
                          return (
                            <SelectItem key={s} value={s}>
                              <Badge className={cn('text-[10px] border', sty.bg, sty.text, sty.border)}>{s}</Badge>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Max Users</Label>
                  <Input
                    type="number"
                    value={form.maxUsers}
                    onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value) || 0 })}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Records</Label>
                  <Input
                    type="number"
                    value={form.maxRecords}
                    onChange={(e) => setForm({ ...form, maxRecords: parseInt(e.target.value) || 0 })}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Retention (Days)</Label>
                  <Input
                    type="number"
                    value={form.dataRetentionDays}
                    onChange={(e) => setForm({ ...form, dataRetentionDays: parseInt(e.target.value) || 365 })}
                    min={30}
                  />
                </div>
              </div>
            </div>

            {editItem && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label>Active</Label>
                <Switch checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: c })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.companyCode || !form.companyName} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
