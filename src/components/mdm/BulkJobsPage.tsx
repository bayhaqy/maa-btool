'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { parsePayload } from '@/lib/parse-payload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Zap,
  Plus,
  Trash2,
  Eye,
  RefreshCw,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  evaluateAdvancedFilters,
  type AdvancedFilter as SharedAdvancedFilter,
  type FilterableField as SharedFilterableField,
} from '@/lib/advanced-filter';

// ============================================================================
// Types
// ============================================================================

type OperationType =
  | 'SET_VALUE'
  | 'CLEAR'
  | 'MERGE'
  | 'SET_NAME'
  | 'SET_STATUS'
  | 'RUN_RULE';

interface BulkOperation {
  operation: OperationType;
  fieldCode?: string;
  value?: string;
  config?: Record<string, unknown>;
}

type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal';

type FilterConnector = 'AND' | 'OR';

interface AdvancedFilter {
  id: string;
  fieldCode: string;
  operator: FilterOperator;
  value: string;
  connector: FilterConnector;
}

interface ModuleInfo {
  id: string;
  moduleCode: string;
  moduleName: string;
}

interface FieldInfo {
  id: string;
  fieldCode: string;
  fieldName: string;
  dataType: string;
}

interface BulkJob {
  id: string;
  name: string | null;
  status: string;
  mode: string;
  totalRecords: number;
  okRecords: number;
  failedRecords: number;
  results: string | null;
  errorLog: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  module: { id: string; moduleCode: string; moduleName: string };
  user: { id: string; username: string; displayName: string | null };
}

interface RowResult {
  recordId: string;
  ok: boolean;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  error?: string;
  amendment?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const OPERATION_LABELS: Record<OperationType, string> = {
  SET_VALUE: 'Set Value',
  CLEAR: 'Clear Field',
  MERGE: 'Merge (append)',
  SET_NAME: 'Set Name',
  SET_STATUS: 'Set Status',
  RUN_RULE: 'Run Business Rule',
};

const OPERATIONS_NEEDING_FIELD: OperationType[] = [
  'SET_VALUE',
  'CLEAR',
  'MERGE',
];

const OPERATIONS_NEEDING_VALUE: OperationType[] = [
  'SET_VALUE',
  'MERGE',
  'SET_NAME',
  'SET_STATUS',
];

const STATUS_BADGE: Record<string, string> = {
  QUEUED: 'bg-gray-100 text-gray-700 border-gray-300',
  PREVIEWING: 'bg-amber-50 text-amber-700 border-amber-300',
  RUNNING: 'bg-sky-50 text-sky-700 border-sky-300',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  FAILED: 'bg-red-50 text-red-700 border-red-300',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-300',
};

const MODE_BADGE: Record<string, string> = {
  PREVIEW: 'bg-blue-50 text-blue-700 border-blue-300',
  PREFLIGHT: 'bg-amber-50 text-amber-700 border-amber-300',
  APPLY: 'bg-red-50 text-red-700 border-red-300',
};

const OPERATORS_FOR_TEXT: FilterOperator[] = [
  'contains',
  'equals',
  'not_equals',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
];
const OPERATORS_FOR_NUMBER: FilterOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'greater_or_equal',
  'less_or_equal',
  'is_empty',
  'is_not_empty',
];

function operatorsForDataType(dt: string): FilterOperator[] {
  if (['NUMBER', 'DATE'].includes(dt)) return OPERATORS_FOR_NUMBER;
  if (['SELECT', 'MULTISELECT', 'LOOKUP'].includes(dt)) {
    return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
  }
  if (dt === 'BOOLEAN') return ['equals'];
  return OPERATORS_FOR_TEXT;
}

function formatOperator(op: FilterOperator): string {
  const map: Record<FilterOperator, string> = {
    contains: 'contains',
    equals: 'equals',
    not_equals: 'not equals',
    starts_with: 'starts with',
    ends_with: 'ends with',
    is_empty: 'is empty',
    is_not_empty: 'is not empty',
    greater_than: 'greater than',
    less_than: 'less than',
    greater_or_equal: '≥ (greater or equal)',
    less_or_equal: '≤ (less or equal)',
  };
  return map[op] || op;
}

function operatorNeedsValue(op: FilterOperator): boolean {
  return !['is_empty', 'is_not_empty'].includes(op);
}

const VALID_STATUS_VALUES = ['DRAFT', 'IN_REVIEW', 'ACTIVE', 'ARCHIVED'];

// ============================================================================
// Main page
// ============================================================================

export default function BulkJobsPage() {
  const { token } = useAppStore();
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resultsJob, setResultsJob] = useState<BulkJob | null>(null);

  const loadJobs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bulk-update', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load jobs');
      setJobs(data.jobs || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleRerun = async (job: BulkJob) => {
    if (!token) return;
    try {
      const res = await fetch('/api/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          moduleId: job.module.id,
          name: `${job.name || 'Bulk Update'} (re-run)`,
          targetFilter: JSON.parse(job.results || '[]'),
          operations: [],
          mode: job.mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to re-run');
      toast.success('Re-run job created');
      loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-run failed');
    }
  };

  const handleDelete = async (job: BulkJob) => {
    if (!token) return;
    if (!confirm(`Delete bulk job "${job.name || job.id}"?`)) return;
    try {
      // The bulk-update API doesn't expose DELETE yet — use direct DB-via-API
      // hook only if available. For MVP, we simply remove it from the list
      // locally and surface a notice (the DELETE endpoint is intentionally
      // out of scope for Task 24-C; the route.ts only ships GET/POST).
      toast.info('Delete endpoint not implemented for bulk jobs (Task 24-C scope: GET + POST only).');
      void job;
    } catch (err) {
      toast.error('Failed to delete job');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-red-600" />
            Bulk Update Jobs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wizard-driven bulk edits with Preview, Pre-flight, and Apply modes.
            ACTIVE records follow the amendment workflow (REVISION_PENDING + ApprovalTicket).
          </p>
        </div>
        <Button
          onClick={() => setWizardOpen(true)}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          New Bulk Update
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Total Jobs</p>
            <p className="text-2xl font-bold mt-1">{jobs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Completed</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">
              {jobs.filter((j) => j.status === 'COMPLETED').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Running</p>
            <p className="text-2xl font-bold mt-1 text-sky-600">
              {jobs.filter((j) => ['RUNNING', 'PREVIEWING', 'QUEUED'].includes(j.status)).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Failed</p>
            <p className="text-2xl font-bold mt-1 text-red-600">
              {jobs.filter((j) => j.status === 'FAILED').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Jobs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Filter className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No bulk update jobs yet</p>
              <p className="text-sm mt-1">Click "New Bulk Update" to start.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total / OK / Failed</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        {job.name || <span className="text-muted-italic">Untitled</span>}
                        <div className="text-xs text-muted-foreground">
                          by {job.user.displayName || job.user.username}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{job.module.moduleCode}</div>
                        <div className="text-xs text-muted-foreground">
                          {job.module.moduleName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', MODE_BADGE[job.mode] || '')}
                        >
                          {job.mode}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', STATUS_BADGE[job.status] || '')}
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span className="font-semibold">{job.totalRecords}</span>
                        {' / '}
                        <span className="text-emerald-600">{job.okRecords}</span>
                        {' / '}
                        <span className="text-red-600">{job.failedRecords}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setResultsJob(job)}
                            aria-label="View results"
                            title="View Results"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => handleRerun(job)}
                            aria-label="Re-run"
                            title="Re-run"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(job)}
                            aria-label="Delete"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wizard */}
      <BulkUpdateWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => {
          setWizardOpen(false);
          loadJobs();
        }}
      />

      {/* Results dialog */}
      <ResultsDialog job={resultsJob} onClose={() => setResultsJob(null)} />
    </div>
  );
}

// ============================================================================
// Bulk Update Wizard
// ============================================================================

interface WizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

type WizardStep = 'target' | 'operations' | 'mode' | 'review';

function BulkUpdateWizard({ open, onOpenChange, onCreated }: WizardProps) {
  const { token } = useAppStore();
  const [step, setStep] = useState<WizardStep>('target');
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [name, setName] = useState('');
  const [filters, setFilters] = useState<AdvancedFilter[]>([]);
  const [operations, setOperations] = useState<BulkOperation[]>([
    { operation: 'SET_VALUE', fieldCode: '', value: '' },
  ]);
  const [mode, setMode] = useState<'PREVIEW' | 'PREFLIGHT' | 'APPLY'>('PREVIEW');
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load modules on open
  useEffect(() => {
    if (!open || !token) return;
    setStep('target');
    setModuleId('');
    setFields([]);
    setFilters([]);
    setOperations([{ operation: 'SET_VALUE', fieldCode: '', value: '' }]);
    setMode('PREVIEW');
    setMatchedCount(null);
    setName('');
    (async () => {
      try {
        const res = await fetch('/api/modules', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setModules(data.modules || []);
      } catch {
        toast.error('Failed to load modules');
      }
    })();
  }, [open, token]);

  // Load fields when module changes
  useEffect(() => {
    if (!moduleId || !token) return;
    setFields([]);
    setMatchedCount(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/fields?moduleId=${moduleId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setFields(data.fields || []);
      } catch {
        toast.error('Failed to load fields');
      }
    })();
  }, [moduleId, token]);

  // Count matched records whenever filters/module change
  const computeMatchedCount = useCallback(async () => {
    if (!moduleId || !token) {
      setMatchedCount(null);
      return;
    }
    setCounting(true);
    try {
      // Reuse the records API — load all non-archived records for the module
      // and apply the filter client-side. This is consistent with the
      // server-side filterRecords() used in /api/bulk-update.
      const res = await fetch(
        `/api/records?moduleId=${moduleId}&limit=1000`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const records: Array<{ currentPayload: string }> = data.data || [];
      const matched = applyFiltersClient(records, filters, fields);
      setMatchedCount(matched.length);
    } catch {
      setMatchedCount(null);
    } finally {
      setCounting(false);
    }
  }, [moduleId, filters, fields, token]);

  useEffect(() => {
    if (moduleId) computeMatchedCount();
  }, [moduleId, filters, fields, computeMatchedCount]);

  const canProceed = useMemo(() => {
    if (step === 'target') return !!moduleId;
    if (step === 'operations')
      return operations.every(
        (op) =>
          op.operation &&
          (!OPERATIONS_NEEDING_FIELD.includes(op.operation) || op.fieldCode) &&
          (!OPERATIONS_NEEDING_VALUE.includes(op.operation) ||
            op.value !== undefined)
      );
    if (step === 'mode') return !!mode;
    return true;
  }, [step, moduleId, operations, mode]);

  const handleSubmit = async () => {
    if (!token || !moduleId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          moduleId,
          name: name || undefined,
          targetFilter: filters,
          operations: operations.map((op) => ({
            operation: op.operation,
            fieldCode: op.fieldCode || undefined,
            value: op.value ?? '',
          })),
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create bulk update');
      const okCount = data.results?.filter((r: RowResult) => r.ok).length ?? 0;
      const failedCount = data.results?.filter((r: RowResult) => !r.ok).length ?? 0;
      toast.success(
        `Bulk update ${mode.toLowerCase()} completed: ${okCount} ok, ${failedCount} failed`
      );
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const stepOrder: WizardStep[] = ['target', 'operations', 'mode', 'review'];
  const stepIdx = stepOrder.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-600" />
            Bulk Update Wizard
          </DialogTitle>
          <DialogDescription>
            Step {stepIdx + 1} of {stepOrder.length}: {stepDescription(step)}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {stepOrder.map((s, i) => (
            <div
              key={s}
              className={cn(
                'flex-1 h-1.5 rounded-full transition-colors',
                i <= stepIdx ? 'bg-red-600' : 'bg-muted'
              )}
            />
          ))}
        </div>

        {/* ─── Step 1: Target ─── */}
        {step === 'target' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="bu-name">Job Name (optional)</Label>
              <Input
                id="bu-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q1 Pricing Refresh"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Module</Label>
              <Select value={moduleId} onValueChange={setModuleId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pick a module" />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.moduleName} ({m.moduleCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {moduleId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Target Filter</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() =>
                      setFilters((prev) => [
                        ...prev,
                        {
                          id: Math.random().toString(36).slice(2),
                          fieldCode: fields[0]?.fieldCode || '',
                          operator: 'contains',
                          value: '',
                          connector: 'AND',
                        },
                      ])
                    }
                    disabled={fields.length === 0}
                  >
                    <Plus className="w-3 h-3" /> Add Condition
                  </Button>
                </div>
                {fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading fields…</p>
                ) : filters.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No filter applied — all records in the module will be matched.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filters.map((f, i) => (
                      <FilterRow
                        key={f.id}
                        filter={f}
                        isFirst={i === 0}
                        fields={fields}
                        onChange={(next) =>
                          setFilters((prev) =>
                            prev.map((p) => (p.id === f.id ? next : p))
                          )
                        }
                        onRemove={() =>
                          setFilters((prev) => prev.filter((p) => p.id !== f.id))
                        }
                      />
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-sm">
                  {counting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Filter className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">Matched records:</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-mono',
                      matchedCount === 0
                        ? 'border-red-300 text-red-700 bg-red-50'
                        : 'border-emerald-300 text-emerald-700 bg-emerald-50'
                    )}
                  >
                    {matchedCount ?? '—'}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Step 2: Operations ─── */}
        {step === 'operations' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Operations</Label>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() =>
                  setOperations((prev) => [
                    ...prev,
                    { operation: 'SET_VALUE', fieldCode: '', value: '' },
                  ])
                }
              >
                <Plus className="w-3 h-3" /> Add Operation
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Operations are applied in order. SET_STATUS values must be one of:{' '}
              <code>DRAFT, IN_REVIEW, ACTIVE, ARCHIVED</code>. RUN_RULE is a no-op
              for MVP.
            </p>
            {operations.map((op, i) => (
              <OperationRow
                key={i}
                operation={op}
                fields={fields}
                onChange={(next) =>
                  setOperations((prev) =>
                    prev.map((p, idx) => (idx === i ? next : p))
                  )
                }
                onRemove={() =>
                  setOperations((prev) => prev.filter((_, idx) => idx !== i))
                }
                canRemove={operations.length > 1}
              />
            ))}
          </div>
        )}

        {/* ─── Step 3: Mode ─── */}
        {step === 'mode' && (
          <div className="space-y-3">
            <Label>Execution Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as 'PREVIEW' | 'PREFLIGHT' | 'APPLY')}
              className="space-y-2"
            >
              <ModeOption
                value="PREVIEW"
                title="Preview"
                description="Dry-run on the first 10 matched records. No DB writes. Returns before/after diff."
              />
              <ModeOption
                value="PREFLIGHT"
                title="Pre-flight"
                description="Full dry-run on ALL matched records. No DB writes. Returns ok/failed counts + per-row errors."
              />
              <ModeOption
                value="APPLY"
                title="Apply"
                description="Persist changes to the DB. ACTIVE records follow the amendment workflow (REVISION_PENDING + ApprovalTicket). DRAFT/REVISION_PENDING records are updated in place."
                danger
              />
            </RadioGroup>
          </div>
        )}

        {/* ─── Step 4: Review ─── */}
        {step === 'review' && (
          <div className="space-y-3">
            <Card>
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Module:</span>
                  <span className="font-medium">
                    {modules.find((m) => m.id === moduleId)?.moduleName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Matched records:</span>
                  <span className="font-mono font-semibold">{matchedCount ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Operations:</span>
                  <span className="font-mono font-semibold">{operations.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode:</span>
                  <Badge
                    variant="outline"
                    className={cn('text-xs', MODE_BADGE[mode])}
                  >
                    {mode}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Filter conditions:</span>
                  <span className="font-mono font-semibold">{filters.length}</span>
                </div>
              </CardContent>
            </Card>
            {mode === 'APPLY' && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Apply mode will write to the database.</p>
                  <p className="mt-1">
                    {matchedCount && matchedCount > 0
                      ? `${matchedCount} record(s) will be updated. ACTIVE records will move to REVISION_PENDING and open approval tickets.`
                      : 'No records matched — nothing will be written.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          {stepIdx > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep(stepOrder[stepIdx - 1])}
              disabled={submitting}
              className="gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          )}
          {stepIdx < stepOrder.length - 1 ? (
            <Button
              onClick={() => setStep(stepOrder[stepIdx + 1])}
              disabled={!canProceed}
              className="bg-red-600 hover:bg-red-700 text-white gap-1"
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !canProceed}
              className="bg-red-600 hover:bg-red-700 text-white gap-1"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Confirm & {mode === 'APPLY' ? 'Apply' : 'Run'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stepDescription(step: WizardStep): string {
  switch (step) {
    case 'target':
      return 'Pick a module + build the target filter';
    case 'operations':
      return 'Define one or more operations to apply';
    case 'mode':
      return 'Choose execution mode';
    case 'review':
      return 'Review and confirm';
  }
}

function ModeOption({
  value,
  title,
  description,
  danger,
}: {
  value: string;
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/40 transition-colors',
        danger && 'border-red-200 hover:bg-red-50'
      )}
    >
      <RadioGroupItem value={value} className="mt-1" />
      <div className="flex-1">
        <p className={cn('font-medium', danger && 'text-red-700')}>{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </label>
  );
}

// ============================================================================
// Filter Row
// ============================================================================

interface FilterRowProps {
  filter: AdvancedFilter;
  isFirst: boolean;
  fields: FieldInfo[];
  onChange: (next: AdvancedFilter) => void;
  onRemove: () => void;
}

function FilterRow({ filter, isFirst, fields, onChange, onRemove }: FilterRowProps) {
  const field = fields.find((f) => f.fieldCode === filter.fieldCode);
  const ops = operatorsForDataType(field?.dataType || 'TEXT');
  const needsValue = operatorNeedsValue(filter.operator);

  const handleFieldChange = (code: string) => {
    const newField = fields.find((f) => f.fieldCode === code);
    const newOps = operatorsForDataType(newField?.dataType || 'TEXT');
    const newOp = newOps.includes(filter.operator) ? filter.operator : newOps[0];
    onChange({ ...filter, fieldCode: code, operator: newOp, value: '' });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!isFirst ? (
        <Select
          value={filter.connector}
          onValueChange={(v) =>
            onChange({ ...filter, connector: v as FilterConnector })
          }
        >
          <SelectTrigger className="w-[72px] h-8 text-xs font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="w-[72px] text-[10px] font-semibold text-muted-foreground text-right uppercase tracking-wide">
          Where
        </div>
      )}

      <Select value={filter.fieldCode} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Pick column" />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.fieldCode}>
              {f.fieldName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.operator}
        onValueChange={(v) =>
          onChange({ ...filter, operator: v as FilterOperator })
        }
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op}>
              {formatOperator(op)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue ? (
        <Input
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="h-8 text-xs flex-1 min-w-[120px]"
          placeholder="Value"
        />
      ) : (
        <div className="text-[10px] text-muted-foreground italic h-8 flex items-center px-2 min-w-[120px]">
          (no value needed)
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
        onClick={onRemove}
        aria-label="Remove condition"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ============================================================================
// Operation Row
// ============================================================================

interface OperationRowProps {
  operation: BulkOperation;
  fields: FieldInfo[];
  onChange: (next: BulkOperation) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function OperationRow({
  operation,
  fields,
  onChange,
  onRemove,
  canRemove,
}: OperationRowProps) {
  const needsField = OPERATIONS_NEEDING_FIELD.includes(operation.operation);
  const needsValue = OPERATIONS_NEEDING_VALUE.includes(operation.operation);
  const isStatus = operation.operation === 'SET_STATUS';

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/30">
      <Select
        value={operation.operation}
        onValueChange={(v) =>
          onChange({
            operation: v as OperationType,
            fieldCode: '',
            value: '',
          })
        }
      >
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(OPERATION_LABELS).map(([val, label]) => (
            <SelectItem key={val} value={val}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsField && (
        <Select
          value={operation.fieldCode || ''}
          onValueChange={(v) => onChange({ ...operation, fieldCode: v })}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Pick field" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.id} value={f.fieldCode}>
                {f.fieldName} ({f.fieldCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {needsValue && (
        <>
          {isStatus ? (
            <Select
              value={operation.value || ''}
              onValueChange={(v) => onChange({ ...operation, value: v })}
            >
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Pick status" />
              </SelectTrigger>
              <SelectContent>
                {VALID_STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={operation.value || ''}
              onChange={(e) =>
                onChange({ ...operation, value: e.target.value })
              }
              className="h-8 text-xs flex-1 min-w-[180px]"
              placeholder="Value"
            />
          )}
        </>
      )}

      {operation.operation === 'RUN_RULE' && (
        <span className="text-xs text-muted-foreground italic">
          (no-op for MVP — logged only)
        </span>
      )}

      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 ml-auto text-muted-foreground hover:text-red-600 hover:bg-red-50"
          onClick={onRemove}
          aria-label="Remove operation"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Results Dialog
// ============================================================================

function ResultsDialog({
  job,
  onClose,
}: {
  job: BulkJob | null;
  onClose: () => void;
}) {
  const results: RowResult[] = useMemo(() => {
    if (!job?.results) return [];
    try {
      return JSON.parse(job.results) as RowResult[];
    } catch {
      return [];
    }
  }, [job]);

  if (!job) return null;

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Results — {job.name || job.id}</DialogTitle>
          <DialogDescription>
            {job.module.moduleName} · {job.mode} · {job.status} ·{' '}
            {job.totalRecords} matched, {job.okRecords} ok, {job.failedRecords} failed
          </DialogDescription>
        </DialogHeader>

        {job.errorLog && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <pre className="whitespace-pre-wrap font-mono text-xs">
              {job.errorLog}
            </pre>
          </div>
        )}

        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            No per-row results recorded for this job.
          </p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {results.map((r) => (
              <ResultRow key={r.recordId} row={r} />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({ row }: { row: RowResult }) {
  const [expanded, setExpanded] = useState(false);
  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    Object.keys(row.before || {}).forEach((k) => keys.add(k));
    Object.keys(row.after || {}).forEach((k) => keys.add(k));
    return Array.from(keys).sort();
  }, [row.before, row.after]);

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        row.ok ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'
      )}
    >
      <div className="flex items-center gap-2">
        {row.ok ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600" />
        )}
        <span className="font-mono text-xs flex-1 truncate">{row.recordId}</span>
        {row.amendment && (
          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
            amendment
          </Badge>
        )}
        {row.error && (
          <span className="text-xs text-red-600 truncate max-w-[40%]">
            {row.error}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Hide' : 'Show'} diff
        </Button>
      </div>

      {expanded && (
        <div className="mt-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Field</TableHead>
                <TableHead>Before</TableHead>
                <TableHead>After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allKeys.map((k) => {
                const b = row.before?.[k];
                const a = row.after?.[k];
                const changed = JSON.stringify(b) !== JSON.stringify(a);
                return (
                  <TableRow key={k}>
                    <TableCell className="font-mono text-xs">{k}</TableCell>
                    <TableCell
                      className={cn(
                        'text-xs',
                        changed && 'bg-red-50 text-red-700'
                      )}
                    >
                      {b === undefined ? (
                        <span className="text-muted-foreground italic">∅</span>
                      ) : (
                        String(b)
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-xs',
                        changed && 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      {a === undefined ? (
                        <span className="text-muted-foreground italic">∅</span>
                      ) : (
                        String(a)
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Client-side filter helper — delegates to the shared lib so the wizard
// matches exactly what the server-side /api/bulk-update will evaluate.
// ============================================================================

function applyFiltersClient(
  records: Array<{ currentPayload: string }>,
  filters: AdvancedFilter[],
  fields: FieldInfo[]
): Array<{ currentPayload: string }> {
  if (!filters || filters.length === 0) return records;
  const sharedFilters = filters as unknown as SharedAdvancedFilter[];
  const sharedFields: SharedFilterableField[] = fields.map((f) => ({
    fieldCode: f.fieldCode,
    dataType: f.dataType,
  }));
  return records.filter((rec) => {
    const payload = parsePayload(rec.currentPayload);
    return evaluateAdvancedFilters(payload, sharedFilters, sharedFields);
  });
}
