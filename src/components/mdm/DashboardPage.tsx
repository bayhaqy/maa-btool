'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Database, FileText, GitBranch, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, Package, DollarSign, Building2, Store,
  Truck, Tag, Gift, Users, Shield, Clock, Activity,
  TrendingUp, TrendingDown, Zap, BarChart3, Upload,
  Sparkles, ChevronRight, Eye, Pencil, ThumbsUp, XCircle,
  Trash2, RefreshCw, Layers, Target, Timer, FileCheck,
  Copy, AlertCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Constants
// ============================================================================

const moduleIcons: Record<string, React.ElementType> = {
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift,
};

const PIE_COLORS: Record<string, string> = {
  DRAFT: '#9ca3af',
  IN_REVIEW: '#f59e0b',
  ACTIVE: '#DC2626',
  REVISION_PENDING: '#0ea5e9',
  REJECTED: '#ef4444',
  ARCHIVED: '#64748b',
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  CREATE: Plus,
  UPDATE: Pencil,
  APPROVE: ThumbsUp,
  REJECT: XCircle,
  DELETE: Trash2,
};

const ACTIVITY_COLORS: Record<string, string> = {
  CREATE: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',
  UPDATE: 'text-slate-600 bg-slate-50 dark:bg-slate-800',
  APPROVE: 'text-green-600 bg-green-50 dark:bg-green-900/30',
  REJECT: 'text-red-600 bg-red-50 dark:bg-red-900/30',
  DELETE: 'text-red-600 bg-red-50 dark:bg-red-900/30',
};

const PIPELINE_STAGES = [
  { key: 'DRAFT', label: 'Draft', color: 'bg-gray-400', textColor: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-800' },
  { key: 'IN_REVIEW', label: 'In Review', color: 'bg-amber-500', textColor: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  { key: 'ACTIVE', label: 'Approved', color: 'bg-emerald-500', textColor: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
];

// ============================================================================
// Interfaces
// ============================================================================

interface DashboardData {
  stats: {
    totalModules: number;
    totalRecords: number;
    activeRecords: number;
    draftRecords: number;
    inReviewRecords: number;
    pendingApprovals: number;
    overdueTasks: number;
    myTasks: number;
    approvedToday: number;
    rejectedToday: number;
  };
  recordsByModule: Array<{
    id: string;
    moduleName: string;
    moduleCode: string;
    moduleIcon: string;
    recordCount: number;
    fieldCount: number;
    activeCount: number;
    draftCount: number;
    updatedAt: string;
  }>;
  statusDistribution: Array<{ status: string; count: number }>;
  pipelineCounts: Record<string, number>;
  dataQuality: {
    overall: number;
    completeness: number;
    accuracy: number;
    consistency: number;
    timeliness: number;
    uniqueness: number;
  };
  governance: {
    businessRulesCompliance: number;
    approvalCompletionRate: number;
    avgTimeToApprove: number;
    trend: Array<{ day: string; score: number }>;
  };
  recentActivity: Array<{
    id: string;
    status: string;
    moduleName: string;
    companyCode: string;
    updatedAt: string;
    action: string;
  }>;
  goldenRecords: {
    total: number;
    recentlyUpdated: number;
    recentlyMerged: number;
    byDomain: Array<{ domain: string; count: number }>;
  };
}

// ============================================================================
// Helper Hooks & Components
// ============================================================================

function useAnimatedCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (prevTarget.current === target) return;
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) { setCount(target); return; }
    const startTime = performance.now();
    let rafId: number;
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + diff * eased));
      if (progress < 1) { rafId = requestAnimationFrame(animate); }
      else { prevTarget.current = target; }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return count;
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#d97706';
  return '#DC2626';
}

function getScoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreBgClass(score: number): string {
  if (score >= 80) return 'from-emerald-500 to-green-600';
  if (score >= 60) return 'from-amber-500 to-orange-500';
  return 'from-red-500 to-rose-600';
}

// Circular gauge component
function QualityGauge({ score, size = 180 }: { score: number; size?: number }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  const animScore = useAnimatedCounter(score, 1500);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-4xl font-bold tabular-nums', getScoreColorClass(score))}>
          {animScore}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">out of 100</span>
      </div>
    </div>
  );
}

// Quality dimension bar
function QualityBar({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const color = getScoreColor(score);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">{label}</span>
        </div>
        <span className={cn('font-semibold tabular-nums', getScoreColorClass(score))}>{score}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function DashboardPage() {
  const { token, navigate } = useAppStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const animatedTotal = useAnimatedCounter(data?.stats.totalRecords ?? 0);
  const animatedActive = useAnimatedCounter(data?.stats.activeRecords ?? 0);
  const animatedPending = useAnimatedCounter(data?.stats.pendingApprovals ?? 0);
  const animatedModules = useAnimatedCounter(data?.stats.totalModules ?? 0);

  useEffect(() => {
    loadDashboard();
  }, [token]);

  const loadDashboard = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, recordsByModule, statusDistribution, pipelineCounts, dataQuality, governance, recentActivity, goldenRecords } = data;

  // Radar data for quality dimensions
  const radarData = [
    { dimension: 'Completeness', value: dataQuality.completeness },
    { dimension: 'Accuracy', value: dataQuality.accuracy },
    { dimension: 'Consistency', value: dataQuality.consistency },
    { dimension: 'Timeliness', value: dataQuality.timeliness },
    { dimension: 'Uniqueness', value: dataQuality.uniqueness },
  ];

  // Pipeline total
  const pipelineTotal = Object.values(pipelineCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* ═══════════════════════════════════════════════════════════
          TOP ROW: Data Quality Score + Stat Cards + Stewardship
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── A. Data Quality Score (prominent, top-left) ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:col-span-4"
        >
          <Card className="shadow-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-red-600" />
                    Data Quality Score
                  </CardTitle>
                  <CardDescription>Overall master data health</CardDescription>
                </div>
                <Badge className={cn(
                  'text-xs font-semibold border',
                  dataQuality.overall >= 80
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                    : dataQuality.overall >= 60
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                )}>
                  {dataQuality.overall >= 80 ? 'Healthy' : dataQuality.overall >= 60 ? 'Needs Attention' : 'Critical'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center pt-2">
              <QualityGauge score={dataQuality.overall} />
              <div className="w-full mt-5 space-y-3">
                <QualityBar label="Completeness" score={dataQuality.completeness} icon={Database} />
                <QualityBar label="Accuracy" score={dataQuality.accuracy} icon={CheckCircle2} />
                <QualityBar label="Consistency" score={dataQuality.consistency} icon={Layers} />
                <QualityBar label="Timeliness" score={dataQuality.timeliness} icon={Clock} />
                <QualityBar label="Uniqueness" score={dataQuality.uniqueness} icon={Shield} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Right column: Stat Cards + Stewardship + Golden Records ── */}
        <div className="lg:col-span-8 space-y-6">
          {/* ── Stat Cards Row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Records', value: animatedTotal, icon: FileText, color: 'from-red-500 to-rose-600', bg: 'from-red-50/80 to-rose-50/50 dark:from-red-900/20 dark:to-rose-900/10' },
              { label: 'Active Records', value: animatedActive, icon: CheckCircle2, color: 'from-emerald-500 to-green-600', bg: 'from-emerald-50/80 to-green-50/50 dark:from-emerald-900/20 dark:to-green-900/10' },
              { label: 'Pending Approvals', value: animatedPending, icon: GitBranch, color: 'from-amber-500 to-orange-500', bg: 'from-amber-50/80 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/10' },
              { label: 'Total Modules', value: animatedModules, icon: Database, color: 'from-slate-700 to-slate-900', bg: 'from-slate-50/80 to-slate-100/50 dark:from-slate-800/20 dark:to-slate-900/10' },
            ].map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <Card className="shadow-sm overflow-hidden relative group hover:shadow-md transition-shadow duration-300">
                  <div className={cn('absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b', card.color)} />
                  <div className={cn('absolute inset-0 bg-gradient-to-br opacity-40', card.bg)} />
                  <CardContent className="p-4 relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                        <p className="text-2xl font-bold tabular-nums mt-1">{card.value.toLocaleString()}</p>
                      </div>
                      <div className={cn('p-2 rounded-xl bg-gradient-to-br shadow-md', card.color)}>
                        <card.icon className="text-white w-4 h-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* ── B. Golden Record Statistics + C. Stewardship Tasks ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Golden Record Statistics */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <Card className="shadow-sm h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="w-4 h-4 text-red-600" />
                    Golden Record Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xl font-bold tabular-nums">{goldenRecords.total}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Total Records</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xl font-bold tabular-nums text-emerald-600">{goldenRecords.recentlyUpdated}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Updated 24h</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xl font-bold tabular-nums text-amber-600">{goldenRecords.recentlyMerged}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Merged 24h</p>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Records by Domain</p>
                    <div className="space-y-2">
                      {goldenRecords.byDomain.map((d) => {
                        const maxCount = Math.max(...goldenRecords.byDomain.map((x) => x.count), 1);
                        const pct = (d.count / maxCount) * 100;
                        return (
                          <div key={d.domain} className="flex items-center gap-3">
                            <span className="text-xs w-24 truncate font-medium">{d.domain}</span>
                            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-500"
                              />
                            </div>
                            <span className="text-xs font-semibold tabular-nums w-8 text-right">{d.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Stewardship Tasks Panel */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <Card className="shadow-sm h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-red-600" />
                    Stewardship Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-xl font-bold tabular-nums text-amber-600">{stats.pendingApprovals}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Pending</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-xl font-bold tabular-nums text-red-600">{stats.overdueTasks}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Overdue</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <p className="text-xl font-bold tabular-nums">{stats.myTasks}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">My Tasks</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Quick Actions</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline" size="sm" className="h-9 text-xs justify-start gap-2"
                        onClick={() => navigate('workflow')}
                      >
                        <ThumbsUp className="w-3.5 h-3.5 text-amber-600" />
                        Review Pending
                        {stats.pendingApprovals > 0 && (
                          <Badge className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 text-[10px] h-5 px-1.5">
                            {stats.pendingApprovals}
                          </Badge>
                        )}
                      </Button>
                      <Button
                        variant="outline" size="sm" className="h-9 text-xs justify-start gap-2"
                        onClick={() => navigate('data-records')}
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        Browse Records
                      </Button>
                      <Button
                        variant="outline" size="sm" className="h-9 text-xs justify-start gap-2"
                        onClick={() => navigate('bulk-import')}
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                        Bulk Import
                      </Button>
                      <Button
                        variant="outline" size="sm" className="h-9 text-xs justify-start gap-2"
                        onClick={() => navigate('ai-assistant')}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-red-600" />
                        AI Assistant
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          D. WORKFLOW PIPELINE
          ═══════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-red-600" />
                  Workflow Pipeline
                </CardTitle>
                <CardDescription>Record lifecycle from draft to active</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => navigate('workflow')}>
                  View Workflow <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              {PIPELINE_STAGES.map((stage, i) => {
                const count = pipelineCounts[stage.key] || 0;
                const pct = pipelineTotal > 0 ? Math.round((count / pipelineTotal) * 100) : 0;
                return (
                  <div key={stage.key} className="flex items-center flex-1 min-w-[140px]">
                    <button
                      onClick={() => navigate('data-records')}
                      className="flex-1 group"
                    >
                      <div className={cn(
                        'rounded-xl p-4 border-2 transition-all duration-200 group-hover:shadow-md',
                        'border-transparent group-hover:border-red-200 dark:group-hover:border-red-800',
                        stage.bg
                      )}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={cn('text-xs font-semibold', stage.textColor)}>{stage.label}</span>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                        <p className="text-2xl font-bold tabular-nums">{count}</p>
                        <div className="mt-2 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.5 + i * 0.15 }}
                            className={cn('h-full rounded-full', stage.color)}
                          />
                        </div>
                      </div>
                    </button>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <div className="mx-1 text-muted-foreground/40">
                        <ChevronRight className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                <span><span className="font-semibold text-emerald-600">{stats.approvedToday}</span> approved today</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <XCircle className="w-3.5 h-3.5 text-red-500" />
                <span><span className="font-semibold text-red-500">{stats.rejectedToday}</span> rejected today</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span><span className="font-semibold text-amber-500">{stats.overdueTasks}</span> overdue</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          E. DATA GOVERNANCE METRICS + STATUS DISTRIBUTION
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Governance Metrics + Quality Trend */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-600" />
                Data Governance Metrics
              </CardTitle>
              <CardDescription>Compliance and approval analytics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Metric Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[10px] text-muted-foreground">Rules Compliance</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-emerald-600">{governance.businessRulesCompliance}%</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ThumbsUp className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-[10px] text-muted-foreground">Approval Rate</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-amber-600">{governance.approvalCompletionRate}%</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Timer className="w-3.5 h-3.5 text-slate-600" />
                    <span className="text-[10px] text-muted-foreground">Avg Approve</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{governance.avgTimeToApprove}h</p>
                </div>
              </div>

              {/* 7-day Quality Trend */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-3">Quality Trend (7 days)</p>
                {governance.trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={governance.trend}>
                      <defs>
                        <linearGradient id="qualityTrendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#DC2626" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                          fontSize: '13px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#DC2626"
                        strokeWidth={2}
                        fill="url(#qualityTrendGrad)"
                        animationDuration={1000}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">No trend data</div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Status Distribution + Radar */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-600" />
                Status Distribution
              </CardTitle>
              <CardDescription>Current status breakdown across all records</CardDescription>
            </CardHeader>
            <CardContent>
              {statusDistribution.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No data available</div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={statusDistribution.map((s) => ({
                          name: STATUS_LABELS[s.status] || s.status,
                          value: s.count,
                          color: PIE_COLORS[s.status] || '#6b7280',
                        }))}
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        animationDuration={800}
                      >
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.status] || '#6b7280'} stroke="white" strokeWidth={2} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number, name: string) => {
                          const total = statusDistribution.reduce((s, d) => s + d.count, 0);
                          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                          return [`${value} (${pct}%)`, name];
                        }}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                          fontSize: '13px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 justify-center sm:flex-col sm:justify-start">
                    {statusDistribution.map((entry) => (
                      <button
                        key={entry.status}
                        onClick={() => navigate('data-records')}
                        className="flex items-center gap-2 text-sm hover:bg-accent/50 rounded-md px-2 py-1 transition-colors"
                      >
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[entry.status] || '#6b7280' }} />
                        <span className="text-muted-foreground">{STATUS_LABELS[entry.status] || entry.status}</span>
                        <span className="font-semibold">{entry.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          F. MODULE CARDS (enhanced) + RECENT ACTIVITY
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module Cards */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          className="lg:col-span-2"
        >
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-red-600" />
                  Module Overview
                </CardTitle>
                <CardDescription>Quality score per module with record stats</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('modules')} className="h-8 text-xs">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {recordsByModule.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No modules found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recordsByModule.map((m, i) => {
                    const Icon = moduleIcons[m.moduleIcon] || Database;
                    const qualityPct = m.recordCount > 0 ? Math.round((m.activeCount / m.recordCount) * 100) : 0;
                    const qualityColor = qualityPct >= 80 ? 'text-emerald-600' : qualityPct >= 60 ? 'text-amber-600' : 'text-red-600';
                    const qualityBg = qualityPct >= 80 ? 'bg-emerald-50 dark:bg-emerald-900/20' : qualityPct >= 60 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20';
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                      >
                        <div className="group flex items-start gap-3 p-4 rounded-xl border hover:bg-accent/50 hover:shadow-md hover:border-red-200 dark:hover:border-red-800 transition-all duration-200">
                          <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-200 shrink-0">
                            <Icon className="w-5 h-5 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium truncate">{m.moduleName}</p>
                              <div className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', qualityBg, qualityColor)}>
                                {qualityPct}% quality
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="font-semibold">{m.recordCount}</span> records
                              <span className="text-emerald-600">{m.activeCount} active</span>
                              <span className="text-gray-500">{m.draftCount} draft</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={qualityPct} className="h-1.5 flex-1" />
                              <span className="text-[10px] text-muted-foreground shrink-0">{m.fieldCount} fields</span>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-[10px] px-2 gap-1"
                                onClick={(e) => { e.stopPropagation(); navigate('data-records', { moduleId: m.id }); }}
                              >
                                <Eye className="w-3 h-3" /> Records
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-[10px] px-2 gap-1"
                                onClick={(e) => { e.stopPropagation(); navigate('grid-editor', { moduleId: m.id }); }}
                              >
                                <BarChart3 className="w-3 h-3" /> Grid
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-[10px] px-2 gap-1"
                                onClick={(e) => { e.stopPropagation(); navigate('record-detail', { moduleId: m.id }); }}
                              >
                                <Plus className="w-3 h-3" /> Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.9 }}
        >
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-red-600" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>Latest actions across modules</CardDescription>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadDashboard}>
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Refresh data</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No recent activity.</p>
              ) : (
                <div className="relative max-h-96 overflow-y-auto custom-scrollbar">
                  <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />
                  <div className="space-y-1">
                    <AnimatePresence initial={false}>
                      {recentActivity.map((activity) => {
                        const ActionIcon = ACTIVITY_ICONS[activity.action] || Clock;
                        const actionColor = ACTIVITY_COLORS[activity.action] || 'text-gray-500 bg-gray-50';
                        return (
                          <motion.div
                            key={activity.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors relative cursor-pointer"
                            onClick={() => navigate('data-records')}
                          >
                            <div className="relative shrink-0 z-10">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                                  {activity.moduleName.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className={cn(
                                'absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full shadow-sm',
                                actionColor
                              )}>
                                <ActionIcon className="w-2.5 h-2.5" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <p className="text-sm font-medium truncate">
                                {activity.action === 'CREATE' ? 'Created' : activity.action === 'UPDATE' ? 'Updated' : 'Approved'} record
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground">{activity.moduleName}</span>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">{getRelativeTime(activity.updatedAt)}</span>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] shrink-0 border', {
                                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300': activity.status === 'DRAFT',
                                'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': activity.status === 'IN_REVIEW',
                                'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400': activity.status === 'ACTIVE',
                              })}
                            >
                              {STATUS_LABELS[activity.status] || activity.status}
                            </Badge>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          RECORDS BY MODULE CHART (bottom)
          ═══════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 1.0 }}
      >
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-red-600" />
              Records by Module
            </CardTitle>
            <CardDescription>Distribution of records across master data domains</CardDescription>
          </CardHeader>
          <CardContent>
            {recordsByModule.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={recordsByModule.map((m) => ({
                  name: m.moduleName.length > 14 ? m.moduleName.substring(0, 14) + '…' : m.moduleName,
                  count: m.recordCount,
                  active: m.activeCount,
                  draft: m.draftCount,
                }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="barGradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#DC2626" stopOpacity={1} />
                      <stop offset="100%" stopColor="#DC2626" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="barGradActive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={1} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="count" fill="url(#barGradTotal)" radius={[4, 4, 0, 0]} maxBarSize={32} name="Total" animationDuration={800} />
                  <Bar dataKey="active" fill="url(#barGradActive)" radius={[4, 4, 0, 0]} maxBarSize={32} name="Active" animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Refresh indicator */}
      <div className="text-center">
        <p className="text-[10px] text-muted-foreground">
          Last refreshed: {lastRefresh.toLocaleTimeString()} · Data refreshes on page load
        </p>
      </div>
    </div>
  );
}
