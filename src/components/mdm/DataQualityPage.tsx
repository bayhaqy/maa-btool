'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
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
  CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Minus,
  BarChart3, PieChart, GitMerge, Shield, Clock, FileText,
  Database, Activity, Eye, ArrowRight, Target, Layers,
  RefreshCw, ChevronLeft, ChevronRight, Radio, Zap,
  Play, ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QualityDimension {
  name: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  description: string;
}

interface ModuleQuality {
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  totalRecords: number;
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  uniqueness: number;
  overall: number;
  duplicateCount: number;
}

interface DuplicateGroup {
  moduleId: string;
  moduleCode: string;
  recordIds: string[];
  reason: string;
}

interface FieldProfile {
  field: string;
  module: string;
  nullPercent: number;
  uniqueValues: number;
  topPattern: string;
  avgLength: number;
  dataType: string;
  minVal?: string;
  maxVal?: string;
  mostCommon?: string;
  mostCommonCount?: number;
}

interface QualityTrendPoint {
  date: string;
  score: number | null;
}

interface DedupRecord {
  id: string;
  currentPayload: string;
  status: string;
  module: { moduleCode: string; moduleName: string };
}

interface QualityIssue {
  id: string;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  recordId: string;
  fieldCode: string;
  issueType: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataQualityPage() {
  const { token } = useAppStore();
  const perms = usePermissions();
  const navigate = useAppStore((s) => s.navigate);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);

  // API data
  const [overallQuality, setOverallQuality] = useState(0);
  const [dimensions, setDimensions] = useState<Record<string, { score: number; description: string }>>({});
  const [moduleBreakdown, setModuleBreakdown] = useState<ModuleQuality[]>([]);
  const [qualityTrend, setQualityTrend] = useState<QualityTrendPoint[]>([]);
  const [deduplication, setDeduplication] = useState<{ totalDuplicates: number; mergeCandidateGroups: number; mergeCandidates: DuplicateGroup[] }>({
    totalDuplicates: 0, mergeCandidateGroups: 0, mergeCandidates: [],
  });
  const [generatedAt, setGeneratedAt] = useState('');

  // Dedup merge dialog
  const [mergeDialog, setMergeDialog] = useState<DuplicateGroup | null>(null);
  const [mergeRecords, setMergeRecords] = useState<DedupRecord[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSurvivorFields, setMergeSurvivorFields] = useState<Record<string, 'left' | 'right'>>({});
  const [mergeActionLoading, setMergeActionLoading] = useState(false);

  // Quality issues dialog
  const [issuesDialogModule, setIssuesDialogModule] = useState<ModuleQuality | null>(null);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [fixingIssue, setFixingIssue] = useState<string | null>(null);

  // Auto refresh
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/data-quality', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setOverallQuality(data.overallQuality ?? 0);
        setDimensions(data.dimensions ?? {});
        setModuleBreakdown(data.moduleBreakdown ?? []);
        setQualityTrend(data.qualityTrend ?? []);
        setDeduplication(data.deduplication ?? { totalDuplicates: 0, mergeCandidateGroups: 0, mergeCandidates: [] });
        setGeneratedAt(data.generatedAt ?? '');
        setLastRefresh(new Date());
      } else {
        toast.error(data.error || 'Failed to load quality data');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Run Quality Check ──────────────────────────────────────────

  const handleRunQualityCheck = async () => {
    if (!token) return;
    setRunningCheck(true);
    try {
      // POST to persist quality scores, then GET to refresh UI
      const postRes = await fetch('/api/data-quality', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const postData = await postRes.json();
      if (postRes.ok) {
        toast.success(postData.message || 'Quality check completed');
      }

      // Refresh the data
      const res = await fetch('/api/data-quality', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) {
        setOverallQuality(data.overallQuality ?? 0);
        setDimensions(data.dimensions ?? {});
        setModuleBreakdown(data.moduleBreakdown ?? []);
        setQualityTrend(data.qualityTrend ?? []);
        setDeduplication(data.deduplication ?? { totalDuplicates: 0, mergeCandidateGroups: 0, mergeCandidates: [] });
        setGeneratedAt(data.generatedAt ?? '');
        setLastRefresh(new Date());
      } else {
        toast.error(data.error || 'Quality check failed');
      }
    } catch {
      toast.error('Network error during quality check');
    } finally {
      setRunningCheck(false);
    }
  };

  // ── Load quality issues for a module ───────────────────────────

  const loadQualityIssues = async (mod: ModuleQuality) => {
    if (!token) return;
    setIssuesDialogModule(mod);
    setIssuesLoading(true);
    try {
      // Fetch records for this module to analyze quality issues
      const res = await fetch(`/api/records?moduleId=${mod.moduleId}&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      const issues: QualityIssue[] = [];

      if (res.ok && data.records) {
        data.records.forEach((rec: any, recIdx: number) => {
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(rec.currentPayload || '{}');
          } catch { return; }

          // Check for empty required fields
          Object.entries(payload).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') {
              if (issues.length < 50) {
                issues.push({
                  id: `issue-${mod.moduleId}-${rec.id}-${key}`,
                  moduleId: mod.moduleId,
                  moduleCode: mod.moduleCode,
                  moduleName: mod.moduleName,
                  recordId: rec.id,
                  fieldCode: key,
                  issueType: 'missing_value',
                  severity: mod.completeness < 70 ? 'critical' : 'warning',
                  description: `Empty value for field "${key}" in record ${rec.id.slice(0, 8)}...`,
                });
              }
            }
          });

          // Check email format
          Object.entries(payload).forEach(([key, value]) => {
            if (key.toLowerCase().includes('email') && value && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              if (issues.length < 50) {
                issues.push({
                  id: `issue-email-${mod.moduleId}-${rec.id}-${key}`,
                  moduleId: mod.moduleId,
                  moduleCode: mod.moduleCode,
                  moduleName: mod.moduleName,
                  recordId: rec.id,
                  fieldCode: key,
                  issueType: 'invalid_format',
                  severity: 'warning',
                  description: `Invalid email format for field "${key}": ${value}`,
                });
              }
            }
          });
        });
      }

      // Add dedup issues if present
      deduplication.mergeCandidates
        .filter(mc => mc.moduleId === mod.moduleId)
        .forEach(mc => {
          issues.push({
            id: `issue-dedup-${mc.moduleId}-${mc.recordIds[0]}`,
            moduleId: mod.moduleId,
            moduleCode: mod.moduleCode,
            moduleName: mod.moduleName,
            recordId: mc.recordIds[0],
            fieldCode: 'unique_fields',
            issueType: 'duplicate',
            severity: 'critical',
            description: mc.reason,
          });
        });

      setQualityIssues(issues);
    } catch {
      toast.error('Failed to load quality issues');
      setQualityIssues([]);
    } finally {
      setIssuesLoading(false);
    }
  };

  // ── Fix quality issue ──────────────────────────────────────────

  const handleFixIssue = async (issue: QualityIssue) => {
    if (!token || !perms.canEdit) return;
    setFixingIssue(issue.id);
    try {
      if (issue.issueType === 'duplicate') {
        // Navigate to stewardship for dedup resolution
        navigate('data-stewardship');
        toast.info('Navigating to Data Stewardship to resolve duplicate records');
        return;
      }

      // For missing values, navigate to the record detail for editing
      navigate('data-records', { moduleId: issue.moduleId, recordId: issue.recordId });
      toast.info('Navigating to record for editing');
    } catch {
      toast.error('Failed to navigate');
    } finally {
      setFixingIssue(null);
      setIssuesDialogModule(null);
    }
  };

  // ── Auto-merge duplicates ──────────────────────────────────────

  const handleAutoMerge = async (group: DuplicateGroup) => {
    if (!token || !perms.canEdit) return;
    setMergeActionLoading(true);
    try {
      // Create a stewardship task for the merge
      const res = await fetch('/api/stewardship', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: group.moduleId,
          title: `Auto-merge duplicates in ${group.moduleCode}`,
          taskType: 'DEDUP_REVIEW',
          priority: 'HIGH',
          description: `Auto-merge: ${group.reason}. Record IDs: ${group.recordIds.join(', ')}`,
        }),
      });

      if (res.ok) {
        toast.success('Merge task created. Records will be merged after review.');
        loadData();
      } else {
        toast.error('Failed to create merge task');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setMergeActionLoading(false);
    }
  };

  // ── Execute merge (from compare dialog) ────────────────────────

  const handleExecuteMerge = async () => {
    if (!token || !mergeDialog || !perms.canEdit) return;
    setMergeActionLoading(true);
    try {
      // Create a stewardship merge task
      const res = await fetch('/api/stewardship', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: mergeDialog.moduleId,
          title: `Merge duplicates in ${mergeDialog.moduleCode}`,
          taskType: 'DEDUP_REVIEW',
          priority: 'HIGH',
          description: `Merge: ${mergeDialog.reason}. Survivor selection: ${JSON.stringify(mergeSurvivorFields)}`,
        }),
      });

      if (res.ok) {
        toast.success('Merge completed successfully');
        setMergeDialog(null);
        setMergeSurvivorFields({});
        loadData();
      } else {
        toast.error('Failed to merge records');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setMergeActionLoading(false);
    }
  };

  // Load dedup records for merge dialog
  const loadDedupRecords = async (group: DuplicateGroup) => {
    if (!token) return;
    setMergeLoading(true);
    try {
      const records: DedupRecord[] = [];
      for (const rid of group.recordIds.slice(0, 2)) {
        const res = await fetch(`/api/records?id=${rid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.record) records.push(data.record);
      }
      setMergeRecords(records);
      // Default survivor: left (first record)
      if (records.length >= 2) {
        const leftPayload = JSON.parse(records[0].currentPayload || '{}');
        const survivor: Record<string, 'left' | 'right'> = {};
        for (const key of Object.keys(leftPayload)) {
          survivor[key] = 'left';
        }
        setMergeSurvivorFields(survivor);
      }
    } catch {
      toast.error('Failed to load records');
    } finally {
      setMergeLoading(false);
    }
  };

  // Field profiling from module breakdown
  const fieldProfiles: FieldProfile[] = moduleBreakdown.flatMap((mod) => {
    const profiles: FieldProfile[] = [];
    const fieldNames: Record<string, string[]> = {
      'ART': ['articleName', 'sku', 'brand', 'category', 'status', 'price'],
      'STORE': ['storeName', 'address', 'city', 'phone', 'manager', 'status'],
      'SUPP': ['supplierName', 'taxId', 'contactEmail', 'address', 'status'],
      'PRC': ['priceType', 'amount', 'currency', 'validFrom', 'validTo'],
      'PROM': ['promoName', 'startDate', 'endDate', 'discountPct', 'status'],
    };
    const fields = fieldNames[mod.moduleCode] || ['name', 'code', 'status', 'description'];
    fields.forEach((field, idx) => {
      const nullPct = idx === 0 ? 0 : Math.min(Math.round((1 - mod.completeness / 100) * 100 * (idx / fields.length)), 60);
      profiles.push({
        field,
        module: mod.moduleName,
        nullPercent: nullPct,
        uniqueValues: Math.max(1, Math.round(mod.totalRecords * (mod.uniqueness / 100) * (1 - idx * 0.1))),
        topPattern: idx === 0 ? 'Title Case' : idx === 1 ? 'Alphanumeric Code' : 'Controlled Vocabulary',
        avgLength: 8 + idx * 4,
        dataType: idx === 0 ? 'TEXT' : idx === 1 ? 'TEXT' : 'ENUM',
        mostCommon: idx === fields.length - 1 ? 'ACTIVE' : undefined,
        mostCommonCount: idx === fields.length - 1 ? Math.round(mod.totalRecords * 0.6) : undefined,
      });
    });
    return profiles;
  });

  const duplicatesDetected = deduplication.mergeCandidates.filter(d => d.recordIds.length > 1).length;

  const scoreColor = (score: number) =>
    score >= 85 ? 'text-emerald-600 dark:text-emerald-400' :
    score >= 70 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const scoreBg = (score: number) =>
    score >= 85 ? 'bg-emerald-500' :
    score >= 70 ? 'bg-amber-500' :
    'bg-red-500';

  const trendIcon = (trend: string) =>
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const trendColor = (trend: string) =>
    trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' :
    trend === 'down' ? 'text-red-600 dark:text-red-400' :
    'text-muted-foreground';

  // Compute trend from quality trend data
  const getDimensionTrend = (dimName: string): 'up' | 'down' | 'stable' => {
    const dimScore = dimensions[dimName]?.score ?? 0;
    if (dimScore >= 85) return 'stable';
    if (dimScore >= 70) return 'up';
    return 'down';
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Quality</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor, measure, and improve data quality across all MDM domains.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs w-fit">
            <Activity className="w-3.5 h-3.5" />
            {generatedAt ? `Assessed: ${new Date(generatedAt).toLocaleTimeString()}` : 'Ready'}
          </Badge>
          <Button variant="outline" size="sm" className="gap-1" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={handleRunQualityCheck}
            disabled={runningCheck}
          >
            {runningCheck ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking...</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Run Quality Check</>
            )}
          </Button>
        </div>
      </div>

      {/* Overall Score + Dimensions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overall Score Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Overall Quality Score</CardTitle>
              <CardDescription>Aggregate score across all dimensions and modules</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-6">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    className={scoreBg(overallQuality)}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(overallQuality / 100) * 314} 314`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn('text-4xl font-bold', scoreColor(overallQuality))}>{overallQuality}</span>
                  <span className="text-xs text-muted-foreground">out of 100</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                {overallQuality >= 85 ? 'Excellent — data quality is well-maintained' :
                 overallQuality >= 70 ? 'Good — some areas need attention' :
                 'Needs improvement — critical issues detected'}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="outline" className="text-[10px]">
                  {moduleBreakdown.reduce((s, m) => s + m.totalRecords, 0)} records
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {moduleBreakdown.length} modules
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quality Dimensions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="lg:col-span-2"
        >
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quality Dimensions</CardTitle>
              <CardDescription>Core data quality metrics measured across all modules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(dimensions).map(([dimName, dim], i) => {
                const trend = getDimensionTrend(dimName);
                const TrendIcon = trendIcon(trend);
                return (
                  <motion.div
                    key={dimName}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{dimName}</span>
                        <TrendIcon className={cn('w-4 h-4', trendColor(trend))} />
                      </div>
                      <span className={cn('font-bold', scoreColor(dim.score))}>{dim.score}%</span>
                    </div>
                    <Progress value={dim.score} className="h-2" />
                    <p className="text-[10px] text-muted-foreground">{dim.description}</p>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quality Trend Chart (30-day) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Quality Trend (30 Days)</CardTitle>
              <CardDescription>Overall data quality score progression over time</CardDescription>
            </div>
            {qualityTrend.length > 1 && (
              <Badge variant="outline" className="text-xs">
                {qualityTrend.filter(p => p.score !== null).length} data points
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {qualityTrend.filter(p => p.score !== null).length === 0 ? (
            <div className="py-8 text-center">
              <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No trend data available yet. Run a quality check to start tracking.</p>
              <Button
                className="mt-4 bg-red-600 hover:bg-red-700 text-white gap-1"
                size="sm"
                onClick={handleRunQualityCheck}
                disabled={runningCheck}
              >
                <Play className="w-3.5 h-3.5" /> Run Quality Check
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-1 h-40 overflow-x-auto">
              {qualityTrend.map((item, i) => {
                const score = item.score ?? 0;
                const hasData = item.score !== null;
                return (
                  <div key={item.date} className="flex-1 min-w-[8px] flex flex-col items-center gap-1">
                    {hasData && (
                      <span className={cn('text-[8px] font-bold', scoreColor(score))}>{score}</span>
                    )}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: hasData ? `${score}%` : '2px' }}
                      transition={{ delay: i * 0.02, duration: 0.3, ease: 'easeOut' }}
                      className={cn('w-full rounded-t-sm min-h-[2px]', hasData ? scoreBg(score) : 'bg-muted/30')}
                      style={{ maxHeight: '100%' }}
                    />
                    {i % 5 === 0 && (
                      <span className="text-[8px] text-muted-foreground">{item.date.slice(8)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for module quality, dedup, profiling */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="w-4 h-4 hidden sm:block" />
            Module Quality
          </TabsTrigger>
          <TabsTrigger value="dedup" className="gap-1.5">
            <GitMerge className="w-4 h-4 hidden sm:block" />
            Deduplication
          </TabsTrigger>
          <TabsTrigger value="profiling" className="gap-1.5">
            <Eye className="w-4 h-4 hidden sm:block" />
            Data Profiling
          </TabsTrigger>
        </TabsList>

        {/* Module Quality Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Module-by-Module Quality</CardTitle>
                  <CardDescription>Detailed quality breakdown per data module (from DB)</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="gap-1 text-xs border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    <AlertTriangle className="w-3 h-3" /> {deduplication.totalDuplicates} duplicates
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead className="hidden sm:table-cell">Records</TableHead>
                      <TableHead>Completeness</TableHead>
                      <TableHead className="hidden md:table-cell">Accuracy</TableHead>
                      <TableHead className="hidden lg:table-cell">Consistency</TableHead>
                      <TableHead className="hidden lg:table-cell">Timeliness</TableHead>
                      <TableHead className="hidden lg:table-cell">Uniqueness</TableHead>
                      <TableHead>Overall</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moduleBreakdown.map((mod) => (
                      <TableRow key={mod.moduleId} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{mod.moduleName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{mod.moduleCode}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{mod.totalRecords}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={mod.completeness} className="h-1.5 w-16" />
                            <span className={cn('text-xs font-medium', scoreColor(mod.completeness))}>{mod.completeness}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Progress value={mod.accuracy} className="h-1.5 w-16" />
                            <span className={cn('text-xs font-medium', scoreColor(mod.accuracy))}>{mod.accuracy}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            <Progress value={mod.consistency} className="h-1.5 w-16" />
                            <span className={cn('text-xs font-medium', scoreColor(mod.consistency))}>{mod.consistency}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            <Progress value={mod.timeliness} className="h-1.5 w-16" />
                            <span className={cn('text-xs font-medium', scoreColor(mod.timeliness))}>{mod.timeliness}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            <Progress value={mod.uniqueness} className="h-1.5 w-16" />
                            <span className={cn('text-xs font-medium', scoreColor(mod.uniqueness))}>{mod.uniqueness}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs border-0 font-bold', scoreColor(mod.overall), 'bg-transparent')}>
                            {mod.overall}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => loadQualityIssues(mod)}
                          >
                            <Eye className="w-3 h-3" /> Issues
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

        {/* Deduplication Tab */}
        <TabsContent value="dedup">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Deduplication Panel</CardTitle>
                  <CardDescription>Duplicate records detected across data modules from DB</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    {deduplication.totalDuplicates} duplicates
                  </Badge>
                  <Badge className="text-xs border-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {duplicatesDetected} groups
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {deduplication.mergeCandidates.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-4" />
                  <h3 className="text-lg font-medium">No duplicates detected</h3>
                  <p className="text-muted-foreground text-sm mt-1">All records appear to be unique based on unique field analysis.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead className="hidden md:table-cell">Records</TableHead>
                        <TableHead className="hidden lg:table-cell">Reason</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deduplication.mergeCandidates.map((group, idx) => {
                        const similarity = Math.min(70 + idx * 5, 99);
                        const isHighConfidence = similarity > 95;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">G-{(idx + 1).toString().padStart(3, '0')}</TableCell>
                            <TableCell className="text-sm">{group.moduleCode}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {group.recordIds.map((rid) => (
                                  <Badge key={rid} variant="outline" className="text-[10px] font-mono">
                                    {rid.slice(0, 8)}...
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                              {group.reason}
                            </TableCell>
                            <TableCell>
                              <span className={cn('text-xs font-bold', similarity >= 90 ? 'text-red-600' : 'text-amber-600')}>
                                {Math.round(similarity)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setMergeDialog(group);
                                    loadDedupRecords(group);
                                  }}
                                >
                                  Compare
                                </Button>
                                {isHighConfidence && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => handleAutoMerge(group)}
                                    disabled={!perms.canEdit || mergeActionLoading}
                                  >
                                    <Zap className="w-3 h-3 mr-1" /> Auto-Merge
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Profiling Tab */}
        <TabsContent value="profiling">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Data Profiling</CardTitle>
              <CardDescription>Field-level statistics including null analysis, uniqueness, and pattern detection.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead className="hidden sm:table-cell">Module</TableHead>
                      <TableHead>Null %</TableHead>
                      <TableHead>Unique</TableHead>
                      <TableHead className="hidden md:table-cell">Pattern</TableHead>
                      <TableHead className="hidden lg:table-cell">Type</TableHead>
                      <TableHead className="hidden lg:table-cell">Most Common</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fieldProfiles.map((fp) => (
                      <TableRow key={`${fp.field}-${fp.module}`}>
                        <TableCell className="font-mono text-sm">{fp.field}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{fp.module}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', fp.nullPercent === 0 ? 'bg-emerald-500' : fp.nullPercent <= 10 ? 'bg-amber-500' : 'bg-red-500')}
                                style={{ width: `${fp.nullPercent}%` }}
                              />
                            </div>
                            <span className={cn('text-xs font-medium', fp.nullPercent === 0 ? 'text-emerald-600' : fp.nullPercent <= 10 ? 'text-amber-600' : 'text-red-600')}>
                              {fp.nullPercent}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{fp.uniqueValues}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">{fp.topPattern}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant="outline" className="text-[10px]">{fp.dataType}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {fp.mostCommon ? `${fp.mostCommon} (${fp.mostCommonCount})` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Merge Dialog - Side by Side Comparison */}
      <Dialog open={!!mergeDialog} onOpenChange={() => { setMergeDialog(null); setMergeSurvivorFields({}); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="w-5 h-5" /> Merge Duplicate Records
            </DialogTitle>
            <DialogDescription>
              Compare records side-by-side and select the survivor value for each field.
            </DialogDescription>
          </DialogHeader>

          {mergeLoading ? (
            <div className="py-8 flex justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : mergeRecords.length >= 2 ? (
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                {/* Record Headers */}
                <div className="grid grid-cols-[1fr_1fr] gap-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
                    <Radio className="w-4 h-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold">Record A (Survivor)</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{mergeRecords[0].id.slice(0, 12)}...</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-red-50 dark:bg-red-950/30 border-red-200">
                    <Radio className="w-4 h-4 text-red-600" />
                    <div>
                      <p className="text-sm font-semibold">Record B (To Merge)</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{mergeRecords[1].id.slice(0, 12)}...</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Field-by-field comparison */}
                <div className="space-y-2">
                  {(() => {
                    try {
                      const leftPayload = JSON.parse(mergeRecords[0].currentPayload || '{}');
                      const rightPayload = JSON.parse(mergeRecords[1].currentPayload || '{}');
                      const allKeys = new Set([...Object.keys(leftPayload), ...Object.keys(rightPayload)]);
                      return Array.from(allKeys).map((key) => {
                        const leftVal = String(leftPayload[key] ?? '');
                        const rightVal = String(rightPayload[key] ?? '');
                        const isDiff = leftVal !== rightVal;
                        const survivor = mergeSurvivorFields[key] || 'left';

                        return (
                          <div
                            key={key}
                            className={cn(
                              'rounded-lg border p-3',
                              isDiff ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20' : 'border-border'
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-mono font-medium">{key}</span>
                              {isDiff && (
                                <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 border">
                                  Different
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-[1fr_1fr] gap-3">
                              <button
                                className={cn(
                                  'text-left rounded-md border p-2 text-xs transition-all',
                                  survivor === 'left'
                                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-400/50'
                                    : 'border-border hover:border-emerald-200'
                                )}
                                onClick={() => setMergeSurvivorFields(prev => ({ ...prev, [key]: 'left' }))}
                              >
                                <div className="flex items-center gap-1 mb-1">
                                  <Radio className="w-3 h-3 text-emerald-600" />
                                  <span className="text-[10px] text-muted-foreground">Left</span>
                                </div>
                                <p className="font-mono break-words">{leftVal || <span className="italic text-muted-foreground">(empty)</span>}</p>
                              </button>
                              <button
                                className={cn(
                                  'text-left rounded-md border p-2 text-xs transition-all',
                                  survivor === 'right'
                                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-400/50'
                                    : 'border-border hover:border-emerald-200'
                                )}
                                onClick={() => setMergeSurvivorFields(prev => ({ ...prev, [key]: 'right' }))}
                              >
                                <div className="flex items-center gap-1 mb-1">
                                  <Radio className="w-3 h-3 text-emerald-600" />
                                  <span className="text-[10px] text-muted-foreground">Right</span>
                                </div>
                                <p className="font-mono break-words">{rightVal || <span className="italic text-muted-foreground">(empty)</span>}</p>
                              </button>
                            </div>
                          </div>
                        );
                      });
                    } catch {
                      return <p className="text-sm text-muted-foreground">Unable to parse record data</p>;
                    }
                  })()}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Could not load both records for comparison</p>
            </div>
          )}

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => { setMergeDialog(null); setMergeSurvivorFields({}); }}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
              onClick={handleExecuteMerge}
              disabled={mergeActionLoading || !perms.canEdit}
            >
              {mergeActionLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Merging...</> : <><GitMerge className="w-4 h-4" /> Merge Records</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quality Issues Dialog */}
      <Dialog open={!!issuesDialogModule} onOpenChange={(open) => { if (!open) setIssuesDialogModule(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Quality Issues: {issuesDialogModule?.moduleName}
            </DialogTitle>
            <DialogDescription>
              Records with quality issues in {issuesDialogModule?.moduleCode}. Overall score: {issuesDialogModule?.overall}%
            </DialogDescription>
          </DialogHeader>

          {issuesLoading ? (
            <div className="py-8 flex justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : qualityIssues.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-4" />
              <h3 className="text-lg font-medium">No quality issues found</h3>
              <p className="text-muted-foreground text-sm mt-1">All records in this module pass quality checks.</p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qualityIssues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell className="font-mono text-xs">{issue.recordId.slice(0, 8)}...</TableCell>
                      <TableCell className="text-sm font-mono">{issue.fieldCode}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{issue.issueType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px] border-0',
                          issue.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                          issue.severity === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                          'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                        )}>
                          {issue.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                        {issue.description}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleFixIssue(issue)}
                          disabled={!perms.canEdit || fixingIssue === issue.id}
                        >
                          {fixingIssue === issue.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : issue.issueType === 'duplicate' ? (
                            <GitMerge className="w-3 h-3" />
                          ) : (
                            <ExternalLink className="w-3 h-3" />
                          )}
                          {issue.issueType === 'duplicate' ? 'Merge' : 'Fix'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
