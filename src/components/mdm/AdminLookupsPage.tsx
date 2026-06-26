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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ListFilter, Plus, MoreVertical, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLookupsPage() {
  const { token } = useAppStore();
  const [lookups, setLookups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [expandedLookup, setExpandedLookup] = useState<string | null>(null);
  const [form, setForm] = useState({
    lookupCode: '', lookupName: '', description: '',
    values: [] as Array<{ valueCode: string; displayValue: string }>,
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/lookups', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setLookups(data.lookups || []);
    } catch {
      toast.error('Failed to load lookups');
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
        const res = await fetch('/api/admin/lookups', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            id: editItem.id,
            lookupName: form.lookupName,
            description: form.description,
            values: form.values,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Lookup updated');
      } else {
        const res = await fetch('/api/admin/lookups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Lookup created');
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
    if (!token || !confirm('Delete this lookup and all its values?')) return;
    try {
      const res = await fetch('/api/admin/lookups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Lookup deleted');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (l: any) => {
    setEditItem(l);
    setForm({
      lookupCode: l.lookupCode,
      lookupName: l.lookupName,
      description: l.description || '',
      values: l.values?.map((v: any) => ({ valueCode: v.valueCode, displayValue: v.displayValue })) || [],
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({
      lookupCode: '', lookupName: '', description: '',
      values: [{ valueCode: '', displayValue: '' }],
    });
    setDialogOpen(true);
  };

  const addValueRow = () => {
    setForm({ ...form, values: [...form.values, { valueCode: '', displayValue: '' }] });
  };

  const removeValueRow = (index: number) => {
    setForm({ ...form, values: form.values.filter((_, i) => i !== index) });
  };

  const updateValueRow = (index: number, field: 'valueCode' | 'displayValue', value: string) => {
    const newValues = [...form.values];
    newValues[index] = { ...newValues[index], [field]: value };
    setForm({ ...form, values: newValues });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lookup Management</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage lookup types and their values</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Lookup
        </Button>
      </div>

      <div className="space-y-3">
        {lookups.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center">
              <ListFilter className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No lookups</h3>
              <p className="text-muted-foreground text-sm mt-1">Create lookups for dropdown field options.</p>
            </CardContent>
          </Card>
        ) : (
          lookups.map((l) => {
            const isExpanded = expandedLookup === l.id;
            return (
              <Card key={l.id} className="shadow-sm">
                <CardHeader
                  className="cursor-pointer hover:bg-accent/30 transition-colors rounded-t-lg"
                  onClick={() => setExpandedLookup(isExpanded ? null : l.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <div>
                        <CardTitle className="text-base">{l.lookupName}</CardTitle>
                        <CardDescription className="font-mono text-xs">{l.lookupCode}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{l.values?.length || 0} values</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(l)}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(l.id)}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    {l.description && <p className="text-sm text-muted-foreground mb-3">{l.description}</p>}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Display Value</TableHead>
                          <TableHead>Order</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {l.values?.map((v: any, idx: number) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono text-xs">{v.valueCode}</TableCell>
                            <TableCell>{v.displayValue}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Lookup' : 'Create Lookup'}</DialogTitle>
            <DialogDescription>Define lookup type and its values</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lookup Code</Label>
                <Input
                  value={form.lookupCode}
                  onChange={(e) => setForm({ ...form, lookupCode: e.target.value.toUpperCase() })}
                  disabled={!!editItem}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Lookup Name</Label>
                <Input value={form.lookupName} onChange={(e) => setForm({ ...form, lookupName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Values</Label>
                <Button variant="outline" size="sm" onClick={addValueRow} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add Value
                </Button>
              </div>
              <div className="space-y-2">
                {form.values.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={v.valueCode}
                      onChange={(e) => updateValueRow(idx, 'valueCode', e.target.value.toUpperCase())}
                      placeholder="CODE"
                      className="font-mono text-xs h-9"
                    />
                    <Input
                      value={v.displayValue}
                      onChange={(e) => updateValueRow(idx, 'displayValue', e.target.value)}
                      placeholder="Display Value"
                      className="text-xs h-9"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeValueRow(idx)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.lookupCode || !form.lookupName} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
