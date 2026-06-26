'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  HardDrive, Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Clock, CheckCircle2, XCircle, Server, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface SftpConfigData {
  id: string;
  configName: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  remotePath: string;
  schedule: string | null;
  syncDirection: string;
  filePattern: string;
  moduleId: string | null;
  module?: { id: string; moduleCode: string; moduleName: string } | null;
  companyId: string | null;
  company?: { id: string; companyCode: string; companyName: string } | null;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalSyncs: number;
}

interface Company {
  id: string;
  companyCode: string;
  companyName: string;
}

interface Module {
  id: string;
  moduleCode: string;
  moduleName: string;
}

const DIRECTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  INBOUND: { label: 'Inbound', icon: ArrowDownToLine, color: 'bg-teal-100 text-teal-700 border-teal-300' },
  OUTBOUND: { label: 'Outbound', icon: ArrowUpFromLine, color: 'bg-amber-100 text-amber-700 border-amber-300' },
  BIDIRECTIONAL: { label: 'Bidirectional', icon: ArrowLeftRight, color: 'bg-red-100 text-red-700 border-red-300' },
};

export default function SftpManagementPage() {
  const { token, user } = useAppStore();
  const [configs, setConfigs] = useState<SftpConfigData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    configName: '', host: '', port: 22, username: '', authType: 'PASSWORD',
    authCredential: '', remotePath: '/', schedule: '', syncDirection: 'INBOUND',
    filePattern: '*.*', moduleId: '', companyId: '', isActive: true,
  });

  const canAccess = user?.roles?.some(r => ['Super Admin', 'SFTP Manager'].includes(r)) ?? false;

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sRes, cRes, mRes] = await Promise.all([
        fetch('/api/sftp', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      const mData = await mRes.json();
      if (sRes.ok) setConfigs(sData.configs || []);
      if (cRes.ok) setCompanies(cData.companies || []);
      if (mRes.ok) setModules(mData.modules || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (canAccess) loadData();
  }, [loadData, canAccess]);

  const handleCreate = async () => {
    if (!token || !form.configName || !form.host || !form.username) {
      toast.error('Config name, host, and username are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sftp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
      toast.success('SFTP config created');
      setDialogOpen(false);
      setForm({
        configName: '', host: '', port: 22, username: '', authType: 'PASSWORD',
        authCredential: '', remotePath: '/', schedule: '', syncDirection: 'INBOUND',
        filePattern: '*.*', moduleId: '', companyId: '', isActive: true,
      });
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (configId: string, currentActive: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/sftp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: configId, isActive: !currentActive }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
      toast.success(`Config ${!currentActive ? 'activated' : 'deactivated'}`);
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteId) return;
    try {
      const res = await fetch(`/api/sftp?id=${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return; }
      toast.success('SFTP config deleted');
      setDeleteId(null);
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Stats
  const totalConfigs = configs.length;
  const activeConfigs = configs.filter(c => c.isActive).length;
  const lastSync = configs.reduce((latest, c) => {
    if (!c.lastSyncAt) return latest;
    if (!latest) return c.lastSyncAt;
    return new Date(c.lastSyncAt) > new Date(latest) ? c.lastSyncAt : latest;
  }, null as string | null);

  if (!canAccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full shadow-sm">
          <CardContent className="py-12 text-center">
            <HardDrive className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Access Restricted</h3>
            <p className="text-muted-foreground text-sm mt-1">You need SFTP Manager or Super Admin role to manage SFTP configs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-red-600" />
            SFTP Management
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Configure and manage SFTP integration endpoints</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-10" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add SFTP Config
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Configs</p>
                <p className="text-2xl font-bold mt-1">{totalConfigs}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Active</p>
                <p className="text-2xl font-bold mt-1">{activeConfigs}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Last Sync</p>
                <p className="text-lg font-bold mt-1">{lastSync ? formatDate(lastSync) : 'Never'}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Sync Success</p>
                <p className="text-2xl font-bold mt-1">--</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SFTP Config Cards */}
      {configs.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center">
            <HardDrive className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No SFTP configs yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Add your first SFTP configuration to start syncing data</p>
            <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add SFTP Config
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {configs.map((config) => {
            const dirConfig = DIRECTION_CONFIG[config.syncDirection] || DIRECTION_CONFIG.INBOUND;
            const DirIcon = dirConfig.icon;
            return (
              <Card key={config.id} className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                        <Server className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{config.configName}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {config.host}:{config.port}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn('text-[10px] border', dirConfig.color)}>
                        <DirIcon className="w-3 h-3 mr-1" />
                        {dirConfig.label}
                      </Badge>
                      <Badge className={cn(
                        'text-[10px] border',
                        config.isActive
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      )}>
                        {config.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Username:</span>{' '}
                      <span className="font-medium">{config.username}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Auth:</span>{' '}
                      <span className="font-medium">{config.authType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Remote Path:</span>{' '}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.remotePath}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pattern:</span>{' '}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.filePattern}</code>
                    </div>
                    {config.company && (
                      <div>
                        <span className="text-muted-foreground">Company:</span>{' '}
                        <span className="font-medium">{config.company.companyName}</span>
                      </div>
                    )}
                    {config.module && (
                      <div>
                        <span className="text-muted-foreground">Module:</span>{' '}
                        <span className="font-medium">{config.module.moduleName}</span>
                      </div>
                    )}
                  </div>

                  {config.schedule && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Schedule:</span>{' '}
                      <Badge variant="outline" className="text-xs font-mono">{config.schedule}</Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Last sync: {formatDate(config.lastSyncAt)}</span>
                    <span>{config.totalSyncs} total syncs</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <Switch
                      checked={config.isActive}
                      onCheckedChange={() => handleToggleActive(config.id, config.isActive)}
                    />
                    <Button
                      variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8"
                      onClick={() => setDeleteId(config.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                  </div>

                  {/* Sync Log History */}
                  <Accordion type="single" collapsible>
                    <AccordionItem value="sync-logs" className="border-none">
                      <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                        Sync History
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-1">
                          <div className="text-xs text-muted-foreground text-center py-4">
                            No sync logs available yet. Logs will appear after the first sync.
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add SFTP Config Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add SFTP Configuration</DialogTitle>
            <DialogDescription>Set up a new SFTP endpoint for data synchronization</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Config Name *</Label>
                <Input
                  placeholder="e.g., ERP Daily Sync"
                  value={form.configName}
                  onChange={(e) => setForm({ ...form, configName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Host *</Label>
                <Input
                  placeholder="sftp.example.com"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  placeholder="sftp_user"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Auth Type</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASSWORD">Password</SelectItem>
                    <SelectItem value="SSH_KEY">SSH Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{form.authType === 'PASSWORD' ? 'Password' : 'Private Key'}</Label>
                <Input
                  type="password"
                  placeholder={form.authType === 'PASSWORD' ? 'Enter password' : 'Paste private key'}
                  value={form.authCredential}
                  onChange={(e) => setForm({ ...form, authCredential: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Remote Path</Label>
                <Input
                  placeholder="/data/inbound"
                  value={form.remotePath}
                  onChange={(e) => setForm({ ...form, remotePath: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Sync Direction</Label>
                <Select value={form.syncDirection} onValueChange={(v) => setForm({ ...form, syncDirection: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INBOUND">Inbound</SelectItem>
                    <SelectItem value="OUTBOUND">Outbound</SelectItem>
                    <SelectItem value="BIDIRECTIONAL">Bidirectional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Schedule (Cron)</Label>
                <Input
                  placeholder="0 */6 * * *"
                  value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">Leave empty for manual sync only</p>
              </div>
              <div className="space-y-2">
                <Label>File Pattern</Label>
                <Input
                  placeholder="*.csv, *.json"
                  value={form.filePattern}
                  onChange={(e) => setForm({ ...form, filePattern: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Module</Label>
                <Select value={form.moduleId} onValueChange={(v) => setForm({ ...form, moduleId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.moduleName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Enable this SFTP configuration</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Creating...' : 'Create Config'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SFTP Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any scheduled syncs will be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
