'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Scale, Plus, Play, Pause, Trash2, Pencil, ArrowRight,
  AlertTriangle, CheckCircle2, XCircle, Mail, Zap,
  Shield, FileText, Bell, Settings2, Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types & Mock Data
// ---------------------------------------------------------------------------

type RuleType = 'CROSS_FIELD' | 'REQUIRED_IF' | 'LOV_CROSS' | 'SCRIPTED';
type RuleAction = 'BLOCK' | 'WARN' | 'SET_VALUE' | 'SEND_EMAIL';
type RuleTrigger = 'SAVE' | 'APPROVE' | 'IMPORT';

interface RuleCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface BusinessRule {
  id: string;
  name: string;
  description: string;
  type: RuleType;
  trigger: RuleTrigger;
  action: RuleAction;
  conditions: RuleCondition[];
  module: string;
  enabled: boolean;
  lastTriggered: string | null;
  triggerCount: number;
  createdBy: string;
  createdAt: string;
}

const ruleTypeConfig: Record<RuleType, { label: string; color: string; icon: React.ElementType }> = {
  CROSS_FIELD: { label: 'Cross-Field', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: FileText },
  REQUIRED_IF: { label: 'Required If', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: Shield },
  LOV_CROSS: { label: 'LOV Cross-Validation', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', icon: CheckCircle2 },
  SCRIPTED: { label: 'Scripted', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: Zap },
};

const actionConfig: Record<RuleAction, { label: string; color: string; icon: React.ElementType }> = {
  BLOCK: { label: 'Block', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: XCircle },
  WARN: { label: 'Warn', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: AlertTriangle },
  SET_VALUE: { label: 'Set Value', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', icon: Settings2 },
  SEND_EMAIL: { label: 'Send Email', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: Mail },
};

const triggerConfig: Record<RuleTrigger, { label: string; color: string }> = {
  SAVE: { label: 'On Save', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  APPROVE: { label: 'On Approve', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  IMPORT: { label: 'On Import', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
};

const businessRules: BusinessRule[] = [
  {
    id: 'BR-001', name: 'Brand Required for Active Articles', description: 'All active Article Master records must have a brand value populated.',
    type: 'REQUIRED_IF', trigger: 'SAVE', action: 'BLOCK',
    conditions: [{ id: 'c1', field: 'status', operator: 'equals', value: 'ACTIVE' }, { id: 'c2', field: 'brand', operator: 'is_empty', value: '' }],
    module: 'Article Master', enabled: true, lastTriggered: '2025-01-15T08:30:00Z', triggerCount: 47, createdBy: 'admin', createdAt: '2024-12-01',
  },
  {
    id: 'BR-002', name: 'Price Consistency Check', description: 'Wholesale price must be lower than regular price for the same article.',
    type: 'CROSS_FIELD', trigger: 'SAVE', action: 'BLOCK',
    conditions: [{ id: 'c3', field: 'wholesalePrice', operator: 'greater_than', value: 'regularPrice' }],
    module: 'Pricing Master', enabled: true, lastTriggered: '2025-01-14T14:20:00Z', triggerCount: 12, createdBy: 'admin', createdAt: '2024-12-05',
  },
  {
    id: 'BR-003', name: 'Category-SubCategory LOV Validation', description: 'Sub-category must belong to the parent category in the lookup table.',
    type: 'LOV_CROSS', trigger: 'SAVE', action: 'BLOCK',
    conditions: [{ id: 'c4', field: 'subCategory', operator: 'not_in_lov', value: 'category' }],
    module: 'Article Master', enabled: true, lastTriggered: '2025-01-13T11:00:00Z', triggerCount: 8, createdBy: 'admin', createdAt: '2024-12-10',
  },
  {
    id: 'BR-004', name: 'Supplier Tax ID Format', description: 'Validate Indonesian NPWP format for supplier tax identification numbers.',
    type: 'SCRIPTED', trigger: 'IMPORT', action: 'WARN',
    conditions: [{ id: 'c5', field: 'taxId', operator: 'not_matches', value: '^\\d{2}\\.\\d{3}\\.\\d{3}\\.\\d{1}-\\d{3}\\.\\d{3}$' }],
    module: 'Supplier Master', enabled: true, lastTriggered: '2025-01-12T09:15:00Z', triggerCount: 3, createdBy: 'admin', createdAt: '2024-12-15',
  },
  {
    id: 'BR-005', name: 'Promotion Date Logic', description: 'Promotion end date must be after start date.',
    type: 'CROSS_FIELD', trigger: 'SAVE', action: 'BLOCK',
    conditions: [{ id: 'c6', field: 'endDate', operator: 'before_or_equal', value: 'startDate' }],
    module: 'Promotion Master', enabled: true, lastTriggered: '2025-01-11T16:30:00Z', triggerCount: 5, createdBy: 'admin', createdAt: '2024-12-20',
  },
  {
    id: 'BR-006', name: 'Low Quality Alert', description: 'Send email notification when a module quality score drops below 70%.',
    type: 'SCRIPTED', trigger: 'IMPORT', action: 'SEND_EMAIL',
    conditions: [{ id: 'c7', field: 'qualityScore', operator: 'less_than', value: '70' }],
    module: 'All Modules', enabled: false, lastTriggered: null, triggerCount: 0, createdBy: 'admin', createdAt: '2025-01-05',
  },
  {
    id: 'BR-007', name: 'Auto-set Draft Status', description: 'New imported records are automatically set to DRAFT status.',
    type: 'REQUIRED_IF', trigger: 'IMPORT', action: 'SET_VALUE',
    conditions: [{ id: 'c8', field: 'status', operator: 'is_empty', value: '' }],
    module: 'All Modules', enabled: true, lastTriggered: '2025-01-15T07:00:00Z', triggerCount: 156, createdBy: 'admin', createdAt: '2025-01-01',
  },
];

const operators = ['equals', 'not_equals', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'contains', 'not_contains', 'matches', 'not_matches', 'in', 'not_in_lov', 'before', 'after', 'before_or_equal'];
const fields = ['status', 'brand', 'price', 'regularPrice', 'wholesalePrice', 'category', 'subCategory', 'taxId', 'startDate', 'endDate', 'qualityScore', 'name', 'sku', 'address'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BusinessRulesPage() {
  const [rules, setRules] = useState<BusinessRule[]>(businessRules);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<BusinessRule | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterTrigger, setFilterTrigger] = useState<string>('all');

  // Create rule form state
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    type: 'CROSS_FIELD' as RuleType,
    trigger: 'SAVE' as RuleTrigger,
    action: 'BLOCK' as RuleAction,
    module: 'Article Master',
    conditions: [{ id: 'nc1', field: 'status', operator: 'equals', value: '' }] as RuleCondition[],
  });

  const filteredRules = rules.filter(rule => {
    const matchesSearch = !searchQuery ||
      rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || rule.type === filterType;
    const matchesTrigger = filterTrigger === 'all' || rule.trigger === filterTrigger;
    return matchesSearch && matchesType && matchesTrigger;
  });

  const enabledCount = rules.filter(r => r.enabled).length;
  const totalTriggers = rules.reduce((sum, r) => sum + r.triggerCount, 0);

  const toggleRule = (ruleId: string) => {
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
  };

  const addCondition = () => {
    setNewRule(prev => ({
      ...prev,
      conditions: [...prev.conditions, { id: `nc${Date.now()}`, field: 'status', operator: 'equals', value: '' }],
    }));
  };

  const removeCondition = (condId: string) => {
    setNewRule(prev => ({
      ...prev,
      conditions: prev.conditions.filter(c => c.id !== condId),
    }));
  };

  const updateCondition = (condId: string, key: keyof RuleCondition, val: string) => {
    setNewRule(prev => ({
      ...prev,
      conditions: prev.conditions.map(c => c.id === condId ? { ...c, [key]: val } : c),
    }));
  };

  const handleCreateRule = () => {
    const rule: BusinessRule = {
      id: `BR-${String(rules.length + 1).padStart(3, '0')}`,
      name: newRule.name,
      description: newRule.description,
      type: newRule.type,
      trigger: newRule.trigger,
      action: newRule.action,
      conditions: newRule.conditions,
      module: newRule.module,
      enabled: true,
      lastTriggered: null,
      triggerCount: 0,
      createdBy: 'admin',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setRules(prev => [...prev, rule]);
    setCreateOpen(false);
    setNewRule({
      name: '', description: '', type: 'CROSS_FIELD', trigger: 'SAVE', action: 'BLOCK',
      module: 'Article Master', conditions: [{ id: 'nc1', field: 'status', operator: 'equals', value: '' }],
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure validation rules, cross-field checks, and automated governance actions.
          </p>
        </div>
        <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Create Rule
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Rules', value: rules.length, icon: Scale, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900/30' },
          { label: 'Active Rules', value: enabledCount, icon: Play, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Total Triggers', value: totalTriggers, icon: Zap, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
        ].map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', card.bg)}>
                  <card.icon className={cn('w-5 h-5', card.color)} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search rules by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Rule Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="CROSS_FIELD">Cross-Field</SelectItem>
            <SelectItem value="REQUIRED_IF">Required If</SelectItem>
            <SelectItem value="LOV_CROSS">LOV Cross</SelectItem>
            <SelectItem value="SCRIPTED">Scripted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTrigger} onValueChange={setFilterTrigger}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trigger" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Triggers</SelectItem>
            <SelectItem value="SAVE">On Save</SelectItem>
            <SelectItem value="APPROVE">On Approve</SelectItem>
            <SelectItem value="IMPORT">On Import</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Rules Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Enabled</TableHead>
                  <TableHead>Rule Name</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Trigger</TableHead>
                  <TableHead className="hidden lg:table-cell">Action</TableHead>
                  <TableHead className="hidden md:table-cell">Module</TableHead>
                  <TableHead className="hidden lg:table-cell">Fired</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map((rule) => {
                    const typeConf = ruleTypeConfig[rule.type];
                    const actionConf = actionConfig[rule.action];
                    const triggerConf = triggerConfig[rule.trigger];
                    return (
                      <TableRow key={rule.id} className={cn(!rule.enabled && 'opacity-50')}>
                        <TableCell>
                          <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} />
                        </TableCell>
                        <TableCell>
                          <div className="cursor-pointer" onClick={() => setSelectedRule(rule)}>
                            <p className="font-medium text-sm hover:text-red-600 dark:hover:text-red-400 transition-colors">{rule.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1 max-w-[240px]">{rule.description}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge className={cn('text-[10px] border-0 gap-1', typeConf.color)}>
                            <typeConf.icon className="w-3 h-3" />
                            {typeConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge className={cn('text-[10px] border-0', triggerConf.color)}>{triggerConf.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge className={cn('text-[10px] border-0 gap-1', actionConf.color)}>
                            <actionConf.icon className="w-3 h-3" />
                            {actionConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{rule.module}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{rule.triggerCount}×</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedRule(rule)}>
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Rule Detail Dialog */}
      <Dialog open={!!selectedRule} onOpenChange={(open) => !open && setSelectedRule(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-muted-foreground" />
              {selectedRule?.name}
            </DialogTitle>
            <DialogDescription>{selectedRule?.description}</DialogDescription>
          </DialogHeader>
          {selectedRule && (() => {
            const typeConf = ruleTypeConfig[selectedRule.type];
            const actionConf = actionConfig[selectedRule.action];
            const triggerConf = triggerConfig[selectedRule.trigger];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Rule ID:</span> <span className="font-mono">{selectedRule.id}</span></div>
                  <div><span className="text-muted-foreground">Type:</span> <Badge className={cn('text-xs border-0', typeConf.color)}>{typeConf.label}</Badge></div>
                  <div><span className="text-muted-foreground">Trigger:</span> <Badge className={cn('text-xs border-0', triggerConf.color)}>{triggerConf.label}</Badge></div>
                  <div><span className="text-muted-foreground">Action:</span> <Badge className={cn('text-xs border-0', actionConf.color)}>{actionConf.label}</Badge></div>
                  <div><span className="text-muted-foreground">Module:</span> <span>{selectedRule.module}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={cn('text-xs border-0', selectedRule.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300')}>{selectedRule.enabled ? 'Enabled' : 'Disabled'}</Badge></div>
                  <div><span className="text-muted-foreground">Created:</span> <span>{selectedRule.createdAt}</span></div>
                  <div><span className="text-muted-foreground">Last Triggered:</span> <span>{selectedRule.lastTriggered ? new Date(selectedRule.lastTriggered).toLocaleDateString() : 'Never'}</span></div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium mb-2">Conditions</p>
                  <div className="space-y-2">
                    {selectedRule.conditions.map((cond) => (
                      <div key={cond.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                        <Badge variant="outline" className="text-xs font-mono">{cond.field}</Badge>
                        <span className="text-muted-foreground text-xs">{cond.operator.replace(/_/g, ' ')}</span>
                        {cond.value && <Badge variant="outline" className="text-xs font-mono">{cond.value}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" className="gap-2">
                    <Pencil className="w-4 h-4" />
                    Edit Rule
                  </Button>
                  <Button variant="outline" onClick={() => { toggleRule(selectedRule.id); setSelectedRule({ ...selectedRule, enabled: !selectedRule.enabled }); }}>
                    {selectedRule.enabled ? (
                      <><Pause className="w-4 h-4 mr-2" />Disable</>
                    ) : (
                      <><Play className="w-4 h-4 mr-2" />Enable</>
                    )}
                  </Button>
                  <Button variant="outline" className="gap-2 text-destructive hover:text-destructive ml-auto">
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Create Rule Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create Business Rule
            </DialogTitle>
            <DialogDescription>Define a new validation or governance rule for your MDM data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input id="rule-name" placeholder="e.g., Brand Required for Active Articles" value={newRule.name} onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-desc">Description</Label>
                <Textarea id="rule-desc" placeholder="Describe what this rule validates and why..." value={newRule.description} onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))} rows={2} />
              </div>
            </div>

            {/* Rule Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Rule Type</Label>
                <Select value={newRule.type} onValueChange={(v) => setNewRule(prev => ({ ...prev, type: v as RuleType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CROSS_FIELD">Cross-Field</SelectItem>
                    <SelectItem value="REQUIRED_IF">Required If</SelectItem>
                    <SelectItem value="LOV_CROSS">LOV Cross-Validation</SelectItem>
                    <SelectItem value="SCRIPTED">Scripted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Trigger Point</Label>
                <Select value={newRule.trigger} onValueChange={(v) => setNewRule(prev => ({ ...prev, trigger: v as RuleTrigger }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAVE">On Save</SelectItem>
                    <SelectItem value="APPROVE">On Approve</SelectItem>
                    <SelectItem value="IMPORT">On Import</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Action</Label>
                <Select value={newRule.action} onValueChange={(v) => setNewRule(prev => ({ ...prev, action: v as RuleAction }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BLOCK">Block</SelectItem>
                    <SelectItem value="WARN">Warn</SelectItem>
                    <SelectItem value="SET_VALUE">Set Value</SelectItem>
                    <SelectItem value="SEND_EMAIL">Send Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Target Module</Label>
              <Select value={newRule.module} onValueChange={(v) => setNewRule(prev => ({ ...prev, module: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Article Master">Article Master</SelectItem>
                  <SelectItem value="Store Master">Store Master</SelectItem>
                  <SelectItem value="Supplier Master">Supplier Master</SelectItem>
                  <SelectItem value="Pricing Master">Pricing Master</SelectItem>
                  <SelectItem value="Promotion Master">Promotion Master</SelectItem>
                  <SelectItem value="All Modules">All Modules</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditions Builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addCondition}>
                  <Plus className="w-3 h-3" /> Add Condition
                </Button>
              </div>
              <div className="space-y-2">
                {newRule.conditions.map((cond) => (
                  <div key={cond.id} className="flex items-center gap-2">
                    <Select value={cond.field} onValueChange={(v) => updateCondition(cond.id, 'field', v)}>
                      <SelectTrigger className="w-[140px]"><SelectValue placeholder="Field" /></SelectTrigger>
                      <SelectContent>
                        {fields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={cond.operator} onValueChange={(v) => updateCondition(cond.id, 'operator', v)}>
                      <SelectTrigger className="w-[140px]"><SelectValue placeholder="Operator" /></SelectTrigger>
                      <SelectContent>
                        {operators.map(o => <SelectItem key={o} value={o}>{o.replace(/_/g, ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Value"
                      value={cond.value}
                      onChange={(e) => updateCondition(cond.id, 'value', e.target.value)}
                      className="flex-1"
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCreateRule} disabled={!newRule.name.trim()}>
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
