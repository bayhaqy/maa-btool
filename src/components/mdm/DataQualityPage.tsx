'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Minus,
  BarChart3, PieChart, GitMerge, Shield, Clock, FileText,
  Database, Activity, Eye, ArrowRight, Target, Layers,
} from 'lucide-react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types & Mock Data
// ---------------------------------------------------------------------------

interface QualityDimension {
  name: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  description: string;
}

interface ModuleQuality {
  moduleName: string;
  recordCount: number;
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  uniqueness: number;
  overall: number;
}

interface DuplicateRecord {
  id: string;
  module: string;
  record1: string;
  record2: string;
  similarity: number;
  status: 'detected' | 'reviewing' | 'merged' | 'dismissed';
  detectedAt: string;
}

interface FieldProfile {
  field: string;
  module: string;
  nullPercent: number;
  uniqueValues: number;
  topPattern: string;
  avgLength: number;
}

const overallScore = 82;

const qualityDimensions: QualityDimension[] = [
  { name: 'Completeness', score: 78, trend: 'up', description: 'Percentage of required fields populated across all records' },
  { name: 'Accuracy', score: 85, trend: 'up', description: 'Records matching validated reference data and business rules' },
  { name: 'Consistency', score: 74, trend: 'down', description: 'Cross-module data alignment and format uniformity' },
  { name: 'Timeliness', score: 90, trend: 'stable', description: 'Records updated within expected SLA timeframes' },
  { name: 'Uniqueness', score: 83, trend: 'up', description: 'Percentage of records that are non-duplicate' },
];

const moduleQuality: ModuleQuality[] = [
  { moduleName: 'Article Master', recordCount: 65, completeness: 85, accuracy: 90, consistency: 78, timeliness: 92, uniqueness: 82, overall: 87 },
  { moduleName: 'Store Master', recordCount: 20, completeness: 65, accuracy: 75, consistency: 68, timeliness: 88, uniqueness: 80, overall: 72 },
  { moduleName: 'Supplier Master', recordCount: 12, completeness: 80, accuracy: 82, consistency: 76, timeliness: 85, uniqueness: 88, overall: 81 },
  { moduleName: 'Pricing Master', recordCount: 20, completeness: 92, accuracy: 88, consistency: 90, timeliness: 95, uniqueness: 95, overall: 90 },
  { moduleName: 'Promotion Master', recordCount: 12, completeness: 55, accuracy: 70, consistency: 60, timeliness: 78, uniqueness: 72, overall: 65 },
];

const duplicateRecords: DuplicateRecord[] = [
  { id: 'DUP-001', module: 'Article Master', record1: 'ART-001 Nike Air Max 90', record2: 'ART-042 Nike Air Max 90 (Duplicate)', similarity: 96, status: 'detected', detectedAt: '2025-01-15' },
  { id: 'DUP-002', module: 'Supplier Master', record1: 'SUP-001 Nike Indonesia', record2: 'SUP-008 Nike ID', similarity: 89, status: 'reviewing', detectedAt: '2025-01-14' },
  { id: 'DUP-003', module: 'Article Master', record1: 'ART-015 Adidas Ultraboost', record2: 'ART-038 Adidas Ultra Boost', similarity: 92, status: 'detected', detectedAt: '2025-01-13' },
  { id: 'DUP-004', module: 'Store Master', record1: 'STR-003 MAP Malang', record2: 'STR-015 MAP Malang (Old)', similarity: 78, status: 'dismissed', detectedAt: '2025-01-12' },
  { id: 'DUP-005', module: 'Pricing Master', record1: 'PRC-007 Regular - IDR 1.299K', record2: 'PRC-018 Regular - IDR 1.300K', similarity: 85, status: 'merged', detectedAt: '2025-01-10' },
];

const fieldProfiles: FieldProfile[] = [
  { field: 'articleName', module: 'Article Master', nullPercent: 2, uniqueValues: 62, topPattern: 'Brand + Model + Color', avgLength: 28 },
  { field: 'sku', module: 'Article Master', nullPercent: 0, uniqueValues: 65, topPattern: 'XXX-0000-000', avgLength: 11 },
  { field: 'brand', module: 'Article Master', nullPercent: 18, uniqueValues: 16, topPattern: 'Title Case', avgLength: 8 },
  { field: 'price', module: 'Pricing Master', nullPercent: 0, uniqueValues: 18, topPattern: 'IDR #,###,###', avgLength: 12 },
  { field: 'address', module: 'Store Master', nullPercent: 25, uniqueValues: 18, topPattern: 'Street, City, Province', avgLength: 55 },
  { field: 'taxId', module: 'Supplier Master', nullPercent: 33, uniqueValues: 8, topPattern: 'XX.XXX.XXX.X-XXX', avgLength: 16 },
  { field: 'startDate', module: 'Promotion Master', nullPercent: 8, uniqueValues: 10, topPattern: 'YYYY-MM-DD', avgLength: 10 },
  { field: 'status', module: 'Article Master', nullPercent: 0, uniqueValues: 4, topPattern: 'ENUM: ACTIVE/DRAFT/IN_REVIEW', avgLength: 10 },
];

const trendData = [
  { month: 'Aug', score: 72 },
  { month: 'Sep', score: 74 },
  { month: 'Oct', score: 76 },
  { month: 'Nov', score: 79 },
  { month: 'Dec', score: 80 },
  { month: 'Jan', score: 82 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataQualityPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const duplicatesDetected = duplicateRecords.filter(d => d.status === 'detected').length;
  const duplicatesReviewing = duplicateRecords.filter(d => d.status === 'reviewing').length;

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

  const dupStatusColors: Record<string, string> = {
    detected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    reviewing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    merged: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    dismissed: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  };

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
        <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs w-fit">
          <Activity className="w-3.5 h-3.5" />
          Last assessed: 2 hours ago
        </Badge>
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
                {/* Circular gauge */}
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    className={scoreBg(overallScore)}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(overallScore / 100) * 314} 314`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn('text-4xl font-bold', scoreColor(overallScore))}>{overallScore}</span>
                  <span className="text-xs text-muted-foreground">out of 100</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                {overallScore >= 85 ? 'Excellent — data quality is well-maintained' :
                 overallScore >= 70 ? 'Good — some areas need attention' :
                 'Needs improvement — critical issues detected'}
              </p>
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
              {qualityDimensions.map((dim, i) => {
                const TrendIcon = trendIcon(dim.trend);
                return (
                  <motion.div
                    key={dim.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{dim.name}</span>
                        <TrendIcon className={cn('w-4 h-4', trendColor(dim.trend))} />
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

      {/* Quality Trend Chart (simple bar chart) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quality Trend (6 Months)</CardTitle>
          <CardDescription>Overall data quality score progression over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-40">
            {trendData.map((item, i) => (
              <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                <span className={cn('text-xs font-bold', scoreColor(item.score))}>{item.score}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${item.score}%` }}
                  transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
                  className={cn('w-full rounded-t-md min-h-[4px]', scoreBg(item.score))}
                  style={{ maxHeight: '100%' }}
                />
                <span className="text-[10px] text-muted-foreground">{item.month}</span>
              </div>
            ))}
          </div>
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
                  <CardDescription>Detailed quality breakdown per data module</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="gap-1 text-xs border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    <AlertTriangle className="w-3 h-3" /> {duplicatesDetected + duplicatesReviewing} issues
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
                      <TableHead>Overall</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moduleQuality.map((mod) => (
                      <TableRow key={mod.moduleName}>
                        <TableCell className="font-medium text-sm">{mod.moduleName}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{mod.recordCount}</TableCell>
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
                        <TableCell>
                          <Badge className={cn('text-xs border-0 font-bold', scoreColor(mod.overall), 'bg-transparent')}>
                            {mod.overall}%
                          </Badge>
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
                  <CardDescription>Duplicate records detected across data modules</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{duplicatesDetected} detected</Badge>
                  <Badge className="text-xs border-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{duplicatesReviewing} reviewing</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead className="hidden md:table-cell">Record 1</TableHead>
                      <TableHead className="hidden lg:table-cell">Record 2</TableHead>
                      <TableHead>Similarity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duplicateRecords.map((dup) => (
                      <TableRow key={dup.id}>
                        <TableCell className="font-mono text-xs">{dup.id}</TableCell>
                        <TableCell className="text-sm">{dup.module}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[160px] truncate">{dup.record1}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[160px] truncate">{dup.record2}</TableCell>
                        <TableCell>
                          <span className={cn('text-xs font-bold', dup.similarity >= 90 ? 'text-red-600' : 'text-amber-600')}>{dup.similarity}%</span>
                        </TableCell>
                        <TableCell><Badge className={cn('text-[10px] border-0', dupStatusColors[dup.status])}>{dup.status}</Badge></TableCell>
                        <TableCell>
                          {dup.status === 'detected' && (
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" className="h-7 text-xs">Review</Button>
                              <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">Merge</Button>
                            </div>
                          )}
                          {dup.status === 'reviewing' && (
                            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">Merge</Button>
                          )}
                          {(dup.status === 'merged' || dup.status === 'dismissed') && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
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
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead className="hidden sm:table-cell">Module</TableHead>
                      <TableHead>Null %</TableHead>
                      <TableHead>Unique</TableHead>
                      <TableHead className="hidden md:table-cell">Top Pattern</TableHead>
                      <TableHead className="hidden lg:table-cell">Avg Length</TableHead>
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
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{fp.avgLength}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
