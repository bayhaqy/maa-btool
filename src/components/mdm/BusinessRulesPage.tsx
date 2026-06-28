'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Scale, Plus, Play, Pause, Trash2, Pencil, ArrowRight,
  AlertTriangle, CheckCircle2, XCircle, Mail, Zap,
  Shield, FileText, Bell, Settings2, Search,
  FlaskConical, ToggleLeft, Eye, Code2, Workflow,
  Globe, Layers, Hash, Regex, SlidersHorizontal, Lock,
  Send, AlertOctagon, Info, CalendarClock,
  ChevronDown, ChevronUp, Copy, Sparkles,
  Code, SquareFunction, Bug,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Stibo-aligned Types
// ---------------------------------------------------------------------------

type RuleType = 'CONDITION' | 'ACTION' | 'FUNCTION';
type ConditionType = 'CROSS_FIELD' | 'LOV_CROSS' | 'SCRIPTED' | 'REQUIRED_IF' | 'COMPLETENESS' | 'UNIQUENESS' | 'RANGE' | 'PATTERN';
type ActionType = 'BLOCK' | 'SET_VALUE' | 'SEND_EMAIL' | 'WARN' | 'SET_STATUS' | 'TRANSITION' | 'TRIGGER_WEBHOOK' | 'CREATE_TASK';
type Severity = 'ERROR' | 'WARNING' | 'INFO';
type Trigger = 'SAVE' | 'APPROVE' | 'IMPORT' | 'TRANSITION' | 'SCHEDULED';
type Scope = 'RECORD' | 'BULK' | 'ALL';

interface RuleCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic?: 'AND' | 'OR';
}

interface BusinessRule {
  id: string;
  name: string;
  description: string;
  ruleType: RuleType;
  conditionType: ConditionType;
  conditionJson: string;
  actionType: ActionType;
  actionJson: string | null;
  errorMessage: string | null;
  severity: Severity;
  trigger: Trigger;
  scope: Scope;
  isActive: boolean;
  moduleId: string;
  moduleName: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Config Maps
// ---------------------------------------------------------------------------

const ruleTypeConfig: Record<RuleType, { label: string; color: string; icon: React.ElementType; description: string }> = {
  CONDITION: {
    label: 'Condition',
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    icon: Shield,
    description: 'Evaluate data and determine if conditions are met',
  },
  ACTION: {
    label: 'Action',
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    icon: Zap,
    description: 'Perform operations on data when triggered',
  },
  FUNCTION: {
    label: 'Function',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    icon: Code,
    description: 'Reusable logic components',
  },
};

const conditionTypeConfig: Record<ConditionType, { label: string; color: string; icon: React.ElementType }> = {
  CROSS_FIELD: { label: 'Cross-Field', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: Layers },
  LOV_CROSS: { label: 'LOV Cross-Validation', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', icon: CheckCircle2 },
  SCRIPTED: { label: 'Scripted', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: Code2 },
  REQUIRED_IF: { label: 'Required If', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: Shield },
  COMPLETENESS: { label: 'Completeness', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', icon: FileText },
  UNIQUENESS: { label: 'Uniqueness', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', icon: Hash },
  RANGE: { label: 'Range', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', icon: SlidersHorizontal },
  PATTERN: { label: 'Pattern', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300', icon: Regex },
};

const actionTypeConfig: Record<ActionType, { label: string; color: string; icon: React.ElementType }> = {
  BLOCK: { label: 'Block', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: Lock },
  SET_VALUE: { label: 'Set Value', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', icon: Settings2 },
  SEND_EMAIL: { label: 'Send Email', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: Mail },
  WARN: { label: 'Warn', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: AlertTriangle },
  SET_STATUS: { label: 'Set Status', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', icon: ToggleLeft },
  TRANSITION: { label: 'Transition', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', icon: Workflow },
  TRIGGER_WEBHOOK: { label: 'Trigger Webhook', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: Globe },
  CREATE_TASK: { label: 'Create Task', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: Bell },
};

const severityConfig: Record<Severity, { label: string; color: string; icon: React.ElementType }> = {
  ERROR: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800', icon: XCircle },
  WARNING: { label: 'Warning', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800', icon: AlertTriangle },
  INFO: { label: 'Info', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800', icon: Info },
};

const triggerConfig: Record<Trigger, { label: string; color: string }> = {
  SAVE: { label: 'On Save', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  APPROVE: { label: 'On Approve', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  IMPORT: { label: 'On Import', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  TRANSITION: { label: 'On Transition', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  SCHEDULED: { label: 'Scheduled', color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300' },
};

const scopeConfig: Record<Scope, { label: string; color: string; description: string }> = {
  RECORD: { label: 'Record', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300', description: 'Single record operation' },
  BULK: { label: 'Bulk', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', description: 'Batch operation' },
  ALL: { label: 'All', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', description: 'Both record and bulk' },
};

const operators = ['equals', 'not_equals', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'contains', 'not_contains', 'matches', 'not_matches', 'in', 'not_in', 'before', 'after', 'between'];
const fields = ['status', 'brand', 'price', 'regularPrice', 'wholesalePrice', 'category', 'subCategory', 'taxId', 'startDate', 'endDate', 'qualityScore', 'name', 'sku', 'email', 'publishedDate'];

// ---------------------------------------------------------------------------
// Sample Data (9 rules as specified)
// ---------------------------------------------------------------------------

const sampleRules: BusinessRule[] = [
  {
    id: 'sample-1',
    name: 'Product Name Required',
    description: 'Ensures that every product record has a non-empty name. This is a fundamental data completeness check to prevent records with missing identifiers from being saved.',
    ruleType: 'CONDITION',
    conditionType: 'COMPLETENESS',
    conditionJson: JSON.stringify({ field: 'name', check: 'not_empty', logic: 'AND' }),
    actionType: 'BLOCK',
    actionJson: null,
    errorMessage: 'Product name is required. Every product must have a name before saving.',
    severity: 'ERROR',
    trigger: 'SAVE',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 1,
    createdAt: '2024-12-01T10:00:00Z',
    updatedAt: '2024-12-01T10:00:00Z',
  },
  {
    id: 'sample-2',
    name: 'Price Must Be Positive',
    description: 'Validates that the price field contains a positive value. Negative or zero prices are not allowed for any product record.',
    ruleType: 'CONDITION',
    conditionType: 'RANGE',
    conditionJson: JSON.stringify({ field: 'price', min: 0.01, operator: 'greater_than', logic: 'AND' }),
    actionType: 'BLOCK',
    actionJson: null,
    errorMessage: 'Price must be a positive value greater than zero.',
    severity: 'ERROR',
    trigger: 'SAVE',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 2,
    createdAt: '2024-12-05T14:00:00Z',
    updatedAt: '2024-12-05T14:00:00Z',
  },
  {
    id: 'sample-3',
    name: 'Email Format Validation',
    description: 'Validates that email fields follow a standard email format pattern. This ensures data quality for communication-related fields.',
    ruleType: 'CONDITION',
    conditionType: 'PATTERN',
    conditionJson: JSON.stringify({ field: 'email', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', flags: 'i', logic: 'AND' }),
    actionType: 'WARN',
    actionJson: JSON.stringify({ message: 'Email format appears invalid. Please verify the email address.' }),
    errorMessage: 'Email format is invalid. Please enter a valid email address.',
    severity: 'WARNING',
    trigger: 'SAVE',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 3,
    createdAt: '2024-12-10T09:00:00Z',
    updatedAt: '2024-12-10T09:00:00Z',
  },
  {
    id: 'sample-4',
    name: 'Category-Subcategory LOV Validation',
    description: 'Ensures that the selected sub-category belongs to the parent category in the List of Values (LOV) hierarchy. Prevents invalid category combinations.',
    ruleType: 'CONDITION',
    conditionType: 'LOV_CROSS',
    conditionJson: JSON.stringify({ parentField: 'category', childField: 'subCategory', lovTable: 'category_subcategory', logic: 'AND' }),
    actionType: 'BLOCK',
    actionJson: null,
    errorMessage: 'Sub-category does not belong to the selected category. Please select a valid combination.',
    severity: 'ERROR',
    trigger: 'SAVE',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 4,
    createdAt: '2024-12-15T11:00:00Z',
    updatedAt: '2024-12-15T11:00:00Z',
  },
  {
    id: 'sample-5',
    name: 'Auto-set Published Date',
    description: 'Automatically sets the published date to the current timestamp when a record is approved. This ensures consistent tracking of when products go live.',
    ruleType: 'ACTION',
    conditionType: 'COMPLETENESS',
    conditionJson: JSON.stringify({ field: 'publishedDate', check: 'is_empty', logic: 'AND' }),
    actionType: 'SET_VALUE',
    actionJson: JSON.stringify({ targetField: 'publishedDate', value: '{{currentTimestamp}}', format: 'ISO_8601' }),
    errorMessage: null,
    severity: 'INFO',
    trigger: 'APPROVE',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 5,
    createdAt: '2024-12-20T08:00:00Z',
    updatedAt: '2024-12-20T08:00:00Z',
  },
  {
    id: 'sample-6',
    name: 'Warn on Low Quality Score',
    description: 'Displays a warning when a record\'s quality score falls below the acceptable threshold of 70%. Allows users to proceed but highlights potential data quality issues.',
    ruleType: 'ACTION',
    conditionType: 'RANGE',
    conditionJson: JSON.stringify({ field: 'qualityScore', max: 70, operator: 'less_than', logic: 'AND' }),
    actionType: 'WARN',
    actionJson: JSON.stringify({ message: 'Quality score is below 70%. Consider improving data quality before saving.', allowProceed: true }),
    errorMessage: 'Quality score is below the 70% threshold.',
    severity: 'WARNING',
    trigger: 'SAVE',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 6,
    createdAt: '2025-01-02T13:00:00Z',
    updatedAt: '2025-01-02T13:00:00Z',
  },
  {
    id: 'sample-7',
    name: 'Block Delete of Published Records',
    description: 'Prevents deletion or status transition of records that are currently in PUBLISHED state. Published records must be unpublished before they can be modified or removed.',
    ruleType: 'ACTION',
    conditionType: 'CROSS_FIELD',
    conditionJson: JSON.stringify({ field1: 'status', operator: 'equals', value1: 'PUBLISHED', logic: 'AND' }),
    actionType: 'BLOCK',
    actionJson: JSON.stringify({ blockTransition: true, message: 'Cannot delete or transition published records. Unpublish first.' }),
    errorMessage: 'Cannot delete or transition published records. Please unpublish the record first.',
    severity: 'ERROR',
    trigger: 'TRANSITION',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 7,
    createdAt: '2025-01-05T16:00:00Z',
    updatedAt: '2025-01-05T16:00:00Z',
  },
  {
    id: 'sample-8',
    name: 'SKU Uniqueness Check',
    description: 'Validates that the SKU (Stock Keeping Unit) value is unique across all records in the module. Duplicate SKUs can cause inventory and reference data issues.',
    ruleType: 'CONDITION',
    conditionType: 'UNIQUENESS',
    conditionJson: JSON.stringify({ field: 'sku', scope: 'module', caseSensitive: true, logic: 'AND' }),
    actionType: 'BLOCK',
    actionJson: null,
    errorMessage: 'SKU must be unique. Another record with this SKU already exists.',
    severity: 'ERROR',
    trigger: 'SAVE',
    scope: 'ALL',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 8,
    createdAt: '2025-01-08T10:00:00Z',
    updatedAt: '2025-01-08T10:00:00Z',
  },
  {
    id: 'sample-9',
    name: 'Conditional Required: Brand if Category=Shoes',
    description: 'Requires the Brand field to be populated when the Category is set to "Shoes". This ensures that shoe products always have an associated brand for proper categorization.',
    ruleType: 'CONDITION',
    conditionType: 'REQUIRED_IF',
    conditionJson: JSON.stringify({ conditionField: 'category', conditionValue: 'Shoes', requiredField: 'brand', logic: 'AND' }),
    actionType: 'BLOCK',
    actionJson: null,
    errorMessage: 'Brand is required when Category is "Shoes". Please provide a brand value.',
    severity: 'ERROR',
    trigger: 'SAVE',
    scope: 'RECORD',
    isActive: true,
    moduleId: 'mod-article',
    moduleName: 'Article Master',
    sortOrder: 9,
    createdAt: '2025-01-10T15:00:00Z',
    updatedAt: '2025-01-10T15:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Helper: Parse conditionJson safely
// ---------------------------------------------------------------------------

function parseConditionJson(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseActionJson(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Severity Badge Component
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: Severity }) {
  const conf = severityConfig[severity];
  return (
    <Badge className={cn('text-[10px] border gap-1 font-semibold', conf.color)}>
      <conf.icon className="w-3 h-3" />
      {conf.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BusinessRulesPage() {
  const { token } = useAppStore();

  // State
  const [rules, setRules] = useState<BusinessRule[]>(sampleRules);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('CONDITION');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<BusinessRule | null>(null);
  const [testRuleOpen, setTestRuleOpen] = useState(false);
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<{ passed: boolean; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterTrigger, setFilterTrigger] = useState<string>('all');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Create rule form state
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    ruleType: 'CONDITION' as RuleType,
    conditionType: 'COMPLETENESS' as ConditionType,
    conditionJson: '',
    actionType: 'BLOCK' as ActionType,
    actionJson: '',
    errorMessage: '',
    severity: 'ERROR' as Severity,
    trigger: 'SAVE' as Trigger,
    scope: 'RECORD' as Scope,
    conditions: [{ id: 'nc1', field: 'name', operator: 'equals', value: '', logic: 'AND' as const }] as (RuleCondition & { logic: 'AND' | 'OR' })[],
  });

  // Fetch rules from API
  const fetchRules = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/business-rules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rules && data.rules.length > 0) {
          const mapped = data.rules.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            name: r.name as string,
            description: (r.description as string) || '',
            ruleType: (r.ruleType as RuleType) || 'CONDITION',
            conditionType: (r.conditionType as ConditionType) || 'CROSS_FIELD',
            conditionJson: (r.conditionJson as string) || '{}',
            actionType: (r.actionType as ActionType) || 'BLOCK',
            actionJson: (r.actionJson as string) || null,
            errorMessage: (r.errorMessage as string) || null,
            severity: (r.severity as Severity) || 'ERROR',
            trigger: (r.trigger as Trigger) || 'SAVE',
            scope: (r.scope as Scope) || 'RECORD',
            isActive: (r.isActive as boolean) ?? true,
            moduleId: (r.moduleId as string) || '',
            moduleName: r.module ? (r.module as Record<string, unknown>).moduleName as string : 'Unknown',
            sortOrder: (r.sortOrder as number) || 0,
            createdAt: r.createdAt as string,
            updatedAt: r.updatedAt as string,
          }));
          setRules(mapped);
        }
        // If no rules from API, keep sample data
      }
    } catch {
      // Silently keep sample data
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Filtered rules by tab and search
  const filteredRules = rules.filter(rule => {
    const matchesTab = rule.ruleType === activeTab;
    const matchesSearch = !searchQuery ||
      rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || rule.severity === filterSeverity;
    const matchesTrigger = filterTrigger === 'all' || rule.trigger === filterTrigger;
    return matchesTab && matchesSearch && matchesSeverity && matchesTrigger;
  });

  // Stats
  const totalRules = rules.length;
  const activeRules = rules.filter(r => r.isActive).length;
  const conditionCount = rules.filter(r => r.ruleType === 'CONDITION').length;
  const actionCount = rules.filter(r => r.ruleType === 'ACTION').length;
  const functionCount = rules.filter(r => r.ruleType === 'FUNCTION').length;
  const errorCount = rules.filter(r => r.severity === 'ERROR').length;
  const warningCount = rules.filter(r => r.severity === 'WARNING').length;

  // Toggle rule active state
  const toggleRule = async (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: !r.isActive } : r));

    // Update via API if it's a real rule (not sample)
    if (token && !ruleId.startsWith('sample-')) {
      try {
        await fetch('/api/business-rules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: ruleId, isActive: !rule.isActive }),
        });
      } catch {
        // Revert on error
        setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: rule.isActive } : r));
      }
    }
  };

  // Toggle card expansion
  const toggleCard = (ruleId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  // Condition builder helpers
  const addCondition = () => {
    setNewRule(prev => ({
      ...prev,
      conditions: [...prev.conditions, { id: `nc${Date.now()}`, field: 'name', operator: 'equals', value: '', logic: 'AND' as const }],
    }));
  };

  const removeCondition = (condId: string) => {
    setNewRule(prev => ({
      ...prev,
      conditions: prev.conditions.filter(c => c.id !== condId),
    }));
  };

  const updateCondition = (condId: string, key: string, val: string) => {
    setNewRule(prev => ({
      ...prev,
      conditions: prev.conditions.map(c => c.id === condId ? { ...c, [key]: val } : c),
    }));
  };

  // Build conditionJson from conditions array
  const buildConditionJson = () => {
    if (newRule.conditionType === 'COMPLETENESS') {
      const first = newRule.conditions[0];
      return JSON.stringify({ field: first?.field || 'name', check: 'not_empty', logic: 'AND' });
    }
    if (newRule.conditionType === 'RANGE') {
      const first = newRule.conditions[0];
      return JSON.stringify({ field: first?.field || 'price', min: Number(first?.value) || 0, operator: first?.operator || 'greater_than', logic: 'AND' });
    }
    if (newRule.conditionType === 'PATTERN') {
      const first = newRule.conditions[0];
      return JSON.stringify({ field: first?.field || 'email', pattern: first?.value || '.*', flags: 'i', logic: 'AND' });
    }
    if (newRule.conditionType === 'UNIQUENESS') {
      const first = newRule.conditions[0];
      return JSON.stringify({ field: first?.field || 'sku', scope: 'module', caseSensitive: true, logic: 'AND' });
    }
    if (newRule.conditionType === 'LOV_CROSS') {
      const first = newRule.conditions[0];
      return JSON.stringify({ parentField: first?.field || 'category', childField: first?.value || 'subCategory', lovTable: 'category_subcategory', logic: 'AND' });
    }
    if (newRule.conditionType === 'REQUIRED_IF') {
      const first = newRule.conditions[0];
      return JSON.stringify({ conditionField: first?.field || 'category', conditionValue: first?.value || '', requiredField: newRule.conditions[1]?.field || 'brand', logic: 'AND' });
    }
    if (newRule.conditionType === 'CROSS_FIELD') {
      const first = newRule.conditions[0];
      return JSON.stringify({ field1: first?.field || 'status', operator: first?.operator || 'equals', value1: first?.value || '', logic: 'AND' });
    }
    // SCRIPTED
    const first = newRule.conditions[0];
    return JSON.stringify({ expression: first?.value || '', language: 'javascript', logic: 'AND' });
  };

  // Create rule handler
  const handleCreateRule = async () => {
    const conditionJson = buildConditionJson();
    const newRuleData: BusinessRule = {
      id: `BR-${Date.now()}`,
      name: newRule.name,
      description: newRule.description,
      ruleType: newRule.ruleType,
      conditionType: newRule.conditionType,
      conditionJson,
      actionType: newRule.actionType,
      actionJson: newRule.actionJson || null,
      errorMessage: newRule.errorMessage || null,
      severity: newRule.severity,
      trigger: newRule.trigger,
      scope: newRule.scope,
      isActive: true,
      moduleId: 'mod-article',
      moduleName: 'Article Master',
      sortOrder: rules.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setRules(prev => [...prev, newRuleData]);
    setCreateOpen(false);

    // Reset form
    setNewRule({
      name: '', description: '', ruleType: 'CONDITION', conditionType: 'COMPLETENESS',
      conditionJson: '', actionType: 'BLOCK', actionJson: '', errorMessage: '',
      severity: 'ERROR', trigger: 'SAVE', scope: 'RECORD',
      conditions: [{ id: 'nc1', field: 'name', operator: 'equals', value: '', logic: 'AND' as const }],
    });

    // Create via API if token exists
    if (token) {
      try {
        await fetch('/api/business-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            moduleId: 'mod-article',
            name: newRule.name,
            description: newRule.description,
            ruleType: newRule.ruleType,
            conditionType: newRule.conditionType,
            conditionJson,
            actionType: newRule.actionType,
            actionJson: newRule.actionJson || null,
            errorMessage: newRule.errorMessage || null,
            severity: newRule.severity,
            trigger: newRule.trigger,
            scope: newRule.scope,
          }),
        });
      } catch {
        // Local state already updated
      }
    }
  };

  // Delete rule
  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    setRules(prev => prev.filter(r => r.id !== ruleId));

    if (token && !ruleId.startsWith('sample-')) {
      try {
        await fetch('/api/business-rules', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: ruleId }),
        });
      } catch {
        // Already removed locally
      }
    }
  };

  // Test rule
  const handleTestRule = (ruleId: string) => {
    setTestRuleId(ruleId);
    setTestInput('{\n  "name": "Sample Product",\n  "price": 29.99,\n  "category": "Shoes",\n  "brand": "Nike",\n  "sku": "SHOE-001",\n  "email": "test@example.com"\n}');
    setTestResult(null);
    setTestRuleOpen(true);
  };

  const runTest = () => {
    try {
      const data = JSON.parse(testInput);
      const rule = rules.find(r => r.id === testRuleId);
      if (!rule) {
        setTestResult({ passed: false, message: 'Rule not found' });
        return;
      }

      const cond = parseConditionJson(rule.conditionJson);
      if (!cond) {
        setTestResult({ passed: false, message: 'Invalid condition configuration' });
        return;
      }

      let passed = false;
      let message = '';

      switch (rule.conditionType) {
        case 'COMPLETENESS': {
          const field = cond.field as string;
          const value = data[field];
          passed = value !== undefined && value !== null && value !== '';
          message = passed ? `✓ Field "${field}" is populated` : `✗ Field "${field}" is empty or missing`;
          break;
        }
        case 'RANGE': {
          const field = cond.field as string;
          const value = Number(data[field]);
          const min = cond.min as number;
          passed = value > min;
          message = passed ? `✓ ${field} (${value}) is greater than ${min}` : `✗ ${field} (${value}) is not greater than ${min}`;
          break;
        }
        case 'PATTERN': {
          const field = cond.field as string;
          const pattern = cond.pattern as string;
          const value = String(data[field] || '');
          const regex = new RegExp(pattern, (cond.flags as string) || '');
          passed = regex.test(value);
          message = passed ? `✓ "${value}" matches pattern` : `✗ "${value}" does not match pattern ${pattern}`;
          break;
        }
        case 'UNIQUENESS': {
          passed = true; // Simulated - would check against DB
          message = '✓ Uniqueness check simulated (would verify against database in production)';
          break;
        }
        case 'LOV_CROSS': {
          passed = true; // Simulated
          message = '✓ LOV cross-validation simulated (would verify against lookup tables in production)';
          break;
        }
        case 'REQUIRED_IF': {
          const conditionField = cond.conditionField as string;
          const conditionValue = cond.conditionValue as string;
          const requiredField = cond.requiredField as string;
          if (String(data[conditionField]) === conditionValue) {
            passed = !!data[requiredField];
            message = passed
              ? `✓ "${requiredField}" is populated when ${conditionField}="${conditionValue}"`
              : `✗ "${requiredField}" is required when ${conditionField}="${conditionValue}" but is empty`;
          } else {
            passed = true;
            message = `— Condition not met (${conditionField}≠"${conditionValue}"), rule not applicable`;
          }
          break;
        }
        case 'CROSS_FIELD': {
          const field1 = cond.field1 as string;
          const value1 = cond.value1 as string;
          passed = String(data[field1]) !== value1;
          message = passed
            ? `✓ ${field1} does not equal "${value1}"`
            : `✗ ${field1} equals "${value1}", rule condition met`;
          break;
        }
        default: {
          passed = true;
          message = '— Scripted conditions cannot be tested in the UI';
        }
      }

      // Apply severity logic
      if (!passed && rule.severity === 'ERROR') {
        message += '\n\n⛔ This rule would BLOCK the operation.';
      } else if (!passed && rule.severity === 'WARNING') {
        message += '\n\n⚠️ This rule would show a WARNING (proceed allowed).';
      } else if (!passed && rule.severity === 'INFO') {
        message += '\n\nℹ️ This rule would show an INFO notice.';
      }

      setTestResult({ passed, message });
    } catch {
      setTestResult({ passed: false, message: 'Invalid JSON input. Please check your test data format.' });
    }
  };

  // Get default condition type based on rule type
  const getDefaultConditionType = (rt: RuleType): ConditionType => {
    if (rt === 'CONDITION') return 'COMPLETENESS';
    if (rt === 'ACTION') return 'COMPLETENESS';
    return 'SCRIPTED';
  };

  // Get default action type based on rule type
  const getDefaultActionType = (rt: RuleType): ActionType => {
    if (rt === 'CONDITION') return 'BLOCK';
    if (rt === 'ACTION') return 'SET_VALUE';
    return 'SET_VALUE';
  };

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Scale className="w-6 h-6 text-muted-foreground" />
              Business Rules
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Stibo-aligned rule engine — Conditions, Actions & Functions for data governance
            </p>
          </div>
          <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Create Rule
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Rules', value: totalRules, icon: Scale, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900/30' },
            { label: 'Active', value: activeRules, icon: Play, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
            { label: 'Conditions', value: conditionCount, icon: Shield, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30' },
            { label: 'Actions', value: actionCount, icon: Zap, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30' },
            { label: 'Errors', value: errorCount, icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' },
            { label: 'Warnings', value: warningCount, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
          ].map((card, i) => (
            <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', card.bg)}>
                    <card.icon className={cn('w-4 h-4', card.color)} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
                    <p className="text-xl font-bold">{card.value}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Rule Type Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <TabsList className="grid w-full sm:w-auto grid-cols-3">
              <TabsTrigger value="CONDITION" className="gap-2 text-xs sm:text-sm">
                <Shield className="w-4 h-4" />
                Conditions
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px]">{conditionCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ACTION" className="gap-2 text-xs sm:text-sm">
                <Zap className="w-4 h-4" />
                Actions
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px]">{actionCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="FUNCTION" className="gap-2 text-xs sm:text-sm">
                <Code className="w-4 h-4" />
                Functions
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px]">{functionCount}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Search & Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search rules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="ERROR">Error</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTrigger} onValueChange={setFilterTrigger}>
                <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Trigger" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Triggers</SelectItem>
                  <SelectItem value="SAVE">On Save</SelectItem>
                  <SelectItem value="APPROVE">On Approve</SelectItem>
                  <SelectItem value="IMPORT">On Import</SelectItem>
                  <SelectItem value="TRANSITION">On Transition</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tab Contents */}
          {(['CONDITION', 'ACTION', 'FUNCTION'] as RuleType[]).map(tabType => (
            <TabsContent key={tabType} value={tabType} className="space-y-3 mt-4">
              <AnimatePresence mode="popLayout">
                {filteredRules.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Card>
                      <CardContent className="p-8 text-center">
                        {(() => {
                          const Icon = ruleTypeConfig[tabType].icon;
                          return <Icon className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />;
                        })()}
                        <p className="text-sm text-muted-foreground">
                          No {ruleTypeConfig[tabType].label.toLowerCase()} rules found.
                          {searchQuery || filterSeverity !== 'all' || filterTrigger !== 'all' ? ' Try adjusting your filters.' : ''}
                        </p>
                        <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => setCreateOpen(true)}>
                          <Plus className="w-4 h-4" /> Create {ruleTypeConfig[tabType].label}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : (
                  filteredRules.map((rule, idx) => {
                    const rtConf = ruleTypeConfig[rule.ruleType];
                    const ctConf = conditionTypeConfig[rule.conditionType];
                    const atConf = actionTypeConfig[rule.actionType];
                    const sevConf = severityConfig[rule.severity];
                    const trigConf = triggerConfig[rule.trigger];
                    const scopeConf = scopeConfig[rule.scope];
                    const condParsed = parseConditionJson(rule.conditionJson);
                    const actionParsed = parseActionJson(rule.actionJson);
                    const isExpanded = expandedCards.has(rule.id);

                    return (
                      <motion.div
                        key={rule.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: idx * 0.03 }}
                        layout
                      >
                        <Card className={cn(
                          'transition-all duration-200 hover:shadow-md',
                          !rule.isActive && 'opacity-60',
                          rule.severity === 'ERROR' && 'border-l-4 border-l-red-500',
                          rule.severity === 'WARNING' && 'border-l-4 border-l-amber-500',
                          rule.severity === 'INFO' && 'border-l-4 border-l-sky-500',
                        )}>
                          <CardContent className="p-4">
                            {/* Rule Header Row */}
                            <div className="flex items-start gap-3">
                              <Switch
                                checked={rule.isActive}
                                onCheckedChange={() => toggleRule(rule.id)}
                                className="mt-1 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h3 className="font-semibold text-sm truncate cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" onClick={() => setSelectedRule(rule)}>
                                    {rule.name}
                                  </h3>
                                  <SeverityBadge severity={rule.severity} />
                                  <Badge className={cn('text-[10px] border-0 gap-1', ctConf.color)}>
                                    <ctConf.icon className="w-3 h-3" />
                                    {ctConf.label}
                                  </Badge>
                                  {rule.ruleType === 'ACTION' && (
                                    <Badge className={cn('text-[10px] border-0 gap-1', atConf.color)}>
                                      <atConf.icon className="w-3 h-3" />
                                      {atConf.label}
                                    </Badge>
                                  )}
                                  <Badge className={cn('text-[10px] border-0', trigConf.color)}>
                                    {trigConf.label}
                                  </Badge>
                                  <Badge className={cn('text-[10px] border-0', scopeConf.color)}>
                                    {scopeConf.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{rule.description}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleTestRule(rule.id)}>
                                      <FlaskConical className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Test Rule</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedRule(rule)}>
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View Details</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleCard(rule.id)}>
                                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{isExpanded ? 'Collapse' : 'Expand'}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteRule(rule.id)}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete Rule</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>

                            {/* Expanded Details */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-3 pt-3 border-t space-y-3">
                                    {/* Condition Configuration */}
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <Shield className="w-3 h-3" /> Condition Configuration
                                      </p>
                                      <div className="bg-muted/40 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                                        {condParsed ? (
                                          <pre className="whitespace-pre-wrap">{JSON.stringify(condParsed, null, 2)}</pre>
                                        ) : (
                                          <span className="text-muted-foreground">No condition configuration</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Action Configuration */}
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <Zap className="w-3 h-3" /> Action Configuration
                                      </p>
                                      <div className="bg-muted/40 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                                        {actionParsed ? (
                                          <pre className="whitespace-pre-wrap">{JSON.stringify(actionParsed, null, 2)}</pre>
                                        ) : (
                                          <span className="text-muted-foreground">{rule.ruleType === 'CONDITION' ? 'Default action: ' + actionTypeConfig[rule.actionType].label : 'No action configuration'}</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Error Message */}
                                    {rule.errorMessage && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                          <AlertOctagon className="w-3 h-3" /> Error Message
                                        </p>
                                        <div className={cn(
                                          'rounded-lg p-3 text-xs',
                                          rule.severity === 'ERROR' ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' :
                                          rule.severity === 'WARNING' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' :
                                          'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300'
                                        )}>
                                          {rule.errorMessage}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </TabsContent>
          ))}
        </Tabs>

        {/* Rule Detail Dialog */}
        <Dialog open={!!selectedRule} onOpenChange={(open) => !open && setSelectedRule(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            {selectedRule && (() => {
              const rtConf = ruleTypeConfig[selectedRule.ruleType];
              const ctConf = conditionTypeConfig[selectedRule.conditionType];
              const atConf = actionTypeConfig[selectedRule.actionType];
              const trigConf = triggerConfig[selectedRule.trigger];
              const scopeConf = scopeConfig[selectedRule.scope];
              const condParsed = parseConditionJson(selectedRule.conditionJson);
              const actionParsed = parseActionJson(selectedRule.actionJson);

              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <rtConf.icon className="w-5 h-5 text-muted-foreground" />
                      {selectedRule.name}
                    </DialogTitle>
                    <DialogDescription>{selectedRule.description}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Type & Config Badges */}
                    <div className="flex flex-wrap gap-2">
                      <Badge className={cn('gap-1', rtConf.color)}><rtConf.icon className="w-3 h-3" />{rtConf.label}</Badge>
                      <Badge className={cn('gap-1', ctConf.color)}><ctConf.icon className="w-3 h-3" />{ctConf.label}</Badge>
                      <Badge className={cn('gap-1', atConf.color)}><atConf.icon className="w-3 h-3" />{atConf.label}</Badge>
                      <SeverityBadge severity={selectedRule.severity} />
                      <Badge className={cn('', trigConf.color)}>{trigConf.label}</Badge>
                      <Badge className={cn('', scopeConf.color)}>{scopeConf.label}</Badge>
                      <Badge className={cn('', selectedRule.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300')}>
                        {selectedRule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <Separator />

                    {/* Condition JSON */}
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1"><Shield className="w-4 h-4" /> Condition Configuration</p>
                      <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                        <pre className="whitespace-pre-wrap">{condParsed ? JSON.stringify(condParsed, null, 2) : selectedRule.conditionJson}</pre>
                      </div>
                    </div>

                    {/* Action JSON */}
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1"><Zap className="w-4 h-4" /> Action Configuration</p>
                      <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                        {actionParsed ? (
                          <pre className="whitespace-pre-wrap">{JSON.stringify(actionParsed, null, 2)}</pre>
                        ) : (
                          <span className="text-muted-foreground">No action configuration (default: {actionTypeConfig[selectedRule.actionType].label})</span>
                        )}
                      </div>
                    </div>

                    {/* Error Message */}
                    {selectedRule.errorMessage && (
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-1"><AlertOctagon className="w-4 h-4" /> Error Message</p>
                        <div className={cn(
                          'rounded-lg p-3 text-sm',
                          selectedRule.severity === 'ERROR' ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' :
                          selectedRule.severity === 'WARNING' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' :
                          'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300'
                        )}>
                          {selectedRule.errorMessage}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Module:</span> <span className="font-medium">{selectedRule.moduleName}</span></div>
                      <div><span className="text-muted-foreground">Scope:</span> <span className="font-medium">{scopeConf.label} — {scopeConf.description}</span></div>
                      <div><span className="text-muted-foreground">Created:</span> <span>{new Date(selectedRule.createdAt).toLocaleDateString()}</span></div>
                      <div><span className="text-muted-foreground">Updated:</span> <span>{new Date(selectedRule.updatedAt).toLocaleDateString()}</span></div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      <Button variant="outline" className="gap-2" onClick={() => { toggleRule(selectedRule.id); setSelectedRule({ ...selectedRule, isActive: !selectedRule.isActive }); }}>
                        {selectedRule.isActive ? <><Pause className="w-4 h-4" />Disable</> : <><Play className="w-4 h-4" />Enable</>}
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => { handleTestRule(selectedRule.id); setSelectedRule(null); }}>
                        <FlaskConical className="w-4 h-4" />Test Rule
                      </Button>
                      <Button variant="outline" className="gap-2 text-destructive hover:text-destructive ml-auto" onClick={() => { deleteRule(selectedRule.id); setSelectedRule(null); }}>
                        <Trash2 className="w-4 h-4" />Delete
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Create Rule Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create Business Rule
              </DialogTitle>
              <DialogDescription>Define a new Stibo-aligned validation, action, or function rule for MDM data governance.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {/* Basic Info */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rule-name">Rule Name *</Label>
                    <Input id="rule-name" placeholder="e.g., Product Name Required" value={newRule.name} onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rule-desc">Description</Label>
                    <Input id="rule-desc" placeholder="Describe what this rule validates..." value={newRule.description} onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Rule Type Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Rule Type *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CONDITION', 'ACTION', 'FUNCTION'] as RuleType[]).map(rt => {
                    const conf = ruleTypeConfig[rt];
                    return (
                      <button
                        key={rt}
                        type="button"
                        className={cn(
                          'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center',
                          newRule.ruleType === rt
                            ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                            : 'border-muted hover:border-muted-foreground/30'
                        )}
                        onClick={() => setNewRule(prev => ({
                          ...prev,
                          ruleType: rt,
                          conditionType: getDefaultConditionType(rt),
                          actionType: getDefaultActionType(rt),
                        }))}
                      >
                        <conf.icon className={cn('w-5 h-5', newRule.ruleType === rt ? 'text-red-600' : 'text-muted-foreground')} />
                        <span className="text-xs font-semibold">{conf.label}</span>
                        <span className="text-[10px] text-muted-foreground line-clamp-2">{conf.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Condition Type */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Condition Type</Label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(conditionTypeConfig).map(([key, conf]) => (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        'flex items-center gap-1.5 p-2 rounded-lg border transition-all text-xs',
                        newRule.conditionType === key
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/30 font-semibold'
                          : 'border-muted hover:border-muted-foreground/30'
                      )}
                      onClick={() => setNewRule(prev => ({ ...prev, conditionType: key as ConditionType }))}
                    >
                      <conf.icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{conf.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Type */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Action Type</Label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(actionTypeConfig).map(([key, conf]) => (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        'flex items-center gap-1.5 p-2 rounded-lg border transition-all text-xs',
                        newRule.actionType === key
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/30 font-semibold'
                          : 'border-muted hover:border-muted-foreground/30'
                      )}
                      onClick={() => setNewRule(prev => ({ ...prev, actionType: key as ActionType }))}
                    >
                      <conf.icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{conf.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Visual Condition Builder */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-1">
                    <Code2 className="w-4 h-4" /> Condition Builder
                  </Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addCondition}>
                    <Plus className="w-3 h-3" /> Add Condition
                  </Button>
                </div>
                <div className="space-y-2">
                  {newRule.conditions.map((cond, idx) => (
                    <div key={cond.id} className="flex items-center gap-2">
                      {/* Logic operator between conditions */}
                      {idx > 0 && (
                        <Select value={cond.logic} onValueChange={(v) => updateCondition(cond.id, 'logic', v)}>
                          <SelectTrigger className="w-[70px] h-8 text-xs font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AND" className="text-xs font-bold text-violet-700">AND</SelectItem>
                            <SelectItem value="OR" className="text-xs font-bold text-teal-700">OR</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {idx === 0 && <div className="w-[70px]" />}

                      <Select value={cond.field} onValueChange={(v) => updateCondition(cond.id, 'field', v)}>
                        <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Field" /></SelectTrigger>
                        <SelectContent>
                          {fields.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={cond.operator} onValueChange={(v) => updateCondition(cond.id, 'operator', v)}>
                        <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Operator" /></SelectTrigger>
                        <SelectContent>
                          {operators.map(o => <SelectItem key={o} value={o} className="text-xs">{o.replace(/_/g, ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Value"
                        value={cond.value}
                        onChange={(e) => updateCondition(cond.id, 'value', e.target.value)}
                        className="flex-1 h-8 text-xs"
                      />
                      {newRule.conditions.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeCondition(cond.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Severity, Trigger, Scope Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Severity</Label>
                  <div className="flex gap-1">
                    {(['ERROR', 'WARNING', 'INFO'] as Severity[]).map(sev => {
                      const conf = severityConfig[sev];
                      return (
                        <button
                          key={sev}
                          type="button"
                          className={cn(
                            'flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs font-semibold transition-all',
                            newRule.severity === sev
                              ? cn(conf.color, 'border-current')
                              : 'border-muted text-muted-foreground hover:border-muted-foreground/30'
                          )}
                          onClick={() => setNewRule(prev => ({ ...prev, severity: sev }))}
                        >
                          <conf.icon className="w-3 h-3" />
                          {conf.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Trigger</Label>
                  <Select value={newRule.trigger} onValueChange={(v) => setNewRule(prev => ({ ...prev, trigger: v as Trigger }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAVE">On Save</SelectItem>
                      <SelectItem value="APPROVE">On Approve</SelectItem>
                      <SelectItem value="IMPORT">On Import</SelectItem>
                      <SelectItem value="TRANSITION">On Transition</SelectItem>
                      <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Scope</Label>
                  <Select value={newRule.scope} onValueChange={(v) => setNewRule(prev => ({ ...prev, scope: v as Scope }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RECORD">Record — Single record operation</SelectItem>
                      <SelectItem value="BULK">Bulk — Batch operation</SelectItem>
                      <SelectItem value="ALL">All — Both record and bulk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Error Message */}
              <div className="space-y-1">
                <Label htmlFor="rule-error-msg">Error Message</Label>
                <Textarea
                  id="rule-error-msg"
                  placeholder="Message shown when the rule is violated..."
                  value={newRule.errorMessage}
                  onChange={(e) => setNewRule(prev => ({ ...prev, errorMessage: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white gap-2" onClick={handleCreateRule} disabled={!newRule.name.trim()}>
                <Plus className="w-4 h-4" /> Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Test Rule Dialog */}
        <Dialog open={testRuleOpen} onOpenChange={setTestRuleOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5" />
                Test Rule
              </DialogTitle>
              <DialogDescription>
                Test this rule against sample data to see if it would pass or fail.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Sample Data (JSON)</Label>
                <Textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                  placeholder='{"field": "value"}'
                />
              </div>
              <Button onClick={runTest} className="w-full gap-2">
                <Play className="w-4 h-4" /> Run Test
              </Button>
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'rounded-lg p-4 text-sm',
                    testResult.passed
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                    <span className={cn(
                      'font-semibold',
                      testResult.passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                    )}>
                      {testResult.passed ? 'Rule Passed' : 'Rule Failed'}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap text-xs font-sans">{testResult.message}</pre>
                </motion.div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
