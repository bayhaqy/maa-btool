'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Brain, Sparkles, Tag, Image as ImageIcon, Copy, Link2,
  Play, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ArrowRight, Shield, Clock, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface ModuleOption {
  id: string;
  moduleCode: string;
  moduleName: string;
}

interface ClassificationSuggestion {
  field: string;
  suggestedValue: string;
  confidence: number;
  source: string;
}

interface EnrichmentResult {
  recordId: string;
  recordCode: string;
  missingFields: string[];
  filledFields: Record<string, unknown>;
  confidence: number;
  status: string;
  reasoning?: string;
  fallback?: boolean;
}

interface QualityIssue {
  field: string;
  type: string;
  severity: string;
  message: string;
  suggestion: string;
}

interface QualityResult {
  recordId: string;
  recordCode: string;
  moduleCode: string;
  suggestedScore: number;
  issues: QualityIssue[];
  suggestions: Array<{
    field: string;
    type: string;
    suggestion: string;
    severity: string;
  }>;
  fallback?: boolean;
}

interface DuplicatePair {
  record1: { id: string; recordCode: string; moduleCode: string };
  record2: { id: string; recordCode: string; moduleCode: string };
  similarity: number;
  matchingFields: string[];
  reason: string;
}

interface ImageAnalysisResult {
  recordId: string;
  recordCode: string;
  images: Array<{
    imageId: string;
    fileName: string;
    currentAltText: string | null;
    suggestedAltText: string;
    suggestedDescription: string;
    suggestedKeywords: string[];
    imageQuality?: string;
    suggestedTags?: string[];
    vlmAnalyzed?: boolean;
    fallback?: boolean;
  }>;
}

interface MatchResult {
  sourceRecord: { id: string; recordCode: string; moduleCode: string };
  matchedRecord: { id: string; recordCode: string; moduleCode: string };
  matchType: string;
  confidence: number;
  reason: string;
}

interface RunHistory {
  id: string;
  action: string;
  timestamp: string;
  recordCount: number;
  modelUsed: string;
  tokensUsed: number;
  status: 'completed' | 'partial' | 'failed';
}

// ============================================================================
// Main Page
// ============================================================================

export default function AiCapabilitiesPage() {
  const { token } = useAppStore();
  const { canWrite } = usePermissions();
  const hasAIWrite = canWrite('ai');
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [activeTab, setActiveTab] = useState('classify');
  const [loading, setLoading] = useState(false);
  const [runHistory, setRunHistory] = useState<RunHistory[]>([]);

  // Results state
  const [classifyResults, setClassifyResults] = useState<Array<{
    recordId: string;
    recordCode: string;
    moduleCode: string;
    suggestions: ClassificationSuggestion[];
    fallback?: boolean;
  }> | null>(null);
  const [enrichResults, setEnrichResults] = useState<EnrichmentResult[] | null>(null);
  const [qualityResults, setQualityResults] = useState<QualityResult[] | null>(null);
  const [duplicateResults, setDuplicateResults] = useState<DuplicatePair[] | null>(null);
  const [imageResults, setImageResults] = useState<ImageAnalysisResult[] | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);

  // Model info
  const [modelUsed, setModelUsed] = useState<string>('');
  const [tokensUsed, setTokensUsed] = useState<number>(0);

  // Dialog state
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean;
    title: string;
    content: React.ReactNode;
  }>({ open: false, title: '', content: null });

  // Load modules
  useEffect(() => {
    if (!token) return;
    const fetchModules = async () => {
      try {
        const res = await fetch('/api/modules', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.modules) {
          const modOptions = data.modules.map((m: ModuleOption) => ({
            id: m.id,
            moduleCode: m.moduleCode,
            moduleName: m.moduleName,
          }));
          setModules(modOptions);
          if (modOptions.length > 0 && !selectedModule) {
            setSelectedModule(modOptions[0].moduleCode);
          }
        }
      } catch {
        // silent
      }
    };
    fetchModules();
  }, [token]);

  // Add to history helper
  const addHistory = useCallback((action: string, recordCount: number, model: string, tokens: number, status: 'completed' | 'partial' | 'failed') => {
    const entry: RunHistory = {
      id: Date.now().toString(),
      action,
      timestamp: new Date().toISOString(),
      recordCount,
      modelUsed: model,
      tokensUsed: tokens,
      status,
    };
    setRunHistory(prev => [entry, ...prev].slice(0, 20));
  }, []);

  // API call helper
  const callEnrichment = async (action: string, extraBody: Record<string, unknown> = {}) => {
    if (!token || !selectedModule) {
      toast.error('Please select a module first');
      return null;
    }
    setLoading(true);
    setModelUsed('');
    setTokensUsed(0);
    try {
      const res = await fetch('/api/ai-enrichment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          moduleCode: selectedModule,
          ...extraBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setModelUsed(data.modelUsed || 'rule-based');
      setTokensUsed(data.totalTokens || 0);
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI operation failed');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Action handlers
  const handleClassify = async () => {
    const data = await callEnrichment('classify');
    if (data) {
      setClassifyResults(data.results || []);
      addHistory('Classify', data.results?.length || 0, data.modelUsed || 'rule-based', data.totalTokens || 0, 'completed');
      toast.success(`Classified ${data.results?.length || 0} records`);
    }
  };

  const handleEnrich = async () => {
    const data = await callEnrichment('enrich', { options: { dryRun: true } });
    if (data) {
      setEnrichResults(data.results || []);
      addHistory('Enrich', data.results?.length || 0, data.modelUsed || 'rule-based', data.totalTokens || 0, 'completed');
      toast.success(`Enrichment preview for ${data.results?.length || 0} records`);
    }
  };

  const handleQualityCheck = async () => {
    const data = await callEnrichment('quality-check');
    if (data) {
      setQualityResults(data.results || []);
      addHistory('Quality Check', data.results?.length || 0, data.modelUsed || 'rule-based', data.totalTokens || 0, 'completed');
      toast.success(`Quality checked ${data.results?.length || 0} records`);
    }
  };

  const handleDuplicateDetect = async () => {
    const data = await callEnrichment('duplicate-detect', { options: { threshold: 0.7 } });
    if (data) {
      setDuplicateResults(data.duplicates || []);
      addHistory('Duplicate Detect', data.totalRecords || 0, data.modelUsed || 'rule-based', data.totalTokens || 0, 'completed');
      toast.success(`Found ${data.duplicates?.length || 0} potential duplicate pairs`);
    }
  };

  const handleImageAnalyze = async () => {
    // Get records with images for the selected module
    if (!token || !selectedModule) {
      toast.error('Please select a module first');
      return;
    }
    setLoading(true);
    setModelUsed('');
    setTokensUsed(0);
    try {
      // First, get record IDs with images from the module
      const modRes = await fetch(`/api/data-records?moduleCode=${selectedModule}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const modData = await modRes.json();
      const recordIds = (modData.records || modData || [])
        .filter((r: { images?: unknown[] }) => Array.isArray((r as Record<string, unknown>).images) && ((r as Record<string, unknown>).images as unknown[]).length > 0)
        .map((r: { id: string }) => r.id);

      if (recordIds.length === 0) {
        toast.info('No records with images found in this module');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/ai-enrichment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'image-analyze',
          recordIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      setImageResults(data.results || []);
      setModelUsed(data.modelUsed || 'rule-based');
      setTokensUsed(data.totalTokens || 0);
      addHistory('Image Analyze', recordIds.length, data.modelUsed || 'rule-based', data.totalTokens || 0, 'completed');
      toast.success(`Analyzed images for ${data.results?.length || 0} records`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMatchRecords = async () => {
    const data = await callEnrichment('match-records');
    if (data) {
      setMatchResults(data.matches || []);
      addHistory('Match Records', data.sourceCount || 0, data.modelUsed || 'rule-based', data.totalTokens || 0, 'completed');
      toast.success(`Found ${data.matches?.length || 0} record matches`);
    }
  };

  // Severity badge
  const SeverityBadge = ({ severity }: { severity: string }) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      warning: 'bg-amber-100 text-amber-700 border-amber-200',
      info: 'bg-sky-100 text-sky-700 border-sky-200',
    };
    return (
      <Badge variant="outline" className={cn('text-[10px] font-mono', colors[severity] || colors.info)}>
        {severity}
      </Badge>
    );
  };

  // Confidence badge
  const ConfidenceBadge = ({ confidence }: { confidence: number }) => {
    const pct = Math.round(confidence * 100);
    const color = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';
    return <span className={cn('text-sm font-mono font-bold', color)}>{pct}%</span>;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-red-600" />
            AI Capabilities
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stibo STEP-like AI-powered master data management features
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedModule} onValueChange={setSelectedModule}>
            <SelectTrigger className="w-[200px] h-9 text-xs">
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map(m => (
                <SelectItem key={m.moduleCode} value={m.moduleCode}>
                  {m.moduleName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {modelUsed && (
            <Badge variant="outline" className="text-[10px] font-mono gap-1">
              <Zap className="w-3 h-3" />
              {modelUsed} · {tokensUsed} tokens
            </Badge>
          )}
        </div>
      </div>

      {/* AI Capability Cards Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { key: 'classify', label: 'Auto-Classify', icon: Tag, color: 'text-violet-600', bg: 'bg-violet-50' },
          { key: 'enrich', label: 'AI Enrich', icon: Sparkles, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { key: 'quality', label: 'Quality Scan', icon: Shield, color: 'text-amber-600', bg: 'bg-amber-50' },
          { key: 'duplicates', label: 'Find Duplicates', icon: Copy, color: 'text-red-600', bg: 'bg-red-50' },
          { key: 'image', label: 'Image Analysis', icon: ImageIcon, color: 'text-sky-600', bg: 'bg-sky-50' },
          { key: 'match', label: 'Match Records', icon: Link2, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(cap => (
          <Card
            key={cap.key}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              activeTab === cap.key && 'ring-2 ring-red-300'
            )}
            onClick={() => setActiveTab(cap.key)}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', cap.bg)}>
                <cap.icon className={cn('w-5 h-5', cap.color)} />
              </div>
              <span className="text-xs font-medium">{cap.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Area */}
      <Card>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b px-4 pt-4">
              <TabsList className="h-9">
                <TabsTrigger value="classify" className="text-xs gap-1"><Tag className="w-3 h-3" /> Classify</TabsTrigger>
                <TabsTrigger value="enrich" className="text-xs gap-1"><Sparkles className="w-3 h-3" /> Enrich</TabsTrigger>
                <TabsTrigger value="quality" className="text-xs gap-1"><Shield className="w-3 h-3" /> Quality</TabsTrigger>
                <TabsTrigger value="duplicates" className="text-xs gap-1"><Copy className="w-3 h-3" /> Duplicates</TabsTrigger>
                <TabsTrigger value="image" className="text-xs gap-1"><ImageIcon className="w-3 h-3" /> Images</TabsTrigger>
                <TabsTrigger value="match" className="text-xs gap-1"><Link2 className="w-3 h-3" /> Match</TabsTrigger>
              </TabsList>
            </div>

            {/* Classify Tab */}
            <TabsContent value="classify" className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">AI Auto-Classification</h3>
                  <p className="text-xs text-muted-foreground">
                    Use LLM to suggest categories, tags, and attributes for records
                  </p>
                </div>
                <Button
                  onClick={handleClassify}
                  disabled={loading || !selectedModule}
                  className="gap-1 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Run Classification
                </Button>
              </div>
              <Separator />
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : classifyResults ? (
                classifyResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Tag className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No classification suggestions</p>
                    <p className="text-sm mt-1">Records may already be fully classified</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {classifyResults.map((result) => (
                        <Card key={result.recordId} className="overflow-hidden">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-medium">{result.recordCode}</span>
                                <Badge variant="outline" className="text-[10px]">{result.moduleCode}</Badge>
                                {result.fallback && <Badge variant="outline" className="text-[10px] text-amber-600">rule-based</Badge>}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {result.suggestions.map((sug, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs bg-muted/30 rounded p-2">
                                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="font-mono text-muted-foreground w-24 shrink-0">{sug.field}:</span>
                                  <span className="font-medium">{sug.suggestedValue}</span>
                                  <ConfidenceBadge confidence={sug.confidence} />
                                  <Badge variant="outline" className="text-[9px] ml-auto">{sug.source}</Badge>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Click &quot;Run Classification&quot; to start</p>
                  <p className="text-sm mt-1">AI will analyze records and suggest categories, tags, and attributes</p>
                </div>
              )}
            </TabsContent>

            {/* Enrich Tab */}
            <TabsContent value="enrich" className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">AI Data Enrichment</h3>
                  <p className="text-xs text-muted-foreground">
                    Use LLM to intelligently fill missing fields
                  </p>
                </div>
                <Button
                  onClick={handleEnrich}
                  disabled={loading || !selectedModule || !hasAIWrite}
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Run Enrichment
                </Button>
              </div>
              <Separator />
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : enrichResults ? (
                enrichResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No enrichment needed</p>
                    <p className="text-sm mt-1">All records appear to be fully populated</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {enrichResults.map((result) => (
                        <Card key={result.recordId} className="overflow-hidden">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-medium">{result.recordCode}</span>
                                <Badge variant="outline" className="text-[10px]">{result.status}</Badge>
                                {result.fallback && <Badge variant="outline" className="text-[10px] text-amber-600">rule-based</Badge>}
                              </div>
                              <ConfidenceBadge confidence={result.confidence} />
                            </div>
                            {result.reasoning && (
                              <p className="text-xs text-muted-foreground mb-2 italic">{result.reasoning}</p>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase mb-1">Missing Fields</p>
                                <div className="flex flex-wrap gap-1">
                                  {result.missingFields.map(f => (
                                    <Badge key={f} variant="outline" className="text-[10px] text-red-600">{f}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase mb-1">Suggested Values</p>
                                <div className="space-y-0.5">
                                  {Object.entries(result.filledFields).map(([k, v]) => (
                                    <div key={k} className="text-xs">
                                      <span className="font-mono text-muted-foreground">{k}:</span>{' '}
                                      <span className="font-medium">{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Click &quot;Run Enrichment&quot; to start</p>
                  <p className="text-sm mt-1">AI will fill missing fields with intelligent suggestions (preview mode)</p>
                </div>
              )}
            </TabsContent>

            {/* Quality Tab */}
            <TabsContent value="quality" className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">AI Quality Scanner</h3>
                  <p className="text-xs text-muted-foreground">
                    Use LLM to analyze data quality and suggest improvements
                  </p>
                </div>
                <Button
                  onClick={handleQualityCheck}
                  disabled={loading || !selectedModule}
                  className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Run Quality Scan
                </Button>
              </div>
              <Separator />
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : qualityResults ? (
                <>
                  {/* Quality Score Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Records Scanned</p>
                        <p className="text-2xl font-bold mt-1">{qualityResults.length}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Avg Score</p>
                        <p className={cn(
                          'text-2xl font-bold mt-1',
                          qualityResults.reduce((s, r) => s + r.suggestedScore, 0) / (qualityResults.length || 1) >= 80
                            ? 'text-emerald-600'
                            : 'text-amber-600'
                        )}>
                          {Math.round(qualityResults.reduce((s, r) => s + r.suggestedScore, 0) / (qualityResults.length || 1))}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Critical Issues</p>
                        <p className="text-2xl font-bold mt-1 text-red-600">
                          {qualityResults.reduce((s, r) => s + r.issues.filter(i => i.severity === 'critical').length, 0)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Warnings</p>
                        <p className="text-2xl font-bold mt-1 text-amber-600">
                          {qualityResults.reduce((s, r) => s + r.issues.filter(i => i.severity === 'warning').length, 0)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {qualityResults.map((result) => (
                        <Card key={result.recordId}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-medium">{result.recordCode}</span>
                                <Badge variant="outline" className="text-[10px]">{result.moduleCode}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Score:</span>
                                <span className={cn(
                                  'text-sm font-bold font-mono',
                                  result.suggestedScore >= 80 ? 'text-emerald-600' : result.suggestedScore >= 50 ? 'text-amber-600' : 'text-red-600'
                                )}>
                                  {result.suggestedScore}
                                </span>
                                <Progress value={result.suggestedScore} className="w-16 h-2" />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {result.issues.map((issue, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-xs bg-muted/30 rounded p-2">
                                  <SeverityBadge severity={issue.severity} />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-muted-foreground">{issue.field}</span>
                                      <Badge variant="outline" className="text-[9px]">{issue.type}</Badge>
                                    </div>
                                    <p className="text-muted-foreground mt-0.5">{issue.message}</p>
                                    <p className="text-emerald-600 mt-0.5">→ {issue.suggestion}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Click &quot;Run Quality Scan&quot; to start</p>
                  <p className="text-sm mt-1">AI will analyze records for quality issues and suggest improvements</p>
                </div>
              )}
            </TabsContent>

            {/* Duplicates Tab */}
            <TabsContent value="duplicates" className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">AI Duplicate Finder</h3>
                  <p className="text-xs text-muted-foreground">
                    Use LLM to find potential duplicate records
                  </p>
                </div>
                <Button
                  onClick={handleDuplicateDetect}
                  disabled={loading || !selectedModule || !hasAIWrite}
                  className="gap-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Find Duplicates
                </Button>
              </div>
              <Separator />
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : duplicateResults ? (
                duplicateResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-40 text-emerald-500" />
                    <p className="font-medium">No duplicates found</p>
                    <p className="text-sm mt-1">Records appear to be unique</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {duplicateResults.map((dup, idx) => (
                        <Card key={idx}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-medium">{dup.record1.recordCode}</span>
                                  <Badge variant="outline" className="text-[10px]">{dup.record1.moduleCode}</Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Copy className="w-4 h-4" />
                                <span className="text-xs font-mono">{Math.round(dup.similarity * 100)}%</span>
                              </div>
                              <div className="flex-1 text-right">
                                <div className="flex items-center gap-2 justify-end">
                                  <Badge variant="outline" className="text-[10px]">{dup.record2.moduleCode}</Badge>
                                  <span className="text-xs font-mono font-medium">{dup.record2.recordCode}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {dup.matchingFields.map(f => (
                                <Badge key={f} variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground italic">{dup.reason}</p>
                            <div className="mt-2">
                              <Progress value={dup.similarity * 100} className="h-2" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Copy className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Click &quot;Find Duplicates&quot; to start</p>
                  <p className="text-sm mt-1">AI will analyze records for potential duplicates</p>
                </div>
              )}
            </TabsContent>

            {/* Image Analysis Tab */}
            <TabsContent value="image" className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">AI Image Analyzer</h3>
                  <p className="text-xs text-muted-foreground">
                    Use VLM to analyze product images and generate descriptions, alt text, and tags
                  </p>
                </div>
                <Button
                  onClick={handleImageAnalyze}
                  disabled={loading || !selectedModule}
                  className="gap-1 bg-sky-600 hover:bg-sky-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Analyze Images
                </Button>
              </div>
              <Separator />
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : imageResults ? (
                imageResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No records with images found</p>
                    <p className="text-sm mt-1">Upload images to records to enable AI analysis</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {imageResults.map((result) => (
                        <Card key={result.recordId}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-mono font-medium">{result.recordCode}</span>
                              <Badge variant="outline" className="text-[10px]">{result.images.length} images</Badge>
                            </div>
                            <div className="space-y-3">
                              {result.images.map((img) => (
                                <div key={img.imageId} className="border rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                      <span className="text-xs font-medium">{img.fileName}</span>
                                    </div>
                                    {img.vlmAnalyzed && (
                                      <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700">VLM</Badge>
                                    )}
                                    {img.fallback && (
                                      <Badge variant="outline" className="text-[10px] text-amber-600">rule-based</Badge>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Alt Text</p>
                                      <p className="bg-muted/30 rounded p-1.5">{img.suggestedAltText}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Description</p>
                                      <p className="bg-muted/30 rounded p-1.5">{img.suggestedDescription}</p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {img.suggestedKeywords.map(kw => (
                                      <Badge key={kw} variant="outline" className="text-[10px]">{kw}</Badge>
                                    ))}
                                    {img.suggestedTags?.map(tag => (
                                      <Badge key={tag} variant="outline" className="text-[10px] bg-sky-50 text-sky-700">{tag}</Badge>
                                    ))}
                                  </div>
                                  {img.imageQuality && (
                                    <div className="flex items-center gap-1 text-xs">
                                      <span className="text-muted-foreground">Quality:</span>
                                      <Badge variant="outline" className={cn('text-[10px]',
                                        img.imageQuality === 'good' ? 'bg-emerald-50 text-emerald-700' :
                                        img.imageQuality === 'acceptable' ? 'bg-amber-50 text-amber-700' :
                                        'bg-red-50 text-red-700'
                                      )}>
                                        {img.imageQuality}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Click &quot;Analyze Images&quot; to start</p>
                  <p className="text-sm mt-1">AI will analyze product images and generate metadata</p>
                </div>
              )}
            </TabsContent>

            {/* Match Records Tab */}
            <TabsContent value="match" className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">AI Record Matching</h3>
                  <p className="text-xs text-muted-foreground">
                    Use LLM to match related records across modules
                  </p>
                </div>
                <Button
                  onClick={handleMatchRecords}
                  disabled={loading || !selectedModule || !hasAIWrite}
                  className="gap-1 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Match Records
                </Button>
              </div>
              <Separator />
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : matchResults ? (
                matchResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Link2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No matches found</p>
                    <p className="text-sm mt-1">Try selecting records from a different module</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {matchResults.map((match, idx) => (
                        <Card key={idx}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-medium">{match.sourceRecord.recordCode}</span>
                                  <Badge variant="outline" className="text-[10px]">{match.sourceRecord.moduleCode}</Badge>
                                </div>
                              </div>
                              <div className="flex flex-col items-center gap-1">
                                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  {Math.round(match.confidence * 100)}%
                                </Badge>
                              </div>
                              <div className="flex-1 text-right">
                                <div className="flex items-center gap-2 justify-end">
                                  <Badge variant="outline" className="text-[10px]">{match.matchedRecord.moduleCode}</Badge>
                                  <span className="text-xs font-mono font-medium">{match.matchedRecord.recordCode}</span>
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700">
                                {match.matchType}
                              </Badge>
                              <span className="text-muted-foreground italic">{match.reason}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Link2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Click &quot;Match Records&quot; to start</p>
                  <p className="text-sm mt-1">AI will find relationships between records across modules</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Run History */}
      {runHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent AI Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Records</TableHead>
                    <TableHead className="text-xs">Model</TableHead>
                    <TableHead className="text-xs">Tokens</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runHistory.map(run => (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs font-medium">{run.action}</TableCell>
                      <TableCell className="text-xs font-mono">{run.recordCount}</TableCell>
                      <TableCell className="text-xs font-mono">{run.modelUsed}</TableCell>
                      <TableCell className="text-xs font-mono">{run.tokensUsed}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(run.timestamp).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        {run.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : run.status === 'partial' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => !open && setDetailDialog(d => ({ ...d, open: false }))}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailDialog.title}</DialogTitle>
            <DialogDescription>Detailed AI analysis results</DialogDescription>
          </DialogHeader>
          {detailDialog.content}
        </DialogContent>
      </Dialog>
    </div>
  );
}
