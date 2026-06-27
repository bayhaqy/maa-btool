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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import {
  ArrowLeft, Plus, MoreVertical, Pencil, Trash2, Shield, GripVertical, Settings, GitBranch,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, Eye, ImageIcon,
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift, Save, ToggleLeft, X,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// Data Types & Constants
// ============================================================
const DATA_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTISELECT', 'EMAIL', 'URL', 'LOOKUP', 'IMAGE'];

const DATA_TYPE_COLORS: Record<string, string> = {
  TEXT: 'bg-blue-50 text-blue-700 border-blue-200',
  NUMBER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DATE: 'bg-purple-50 text-purple-700 border-purple-200',
  BOOLEAN: 'bg-gray-50 text-gray-700 border-gray-200',
  SELECT: 'bg-orange-50 text-orange-700 border-orange-200',
  MULTISELECT: 'bg-amber-50 text-amber-700 border-amber-200',
  EMAIL: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  URL: 'bg-teal-50 text-teal-700 border-teal-200',
  LOOKUP: 'bg-violet-50 text-violet-700 border-violet-200',
  IMAGE: 'bg-pink-50 text-pink-700 border-pink-200',
};

const moduleIconsMap: Record<string, React.ElementType> = {
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift,
};

// ============================================================
// Per-field Validation Rule Types (STIBO-aligned)
// ============================================================
const VALIDATION_TYPES = [
  'REQUIRED', 'MIN_LENGTH', 'MAX_LENGTH', 'PATTERN', 'MIN_VALUE', 'MAX_VALUE',
  'EMAIL_FORMAT', 'URL_FORMAT', 'CUSTOM',
];
const NO_VALUE_RULE_TYPES = new Set(['REQUIRED', 'EMAIL_FORMAT', 'URL_FORMAT']);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  const [fieldForm, setFieldForm] = useState({
    fieldCode: '', fieldName: '', dataType: 'TEXT',
    isRequired: false, isUnique: false, defaultValue: '',
    placeholder: '', description: '', sortOrder: 0, lookupMasterId: '',
    cascadesFromFieldCode: '', isMultiple: false,
  });

  const [validationForm, setValidationForm] = useState({
    ruleType: 'REQUIRED', ruleValue: '', errorMessage: '',
  });
  const [editValidation, setEditValidation] = useState<any>(null);

  // Module settings form (inline collapsible)
  const [moduleForm, setModuleForm] = useState({
    moduleName: '', description: '', requireApproval: false,
    moduleIcon: 'Database', sortOrder: 0, isActive: true,
  });

  // ============================================================
  // Business Rules state
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

  // Validation preview state
  const [previewValue, setPreviewValue] = useState('');
  const [previewResult, setPreviewResult] = useState<{ valid: boolean; errors: string[] } | null>(null);

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
        // Sync module form when module loads
        setModuleForm({
          moduleName: data.module.moduleName || '',
          description: data.module.description || '',
          requireApproval: !!data.module.requireApproval,
          moduleIcon: data.module.moduleIcon || 'Database',
          sortOrder: data.module.sortOrder ?? 0,
          isActive: data.module.isActive ?? true,
        });
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
      // silent
    }
  }, [token, selectedModuleId]);

  useEffect(() => {
    loadModule();
    loadLookups();
    loadBusinessRules();
  }, [loadModule, loadLookups, loadBusinessRules]);

  // ============================================================
  // Field CRUD handlers
  // ============================================================
  const handleSaveField = async () => {
    if (!token || !selectedModuleId) return;
    setSaving(true);
    try {
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
        isMultiple: fieldForm.isMultiple,
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

  // ============================================================
  // Field reordering handlers
  // ============================================================
  const handleMoveField = async (fieldId: string, direction: 'up' | 'down') => {
    if (!token || !metaModule?.fields) return;
    const fields = [...metaModule.fields];
    const idx = fields.findIndex((f: any) => f.id === fieldId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === fields.length - 1) return;

    // Swap sort orders
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const currentSort = fields[idx].sortOrder;
    const swapSort = fields[swapIdx].sortOrder;

    try {
      await fetch('/api/fields?action=reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orders: [
            { id: fieldId, sortOrder: swapSort },
            { id: fields[swapIdx].id, sortOrder: currentSort },
          ],
        }),
      });
      loadModule();
    } catch {
      toast.error('Failed to reorder');
    }
  };

  // ============================================================
  // Validation handlers
  // ============================================================
  const handleSaveValidation = async () => {
    if (!token) return;
    setSaving(true);
    try {
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
      setPreviewResult(null);
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
  // Validation preview
  // ============================================================
  const runValidationPreview = () => {
    const errors: string[] = [];
    const val = previewValue;
    const field = metaModule?.fields?.find((f: any) => f.id === selectedFieldId);
    if (!field) return;

    // Get all validations for this field
    const validations = field.validations || [];
    // Also include the current form if adding a new one
    if (!editValidation) {
      validations.push({ ruleType: validationForm.ruleType, ruleValue: validationForm.ruleValue, errorMessage: validationForm.errorMessage });
    }

    for (const v of validations) {
      const msg = v.errorMessage || `${v.ruleType} validation failed`;
      switch (v.ruleType) {
        case 'REQUIRED':
          if (!val.trim()) errors.push(msg);
          break;
        case 'MIN_LENGTH': {
          const min = parseInt(v.ruleValue);
          if (!isNaN(min) && val.length < min) errors.push(`${msg} (min ${min})`);
          break;
        }
        case 'MAX_LENGTH': {
          const max = parseInt(v.ruleValue);
          if (!isNaN(max) && val.length > max) errors.push(`${msg} (max ${max})`);
          break;
        }
        case 'PATTERN': {
          try {
            if (!new RegExp(v.ruleValue).test(val)) errors.push(msg);
          } catch { errors.push('Invalid regex pattern'); }
          break;
        }
        case 'MIN_VALUE': {
          const num = parseFloat(val);
          const min = parseFloat(v.ruleValue);
          if (!isNaN(num) && !isNaN(min) && num < min) errors.push(`${msg} (min ${min})`);
          break;
        }
        case 'MAX_VALUE': {
          const num = parseFloat(val);
          const max = parseFloat(v.ruleValue);
          if (!isNaN(num) && !isNaN(max) && num > max) errors.push(`${msg} (max ${max})`);
          break;
        }
        case 'EMAIL_FORMAT':
          if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) errors.push(msg);
          break;
        case 'URL_FORMAT':
          if (val && !/^https?:\/\/.+/.test(val)) errors.push(msg);
          break;
        case 'CUSTOM':
          // Custom rules can't be previewed automatically
          break;
      }
    }

    setPreviewResult({ valid: errors.length === 0, errors });
  };

  // ============================================================
  // Module settings save
  // ============================================================
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
          moduleIcon: moduleForm.moduleIcon,
          sortOrder: moduleForm.sortOrder,
          isActive: moduleForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Module settings updated');
      setSettingsOpen(false);
      loadModule();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Business Rule handlers
  // ============================================================
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
    if (!ruleForm.name.trim()) { toast.error('Rule name is required'); return; }
    if (!ruleForm.leftFieldCode) { toast.error('Left field is required'); return; }
    if (ruleForm.rightMode === 'field' && !ruleForm.rightFieldCode) { toast.error('Right field is required (or switch to Constant Value)'); return; }
    if (ruleForm.actionType === 'SET_VALUE' && (!ruleForm.targetFieldCode || !ruleForm.expression)) { toast.error('SET_VALUE requires a target field and expression'); return; }
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
    } catch { /* leave defaults */ }
    let targetFieldCode = '';
    let expression = '';
    if (r.actionType === 'SET_VALUE' && r.actionJson) {
      try {
        const a = JSON.parse(r.actionJson) as { targetFieldCode?: string; expression?: string };
        targetFieldCode = a.targetFieldCode || '';
        expression = a.expression || '';
      } catch { /* leave defaults */ }
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

  const openEditField = (f: any) => {
    setEditField(f);
    setFieldForm({
      fieldCode: f.fieldCode, fieldName: f.fieldName, dataType: f.dataType,
      isRequired: f.isRequired, isUnique: f.isUnique, defaultValue: f.defaultValue || '',
      placeholder: f.placeholder || '', description: f.description || '',
      sortOrder: f.sortOrder, lookupMasterId: f.lookupId || f.lookupMaster?.id || '',
      cascadesFromFieldCode: f.cascadesFromFieldCode || '',
      isMultiple: f.isMultiple || false,
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
      isMultiple: false,
    });
    setFieldDialogOpen(true);
  };

  // ============================================================
  // Render: Field Preview Panel
  // ============================================================
  const renderFieldPreview = () => {
    if (!metaModule?.fields || metaModule.fields.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Add fields to see a preview</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {metaModule.fields.map((f: any) => {
          const inputId = `preview-${f.fieldCode}`;
          return (
            <div key={f.id} className="space-y-1">
              <Label htmlFor={inputId} className="text-xs flex items-center gap-1.5">
                {f.fieldName}
                {f.isRequired && <span className="text-red-500">*</span>}
                <Badge variant="outline" className={cn('text-[9px] px-1 py-0', DATA_TYPE_COLORS[f.dataType] || '')}>
                  {f.dataType}
                </Badge>
                {f.dataType === 'IMAGE' && f.isMultiple && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-pink-50 text-pink-600 border-pink-200">multi</Badge>
                )}
              </Label>
              {f.dataType === 'TEXT' || f.dataType === 'EMAIL' || f.dataType === 'URL' ? (
                <Input id={inputId} placeholder={f.placeholder || `Enter ${f.fieldName}`} disabled className="h-8 text-xs" />
              ) : f.dataType === 'NUMBER' ? (
                <Input id={inputId} type="number" placeholder={f.placeholder || `Enter ${f.fieldName}`} disabled className="h-8 text-xs" />
              ) : f.dataType === 'DATE' ? (
                <Input id={inputId} type="date" disabled className="h-8 text-xs" />
              ) : f.dataType === 'BOOLEAN' ? (
                <div className="flex items-center gap-2 h-8">
                  <Switch disabled />
                  <span className="text-xs text-muted-foreground">Yes / No</span>
                </div>
              ) : f.dataType === 'SELECT' ? (
                <Select disabled>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Select ${f.fieldName}`} /></SelectTrigger>
                </Select>
              ) : f.dataType === 'MULTISELECT' ? (
                <Input disabled placeholder={`Multi-select: ${f.fieldName}`} className="h-8 text-xs" />
              ) : f.dataType === 'LOOKUP' ? (
                <Select disabled>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Lookup ${f.fieldName}`} /></SelectTrigger>
                </Select>
              ) : f.dataType === 'IMAGE' ? (
                <div className="border border-dashed rounded-md p-3 text-center">
                  <ImageIcon className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-[10px] text-muted-foreground">
                    {f.isMultiple ? 'Drop images or click to upload' : 'Drop image or click to upload'}
                  </p>
                </div>
              ) : (
                <Input id={inputId} placeholder={f.placeholder || `Enter ${f.fieldName}`} disabled className="h-8 text-xs" />
              )}
              {f.validations?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {f.validations.map((v: any) => (
                    <Badge key={v.id} variant="secondary" className="text-[9px] px-1.5 py-0">
                      {v.ruleType}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
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

  const ModuleIcon = moduleIconsMap[metaModule.moduleIcon] || Database;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('modules')} className="h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="p-2 rounded-xl bg-red-50">
          <ModuleIcon className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">{metaModule.moduleName}</h2>
          <p className="text-sm text-muted-foreground font-mono">{metaModule.moduleCode}</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Badge className={cn(
            metaModule.isActive !== false
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-300'
          )}>
            {metaModule.isActive !== false ? 'Active' : 'Inactive'}
          </Badge>
          <Badge className={cn(
            metaModule.requireApproval
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-green-50 text-green-700 border-green-200'
          )}>
            {metaModule.requireApproval ? 'Approval Required' : 'Auto-approve'}
          </Badge>
          {isSuperAdminUser && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings className="w-3.5 h-3.5 mr-1" />
              Settings
              {settingsOpen ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
            </Button>
          )}
        </div>
      </div>

      {/* Module Settings Panel (Collapsible) */}
      {isSuperAdminUser && (
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleContent>
            <Card className="shadow-sm border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Module Settings
                </CardTitle>
                <CardDescription>Configure module metadata, approval, and display options</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Module Name</Label>
                    <Input
                      value={moduleForm.moduleName}
                      onChange={(e) => setModuleForm({ ...moduleForm, moduleName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Module Icon</Label>
                    <Select value={moduleForm.moduleIcon} onValueChange={(v) => setModuleForm({ ...moduleForm, moduleIcon: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(moduleIconsMap).map(([name, IconComp]) => (
                          <SelectItem key={name} value={name}>
                            <div className="flex items-center gap-2">
                              <IconComp className="w-4 h-4" />
                              <span>{name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sort Order</Label>
                    <Input
                      type="number"
                      value={moduleForm.sortOrder}
                      onChange={(e) => setModuleForm({ ...moduleForm, sortOrder: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      value={moduleForm.description}
                      onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-sm">Require Approval</Label>
                        <p className="text-[10px] text-muted-foreground">Edits require approval before publish</p>
                      </div>
                      <Switch
                        checked={moduleForm.requireApproval}
                        onCheckedChange={(c) => setModuleForm({ ...moduleForm, requireApproval: c })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-sm">Active</Label>
                        <p className="text-[10px] text-muted-foreground">Enable/disable this module</p>
                      </div>
                      <Switch
                        checked={moduleForm.isActive}
                        onCheckedChange={(c) => setModuleForm({ ...moduleForm, isActive: c })}
                      />
                    </div>
                    <Button
                      onClick={handleSaveModule}
                      disabled={saving || !moduleForm.moduleName}
                      className="w-full bg-red-600 hover:bg-red-700 text-white h-9"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Main Layout: Fields + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Fields Table (2/3 width) */}
        <div className="lg:col-span-2 space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Fields</CardTitle>
                <CardDescription>{metaModule.fields?.length || 0} fields defined</CardDescription>
              </div>
              {isSuperAdminUser && (
                <Button className="bg-red-600 hover:bg-red-700 text-white h-9" onClick={openCreateField}>
                  <Plus className="w-4 h-4 mr-1" /> Add Field
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {metaModule.fields?.length === 0 ? (
                <div className="py-12 text-center">
                  <Database className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="text-muted-foreground">No fields defined yet. Add fields to build your schema.</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-10">Order</TableHead>
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
                      {metaModule.fields?.map((f: any, idx: number) => (
                        <TableRow key={f.id} className="group">
                          <TableCell className="text-muted-foreground">
                            <GripVertical className="w-4 h-4 opacity-40" />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                disabled={idx === 0 || !isSuperAdminUser}
                                onClick={() => handleMoveField(f.id, 'up')}
                              >
                                <ArrowUp className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                disabled={idx === (metaModule.fields?.length || 0) - 1 || !isSuperAdminUser}
                                onClick={() => handleMoveField(f.id, 'down')}
                              >
                                <ArrowDown className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{f.fieldCode}</TableCell>
                          <TableCell className="font-medium text-sm">{f.fieldName}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className={cn('text-xs', DATA_TYPE_COLORS[f.dataType] || '')}>
                                {f.dataType}
                              </Badge>
                              {f.dataType === 'IMAGE' && f.isMultiple && (
                                <Badge variant="outline" className="text-[9px] bg-pink-50 text-pink-600 border-pink-200 px-1 py-0">
                                  multi
                                </Badge>
                              )}
                            </div>
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
                                  className="text-[10px] group/val cursor-pointer hover:bg-secondary/80"
                                  onClick={() => {
                                    setSelectedFieldId(f.id);
                                    setEditValidation(v);
                                    setValidationForm({
                                      ruleType: v.ruleType,
                                      ruleValue: v.ruleValue === '__NONE__' ? '' : v.ruleValue || '',
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
                                <Badge className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">
                                  Lookup: {f.lookupMaster.lookupName}
                                </Badge>
                              )}
                              {isSuperAdminUser && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => {
                                    setSelectedFieldId(f.id);
                                    setEditValidation(null);
                                    setValidationForm({ ruleType: 'REQUIRED', ruleValue: '', errorMessage: '' });
                                    setPreviewResult(null);
                                    setValidationDialogOpen(true);
                                  }}
                                >
                                  <Shield className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              )}
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
                                {isSuperAdminUser && (
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteField(f.id)}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                )}
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

          {/* Business Rules Card */}
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
                    No business rules yet. Add cross-field rules (BLOCK / SET_VALUE / WARN) to enforce STIBO-style logic.
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
        </div>

        {/* Field Preview Panel (1/3 width) */}
        <div className="space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  Form Preview
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setPreviewOpen(!previewOpen)}
                >
                  {previewOpen ? 'Hide' : 'Show'}
                </Button>
              </div>
              <CardDescription>Preview how this module&apos;s data entry form will look</CardDescription>
            </CardHeader>
            {previewOpen && (
              <CardContent className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {renderFieldPreview()}
              </CardContent>
            )}
          </Card>

          {/* Module Summary Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Module Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fields</span>
                <span className="font-medium">{metaModule.fields?.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Required Fields</span>
                <span className="font-medium">{metaModule.fields?.filter((f: any) => f.isRequired).length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unique Fields</span>
                <span className="font-medium">{metaModule.fields?.filter((f: any) => f.isUnique).length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Validations</span>
                <span className="font-medium">{metaModule.fields?.reduce((sum: number, f: any) => sum + (f.validations?.length || 0), 0) || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Business Rules</span>
                <span className="font-medium">{businessRules.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sort Order</span>
                <span className="font-medium">{metaModule.sortOrder ?? 0}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Data Types Used</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {[...new Set(metaModule.fields?.map((f: any) => f.dataType) || [])].map((dt: unknown) => (
                  <Badge key={dt} variant="outline" className={cn('text-[10px]', DATA_TYPE_COLORS[dt] || '')}>
                    {dt}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ============================================================
          Dialogs
          ============================================================ */}

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
                <Select value={fieldForm.dataType} onValueChange={(v) => setFieldForm({ ...fieldForm, dataType: v, isMultiple: false })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn('text-[9px] px-1 py-0', DATA_TYPE_COLORS[t] || '')}>
                            {t}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
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

            {/* IMAGE type: single/multi toggle */}
            {fieldForm.dataType === 'IMAGE' && (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-pink-50/50">
                <div>
                  <Label className="text-sm">Multiple Images</Label>
                  <p className="text-[11px] text-muted-foreground">Allow multiple images per field value</p>
                </div>
                <Switch
                  checked={fieldForm.isMultiple}
                  onCheckedChange={(c) => setFieldForm({ ...fieldForm, isMultiple: c })}
                />
              </div>
            )}

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
                  Select the parent field. This lookup will be filtered by the parent field value
                  (using <span className="font-mono">parentValueCode</span>).
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div><Label className="text-sm">Required</Label></div>
                <Switch checked={fieldForm.isRequired} onCheckedChange={(c) => setFieldForm({ ...fieldForm, isRequired: c })} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div><Label className="text-sm">Unique</Label></div>
                <Switch checked={fieldForm.isUnique} onCheckedChange={(c) => setFieldForm({ ...fieldForm, isUnique: c })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Default Value</Label>
              <Input placeholder="Default value" value={fieldForm.defaultValue} onChange={(e) => setFieldForm({ ...fieldForm, defaultValue: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input placeholder="Input placeholder text" value={fieldForm.placeholder} onChange={(e) => setFieldForm({ ...fieldForm, placeholder: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Field description" value={fieldForm.description} onChange={(e) => setFieldForm({ ...fieldForm, description: e.target.value })} rows={2} />
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editValidation ? 'Edit Validation Rule' : 'Add Validation Rule'}</DialogTitle>
            <DialogDescription>Define a validation rule for this field</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={validationForm.ruleType} onValueChange={(v) => {
                setValidationForm({ ...validationForm, ruleType: v, ruleValue: '' });
                setPreviewResult(null);
              }}>
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
            ) : (
              <div className="space-y-2">
                <Label>
                  Rule Value
                  {validationForm.ruleType === 'PATTERN' && <span className="text-[11px] text-muted-foreground ml-1">(regex)</span>}
                  {validationForm.ruleType === 'CUSTOM' && <span className="text-[11px] text-muted-foreground ml-1">(expression)</span>}
                </Label>
                <Input
                  placeholder={
                    validationForm.ruleType === 'PATTERN' ? 'e.g. ^[A-Z0-9-]+$'
                    : validationForm.ruleType === 'MIN_LENGTH' || validationForm.ruleType === 'MAX_LENGTH' ? 'e.g. 3'
                    : validationForm.ruleType === 'MIN_VALUE' || validationForm.ruleType === 'MAX_VALUE' ? 'e.g. 100'
                    : validationForm.ruleType === 'CUSTOM' ? 'e.g. custom validation expression'
                    : 'value'
                  }
                  value={validationForm.ruleValue}
                  onChange={(e) => {
                    setValidationForm({ ...validationForm, ruleValue: e.target.value });
                    setPreviewResult(null);
                  }}
                  className="font-mono"
                />
                {validationForm.ruleType === 'PATTERN' && (
                  <p className="text-[11px] text-muted-foreground">Enter a regular expression pattern.</p>
                )}
                {validationForm.ruleType === 'CUSTOM' && (
                  <p className="text-[11px] text-muted-foreground">Custom validation — evaluated server-side or via business rules.</p>
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

            {/* Validation Preview */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Test Validation
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter a sample value to test"
                  value={previewValue}
                  onChange={(e) => {
                    setPreviewValue(e.target.value);
                    setPreviewResult(null);
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runValidationPreview}
                  className="shrink-0"
                >
                  Test
                </Button>
              </div>
              {previewResult && (
                <div className={cn(
                  'rounded-md border p-2.5 text-xs',
                  previewResult.valid
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                )}>
                  {previewResult.valid ? (
                    <span className="font-medium">✓ Value passes all validations</span>
                  ) : (
                    <div>
                      <span className="font-medium">✗ Validation failed:</span>
                      <ul className="mt-1 ml-3 list-disc">
                        {previewResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidationDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveValidation}
              disabled={saving || (!noValueNeeded && !validationForm.ruleValue)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Saving...' : editValidation ? 'Update Rule' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Business Rule Dialog */}
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
                <Input placeholder="e.g. List price must be > cost price" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Condition Type</Label>
                <Select value={ruleForm.conditionType} onValueChange={(v) => setRuleForm({ ...ruleForm, conditionType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_RULE_CONDITION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="What this rule enforces (optional)" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} rows={2} />
            </div>
            {/* Condition builder */}
            {(ruleForm.conditionType === 'CROSS_FIELD' || ruleForm.conditionType === 'REQUIRED_IF') && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Condition</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Left Field</Label>
                    <Select value={ruleForm.leftFieldCode} onValueChange={(v) => setRuleForm({ ...ruleForm, leftFieldCode: v })}>
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {moduleFields.map((f: any) => <SelectItem key={f.id} value={f.fieldCode}>{f.fieldName} ({f.fieldCode})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Operator</Label>
                    <Select value={ruleForm.operator} onValueChange={(v) => setRuleForm({ ...ruleForm, operator: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BUSINESS_RULE_OPERATORS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Right Side</Label>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant={ruleForm.rightMode === 'field' ? 'default' : 'outline'} onClick={() => setRuleForm({ ...ruleForm, rightMode: 'field' })}>Field</Button>
                      <Button type="button" size="sm" variant={ruleForm.rightMode === 'constant' ? 'default' : 'outline'} onClick={() => setRuleForm({ ...ruleForm, rightMode: 'constant' })}>Constant</Button>
                    </div>
                  </div>
                </div>
                {ruleForm.rightMode === 'field' ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Right Field</Label>
                    <Select value={ruleForm.rightFieldCode} onValueChange={(v) => setRuleForm({ ...ruleForm, rightFieldCode: v })}>
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {moduleFields.map((f: any) => <SelectItem key={f.id} value={f.fieldCode}>{f.fieldName} ({f.fieldCode})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs">Constant Value</Label>
                    <Input placeholder="e.g. 100 or approved" value={ruleForm.constantValue} onChange={(e) => setRuleForm({ ...ruleForm, constantValue: e.target.value })} className="font-mono" />
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
                  <Select value={ruleForm.actionType} onValueChange={(v) => setRuleForm({ ...ruleForm, actionType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_RULE_ACTION_TYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Trigger</Label>
                  <Select value={ruleForm.trigger} onValueChange={(v) => setRuleForm({ ...ruleForm, trigger: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_RULE_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only <span className="font-mono">SAVE</span> triggers are currently evaluated by the records API.
              </p>
              {ruleForm.actionType === 'SET_VALUE' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Target Field</Label>
                      <Select value={ruleForm.targetFieldCode} onValueChange={(v) => setRuleForm({ ...ruleForm, targetFieldCode: v })}>
                        <SelectTrigger><SelectValue placeholder="Select target field" /></SelectTrigger>
                        <SelectContent>
                          {moduleFields.map((f: any) => <SelectItem key={f.id} value={f.fieldCode}>{f.fieldName} ({f.fieldCode})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Expression</Label>
                      <Input placeholder="e.g. {{price}} * (1 - {{discount}})" value={ruleForm.expression} onChange={(e) => setRuleForm({ ...ruleForm, expression: e.target.value })} className="font-mono" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Use <span className="font-mono">{'{{fieldCode}}'}</span> placeholders for field values.
                  </p>
                </div>
              )}
              {(ruleForm.actionType === 'BLOCK' || ruleForm.actionType === 'WARN' || ruleForm.actionType === 'SEND_EMAIL') && (
                <div className="space-y-2">
                  <Label className="text-xs">Error / Message</Label>
                  <Input placeholder="Message shown when the rule fires" value={ruleForm.errorMessage} onChange={(e) => setRuleForm({ ...ruleForm, errorMessage: e.target.value })} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-[11px] text-muted-foreground">Inactive rules are skipped at save time.</p>
              </div>
              <Switch checked={ruleForm.isActive} onCheckedChange={(c) => setRuleForm({ ...ruleForm, isActive: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveBusinessRule} disabled={saving || !ruleForm.name} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
