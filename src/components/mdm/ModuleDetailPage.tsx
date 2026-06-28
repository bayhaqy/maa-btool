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
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowLeft, Plus, MoreVertical, Pencil, Trash2, Shield, GripVertical, Settings, GitBranch,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, Eye, ImageIcon,
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift, Save, ToggleLeft, X,
  Type, Hash, Calendar, ToggleLeft as BoolIcon, List, ListChecks, AtSign, Link, Image,
  FileText, File, Palette, Box, FolderTree, Ruler, GitMerge, Search,
  Layers, MapPin, MonitorSmartphone, FolderOpen, PlusCircle, MinusCircle,
  Video, Mail, Phone, Clock, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// Stibo Data Types with icons and categories
// ============================================================
const DATA_TYPE_CATEGORIES = [
  {
    label: 'Text',
    types: [
      { value: 'TEXT', label: 'TEXT', icon: Type, desc: 'Short text' },
      { value: 'LONG_TEXT', label: 'LONG_TEXT', icon: FileText, desc: 'Multi-line text' },
      { value: 'RICH_TEXT', label: 'RICH_TEXT', icon: FileText, desc: 'Rich text editor' },
    ],
  },
  {
    label: 'Numeric',
    types: [
      { value: 'NUMBER', label: 'NUMBER', icon: Hash, desc: 'General number' },
      { value: 'INTEGER', label: 'INTEGER', icon: Hash, desc: 'Whole number' },
      { value: 'DECIMAL', label: 'DECIMAL', icon: Hash, desc: 'Decimal number' },
      { value: 'CURRENCY', label: 'CURRENCY', icon: DollarSign, desc: 'Currency value' },
    ],
  },
  {
    label: 'Date & Time',
    types: [
      { value: 'DATE', label: 'DATE', icon: Calendar, desc: 'Date only' },
      { value: 'DATETIME', label: 'DATETIME', icon: Clock, desc: 'Date + time' },
    ],
  },
  {
    label: 'Boolean',
    types: [
      { value: 'BOOLEAN', label: 'BOOLEAN', icon: BoolIcon, desc: 'True/False' },
    ],
  },
  {
    label: 'Selection',
    types: [
      { value: 'SELECT', label: 'SELECT', icon: List, desc: 'Single select' },
      { value: 'MULTISELECT', label: 'MULTISELECT', icon: ListChecks, desc: 'Multiple select' },
      { value: 'LOV', label: 'LOV', icon: List, desc: 'List of Values (Stibo)' },
    ],
  },
  {
    label: 'Reference',
    types: [
      { value: 'LOOKUP', label: 'LOOKUP', icon: Search, desc: 'Cross-module reference' },
    ],
  },
  {
    label: 'Media',
    types: [
      { value: 'IMAGE', label: 'IMAGE', icon: Image, desc: 'Image file' },
      { value: 'VIDEO', label: 'VIDEO', icon: Video, desc: 'Video file' },
      { value: 'DOCUMENT', label: 'DOCUMENT', icon: FileText, desc: 'Document file' },
      { value: 'FILE', label: 'FILE', icon: File, desc: 'Generic file' },
    ],
  },
  {
    label: 'Contact & Web',
    types: [
      { value: 'URL', label: 'URL', icon: Link, desc: 'Web URL' },
      { value: 'EMAIL', label: 'EMAIL', icon: Mail, desc: 'Email address' },
      { value: 'PHONE', label: 'PHONE', icon: Phone, desc: 'Phone number' },
      { value: 'COLOR', label: 'COLOR', icon: Palette, desc: 'Color picker' },
    ],
  },
  {
    label: 'Complex',
    types: [
      { value: 'COMPOUND', label: 'COMPOUND', icon: Box, desc: 'Grouped attributes' },
      { value: 'CONTAINER', label: 'CONTAINER', icon: FolderTree, desc: 'Nested object' },
    ],
  },
];

const ALL_DATA_TYPES = DATA_TYPE_CATEGORIES.flatMap(c => c.types);

const DATA_TYPE_COLORS: Record<string, string> = {
  TEXT: 'bg-blue-50 text-blue-700 border-blue-200',
  LONG_TEXT: 'bg-blue-50 text-blue-600 border-blue-200',
  RICH_TEXT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  NUMBER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INTEGER: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  DECIMAL: 'bg-teal-50 text-teal-700 border-teal-200',
  CURRENCY: 'bg-amber-50 text-amber-700 border-amber-200',
  DATE: 'bg-purple-50 text-purple-700 border-purple-200',
  DATETIME: 'bg-purple-50 text-purple-600 border-purple-200',
  BOOLEAN: 'bg-gray-50 text-gray-700 border-gray-200',
  SELECT: 'bg-orange-50 text-orange-700 border-orange-200',
  MULTISELECT: 'bg-amber-50 text-amber-700 border-amber-200',
  LOV: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  LOOKUP: 'bg-violet-50 text-violet-700 border-violet-200',
  IMAGE: 'bg-pink-50 text-pink-700 border-pink-200',
  VIDEO: 'bg-rose-50 text-rose-700 border-rose-200',
  DOCUMENT: 'bg-slate-50 text-slate-700 border-slate-200',
  FILE: 'bg-stone-50 text-stone-700 border-stone-200',
  URL: 'bg-teal-50 text-teal-700 border-teal-200',
  EMAIL: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  PHONE: 'bg-sky-50 text-sky-700 border-sky-200',
  COLOR: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  COMPOUND: 'bg-lime-50 text-lime-700 border-lime-200',
  CONTAINER: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const DATA_TYPE_ICONS: Record<string, React.ElementType> = {};
ALL_DATA_TYPES.forEach(t => { DATA_TYPE_ICONS[t.value] = t.icon; });

const ENTITY_TYPES = [
  { value: 'PRODUCT', label: 'Product', color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'CUSTOMER', label: 'Customer', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'SUPPLIER', label: 'Supplier', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'LOCATION', label: 'Location', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'ASSET', label: 'Asset', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { value: 'DIGITAL_ASSET', label: 'Digital Asset', color: 'bg-pink-50 text-pink-700 border-pink-200' },
] as const;

const moduleIconsMap: Record<string, React.ElementType> = {
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift, MapPin, MonitorSmartphone, Layers,
};

// ============================================================
// Stibo Validation Rule Types
// ============================================================
const VALIDATION_TYPES = [
  'REQUIRED', 'UNIQUE', 'MIN_LENGTH', 'MAX_LENGTH', 'PATTERN',
  'MIN_VALUE', 'MAX_VALUE', 'EMAIL_FORMAT', 'URL_FORMAT',
  'LOV_VALIDATION', 'CROSS_FIELD', 'CONDITIONAL_REQUIRED', 'CUSTOM',
];
const NO_VALUE_RULE_TYPES = new Set(['REQUIRED', 'UNIQUE', 'EMAIL_FORMAT', 'URL_FORMAT']);

// ============================================================
// Business Rule options
// ============================================================
const BUSINESS_RULE_CONDITION_TYPES = ['CROSS_FIELD', 'REQUIRED_IF', 'LOV_CROSS', 'SCRIPTED'];
const BUSINESS_RULE_OPERATORS = [
  '=', '!=', '>', '<', '>=', '<=',
  'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
];
const BUSINESS_RULE_ACTION_TYPES = ['BLOCK', 'WARN', 'SET_VALUE', 'SEND_EMAIL'];
const BUSINESS_RULE_TRIGGERS = ['SAVE', 'APPROVE', 'IMPORT'];

// Unit of measure options
const UNIT_OF_MEASURE_OPTIONS = [
  'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd',
  'mg', 'g', 'kg', 'lb', 'oz',
  'ml', 'l', 'gal', 'fl_oz',
  'pcs', 'pack', 'case', 'pallet',
  'EUR', 'USD', 'GBP', 'JPY', 'CNY',
];

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

  // Attribute Group dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<any>(null);
  const [groupForm, setGroupForm] = useState({ groupCode: '', groupName: '', description: '', sortOrder: 0, isCollapsed: true });

  const [fieldForm, setFieldForm] = useState({
    fieldCode: '', fieldName: '', dataType: 'TEXT',
    isRequired: false, isUnique: false, defaultValue: '',
    placeholder: '', description: '', sortOrder: 0, lookupMasterId: '',
    cascadesFromFieldCode: '', isMultiple: false,
    groupId: '', isInherited: false, categoryScope: '',
    unitOfMeasure: '', minValue: '', maxValue: '', maxLength: '', regexPattern: '',
  });

  const [validationForm, setValidationForm] = useState({
    ruleType: 'REQUIRED', ruleValue: '', errorMessage: '',
  });
  const [editValidation, setEditValidation] = useState<any>(null);

  const [moduleForm, setModuleForm] = useState({
    moduleName: '', description: '', requireApproval: false, entityType: 'PRODUCT',
    moduleIcon: 'Database', sortOrder: 0, isActive: true,
  });

  // Business Rules state
  const [businessRules, setBusinessRules] = useState<any[]>([]);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '', description: '', conditionType: 'CROSS_FIELD',
    leftFieldCode: '', operator: '=', rightMode: 'field' as 'field' | 'constant',
    rightFieldCode: '', constantValue: '', actionType: 'BLOCK',
    targetFieldCode: '', expression: '', errorMessage: '', trigger: 'SAVE', isActive: true,
  });

  const [previewValue, setPreviewValue] = useState('');
  const [previewResult, setPreviewResult] = useState<{ valid: boolean; errors: string[] } | null>(null);

  // Track which accordion sections are open for attribute groups
  const [openGroups, setOpenGroups] = useState<string[]>([]);

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
        setModuleForm({
          moduleName: data.module.moduleName || '',
          description: data.module.description || '',
          requireApproval: !!data.module.requireApproval,
          entityType: data.module.entityType || 'PRODUCT',
          moduleIcon: data.module.moduleIcon || 'Database',
          sortOrder: data.module.sortOrder ?? 0,
          isActive: data.module.isActive ?? true,
        });
        // Open all groups by default
        const groupIds = (data.module.attributeGroups || []).map((g: any) => g.id);
        setOpenGroups(groupIds);
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
    } catch { /* silent */ }
  }, [token]);

  const loadBusinessRules = useCallback(async () => {
    if (!token || !selectedModuleId) return;
    try {
      const res = await fetch(`/api/business-rules?moduleId=${selectedModuleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setBusinessRules(data.rules || []);
    } catch { /* silent */ }
  }, [token, selectedModuleId]);

  useEffect(() => {
    loadModule();
    loadLookups();
    loadBusinessRules();
  }, [loadModule, loadLookups, loadBusinessRules]);

  // ============================================================
  // Attribute Group CRUD
  // ============================================================
  const handleSaveGroup = async () => {
    if (!token || !selectedModuleId) return;
    setSaving(true);
    try {
      if (editGroup) {
        const res = await fetch('/api/modules?action=attribute-group', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editGroup.id, ...groupForm }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update group'); return; }
        toast.success('Attribute Group updated');
      } else {
        const res = await fetch('/api/modules?action=attribute-group', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ moduleId: selectedModuleId, ...groupForm }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create group'); return; }
        toast.success('Attribute Group created');
      }
      setGroupDialogOpen(false);
      setEditGroup(null);
      setGroupForm({ groupCode: '', groupName: '', description: '', sortOrder: 0, isCollapsed: true });
      loadModule();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!token || !confirm('Delete this attribute group? Fields in this group will be moved to "Ungrouped".')) return;
    try {
      const res = await fetch('/api/modules?action=attribute-group', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Attribute Group deleted');
      loadModule();
    } catch {
      toast.error('Network error');
    }
  };

  const openCreateGroup = () => {
    setEditGroup(null);
    setGroupForm({
      groupCode: '', groupName: '', description: '',
      sortOrder: (metaModule?.attributeGroups?.length || 0) + 1,
      isCollapsed: false,
    });
    setGroupDialogOpen(true);
  };

  const openEditGroup = (g: any) => {
    setEditGroup(g);
    setGroupForm({
      groupCode: g.groupCode, groupName: g.groupName, description: g.description || '',
      sortOrder: g.sortOrder, isCollapsed: g.isCollapsed,
    });
    setGroupDialogOpen(true);
  };

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
        groupId: fieldForm.groupId || null,
        isInherited: fieldForm.isInherited,
        categoryScope: fieldForm.categoryScope || null,
        unitOfMeasure: fieldForm.unitOfMeasure || null,
        minValue: fieldForm.minValue ? parseFloat(fieldForm.minValue) : null,
        maxValue: fieldForm.maxValue ? parseFloat(fieldForm.maxValue) : null,
        maxLength: fieldForm.maxLength ? parseInt(fieldForm.maxLength) : null,
        regexPattern: fieldForm.regexPattern || null,
      };
      if (editField) {
        const res = await fetch('/api/fields', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editField.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
        toast.success('Attribute updated');
      } else {
        const res = await fetch('/api/fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ moduleId: selectedModuleId, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
        toast.success('Attribute created');
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
    if (!token || !confirm('Delete this attribute?')) return;
    try {
      const res = await fetch('/api/fields', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return; }
      toast.success('Attribute deleted');
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

    const validations = field.validations || [];
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
          try { if (!new RegExp(v.ruleValue).test(val)) errors.push(msg); }
          catch { errors.push('Invalid regex pattern'); }
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
          entityType: moduleForm.entityType,
          moduleIcon: moduleForm.moduleIcon,
          sortOrder: moduleForm.sortOrder,
          isActive: moduleForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Entity Type settings updated');
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
    const cond: Record<string, unknown> = { leftFieldCode: ruleForm.leftFieldCode, operator: ruleForm.operator };
    if (ruleForm.rightMode === 'field') { cond.rightFieldCode = ruleForm.rightFieldCode; }
    else { cond.constantValue = ruleForm.constantValue; }
    return JSON.stringify(cond);
  };

  const buildRuleActionJson = () => {
    if (ruleForm.actionType !== 'SET_VALUE') return null;
    return JSON.stringify({ targetFieldCode: ruleForm.targetFieldCode, expression: ruleForm.expression });
  };

  const handleSaveBusinessRule = async () => {
    if (!token || !selectedModuleId) return;
    if (!ruleForm.name.trim()) { toast.error('Rule name is required'); return; }
    if (!ruleForm.leftFieldCode) { toast.error('Left field is required'); return; }
    if (ruleForm.rightMode === 'field' && !ruleForm.rightFieldCode) { toast.error('Right field is required'); return; }
    if (ruleForm.actionType === 'SET_VALUE' && (!ruleForm.targetFieldCode || !ruleForm.expression)) { toast.error('SET_VALUE requires target and expression'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        moduleId: selectedModuleId, name: ruleForm.name,
        description: ruleForm.description || null, conditionType: ruleForm.conditionType,
        conditionJson: buildRuleConditionJson(), actionType: ruleForm.actionType,
        actionJson: buildRuleActionJson(), errorMessage: ruleForm.errorMessage || null,
        trigger: ruleForm.trigger, isActive: ruleForm.isActive,
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
    } catch { toast.error('Network error'); }
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
    } catch { toast.error('Network error'); }
  };

  const describeCondition = (rule: any): string => {
    try {
      const c = JSON.parse(rule.conditionJson) as { leftFieldCode?: string; operator?: string; rightFieldCode?: string; constantValue?: unknown };
      const right = c.rightFieldCode ? `{{${c.rightFieldCode}}}` : JSON.stringify(c.constantValue ?? '');
      return `${c.leftFieldCode || '?'} ${c.operator || '?'} ${right}`;
    } catch { return '(invalid)'; }
  };

  const describeAction = (rule: any): string => {
    if (rule.actionType === 'SET_VALUE' && rule.actionJson) {
      try {
        const a = JSON.parse(rule.actionJson) as { targetFieldCode?: string; expression?: string };
        return `SET ${a.targetFieldCode || '?'} = ${a.expression || '?'}`;
      } catch { return 'SET_VALUE (invalid)'; }
    }
    return rule.actionType;
  };

  const openCreateRule = () => {
    setEditRule(null);
    setRuleForm({
      name: '', description: '', conditionType: 'CROSS_FIELD',
      leftFieldCode: metaModule?.fields?.[0]?.fieldCode || '', operator: '=',
      rightMode: 'field', rightFieldCode: metaModule?.fields?.[1]?.fieldCode || '',
      constantValue: '', actionType: 'BLOCK', targetFieldCode: metaModule?.fields?.[0]?.fieldCode || '',
      expression: '', errorMessage: '', trigger: 'SAVE', isActive: true,
    });
    setRuleDialogOpen(true);
  };

  const openEditRule = (r: any) => {
    setEditRule(r);
    let leftFieldCode = '', operator = '=', rightMode: 'field' | 'constant' = 'field', rightFieldCode = '', constantValue = '';
    try {
      const c = JSON.parse(r.conditionJson) as { leftFieldCode?: string; operator?: string; rightFieldCode?: string; constantValue?: unknown };
      leftFieldCode = c.leftFieldCode || ''; operator = c.operator || '=';
      if (c.rightFieldCode) { rightMode = 'field'; rightFieldCode = c.rightFieldCode; }
      else { rightMode = 'constant'; constantValue = c.constantValue !== undefined ? String(c.constantValue) : ''; }
    } catch { /* defaults */ }
    let targetFieldCode = '', expression = '';
    if (r.actionType === 'SET_VALUE' && r.actionJson) {
      try { const a = JSON.parse(r.actionJson) as { targetFieldCode?: string; expression?: string }; targetFieldCode = a.targetFieldCode || ''; expression = a.expression || ''; }
      catch { /* defaults */ }
    }
    setRuleForm({
      name: r.name || '', description: r.description || '', conditionType: r.conditionType || 'CROSS_FIELD',
      leftFieldCode, operator, rightMode, rightFieldCode, constantValue,
      actionType: r.actionType || 'BLOCK', targetFieldCode, expression,
      errorMessage: r.errorMessage || '', trigger: r.trigger || 'SAVE', isActive: r.isActive ?? true,
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
      groupId: f.groupId || '', isInherited: f.isInherited || false,
      categoryScope: f.categoryScope || '',
      unitOfMeasure: f.unitOfMeasure || '',
      minValue: f.minValue != null ? String(f.minValue) : '',
      maxValue: f.maxValue != null ? String(f.maxValue) : '',
      maxLength: f.maxLength != null ? String(f.maxLength) : '',
      regexPattern: f.regexPattern || '',
    });
    setFieldDialogOpen(true);
  };

  const openCreateField = (groupId?: string) => {
    setEditField(null);
    setFieldForm({
      fieldCode: '', fieldName: '', dataType: 'TEXT',
      isRequired: false, isUnique: false, defaultValue: '',
      placeholder: '', description: '', sortOrder: (metaModule?.fields?.length || 0) + 1,
      lookupMasterId: '', cascadesFromFieldCode: '', isMultiple: false,
      groupId: groupId || '', isInherited: false, categoryScope: '',
      unitOfMeasure: '', minValue: '', maxValue: '', maxLength: '', regexPattern: '',
    });
    setFieldDialogOpen(true);
  };

  // ============================================================
  // Render: Field Row (reusable)
  // ============================================================
  const renderFieldRow = (f: any, idx: number, allFields: any[]) => (
    <TableRow key={f.id} className={cn('group', f.isInherited && 'bg-amber-50/30')}>
      <TableCell className="text-muted-foreground w-8">
        <GripVertical className="w-4 h-4 opacity-40" />
      </TableCell>
      <TableCell className="w-10">
        <div className="flex flex-col gap-0.5">
          <Button variant="ghost" size="icon" className="h-5 w-5 p-0" disabled={idx === 0 || !isSuperAdminUser} onClick={() => handleMoveField(f.id, 'up')}>
            <ArrowUp className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5 p-0" disabled={idx === allFields.length - 1 || !isSuperAdminUser} onClick={() => handleMoveField(f.id, 'down')}>
            <ArrowDown className="w-3 h-3" />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {(() => {
            const DtIcon = DATA_TYPE_ICONS[f.dataType] || Type;
            return <DtIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
          })()}
          <span className="font-mono text-xs">{f.fieldCode}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm">{f.fieldName}</span>
          {f.isInherited && (
            <Badge className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 px-1 py-0 gap-0.5">
              <GitMerge className="w-2.5 h-2.5" /> Inherited
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={cn('text-xs', DATA_TYPE_COLORS[f.dataType] || '')}>
            {f.dataType}
          </Badge>
          {(f.dataType === 'IMAGE' || f.dataType === 'VIDEO' || f.dataType === 'FILE' || f.dataType === 'DOCUMENT') && f.isMultiple && (
            <Badge variant="outline" className="text-[9px] bg-pink-50 text-pink-600 border-pink-200 px-1 py-0">multi</Badge>
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
              className={cn(
                'text-[10px] group/val cursor-pointer hover:bg-secondary/80',
                v.ruleType === 'REQUIRED' && 'bg-red-50 text-red-700',
                v.ruleType === 'UNIQUE' && 'bg-violet-50 text-violet-700',
                v.ruleType === 'LOV_VALIDATION' && 'bg-cyan-50 text-cyan-700',
                v.ruleType === 'CROSS_FIELD' && 'bg-blue-50 text-blue-700',
                v.ruleType === 'CONDITIONAL_REQUIRED' && 'bg-amber-50 text-amber-700',
              )}
              onClick={() => {
                setSelectedFieldId(f.id);
                setEditValidation(v);
                setValidationForm({ ruleType: v.ruleType, ruleValue: v.ruleValue === '__NONE__' ? '' : v.ruleValue || '', errorMessage: v.errorMessage || '' });
                setValidationDialogOpen(true);
              }}
            >
              {v.ruleType}
              <button onClick={(e) => { e.stopPropagation(); handleDeleteValidation(v.id); }} className="ml-1 opacity-0 group-hover/val:opacity-100 hover:text-destructive transition-opacity">×</button>
            </Badge>
          ))}
          {(f.dataType === 'SELECT' || f.dataType === 'LOV' || f.dataType === 'LOOKUP') && f.lookupMaster && (
            <Badge className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">
              LOV: {f.lookupMaster.lookupName}
            </Badge>
          )}
          {f.unitOfMeasure && (
            <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 px-1 py-0">
              <Ruler className="w-2.5 h-2.5 mr-0.5" />{f.unitOfMeasure}
            </Badge>
          )}
          {f.categoryScope && (
            <Badge className="text-[9px] bg-sky-50 text-sky-700 border-sky-200 px-1 py-0">
              <FolderTree className="w-2.5 h-2.5 mr-0.5" />Scoped
            </Badge>
          )}
          {isSuperAdminUser && (
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => {
              setSelectedFieldId(f.id);
              setEditValidation(null);
              setValidationForm({ ruleType: 'REQUIRED', ruleValue: '', errorMessage: '' });
              setPreviewResult(null);
              setValidationDialogOpen(true);
            }}>
              <Shield className="w-3 h-3 text-muted-foreground" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-3 h-3" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEditField(f)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
            {isSuperAdminUser && <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteField(f.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );

  // ============================================================
  // Render: Field Preview Panel
  // ============================================================
  const renderFieldPreview = () => {
    if (!metaModule?.fields || metaModule.fields.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Add attributes to see a preview</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {metaModule.fields.map((f: any) => {
          const inputId = `preview-${f.fieldCode}`;
          const DtIcon = DATA_TYPE_ICONS[f.dataType] || Type;
          return (
            <div key={f.id} className="space-y-1">
              <Label htmlFor={inputId} className="text-xs flex items-center gap-1.5">
                <DtIcon className="w-3 h-3" />
                {f.fieldName}
                {f.isRequired && <span className="text-red-500">*</span>}
                <Badge variant="outline" className={cn('text-[9px] px-1 py-0', DATA_TYPE_COLORS[f.dataType] || '')}>
                  {f.dataType}
                </Badge>
                {f.isInherited && <Badge className="text-[9px] bg-amber-50 text-amber-700 px-1 py-0">Inherited</Badge>}
                {f.unitOfMeasure && <span className="text-[10px] text-muted-foreground">({f.unitOfMeasure})</span>}
              </Label>
              {['TEXT', 'LONG_TEXT', 'RICH_TEXT', 'EMAIL', 'URL', 'PHONE', 'COLOR'].includes(f.dataType) ? (
                f.dataType === 'LONG_TEXT' || f.dataType === 'RICH_TEXT' ? (
                  <Textarea id={inputId} placeholder={f.placeholder || `Enter ${f.fieldName}`} disabled className="h-16 text-xs" />
                ) : (
                  <Input id={inputId} placeholder={f.placeholder || `Enter ${f.fieldName}`} disabled className="h-8 text-xs" />
                )
              ) : ['NUMBER', 'INTEGER', 'DECIMAL', 'CURRENCY'].includes(f.dataType) ? (
                <div className="flex gap-1">
                  <Input id={inputId} type="number" placeholder={f.placeholder || `Enter ${f.fieldName}`} disabled className="h-8 text-xs" />
                  {f.unitOfMeasure && <span className="text-xs text-muted-foreground self-center">{f.unitOfMeasure}</span>}
                </div>
              ) : f.dataType === 'DATE' ? (
                <Input id={inputId} type="date" disabled className="h-8 text-xs" />
              ) : f.dataType === 'DATETIME' ? (
                <Input id={inputId} type="datetime-local" disabled className="h-8 text-xs" />
              ) : f.dataType === 'BOOLEAN' ? (
                <div className="flex items-center gap-2 h-8"><Switch disabled /><span className="text-xs text-muted-foreground">Yes / No</span></div>
              ) : ['SELECT', 'MULTISELECT', 'LOV'].includes(f.dataType) ? (
                <Select disabled><SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Select ${f.fieldName}`} /></SelectTrigger></Select>
              ) : f.dataType === 'LOOKUP' ? (
                <Select disabled><SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Lookup ${f.fieldName}`} /></SelectTrigger></Select>
              ) : f.dataType === 'IMAGE' ? (
                <div className="border border-dashed rounded-md p-3 text-center">
                  <ImageIcon className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-[10px] text-muted-foreground">{f.isMultiple ? 'Drop images or click to upload' : 'Drop image or click to upload'}</p>
                </div>
              ) : f.dataType === 'VIDEO' ? (
                <div className="border border-dashed rounded-md p-3 text-center">
                  <Video className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-[10px] text-muted-foreground">Upload video file</p>
                </div>
              ) : f.dataType === 'COLOR' ? (
                <div className="flex items-center gap-2 h-8"><div className="w-8 h-8 rounded border bg-gray-200" /><Input disabled placeholder="#000000" className="h-8 text-xs" /></div>
              ) : ['COMPOUND', 'CONTAINER'].includes(f.dataType) ? (
                <div className="border border-dashed rounded-md p-3 text-center">
                  <Box className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-[10px] text-muted-foreground">{f.dataType === 'COMPOUND' ? 'Grouped sub-attributes' : 'Nested object'}</p>
                </div>
              ) : (
                <Input id={inputId} placeholder={f.placeholder || `Enter ${f.fieldName}`} disabled className="h-8 text-xs" />
              )}
              {f.validations?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {f.validations.map((v: any) => (
                    <Badge key={v.id} variant="secondary" className="text-[9px] px-1.5 py-0">{v.ruleType}</Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ============================================================
  // Organize fields by attribute groups
  // ============================================================
  const getGroupedFields = () => {
    const groups = metaModule?.attributeGroups || [];
    const fields = metaModule?.fields || [];
    const grouped: { group: any; fields: any[] }[] = [];
    const assignedFieldIds = new Set<string>();

    // Fields in named groups
    for (const g of groups) {
      const groupFields = fields.filter((f: any) => f.groupId === g.id);
      grouped.push({ group: g, fields: groupFields });
      groupFields.forEach((f: any) => assignedFieldIds.add(f.id));
    }

    // Ungrouped fields
    const ungrouped = fields.filter((f: any) => !assignedFieldIds.has(f.id));
    if (ungrouped.length > 0) {
      grouped.push({ group: { id: '__ungrouped__', groupCode: '__ungrouped__', groupName: 'Ungrouped Attributes', description: null, sortOrder: 999, isCollapsed: false }, fields: ungrouped });
    }

    return grouped;
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
        <p className="text-muted-foreground">Entity Type not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('modules')}>Back to Entity Types</Button>
      </div>
    );
  }

  const ModuleIcon = moduleIconsMap[metaModule.moduleIcon] || Database;
  const entityType = ENTITY_TYPES.find(e => e.value === (metaModule.entityType || 'PRODUCT'));
  const groupedFields = getGroupedFields();

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('modules')} className="h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="p-2 rounded-xl bg-red-50">
          <ModuleIcon className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">{metaModule.moduleName}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{metaModule.moduleCode}</span>
            <span>•</span>
            <Badge className={cn('text-[10px]', entityType?.color || 'bg-gray-50 text-gray-700 border-gray-200')}>
              Entity Type: {entityType?.label || metaModule.entityType}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Badge className={cn(metaModule.isActive !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-300')}>
            {metaModule.isActive !== false ? 'Active' : 'Inactive'}
          </Badge>
          <Badge className={cn(metaModule.requireApproval ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200')}>
            {metaModule.requireApproval ? 'Approval Required' : 'Auto-approve'}
          </Badge>
          {isSuperAdminUser && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => setSettingsOpen(!settingsOpen)}>
              <Settings className="w-3.5 h-3.5 mr-1" /> Settings
              {settingsOpen ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
            </Button>
          )}
        </div>
      </div>

      {/* Module Settings Panel */}
      {isSuperAdminUser && (
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleContent>
            <Card className="shadow-sm border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Entity Type Settings
                </CardTitle>
                <CardDescription>Configure entity type metadata, classification, and display options</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Entity Type Name</Label>
                    <Input value={moduleForm.moduleName} onChange={(e) => setModuleForm({ ...moduleForm, moduleName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Entity Type Classification</Label>
                    <Select value={moduleForm.entityType} onValueChange={(v) => setModuleForm({ ...moduleForm, entityType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ENTITY_TYPES.map((et) => (
                          <SelectItem key={et.value} value={et.value}>
                            <div className="flex items-center gap-2">
                              <Badge className={cn('text-[9px]', et.color)}>{et.label}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Module Icon</Label>
                    <Select value={moduleForm.moduleIcon} onValueChange={(v) => setModuleForm({ ...moduleForm, moduleIcon: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(moduleIconsMap).map(([name, IconComp]) => (
                          <SelectItem key={name} value={name}>
                            <div className="flex items-center gap-2"><IconComp className="w-4 h-4" /><span>{name}</span></div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sort Order</Label>
                    <Input type="number" value={moduleForm.sortOrder} onChange={(e) => setModuleForm({ ...moduleForm, sortOrder: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Description</Label>
                    <Textarea value={moduleForm.description} onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })} rows={2} />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div><Label className="text-sm">Require Approval</Label><p className="text-[10px] text-muted-foreground">Edits require approval before publish</p></div>
                      <Switch checked={moduleForm.requireApproval} onCheckedChange={(c) => setModuleForm({ ...moduleForm, requireApproval: c })} />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div><Label className="text-sm">Active</Label><p className="text-[10px] text-muted-foreground">Enable/disable this entity type</p></div>
                      <Switch checked={moduleForm.isActive} onCheckedChange={(c) => setModuleForm({ ...moduleForm, isActive: c })} />
                    </div>
                    <Button onClick={handleSaveModule} disabled={saving || !moduleForm.moduleName} className="w-full bg-red-600 hover:bg-red-700 text-white h-9">
                      <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Main Layout: Attributes + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Attributes (2/3 width) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Attribute Groups */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  Attribute Groups
                </CardTitle>
                <CardDescription>
                  Organize attributes into collapsible groups (Stibo Attribute Groups)
                </CardDescription>
              </div>
              {isSuperAdminUser && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8" onClick={openCreateGroup}>
                    <FolderOpen className="w-3.5 h-3.5 mr-1" /> Add Group
                  </Button>
                  <Button className="bg-red-600 hover:bg-red-700 text-white h-8" onClick={() => openCreateField()}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Attribute
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {metaModule.fields?.length === 0 && (metaModule.attributeGroups?.length || 0) === 0 ? (
                <div className="py-12 text-center">
                  <Layers className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="text-muted-foreground">No attributes defined yet. Create attribute groups and add attributes to build your schema.</p>
                  <div className="flex items-center justify-center gap-2 mt-4">
                    {isSuperAdminUser && (
                      <>
                        <Button variant="outline" size="sm" onClick={openCreateGroup}>
                          <FolderOpen className="w-4 h-4 mr-1" /> Create Group
                        </Button>
                        <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => openCreateField()}>
                          <Plus className="w-4 h-4 mr-1" /> Add Attribute
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups} className="w-full">
                  {groupedFields.map(({ group, fields: groupFields }) => (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger className="px-4 py-2.5 hover:no-underline hover:bg-muted/30">
                        <div className="flex items-center gap-2">
                          {group.id === '__ungrouped__' ? (
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <FolderTree className="w-4 h-4 text-red-500" />
                          )}
                          <span className="font-medium text-sm">{group.groupName}</span>
                          {group.groupCode !== '__ungrouped__' && (
                            <span className="text-xs text-muted-foreground font-mono">({group.groupCode})</span>
                          )}
                          <Badge variant="secondary" className="text-[10px]">{groupFields.length}</Badge>
                          {group.id !== '__ungrouped__' && isSuperAdminUser && (
                            <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditGroup(group)}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteGroup(group.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead className="w-10">Order</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Validation Base Type</TableHead>
                                <TableHead className="text-center">Req</TableHead>
                                <TableHead className="text-center">Uniq</TableHead>
                                <TableHead>Validations</TableHead>
                                <TableHead className="w-10"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupFields.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-4">
                                    No attributes in this group.
                                    {isSuperAdminUser && (
                                      <Button variant="link" size="sm" className="text-red-600 h-auto p-0 ml-1" onClick={() => openCreateField(group.id === '__ungrouped__' ? undefined : group.id)}>
                                        Add attribute
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ) : (
                                groupFields.map((f: any, idx: number) => renderFieldRow(f, idx, groupFields))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                        {isSuperAdminUser && groupFields.length > 0 && group.id !== '__ungrouped__' && (
                          <div className="p-2 border-t">
                            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-red-600" onClick={() => openCreateField(group.id)}>
                              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add attribute to this group
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
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
                  <p className="text-muted-foreground">No business rules yet. Add cross-field rules to enforce Stibo-style logic.</p>
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
                            {rule.description && <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-xs">{rule.description}</div>}
                            {rule.errorMessage && <div className="text-[11px] text-amber-600 line-clamp-1 max-w-xs">⚠ {rule.errorMessage}</div>}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{describeCondition(rule)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-xs', rule.actionType === 'BLOCK' && 'bg-red-50 text-red-700 border-red-200', rule.actionType === 'WARN' && 'bg-amber-50 text-amber-700 border-amber-200', rule.actionType === 'SET_VALUE' && 'bg-violet-50 text-violet-700 border-violet-200', rule.actionType === 'SEND_EMAIL' && 'bg-teal-50 text-teal-700 border-teal-200')}>
                              {describeAction(rule)}
                            </Badge>
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{rule.trigger}</Badge></TableCell>
                          <TableCell className="text-center"><Switch checked={!!rule.isActive} disabled={!isSuperAdminUser} onCheckedChange={() => handleToggleRuleActive(rule)} /></TableCell>
                          {isSuperAdminUser && (
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-3 h-3" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditRule(rule)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteBusinessRule(rule.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
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

        {/* Preview Panel (1/3 width) */}
        <div className="space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" /> Form Preview
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPreviewOpen(!previewOpen)}>
                  {previewOpen ? 'Hide' : 'Show'}
                </Button>
              </div>
              <CardDescription>Preview how this entity type&apos;s data entry form will look</CardDescription>
            </CardHeader>
            {previewOpen && (
              <CardContent className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {renderFieldPreview()}
              </CardContent>
            )}
          </Card>

          {/* Summary Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Entity Type Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Attributes</span>
                <span className="font-medium">{metaModule.fields?.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Required</span>
                <span className="font-medium">{metaModule.fields?.filter((f: any) => f.isRequired).length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unique</span>
                <span className="font-medium">{metaModule.fields?.filter((f: any) => f.isUnique).length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Inherited</span>
                <span className="font-medium">{metaModule.fields?.filter((f: any) => f.isInherited).length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Attribute Groups</span>
                <span className="font-medium">{metaModule.attributeGroups?.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Validations</span>
                <span className="font-medium">{metaModule.fields?.reduce((sum: number, f: any) => sum + (f.validations?.length || 0), 0) || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Business Rules</span>
                <span className="font-medium">{businessRules.length}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Validation Base Types</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {[...new Set(metaModule.fields?.map((f: any) => f.dataType) || [])].map((dt: unknown) => (
                  <Badge key={dt as string} variant="outline" className={cn('text-[10px]', DATA_TYPE_COLORS[dt as string] || '')}>
                    {dt as string}
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

      {/* Attribute Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editGroup ? 'Edit Attribute Group' : 'Create Attribute Group'}</DialogTitle>
            <DialogDescription>
              {editGroup ? 'Update attribute group properties' : 'Define a new Stibo Attribute Group to organize attributes'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Group Code</Label>
                <Input placeholder="e.g. basic_info" value={groupForm.groupCode} onChange={(e) => setGroupForm({ ...groupForm, groupCode: e.target.value.toUpperCase().replace(/\s+/g, '_') })} disabled={!!editGroup} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Group Name</Label>
                <Input placeholder="e.g. Basic Information" value={groupForm.groupName} onChange={(e) => setGroupForm({ ...groupForm, groupName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="What this group contains" value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={groupForm.sortOrder} onChange={(e) => setGroupForm({ ...groupForm, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="text-sm">Collapsed by Default</Label>
                  <p className="text-[10px] text-muted-foreground">Start collapsed when page loads</p>
                </div>
                <Switch checked={groupForm.isCollapsed} onCheckedChange={(c) => setGroupForm({ ...groupForm, isCollapsed: c })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={saving || !groupForm.groupCode || !groupForm.groupName} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editGroup ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field/Attribute Dialog */}
      <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editField ? 'Edit Attribute' : 'Add Attribute'}</DialogTitle>
            <DialogDescription>
              {editField ? `Update attribute properties — ${editField.fieldCode}` : 'Configure the attribute properties and validation base type'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
            {/* Code & Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Attribute Code</Label>
                <Input
                  placeholder="e.g. product_name"
                  value={fieldForm.fieldCode}
                  onChange={(e) => setFieldForm({ ...fieldForm, fieldCode: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  disabled={!!editField}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Attribute Name</Label>
                <Input
                  placeholder="e.g. Product Name"
                  value={fieldForm.fieldName}
                  onChange={(e) => setFieldForm({ ...fieldForm, fieldName: e.target.value })}
                />
              </div>
            </div>

            {/* Data Type (Stibo: Attribute Validation Base Type) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Attribute Validation Base Type
                  <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground px-1 py-0">Stibo</Badge>
                </Label>
                <Select value={fieldForm.dataType} onValueChange={(v) => setFieldForm({ ...fieldForm, dataType: v, isMultiple: false })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[400px]">
                    {DATA_TYPE_CATEGORIES.map((cat) => (
                      <div key={cat.label}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat.label}</div>
                        {cat.types.map((t) => {
                          const Icon = t.icon;
                          return (
                            <SelectItem key={t.value} value={t.value}>
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="font-medium">{t.label}</span>
                                <span className="text-xs text-muted-foreground">— {t.desc}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={fieldForm.sortOrder} onChange={(e) => setFieldForm({ ...fieldForm, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            {/* Attribute Group */}
            <div className="space-y-2">
              <Label>Attribute Group</Label>
              <Select value={fieldForm.groupId || '__none__'} onValueChange={(v) => setFieldForm({ ...fieldForm, groupId: v === '__none__' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select a group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Ungrouped —</SelectItem>
                  {(metaModule?.attributeGroups || []).map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <FolderTree className="w-3.5 h-3.5" />
                        <span>{g.groupName}</span>
                        <span className="text-xs text-muted-foreground">({g.groupCode})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stibo-specific: Inherited */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-50/30">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-amber-600" />
                <div>
                  <Label className="text-sm">Inherited from Parent Classification</Label>
                  <p className="text-[10px] text-muted-foreground">Mark this attribute as inherited from a parent classification node</p>
                </div>
              </div>
              <Switch checked={fieldForm.isInherited} onCheckedChange={(c) => setFieldForm({ ...fieldForm, isInherited: c })} />
            </div>

            {/* Category Scope */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Category Scope
                <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 px-1 py-0">Optional</Badge>
              </Label>
              <Input
                placeholder="e.g. electronics,clothing (comma-separated category codes)"
                value={fieldForm.categoryScope}
                onChange={(e) => setFieldForm({ ...fieldForm, categoryScope: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Limit this attribute to specific classification categories (comma-separated)</p>
            </div>

            {/* Numeric type specifics: Unit of Measure, Range */}
            {['NUMBER', 'INTEGER', 'DECIMAL', 'CURRENCY'].includes(fieldForm.dataType) && (
              <div className="space-y-3 rounded-md border p-3 bg-emerald-50/20">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Numeric Properties</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1"><Ruler className="w-3 h-3" /> Unit of Measure</Label>
                    <Select value={fieldForm.unitOfMeasure} onValueChange={(v) => setFieldForm({ ...fieldForm, unitOfMeasure: v === '__none__' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Select UoM" /></SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        <SelectItem value="__none__">— None —</SelectItem>
                        {UNIT_OF_MEASURE_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Min Value</Label>
                    <Input type="number" placeholder="e.g. 0" value={fieldForm.minValue} onChange={(e) => setFieldForm({ ...fieldForm, minValue: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Max Value</Label>
                    <Input type="number" placeholder="e.g. 999999" value={fieldForm.maxValue} onChange={(e) => setFieldForm({ ...fieldForm, maxValue: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* Text type specifics: Max Length, Pattern */}
            {['TEXT', 'LONG_TEXT', 'RICH_TEXT'].includes(fieldForm.dataType) && (
              <div className="space-y-3 rounded-md border p-3 bg-blue-50/20">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Text Properties</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Max Length</Label>
                    <Input type="number" placeholder="e.g. 255" value={fieldForm.maxLength} onChange={(e) => setFieldForm({ ...fieldForm, maxLength: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">Regex Pattern</Label>
                    <Input placeholder="e.g. ^[A-Z0-9-]+$" value={fieldForm.regexPattern} onChange={(e) => setFieldForm({ ...fieldForm, regexPattern: e.target.value })} className="font-mono" />
                  </div>
                </div>
              </div>
            )}

            {/* Media type: multi toggle */}
            {['IMAGE', 'VIDEO', 'DOCUMENT', 'FILE'].includes(fieldForm.dataType) && (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-pink-50/30">
                <div>
                  <Label className="text-sm">Allow Multiple</Label>
                  <p className="text-[11px] text-muted-foreground">Allow multiple {fieldForm.dataType.toLowerCase()} uploads</p>
                </div>
                <Switch checked={fieldForm.isMultiple} onCheckedChange={(c) => setFieldForm({ ...fieldForm, isMultiple: c })} />
              </div>
            )}

            {/* Selection types: Lookup Source */}
            {['SELECT', 'MULTISELECT', 'LOV', 'LOOKUP'].includes(fieldForm.dataType) && (
              <div className="space-y-3 rounded-md border p-3 bg-cyan-50/20">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <List className="w-3 h-3" />
                  {fieldForm.dataType === 'LOV' ? 'List of Values (LOV) Source' : fieldForm.dataType === 'LOOKUP' ? 'Cross-Module Lookup Source' : 'Dropdown Source'}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Lookup Master</Label>
                  <Select value={fieldForm.lookupMasterId} onValueChange={(v) => setFieldForm({ ...fieldForm, lookupMasterId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select a lookup" /></SelectTrigger>
                    <SelectContent>
                      {lookups.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.lookupName} ({l.lookupCode})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {['SELECT', 'LOOKUP', 'LOV'].includes(fieldForm.dataType) && (
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      Cascades From
                      <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-300 px-1 py-0">cascading</Badge>
                    </Label>
                    <Select value={fieldForm.cascadesFromFieldCode} onValueChange={(v) => setFieldForm({ ...fieldForm, cascadesFromFieldCode: v === '__NONE__' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="— None (flat list) —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">— None (flat list) —</SelectItem>
                        {metaModule?.fields
                          ?.filter((f: any) => f.fieldCode !== fieldForm.fieldCode && ['SELECT', 'LOOKUP', 'LOV'].includes(f.dataType))
                          .map((f: any) => (
                            <SelectItem key={f.id} value={f.fieldCode}>{f.fieldName} ({f.fieldCode})</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Required / Unique */}
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

            {/* Default / Placeholder / Description */}
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
              <Textarea placeholder="Attribute description" value={fieldForm.description} onChange={(e) => setFieldForm({ ...fieldForm, description: e.target.value })} rows={2} />
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
            <DialogDescription>Define a Stibo validation rule for this attribute</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-2">
              <Label>Rule Type (Stibo Validation)</Label>
              <Select value={validationForm.ruleType} onValueChange={(v) => {
                setValidationForm({ ...validationForm, ruleType: v, ruleValue: '' });
                setPreviewResult(null);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALIDATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[9px] px-1 py-0', t === 'REQUIRED' && 'bg-red-50 text-red-700', t === 'UNIQUE' && 'bg-violet-50 text-violet-700', t === 'LOV_VALIDATION' && 'bg-cyan-50 text-cyan-700', t === 'CROSS_FIELD' && 'bg-blue-50 text-blue-700', t === 'CONDITIONAL_REQUIRED' && 'bg-amber-50 text-amber-700')}>
                          {t}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rule Value */}
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
                  {validationForm.ruleType === 'CONDITIONAL_REQUIRED' && <span className="text-[11px] text-muted-foreground ml-1">(fieldCode:condition)</span>}
                  {validationForm.ruleType === 'CROSS_FIELD' && <span className="text-[11px] text-muted-foreground ml-1">(fieldCode.expression)</span>}
                  {validationForm.ruleType === 'LOV_VALIDATION' && <span className="text-[11px] text-muted-foreground ml-1">(lookupCode or expression)</span>}
                </Label>
                <Input
                  placeholder={
                    validationForm.ruleType === 'PATTERN' ? 'e.g. ^[A-Z0-9-]+$'
                    : validationForm.ruleType === 'MIN_LENGTH' || validationForm.ruleType === 'MAX_LENGTH' ? 'e.g. 3'
                    : validationForm.ruleType === 'MIN_VALUE' || validationForm.ruleType === 'MAX_VALUE' ? 'e.g. 100'
                    : validationForm.ruleType === 'CONDITIONAL_REQUIRED' ? 'e.g. category:electronics'
                    : validationForm.ruleType === 'CROSS_FIELD' ? 'e.g. price > cost_price'
                    : validationForm.ruleType === 'LOV_VALIDATION' ? 'e.g. country_codes'
                    : validationForm.ruleType === 'CUSTOM' ? 'e.g. custom validation expression'
                    : 'value'
                  }
                  value={validationForm.ruleValue}
                  onChange={(e) => { setValidationForm({ ...validationForm, ruleValue: e.target.value }); setPreviewResult(null); }}
                  className="font-mono"
                />
                {validationForm.ruleType === 'CONDITIONAL_REQUIRED' && (
                  <p className="text-[11px] text-muted-foreground">Format: <span className="font-mono">fieldCode:value</span> — attribute is required when the specified field equals the given value.</p>
                )}
                {validationForm.ruleType === 'LOV_VALIDATION' && (
                  <p className="text-[11px] text-muted-foreground">Validate against a List of Values (LOV). Enter the lookup code or expression.</p>
                )}
                {validationForm.ruleType === 'CROSS_FIELD' && (
                  <p className="text-[11px] text-muted-foreground">Cross-field validation expression. Use <span className="font-mono">{'{{fieldCode}}'}</span> placeholders.</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Error Message</Label>
              <Input placeholder="Custom error message" value={validationForm.errorMessage} onChange={(e) => setValidationForm({ ...validationForm, errorMessage: e.target.value })} />
            </div>

            {/* Validation Preview */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Test Validation</Label>
              <div className="flex gap-2">
                <Input placeholder="Enter a sample value to test" value={previewValue} onChange={(e) => { setPreviewValue(e.target.value); setPreviewResult(null); }} className="flex-1" />
                <Button variant="outline" size="sm" onClick={runValidationPreview} className="shrink-0">Test</Button>
              </div>
              {previewResult && (
                <div className={cn('rounded-md border p-2.5 text-xs', previewResult.valid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>
                  {previewResult.valid ? (
                    <span className="font-medium">✓ Value passes all validations</span>
                  ) : (
                    <div>
                      <span className="font-medium">✗ Validation failed:</span>
                      <ul className="mt-1 ml-3 list-disc">{previewResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidationDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveValidation} disabled={saving || (!noValueNeeded && !validationForm.ruleValue)} className="bg-red-600 hover:bg-red-700 text-white">
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
              Cross-field rule (Stibo Business Rules engine). Conditions are evaluated on save; actions can block, warn, compute a value, or queue an email.
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
              <Textarea placeholder="What this rule enforces" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} rows={2} />
            </div>
            {/* Condition builder */}
            {(ruleForm.conditionType === 'CROSS_FIELD' || ruleForm.conditionType === 'REQUIRED_IF') && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Condition</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Left Attribute</Label>
                    <Select value={ruleForm.leftFieldCode} onValueChange={(v) => setRuleForm({ ...ruleForm, leftFieldCode: v })}>
                      <SelectTrigger><SelectValue placeholder="Select attribute" /></SelectTrigger>
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
                    <Label className="text-xs">Right Attribute</Label>
                    <Select value={ruleForm.rightFieldCode} onValueChange={(v) => setRuleForm({ ...ruleForm, rightFieldCode: v })}>
                      <SelectTrigger><SelectValue placeholder="Select attribute" /></SelectTrigger>
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
              {ruleForm.actionType === 'SET_VALUE' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Target Attribute</Label>
                      <Select value={ruleForm.targetFieldCode} onValueChange={(v) => setRuleForm({ ...ruleForm, targetFieldCode: v })}>
                        <SelectTrigger><SelectValue placeholder="Select target" /></SelectTrigger>
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
                  <p className="text-[11px] text-muted-foreground">Use <span className="font-mono">{'{{fieldCode}}'}</span> placeholders for attribute values.</p>
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
