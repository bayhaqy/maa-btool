'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck, Users, Merge, AlertTriangle, CheckCircle2, Clock,
  ArrowRight, Eye, GitMerge, UserCircle, FileText, TrendingUp,
  AlertCircle, Layers, Crown, Plus, UserPlus, RefreshCw, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StewardshipTask {
  id: string;
  taskType: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  assignedTo: string | null;
  assignedBy: string | null;
  dueDate: string | null;
  resolution: string | null;
  context: string | null;
  moduleId: string;
  recordId: string | null;
  createdAt: string;
  module: { id: string; moduleCode: string; moduleName: string };
  assignee: { id: string; username: string; displayName: string | null; email: string } | null;
  assigner: { id: string; username: string; displayName: string | null; email: string } | null;
  source?: string;
}

interface ApprovalTask {
  id: string;
  taskType: string;
  title: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  dueDate: string | null;
  createdAt: string;
  module: { id: string; moduleCode: string; moduleName: string };
  recordId: string;
  source: string;
}

interface GoldenRecord {
  id: string;
  domain: string;
  recordCount: number;
  survivorSource: string;
  lastMerged: string;
  confidence: number;
  status: 'active' | 'pending_review' | 'conflict';
}

interface DomainOwnership {
  domain: string;
  moduleCode: string;
  moduleId: string;
  owner: string;
  ownerEmail: string;
  recordCount: number;
  qualityScore: number;
  lastUpdated: string;
  stewardAssigned: boolean;
}

interface QualityAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  domain: string;
  timestamp: string;
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Fallback data for golden records and alerts
// ---------------------------------------------------------------------------

const goldenRecords: GoldenRecord[] = [
  { id: 'GR-001', domain: 'Product - Footwear', recordCount: 38, survivorSource: 'Article Master (SAP)', lastMerged: '2025-01-14', confidence: 96, status: 'active' },
  { id: 'GR-002', domain: 'Product - Apparel', recordCount: 24, survivorSource: 'Article Master (POS)', lastMerged: '2025-01-12', confidence: 91, status: 'active' },
  { id: 'GR-003', domain: 'Supplier', recordCount: 12, survivorSource: 'Vendor Master (ERP)', lastMerged: '2025-01-10', confidence: 78, status: 'pending_review' },
  { id: 'GR-004', domain: 'Store Locations', recordCount: 20, survivorSource: 'Store Master (CRM)', lastMerged: '2025-01-08', confidence: 85, status: 'conflict' },
  { id: 'GR-005', domain: 'Pricing', recordCount: 20, survivorSource: 'Pricing Master (SAP)', lastMerged: '2025-01-06', confidence: 93, status: 'active' },
];

const qualityAlerts: QualityAlert[] = [
  { id: 'QA-001', severity: 'critical', message: '3 duplicate Article records detected in Footwear category', domain: 'Product', timestamp: '2025-01-15T10:30:00Z', resolved: false },
  { id: 'QA-002', severity: 'warning', message: '12 records with missing brand attribution', domain: 'Product', timestamp: '2025-01-15T09:00:00Z', resolved: false },
  { id: 'QA-003', severity: 'warning', message: 'Store address validation failures in 5 records', domain: 'Store', timestamp: '2025-01-14T16:00:00Z', resolved: false },
  { id: 'QA-004', severity: 'info', message: 'Pricing data sync completed with 2 conflicts', domain: 'Pricing', timestamp: '2025-01-14T12:00:00Z', resolved: true },
  { id: 'QA-005', severity: 'critical', message: 'Supplier tax ID missing for 3 vendors', domain: 'Supplier', timestamp: '2025-01-13T08:30:00Z', resolved: false },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const priorityColors: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  NORMAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  LOW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const priorityLabel: Record<string, string> = {
  HIGH: 'high', URGENT: 'high', NORMAL: 'medium', LOW: 'low',
};

const taskTypeIcons: Record<string, React.ElementType> = {
  QUALITY_REVIEW: Eye,
  DEDUP_REVIEW: GitMerge,
  OWNERSHIP_ASSIGN: UserCircle,
  DATA_CORRECTION: AlertTriangle,
  ENRICHMENT: TrendingUp,
};

const taskTypeLabel: Record<string, string> = {
  QUALITY_REVIEW: 'Review',
  DEDUP_REVIEW: 'Merge',
  OWNERSHIP_ASSIGN: 'Ownership',
  DATA_CORRECTION: 'Quality',
  ENRICHMENT: 'Enrichment',
};

const statusBadge: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  IN_PROGRESS: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CANCELLED: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  ESCALATED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const grStatusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  conflict: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const severityColors: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataStewardshipPage() {
  const { token, user } = useAppStore();
  const perms = usePermissions();
  const navigate = useAppStore((s) => s.navigate);
  const [activeTab, setActiveTab] = useState('tasks');
  const [selectedTask, setSelectedTask] = useState<StewardshipTask | null>(null);
  const [selectedGoldenRecord, setSelectedGoldenRecord] = useState<GoldenRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // API data
  const [tasks, setTasks] = useState<StewardshipTask[]>([]);
  const [approvalTasks, setApprovalTasks] = useState<ApprovalTask[]>([]);
  const [summary, setSummary] = useState({ pending: 0, inProgress: 0, completed: 0, escalated: 0, total: 0 });
  const [domainOwnerships, setDomainOwnerships] = useState<DomainOwnership[]>([]);
  const [ownershipLoading, setOwnershipLoading] = useState(true);

  // Dialogs
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);

  // Dialog form state
  const [reviewNotes, setReviewNotes] = useState('');
  const [completeResolution, setCompleteResolution] = useState('');
  const [reassignUserId, setReassignUserId] = useState('');
  const [assignStewardModuleId, setAssignStewardModuleId] = useState('');
  const [assignStewardUserId, setAssignStewardUserId] = useState('');

  // Create task form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskModuleId, setNewTaskModuleId] = useState('');
  const [newTaskType, setNewTaskType] = useState('QUALITY_REVIEW');
  const [newTaskPriority, setNewTaskPriority] = useState('NORMAL');
  const [newTaskDescription, setNewTaskDescription] = useState('');

  // Users list for reassign/assign
  const [users, setUsers] = useState<{ id: string; username: string; displayName: string | null }[]>([]);

  // Alerts state (mutable)
  const [alerts, setAlerts] = useState<QualityAlert[]>(qualityAlerts);

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  const pendingTasks = summary.pending + approvalTasks.length;
  const highPriority = tasks.filter(t => (t.priority === 'HIGH' || t.priority === 'URGENT') && t.status === 'PENDING').length;
  const activeConflicts = goldenRecords.filter(g => g.status === 'conflict').length;
  const unassignedDomains = domainOwnerships.filter(d => !d.stewardAssigned).length;

  // Fetch stewardship tasks from API
  const loadTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTasks(data.tasks || []);
        setSummary(data.summary || { pending: 0, inProgress: 0, completed: 0, escalated: 0, total: 0 });
        setApprovalTasks(data.approvalTasks || []);
      }
    } catch {
      // fallback to empty
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch ownership data from API
  const loadOwnershipData = useCallback(async () => {
    if (!token) return;
    setOwnershipLoading(true);
    try {
      const [qualRes, modRes] = await Promise.all([
        fetch('/api/data-quality', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const qualData = qualRes.ok ? await qualRes.json() : null;
      const modData = modRes.ok ? await modRes.json() : null;

      if (modData?.modules) {
        const ownerships: DomainOwnership[] = modData.modules
          .filter((m: any) => m.isActive !== false)
          .map((m: any) => {
            const modQual = qualData?.moduleBreakdown?.find((q: any) => q.moduleId === m.id);
            return {
              domain: m.moduleName,
              moduleCode: m.moduleCode,
              moduleId: m.id,
              owner: 'Unassigned',
              ownerEmail: '',
              recordCount: modQual?.totalRecords ?? 0,
              qualityScore: modQual?.overall ?? 0,
              lastUpdated: new Date(m.updatedAt || Date.now()).toLocaleDateString('en-CA'),
              stewardAssigned: false,
            };
          });

        setDomainOwnerships(ownerships);
      }
    } catch {
      setDomainOwnerships([]);
    } finally {
      setOwnershipLoading(false);
    }
  }, [token]);

  // Fetch users for reassign/assign
  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/users?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setUsers(data.users.map((u: any) => ({ id: u.id, username: u.username, displayName: u.displayName })));
      }
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    loadTasks();
    loadOwnershipData();
    loadUsers();
  }, [loadTasks, loadOwnershipData, loadUsers]);

  // ── Action handlers ────────────────────────────────────────────

  const handleStartReview = async () => {
    if (!selectedTask || !token) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTask.id, status: 'IN_PROGRESS' }),
      });
      if (res.ok) {
        toast.success('Review started successfully');
        setReviewDialogOpen(false);
        setSelectedTask(null);
        loadTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to start review');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartMerge = async () => {
    if (!selectedTask || !token) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTask.id, status: 'IN_PROGRESS' }),
      });
      if (res.ok) {
        toast.success('Merge process started. Navigate to Data Quality > Deduplication to complete the merge.');
        setMergeDialogOpen(false);
        setSelectedTask(null);
        loadTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to start merge');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteTask = async () => {
    if (!selectedTask || !token) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTask.id, status: 'COMPLETED', resolution: completeResolution || 'Completed by ' + (user?.username || 'steward') }),
      });
      if (res.ok) {
        toast.success('Task completed successfully');
        setCompleteDialogOpen(false);
        setCompleteResolution('');
        setSelectedTask(null);
        loadTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to complete task');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedTask || !token || !reassignUserId) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTask.id, assignedTo: reassignUserId }),
      });
      if (res.ok) {
        toast.success('Task reassigned successfully');
        setReassignDialogOpen(false);
        setReassignUserId('');
        setSelectedTask(null);
        loadTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to reassign');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismissTask = async () => {
    if (!selectedTask || !token) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTask.id, status: 'CANCELLED', resolution: 'Dismissed by ' + (user?.username || 'steward') }),
      });
      if (res.ok) {
        toast.success('Task dismissed');
        setSelectedTask(null);
        loadTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to dismiss task');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!token || !newTaskTitle || !newTaskModuleId) {
      toast.error('Title and Module are required');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: newTaskModuleId,
          title: newTaskTitle,
          taskType: newTaskType,
          priority: newTaskPriority,
          description: newTaskDescription,
        }),
      });
      if (res.ok) {
        toast.success('Task created successfully');
        setCreateTaskDialogOpen(false);
        setNewTaskTitle('');
        setNewTaskDescription('');
        setNewTaskModuleId('');
        setNewTaskType('QUALITY_REVIEW');
        setNewTaskPriority('NORMAL');
        loadTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to create task');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSteward = async () => {
    if (!token || !assignStewardModuleId || !assignStewardUserId) {
      toast.error('Module and Steward user are required');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/stewardship', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: assignStewardModuleId,
          title: `Assign data steward for ${domainOwnerships.find(d => d.moduleId === assignStewardModuleId)?.domain || 'module'}`,
          taskType: 'OWNERSHIP_ASSIGN',
          priority: 'NORMAL',
          assignedTo: assignStewardUserId,
          description: 'Data steward ownership assignment',
        }),
      });
      if (res.ok) {
        toast.success('Steward assignment task created successfully');
        setAssignDialogOpen(false);
        setAssignStewardModuleId('');
        setAssignStewardUserId('');
        loadTasks();
        loadOwnershipData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to assign steward');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveAlert = (alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, resolved: true } : a));
    toast.success('Alert resolved');
  };

  const handleViewSourceRecords = (gr: GoldenRecord) => {
    setSelectedGoldenRecord(null);
    navigate('data-records');
  };

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Stewardship</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage data ownership, golden records, and stewardship tasks across your MDM domains.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs">
            <Clock className="w-3.5 h-3.5" />
            {pendingTasks} Pending
          </Badge>
          {highPriority > 0 && (
            <Badge className="gap-1.5 px-3 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              {highPriority} High Priority
            </Badge>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => { loadTasks(); loadOwnershipData(); }}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending Tasks', value: pendingTasks, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Golden Records', value: goldenRecords.length, icon: Crown, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Active Conflicts', value: activeConflicts, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' },
          { label: 'Unassigned Domains', value: unassignedDomains, icon: UserCircle, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900/30' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
          >
            <Card className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                  </div>
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', card.bg)}>
                    <card.icon className={cn('w-5 h-5', card.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="tasks" className="gap-1.5">
            <Layers className="w-4 h-4 hidden sm:block" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="golden-record" className="gap-1.5">
            <Crown className="w-4 h-4 hidden sm:block" />
            Golden Record
          </TabsTrigger>
          <TabsTrigger value="ownership" className="gap-1.5">
            <Users className="w-4 h-4 hidden sm:block" />
            Ownership
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <AlertCircle className="w-4 h-4 hidden sm:block" />
            Alerts
          </TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Stewardship Tasks</CardTitle>
                  <CardDescription>Pending reviews, ownership assignments, and data quality issues requiring attention.</CardDescription>
                </div>
                <Button
                  className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                  size="sm"
                  onClick={() => setCreateTaskDialogOpen(true)}
                  disabled={!perms.canCreate}
                >
                  <Plus className="w-3.5 h-3.5" /> New Task
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden md:table-cell">Module</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Assignee</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* DB Tasks */}
                    {tasks.map((task) => {
                      const Icon = taskTypeIcons[task.taskType] || AlertTriangle;
                      const typeLabel = taskTypeLabel[task.taskType] || task.taskType;
                      return (
                        <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTask(task)}>
                          <TableCell className="font-mono text-xs">{task.id.slice(0, 8)}...</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs">{typeLabel}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{task.title}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="text-[10px]">{task.module?.moduleName || '—'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('text-[10px] border-0', priorityColors[task.priority] || priorityColors.NORMAL)}>{priorityLabel[task.priority] || task.priority.toLowerCase()}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('text-[10px] border-0', statusBadge[task.status] || statusBadge.PENDING)}>{task.status.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{task.assignee?.displayName || task.assignee?.username || '—'}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Approval Tasks */}
                    {approvalTasks.map((task) => {
                      const Icon = Eye;
                      return (
                        <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50 bg-sky-50/30 dark:bg-sky-950/10" onClick={() => {
                          setSelectedTask({
                            ...task,
                            description: task.title,
                            assignedBy: null,
                            dueDate: task.dueDate,
                            resolution: null,
                            context: null,
                            recordId: task.recordId,
                            assignee: null,
                            assigner: null,
                          } as StewardshipTask);
                        }}>
                          <TableCell className="font-mono text-xs">{task.id.slice(0, 8)}...</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-sky-500" />
                              <span className="text-xs">Approval</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{task.title}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="text-[10px]">{task.module?.moduleName || '—'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('text-[10px] border-0', priorityColors[task.priority] || priorityColors.NORMAL)}>{priorityLabel[task.priority] || task.priority.toLowerCase()}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className="text-[10px] border-0 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Approval</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">—</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {tasks.length === 0 && approvalTasks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No stewardship tasks found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Golden Record Tab */}
        <TabsContent value="golden-record">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {goldenRecords.map((gr) => (
              <motion.div
                key={gr.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedGoldenRecord(gr)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Crown className={cn('w-4 h-4', gr.confidence >= 90 ? 'text-emerald-500' : gr.confidence >= 75 ? 'text-amber-500' : 'text-red-500')} />
                        <h3 className="font-semibold text-sm">{gr.domain}</h3>
                      </div>
                      <Badge className={cn('text-[10px] border-0', grStatusColors[gr.status])}>{gr.status.replace('_', ' ')}</Badge>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Source Records</span>
                        <span className="font-medium text-foreground">{gr.recordCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Survivor Source</span>
                        <span className="font-medium text-foreground text-xs">{gr.survivorSource}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Confidence</span>
                        <span className={cn('font-bold', gr.confidence >= 90 ? 'text-emerald-600' : gr.confidence >= 75 ? 'text-amber-600' : 'text-red-600')}>{gr.confidence}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Merged</span>
                        <span className="font-medium text-foreground">{gr.lastMerged}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Ownership Tab */}
        <TabsContent value="ownership">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Record Ownership</CardTitle>
                  <CardDescription>Data domain ownership assignments and stewardship responsibility mapping.</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={loadOwnershipData}>
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {ownershipLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-lg border p-4 space-y-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                      <div className="grid grid-cols-3 gap-2">
                        <Skeleton className="h-12 rounded-md" />
                        <Skeleton className="h-12 rounded-md" />
                        <Skeleton className="h-12 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : domainOwnerships.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No domain ownership data available</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {domainOwnerships.map((domain) => (
                    <motion.div
                      key={domain.moduleId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border p-4 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-sm">{domain.domain}</h3>
                          <p className="text-[10px] text-muted-foreground font-mono">{domain.moduleCode}</p>
                          {!domain.stewardAssigned ? (
                            <Badge className="mt-1 text-xs border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                              <UserCircle className="w-3 h-3 mr-1" /> No steward assigned
                            </Badge>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {domain.owner} &middot; {domain.ownerEmail}
                            </p>
                          )}
                        </div>
                        <UserCircle className={cn('w-5 h-5', !domain.stewardAssigned ? 'text-red-400' : 'text-muted-foreground')} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-lg font-bold">{domain.recordCount}</p>
                          <p className="text-[10px] text-muted-foreground">Records</p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className={cn('text-lg font-bold', domain.qualityScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : domain.qualityScore >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                            {domain.qualityScore > 0 ? `${domain.qualityScore}%` : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Quality</p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-xs font-medium mt-1">{domain.lastUpdated}</p>
                          <p className="text-[10px] text-muted-foreground">Updated</p>
                        </div>
                      </div>
                      {!domain.stewardAssigned && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-3 gap-1.5 text-xs h-8"
                          disabled={!perms.canEdit}
                          onClick={() => {
                            setAssignStewardModuleId(domain.moduleId);
                            setAssignStewardUserId('');
                            setAssignDialogOpen(true);
                          }}
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Assign Steward
                        </Button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Data Quality Alerts</CardTitle>
              <CardDescription>Active quality issues and alerts across all data domains.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                <div className="divide-y">
                  {alerts.map((alert) => (
                    <div key={alert.id} className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30',
                      alert.resolved && 'opacity-50'
                    )}>
                      <span className={cn('mt-1 w-2 h-2 rounded-full shrink-0', severityColors[alert.severity])} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate">{alert.message}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] h-5">{alert.domain}</Badge>
                          <span>{new Date(alert.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          {alert.resolved && <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Resolved</Badge>}
                        </div>
                      </div>
                      {!alert.resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => handleResolveAlert(alert.id)}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Task Detail Dialog ──────────────────────────────────── */}
      <Dialog open={!!selectedTask && !reviewDialogOpen && !mergeDialogOpen && !completeDialogOpen && !reassignDialogOpen} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask && (() => {
                const Icon = taskTypeIcons[selectedTask.taskType] || AlertTriangle;
                return <Icon className="w-5 h-5 text-muted-foreground" />;
              })()}
              {selectedTask?.title}
            </DialogTitle>
            <DialogDescription>{selectedTask?.description}</DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Task ID:</span> <span className="font-mono">{selectedTask.id.slice(0, 12)}...</span></div>
                <div><span className="text-muted-foreground">Module:</span> <Badge variant="outline">{selectedTask.module?.moduleName || '—'}</Badge></div>
                <div><span className="text-muted-foreground">Priority:</span> <Badge className={cn('border-0', priorityColors[selectedTask.priority] || priorityColors.NORMAL)}>{priorityLabel[selectedTask.priority] || selectedTask.priority.toLowerCase()}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={cn('border-0', statusBadge[selectedTask.status] || statusBadge.PENDING)}>{selectedTask.status.replace('_', ' ')}</Badge></div>
                <div><span className="text-muted-foreground">Assignee:</span> <span>{selectedTask.assignee?.displayName || selectedTask.assignee?.username || 'Unassigned'}</span></div>
                <div><span className="text-muted-foreground">Created:</span> <span>{new Date(selectedTask.createdAt).toLocaleDateString()}</span></div>
              </div>
              {selectedTask.resolution && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Resolution:</span> <span>{selectedTask.resolution}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center gap-2 flex-wrap">
                {selectedTask.taskType === 'DEDUP_REVIEW' && selectedTask.status === 'PENDING' && (
                  <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white" disabled={!perms.canEdit} onClick={() => setMergeDialogOpen(true)}>
                    <GitMerge className="w-4 h-4" />
                    Start Merge
                  </Button>
                )}
                {selectedTask.taskType === 'QUALITY_REVIEW' && selectedTask.status === 'PENDING' && (
                  <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white" disabled={!perms.canApprove} onClick={() => setReviewDialogOpen(true)}>
                    <Eye className="w-4 h-4" />
                    Start Review
                  </Button>
                )}
                {(selectedTask.status === 'IN_PROGRESS') && (
                  <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!perms.canEdit} onClick={() => setCompleteDialogOpen(true)}>
                    <CheckCircle2 className="w-4 h-4" />
                    Complete
                  </Button>
                )}
                {selectedTask.status !== 'COMPLETED' && selectedTask.status !== 'CANCELLED' && (
                  <>
                    <Button variant="outline" disabled={!perms.canEdit} onClick={() => setReassignDialogOpen(true)}>Reassign</Button>
                    <Button variant="ghost" className="ml-auto" disabled={!perms.canEdit} onClick={handleDismissTask}>Dismiss</Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Review Dialog ───────────────────────────────────────── */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Review Task
            </DialogTitle>
            <DialogDescription>Start reviewing this task. The status will be updated to In Progress.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="font-medium text-sm">{selectedTask?.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedTask?.description}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Review Notes (optional)</label>
              <Textarea
                placeholder="Add notes about your review..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleStartReview} disabled={actionLoading}>
              {actionLoading ? 'Starting...' : 'Start Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Merge Dialog ───────────────────────────────────────── */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="w-5 h-5" /> Merge Duplicate Records
            </DialogTitle>
            <DialogDescription>Start the deduplication merge process. You&apos;ll be redirected to the Data Quality deduplication panel.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="font-medium text-sm">{selectedTask?.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedTask?.description}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              The task status will be set to In Progress. After confirming, navigate to
              <Button variant="link" className="h-auto p-0 px-1 text-red-600" onClick={() => { setMergeDialogOpen(false); setSelectedTask(null); navigate('data-quality'); }}>
                Data Quality → Deduplication
              </Button>
              to complete the merge.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleStartMerge} disabled={actionLoading}>
              {actionLoading ? 'Starting...' : 'Start Merge Process'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Complete Task Dialog ────────────────────────────────── */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Complete Task
            </DialogTitle>
            <DialogDescription>Mark this task as completed with a resolution note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="font-medium text-sm">{selectedTask?.title}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Resolution</label>
              <Textarea
                placeholder="Describe how the task was resolved..."
                value={completeResolution}
                onChange={(e) => setCompleteResolution(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCompleteDialogOpen(false); setCompleteResolution(''); }}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCompleteTask} disabled={actionLoading}>
              {actionLoading ? 'Completing...' : 'Complete Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reassign Dialog ────────────────────────────────────── */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5" /> Reassign Task
            </DialogTitle>
            <DialogDescription>Assign this task to another steward.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="font-medium text-sm">{selectedTask?.title}</p>
              <p className="text-xs text-muted-foreground mt-1">Current assignee: {selectedTask?.assignee?.displayName || selectedTask?.assignee?.username || 'Unassigned'}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Assign to</label>
              <Select value={reassignUserId} onValueChange={setReassignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReassignDialogOpen(false); setReassignUserId(''); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleReassign} disabled={actionLoading || !reassignUserId}>
              {actionLoading ? 'Reassigning...' : 'Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Task Dialog ─────────────────────────────────── */}
      <Dialog open={createTaskDialogOpen} onOpenChange={setCreateTaskDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Create Stewardship Task
            </DialogTitle>
            <DialogDescription>Create a new stewardship task for data governance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title *</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Task title..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Module *</label>
                <Select value={newTaskModuleId} onValueChange={setNewTaskModuleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select module..." />
                  </SelectTrigger>
                  <SelectContent>
                    {domainOwnerships.map((d) => (
                      <SelectItem key={d.moduleId} value={d.moduleId}>{d.domain}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Task Type</label>
                <Select value={newTaskType} onValueChange={setNewTaskType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUALITY_REVIEW">Quality Review</SelectItem>
                    <SelectItem value="DEDUP_REVIEW">Dedup Review</SelectItem>
                    <SelectItem value="OWNERSHIP_ASSIGN">Ownership Assign</SelectItem>
                    <SelectItem value="DATA_CORRECTION">Data Correction</SelectItem>
                    <SelectItem value="ENRICHMENT">Enrichment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Priority</label>
              <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Textarea
                placeholder="Describe the task..."
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTaskDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCreateTask} disabled={actionLoading || !newTaskTitle || !newTaskModuleId}>
              {actionLoading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Steward Dialog ──────────────────────────────── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Assign Data Steward
            </DialogTitle>
            <DialogDescription>Assign a data steward to take ownership of this domain.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="font-medium text-sm">{domainOwnerships.find(d => d.moduleId === assignStewardModuleId)?.domain || 'Domain'}</p>
              <p className="text-xs text-muted-foreground mt-1">This will create an ownership assignment task.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Assign Steward *</label>
              <Select value={assignStewardUserId} onValueChange={setAssignStewardUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignDialogOpen(false); setAssignStewardUserId(''); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleAssignSteward} disabled={actionLoading || !assignStewardUserId}>
              {actionLoading ? 'Assigning...' : 'Assign Steward'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Golden Record Detail Dialog ─────────────────────────── */}
      <Dialog open={!!selectedGoldenRecord} onOpenChange={(open) => !open && setSelectedGoldenRecord(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              Golden Record: {selectedGoldenRecord?.domain}
            </DialogTitle>
            <DialogDescription>Survivor selection and merge tracking for this data domain.</DialogDescription>
          </DialogHeader>
          {selectedGoldenRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Record ID:</span> <span className="font-mono">{selectedGoldenRecord.id}</span></div>
                <div><span className="text-muted-foreground">Source Records:</span> <span className="font-medium">{selectedGoldenRecord.recordCount}</span></div>
                <div><span className="text-muted-foreground">Survivor Source:</span> <span>{selectedGoldenRecord.survivorSource}</span></div>
                <div><span className="text-muted-foreground">Confidence:</span> <span className={cn('font-bold', selectedGoldenRecord.confidence >= 90 ? 'text-emerald-600' : selectedGoldenRecord.confidence >= 75 ? 'text-amber-600' : 'text-red-600')}>{selectedGoldenRecord.confidence}%</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={cn('border-0', grStatusColors[selectedGoldenRecord.status])}>{selectedGoldenRecord.status.replace('_', ' ')}</Badge></div>
                <div><span className="text-muted-foreground">Last Merged:</span> <span>{selectedGoldenRecord.lastMerged}</span></div>
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white" disabled={!perms.canEdit} onClick={() => {
                  toast.success('Merge process initiated. Navigate to Data Quality → Deduplication to complete.');
                  setSelectedGoldenRecord(null);
                  navigate('data-quality');
                }}>
                  <GitMerge className="w-4 h-4" />
                  Run Merge
                </Button>
                <Button variant="outline" onClick={() => handleViewSourceRecords(selectedGoldenRecord)}>View Source Records</Button>
                {selectedGoldenRecord.status === 'conflict' && (
                  <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" disabled={!perms.canEdit} onClick={() => {
                    toast.success('Conflict resolution initiated. The golden record has been flagged for review.');
                    setSelectedGoldenRecord(null);
                  }}>
                    <AlertTriangle className="w-4 h-4" />
                    Resolve Conflict
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
