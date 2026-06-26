'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Plus, MoreVertical, Pencil, Trash2, Shield, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

const DATA_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTISELECT', 'EMAIL', 'URL', 'LOOKUP'];
const VALIDATION_TYPES = ['REGEX', 'MIN_LENGTH', 'MAX_LENGTH', 'MIN_VALUE', 'MAX_VALUE'];

export default function ModuleDetailPage() {
  const { token, selectedModuleId, navigate } = useAppStore();
  const [metaModule, setMetaModule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editField, setEditField] = useState<any>(null);
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [lookups, setLookups] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [fieldForm, setFieldForm] = useState({
    fieldCode: '', fieldName: '', dataType: 'TEXT',
    isRequired: false, isUnique: false, defaultValue: '',
    placeholder: '', description: '', sortOrder: 0, lookupMasterId: '',
  });

  const [validationForm, setValidationForm] = useState({
    ruleType: 'REGEX', ruleValue: '', errorMessage: '',
  });

  const loadModule = useCallback(async () => {
    if (!token || !selectedModuleId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/modules?action=detail&id=${selectedModuleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMetaModule(data.module);
      } else {
        toast.error(data.error || 'Failed to load module');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, [token, selectedModuleId]);

  const loadLookups = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/lookups', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLookups(data.lookups || []);
    } catch {
      // silent
    }
  }, [token]);

  useEffect(() => {
    loadModule();
    loadLookups();
  }, [loadModule, loadLookups]);

  const handleSaveField = async () => {
    if (!token || !selectedModuleId) return;
    setSaving(true);
    try {
      if (editField) {
        const res = await fetch('/api/fields', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editField.id, ...fieldForm }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
        toast.success('Field updated');
      } else {
        const res = await fetch('/api/fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ moduleId: selectedModuleId, ...fieldForm }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
        toast.success('Field created');
      }
      setFieldDialogOpen(false);
      setEditField(null);
      loadModule();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (id: string) => {
    if (!token || !confirm('Delete this field?')) return;
    try {
      const res = await fetch('/api/fields', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return; }
      toast.success('Field deleted');
      loadModule();
    } catch {
      toast.error('Network error');
    }
  };

  const handleSaveValidation = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fields?action=validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fieldId: selectedFieldId, ...validationForm }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Validation added');
      setValidationDialogOpen(false);
      loadModule();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteValidation = async (id: string) => {
    if (!token) return;
    try {
      await fetch('/api/fields?action=validation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      toast.success('Validation removed');
      loadModule();
    } catch {
      toast.error('Network error');
    }
  };

  const openEditField = (f: any) => {
    setEditField(f);
    setFieldForm({
      fieldCode: f.fieldCode, fieldName: f.fieldName, dataType: f.dataType,
      isRequired: f.isRequired, isUnique: f.isUnique, defaultValue: f.defaultValue || '',
      placeholder: f.placeholder || '', description: f.description || '',
      sortOrder: f.sortOrder, lookupMasterId: f.lookupMasterId || '',
    });
    setFieldDialogOpen(true);
  };

  const openCreateField = () => {
    setEditField(null);
    setFieldForm({
      fieldCode: '', fieldName: '', dataType: 'TEXT',
      isRequired: false, isUnique: false, defaultValue: '',
      placeholder: '', description: '', sortOrder: (metaModule?.fields?.length || 0) + 1,
      lookupMasterId: '',
    });
    setFieldDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!metaModule) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Module not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('modules')}>Back to Modules</Button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('modules')} className="h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{metaModule.moduleName}</h2>
          <p className="text-sm text-muted-foreground font-mono">{metaModule.moduleCode}</p>
        </div>
        <Badge className={cn(
          metaModule.requireApproval
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-green-50 text-green-700 border-green-200'
        )}>
          {metaModule.requireApproval ? 'Approval Required' : 'Auto-approve'}
        </Badge>
      </div>

      {metaModule.description && (
        <p className="text-muted-foreground -mt-2 ml-12">{metaModule.description}</p>
      )}

      {/* Fields Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg">Fields</CardTitle>
            <CardDescription>{metaModule.fields?.length || 0} fields defined</CardDescription>
          </div>
          <Button className="bg-red-600 hover:bg-red-700 text-white h-9" onClick={openCreateField}>
            <Plus className="w-4 h-4 mr-1" /> Add Field
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {metaModule.fields?.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No fields defined yet. Add fields to build your schema.</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Req</TableHead>
                    <TableHead className="text-center">Unique</TableHead>
                    <TableHead>Validations</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metaModule.fields?.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-muted-foreground">
                        <GripVertical className="w-4 h-4" />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{f.fieldCode}</TableCell>
                      <TableCell className="font-medium">{f.fieldName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{f.dataType}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {f.isRequired && <span className="text-red-500 font-bold">*</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {f.isUnique && <span className="text-red-600 font-bold">✓</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {f.validations?.map((v: any) => (
                            <Badge key={v.id} variant="secondary" className="text-xs group/val">
                              {v.ruleType}
                              <button
                                onClick={() => handleDeleteValidation(v.id)}
                                className="ml-1 opacity-0 group-hover/val:opacity-100 hover:text-destructive transition-opacity"
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                          {f.dataType === 'SELECT' && f.lookupMaster && (
                            <Badge className="text-xs bg-teal-50 text-teal-700 border-teal-200">
                              Lookup: {f.lookupMaster.lookupName}
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              setSelectedFieldId(f.id);
                              setValidationForm({ ruleType: 'REGEX', ruleValue: '', errorMessage: '' });
                              setValidationDialogOpen(true);
                            }}
                          >
                            <Shield className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditField(f)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteField(f.id)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Field Dialog */}
      <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editField ? 'Edit Field' : 'Add Field'}</DialogTitle>
            <DialogDescription>Configure the field properties and data type</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Field Code</Label>
                <Input
                  placeholder="e.g. article_code"
                  value={fieldForm.fieldCode}
                  onChange={(e) => setFieldForm({ ...fieldForm, fieldCode: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  disabled={!!editField}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Field Name</Label>
                <Input
                  placeholder="e.g. Article Code"
                  value={fieldForm.fieldName}
                  onChange={(e) => setFieldForm({ ...fieldForm, fieldName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Type</Label>
                <Select value={fieldForm.dataType} onValueChange={(v) => setFieldForm({ ...fieldForm, dataType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={fieldForm.sortOrder}
                  onChange={(e) => setFieldForm({ ...fieldForm, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            {(fieldForm.dataType === 'SELECT' || fieldForm.dataType === 'LOOKUP') && (
              <div className="space-y-2">
                <Label>Lookup Source</Label>
                <Select value={fieldForm.lookupMasterId} onValueChange={(v) => setFieldForm({ ...fieldForm, lookupMasterId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a lookup" /></SelectTrigger>
                  <SelectContent>
                    {lookups.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.lookupName} ({l.lookupCode})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="text-sm">Required</Label>
                </div>
                <Switch
                  checked={fieldForm.isRequired}
                  onCheckedChange={(c) => setFieldForm({ ...fieldForm, isRequired: c })}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="text-sm">Unique</Label>
                </div>
                <Switch
                  checked={fieldForm.isUnique}
                  onCheckedChange={(c) => setFieldForm({ ...fieldForm, isUnique: c })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Default Value</Label>
              <Input
                placeholder="Default value"
                value={fieldForm.defaultValue}
                onChange={(e) => setFieldForm({ ...fieldForm, defaultValue: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                placeholder="Input placeholder text"
                value={fieldForm.placeholder}
                onChange={(e) => setFieldForm({ ...fieldForm, placeholder: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Field description"
                value={fieldForm.description}
                onChange={(e) => setFieldForm({ ...fieldForm, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveField} disabled={saving || !fieldForm.fieldCode || !fieldForm.fieldName} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editField ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Dialog */}
      <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Validation Rule</DialogTitle>
            <DialogDescription>Define a validation rule for this field</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={validationForm.ruleType} onValueChange={(v) => setValidationForm({ ...validationForm, ruleType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALIDATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rule Value</Label>
              <Input
                placeholder={validationForm.ruleType === 'REGEX' ? 'e.g. ^[A-Z0-9-]+$' : 'e.g. 3'}
                value={validationForm.ruleValue}
                onChange={(e) => setValidationForm({ ...validationForm, ruleValue: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Error Message</Label>
              <Input
                placeholder="Custom error message"
                value={validationForm.errorMessage}
                onChange={(e) => setValidationForm({ ...validationForm, errorMessage: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidationDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveValidation} disabled={saving || !validationForm.ruleValue} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Adding...' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
