'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  AlertTriangle,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface AiPrompt {
  id: string;
  name: string;
  useCase: string;
  outputAttribute: string | null;
}

interface AiOutput {
  id: string;
  promptId: string;
  recordId: string;
  userId: string | null;
  output: string;
  confidenceScore: number;
  reasons: string | null;
  suggestions: string | null;
  status: string;
  tokensUsed: number;
  createdAt: string;
  prompt?: AiPrompt;
}

interface RecordInfo {
  id: string;
  status: string;
  currentPayload: string;
  moduleId: string;
}

// ============================================================================
// Main Page
// ============================================================================

export default function AiReviewPage() {
  const { token } = useAppStore();
  const [outputs, setOutputs] = useState<AiOutput[]>([]);
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPromptId, setFilterPromptId] = useState('all');
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
  const [previewOutput, setPreviewOutput] = useState<AiOutput | null>(null);
  const [rejectOutput, setRejectOutput] = useState<AiOutput | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [outRes, promptRes] = await Promise.all([
        fetch('/api/ai-prompts/review', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/ai-prompts', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const outData = await outRes.json();
      const promptData = await promptRes.json();
      if (!outRes.ok) throw new Error(outData.error || 'Failed');
      setOutputs(outData.outputs || []);
      // Dedupe prompts that appear in the outputs list (in case some have
      // been deleted but their outputs linger).
      const promptMap = new Map<string, AiPrompt>();
      for (const o of outData.outputs || []) {
        if (o.prompt) promptMap.set(o.prompt.id, o.prompt);
      }
      for (const p of promptData.prompts || []) {
        promptMap.set(p.id, p);
      }
      setPrompts(Array.from(promptMap.values()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return outputs.filter((o) => {
      if (filterPromptId !== 'all' && o.promptId !== filterPromptId) return false;
      if (lowConfidenceOnly && o.confidenceScore >= 80) return false;
      return true;
    });
  }, [outputs, filterPromptId, lowConfidenceOnly]);

  const stats = useMemo(() => {
    const total = outputs.length;
    if (total === 0) return { total: 0, avg: 0, lowCount: 0 };
    const sum = outputs.reduce((acc, o) => acc + o.confidenceScore, 0);
    const avg = Math.round(sum / total);
    const lowCount = outputs.filter((o) => o.confidenceScore < 80).length;
    return { total, avg, lowCount };
  }, [outputs]);

  const handleApprove = async (output: AiOutput) => {
    if (!token) return;
    setReviewing(output.id);
    try {
      const res = await fetch('/api/ai-prompts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ outputId: output.id, action: 'APPROVE' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(
        data.amendmentCreated
          ? 'Approved — amendment workflow triggered (record moved to REVISION_PENDING)'
          : `Approved${output.prompt?.outputAttribute ? ` → copied to ${output.prompt.outputAttribute}` : ''}`
      );
      setOutputs((prev) => prev.filter((o) => o.id !== output.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setReviewing(null);
    }
  };

  const handleReject = async (output: AiOutput, reason: string) => {
    if (!token) return;
    setReviewing(output.id);
    try {
      const res = await fetch('/api/ai-prompts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          outputId: output.id,
          action: 'REJECT',
          rejectionReason: reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Rejected');
      setOutputs((prev) => prev.filter((o) => o.id !== output.id));
      setRejectOutput(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setReviewing(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckCheck className="w-6 h-6 text-red-600" />
            AI Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review generated AI outputs before they are copied into the record.
            Low-confidence items are highlighted for extra scrutiny.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Pending Review</p>
            <p className="text-3xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Avg Confidence</p>
            <p
              className={cn(
                'text-3xl font-bold mt-1',
                stats.avg >= 80
                  ? 'text-emerald-600'
                  : stats.avg >= 50
                  ? 'text-amber-600'
                  : 'text-red-600'
              )}
            >
              {stats.avg}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">
              Low Confidence (&lt;80%)
            </p>
            <p className="text-3xl font-bold mt-1 text-red-600">{stats.lowCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>Filter:</span>
          </div>
          <div className="w-[260px]">
            <Select value={filterPromptId} onValueChange={setFilterPromptId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All prompts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All prompts</SelectItem>
                {prompts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.useCase})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={lowConfidenceOnly}
              onChange={(e) => setLowConfidenceOnly(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <span>Only show &lt;80% confidence</span>
          </label>
          <div className="ml-auto text-xs text-muted-foreground">
            Showing <span className="font-semibold">{filtered.length}</span> of{' '}
            {outputs.length}
          </div>
        </CardContent>
      </Card>

      {/* Queue table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No outputs pending review</p>
              <p className="text-sm mt-1">
                Generate outputs from the AI Prompts → Generate tab to populate this queue.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Generated At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{o.recordId.slice(0, 12)}</span>
                        {o.prompt?.outputAttribute && (
                          <div className="text-[10px] text-muted-foreground">
                            → {o.prompt.outputAttribute}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {o.prompt?.name || '(deleted prompt)'}
                        </div>
                        {o.prompt && (
                          <Badge variant="outline" className="text-[10px] font-mono mt-0.5">
                            {o.prompt.useCase}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge score={o.confidenceScore} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setPreviewOutput(o)}
                            aria-label="Preview"
                            title="Preview output"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs gap-1 text-emerald-600 hover:bg-emerald-50"
                            onClick={() => handleApprove(o)}
                            disabled={reviewing === o.id}
                          >
                            {reviewing === o.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs gap-1 text-red-600 hover:bg-red-50"
                            onClick={() => setRejectOutput(o)}
                            disabled={reviewing === o.id}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
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

      {/* Preview Dialog */}
      <PreviewDialog
        output={previewOutput}
        onClose={() => setPreviewOutput(null)}
        onApprove={(o) => {
          setPreviewOutput(null);
          handleApprove(o);
        }}
        onReject={(o) => {
          setPreviewOutput(null);
          setRejectOutput(o);
        }}
      />

      {/* Reject Dialog */}
      <RejectDialog
        output={rejectOutput}
        onClose={() => setRejectOutput(null)}
        onConfirm={(reason) => {
          if (rejectOutput) handleReject(rejectOutput, reason);
        }}
      />
    </div>
  );
}

// ============================================================================
// Confidence Badge
// ============================================================================

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
      : score >= 50
      ? 'border-amber-300 text-amber-700 bg-amber-50'
      : 'border-red-300 text-red-700 bg-red-50';
  const icon = score >= 80 ? null : (
    <AlertTriangle className="w-3 h-3 mr-1" />
  );
  return (
    <Badge variant="outline" className={cn('text-xs font-mono', color)}>
      {icon}
      {score}%
    </Badge>
  );
}

// ============================================================================
// Preview Dialog
// ============================================================================

function PreviewDialog({
  output,
  onClose,
  onApprove,
  onReject,
}: {
  output: AiOutput | null;
  onClose: () => void;
  onApprove: (o: AiOutput) => void;
  onReject: (o: AiOutput) => void;
}) {
  const { token } = useAppStore();
  const [record, setRecord] = useState<RecordInfo | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  useEffect(() => {
    if (!output || !token) return;
    setRecord(null);
    setLoadingRecord(true);
    (async () => {
      try {
        const res = await fetch(`/api/ai-prompts/review?id=${output.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setRecord(data.record || null);
      } catch {
        // silent
      } finally {
        setLoadingRecord(false);
      }
    })();
  }, [output, token]);

  if (!output) return null;

  const suggestions = (() => {
    if (!output.suggestions) return [];
    try {
      return JSON.parse(output.suggestions) as string[];
    } catch {
      return [];
    }
  })();

  const recordPayload = (() => {
    if (!record) return {} as Record<string, unknown>;
    try {
      return JSON.parse(record.currentPayload) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  return (
    <Dialog open={!!output} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-red-600" />
            AI Output Preview
          </DialogTitle>
          <DialogDescription>
            Review the generated output and the original record values before approving.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Original record values */}
          <div>
            <Label>Original Record Values</Label>
            <div className="mt-1 p-3 rounded-lg border bg-muted/20 text-xs space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
              {loadingRecord ? (
                <Skeleton className="h-12 w-full" />
              ) : record ? (
                Object.keys(recordPayload).length === 0 ? (
                  <p className="text-muted-foreground italic">
                    Record payload is empty.
                  </p>
                ) : (
                  Object.entries(recordPayload).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="font-mono text-muted-foreground w-[140px] shrink-0">
                        {k}:
                      </span>
                      <span className="font-medium break-all">{String(v)}</span>
                    </div>
                  ))
                )
              ) : (
                <p className="text-muted-foreground italic">Record not found.</p>
              )}
            </div>
          </div>

          {/* Output */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Generated Output</Label>
              <ConfidenceBadge score={output.confidenceScore} />
            </div>
            <div className="p-3 rounded-lg border bg-muted/20 text-sm whitespace-pre-wrap max-h-72 overflow-y-auto custom-scrollbar">
              {output.output}
            </div>
          </div>
        </div>

        {output.reasons && (
          <div>
            <Label>Reasons (from LLM)</Label>
            <p className="mt-1 text-xs text-muted-foreground">{output.reasons}</p>
          </div>
        )}

        {suggestions.length > 0 && (
          <div>
            <Label>Correction Suggestions</Label>
            <ul className="mt-1 text-xs space-y-1 list-disc list-inside">
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {output.prompt?.outputAttribute && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Copy-to-target will modify the record.</p>
              <p className="mt-1">
                Approving will set <code className="font-mono">{output.prompt.outputAttribute}</code>{' '}
                on record <code className="font-mono">{output.recordId.slice(0, 12)}…</code>.
                {record?.status === 'ACTIVE' &&
                  ' ACTIVE records follow the amendment workflow (REVISION_PENDING + ApprovalTicket).'}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            className="gap-1 text-red-600 hover:bg-red-50"
            onClick={() => onReject(output)}
          >
            <XCircle className="w-4 h-4" /> Reject
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            onClick={() => onApprove(output)}
          >
            <CheckCircle2 className="w-4 h-4" /> Approve & Copy to Target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Reject Dialog
// ============================================================================

function RejectDialog({
  output,
  onClose,
  onConfirm,
}: {
  output: AiOutput | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (output) setReason('');
  }, [output]);

  if (!output) return null;

  return (
    <Dialog open={!!output} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject AI Output</DialogTitle>
          <DialogDescription>
            Provide a reason for rejecting this output. It will be recorded for audit.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Output contains incorrect product specifications…"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(reason)}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Confirm Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
