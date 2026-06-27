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
  GitBranch, CheckCircle2, XCircle, Clock, User,
  FileText, FileSearch, ChevronRight, Mail, Package, Building2, Hash,
  ArrowRight, Plus, Minus, Pencil, AlertTriangle, Zap, Timer,
  Workflow, ListChecks, LayoutTemplate, Trash2, Copy, Users,
  ChevronDown, ChevronUp, CircleDot, ArrowUpRight, Shield,
} from 'lucide-react';
import { toast } from 'sonner';

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
  NORMAL: { label: 'Normal', color: 'bg-sky-50 text-sky-700 border-sky-200', icon: CircleDot },
  HIGH: { label: 'High', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: ChevronUp },
  URGENT: { label: 'Urgent', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
};

const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  SIMPLE: 'Simple',
  MULTI_STEP: 'Multi-Step',
  PARALLEL: 'Parallel',
};

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
  // Build step labels from history or infer
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
  };

  const actionColors: Record<string, string> = {
    CREATED: 'bg-sky-100 text-sky-700 border-sky-300',
    APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    REJECTED: 'bg-red-100 text-red-700 border-red-300',
    DELEGATED: 'bg-amber-100 text-amber-700 border-amber-300',
    REASSIGNED: 'bg-violet-100 text-violet-700 border-violet-300',
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
  const [mainTab, setMainTab] = useState('tickets'); // tickets | templates
  const [actionDialog, setActionDialog] = useState<{ ticketId: string; action: 'approve' | 'reject'; notes: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [detailTicket, setDetailTicket] = useState<ApprovalTicket | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<{ action: 'approve' | 'reject'; notes: string } | null>(null);

  // Delegation
  const [delegateDialog, setDelegateDialog] = useState<{ ticketId: string; userId: string; notes: string } | null>(null);
  const [users, setUsers] = useState<SysUser[]>([]);

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

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { if (mainTab === 'templates') loadTemplates(); }, [mainTab, loadTemplates]);

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
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  // Single action
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
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(actionDialog.action === 'approve' ? 'Approved successfully' : 'Rejected');
      setActionDialog(null);
      if (detailTicket && detailTicket.id === actionDialog.ticketId) {
        setDetailTicket(null);
      }
      loadTickets();
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
        {canApprove && selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </div>

      {/* Main Tabs: Tickets vs Templates */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="tickets" className="gap-1.5">
            <ListChecks className="w-4 h-4" /> Tickets
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <LayoutTemplate className="w-4 h-4" /> Templates
          </TabsTrigger>
        </TabsList>

        {/* ============= TICKETS TAB ============= */}
        <TabsContent value="tickets" className="space-y-4 mt-4">
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              title="Total Pending"
              value={stats.totalPending}
              icon={Clock}
              color="bg-amber-100 text-amber-700"
            />
            <StatCard
              title="Approved Today"
              value={stats.approvedToday}
              icon={CheckCircle2}
              color="bg-emerald-100 text-emerald-700"
            />
            <StatCard
              title="Overdue"
              value={stats.overdue}
              icon={AlertTriangle}
              color="bg-red-100 text-red-700"
            />
            <StatCard
              title="Avg Resolution"
              value={stats.avgResolutionHours > 0 ? `${stats.avgResolutionHours}h` : '—'}
              icon={Timer}
              color="bg-sky-100 text-sky-700"
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

                  return (
                    <Card key={ticket.id} className={cn(
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
                                <Badge className="bg-violet-50 text-violet-700 border-violet-200 text-[10px] border gap-0.5">
                                  <ArrowUpRight className="w-3 h-3" /> Delegated
                                </Badge>
                              )}
                              {ticket.escalatedTo && (
                                <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] border gap-0.5">
                                  <Zap className="w-3 h-3" /> Escalated
                                </Badge>
                              )}
                            </div>

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
                                  className="h-9 gap-1"
                                  onClick={() => setDelegateDialog({ ticketId: ticket.id, userId: '', notes: '' })}
                                >
                                  <ArrowUpRight className="w-4 h-4" /> Delegate
                                </Button>
                              </div>
                            )}

                            {/* Detail button */}
                            <Button
                              variant="outline"
                              className="w-full h-9 gap-2 border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
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
                                      <div className="px-1.5 py-0.5 bg-red-50 text-red-800 rounded text-xs border border-red-200 truncate">
                                        - {d.oldVal || '(empty)'}
                                      </div>
                                      <div className="px-1.5 py-0.5 bg-green-50 text-green-800 rounded text-xs border border-green-200 truncate">
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
                  );
                })}
              </div>
            </div>
          )}
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
                              <div className={cn(
                                'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border',
                                'bg-primary/10 border-primary/30 text-primary'
                              )}>
                                {idx + 1}
                              </div>
                              <span className="text-[9px] mt-0.5 text-center max-w-[60px] truncate text-muted-foreground">
                                {step.name}
                              </span>
                              {step.isParallel && (
                                <Badge className="text-[8px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200 border">
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

      {/* Action Dialog (Approve/Reject) */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actionDialog?.action === 'approve' ? 'Approve Request' : 'Reject Request'}</DialogTitle>
            <DialogDescription>
              {actionDialog?.action === 'approve'
                ? 'This will activate the record and create a new version.'
                : 'This will reject the record and send it back to the requester.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Review Notes</Label>
              <Textarea
                value={actionDialog?.notes || ''}
                onChange={(e) => setActionDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Add your review comments..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              className={actionDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-destructive hover:bg-destructive/90 text-white'}
            >
              {processing ? 'Processing...' : actionDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Dialog */}
      <Dialog open={!!bulkDialog} onOpenChange={() => setBulkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk {bulkDialog?.action === 'approve' ? 'Approve' : 'Reject'}</DialogTitle>
            <DialogDescription>
              You are about to {bulkDialog?.action} {selectedIds.size} ticket(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Separation of Duties: Self-approvals will be skipped automatically.</span>
            </div>
            <div className="space-y-2">
              <Label>Review Notes (applied to all)</Label>
              <Textarea
                value={bulkDialog?.notes || ''}
                onChange={(e) => setBulkDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Add review comments for all tickets..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)}>Cancel</Button>
            <Button
              onClick={handleBulkAction}
              disabled={processing}
              className={bulkDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-destructive hover:bg-destructive/90 text-white'}
            >
              {processing ? 'Processing...' : `${bulkDialog?.action === 'approve' ? 'Approve' : 'Reject'} ${selectedIds.size} Tickets`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delegate Dialog */}
      <Dialog open={!!delegateDialog} onOpenChange={() => setDelegateDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5" /> Delegate Ticket
            </DialogTitle>
            <DialogDescription>
              Transfer this approval to another reviewer. They will be responsible for the final decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Delegate To</Label>
              <Select
                value={delegateDialog?.userId || ''}
                onValueChange={(val) => setDelegateDialog(prev => prev ? { ...prev, userId: val } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a user to delegate to" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter(u => u.id !== user?.userId) // Cannot delegate to self
                    .map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.displayName || u.username} {u.email ? `(${u.email})` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delegation Notes</Label>
              <Textarea
                value={delegateDialog?.notes || ''}
                onChange={(e) => setDelegateDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Why are you delegating this ticket?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateDialog(null)}>Cancel</Button>
            <Button
              onClick={handleDelegate}
              disabled={processing || !delegateDialog?.userId}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {processing ? 'Delegating...' : 'Delegate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailTicket} onOpenChange={(open) => { if (!open) setDetailTicket(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          {detailTicket && (
            <>
              <DialogHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn(
                    'text-xs border',
                    detailTicket.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    detailTicket.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' :
                    'bg-red-50 text-red-700 border-red-200'
                  )}>
                    {detailTicket.status}
                  </Badge>
                  <Badge className={cn('text-xs border', STATUS_COLORS[detailTicket.record?.status] || '')}>
                    Record: {STATUS_LABELS[detailTicket.record?.status] || detailTicket.record?.status}
                  </Badge>
                  <PriorityBadge priority={detailTicket.priority} />
                  <Badge variant="outline" className="text-xs font-mono">
                    <Hash className="w-3 h-3 mr-1" />
                    {detailTicket.recordId?.slice(0, 8)}…
                  </Badge>
                </div>
                <DialogTitle className="text-xl flex items-start gap-2">
                  <FileText className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="break-words">{detailRecordTitle}</span>
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    {detailTicket.record?.module?.moduleName || detailTicket.record?.module?.moduleCode || 'Unknown Module'}
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
                        getDeadlineInfo(detailTicket.deadline).isOverdue ? 'border-red-300 bg-red-50' : 'border-border'
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
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
                        <FileSearch className="w-5 h-5 text-gray-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">No Changes Detected</p>
                          <p className="text-xs text-gray-700 mt-0.5">No field changes were detected on this ticket.</p>
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
                                    isAdded ? 'bg-gray-50 text-muted-foreground border-gray-200' :
                                    'bg-red-50 text-red-900 border-red-200',
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
                                    isRemoved ? 'bg-gray-50 text-muted-foreground border-gray-200 line-through' :
                                    'bg-emerald-50 text-emerald-900 border-emerald-200',
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
                    <p className="text-xs text-muted-foreground">
                      Full record data that will be saved if this ticket is approved.
                    </p>
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
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
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
              {/* Template basics */}
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

              {/* Steps builder */}
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

                {/* Step Preview Timeline */}
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
