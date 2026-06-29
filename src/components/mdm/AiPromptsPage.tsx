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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
  BookTemplate,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Wand2,
  FlaskConical,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface AiPrompt {
  id: string;
  name: string;
  useCase: string;
  description: string | null;
  systemPrompt: string;
  userPromptTemplate: string;
  inputAttributes: string | null;
  outputAttribute: string | null;
  maxChars: number;
  persona: string | null;
  audience: string | null;
  tone: string | null;
  language: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { outputs: number };
  createdAt: string;
  updatedAt: string;
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

interface ModuleInfo {
  id: string;
  moduleCode: string;
  moduleName: string;
}

interface RecordInfo {
  id: string;
  status: string;
  currentPayload: string;
}

interface FieldInfo {
  id: string;
  fieldCode: string;
  fieldName: string;
  dataType: string;
}

// STIBO use-case codes (Task spec)
const STIBO_USE_CASES = [
  { code: 'PTTT02', label: 'PTTT02 — Marketing Description' },
  { code: 'PTTT03', label: 'PTTT03 — Keyword Density' },
  { code: 'PTTT04', label: 'PTTT04 — Missing Attribute Values' },
  { code: 'PTTT05', label: 'PTTT05 — Description from Data + Image' },
  { code: 'GAIDGRP01', label: 'GAIDGRP01 — Group Title' },
  { code: 'GAIDGRP02', label: 'GAIDGRP02 — Group Description' },
  { code: 'TRANSLATION', label: 'TRANSLATION' },
  { code: 'IMAGE_ALT_TEXT', label: 'IMAGE_ALT_TEXT' },
  { code: 'IMAGE_EXTRACT_TEXT', label: 'IMAGE_EXTRACT_TEXT' },
  { code: 'IMAGE_FULL_DESC', label: 'IMAGE_FULL_DESC' },
  { code: 'IMAGE_SEO_KEYWORDS', label: 'IMAGE_SEO_KEYWORDS' },
];

// ============================================================================
// Main Page
// ============================================================================

export default function AiPromptsPage() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookTemplate className="w-6 h-6 text-red-600" />
          AI Prompt Library
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Governed GenAI enrichment. Manage STIBO prompt templates (PTTT02-05,
          GAIDGRP01-02, Translation, Image) and generate AI output for records
          pending review.
        </p>
      </div>

      <Tabs defaultValue="prompts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
        </TabsList>
        <TabsContent value="prompts">
          <PromptsTab />
        </TabsContent>
        <TabsContent value="generate">
          <GenerateTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Prompts Tab
// ============================================================================

function PromptsTab() {
  const { token, user } = useAppStore();
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AiPrompt | null>(null);
  const [seeding, setSeeding] = useState(false);

  const isSuperAdmin = user?.roles.includes('Super Admin');

  const loadPrompts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai-prompts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPrompts(data.prompts || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleSeed = async () => {
    if (!token) return;
    setSeeding(true);
    try {
      const res = await fetch('/api/ai-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'seed-defaults' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`Seeded ${data.count} default STIBO prompt templates`);
      loadPrompts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const handleDelete = async (prompt: AiPrompt) => {
    if (!token) return;
    if (!confirm(`Delete prompt "${prompt.name}" (${prompt.useCase})? This also deletes its outputs.`)) return;
    try {
      const res = await fetch(`/api/ai-prompts?id=${prompt.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Prompt deleted');
      loadPrompts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Prompt Templates</CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={handleSeed}
            disabled={seeding || !isSuperAdmin}
            title={!isSuperAdmin ? 'Super Admin only' : 'Seed 11 STIBO default prompts'}
          >
            {seeding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5" />
            )}
            Seed Default Prompts
          </Button>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white gap-1"
            onClick={() => {
              setEditing(null);
              setEditOpen(true);
            }}
            disabled={!isSuperAdmin}
            title={!isSuperAdmin ? 'Super Admin only' : 'Add a new prompt'}
          >
            <Plus className="w-3.5 h-3.5" /> Add Prompt
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : prompts.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <BookTemplate className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No prompts yet</p>
            <p className="text-sm mt-1">
              Click "Seed Default Prompts" to bulk-create the 11 STIBO templates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Use Case</TableHead>
                  <TableHead>Output Attribute</TableHead>
                  <TableHead className="text-center">Outputs</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                        {p.description || p.systemPrompt.slice(0, 80) + '…'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {p.useCase}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.outputAttribute || '—'}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {p._count?.outputs ?? 0}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          p.isActive
                            ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                            : 'border-gray-300 text-gray-500 bg-gray-50'
                        )}
                      >
                        {p.isActive ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setEditing(p);
                            setEditOpen(true);
                          }}
                          disabled={!isSuperAdmin}
                          aria-label="Edit"
                          title={!isSuperAdmin ? 'Super Admin only' : 'Edit'}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(p)}
                          disabled={!isSuperAdmin}
                          aria-label="Delete"
                          title={!isSuperAdmin ? 'Super Admin only' : 'Delete'}
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

      <PromptEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        prompt={editing}
        onSaved={() => {
          setEditOpen(false);
          loadPrompts();
        }}
      />
    </Card>
  );
}

// ============================================================================
// Prompt Edit Dialog
// ============================================================================

interface PromptEditProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: AiPrompt | null;
  onSaved: () => void;
}

function PromptEditDialog({ open, onOpenChange, prompt, onSaved }: PromptEditProps) {
  const { token } = useAppStore();
  const [form, setForm] = useState({
    name: '',
    useCase: 'PTTT02',
    description: '',
    systemPrompt: '',
    userPromptTemplate: '',
    inputAttributes: '',
    outputAttribute: '',
    maxChars: 500,
    persona: '',
    audience: '',
    tone: '',
    language: 'English',
    sortOrder: 0,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (prompt) {
      let inputAttrs = '';
      try {
        inputAttrs = prompt.inputAttributes
          ? (JSON.parse(prompt.inputAttributes) as string[]).join(', ')
          : '';
      } catch {
        inputAttrs = '';
      }
      setForm({
        name: prompt.name,
        useCase: prompt.useCase,
        description: prompt.description || '',
        systemPrompt: prompt.systemPrompt,
        userPromptTemplate: prompt.userPromptTemplate,
        inputAttributes: inputAttrs,
        outputAttribute: prompt.outputAttribute || '',
        maxChars: prompt.maxChars,
        persona: prompt.persona || '',
        audience: prompt.audience || '',
        tone: prompt.tone || '',
        language: prompt.language || 'English',
        sortOrder: prompt.sortOrder,
        isActive: prompt.isActive,
      });
    } else {
      setForm({
        name: '',
        useCase: 'PTTT02',
        description: '',
        systemPrompt: '',
        userPromptTemplate: '',
        inputAttributes: '',
        outputAttribute: '',
        maxChars: 500,
        persona: '',
        audience: '',
        tone: '',
        language: 'English',
        sortOrder: 0,
        isActive: true,
      });
    }
  }, [open, prompt]);

  const handleSave = async () => {
    if (!token) return;
    if (!form.name || !form.useCase || !form.systemPrompt || !form.userPromptTemplate) {
      toast.error('Name, Use Case, System Prompt, and User Prompt Template are required');
      return;
    }
    setSaving(true);
    try {
      const inputAttrs = form.inputAttributes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        ...(prompt ? { id: prompt.id } : {}),
        name: form.name,
        useCase: form.useCase,
        description: form.description || undefined,
        systemPrompt: form.systemPrompt,
        userPromptTemplate: form.userPromptTemplate,
        inputAttributes: inputAttrs.length > 0 ? inputAttrs : undefined,
        outputAttribute: form.outputAttribute || undefined,
        maxChars: Number(form.maxChars) || 500,
        persona: form.persona || undefined,
        audience: form.audience || undefined,
        tone: form.tone || undefined,
        language: form.language || undefined,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };

      const res = await fetch('/api/ai-prompts', {
        method: prompt ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(prompt ? 'Prompt updated' : 'Prompt created');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prompt ? 'Edit Prompt' : 'New Prompt'}</DialogTitle>
          <DialogDescription>
            Define the system + user prompts, input attributes, and output target field.
            Use <code>{'{{fieldCode}}'}</code> placeholders in the user template.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Use Case</Label>
            <Select
              value={form.useCase}
              onValueChange={(v) => setForm({ ...form, useCase: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STIBO_USE_CASES.map((uc) => (
                  <SelectItem key={uc.code} value={uc.code}>
                    {uc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="p-desc">Description</Label>
            <Input
              id="p-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="p-sys">System Prompt</Label>
            <Textarea
              id="p-sys"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              className="mt-1 font-mono text-xs"
              rows={5}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="p-user">User Prompt Template</Label>
            <Textarea
              id="p-user"
              value={form.userPromptTemplate}
              onChange={(e) => setForm({ ...form, userPromptTemplate: e.target.value })}
              className="mt-1 font-mono text-xs"
              rows={6}
              placeholder="Product: {{name}}\nBrand: {{brand}}..."
            />
          </div>
          <div>
            <Label htmlFor="p-input">Input Attributes (comma-separated)</Label>
            <Input
              id="p-input"
              value={form.inputAttributes}
              onChange={(e) => setForm({ ...form, inputAttributes: e.target.value })}
              className="mt-1"
              placeholder="name, brand, category"
            />
          </div>
          <div>
            <Label htmlFor="p-output">Output Attribute (target fieldCode)</Label>
            <Input
              id="p-output"
              value={form.outputAttribute}
              onChange={(e) => setForm({ ...form, outputAttribute: e.target.value })}
              className="mt-1"
              placeholder="marketing_description"
            />
          </div>
          <div>
            <Label htmlFor="p-max">Max Chars</Label>
            <Input
              id="p-max"
              type="number"
              value={form.maxChars}
              onChange={(e) => setForm({ ...form, maxChars: Number(e.target.value) })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="p-persona">Persona</Label>
            <Input
              id="p-persona"
              value={form.persona}
              onChange={(e) => setForm({ ...form, persona: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="p-aud">Audience</Label>
            <Input
              id="p-aud"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="p-tone">Tone</Label>
            <Input
              id="p-tone"
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="p-lang">Language</Label>
            <Input
              id="p-lang"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="p-sort">Sort Order</Label>
            <Input
              id="p-sort"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="p-active">Active</Label>
            <Select
              value={form.isActive ? 'true' : 'false'}
              onValueChange={(v) => setForm({ ...form, isActive: v === 'true' })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white gap-1"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {prompt ? 'Save Changes' : 'Create Prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Generate Tab
// ============================================================================

function GenerateTab() {
  const { token } = useAppStore();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [records, setRecords] = useState<RecordInfo[]>([]);
  const [recordId, setRecordId] = useState('');
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [promptId, setPromptId] = useState('');
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<AiOutput | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  // Load modules + prompts on mount
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [modRes, promptRes] = await Promise.all([
          fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/ai-prompts', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const modData = await modRes.json();
        const promptData = await promptRes.json();
        setModules(modData.modules || []);
        setPrompts(promptData.prompts || []);
      } catch {
        toast.error('Failed to load modules/prompts');
      }
    })();
  }, [token]);

  // Load records + fields when module changes
  useEffect(() => {
    if (!moduleId || !token) return;
    setRecordId('');
    setRecords([]);
    setFields([]);
    (async () => {
      try {
        const [recRes, fieldRes] = await Promise.all([
          fetch(`/api/records?moduleId=${moduleId}&limit=200`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/fields?moduleId=${moduleId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const recData = await recRes.json();
        const fieldData = await fieldRes.json();
        setRecords(recData.data || []);
        setFields(fieldData.fields || []);
      } catch {
        toast.error('Failed to load records');
      }
    })();
  }, [moduleId, token]);

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === promptId),
    [prompts, promptId]
  );

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === recordId),
    [records, recordId]
  );

  const handleGenerate = async () => {
    if (!token || !promptId || !recordId) return;
    setGenerating(true);
    setOutput(null);
    try {
      const res = await fetch('/api/ai-prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ promptId, recordId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setOutput(data.output);
      toast.success('AI output generated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!token || !output) return;
    setReviewing(true);
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
          : `Approved${selectedPrompt?.outputAttribute ? ` → copied to ${selectedPrompt.outputAttribute}` : ''}`
      );
      setOutput({ ...output, status: 'APPROVED' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setReviewing(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!token || !output) return;
    setReviewing(true);
    try {
      const res = await fetch('/api/ai-prompts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ outputId: output.id, action: 'REJECT', rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Rejected');
      setOutput({ ...output, status: 'REJECTED' });
      setRejectOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setReviewing(false);
    }
  };

  // Render record value preview
  const recordPayload = useMemo(() => {
    if (!selectedRecord) return {} as Record<string, unknown>;
    return parsePayload(selectedRecord.currentPayload);
  }, [selectedRecord]);

  const suggestions = useMemo(() => {
    if (!output?.suggestions) return [];
    try {
      return JSON.parse(output.suggestions) as string[];
    } catch {
      return [];
    }
  }, [output]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Selection panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-red-600" />
            Generate Output
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Module</Label>
            <Select value={moduleId} onValueChange={setModuleId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Pick module" />
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
              <Label>Record</Label>
              <Select value={recordId} onValueChange={setRecordId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pick record" />
                </SelectTrigger>
                <SelectContent>
                  {records.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No records
                    </SelectItem>
                  ) : (
                    records.slice(0, 100).map((r) => {
                      let name = r.id;
                      const p = parsePayload(r.currentPayload) as Record<string, any>;
                      name = p.name || p.article_name || r.id.slice(0, 8);
                      return (
                        <SelectItem key={r.id} value={r.id}>
                          {String(name)} ({r.status})
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Prompt</Label>
            <Select value={promptId} onValueChange={setPromptId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Pick prompt" />
              </SelectTrigger>
              <SelectContent>
                {prompts
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.useCase})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPrompt && (
            <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/30 border">
              {selectedPrompt.outputAttribute && (
                <div>
                  <span className="font-semibold">Output →</span>{' '}
                  <code className="font-mono">{selectedPrompt.outputAttribute}</code>
                </div>
              )}
              {selectedPrompt.persona && (
                <div>
                  <span className="font-semibold">Persona:</span> {selectedPrompt.persona}
                </div>
              )}
              {selectedPrompt.tone && (
                <div>
                  <span className="font-semibold">Tone:</span> {selectedPrompt.tone}
                </div>
              )}
            </div>
          )}

          {/* Record preview */}
          {selectedRecord && (
            <div>
              <Label>Record Values (input attributes)</Label>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border bg-muted/20 p-2 text-xs space-y-1 custom-scrollbar">
                {fields.length === 0 && (
                  <p className="text-muted-foreground">No fields loaded.</p>
                )}
                {fields.map((f) => (
                  <div key={f.id} className="flex gap-2">
                    <span className="font-mono text-muted-foreground w-[140px] shrink-0">
                      {f.fieldCode}:
                    </span>
                    <span className="font-medium break-all">
                      {String(recordPayload[f.fieldCode] ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!promptId || !recordId || generating}
            className="w-full bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </CardContent>
      </Card>

      {/* Output panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-600" />
            Generated Output
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!output ? (
            <div className="text-center text-muted-foreground py-12">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No output yet</p>
              <p className="text-sm mt-1">Pick a record + prompt and click Generate.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    output.status === 'APPROVED' &&
                      'border-emerald-300 text-emerald-700 bg-emerald-50',
                    output.status === 'REJECTED' &&
                      'border-red-300 text-red-700 bg-red-50',
                    output.status === 'PENDING_REVIEW' &&
                      'border-amber-300 text-amber-700 bg-amber-50'
                  )}
                >
                  {output.status}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Tokens: {output.tokensUsed}
                </Badge>
                <ConfidenceBadge score={output.confidenceScore} />
              </div>

              <div>
                <Label>Output</Label>
                <div className="mt-1 p-3 rounded-lg border bg-muted/20 text-sm whitespace-pre-wrap max-h-72 overflow-y-auto custom-scrollbar">
                  {output.output}
                </div>
              </div>

              {output.reasons && (
                <div>
                  <Label>Reasons</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {output.reasons}
                  </p>
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

              {output.status === 'PENDING_REVIEW' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleApprove}
                    disabled={reviewing}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                  >
                    {reviewing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Approve & Copy to Target
                  </Button>
                  <Button
                    onClick={() => setRejectOpen(true)}
                    disabled={reviewing}
                    variant="outline"
                    className="gap-1 hover:text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={handleReject}
      />
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
      : score >= 50
      ? 'border-amber-300 text-amber-700 bg-amber-50'
      : 'border-red-300 text-red-700 bg-red-50';
  return (
    <Badge variant="outline" className={cn('text-xs font-mono', color)}>
      {score}% confidence
    </Badge>
  );
}

// ============================================================================
// Reject Dialog
// ============================================================================

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
