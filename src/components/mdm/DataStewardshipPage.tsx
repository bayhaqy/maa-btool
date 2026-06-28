'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ShieldCheck, Users, Merge, AlertTriangle, CheckCircle2, Clock,
  ArrowRight, Eye, GitMerge, UserCircle, FileText, TrendingUp,
  AlertCircle, Layers, Crown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types & Mock Data
// ---------------------------------------------------------------------------

interface StewardshipTask {
  id: string;
  type: 'review' | 'merge' | 'ownership' | 'quality';
  title: string;
  description: string;
  domain: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  assignee: string;
  createdAt: string;
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
  owner: string;
  ownerEmail: string;
  recordCount: number;
  qualityScore: number;
  lastUpdated: string;
}

interface QualityAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  domain: string;
  timestamp: string;
  resolved: boolean;
}

const stewardshipTasks: StewardshipTask[] = [
  { id: 'ST-001', type: 'review', title: 'Review duplicate Article Master entries', description: '3 potential duplicates detected in Footwear category', domain: 'Product', priority: 'high', status: 'pending', assignee: 'admin', createdAt: '2025-01-15T10:30:00Z' },
  { id: 'ST-002', type: 'merge', title: 'Merge Supplier records: Nike ID vs Nike Indonesia', description: 'Two supplier records with overlapping data identified', domain: 'Supplier', priority: 'high', status: 'pending', assignee: 'admin', createdAt: '2025-01-15T09:15:00Z' },
  { id: 'ST-003', type: 'ownership', title: 'Assign data owner for Promotion module', description: 'No data steward assigned for promotional data domain', domain: 'Promotion', priority: 'medium', status: 'pending', assignee: '', createdAt: '2025-01-14T16:00:00Z' },
  { id: 'ST-004', type: 'quality', title: 'Fix null brand values in Article Master', description: '12 records with missing brand attribution need resolution', domain: 'Product', priority: 'medium', status: 'in_progress', assignee: 'admin', createdAt: '2025-01-14T14:20:00Z' },
  { id: 'ST-005', type: 'review', title: 'Validate Store Master address data', description: '5 store records with incomplete address fields flagged', domain: 'Store', priority: 'low', status: 'pending', assignee: 'admin', createdAt: '2025-01-13T11:00:00Z' },
  { id: 'ST-006', type: 'merge', title: 'Consolidate pricing records for Q1 campaign', description: 'Overlapping promotional prices need deduplication', domain: 'Pricing', priority: 'medium', status: 'pending', assignee: 'admin', createdAt: '2025-01-13T09:45:00Z' },
];

const goldenRecords: GoldenRecord[] = [
  { id: 'GR-001', domain: 'Product - Footwear', recordCount: 38, survivorSource: 'Article Master (SAP)', lastMerged: '2025-01-14', confidence: 96, status: 'active' },
  { id: 'GR-002', domain: 'Product - Apparel', recordCount: 24, survivorSource: 'Article Master (POS)', lastMerged: '2025-01-12', confidence: 91, status: 'active' },
  { id: 'GR-003', domain: 'Supplier', recordCount: 12, survivorSource: 'Vendor Master (ERP)', lastMerged: '2025-01-10', confidence: 78, status: 'pending_review' },
  { id: 'GR-004', domain: 'Store Locations', recordCount: 20, survivorSource: 'Store Master (CRM)', lastMerged: '2025-01-08', confidence: 85, status: 'conflict' },
  { id: 'GR-005', domain: 'Pricing', recordCount: 20, survivorSource: 'Pricing Master (SAP)', lastMerged: '2025-01-06', confidence: 93, status: 'active' },
];

const domainOwnerships: DomainOwnership[] = [
  { domain: 'Article Master', owner: 'Dewi Sartika', ownerEmail: 'dewi.s@mapactive.co.id', recordCount: 65, qualityScore: 87, lastUpdated: '2025-01-15' },
  { domain: 'Store Master', owner: 'Budi Santoso', ownerEmail: 'budi.s@mapactive.co.id', recordCount: 20, qualityScore: 72, lastUpdated: '2025-01-14' },
  { domain: 'Supplier Master', owner: 'Rina Wati', ownerEmail: 'rina.w@mapactive.co.id', recordCount: 12, qualityScore: 81, lastUpdated: '2025-01-13' },
  { domain: 'Pricing Master', owner: 'Andi Pratama', ownerEmail: 'andi.p@mapactive.co.id', recordCount: 20, qualityScore: 90, lastUpdated: '2025-01-12' },
  { domain: 'Promotion Master', owner: 'Unassigned', ownerEmail: '', recordCount: 12, qualityScore: 65, lastUpdated: '2025-01-10' },
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
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const taskTypeIcons: Record<string, React.ElementType> = {
  review: Eye,
  merge: GitMerge,
  ownership: UserCircle,
  quality: AlertTriangle,
};

const statusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
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
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState('tasks');
  const [selectedTask, setSelectedTask] = useState<StewardshipTask | null>(null);
  const [selectedGoldenRecord, setSelectedGoldenRecord] = useState<GoldenRecord | null>(null);

  const pendingTasks = stewardshipTasks.filter(t => t.status === 'pending').length;
  const highPriority = stewardshipTasks.filter(t => t.priority === 'high' && t.status === 'pending').length;
  const activeConflicts = goldenRecords.filter(g => g.status === 'conflict').length;
  const unassignedDomains = domainOwnerships.filter(d => d.owner === 'Unassigned').length;

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
              <CardTitle className="text-base">Stewardship Tasks</CardTitle>
              <CardDescription>Pending reviews, ownership assignments, and data quality issues requiring attention.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden md:table-cell">Domain</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Assignee</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stewardshipTasks.map((task) => {
                      const TypeIcon = taskTypeIcons[task.type];
                      return (
                        <TableRow key={task.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedTask(task)}>
                          <TableCell className="font-mono text-xs">{task.id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <TypeIcon className="w-4 h-4 text-muted-foreground" />
                              <span className="capitalize text-xs">{task.type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{task.title}</TableCell>
                          <TableCell className="hidden md:table-cell"><Badge variant="outline" className="text-xs">{task.domain}</Badge></TableCell>
                          <TableCell><Badge className={cn('text-xs border-0', priorityColors[task.priority])}>{task.priority}</Badge></TableCell>
                          <TableCell><Badge className={cn('text-xs border-0', statusBadge[task.status])}>{task.status.replace('_', ' ')}</Badge></TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{task.assignee || '—'}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
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
        </TabsContent>

        {/* Golden Record Tab */}
        <TabsContent value="golden-record">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Golden Record Management</CardTitle>
              <CardDescription>Survivor selection, record merging, and best-version tracking across data domains.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead className="hidden md:table-cell">Records</TableHead>
                      <TableHead className="hidden lg:table-cell">Survivor Source</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Last Merged</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {goldenRecords.map((gr) => (
                      <TableRow key={gr.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedGoldenRecord(gr)}>
                        <TableCell className="font-mono text-xs">{gr.id}</TableCell>
                        <TableCell className="font-medium text-sm">{gr.domain}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className="text-xs gap-1"><FileText className="w-3 h-3" />{gr.recordCount}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{gr.survivorSource}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  gr.confidence >= 90 ? 'bg-emerald-500' : gr.confidence >= 75 ? 'bg-amber-500' : 'bg-red-500'
                                )}
                                style={{ width: `${gr.confidence}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">{gr.confidence}%</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge className={cn('text-xs border-0', grStatusColors[gr.status])}>{gr.status.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{gr.lastMerged}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ownership Tab */}
        <TabsContent value="ownership">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Record Ownership</CardTitle>
              <CardDescription>Data domain ownership assignments and stewardship responsibility mapping.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {domainOwnerships.map((domain) => (
                  <motion.div
                    key={domain.domain}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border p-4 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-sm">{domain.domain}</h3>
                        {domain.owner === 'Unassigned' ? (
                          <Badge className="mt-1 text-xs border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Unassigned</Badge>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">{domain.owner} &middot; {domain.ownerEmail}</p>
                        )}
                      </div>
                      <UserCircle className={cn('w-5 h-5', domain.owner === 'Unassigned' ? 'text-red-400' : 'text-muted-foreground')} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-lg font-bold">{domain.recordCount}</p>
                        <p className="text-[10px] text-muted-foreground">Records</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className={cn('text-lg font-bold', domain.qualityScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{domain.qualityScore}%</p>
                        <p className="text-[10px] text-muted-foreground">Quality</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-xs font-medium mt-1">{domain.lastUpdated}</p>
                        <p className="text-[10px] text-muted-foreground">Updated</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
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
                  {qualityAlerts.map((alert) => (
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
                        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0">
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

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask && (() => {
                const Icon = taskTypeIcons[selectedTask.type];
                return <Icon className="w-5 h-5 text-muted-foreground" />;
              })()}
              {selectedTask?.title}
            </DialogTitle>
            <DialogDescription>{selectedTask?.description}</DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Task ID:</span> <span className="font-mono">{selectedTask.id}</span></div>
                <div><span className="text-muted-foreground">Domain:</span> <Badge variant="outline">{selectedTask.domain}</Badge></div>
                <div><span className="text-muted-foreground">Priority:</span> <Badge className={cn('border-0', priorityColors[selectedTask.priority])}>{selectedTask.priority}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={cn('border-0', statusBadge[selectedTask.status])}>{selectedTask.status.replace('_', ' ')}</Badge></div>
                <div><span className="text-muted-foreground">Assignee:</span> <span>{selectedTask.assignee || 'Unassigned'}</span></div>
                <div><span className="text-muted-foreground">Created:</span> <span>{new Date(selectedTask.createdAt).toLocaleDateString()}</span></div>
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                {selectedTask.type === 'merge' && (
                  <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                    <GitMerge className="w-4 h-4" />
                    Start Merge
                  </Button>
                )}
                {selectedTask.type === 'review' && (
                  <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                    <Eye className="w-4 h-4" />
                    Start Review
                  </Button>
                )}
                <Button variant="outline">Reassign</Button>
                <Button variant="ghost" className="ml-auto">Dismiss</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Golden Record Detail Dialog */}
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
                <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                  <GitMerge className="w-4 h-4" />
                  Run Merge
                </Button>
                <Button variant="outline">View Source Records</Button>
                {selectedGoldenRecord.status === 'conflict' && (
                  <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
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
