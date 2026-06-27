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
import { ArrowLeft, Plus, MoreVertical, Pencil, Trash2, Shield, GripVertical, Settings, GitBranch } from 'lucide-react';
import { toast } from 'sonner';

const DATA_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTISELECT', 'EMAIL', 'URL', 'LOOKUP', 'IMAGE'];

// ============================================================
// Per-field Validation Rule Types (STIBO-aligned)
// ============================================================
const VALIDATION_TYPES = [
  'REGEX', 'MIN_LENGTH', 'MAX_LENGTH', 'MIN_VALUE', 'MAX_VALUE',
  'REQUIRED', 'UNIQUE', 'ENUM', 'RANGE',
  'EMAIL_FORMAT', 'URL_FORMAT', 'DATE_AFTER', 'DATE_BEFORE',
];
// Rule types that don't take a ruleValue — frontend sends the
// `__NONE__` sentinel and the backend skips parsing it.
const NO_VALUE_RULE_TYPES = new Set(['REQUIRED', 'UNIQUE', 'EMAIL_FORMAT', 'URL_FORMAT']);
// Rule types that should render a date picker (+ "today" shortcut)
const DATE_RULE_TYPES = new Set(['DATE_AFTER', 'DATE_BEFORE']);

// ============================================================
// Cross-field Business Rule options (STIBO Business Rules engine)
// ============================================================
const BUSINESS_RULE_CONDITION_TYPES = ['CROSS_FIELD', 'REQUIRED_IF', 'LOV_CROSS', 'SCRIPTED'];
const BUSINESS_RULE_OPERATORS = [
  '=', '!=', '>', '<', '>=', '<=',
  'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
];
const BUSINESS_RULE_ACTION_TYPES = ['BLOCK', 'WARN', 'SET_VALUE', 'SEND_EMAIL'];
const BUSINESS_RULE_TRIGGERS = ['SAVE', 'APPROVE', 'IMPORT'];

export default function ModuleDetailPage() {
  const { token, selectedModuleId, navigate, user } = useAppStore();
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
    cascadesFromFieldCode: '',
  });

  const [validationForm, setValidationForm] = useState({
    ruleType: 'REGEX', ruleValue: '', errorMessage: '',
  });
  const [editValidation, setEditValidation] = useState<any>(null);
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [moduleForm, setModuleForm] = useState({
    moduleName: '', description: '', requireApproval: false,
  });

  // ============================================================
  // Business Rules state (STIBO cross-field rules engine)
  // ============================================================
  const [businessRules, setBusinessRules] = useState<any[]>([]);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    conditionType: 'CROSS_FIELD',
    leftFieldCode: '',
    operator: '=',
    rightMode: 'field' as 'field' | 'constant',
    rightFieldCode: '',
    constantValue: '',
    actionType: 'BLOCK',
    targetFieldCode: '',
    expression: '',
    errorMessage: '',
    trigger: 'SAVE',
    isActive: true,
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

  const loadBusinessRules = useCallback(async () => {
    if (!token || !selectedModuleId) return;
    try {
      const res = await fetch(`/api/business-rules?moduleId=${selectedModuleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setBusinessRules(data.rules || []);
      }
    } catch {
      // silent — UI still works without business rules
    }
  }, [token, selectedModuleId]);

  useEffect(() => {
    loadModule();
    loadLookups();
    loadBusinessRules();
  }, [loadModule, loadLookups, loadBusinessRules]);

  const handleSaveField = async () => {
    if (!token || !selectedModuleId) return;
    setSaving(true);
    try {
      // Map form state to API field names. The form uses lookupMasterId but
      // the API expects lookupId; also pass cascadesFromFieldCode through.
      const payload: Record<string, unknown> = {
        fieldCode: fieldForm.fieldCode,
        fieldName: fieldForm.fieldName,
        dataType: fieldForm.dataType,
        isRequired: fieldForm.isRequired,
        isUnique: fieldForm.isUnique,
        defaultValue: fieldForm.defaultValue,
        placeholder: fieldForm.placeholder,
        description: fieldForm.description,
        sortOrder: fieldForm.sortOrder,
        lookupId: fieldForm.lookupMasterId || null,
        cascadesFromFieldCode: fieldForm.cascadesFromFieldCode || null,
      };
      if (editField) {
        const res = await fetch('/api/fields', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editField.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
        toast.success('Field updated');
      } else {
        const res = await fetch('/api/fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ moduleId: selectedModuleId, ...payload }),
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
      // For rule types that don't take a value (REQUIRED, UNIQUE,
      // EMAIL_FORMAT, URL_FORMAT), send the `__NONE__` sentinel so the
      // backend knows to skip parsing the ruleValue.
      const noValueNeeded = NO_VALUE_RULE_TYPES.has(validationForm.ruleType);
      const finalForm = {
        ...validationForm,
        ruleValue: noValueNeeded ? '__NONE__' : validationForm.ruleValue,
      };
      const res = await fetch('/api/fields?action=validation', {
        method: editValidation ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          editValidation
            ? { id: editValidation.id, ...finalForm }
            : { fieldId: selectedFieldId, ...finalForm },
        ),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(editValidation ? 'Validation updated' : 'Validation added');
      setValidationDialogOpen(false);
      setEditValidation(null);
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

  // ============================================================
  // Business Rule handlers (Super Admin only — UI gated below)
  // ============================================================

  // Build the JSON shape expected by the backend from the form state.
  const buildRuleConditionJson = () => {
    const cond: Record<string, unknown> = {
      leftFieldCode: ruleForm.leftFieldCode,
      operator: ruleForm.operator,
    };
    if (ruleForm.rightMode === 'field') {
      cond.rightFieldCode = ruleForm.rightFieldCode;
    } else {
      cond.constantValue = ruleForm.constantValue;
    }
    return JSON.stringify(cond);
  };

  const buildRuleActionJson = () => {
    if (ruleForm.actionType !== 'SET_VALUE') return null;
    return JSON.stringify({
      targetFieldCode: ruleForm.targetFieldCode,
      expression: ruleForm.expression,
    });
  };

  const handleSaveBusinessRule = async () => {
    if (!token || !selectedModuleId) return;
    if (!ruleForm.name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (!ruleForm.leftFieldCode) {
      toast.error('Left field is required');
      return;
    }
    if (ruleForm.rightMode === 'field' && !ruleForm.rightFieldCode) {
      toast.error('Right field is required (or switch to Constant Value)');
      return;
    }
    if (ruleForm.actionType === 'SET_VALUE' && (!ruleForm.targetFieldCode || !ruleForm.expression)) {
      toast.error('SET_VALUE requires a target field and expression');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        moduleId: selectedModuleId,
        name: ruleForm.name,
        description: ruleForm.description || null,
        conditionType: ruleForm.conditionType,
        conditionJson: buildRuleConditionJson(),
        actionType: ruleForm.actionType,
        actionJson: buildRuleActionJson(),
        errorMessage: ruleForm.errorMessage || null,
        trigger: ruleForm.trigger,
        isActive: ruleForm.isActive,
      };
      const res = await fetch('/api/business-rules', {
        method: editRule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editRule ? { id: editRule.id, ...body } : body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(editRule ? 'Business rule updated' : 'Business rule created');
      setRuleDialogOpen(false);
      setEditRule(null);
      loadBusinessRules();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBusinessRule = async (id: string) => {
    if (!token || !confirm('Delete this business rule?')) return;
    try {
      const res = await fetch('/api/business-rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed'); return; }
      toast.success('Business rule deleted');
      loadBusinessRules();
    } catch {
      toast.error('Network error');
    }
  };

  const handleToggleRuleActive = async (rule: any) => {
    if (!token) return;
    try {
      const res = await fetch('/api/business-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed'); return; }
      toast.success(rule.isActive ? 'Rule disabled' : 'Rule enabled');
      loadBusinessRules();
    } catch {
      toast.error('Network error');
    }
  };

  // Render a human-readable summary of a business rule's condition.
  const describeCondition = (rule: any): string => {
    try {
      const c = JSON.parse(rule.conditionJson) as {
        leftFieldCode?: string; operator?: string;
        rightFieldCode?: string; constantValue?: unknown;
      };
      const right = c.rightFieldCode
        ? `{{${c.rightFieldCode}}}`
        : JSON.stringify(c.constantValue ?? '');
      return `${c.leftFieldCode || '?'} ${c.operator || '?'} ${right}`;
    } catch {
      return '(invalid)';
    }
  };

  const describeAction = (rule: any): string => {
    if (rule.actionType === 'SET_VALUE' && rule.actionJson) {
      try {
        const a = JSON.parse(rule.actionJson) as { targetFieldCode?: string; expression?: string };
        return `SET ${a.targetFieldCode || '?'} = ${a.expression || '?'}`;
      } catch {
        return 'SET_VALUE (invalid)';
      }
    }
    return rule.actionType;
  };

  const openCreateRule = () => {
    setEditRule(null);
    setRuleForm({
      name: '',
      description: '',
      conditionType: 'CROSS_FIELD',
      leftFieldCode: metaModule?.fields?.[0]?.fieldCode || '',
      operator: '=',
      rightMode: 'field',
      rightFieldCode: metaModule?.fields?.[1]?.fieldCode || '',
      constantValue: '',
      actionType: 'BLOCK',
      targetFieldCode: metaModule?.fields?.[0]?.fieldCode || '',
      expression: '',
      errorMessage: '',
      trigger: 'SAVE',
      isActive: true,
    });
    setRuleDialogOpen(true);
  };

  const openEditRule = (r: any) => {
    setEditRule(r);
    let leftFieldCode = '';
    let operator = '=';
    let rightMode: 'field' | 'constant' = 'field';
    let rightFieldCode = '';
    let constantValue = '';
    try {
      const c = JSON.parse(r.conditionJson) as {
        leftFieldCode?: string; operator?: string;
        rightFieldCode?: string; constantValue?: unknown;
      };
      leftFieldCode = c.leftFieldCode || '';
      operator = c.operator || '=';
      if (c.rightFieldCode) {
        rightMode = 'field';
        rightFieldCode = c.rightFieldCode;
      } else {
        rightMode = 'constant';
        constantValue = c.constantValue !== undefined ? String(c.constantValue) : '';
      }
    } catch {
      // leave defaults
    }
    let targetFieldCode = '';
    let expression = '';
    if (r.actionType === 'SET_VALUE' && r.actionJson) {
      try {
        const a = JSON.parse(r.actionJson) as { targetFieldCode?: string; expression?: string };
        targetFieldCode = a.targetFieldCode || '';
        expression = a.expression || '';
      } catch {
        // leave defaults
      }
    }
    setRuleForm({
      name: r.name || '',
      description: r.description || '',
      conditionType: r.conditionType || 'CROSS_FIELD',
      leftFieldCode,
      operator,
      rightMode,
      rightFieldCode,
      constantValue,
      actionType: r.actionType || 'BLOCK',
      targetFieldCode,
      expression,
      errorMessage: r.errorMessage || '',
      trigger: r.trigger || 'SAVE',
      isActive: r.isActive ?? true,
    });
    setRuleDialogOpen(true);
  };

  const isSuperAdminUser = !!user?.roles?.includes('Super Admin');
  const moduleFields: any[] = metaModule?.fields || [];
  const noValueNeeded = NO_VALUE_RULE_TYPES.has(validationForm.ruleType);
  const isDateRule = DATE_RULE_TYPES.has(validationForm.ruleType);
  const isEnumRule = validationForm.ruleType === 'ENUM';
  const ruleValuePlaceholder = validationForm.ruleType === 'REGEX'
    ? 'e.g. ^[A-Z0-9-]+$'
    : validationForm.ruleType === 'RANGE'
      ? 'e.g. 10,100'
      : validationForm.ruleType === 'MIN_LENGTH' || validationForm.ruleType === 'MAX_LENGTH'
        ? 'e.g. 3'
        : 'value';

  const handleSaveModule = async () => {
    if (!token || !selectedModuleId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: selectedModuleId,
          moduleName: moduleForm.moduleName,
          description: moduleForm.description,
          requireApproval: moduleForm.requireApproval,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Module updated');
      setModuleDialogOpen(false);
      loadModule();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const openEditField = (f: any) => {
    setEditField(f);
    setFieldForm({
      fieldCode: f.fieldCode, fieldName: f.fieldName, dataType: f.dataType,
      isRequired: f.isRequired, isUnique: f.isUnique, defaultValue: f.defaultValue || '',
      placeholder: f.placeholder || '', description: f.description || '',
      sortOrder: f.sortOrder, lookupMasterId: f.lookupId || f.lookupMaster?.id || '',
      cascadesFromFieldCode: f.cascadesFromFieldCode || '',
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
      cascadesFromFieldCode: '',
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
        {user?.roles?.includes('Super Admin') && (
          <Button
            className="bg-red-600 hover:bg-red-700 text-white h-9 ml-auto"
            onClick={() => {
              setModuleForm({
                moduleName: metaModule.moduleName || '',
                description: metaModule.description || '',
                requireApproval: !!metaModule.requireApproval,
              });
              setModuleDialogOpen(true);
            }}
          >
            <Settings className="w-4 h-4 mr-1" /> Edit Module
          </Button>
        )}
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
                            <Badge
                              key={v.id}
                              variant="secondary"
                              className="text-xs group/val cursor-pointer hover:bg-secondary/80"
                              onClick={() => {
                                setSelectedFieldId(f.id);
                                setEditValidation(v);
                                setValidationForm({
                                  ruleType: v.ruleType,
                                  ruleValue: v.ruleValue || '',
                                  errorMessage: v.errorMessage || '',
                                });
                                setValidationDialogOpen(true);
                              }}
                            >
                              {v.ruleType}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteValidation(v.id);
                                }}
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
                              setEditValidation(null);
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

      {/* ============================================================
          Business Rules card (STIBO cross-field rules engine)
          Visible to all authenticated users (read), but Add/Edit/Delete
          gated to Super Admin.
          ============================================================ */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              Business Rules
            </CardTitle>
            <CardDescription>
              {businessRules.length} cross-field rule{businessRules.length === 1 ? '' : 's'} configured
            </CardDescription>
          </div>
          {isSuperAdminUser && (
            <Button className="bg-red-600 hover:bg-red-700 text-white h-9" onClick={openCreateRule}>
              <Plus className="w-4 h-4 mr-1" /> Add Rule
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {businessRules.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                No business rules yet. Add cross-field rules (BLOCK / SET_VALUE / WARN) to enforce STIBO-style logic on save.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    {isSuperAdminUser && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businessRules.map((rule: any) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div className="font-medium">{rule.name}</div>
                        {rule.description && (
                          <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-xs">{rule.description}</div>
                        )}
                        {rule.errorMessage && (
                          <div className="text-[11px] text-amber-600 line-clamp-1 max-w-xs">⚠ {rule.errorMessage}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {describeCondition(rule)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            rule.actionType === 'BLOCK' && 'bg-red-50 text-red-700 border-red-200',
                            rule.actionType === 'WARN' && 'bg-amber-50 text-amber-700 border-amber-200',
                            rule.actionType === 'SET_VALUE' && 'bg-violet-50 text-violet-700 border-violet-200',
                            rule.actionType === 'SEND_EMAIL' && 'bg-teal-50 text-teal-700 border-teal-200',
                          )}
                        >
                          {describeAction(rule)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{rule.trigger}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={!!rule.isActive}
                          disabled={!isSuperAdminUser}
                          onCheckedChange={() => handleToggleRuleActive(rule)}
                        />
                      </TableCell>
                      {isSuperAdminUser && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditRule(rule)}>
                                <Pencil className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteBusinessRule(rule.id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
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
            {(fieldForm.dataType === 'SELECT' || fieldForm.dataType === 'LOOKUP' || fieldForm.dataType === 'MULTISELECT') && (
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
            {(fieldForm.dataType === 'SELECT' || fieldForm.dataType === 'LOOKUP') && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Cascades From
                  <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-300 px-1 py-0">cascading dropdown</Badge>
                </Label>
                <Select
                  value={fieldForm.cascadesFromFieldCode}
                  onValueChange={(v) => setFieldForm({ ...fieldForm, cascadesFromFieldCode: v === '__NONE__' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder="— None (flat list) —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">— None (flat list) —</SelectItem>
                    {metaModule?.fields
                      ?.filter((f: any) => f.fieldCode !== fieldForm.fieldCode && (f.dataType === 'SELECT' || f.dataType === 'LOOKUP'))
                      .map((f: any) => (
                        <SelectItem key={f.id} value={f.fieldCode}>
                          {f.fieldName} ({f.fieldCode})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Pilih field induk. Opsi lookup ini akan di-filter berdasarkan nilai field induk
                  (menggunakan <span className="font-mono">parentValueCode</span> di lookup).
                </p>
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
            <DialogTitle>{editValidation ? 'Edit Validation Rule' : 'Add Validation Rule'}</DialogTitle>
            <DialogDescription>Define a validation rule for this field</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={validationForm.ruleType} onValueChange={(v) => setValidationForm({ ...validationForm, ruleType: v, ruleValue: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALIDATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Rule Value — dynamic per rule type */}
            {noValueNeeded ? (
              <div className="space-y-2">
                <Label>Rule Value</Label>
                <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                  No value needed for this rule type
                </div>
              </div>
            ) : isDateRule ? (
              <div className="space-y-2">
                <Label>Rule Value (date)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={validationForm.ruleValue}
                    onChange={(e) => setValidationForm({ ...validationForm, ruleValue: e.target.value })}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValidationForm({ ...validationForm, ruleValue: 'today' })}
                  >
                    today
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use an ISO date or click <span className="font-mono">today</span> for the current date.
                </p>
              </div>
            ) : isEnumRule ? (
              <div className="space-y-2">
                <Label>Allowed Values</Label>
                <Textarea
                  placeholder="value1,value2,value3"
                  value={validationForm.ruleValue}
                  onChange={(e) => setValidationForm({ ...validationForm, ruleValue: e.target.value })}
                  className="font-mono"
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground">
                  Comma-separated whitelist of allowed values.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Rule Value</Label>
                <Input
                  placeholder={ruleValuePlaceholder}
                  value={validationForm.ruleValue}
                  onChange={(e) => setValidationForm({ ...validationForm, ruleValue: e.target.value })}
                  className="font-mono"
                />
                {validationForm.ruleType === 'RANGE' && (
                  <p className="text-[11px] text-muted-foreground">Format: <span className="font-mono">min,max</span> (numeric range).</p>
                )}
              </div>
            )}

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
            <Button
              onClick={handleSaveValidation}
              disabled={saving || (!noValueNeeded && !validationForm.ruleValue)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Saving...' : editValidation ? 'Update' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Module Edit Dialog */}
      <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Module</DialogTitle>
            <DialogDescription>Update module metadata (code is immutable after creation)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Module Name</Label>
              <Input
                placeholder="Module name"
                value={moduleForm.moduleName}
                onChange={(e) => setModuleForm({ ...moduleForm, moduleName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Module Code</Label>
              <Input value={metaModule.moduleCode || ''} disabled className="font-mono" />
              <p className="text-[11px] text-muted-foreground">Module code is immutable after creation (unique identifier).</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Module description"
                value={moduleForm.description}
                onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="text-sm">Require Approval</Label>
                <p className="text-[11px] text-muted-foreground">When off, edits auto-publish. When on, edits require approval.</p>
              </div>
              <Switch
                checked={moduleForm.requireApproval}
                onCheckedChange={(c) => setModuleForm({ ...moduleForm, requireApproval: c })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModuleDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={handleSaveModule}
              disabled={saving || !moduleForm.moduleName}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Saving...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================
          Business Rule Dialog — STIBO cross-field rule editor
          Condition: leftFieldCode + operator + (rightFieldCode | constant)
          Action: BLOCK | WARN | SET_VALUE | SEND_EMAIL
          ============================================================ */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editRule ? 'Edit Business Rule' : 'Add Business Rule'}</DialogTitle>
            <DialogDescription>
              Cross-field rule (STIBO Business Rules engine). Conditions are evaluated on save; actions can block, warn, compute a value, or queue an email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  placeholder="e.g. List price must be > cost price"
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Condition Type</Label>
                <Select
                  value={ruleForm.conditionType}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, conditionType: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_RULE_CONDITION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="What this rule enforces (optional)"
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Condition builder */}
            {(ruleForm.conditionType === 'CROSS_FIELD' || ruleForm.conditionType === 'REQUIRED_IF') && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Condition</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Left Field</Label>
                    <Select
                      value={ruleForm.leftFieldCode}
                      onValueChange={(v) => setRuleForm({ ...ruleForm, leftFieldCode: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {moduleFields.map((f: any) => (
                          <SelectItem key={f.id} value={f.fieldCode}>
                            {f.fieldName} ({f.fieldCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Operator</Label>
                    <Select
                      value={ruleForm.operator}
                      onValueChange={(v) => setRuleForm({ ...ruleForm, operator: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BUSINESS_RULE_OPERATORS.map((op) => (
                          <SelectItem key={op} value={op}>{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Right Side</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={ruleForm.rightMode === 'field' ? 'default' : 'outline'}
                        onClick={() => setRuleForm({ ...ruleForm, rightMode: 'field' })}
                      >
                        Field
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={ruleForm.rightMode === 'constant' ? 'default' : 'outline'}
                        onClick={() => setRuleForm({ ...ruleForm, rightMode: 'constant' })}
                      >
                        Constant
                      </Button>
                    </div>
                  </div>
                </div>
                {ruleForm.rightMode === 'field' ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Right Field</Label>
                    <Select
                      value={ruleForm.rightFieldCode}
                      onValueChange={(v) => setRuleForm({ ...ruleForm, rightFieldCode: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {moduleFields.map((f: any) => (
                          <SelectItem key={f.id} value={f.fieldCode}>
                            {f.fieldName} ({f.fieldCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs">Constant Value</Label>
                    <Input
                      placeholder="e.g. 100 or approved"
                      value={ruleForm.constantValue}
                      onChange={(e) => setRuleForm({ ...ruleForm, constantValue: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Operators <span className="font-mono">is_empty</span> / <span className="font-mono">is_not_empty</span> ignore the right side.
                </p>
              </div>
            )}

            {/* Action builder */}
            <div className="space-y-3 rounded-md border p-3 bg-muted/20">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Action Type</Label>
                  <Select
                    value={ruleForm.actionType}
                    onValueChange={(v) => setRuleForm({ ...ruleForm, actionType: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_RULE_ACTION_TYPES.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Trigger</Label>
                  <Select
                    value={ruleForm.trigger}
                    onValueChange={(v) => setRuleForm({ ...ruleForm, trigger: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_RULE_TRIGGERS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only <span className="font-mono">SAVE</span> triggers are currently evaluated by the records API (other triggers reserved for future use).
              </p>

              {ruleForm.actionType === 'SET_VALUE' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Target Field</Label>
                      <Select
                        value={ruleForm.targetFieldCode}
                        onValueChange={(v) => setRuleForm({ ...ruleForm, targetFieldCode: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select target field" /></SelectTrigger>
                        <SelectContent>
                          {moduleFields.map((f: any) => (
                            <SelectItem key={f.id} value={f.fieldCode}>
                              {f.fieldName} ({f.fieldCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Expression</Label>
                      <Input
                        placeholder="e.g. {{price}} * (1 - {{discount}})"
                        value={ruleForm.expression}
                        onChange={(e) => setRuleForm({ ...ruleForm, expression: e.target.value })}
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Use <span className="font-mono">{'{{fieldCode}}'}</span> placeholders for field values. Supports basic arithmetic (+, -, *, /, %, parentheses).
                  </p>
                </div>
              )}

              {(ruleForm.actionType === 'BLOCK' || ruleForm.actionType === 'WARN' || ruleForm.actionType === 'SEND_EMAIL') && (
                <div className="space-y-2">
                  <Label className="text-xs">Error / Message</Label>
                  <Input
                    placeholder="Message shown when the rule fires"
                    value={ruleForm.errorMessage}
                    onChange={(e) => setRuleForm({ ...ruleForm, errorMessage: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-[11px] text-muted-foreground">Inactive rules are skipped at save time.</p>
              </div>
              <Switch
                checked={ruleForm.isActive}
                onCheckedChange={(c) => setRuleForm({ ...ruleForm, isActive: c })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={handleSaveBusinessRule}
              disabled={saving || !ruleForm.name}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Saving...' : editRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
