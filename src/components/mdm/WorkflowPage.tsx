'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  GitBranch, CheckCircle2, XCircle, Clock, User,
  FileText, FileSearch, ChevronRight, Mail, Package, Building2, Hash,
  ArrowRight, Plus, Minus, Pencil, AlertTriangle, Zap, Timer,
  Workflow, ListChecks, LayoutTemplate, Trash2, Copy, Users,
  ChevronDown, ChevronUp, CircleDot, ArrowUpRight, Shield,
  TrendingUp, BarChart3, Target, Activity, RotateCcw,
  ChevronLeft, ChevronLast, GripVertical, Search, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowHistoryEntry {
  step: number;
  userId: string;
  action: string;
  timestamp: string;
  notes?: string;
}

interface ApprovalTicket {
  id: string;
  recordId: string;
  requestedById: string;
  reviewedById: string | null;
  status: string;
  deltaPayload: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  workflowType: string;
  currentStep: number;
  totalSteps: number;
  stepName: string | null;
  deadline: string | null;
  escalatedTo: string | null;
  delegatedFrom: string | null;
  priority: string;
  parentTicketId: string | null;
  workflowHistory: string | null;
  record: {
    id: string;
    currentPayload: string;
    status: string;
    module: { id: string; moduleCode: string; moduleName: string };
    company: { id: string; companyCode: string; companyName: string } | null;
  };
  requestedBy: { id: string; username: string; displayName: string | null; email: string | null };
  reviewedBy: { id: string; username: string; displayName: string | null } | null;
}

interface StepConfig {
  name: string;
  assigneeRole: string;
  deadlineHours: number;
  isParallel: boolean;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  moduleScope: string | null;
  stepCount: number;
  stepConfig: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStats {
  totalPending: number;
  approvedToday: number;
  overdue: number;
  avgResolutionHours: number;
}

interface SysUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECORD_TITLE_FIELDS = [
  'name', 'title', 'articleName', 'article_name', 'displayName', 'display_name',
  'code', 'codeName', 'label', 'subject',
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  LOW: { label: 'Low', color: 'bg-gray-100 text-gray-600 border-gray-300', icon: ChevronDown },
  NORMAL: { label: 'Normal', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: CircleDot },
  HIGH: { label: 'High', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: ChevronUp },
  URGENT: { label: 'Urgent', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
};

const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  SIMPLE: 'Simple',
  MULTI_STEP: 'Multi-Step',
  PARALLEL: 'Parallel',
};

const PIPELINE_STAGES = [
  { key: 'PENDING', label: 'In Review', icon: Clock, color: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' },
  { key: 'APPROVED', label: 'Approved', icon: CheckCircle2, color: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' },
  { key: 'REJECTED', label: 'Rejected', icon: XCircle, color: 'border-red-400 bg-red-50 dark:bg-red-950/30' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRecordTitle(ticket: ApprovalTicket): string {
  try {
    const payload = JSON.parse(ticket?.record?.currentPayload || '{}');
    for (const k of RECORD_TITLE_FIELDS) {
      const v = payload[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    for (const [, v] of Object.entries(payload)) {
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
  } catch {
    // ignore parse errors
  }
  return ticket?.record?.module?.moduleName || 'Untitled Record';
}

function prettyRecordJson(raw: string | null | undefined): string {
  if (!raw) return '{}';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return String(raw);
  }
}

function parseWorkflowHistory(raw: string | null | undefined): WorkflowHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStepConfig(raw: string | null | undefined): StepConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDeadlineInfo(deadline: string | null): { isOverdue: boolean; isUpcoming: boolean; display: string } {
  if (!deadline) return { isOverdue: false, isUpcoming: false, display: '' };
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  const hours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
  const minutes = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));

  if (diff < 0) {
    return {
      isOverdue: true,
      isUpcoming: false,
      display: hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h overdue` : `${hours}h ${minutes}m overdue`,
    };
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return { isOverdue: false, isUpcoming: true, display: `${hours}h ${minutes}m remaining` };
  }
  return { isOverdue: false, isUpcoming: false, display: `${Math.floor(hours / 24)}d ${hours % 24}h remaining` };
}

function getPayloadDiff(ticket: ApprovalTicket) {
  try {
    const newPayload = JSON.parse(ticket.record?.currentPayload || '{}');
    const oldPayload = ticket.deltaPayload ? JSON.parse(ticket.deltaPayload) : {};
    const allKeys = new Set([...Object.keys(oldPayload), ...Object.keys(newPayload)]);
    const diffs: Array<{ key: string; oldVal: string; newVal: string }> = [];
    for (const key of allKeys) {
      const oldVal = String(oldPayload[key] ?? '');
      const newVal = String(newPayload[key] ?? '');
      if (oldVal !== newVal) {
        diffs.push({ key, oldVal, newVal });
      }
    }
    return diffs;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Visual workflow step timeline */
function WorkflowTimeline({ currentStep, totalSteps, stepName, workflowType, history }: {
  currentStep: number;
  totalSteps: number;
  stepName: string | null;
  workflowType: string;
  history: WorkflowHistoryEntry[];
}) {
  const steps: Array<{ step: number; name: string; status: 'completed' | 'current' | 'pending' }> = [];
  for (let i = 1; i <= totalSteps; i++) {
    const hasCompleted = history.some(h => h.step === i && (h.action === 'APPROVED' || h.action === 'DELEGATED' || h.action === 'REASSIGNED'));
    const historyEntry = history.find(h => h.step === i);
    const stepLabel = historyEntry?.notes?.replace(/Delegated to user .*/, '').replace(/Reassigned.*/, '') || (i === currentStep ? stepName : null) || `Step ${i}`;
    steps.push({
      step: i,
      name: stepLabel,
      status: hasCompleted ? 'completed' : (i === currentStep ? 'current' : 'pending'),
    });
  }

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {steps.map((s, idx) => (
        <div key={s.step} className="flex items-center">
          <div className="flex flex-col items-center min-w-[80px]">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
              s.status === 'completed' ? 'bg-emerald-500 border-emerald-500 text-white' :
              s.status === 'current' ? 'bg-primary border-primary text-primary-foreground shadow-md ring-4 ring-primary/20' :
              'bg-muted border-muted-foreground/30 text-muted-foreground'
            )}>
              {s.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : s.step}
            </div>
            <span className={cn(
              'text-[10px] mt-1 text-center max-w-[80px] truncate',
              s.status === 'completed' ? 'text-emerald-600 font-medium' :
              s.status === 'current' ? 'text-primary font-semibold' :
              'text-muted-foreground'
            )}>
              {s.name}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={cn(
              'w-8 h-0.5 mx-1',
              s.status === 'completed' ? 'bg-emerald-400' : 'bg-muted-foreground/20'
            )} />
          )}
        </div>
      ))}
      {workflowType === 'PARALLEL' && (
        <Badge variant="outline" className="ml-2 text-[10px] gap-1">
          <Users className="w-3 h-3" /> Parallel
        </Badge>
      )}
    </div>
  );
}

/** Priority badge */
function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.NORMAL;
  const Icon = config.icon;
  return (
    <Badge className={cn('text-[10px] border gap-0.5', config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

/** Deadline countdown display */
function DeadlineDisplay({ deadline }: { deadline: string | null }) {
  const info = getDeadlineInfo(deadline);
  if (!deadline) return null;

  return (
    <div className={cn(
      'flex items-center gap-1 text-xs',
      info.isOverdue ? 'text-red-600 font-semibold' :
      info.isUpcoming ? 'text-amber-600' :
      'text-muted-foreground'
    )}>
      {info.isOverdue ? (
        <AlertTriangle className={cn('w-3.5 h-3.5', info.isOverdue && 'animate-pulse')} />
      ) : (
        <Timer className="w-3.5 h-3.5" />
      )}
      {info.display}
    </div>
  );
}

/** Workflow history timeline in detail view */
function WorkflowHistoryTimeline({ history, users }: { history: WorkflowHistoryEntry[]; users: SysUser[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No workflow history available</p>;
  }

  const actionIcons: Record<string, typeof CheckCircle2> = {
    CREATED: FileText,
    APPROVED: CheckCircle2,
    REJECTED: XCircle,
    DELEGATED: ArrowUpRight,
    REASSIGNED: Users,
    ESCALATED: Zap,
    REQUEST_CHANGES: RotateCcw,
  };

  const actionColors: Record<string, string> = {
    CREATED: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300',
    APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300',
    REJECTED: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300',
    DELEGATED: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300',
    REASSIGNED: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300',
    ESCALATED: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300',
    REQUEST_CHANGES: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300',
  };

  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const Icon = actionIcons[entry.action] || CircleDot;
        const user = users.find(u => u.id === entry.userId);
        return (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center border', actionColors[entry.action] || 'bg-muted border-muted')}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              {idx < history.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
            </div>
            <div className="pb-4 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn('text-[10px] border', actionColors[entry.action] || '')}>{entry.action}</Badge>
                <span className="text-xs text-muted-foreground">
                  Step {entry.step} · {user?.displayName || user?.username || entry.userId.slice(0, 8)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(entry.timestamp).toLocaleString()}
              </p>
              {entry.notes && (
                <p className="text-sm mt-1 bg-muted/50 rounded px-2 py-1 max-w-md">{entry.notes}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Stats card */
function StatCard({ title, value, icon: Icon, color, subtitle }: {
  title: string; value: number | string; icon: typeof Clock; color: string; subtitle?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pipeline stage card showing count and percentage */
function PipelineStageCard({ stage, tickets, allTickets, onClick, isActive }: {
  stage: typeof PIPELINE_STAGES[number];
  tickets: ApprovalTicket[];
  allTickets: ApprovalTicket[];
  onClick: () => void;
  isActive: boolean;
}) {
  const count = tickets.length;
  const pct = allTickets.length > 0 ? Math.round((count / allTickets.length) * 100) : 0;
  const Icon = stage.icon;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'cursor-pointer rounded-xl border-2 p-4 transition-all',
        stage.color,
        isActive ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md',
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" />
        <span className="font-semibold text-sm">{stage.label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold">{count}</span>
        <span className="text-sm text-muted-foreground mb-1">({pct}%)</span>
      </div>
      <Progress value={pct} className="h-1.5 mt-2" />
    </motion.div>
  );
}

/** SoD Warning Banner */
function SoDWarningBanner({ onOverride }: { onOverride: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-4"
    >
      <div className="flex items-start gap-3">
        <Shield className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-semibold text-orange-800 dark:text-orange-300 text-sm">
            Segregation of Duties Violation
          </h4>
          <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">
            The same user who submitted this record cannot approve it per Segregation of Duties policy.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 border-orange-300 text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/40"
            onClick={onOverride}
          >
            <Shield className="w-3.5 h-3.5 mr-1" /> Override (Super Admin Only)
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function WorkflowPage() {
  const { token, navigate, user } = useAppStore();
  const canApprove = user?.roles?.some(r => ['Super Admin', 'Manager'].includes(r)) ?? false;
  const isSuperAdmin = user?.roles?.includes('Super Admin') ?? false;

  // State
  const [tickets, setTickets] = useState<ApprovalTicket[]>([]);
  const [stats, setStats] = useState<WorkflowStats>({ totalPending: 0, approvedToday: 0, overdue: 0, avgResolutionHours: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDING');
  const [mainTab, setMainTab] = useState('pipeline'); // pipeline | tickets | templates | statistics
  const [actionDialog, setActionDialog] = useState<{ ticketId: string; action: 'approve' | 'reject'; notes: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [detailTicket, setDetailTicket] = useState<ApprovalTicket | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<{ action: 'approve' | 'reject'; notes: string } | null>(null);

  // Delegation
  const [delegateDialog, setDelegateDialog] = useState<{ ticketId: string; userId: string; notes: string } | null>(null);
  const [users, setUsers] = useState<SysUser[]>([]);

  // Request Changes
  const [requestChangesDialog, setRequestChangesDialog] = useState<{ ticketId: string; notes: string } | null>(null);

  // Escalate
  const [escalateDialog, setEscalateDialog] = useState<{ ticketId: string; userId: string; notes: string } | null>(null);

  // SoD warning
  const [sodWarning, setSodWarning] = useState<string | null>(null);

  // Filters
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterWorkflowType, setFilterWorkflowType] = useState<string>('all');
  const [filterDeadline, setFilterDeadline] = useState<string>('all');

  // Templates
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [templateDialog, setTemplateDialog] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    name: string;
    description: string;
    moduleScope: string;
    steps: StepConfig[];
  } | null>(null);
  const [templateProcessing, setTemplateProcessing] = useState(false);

  // Load tickets
  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const statusParam = activeTab === 'ALL' ? 'all' : activeTab;
      let url = `/api/approvals?status=${statusParam}`;
      if (filterPriority !== 'all') url += `&priority=${filterPriority}`;
      if (filterWorkflowType !== 'all') url += `&workflowType=${filterWorkflowType}`;
      if (filterDeadline !== 'all') url += `&deadlineStatus=${filterDeadline}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTickets(data.tickets || []);
      if (data.stats) setStats(data.stats);
    } catch {
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [token, activeTab, filterPriority, filterWorkflowType, filterDeadline]);

  // Load all tickets for pipeline view
  const [allTickets, setAllTickets] = useState<ApprovalTicket[]>([]);
  const loadAllTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/approvals?status=all', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAllTickets(data.tickets || []);
    } catch {
      // Non-critical
    }
  }, [token]);

  // Load users for delegation
  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.users) {
        setUsers(data.users.map((u: SysUser) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          email: u.email,
        })));
      }
    } catch {
      // Non-critical, just skip
    }
  }, [token]);

  // Load templates
  const loadTemplates = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/workflow-templates', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      toast.error('Failed to load templates');
    }
  }, [token]);

  useEffect(() => { loadTickets(); loadAllTickets(); }, [loadTickets, loadAllTickets]);
  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { if (mainTab === 'templates') loadTemplates(); }, [mainTab, loadTemplates]);

  // Pipeline tickets by status
  const pipelineTickets = useMemo(() => {
    const grouped: Record<string, ApprovalTicket[]> = {
      PENDING: [],
      APPROVED: [],
      REJECTED: [],
    };
    for (const t of allTickets) {
      if (grouped[t.status]) grouped[t.status].push(t);
    }
    return grouped;
  }, [allTickets]);

  // Workflow statistics calculations
  const workflowStatistics = useMemo(() => {
    const total = allTickets.length;
    const approved = allTickets.filter(t => t.status === 'APPROVED').length;
    const rejected = allTickets.filter(t => t.status === 'REJECTED').length;
    const pending = allTickets.filter(t => t.status === 'PENDING').length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    // Rejection reasons from review notes
    const rejectionReasons: Record<string, number> = {};
    allTickets
      .filter(t => t.status === 'REJECTED' && t.reviewNotes)
      .forEach(t => {
        const note = t.reviewNotes!.slice(0, 50);
        rejectionReasons[note] = (rejectionReasons[note] || 0) + 1;
      });

    // Bottleneck detection: avg time per step
    const stepDurations: Record<number, { totalMs: number; count: number }> = {};
    allTickets.forEach(t => {
      const history = parseWorkflowHistory(t.workflowHistory);
      for (let i = 0; i < history.length - 1; i++) {
        const step = history[i].step;
        const duration = new Date(history[i + 1].timestamp).getTime() - new Date(history[i].timestamp).getTime();
        if (!stepDurations[step]) stepDurations[step] = { totalMs: 0, count: 0 };
        stepDurations[step].totalMs += duration;
        stepDurations[step].count++;
      }
    });

    const bottleneckSteps = Object.entries(stepDurations)
      .map(([step, { totalMs, count }]) => ({
        step: parseInt(step),
        avgHours: count > 0 ? Math.round((totalMs / count / (1000 * 60 * 60)) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avgHours - a.avgHours);

    // Avg time to approve (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentApproved = allTickets.filter(t =>
      t.status === 'APPROVED' && t.reviewedAt && new Date(t.reviewedAt) >= sevenDaysAgo
    );
    const avgTime7d = recentApproved.length > 0
      ? Math.round(recentApproved.reduce((acc, t) => {
          const dur = new Date(t.reviewedAt!).getTime() - new Date(t.createdAt).getTime();
          return acc + dur;
        }, 0) / recentApproved.length / (1000 * 60 * 60) * 10) / 10
      : 0;

    // Throughput: tickets resolved per day (last 7 days)
    const throughput: Array<{ day: string; approved: number; rejected: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      const dayLabel = dayStart.toLocaleDateString('en-US', { weekday: 'short' });
      const dayApproved = allTickets.filter(t =>
        t.status === 'APPROVED' && t.reviewedAt && new Date(t.reviewedAt) >= dayStart && new Date(t.reviewedAt) <= dayEnd
      ).length;
      const dayRejected = allTickets.filter(t =>
        t.status === 'REJECTED' && t.reviewedAt && new Date(t.reviewedAt) >= dayStart && new Date(t.reviewedAt) <= dayEnd
      ).length;
      throughput.push({ day: dayLabel, approved: dayApproved, rejected: dayRejected });
    }

    return {
      total,
      approved,
      rejected,
      pending,
      approvalRate,
      rejectionReasons,
      bottleneckSteps,
      avgTime7d,
      throughput,
    };
  }, [allTickets]);

  // Bulk actions
  const handleBulkAction = async () => {
    if (!token || !bulkDialog) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/approvals?action=bulk-${bulkDialog.action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketIds: Array.from(selectedIds),
          reviewNotes: bulkDialog.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }

      const results = data.results || [];
      const succeeded = results.filter((r: { success: boolean }) => r.success).length;
      const failed = results.filter((r: { success: boolean }) => !r.success).length;

      if (failed > 0) {
        toast.warning(`${succeeded} succeeded, ${failed} failed`);
      } else {
        toast.success(`${succeeded} ticket(s) ${bulkDialog.action === 'approve' ? 'approved' : 'rejected'}`);
      }
      setSelectedIds(new Set());
      setBulkDialog(null);
      loadTickets();
      loadAllTickets();
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  // Single action (approve/reject)
  const handleAction = async () => {
    if (!token || !actionDialog) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/approvals?action=${actionDialog.action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketId: actionDialog.ticketId,
          reviewNotes: actionDialog.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Check for SoD violation
        if (data.error?.includes('Separation of Duties')) {
          setSodWarning(actionDialog.ticketId);
          toast.error('SoD violation detected');
        } else {
          toast.error(data.error || 'Failed');
        }
        return;
      }
      toast.success(actionDialog.action === 'approve' ? 'Approved successfully' : 'Rejected');
      setActionDialog(null);
      if (detailTicket && detailTicket.id === actionDialog.ticketId) {
        setDetailTicket(null);
      }
      loadTickets();
      loadAllTickets();
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  // Delegate
  const handleDelegate = async () => {
    if (!token || !delegateDialog) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/approvals?action=delegate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketId: delegateDialog.ticketId,
          delegateToUserId: delegateDialog.userId,
          reviewNotes: delegateDialog.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Ticket delegated successfully');
      setDelegateDialog(null);
      loadTickets();
      loadAllTickets();
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  // Request Changes (send back to draft with revision notes)
  const handleRequestChanges = async () => {
    if (!token || !requestChangesDialog) return;
    setProcessing(true);
    try {
      // Reject with special notes indicating request for changes
      const res = await fetch('/api/approvals?action=reject', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketId: requestChangesDialog.ticketId,
          reviewNotes: `[REQUEST CHANGES] ${requestChangesDialog.notes}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes('Separation of Duties')) {
          setSodWarning(requestChangesDialog.ticketId);
        } else {
          toast.error(data.error || 'Failed');
        }
        return;
      }
      toast.success('Changes requested — record sent back for revision');
      setRequestChangesDialog(null);
      loadTickets();
      loadAllTickets();
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  // Escalate
  const handleEscalate = async () => {
    if (!token || !escalateDialog) return;
    setProcessing(true);
    try {
      // Delegate to escalation target
      const res = await fetch('/api/approvals?action=delegate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketId: escalateDialog.ticketId,
          delegateToUserId: escalateDialog.userId,
          reviewNotes: `[ESCALATED] ${escalateDialog.notes}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Ticket escalated successfully');
      setEscalateDialog(null);
      loadTickets();
      loadAllTickets();
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  // SoD Override (Super Admin only)
  const handleSodOverride = async (ticketId: string) => {
    if (!token || !isSuperAdmin) return;
    setProcessing(true);
    try {
      // Re-attempt the approve with override note
      const res = await fetch('/api/approvals?action=approve', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketId,
          reviewNotes: '[SoD OVERRIDE] Approved by Super Admin with override of Segregation of Duties policy',
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Approved with SoD override');
      setSodWarning(null);
      setActionDialog(null);
      loadTickets();
      loadAllTickets();
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  // Template CRUD
  const handleTemplateSave = async () => {
    if (!token || !templateDialog) return;
    setTemplateProcessing(true);
    try {
      const url = '/api/workflow-templates';
      const body = {
        ...(templateDialog.mode === 'edit' ? { id: templateDialog.id } : {}),
        name: templateDialog.name,
        description: templateDialog.description,
        moduleScope: templateDialog.moduleScope || null,
        stepConfig: templateDialog.steps,
      };

      const res = await fetch(url, {
        method: templateDialog.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(templateDialog.mode === 'create' ? 'Template created' : 'Template updated');
      setTemplateDialog(null);
      loadTemplates();
    } catch {
      toast.error('Network error');
    } finally {
      setTemplateProcessing(false);
    }
  };

  const handleTemplateDelete = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/workflow-templates?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Template deleted');
      loadTemplates();
    } catch {
      toast.error('Network error');
    }
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingIds = tickets.filter(t => t.status === 'PENDING').map(t => t.id);
    if (selectedIds.size === pendingIds.length && pendingIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingIds));
    }
  };

  // Check SoD: is current user the requester of a ticket?
  const isSodViolation = (ticket: ApprovalTicket) => {
    return user && ticket.requestedById === user.userId;
  };

  // Computed values for detail dialog
  const detailDiffs = detailTicket ? getPayloadDiff(detailTicket) : [];
  const detailRecordTitle = detailTicket ? extractRecordTitle(detailTicket) : 'Untitled Record';
  const detailRecordJson = detailTicket ? prettyRecordJson(detailTicket.record?.currentPayload) : '{}';
  const detailHistory = detailTicket ? parseWorkflowHistory(detailTicket.workflowHistory) : [];

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets; // Server-side filtering via query params
  }, [tickets]);

  return (
    <div className="p-4 lg:p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="w-7 h-7 text-primary" />
            Workflow Center
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Review, manage, and configure approval workflows</p>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && selectedIds.size > 0 && (
            <>
              <Badge variant="outline" className="text-xs">{selectedIds.size} selected</Badge>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                onClick={() => setBulkDialog({ action: 'approve', notes: '' })}
              >
                <CheckCircle2 className="w-4 h-4" /> Bulk Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1"
                onClick={() => setBulkDialog({ action: 'reject', notes: '' })}
              >
                <XCircle className="w-4 h-4" /> Bulk Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => { loadTickets(); loadAllTickets(); }}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="pipeline" className="gap-1.5">
            <GitBranch className="w-4 h-4" /> Pipeline
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1.5">
            <ListChecks className="w-4 h-4" /> Tickets
          </TabsTrigger>
          <TabsTrigger value="statistics" className="gap-1.5">
            <BarChart3 className="w-4 h-4" /> Statistics
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <LayoutTemplate className="w-4 h-4" /> Templates
          </TabsTrigger>
        </TabsList>

        {/* ============= PIPELINE TAB ============= */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          {/* Pipeline cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PIPELINE_STAGES.map((stage) => (
              <PipelineStageCard
                key={stage.key}
                stage={stage}
                tickets={pipelineTickets[stage.key] || []}
                allTickets={allTickets}
                isActive={activeTab === stage.key}
                onClick={() => {
                  setActiveTab(stage.key);
                  setMainTab('tickets');
                }}
              />
            ))}
          </div>

          {/* Horizontal pipeline visualization */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Workflow className="w-5 h-5" /> Workflow Pipeline
              </CardTitle>
              <CardDescription>Visual representation of record lifecycle stages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-0 overflow-x-auto pb-2">
                {/* Draft Stage */}
                <div className="flex flex-col items-center min-w-[100px]">
                  <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <span className="text-xs font-medium mt-2">Draft</span>
                </div>
                <ArrowRight className="w-6 h-6 text-muted-foreground shrink-0" />

                {/* In Review Stage */}
                <div className="flex flex-col items-center min-w-[100px]">
                  <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 flex items-center justify-center relative">
                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    {workflowStatistics.pending > 0 && (
                      <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {workflowStatistics.pending}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium mt-2">In Review</span>
                </div>
                <ArrowRight className="w-6 h-6 text-muted-foreground shrink-0" />

                {/* Approved / Rejected Branch */}
                <div className="flex flex-col items-center">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center min-w-[100px]">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-400 flex items-center justify-center relative">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        {workflowStatistics.approved > 0 && (
                          <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {workflowStatistics.approved}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium mt-2 text-emerald-700 dark:text-emerald-400">Approved</span>
                    </div>
                    <div className="flex flex-col items-center min-w-[100px]">
                      <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/40 border-2 border-red-400 flex items-center justify-center relative">
                        <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        {workflowStatistics.rejected > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {workflowStatistics.rejected}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium mt-2 text-red-700 dark:text-red-400">Rejected</span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-6 h-6 text-muted-foreground shrink-0" />

                {/* Active Stage */}
                <div className="flex flex-col items-center min-w-[100px]">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                  </div>
                  <span className="text-xs font-medium mt-2">Active</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent pipeline tickets */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                  <CardDescription>Latest tickets across all stages</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {allTickets.length === 0 ? (
                <div className="py-8 text-center">
                  <GitBranch className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No workflow tickets yet</p>
                </div>
              ) : (
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {allTickets.slice(0, 10).map((ticket) => {
                      const deadlineInfo = getDeadlineInfo(ticket.deadline);
                      return (
                        <motion.div
                          key={ticket.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => setDetailTicket(ticket)}
                        >
                          <div className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            ticket.status === 'PENDING' ? 'bg-amber-500' :
                            ticket.status === 'APPROVED' ? 'bg-emerald-500' :
                            'bg-red-500'
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{extractRecordTitle(ticket)}</p>
                            <p className="text-xs text-muted-foreground">{ticket.record?.module?.moduleName}</p>
                          </div>
                          <PriorityBadge priority={ticket.priority} />
                          {deadlineInfo.isOverdue && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] border">
                              <AlertTriangle className="w-3 h-3 mr-0.5" /> Overdue
                            </Badge>
                          )}
                          <Badge className={cn('text-[10px] border',
                            ticket.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            ticket.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          )}>
                            {ticket.status}
                          </Badge>
                        </motion.div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= TICKETS TAB ============= */}
        <TabsContent value="tickets" className="space-y-4 mt-4">
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              title="Total Pending"
              value={stats.totalPending}
              icon={Clock}
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            />
            <StatCard
              title="Approved Today"
              value={stats.approvedToday}
              icon={CheckCircle2}
              color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            />
            <StatCard
              title="Overdue"
              value={stats.overdue}
              icon={AlertTriangle}
              color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            />
            <StatCard
              title="Avg Resolution"
              value={stats.avgResolutionHours > 0 ? `${stats.avgResolutionHours}h` : '—'}
              icon={Timer}
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
              subtitle={stats.avgResolutionHours > 0 ? 'last 30 days' : ''}
            />
          </div>

          {/* Status Tabs + Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="PENDING" className="gap-1">
                  Pending {stats.totalPending > 0 && (
                    <Badge className="ml-1 bg-amber-100 text-amber-700 border-amber-200 text-xs px-1.5">
                      {stats.totalPending}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="APPROVED">Approved</TabsTrigger>
                <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
                <TabsTrigger value="ALL">All</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterWorkflowType} onValueChange={setFilterWorkflowType}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="SIMPLE">Simple</SelectItem>
                  <SelectItem value="MULTI_STEP">Multi-Step</SelectItem>
                  <SelectItem value="PARALLEL">Parallel</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterDeadline} onValueChange={setFilterDeadline}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Deadline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Deadlines</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="upcoming">Due Soon</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ticket List */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          ) : filteredTickets.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <GitBranch className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No approval tickets</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {activeTab === 'PENDING' ? 'All caught up! No pending approvals.' : `No ${activeTab.toLowerCase()} tickets found.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Select All row */}
              {activeTab === 'PENDING' && canApprove && filteredTickets.some(t => t.status === 'PENDING') && (
                <div className="flex items-center gap-2 px-1">
                  <Checkbox
                    checked={selectedIds.size === filteredTickets.filter(t => t.status === 'PENDING').length && selectedIds.size > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">Select all pending</span>
                </div>
              )}
              <div className="space-y-3">
                {filteredTickets.map((ticket) => {
                  const diffs = getPayloadDiff(ticket);
                  const deadlineInfo = getDeadlineInfo(ticket.deadline);
                  const history = parseWorkflowHistory(ticket.workflowHistory);
                  const isPending = ticket.status === 'PENDING';
                  const isDelegated = !!ticket.delegatedFrom;
                  const isEscalated = !!ticket.escalatedTo;
                  const sodViolation = isSodViolation(ticket);

                  return (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className={cn(
                        'shadow-sm transition-all',
                        deadlineInfo.isOverdue && isPending && 'border-red-300 ring-1 ring-red-200',
                        selectedIds.has(ticket.id) && 'ring-2 ring-primary border-primary/50',
                      )}>
                        <CardContent className="p-4 lg:p-6">
                          <div className="flex flex-col lg:flex-row gap-4">
                            {/* Checkbox */}
                            {isPending && canApprove && (
                              <div className="flex items-start pt-1">
                                <Checkbox
                                  checked={selectedIds.has(ticket.id)}
                                  onCheckedChange={() => toggleSelect(ticket.id)}
                                />
                              </div>
                            )}

                            {/* Ticket Info */}
                            <div className="flex-1 space-y-3 min-w-0">
                              {/* Top badges row */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={cn(
                                  'text-xs border',
                                  ticket.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  ticket.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' :
                                  'bg-red-50 text-red-700 border-red-200'
                                )}>
                                  {ticket.status}
                                </Badge>
                                <Badge className={cn('text-xs border', STATUS_COLORS[ticket.record?.status] || '')}>
                                  Record: {STATUS_LABELS[ticket.record?.status] || ticket.record?.status}
                                </Badge>
                                <PriorityBadge priority={ticket.priority} />
                                {ticket.workflowType !== 'SIMPLE' && (
                                  <Badge variant="outline" className="text-[10px] gap-0.5">
                                    <GitBranch className="w-3 h-3" />
                                    {WORKFLOW_TYPE_LABELS[ticket.workflowType] || ticket.workflowType}
                                  </Badge>
                                )}
                                {isDelegated && (
                                  <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] border gap-0.5">
                                    <ArrowUpRight className="w-3 h-3" /> Delegated
                                  </Badge>
                                )}
                                {isEscalated && (
                                  <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] border gap-0.5">
                                    <Zap className="w-3 h-3" /> Escalated
                                  </Badge>
                                )}
                              </div>

                              {/* SoD Warning inline */}
                              {sodViolation && isPending && canApprove && (
                                <div className="flex items-center gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200">
                                  <Shield className="w-4 h-4 text-orange-600 shrink-0" />
                                  <span className="text-xs text-orange-700 dark:text-orange-400">
                                    SoD: You submitted this record and cannot approve it
                                  </span>
                                  {isSuperAdmin && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="ml-auto h-6 text-[10px] border-orange-300 text-orange-700 hover:bg-orange-100"
                                      onClick={() => handleSodOverride(ticket.id)}
                                    >
                                      Override
                                    </Button>
                                  )}
                                </div>
                              )}

                              {/* Title & Module */}
                              <div>
                                <h3 className="font-semibold text-lg">{extractRecordTitle(ticket)}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {ticket.record?.module?.moduleName || 'Unknown Module'}
                                  {' · '}
                                  <span className="font-mono text-xs">{ticket.recordId.slice(0, 8)}...</span>
                                </p>
                              </div>

                              {/* Workflow Timeline for multi-step */}
                              {(ticket.workflowType === 'MULTI_STEP' || ticket.workflowType === 'PARALLEL') && (
                                <div className="bg-muted/30 rounded-lg p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <Workflow className="w-3.5 h-3.5" /> Workflow Progress (Step {ticket.currentStep}/{ticket.totalSteps})
                                  </p>
                                  <WorkflowTimeline
                                    currentStep={ticket.currentStep}
                                    totalSteps={ticket.totalSteps}
                                    stepName={ticket.stepName}
                                    workflowType={ticket.workflowType}
                                    history={history}
                                  />
                                </div>
                              )}

                              {/* Change Summary (compact) */}
                              {diffs.length > 0 && (
                                <div className="bg-muted/30 rounded-lg p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <FileSearch className="w-3.5 h-3.5" /> Change Summary ({diffs.length} fields changed)
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {diffs.slice(0, 6).map((d) => {
                                      const isAdded = !d.oldVal && d.newVal;
                                      const isRemoved = d.oldVal && !d.newVal;
                                      return (
                                        <TooltipProvider key={d.key}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Badge className={cn(
                                                'text-[10px] border cursor-help',
                                                isAdded ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                isRemoved ? 'bg-red-50 text-red-700 border-red-200' :
                                                'bg-amber-50 text-amber-700 border-amber-200'
                                              )}>
                                                {d.key}
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                              <div className="space-y-1 text-xs">
                                                <p className="font-medium">{d.key}</p>
                                                <p className="text-red-300">- {d.oldVal || '(empty)'}</p>
                                                <p className="text-emerald-300">+ {d.newVal || '(empty)'}</p>
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    })}
                                    {diffs.length > 6 && (
                                      <Badge variant="outline" className="text-[10px]">+{diffs.length - 6} more</Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Meta row */}
                              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                <div className="flex items-center gap-1">
                                  <User className="w-4 h-4" />
                                  {ticket.requestedBy?.displayName || ticket.requestedBy?.username}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {new Date(ticket.createdAt).toLocaleString()}
                                </div>
                                <DeadlineDisplay deadline={ticket.deadline} />
                              </div>

                              {/* Delegation Chain */}
                              {isDelegated && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Users className="w-3.5 h-3.5" />
                                  <span>Delegated from {ticket.delegatedFrom?.slice(0, 8)}...</span>
                                </div>
                              )}

                              {ticket.reviewedBy && (
                                <p className="text-sm text-muted-foreground">
                                  Reviewed by {ticket.reviewedBy?.displayName || ticket.reviewedBy?.username}
                                  {ticket.reviewedAt && ` on ${new Date(ticket.reviewedAt).toLocaleString()}`}
                                </p>
                              )}

                              {ticket.reviewNotes && (
                                <div className="p-3 bg-muted/50 rounded-lg">
                                  <p className="text-sm"><span className="font-medium">Notes:</span> {ticket.reviewNotes}</p>
                                </div>
                              )}

                              {/* Action buttons */}
                              {isPending && canApprove && (
                                <div className="flex gap-2 pt-2 flex-wrap">
                                  <Button
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                                    onClick={() => setActionDialog({ ticketId: ticket.id, action: 'approve', notes: '' })}
                                  >
                                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    className="h-9"
                                    onClick={() => setActionDialog({ ticketId: ticket.id, action: 'reject', notes: '' })}
                                  >
                                    <XCircle className="w-4 h-4 mr-1" /> Reject
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-9 gap-1 border-teal-200 text-teal-700 hover:bg-teal-50"
                                    onClick={() => setRequestChangesDialog({ ticketId: ticket.id, notes: '' })}
                                  >
                                    <RotateCcw className="w-4 h-4" /> Request Changes
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-9 gap-1"
                                    onClick={() => setDelegateDialog({ ticketId: ticket.id, userId: '', notes: '' })}
                                  >
                                    <ArrowUpRight className="w-4 h-4" /> Delegate
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-9 gap-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                                    onClick={() => setEscalateDialog({ ticketId: ticket.id, userId: '', notes: '' })}
                                  >
                                    <Zap className="w-4 h-4" /> Escalate
                                  </Button>
                                </div>
                              )}

                              {/* Detail button */}
                              <Button
                                variant="outline"
                                className="w-full h-9 gap-2 border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
                                onClick={() => setDetailTicket(ticket)}
                              >
                                <FileSearch className="w-4 h-4" />
                                View Details
                                <ChevronRight className="w-4 h-4 ml-auto" />
                              </Button>
                            </div>

                            {/* Diff Viewer (compact) */}
                            {diffs.length > 0 && (
                              <div className="lg:w-72 space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">Changes ({diffs.length})</p>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                  {diffs.slice(0, 5).map((d) => (
                                    <div key={d.key} className="rounded-md border p-2 text-sm">
                                      <p className="font-medium text-xs mb-1 truncate">{d.key}</p>
                                      <div className="space-y-0.5">
                                        <div className="px-1.5 py-0.5 bg-red-50 text-red-800 rounded text-xs border border-red-200 truncate dark:bg-red-950/40 dark:text-red-300">
                                          - {d.oldVal || '(empty)'}
                                        </div>
                                        <div className="px-1.5 py-0.5 bg-green-50 text-green-800 rounded text-xs border border-green-200 truncate dark:bg-green-950/40 dark:text-green-300">
                                          + {d.newVal || '(empty)'}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {diffs.length > 5 && (
                                    <p className="text-xs text-muted-foreground text-center">
                                      +{diffs.length - 5} more changes
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============= STATISTICS TAB ============= */}
        <TabsContent value="statistics" className="space-y-4 mt-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              title="Approval Rate"
              value={`${workflowStatistics.approvalRate}%`}
              icon={TrendingUp}
              color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              subtitle="all time"
            />
            <StatCard
              title="Avg Time (7d)"
              value={workflowStatistics.avgTime7d > 0 ? `${workflowStatistics.avgTime7d}h` : '—'}
              icon={Timer}
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
              subtitle="avg approval time"
            />
            <StatCard
              title="Rejected"
              value={workflowStatistics.rejected}
              icon={XCircle}
              color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            />
            <StatCard
              title="Total Tickets"
              value={workflowStatistics.total}
              icon={ListChecks}
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Approval Rate Gauge */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-5 h-5" /> Approval Rate
                </CardTitle>
                <CardDescription>Percentage of tickets approved vs rejected</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-4">
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      className="text-emerald-500"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(workflowStatistics.approvalRate / 100) * 314} 314`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{workflowStatistics.approvalRate}%</span>
                    <span className="text-[10px] text-muted-foreground">approved</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span>Approved: {workflowStatistics.approved}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span>Rejected: {workflowStatistics.rejected}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rejection Reasons */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="w-5 h-5" /> Rejection Reasons
                </CardTitle>
                <CardDescription>Breakdown of rejection reasons from review notes</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(workflowStatistics.rejectionReasons).length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
                    <p className="text-sm text-muted-foreground">No rejections recorded yet</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-64">
                    <div className="space-y-2">
                      {Object.entries(workflowStatistics.rejectionReasons)
                        .sort(([, a], [, b]) => b - a)
                        .map(([reason, count]) => (
                          <div key={reason} className="flex items-center gap-3 p-2 rounded-lg border">
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-xs border shrink-0">
                              {count}×
                            </Badge>
                            <span className="text-sm truncate">{reason}</span>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Bottleneck Detection */}
            <Card className="shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-5 h-5" /> Bottleneck Detection
                </CardTitle>
                <CardDescription>Average time spent at each workflow step — identifies the slowest stages</CardDescription>
              </CardHeader>
              <CardContent>
                {workflowStatistics.bottleneckSteps.length === 0 && workflowStatistics.avgTime7d === 0 ? (
                  <div className="py-4">
                    <p className="text-sm text-muted-foreground text-center mb-3">
                      Avg resolution time (7d): <span className="font-bold text-foreground">{workflowStatistics.avgTime7d > 0 ? `${workflowStatistics.avgTime7d}h` : 'N/A'}</span>
                    </p>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground text-center">No multi-step workflow data available yet. Resolution times will appear as more tickets are processed.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workflowStatistics.avgTime7d > 0 && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <span className="text-sm font-medium">Average Resolution Time (7d)</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{workflowStatistics.avgTime7d}h</span>
                      </div>
                    )}
                    {workflowStatistics.bottleneckSteps.map(({ step, avgHours }) => (
                      <div key={step} className="flex items-center gap-4">
                        <span className="text-sm font-medium w-20 shrink-0">Step {step}</span>
                        <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden relative">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((avgHours / (workflowStatistics.bottleneckSteps[0]?.avgHours || 1)) * 100, 100)}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            className={cn(
                              'h-full rounded-full',
                              avgHours > 48 ? 'bg-red-400' : avgHours > 24 ? 'bg-amber-400' : 'bg-emerald-400'
                            )}
                          />
                        </div>
                        <span className={cn(
                          'text-sm font-bold w-20 text-right',
                          avgHours > 48 ? 'text-red-600' : avgHours > 24 ? 'text-amber-600' : 'text-emerald-600'
                        )}>
                          {avgHours}h avg
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Throughput Chart */}
            <Card className="shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" /> Throughput (Last 7 Days)
                </CardTitle>
                <CardDescription>Tickets resolved per day — approved vs rejected</CardDescription>
              </CardHeader>
              <CardContent>
                {workflowStatistics.throughput.every(d => d.approved === 0 && d.rejected === 0) ? (
                  <div className="py-8 text-center">
                    <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No tickets resolved in the last 7 days</p>
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={workflowStatistics.throughput} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          formatter={(value: number, name: string) => [value, name.charAt(0).toUpperCase() + name.slice(1)]}
                        />
                        <Bar dataKey="approved" fill="#10b981" radius={[4, 4, 0, 0]} name="approved" />
                        <Bar dataKey="rejected" fill="#ef4444" radius={[4, 4, 0, 0]} name="rejected" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============= TEMPLATES TAB ============= */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Workflow Templates</h3>
              <p className="text-sm text-muted-foreground">Define reusable multi-step approval workflows</p>
            </div>
            {isSuperAdmin && (
              <Button
                className="gap-1"
                onClick={() => setTemplateDialog({
                  mode: 'create',
                  name: '',
                  description: '',
                  moduleScope: '',
                  steps: [{ name: 'Review', assigneeRole: 'Manager', deadlineHours: 24, isParallel: false }],
                })}
              >
                <Plus className="w-4 h-4" /> New Template
              </Button>
            )}
          </div>

          {templates.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <LayoutTemplate className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No workflow templates</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {isSuperAdmin ? 'Create a template to define multi-step approval workflows.' : 'No templates have been configured yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl) => {
                const steps = parseStepConfig(tpl.stepConfig);
                return (
                  <Card key={tpl.id} className="shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{tpl.name}</CardTitle>
                          {tpl.description && (
                            <CardDescription className="text-xs mt-1">{tpl.description}</CardDescription>
                          )}
                        </div>
                        {isSuperAdmin && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setTemplateDialog({
                                mode: 'edit',
                                id: tpl.id,
                                name: tpl.name,
                                description: tpl.description || '',
                                moduleScope: tpl.moduleScope || '',
                                steps,
                              })}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                              onClick={() => handleTemplateDelete(tpl.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {tpl.moduleScope && (
                        <Badge variant="outline" className="text-[10px]">
                          <Package className="w-3 h-3 mr-1" /> {tpl.moduleScope}
                        </Badge>
                      )}
                      <div className="flex items-center gap-0.5 overflow-x-auto">
                        {steps.map((step, idx) => (
                          <div key={idx} className="flex items-center">
                            <div className="flex flex-col items-center min-w-[60px]">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border bg-primary/10 border-primary/30 text-primary">
                                {idx + 1}
                              </div>
                              <span className="text-[9px] mt-0.5 text-center max-w-[60px] truncate text-muted-foreground">
                                {step.name}
                              </span>
                              {step.isParallel && (
                                <Badge className="text-[8px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-200 border">
                                  <Users className="w-2 h-2 mr-0.5" /> Parallel
                                </Badge>
                              )}
                            </div>
                            {idx < steps.length - 1 && (
                              <div className="w-4 h-0.5 bg-border mx-0.5" />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {steps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">#{idx + 1}</span>
                            <span>{step.name}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium">{step.assigneeRole}</span>
                            {step.deadlineHours > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1">
                                <Timer className="w-2.5 h-2.5 mr-0.5" /> {step.deadlineHours}h
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ============= DIALOGS ============= */}

      {/* SoD Warning Dialog */}
      <Dialog open={!!sodWarning} onOpenChange={() => setSodWarning(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <Shield className="w-5 h-5" /> Segregation of Duties Violation
            </DialogTitle>
            <DialogDescription>
              The same user who submitted this record cannot approve it per Segregation of Duties policy.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 p-4">
              <p className="text-sm text-orange-800 dark:text-orange-300">
                This action violates the Segregation of Duties policy because the approver is also the submitter of this record.
                Only a Super Admin can override this policy.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSodWarning(null)}>Cancel</Button>
            {isSuperAdmin && (
              <Button
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => sodWarning && handleSodOverride(sodWarning)}
                disabled={processing}
              >
                <Shield className="w-4 h-4 mr-1" /> Override (Super Admin)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionDialog?.action === 'approve' ? (
                <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Approve Ticket</>
              ) : (
                <><XCircle className="w-5 h-5 text-red-600" /> Reject Ticket</>
              )}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.action === 'approve'
                ? 'Add optional notes for this approval.'
                : 'A reason is required when rejecting a ticket.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{actionDialog?.action === 'approve' ? 'Notes (optional)' : 'Reason (required)'}</Label>
              <Textarea
                value={actionDialog?.notes || ''}
                onChange={(e) => setActionDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder={actionDialog?.action === 'approve' ? 'Optional approval notes...' : 'Required: explain why this is rejected...'}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={processing}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={processing || (actionDialog?.action === 'reject' && !actionDialog?.notes)}
              className={actionDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            >
              {processing ? 'Processing...' : actionDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Approve/Reject Dialog */}
      <Dialog open={!!bulkDialog} onOpenChange={() => setBulkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkDialog?.action === 'approve' ? (
                <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Bulk Approve</>
              ) : (
                <><XCircle className="w-5 h-5 text-red-600" /> Bulk Reject</>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedIds.size} ticket(s) will be {bulkDialog?.action === 'approve' ? 'approved' : 'rejected'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={bulkDialog?.notes || ''}
                onChange={(e) => setBulkDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Add notes for all selected tickets..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={processing}>Cancel</Button>
            <Button
              onClick={handleBulkAction}
              disabled={processing}
              className={bulkDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            >
              {processing ? 'Processing...' : `Bulk ${bulkDialog?.action === 'approve' ? 'Approve' : 'Reject'} (${selectedIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delegate Dialog */}
      <Dialog open={!!delegateDialog} onOpenChange={() => setDelegateDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-purple-600" /> Delegate Ticket
            </DialogTitle>
            <DialogDescription>
              Delegate this ticket to another user for review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Delegate To</Label>
              <Select
                value={delegateDialog?.userId || ''}
                onValueChange={(v) => setDelegateDialog(prev => prev ? { ...prev, userId: v } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.id !== user?.userId).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName || u.username} {u.email ? `(${u.email})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={delegateDialog?.notes || ''}
                onChange={(e) => setDelegateDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Explain why you are delegating..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateDialog(null)} disabled={processing}>Cancel</Button>
            <Button
              onClick={handleDelegate}
              disabled={processing || !delegateDialog?.userId}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {processing ? 'Processing...' : 'Delegate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes Dialog */}
      <Dialog open={!!requestChangesDialog} onOpenChange={() => setRequestChangesDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-teal-600" /> Request Changes
            </DialogTitle>
            <DialogDescription>
              Send this record back to draft with revision notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Revision Notes (required)</Label>
              <Textarea
                value={requestChangesDialog?.notes || ''}
                onChange={(e) => setRequestChangesDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Describe what changes are needed..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestChangesDialog(null)} disabled={processing}>Cancel</Button>
            <Button
              onClick={handleRequestChanges}
              disabled={processing || !requestChangesDialog?.notes}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {processing ? 'Processing...' : 'Request Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={!!escalateDialog} onOpenChange={() => setEscalateDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-600" /> Escalate Ticket
            </DialogTitle>
            <DialogDescription>
              Escalate this ticket to a higher authority for review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Escalate To</Label>
              <Select
                value={escalateDialog?.userId || ''}
                onValueChange={(v) => setEscalateDialog(prev => prev ? { ...prev, userId: v } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select authority" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.id !== user?.userId).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Escalation Reason</Label>
              <Textarea
                value={escalateDialog?.notes || ''}
                onChange={(e) => setEscalateDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Explain why this needs escalation..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialog(null)} disabled={processing}>Cancel</Button>
            <Button
              onClick={handleEscalate}
              disabled={processing || !escalateDialog?.userId}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {processing ? 'Processing...' : 'Escalate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailTicket} onOpenChange={() => setDetailTicket(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          {detailTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSearch className="w-5 h-5" />
                  {detailRecordTitle}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    {detailTicket.record?.module?.moduleName}
                  </span>
                  {detailTicket.record?.company && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {detailTicket.record.company.companyName || detailTicket.record.company.companyCode}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-6 pr-2">
                  {/* SoD Warning */}
                  {isSodViolation(detailTicket) && detailTicket.status === 'PENDING' && (
                    <SoDWarningBanner onOverride={() => handleSodOverride(detailTicket.id)} />
                  )}

                  {/* Workflow Timeline */}
                  {(detailTicket.workflowType === 'MULTI_STEP' || detailTicket.workflowType === 'PARALLEL') && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Workflow className="w-4 h-4" /> Workflow Progress
                      </h4>
                      <div className="bg-muted/30 rounded-lg p-4">
                        <WorkflowTimeline
                          currentStep={detailTicket.currentStep}
                          totalSteps={detailTicket.totalSteps}
                          stepName={detailTicket.stepName}
                          workflowType={detailTicket.workflowType}
                          history={detailHistory}
                        />
                      </div>
                    </section>
                  )}

                  {/* Deadline */}
                  {detailTicket.deadline && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Timer className="w-4 h-4" /> Deadline
                      </h4>
                      <div className={cn(
                        'rounded-lg border p-3 flex items-center gap-3',
                        getDeadlineInfo(detailTicket.deadline).isOverdue ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'border-border'
                      )}>
                        <DeadlineDisplay deadline={detailTicket.deadline} />
                        <span className="text-sm text-muted-foreground">
                          Due: {new Date(detailTicket.deadline).toLocaleString()}
                        </span>
                      </div>
                    </section>
                  )}

                  {/* Requester Info */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Requester
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Requested By</span>
                        </div>
                        <p className="text-sm font-medium break-words">
                          {detailTicket.requestedBy?.displayName || detailTicket.requestedBy?.username || 'Unknown'}
                        </p>
                        {detailTicket.requestedBy?.email && (
                          <p className="text-xs text-muted-foreground mt-0.5 break-words flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {detailTicket.requestedBy.email}
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">Submitted At</span>
                        </div>
                        <p className="text-sm font-medium break-words">
                          {new Date(detailTicket.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {detailTicket.reviewedBy && (
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="font-medium">Reviewed By</span>
                        </div>
                        <p className="text-sm font-medium break-words">
                          {detailTicket.reviewedBy?.displayName || detailTicket.reviewedBy?.username}
                          {detailTicket.reviewedAt && (
                            <span className="text-xs text-muted-foreground ml-2">
                              on {new Date(detailTicket.reviewedAt).toLocaleString()}
                            </span>
                          )}
                        </p>
                        {detailTicket.reviewNotes && (
                          <p className="text-sm mt-2 whitespace-pre-wrap">
                            <span className="font-medium">Notes:</span> {detailTicket.reviewNotes}
                          </p>
                        )}
                      </div>
                    )}
                  </section>

                  <Separator />

                  {/* Workflow History */}
                  {detailHistory.length > 0 && (
                    <>
                      <section className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <GitBranch className="w-4 h-4" /> Workflow History
                        </h4>
                        <WorkflowHistoryTimeline history={detailHistory} users={users} />
                      </section>
                      <Separator />
                    </>
                  )}

                  {/* Change Summary */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" /> Change Summary
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Comparison of old → new values for each changed field.
                    </p>
                    {detailDiffs.length === 0 ? (
                      <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
                        <FileSearch className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">No Changes Detected</p>
                          <p className="text-xs text-muted-foreground mt-0.5">No field changes were detected on this ticket.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                            <Plus className="w-3 h-3 mr-0.5" />
                            {detailDiffs.filter(d => !d.oldVal && d.newVal).length} added
                          </Badge>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                            <Pencil className="w-3 h-3 mr-0.5" />
                            {detailDiffs.filter(d => d.oldVal && d.newVal).length} modified
                          </Badge>
                          <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                            <Minus className="w-3 h-3 mr-0.5" />
                            {detailDiffs.filter(d => d.oldVal && !d.newVal).length} removed
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-1">
                            Total {detailDiffs.length} field(s) changed
                          </span>
                        </div>
                        <div className="space-y-2">
                          {detailDiffs.map((d) => {
                            const isAdded = !d.oldVal && d.newVal;
                            const isRemoved = d.oldVal && !d.newVal;
                            return (
                              <div
                                key={d.key}
                                className={cn(
                                  'rounded-md border border-l-4 bg-card p-3 space-y-2',
                                  isAdded ? 'border-l-emerald-400' :
                                  isRemoved ? 'border-l-red-400' :
                                  'border-l-amber-400',
                                )}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-medium font-mono">{d.key}</span>
                                  <Badge className={cn(
                                    'text-[10px] border',
                                    isAdded ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    isRemoved ? 'bg-red-50 text-red-700 border-red-200' :
                                    'bg-amber-50 text-amber-700 border-amber-200',
                                  )}>
                                    {isAdded ? 'added' : isRemoved ? 'removed' : 'modified'}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                                  <div className={cn(
                                    'rounded px-2 py-1.5 text-xs font-mono break-words border',
                                    isAdded ? 'bg-muted/30 text-muted-foreground border-muted' :
                                    'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-300',
                                  )}>
                                    {isAdded ? (
                                      <span className="italic">(not set)</span>
                                    ) : (
                                      d.oldVal || <span className="italic text-muted-foreground">(empty)</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-center">
                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                  <div className={cn(
                                    'rounded px-2 py-1.5 text-xs font-mono break-words border',
                                    isRemoved ? 'bg-muted/30 text-muted-foreground border-muted line-through' :
                                    'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
                                  )}>
                                    {isRemoved ? (
                                      <span className="italic">(removed)</span>
                                    ) : (
                                      d.newVal || <span className="italic text-muted-foreground">(empty)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </section>

                  <Separator />

                  {/* Complete Record Data */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /> Complete Record Data
                    </h4>
                    <ScrollArea className="h-64 rounded-md border bg-muted/40">
                      <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">
                        {detailRecordJson}
                      </pre>
                    </ScrollArea>
                  </section>
                </div>
              </ScrollArea>

              <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setDetailTicket(null)}>
                  Close
                </Button>
                {detailTicket.status === 'PENDING' && canApprove && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50"
                      onClick={() => {
                        setDetailTicket(null);
                        setEscalateDialog({ ticketId: detailTicket.id, userId: '', notes: '' });
                      }}
                    >
                      <Zap className="w-4 h-4" /> Escalate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
                      onClick={() => {
                        setDetailTicket(null);
                        setRequestChangesDialog({ ticketId: detailTicket.id, notes: '' });
                      }}
                    >
                      <RotateCcw className="w-4 h-4" /> Request Changes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                      onClick={() => {
                        setDetailTicket(null);
                        setDelegateDialog({ ticketId: detailTicket.id, userId: '', notes: '' });
                      }}
                    >
                      <ArrowUpRight className="w-4 h-4" /> Delegate
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setActionDialog({ ticketId: detailTicket.id, action: 'reject', notes: '' })}
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => setActionDialog({ ticketId: detailTicket.id, action: 'approve', notes: '' })}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Template Create/Edit Dialog */}
      <Dialog open={!!templateDialog} onOpenChange={() => setTemplateDialog(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              {templateDialog?.mode === 'create' ? 'Create Workflow Template' : 'Edit Workflow Template'}
            </DialogTitle>
            <DialogDescription>
              Define the steps and assignees for this workflow template.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    value={templateDialog?.name || ''}
                    onChange={(e) => setTemplateDialog(prev => prev ? { ...prev, name: e.target.value } : null)}
                    placeholder="e.g. Product Approval Workflow"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Module Scope (optional)</Label>
                  <Input
                    value={templateDialog?.moduleScope || ''}
                    onChange={(e) => setTemplateDialog(prev => prev ? { ...prev, moduleScope: e.target.value } : null)}
                    placeholder="e.g. PRODUCT or leave empty for global"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={templateDialog?.description || ''}
                  onChange={(e) => setTemplateDialog(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="Describe the purpose of this workflow..."
                  rows={2}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Steps Configuration</Label>
                  <Button
                    variant="outline" size="sm"
                    className="gap-1"
                    onClick={() => setTemplateDialog(prev => prev ? {
                      ...prev,
                      steps: [...prev.steps, { name: '', assigneeRole: 'Manager', deadlineHours: 24, isParallel: false }],
                    } : null)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Step
                  </Button>
                </div>

                <div className="space-y-3">
                  {templateDialog?.steps.map((step, idx) => (
                    <Card key={idx} className="shadow-none border">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs font-mono">
                            Step {idx + 1}
                          </Badge>
                          {templateDialog.steps.length > 1 && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                              onClick={() => setTemplateDialog(prev => prev ? {
                                ...prev,
                                steps: prev.steps.filter((_, i) => i !== idx),
                              } : null)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Step Name</Label>
                            <Input
                              value={step.name}
                              onChange={(e) => {
                                const newSteps = [...(templateDialog?.steps || [])];
                                newSteps[idx] = { ...newSteps[idx], name: e.target.value };
                                setTemplateDialog(prev => prev ? { ...prev, steps: newSteps } : null);
                              }}
                              placeholder="e.g. Manager Review"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Assignee Role</Label>
                            <Select
                              value={step.assigneeRole}
                              onValueChange={(val) => {
                                const newSteps = [...(templateDialog?.steps || [])];
                                newSteps[idx] = { ...newSteps[idx], assigneeRole: val };
                                setTemplateDialog(prev => prev ? { ...prev, steps: newSteps } : null);
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Super Admin">Super Admin</SelectItem>
                                <SelectItem value="Manager">Manager</SelectItem>
                                <SelectItem value="Data Entry">Data Entry</SelectItem>
                                <SelectItem value="Viewer">Viewer</SelectItem>
                                <SelectItem value="API Manager">API Manager</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Deadline (hours)</Label>
                            <Input
                              type="number"
                              value={step.deadlineHours}
                              onChange={(e) => {
                                const newSteps = [...(templateDialog?.steps || [])];
                                newSteps[idx] = { ...newSteps[idx], deadlineHours: parseInt(e.target.value) || 0 };
                                setTemplateDialog(prev => prev ? { ...prev, steps: newSteps } : null);
                              }}
                              placeholder="24"
                              min={0}
                            />
                          </div>
                          <div className="flex items-center gap-3 pt-5">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={step.isParallel}
                                onChange={(e) => {
                                  const newSteps = [...(templateDialog?.steps || [])];
                                  newSteps[idx] = { ...newSteps[idx], isParallel: e.target.checked };
                                  setTemplateDialog(prev => prev ? { ...prev, steps: newSteps } : null);
                                }}
                                className="rounded border-muted-foreground/30"
                              />
                              <span className="text-xs">Parallel Step</span>
                            </label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {templateDialog && templateDialog.steps.length > 1 && (
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
                    <WorkflowTimeline
                      currentStep={1}
                      totalSteps={templateDialog.steps.length}
                      stepName={templateDialog.steps[0]?.name || 'Step 1'}
                      workflowType={templateDialog.steps.some(s => s.isParallel) ? 'PARALLEL' : 'MULTI_STEP'}
                      history={[]}
                    />
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setTemplateDialog(null)}>Cancel</Button>
            <Button
              onClick={handleTemplateSave}
              disabled={templateProcessing || !templateDialog?.name || templateDialog?.steps.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {templateProcessing ? 'Saving...' : templateDialog?.mode === 'create' ? 'Create Template' : 'Update Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
