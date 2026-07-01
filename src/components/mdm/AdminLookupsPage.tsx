'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ListFilter, Plus, MoreVertical, Pencil, Trash2, ChevronDown, ChevronRight,
  Search, Link2, Loader2, GitBranch,
} from 'lucide-react';
import { toast } from 'sonner';

interface LookupValue {
  valueCode: string;
  displayValue: string;
  description?: string;
  validFrom?: string | null;
  validTo?: string | null;
  parentValueCode?: string | null;
}

interface LookupItem {
  id: string;
  lookupCode: string;
  lookupName: string;
  description?: string;
  category?: string | null;
  isActive?: boolean;
  values?: any[];
  _count?: { fields: number; values: number };
}

const CATEGORY_COLORS: Record<string, string> = {
  System: 'bg-sky-50 text-sky-700 border-sky-300',
  Custom: 'bg-violet-50 text-violet-700 border-violet-300',
  ISO: 'bg-emerald-50 text-emerald-700 border-emerald-300',
};

function toDateInputValue(d?: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function isExpired(v: any): boolean {
  return !!v.validTo && new Date(v.validTo).getTime() < Date.now();
}

function isUpcoming(v: any): boolean {
  return !!v.validFrom && new Date(v.validFrom).getTime() > Date.now();
}

export default function AdminLookupsPage() {
  const { token } = useAppStore();
  const [lookups, setLookups] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<LookupItem | null>(null);
  const [expandedLookup, setExpandedLookup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [whereUsedLookup, setWhereUsedLookup] = useState<LookupItem | null>(null);
  const [whereUsedFields, setWhereUsedFields] = useState<any[]>([]);
  const [whereUsedLoading, setWhereUsedLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LookupItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    lookupCode: '', lookupName: '', description: '', category: '',
    values: [] as LookupValue[],
  });
  const [saving, setSaving] = useState(false);

  // Cross-lookup parent options: when a lookup's values have parentValueCode
  // that references a different lookup (e.g. SUB_CATEGORY → CATEGORY), we
  // need to load those parent lookup values for the parentValueCode selector.
  const [crossLookupParentValues, setCrossLookupParentValues] = useState<{ valueCode: string; displayValue: string }[]>([]);
  const [crossLookupParentName, setCrossLookupParentName] = useState<string>('');
  const [parentFilter, setParentFilter] = useState<string>('ALL');

  // Detect if a lookup has cross-lookup parentValueCode references
  const getCrossLookupParent = useCallback((lookup: LookupItem): { lookupCode: string; name: string } | null => {
    const ownCodes = new Set((lookup.values || []).map((v: any) => v.valueCode));
    const parentCodes = new Set<string>();
    for (const v of (lookup.values || [])) {
      if (v.parentValueCode && !ownCodes.has(v.parentValueCode)) {
        parentCodes.add(v.parentValueCode);
      }
    }
    if (parentCodes.size === 0) return null;
    // Find which other lookup contains those parent codes
    for (const other of lookups) {
      if (other.id === lookup.id) continue;
      const otherCodes = new Set((other.values || []).map((v: any) => v.valueCode));
      let matchCount = 0;
      for (const pc of parentCodes) {
        if (otherCodes.has(pc)) matchCount++;
      }
      // If most parent codes are found in this other lookup, it's the cross-lookup parent
      if (matchCount >= parentCodes.size * 0.5) {
        return { lookupCode: other.lookupCode, name: other.lookupName };
      }
    }
    return null;
  }, [lookups]);

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

  const filteredLookups = useMemo(() => {
    if (!searchQuery.trim()) return lookups;
    const q = searchQuery.toLowerCase();
    return lookups.filter((l) =>
      l.lookupName.toLowerCase().includes(q) ||
      l.lookupCode.toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.values || []).some((v) =>
        v.valueCode.toLowerCase().includes(q) || v.displayValue.toLowerCase().includes(q)
      )
    );
  }, [lookups, searchQuery]);

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
            category: form.category || null,
            values: form.values.map((v) => ({
              valueCode: v.valueCode,
              displayValue: v.displayValue,
              description: v.description || null,
              validFrom: v.validFrom || null,
              validTo: v.validTo || null,
              parentValueCode: v.parentValueCode || null,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Lookup updated');
      } else {
        const res = await fetch('/api/admin/lookups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...form,
            category: form.category || null,
            values: form.values.map((v) => ({
              valueCode: v.valueCode,
              displayValue: v.displayValue,
              description: v.description || null,
              validFrom: v.validFrom || null,
              validTo: v.validTo || null,
              parentValueCode: v.parentValueCode || null,
            })),
          }),
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

  const openWhereUsed = async (l: LookupItem) => {
    setWhereUsedLookup(l);
    setWhereUsedFields([]);
    setWhereUsedLoading(true);
    try {
      const res = await fetch(`/api/fields?lookupId=${l.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWhereUsedFields(data.fields || []);
      } else {
        toast.error(data.error || 'Failed to load where-used');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setWhereUsedLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/lookups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(data.message || 'Lookup deactivated');
      setDeleteTarget(null);
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (l: LookupItem) => {
    setEditItem(l);
    setForm({
      lookupCode: l.lookupCode,
      lookupName: l.lookupName,
      description: l.description || '',
      category: l.category || '',
      values: l.values?.map((v: any) => ({
        valueCode: v.valueCode,
        displayValue: v.displayValue,
        description: v.description || '',
        validFrom: v.validFrom ? toDateInputValue(v.validFrom) : '',
        validTo: v.validTo ? toDateInputValue(v.validTo) : '',
        parentValueCode: v.parentValueCode || '',
      })) || [],
    });

    // Detect cross-lookup parent and load its values
    const crossParent = getCrossLookupParent(l);
    if (crossParent) {
      const parentLookup = lookups.find((lk) => lk.lookupCode === crossParent.lookupCode);
      if (parentLookup) {
        setCrossLookupParentValues(
          (parentLookup.values || []).map((v: any) => ({ valueCode: v.valueCode, displayValue: v.displayValue }))
        );
        setCrossLookupParentName(parentLookup.lookupName);
      }
    } else {
      setCrossLookupParentValues([]);
      setCrossLookupParentName('');
    }

    setParentFilter('ALL');
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({
      lookupCode: '', lookupName: '', description: '', category: '',
      values: [{ valueCode: '', displayValue: '', description: '', validFrom: '', validTo: '', parentValueCode: '' }],
    });
    setCrossLookupParentValues([]);
    setCrossLookupParentName('');
    setParentFilter('ALL');
    setDialogOpen(true);
  };

  const addValueRow = () => {
    setForm({
      ...form,
      values: [...form.values, { valueCode: '', displayValue: '', description: '', validFrom: '', validTo: '', parentValueCode: '' }],
    });
  };

  const removeValueRow = (index: number) => {
    setForm({ ...form, values: form.values.filter((_, i) => i !== index) });
  };

  const updateValueRow = (index: number, field: keyof LookupValue, value: string) => {
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Lookup Management</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage lookup types and their values</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Lookup
        </Button>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search lookups by name, code, or value..."
          className="pl-9 h-10"
        />
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
        ) : filteredLookups.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No lookups match &ldquo;{searchQuery}&rdquo;.</p>
            </CardContent>
          </Card>
        ) : (
          filteredLookups.map((l) => {
            const isExpanded = expandedLookup === l.id;
            const fieldCount = l._count?.fields ?? 0;
            return (
              <Card key={l.id} className={cn('shadow-sm', !l.isActive && 'opacity-60')}>
                <CardHeader
                  className="cursor-pointer hover:bg-accent/30 transition-colors rounded-t-lg"
                  onClick={() => setExpandedLookup(isExpanded ? null : l.id)}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{l.lookupName}</CardTitle>
                        <CardDescription className="font-mono text-xs">{l.lookupCode}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {l.category && (
                        <Badge variant="outline" className={cn('text-xs', CATEGORY_COLORS[l.category] || 'bg-muted text-muted-foreground border-border')}>
                          {l.category}
                        </Badge>
                      )}
                      {!l.isActive && (
                        <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-slate-300">
                          Inactive
                        </Badge>
                      )}
                      {getCrossLookupParent(l) && (
                        <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-300 gap-1">
                          <GitBranch className="w-3 h-3" />
                          Cascading from {getCrossLookupParent(l)!.name}
                        </Badge>
                      )}
                      {!getCrossLookupParent(l) && (l.values || []).some((v: any) => v.parentValueCode) && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 gap-1">
                          <GitBranch className="w-3 h-3" />
                          Cascading
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{l.values?.length || 0} values</Badge>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openWhereUsed(l); }}
                        title="Show fields that reference this lookup"
                        className={cn(
                          'inline-flex items-center gap-1 px-2 h-6 rounded-md text-xs font-medium border transition-colors',
                          fieldCount > 0
                            ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        )}
                      >
                        <Link2 className="w-3 h-3" />
                        Used by {fieldCount} field{fieldCount === 1 ? '' : 's'}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 p-1.5 rounded-md hover:bg-background/80 transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(l)}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(l)}>
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
                    {/* Parent filter for cascading lookups */}
                    {(l.values || []).some((v: any) => v.parentValueCode) && (() => {
                      const crossParent = getCrossLookupParent(l);
                      // Collect unique parent value codes
                      const parentCodes = [...new Set((l.values || []).map((v: any) => v.parentValueCode).filter(Boolean))];
                      // Build parent display map
                      const parentDisplayMap = new Map<string, string>();
                      for (const pc of parentCodes) {
                        const sameLookupParent = l.values?.find((p: any) => p.valueCode === pc);
                        if (sameLookupParent) {
                          parentDisplayMap.set(pc, sameLookupParent.displayValue);
                        } else if (crossParent) {
                          const parentLookup = lookups.find((lk) => lk.lookupCode === crossParent.lookupCode);
                          const crossVal = parentLookup?.values?.find((p: any) => p.valueCode === pc);
                          parentDisplayMap.set(pc, crossVal?.displayValue || pc);
                        } else {
                          parentDisplayMap.set(pc, pc);
                        }
                      }
                      return parentCodes.length > 0 ? (
                        <div className="flex items-center gap-2 mb-3">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">Filter by parent:</Label>
                          <select
                            value={parentFilter}
                            onChange={(e) => setParentFilter(e.target.value)}
                            className="h-7 text-xs rounded-md border border-input bg-background px-2 py-0 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="ALL">All ({l.values?.length || 0})</option>
                            <option value="__NONE__">No parent ({(l.values || []).filter((v: any) => !v.parentValueCode).length})</option>
                            {parentCodes.map((pc: string) => (
                              <option key={pc} value={pc}>
                                {parentDisplayMap.get(pc) || pc} ({(l.values || []).filter((v: any) => v.parentValueCode === pc).length})
                              </option>
                            ))}
                          </select>
                          {crossParent && (
                            <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300">
                              <GitBranch className="w-2.5 h-2.5 mr-0.5" />
                              from {crossParent.name}
                            </Badge>
                          )}
                        </div>
                      ) : null;
                    })()}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Display Value</TableHead>
                          <TableHead>Parent</TableHead>
                          <TableHead>Valid</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Order</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {l.values?.filter((v: any) => {
                          if (parentFilter === 'ALL') return true;
                          if (parentFilter === '__NONE__') return !v.parentValueCode;
                          return v.parentValueCode === parentFilter;
                        }).map((v: any, idx: number) => {
                          // Try to find display value: first in same lookup, then in cross-lookup parent
                          const sameLookupParent = l.values?.find((p: any) => p.valueCode === v.parentValueCode);
                          const crossParent = getCrossLookupParent(l);
                          let crossLookupParentVal: any = null;
                          if (crossParent && !sameLookupParent && v.parentValueCode) {
                            const parentLookup = lookups.find((lk) => lk.lookupCode === crossParent.lookupCode);
                            crossLookupParentVal = parentLookup?.values?.find((p: any) => p.valueCode === v.parentValueCode);
                          }
                          const parentDisplay = sameLookupParent?.displayValue || crossLookupParentVal?.displayValue || v.parentValueCode;
                          const isCrossLookup = !sameLookupParent && !!crossLookupParentVal;
                          return (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono text-xs">{v.valueCode}</TableCell>
                            <TableCell>
                              {v.displayValue}
                              {v.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              {v.parentValueCode ? (
                                <Badge variant="outline" className={cn(
                                  "text-[10px] font-mono",
                                  isCrossLookup
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : "bg-violet-50 text-violet-700 border-violet-300"
                                )}>
                                  {isCrossLookup && <GitBranch className="w-2.5 h-2.5 mr-0.5" />}
                                  {parentDisplay}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {v.validFrom && <div>From: {new Date(v.validFrom).toLocaleDateString()}</div>}
                              {v.validTo && <div>To: {new Date(v.validTo).toLocaleDateString()}</div>}
                              {!v.validFrom && !v.validTo && <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {isExpired(v) ? (
                                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-300">Expired</Badge>
                              ) : isUpcoming(v) ? (
                                <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-300">Upcoming</Badge>
                              ) : !v.isActive ? (
                                <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-slate-300">Inactive</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-300">Active</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Lookup' : 'Create Lookup'}</DialogTitle>
            <DialogDescription>Define lookup type and its values</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="System / Custom / ISO"
                  list="lookup-categories"
                />
                <datalist id="lookup-categories">
                  <option value="System" />
                  <option value="Custom" />
                  <option value="ISO" />
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
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
                  <div key={idx} className="rounded-lg border p-2 space-y-2 bg-muted/30">
                    <div className="flex items-center gap-2">
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
                    <Input
                      value={v.description || ''}
                      onChange={(e) => updateValueRow(idx, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="text-xs h-9"
                    />
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                        Parent Value
                        <span className="text-[9px] normal-case text-violet-600">(untuk cascading dropdown)</span>
                        {crossLookupParentName && (
                          <span className="text-[9px] normal-case text-emerald-600 font-medium">← from {crossLookupParentName}</span>
                        )}
                      </Label>
                      <select
                        value={v.parentValueCode || ''}
                        onChange={(e) => updateValueRow(idx, 'parentValueCode', e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="">— No parent (root value) —</option>
                        {crossLookupParentValues.length > 0 && (
                          <optgroup label={`── ${crossLookupParentName} (cross-lookup) ──`}>
                            {crossLookupParentValues.map((p) => (
                              <option key={p.valueCode} value={p.valueCode}>
                                {p.valueCode} — {p.displayValue}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {form.values
                          .filter((p) => p.valueCode && p.valueCode !== v.valueCode)
                          .length > 0 && (
                          <optgroup label="── Same lookup values ──">
                            {form.values
                              .filter((p) => p.valueCode && p.valueCode !== v.valueCode)
                              .map((p) => (
                                <option key={p.valueCode} value={p.valueCode}>
                                  {p.valueCode} — {p.displayValue}
                                </option>
                              ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Valid From</Label>
                        <Input
                          type="date"
                          value={v.validFrom || ''}
                          onChange={(e) => updateValueRow(idx, 'validFrom', e.target.value)}
                          className="text-xs h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Valid To</Label>
                        <Input
                          type="date"
                          value={v.validTo || ''}
                          onChange={(e) => updateValueRow(idx, 'validTo', e.target.value)}
                          className="text-xs h-9"
                        />
                      </div>
                    </div>
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

      {/* Where-used Dialog */}
      <Dialog open={!!whereUsedLookup} onOpenChange={(open) => { if (!open) setWhereUsedLookup(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Where is this lookup used?</DialogTitle>
            <DialogDescription>
              Fields referencing <span className="font-mono font-semibold">{whereUsedLookup?.lookupCode}</span> ({whereUsedLookup?.lookupName})
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {whereUsedLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading fields...
              </div>
            ) : whereUsedFields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                This lookup is not referenced by any module field.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Field Code</TableHead>
                    <TableHead>Field Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {whereUsedFields.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs">{f.module?.moduleName || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{f.fieldCode}</TableCell>
                      <TableCell className="text-xs">{f.fieldName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhereUsedLookup(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lookup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will <span className="font-semibold text-foreground">deactivate</span> the lookup
                  &ldquo;{deleteTarget?.lookupName}&rdquo; ({deleteTarget?.lookupCode}) and all its values.
                  Existing field references will remain intact but the lookup will be hidden from new selections.
                </p>
                {(deleteTarget?._count?.fields ?? 0) > 0 && (
                  <p className="text-amber-700 bg-amber-50 border border-amber-300 rounded-md p-2 text-sm">
                    ⚠️ This lookup is referenced by <span className="font-bold">{deleteTarget?._count?.fields}</span> module field(s).
                    Deactivating it may affect data entry on those fields.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Use hard delete via API (?hardDelete=true) to permanently remove.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
