'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sparkles, Send, Plus, MessageSquare, PanelLeftClose, PanelLeft, Bot, User as UserIcon,
  Search, Star, Pin, MoreHorizontal, Trash2, Pencil, Copy, Check, RefreshCw, Square,
  FilePlus, GitBranch, Upload, Key, Bookmark, BookmarkCheck, AlertCircle, Zap, X,
  ThumbsUp, ThumbsDown, Download, Tag, ShieldCheck, Database, ArrowLeftRight, FileText,
  Wrench, CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronRight, Eye, Shield,
  FolderTree, Image, Layers, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

// ─── Types ──────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string | null;
  bookmarked: boolean;
  bookmarkedAt: string | null;
  pinned: boolean;
  category: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: { content: string; role: string; createdAt: string }[];
}

interface ToolConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  preview: {
    action: string;
    target: string;
    details: Record<string, unknown>;
  };
}

interface ToolResult {
  name: string;
  result: {
    success?: boolean;
    data?: unknown;
    error?: string;
    preview?: { action: string; target: string; details: Record<string, unknown> };
  };
}

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  isWrite: boolean;
  requiresConfirmation: boolean;
  requiredPermission: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  tokensUsed?: number;
  feedback?: string | null;
  isEdited?: boolean;
  editedContent?: string | null;
  reasoning?: string;
  /** Tool results attached to this message */
  toolResults?: ToolResult[];
  /** Pending confirmations for destructive operations */
  pendingConfirmations?: ToolConfirmation[];
}

type FilterTab = 'all' | 'bookmarked' | 'pinned';

const CATEGORIES = [
  { value: 'DATA_QUALITY', label: 'Data Quality', icon: ShieldCheck, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'ENRICHMENT', label: 'Enrichment', icon: Sparkles, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  { value: 'MAPPING', label: 'Mapping', icon: ArrowLeftRight, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'GENERAL', label: 'General', icon: MessageSquare, color: 'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300' },
];

const WELCOME_MESSAGE = `Hi! I'm your **MAA BTOOL AI Assistant** — aligned with Stibo Systems best practices. I can now **directly interact with your MDM data**!

### 🔍 Read Operations
- **Search & browse records** across all modules
- **View record details** including quality scores and images
- **Check data quality** and hierarchy structures
- **Search digital assets** in the DAM

### ✏️ Write Operations (⚠️ all require confirmation)
- **Create new records** (saved as DRAFT) — confirmation required
- **Update existing records** (triggers amendment for ACTIVE records) — confirmation required
- **Delete DRAFT records** — confirmation required
- **Bulk update** multiple records — confirmation required

### ✅ Workflow Actions (⚠️ all require confirmation)
- **Submit for approval** — move DRAFT → IN_REVIEW
- **Approve records** — move IN_REVIEW → ACTIVE
- **Reject records** — with reason

### 🤖 AI-Powered Features
- **Enrich records** — AI suggests missing field values
- **Classify records** — AI suggests categories and tags
- **Quality checks** — completeness, consistency, accuracy analysis
- **🌐 Translate records** — translate descriptions between languages (ID↔EN, etc.)
- **🏷️ Categorize from image** — VLM auto-detects category, brand, color from product photos
- **✨ Auto-fill AI fields** — runs both translation + categorization at once

> ⚠️ All write, workflow, and asset operations require your explicit confirmation before execution.

How can I help you today?`;

const SUGGESTED_PROMPTS = [
  { icon: Database, title: 'Search Records', prompt: 'Search for Nike products in the Article Master module.', category: 'GENERAL' },
  { icon: FilePlus, title: 'Create a Record', prompt: 'Create a new article record in DRAFT status with name: Test Product, brand: Nike, category: Footwear.', category: 'GENERAL' },
  { icon: ShieldCheck, title: 'Data Quality Analysis', prompt: 'Run a data quality check on the Article Master module and show me the results.', category: 'DATA_QUALITY' },
  { icon: Sparkles, title: 'Enrichment', prompt: 'Find a record in Article Master and enrich its missing fields using AI.', category: 'ENRICHMENT' },
  { icon: ClipboardList, title: 'Workflow Actions', prompt: 'List all records that are in IN_REVIEW status for the Article Master module.', category: 'GENERAL' },
  { icon: FolderTree, title: 'View Hierarchy', prompt: 'Show me the hierarchy structure for the Article Master module.', category: 'GENERAL' },
  { icon: ArrowLeftRight, title: 'Translate', prompt: 'Find a record in Article Master and translate its description from Indonesian to English.', category: 'ENRICHMENT' },
  { icon: Tag, title: 'AI Auto-Fill', prompt: 'Find a record and auto-fill all AI fields (translation + categorization).', category: 'ENRICHMENT' },
];

const PROVIDER_BADGES: Record<string, { label: string; color: string }> = {
  zai: { label: 'ZAI', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  openai: { label: 'OpenAI', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  gemini: { label: 'Gemini', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  'azure-openai': { label: 'Azure OpenAI', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  custom: { label: 'Custom LLM', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
};

const TOOL_CATEGORY_ICONS: Record<string, typeof Database> = {
  read: Database,
  write: Pencil,
  workflow: ClipboardList,
  ai: Sparkles,
  asset: Image,
};

const TOOL_CATEGORY_COLORS: Record<string, string> = {
  read: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  write: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  workflow: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  ai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  asset: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

/** Format tool results for display in chat */
function formatToolResults(results: ToolResult[]): string {
  if (!Array.isArray(results)) return String(results);
  return results.map(r => {
    if (r.result && typeof r.result === 'object' && r.result !== null) {
      if (r.result.error) return `❌ **${r.name}**: ${r.result.error}`;
      if (r.result.success && r.result.data) {
        const dataStr = typeof r.result.data === 'string' ? r.result.data : JSON.stringify(r.result.data, null, 2);
        const truncated = dataStr.length > 2000 ? dataStr.slice(0, 2000) + '...' : dataStr;
        return `✅ **${r.name}**:\n\`\`\`json\n${truncated}\n\`\`\``;
      }
      if (r.result.preview) {
        return `⚠️ **${r.name}** — Confirmation Required\n- **Action**: ${r.result.preview.action}\n- **Target**: ${r.result.preview.target}`;
      }
    }
    return `📋 **${r.name}**: ${JSON.stringify(r.result, null, 2).slice(0, 1000)}`;
  }).join('\n\n');
}

export default function AiAssistantPage() {
  const { token, user } = useAppStore();
  const { resolvedTheme } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [renameConvId, setRenameConvId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);
  const [deleteMsgId, setDeleteMsgId] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string>('ZAI');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [categorizeConvId, setCategorizeConvId] = useState<string | null>(null);
  const [categorizeValue, setCategorizeValue] = useState('');

  // ─── New state for write operations ──────────────────
  const [pendingConfirmation, setPendingConfirmation] = useState<ToolConfirmation | null>(null);
  const [confirmingTool, setConfirmingTool] = useState(false);
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
  const [toolExecutions, setToolExecutions] = useState<Record<string, { status: 'pending' | 'executing' | 'success' | 'failed'; result?: unknown }>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const canAccess = user?.roles?.some(r => ['Super Admin', 'AI User', 'Manager'].includes(r)) ?? false;
  const perms = usePermissions();
  const isReadOnly = perms.isReadOnly;
  const canEditOwnMessages = perms.canEditAI && !isReadOnly;

  // Load AI provider config
  useEffect(() => {
    if (!token) return;
    fetch('/api/ai/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.config?.provider) setAiProvider(data.config.provider); })
      .catch(() => {});
  }, [token]);

  // Load available tools
  useEffect(() => {
    if (!token) return;
    fetch('/api/ai/chat/tools', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.tools) setAvailableTools(data.tools); })
      .catch(() => {});
  }, [token]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ---- Load conversations ----
  const loadConversations = useCallback(async () => {
    if (!token || !user?.userId) return;
    setLoadingConvs(true);
    try {
      const res = await fetch(`/api/ai/chat?userId=${user.userId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setConversations(data.conversations || []);
    } catch { /* silently fail */ } finally { setLoadingConvs(false); }
  }, [token, user?.userId]);

  useEffect(() => { if (canAccess) loadConversations(); }, [loadConversations, canAccess]);

  // ---- Load full conversation ----
  const loadConversation = useCallback(async (convId: string) => {
    if (!token) return;
    setActiveConversationId(convId);
    setLoadingMessages(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/ai/chat?conversationId=${convId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok && data.conversation) {
        const msgs: ChatMessage[] = (data.conversation.messages || []).map((m: { id: string; role: string; content: string; createdAt: string; tokensUsed?: number; feedback?: string; isEdited?: boolean; editedContent?: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.editedContent || m.content,
          createdAt: m.createdAt,
          tokensUsed: m.tokensUsed,
          feedback: m.feedback,
          isEdited: m.isEdited,
          editedContent: m.editedContent,
        }));
        setMessages(msgs);
      } else { toast.error('Failed to load conversation'); }
    } catch { toast.error('Failed to load conversation'); } finally { setLoadingMessages(false); }
  }, [token]);

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    setActiveConversationId(null);
    setMessages([]);
    setIsStreaming(false);
    setIsLoading(false);
    setAiConfigured(null);
    setPendingConfirmation(null);
    setToolExecutions({});
    textareaRef.current?.focus();
  };

  // ---- Filtered conversations ----
  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (filterTab === 'bookmarked') list = list.filter(c => c.bookmarked);
    if (filterTab === 'pinned') list = list.filter(c => c.pinned);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => (c.title || 'New Conversation').toLowerCase().includes(q));
    }
    return list;
  }, [conversations, filterTab, searchQuery]);

  // ---- Send message (streaming) ----
  const handleSendMessage = useCallback(async (overrideMessage?: string) => {
    const content = (overrideMessage ?? inputMessage).trim();
    if (!token || !content || isStreaming || isReadOnly) return;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsStreaming(true);
    setIsLoading(true);

    const assistantId = `streaming-${Date.now()}`;
    setStreamingMessageId(assistantId);
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      toolResults: [],
      pendingConfirmations: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: content, conversationId: activeConversationId || undefined }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let fullReasoning = '';
      let finalConversationId = activeConversationId;
      let finalMessageId = assistantId;
      let finalTokens = 0;
      let finalAiConfigured: boolean | null = null;
      const toolResultsAcc: ToolResult[] = [];
      const confirmationsAcc: ToolConfirmation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventStr of events) {
          const line = eventStr.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === 'delta' && evt.content) {
              fullContent += evt.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent, reasoning: fullReasoning || undefined } : m
                )
              );
            } else if (evt.type === 'reasoning' && evt.content) {
              fullReasoning += evt.content;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, reasoning: fullReasoning } : m)
              );
            } else if (evt.type === 'done') {
              finalConversationId = evt.conversationId || finalConversationId;
              finalMessageId = evt.messageId || finalMessageId;
              finalTokens = evt.tokensUsed || 0;
              finalAiConfigured = evt.aiConfigured ?? null;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, id: finalMessageId, tokensUsed: finalTokens, toolResults: toolResultsAcc.length > 0 ? toolResultsAcc : undefined, pendingConfirmations: confirmationsAcc.length > 0 ? confirmationsAcc : undefined }
                    : m
                )
              );
              if (!activeConversationId && finalConversationId) setActiveConversationId(finalConversationId);
              if (finalAiConfigured !== null) setAiConfigured(finalAiConfigured);
            } else if (evt.type === 'tool_result') {
              // Tool execution results
              const results: ToolResult[] = (evt.toolResults || []).map((tr: { name: string; result: unknown }) => ({
                name: tr.name,
                result: tr.result as ToolResult['result'],
              }));
              toolResultsAcc.push(...results);

              // Update tool execution status
              for (const tr of results) {
                setToolExecutions((prev) => ({
                  ...prev,
                  [tr.name]: { status: tr.result?.success ? 'success' : 'failed', result: tr.result },
                }));
              }

              // Append formatted results to message
              const toolInfo = results.length > 0
                ? `\n\n---\n**🔧 Tools Executed:** ${results.map(tc => tc.name).join(', ')}\n\n${formatToolResults(results)}\n---\n`
                : '';
              fullContent += toolInfo;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent, toolResults: [...(m.toolResults || []), ...results] } : m
                )
              );
            } else if (evt.type === 'tool_confirmation') {
              // Destructive tool requires confirmation
              const confirmations: ToolConfirmation[] = (evt.confirmations || []).map((c: ToolConfirmation) => c);
              confirmationsAcc.push(...confirmations);

              // Set the first confirmation for the dialog
              if (confirmations.length > 0 && !pendingConfirmation) {
                setPendingConfirmation(confirmations[0]);
              }

              // Add notice to message
              const confirmNotice = '\n\n⚠️ **Action requires confirmation**: ' +
                confirmations.map(c => `**${c.preview.action}** on **${c.preview.target}**`).join(', ') +
                '\n_Please review and confirm or reject this action._';
              fullContent += confirmNotice;

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent, pendingConfirmations: [...(m.pendingConfirmations || []), ...confirmations] } : m
                )
              );

              // Update tool execution status
              for (const c of confirmations) {
                setToolExecutions((prev) => ({
                  ...prev,
                  [c.toolName]: { status: 'pending' },
                }));
              }
            } else if (evt.type === 'error') {
              toast.error(evt.message || 'AI request failed');
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            }
          } catch { /* ignore malformed events */ }
        }
      }
      loadConversations();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content || '_(stopped)_' } : m));
      } else {
        toast.error((err as Error).message || 'Network error. Please try again.');
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
      }
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
      abortControllerRef.current = null;
      setStreamingMessageId(null);
    }
  }, [token, inputMessage, isStreaming, isReadOnly, activeConversationId, loadConversations, pendingConfirmation]);

  const handleStop = () => { abortControllerRef.current?.abort(); };

  // ---- Confirm destructive tool ----
  const handleConfirmTool = useCallback(async (confirmed: boolean) => {
    if (!token || !pendingConfirmation) return;
    setConfirmingTool(true);

    try {
      const res = await fetch('/api/ai/chat/execute-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          toolName: pendingConfirmation.toolName,
          args: pendingConfirmation.args,
          confirmed,
        }),
      });

      const data = await res.json();

      if (confirmed && data.success) {
        toast.success(`✅ ${pendingConfirmation.preview.action} executed successfully`);
        setToolExecutions((prev) => ({
          ...prev,
          [pendingConfirmation.toolName]: { status: 'success', result: data.data },
        }));

        // Add result to the last assistant message
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const lastMsg = prev[lastIdx];
          if (lastMsg?.role === 'assistant') {
            const resultText = `\n\n✅ **${pendingConfirmation.preview.action} Confirmed** — ${pendingConfirmation.preview.target}\n\`\`\`json\n${JSON.stringify(data.data, null, 2).slice(0, 1000)}\n\`\`\``;
            const newMsg = {
              ...lastMsg,
              content: lastMsg.content + resultText,
              pendingConfirmations: (lastMsg.pendingConfirmations || []).filter(
                c => c.toolName !== pendingConfirmation.toolName
              ),
            };
            return [...prev.slice(0, lastIdx), newMsg];
          }
          return prev;
        });
      } else if (confirmed && !data.success) {
        toast.error(`❌ ${pendingConfirmation.preview.action} failed: ${data.error || 'Unknown error'}`);
        setToolExecutions((prev) => ({
          ...prev,
          [pendingConfirmation.toolName]: { status: 'failed', result: data },
        }));
      } else {
        toast.info(`🚫 ${pendingConfirmation.preview.action} rejected`);
        setToolExecutions((prev) => ({
          ...prev,
          [pendingConfirmation.toolName]: { status: 'failed', result: { rejected: true } },
        }));

        // Add rejection notice to message
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const lastMsg = prev[lastIdx];
          if (lastMsg?.role === 'assistant') {
            const rejectText = `\n\n🚫 **${pendingConfirmation.preview.action} Rejected** — You chose not to proceed with this action.`;
            const newMsg = {
              ...lastMsg,
              content: lastMsg.content + rejectText,
              pendingConfirmations: (lastMsg.pendingConfirmations || []).filter(
                c => c.toolName !== pendingConfirmation.toolName
              ),
            };
            return [...prev.slice(0, lastIdx), newMsg];
          }
          return prev;
        });
      }
    } catch {
      toast.error('Failed to execute tool');
    } finally {
      setConfirmingTool(false);
      setPendingConfirmation(null);
    }
  }, [token, pendingConfirmation]);

  // ---- Regenerate last assistant response ----
  const handleRegenerate = useCallback(() => {
    if (isStreaming) return;
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    const lastUserMsg = messages[messages.length - 1 - lastUserIdx];
    setMessages((prev) => prev.slice(0, messages.length - 1 - lastUserIdx));
    setTimeout(() => handleSendMessage(lastUserMsg.content), 50);
  }, [messages, isStreaming, handleSendMessage]);

  // ---- Conversation actions ----
  const handleToggleBookmark = async (convId: string, current: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/ai/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ conversationId: convId, action: current ? 'unbookmark' : 'bookmark' }) });
      if (res.ok) {
        setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, bookmarked: !current, bookmarkedAt: current ? null : new Date().toISOString() } : c));
        toast.success(current ? 'Removed bookmark' : 'Bookmarked');
      } else { toast.error('Failed to update'); }
    } catch { toast.error('Network error'); }
  };

  const handleTogglePin = async (convId: string, current: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/ai/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ conversationId: convId, action: current ? 'unpin' : 'pin' }) });
      if (res.ok) {
        setConversations((prev) => { const updated = prev.map((c) => (c.id === convId ? { ...c, pinned: !current } : c)); return [...updated].sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; if (a.bookmarked !== b.bookmarked) return a.bookmarked ? -1 : 1; return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); }); });
        toast.success(current ? 'Unpinned' : 'Pinned');
      } else { toast.error('Failed to update'); }
    } catch { toast.error('Network error'); }
  };

  const handleOpenRename = (convId: string, currentTitle: string) => { setRenameConvId(convId); setRenameValue(currentTitle || ''); };

  const handleConfirmRename = async () => {
    if (!token || !renameConvId || !renameValue.trim()) return;
    try {
      const res = await fetch('/api/ai/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ conversationId: renameConvId, action: 'rename', title: renameValue.trim() }) });
      if (res.ok) { setConversations((prev) => prev.map((c) => (c.id === renameConvId ? { ...c, title: renameValue.trim() } : c))); toast.success('Conversation renamed'); }
      else { toast.error('Failed to rename'); }
    } catch { toast.error('Network error'); } finally { setRenameConvId(null); setRenameValue(''); }
  };

  const handleConfirmDeleteConv = async () => {
    if (!token || !deleteConvId) return;
    try {
      const res = await fetch(`/api/ai/chat?conversationId=${deleteConvId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setConversations((prev) => prev.filter((c) => c.id !== deleteConvId)); if (activeConversationId === deleteConvId) { setActiveConversationId(null); setMessages([]); } toast.success('Conversation deleted'); }
      else { toast.error('Failed to delete'); }
    } catch { toast.error('Network error'); } finally { setDeleteConvId(null); }
  };

  const handleOpenCategorize = (convId: string, currentCategory: string | null) => { setCategorizeConvId(convId); setCategorizeValue(currentCategory || 'GENERAL'); };

  const handleConfirmCategorize = async () => {
    if (!token || !categorizeConvId || !categorizeValue) return;
    try {
      const res = await fetch('/api/ai/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ conversationId: categorizeConvId, action: 'categorize', category: categorizeValue }) });
      if (res.ok) { setConversations((prev) => prev.map((c) => (c.id === categorizeConvId ? { ...c, category: categorizeValue } : c))); toast.success('Category updated'); }
      else { toast.error('Failed to categorize'); }
    } catch { toast.error('Network error'); } finally { setCategorizeConvId(null); setCategorizeValue(''); }
  };

  const handleEditMessage = (msgId: string, currentContent: string) => { if (isReadOnly) return; setEditingMsgId(msgId); setEditingContent(currentContent); };

  const handleConfirmEditMessage = async () => {
    if (!token || !editingMsgId || !editingContent.trim() || isReadOnly) return;
    try {
      const res = await fetch('/api/ai/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'editMessage', messageId: editingMsgId, content: editingContent.trim() }) });
      if (res.ok) { setMessages((prev) => prev.map((m) => m.id === editingMsgId ? { ...m, content: editingContent.trim(), isEdited: true } : m)); toast.success('Message edited'); }
      else { toast.error('Failed to edit message'); }
    } catch { toast.error('Network error'); } finally { setEditingMsgId(null); setEditingContent(''); }
  };

  const handleConfirmDeleteMessage = async () => {
    if (!token || !deleteMsgId || isReadOnly) return;
    try {
      const res = await fetch(`/api/ai/chat?messageId=${deleteMsgId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setMessages((prev) => prev.filter((m) => m.id !== deleteMsgId)); toast.success('Message deleted'); }
      else { toast.error('Failed to delete message'); }
    } catch { toast.error('Network error'); } finally { setDeleteMsgId(null); }
  };

  const handleFeedback = async (msgId: string, feedback: 'positive' | 'negative') => {
    if (!token) return;
    try {
      const res = await fetch('/api/ai/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'feedback', messageId: msgId, feedback }) });
      if (res.ok) { setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, feedback } : m)); toast.success(feedback === 'positive' ? 'Thanks for the feedback!' : 'Feedback recorded'); }
    } catch { toast.error('Failed to submit feedback'); }
  };

  const handleExportConversation = (format: 'markdown' | 'text') => {
    if (messages.length === 0) { toast.error('No messages to export'); return; }
    const conv = conversations.find(c => c.id === activeConversationId);
    const title = conv?.title || 'Conversation';
    let content = '';
    if (format === 'markdown') {
      content = `# ${title}\n\nExported from MAA BTOOL AI Assistant on ${new Date().toLocaleString()}\n\n---\n\n`;
      messages.forEach(msg => { const role = msg.role === 'user' ? '👤 User' : '🤖 AI Assistant'; content += `### ${role}\n${msg.isEdited ? '*(edited)*\n' : ''}\n${msg.content}\n\n---\n\n`; });
    } else {
      content = `${title}\nExported: ${new Date().toLocaleString()}\n${'='.repeat(40)}\n\n`;
      messages.forEach(msg => { const role = msg.role === 'user' ? 'User' : 'AI Assistant'; content += `[${role}]${msg.isEdited ? ' (edited)' : ''}\n${msg.content}\n\n`; });
    }
    const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.${format === 'markdown' ? 'md' : 'txt'}`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported as ${format}`);
  };

  const handleCopyMessage = (msg: ChatMessage) => { navigator.clipboard.writeText(msg.content); setCopiedMessageId(msg.id); toast.success('Copied to clipboard'); setTimeout(() => setCopiedMessageId(null), 2000); };
  const handleCopyCode = (code: string, id: string) => { navigator.clipboard.writeText(code); setCopiedCode(id); toast.success('Code copied'); setTimeout(() => setCopiedCode(null), 2000); };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const formatRelativeTime = (dateStr: string) => {
    const d = new Date(dateStr); const now = new Date(); const diffMs = now.getTime() - d.getTime(); const sec = Math.floor(diffMs / 1000); const min = Math.floor(sec / 60); const hr = Math.floor(min / 60); const day = Math.floor(hr / 24);
    if (sec < 60) return 'just now'; if (min < 60) return `${min}m ago`; if (hr < 24) return `${hr}h ago`; if (day < 7) return `${day}d ago`; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const getCategoryInfo = (cat: string | null) => CATEGORIES.find(c => c.value === cat);
  const providerBadge = PROVIDER_BADGES[aiProvider] || PROVIDER_BADGES.custom;

  // ─── Tool status icon ──────────────────────────────
  const getToolStatusIcon = (status?: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      case 'executing': return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
      case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'failed': return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      default: return null;
    }
  };

  // ─── Access gate ----
  if (!canAccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full shadow-sm">
          <CardContent className="py-12 text-center">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Access Restricted</h3>
            <p className="text-muted-foreground text-sm mt-1">You need AI User, Manager, or Super Admin role to access the AI Assistant.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] bg-background">
      {/* ============ Conversation Sidebar ============ */}
      <div className={cn('border-r bg-card transition-all duration-300 flex flex-col shrink-0', sidebarOpen ? 'w-80' : 'w-0 overflow-hidden')}>
        <div className="p-3 border-b flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-red-600" /> Conversations
          </h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-2 shrink-0 space-y-2">
          <Button className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-sm" onClick={handleNewChat} disabled={isReadOnly}>
            <Plus className="w-4 h-4 mr-2" /> New Chat
          </Button>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search conversations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-8 pl-8 text-xs" />
          </div>
          <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
            {([{ key: 'all', label: 'All' }, { key: 'bookmarked', label: 'Starred' }, { key: 'pinned', label: 'Pinned' }] as { key: FilterTab; label: string }[]).map((tab) => (
              <button key={tab.key} onClick={() => setFilterTab(tab.key)} className={cn('flex-1 text-xs font-medium px-2 py-1 rounded transition-colors', filterTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConvs ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">{searchQuery || filterTab !== 'all' ? 'No conversations match your filter.' : 'No conversations yet. Start a new chat!'}</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredConversations.map((conv) => {
                  const catInfo = getCategoryInfo(conv.category);
                  const CatIcon = catInfo?.icon;
                  return (
                    <motion.div key={conv.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }} className={cn('group relative rounded-lg border transition-colors flex items-stretch', activeConversationId === conv.id ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-transparent border-transparent hover:bg-accent/50')}>
                      <button onClick={() => loadConversation(conv.id)} className="flex-1 min-w-0 overflow-hidden text-left px-3 py-2.5 text-sm">
                        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                          {conv.pinned ? <Pin className="w-3.5 h-3.5 shrink-0 text-red-600 fill-red-600" /> : <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                          <span className={cn('truncate flex-1 min-w-0', activeConversationId === conv.id ? 'text-red-700 dark:text-red-300 font-medium' : 'text-foreground')}>{conv.title || 'New Conversation'}</span>
                          {catInfo && <Badge className={cn('text-[9px] shrink-0', catInfo.color)}>{catInfo.label}</Badge>}
                        </div>
                        <p className="text-[10px] mt-1 ml-5.5 text-muted-foreground truncate">{formatRelativeTime(conv.updatedAt)} · {conv._count?.messages || 0} msgs</p>
                      </button>
                      <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
                        {!isReadOnly && (
                          <button onClick={(e) => { e.stopPropagation(); handleToggleBookmark(conv.id, conv.bookmarked); }} className={cn('p-1.5 rounded-md transition-colors', conv.bookmarked ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-background/80')} title={conv.bookmarked ? 'Remove bookmark' : 'Bookmark'} aria-label={conv.bookmarked ? 'Remove bookmark' : 'Bookmark'}>
                            {conv.bookmarked ? <BookmarkCheck className="w-4 h-4 text-amber-500" /> : <Bookmark className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-md hover:bg-background/80 transition-colors border border-transparent hover:border-border" title="More options"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 z-50">
                            <DropdownMenuItem onClick={() => handleOpenRename(conv.id, conv.title || '')} disabled={isReadOnly}><Pencil className="w-3.5 h-3.5 mr-2" /> Rename</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenCategorize(conv.id, conv.category)} disabled={isReadOnly}><Tag className="w-3.5 h-3.5 mr-2" /> Set Category</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleTogglePin(conv.id, conv.pinned)} disabled={isReadOnly}><Pin className="w-3.5 h-3.5 mr-2" />{conv.pinned ? 'Unpin' : 'Pin to top'}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-700" onClick={() => setDeleteConvId(conv.id)} disabled={isReadOnly}><Trash2 className="w-3.5 h-3.5 mr-2" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ============ Chat Main Area ============ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="border-b px-4 py-2.5 flex items-center gap-3 shrink-0 bg-card/50">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                MAA BTOOL AI Assistant
                {aiConfigured === false && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <AlertCircle className="w-3 h-3" /> Demo Mode
                  </span>
                )}
                {aiConfigured === true && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <Zap className="w-3 h-3" /> Live AI
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge className={cn('text-[10px] gap-1', providerBadge.color)}>
                  <Sparkles className="w-2.5 h-2.5" /> {providerBadge.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground">Read/Write · {availableTools.length} tools available</span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Tools Panel Toggle */}
            <Button variant="outline" size="sm" className={cn("h-7 gap-1.5 text-xs", toolsPanelOpen && "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800")} onClick={() => setToolsPanelOpen(!toolsPanelOpen)}>
              <Wrench className="w-3.5 h-3.5" /> Tools
            </Button>

            {messages.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExportConversation('markdown')}><FileText className="w-3.5 h-3.5 mr-2" /> Export as Markdown</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportConversation('text')}><FileText className="w-3.5 h-3.5 mr-2" /> Export as Text</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Messages Area */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6 max-w-3xl mx-auto">
              {/* Empty / Welcome state */}
              {messages.length === 0 && !loadingMessages && (
                <div className="space-y-6 pt-4">
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Sparkles className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl rounded-tl-sm px-4 py-3">
                        <div className="md-render text-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{WELCOME_MESSAGE}</ReactMarkdown>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 ml-1">Just now</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SUGGESTED_PROMPTS.map((s) => {
                      const Icon = s.icon;
                      const catInfo = getCategoryInfo(s.category);
                      return (
                        <button key={s.title} onClick={() => handleSendMessage(s.prompt)} disabled={isStreaming || isReadOnly} className="group text-left p-3 rounded-xl border bg-card hover:bg-accent/50 hover:border-red-300 dark:hover:border-red-700 transition-all disabled:opacity-50">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                              <Icon className="w-4 h-4 text-red-600 dark:text-red-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{s.title}</p>
                                {catInfo && <Badge className={cn('text-[9px]', catInfo.color)}>{catInfo.label}</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.prompt}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {loadingMessages && (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-3/4 rounded-2xl" />
                  <Skeleton className="h-24 w-5/6 rounded-2xl" />
                </div>
              )}

              {/* Message list */}
              {messages.map((msg, idx) => {
                const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1 && !isStreaming;
                const isStreamingThis = msg.role === 'assistant' && msg.id === streamingMessageId && isStreaming;
                const isEditing = editingMsgId === msg.id;

                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-3 group', msg.role === 'user' && 'flex-row-reverse')}>
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm', msg.role === 'assistant' ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-slate-600 to-slate-700')}>
                      {msg.role === 'assistant' ? <Sparkles className="w-4.5 h-4.5 text-white" /> : <UserIcon className="w-4.5 h-4.5 text-white" />}
                    </div>
                    <div className={cn('flex-1 min-w-0 max-w-[80%]', msg.role === 'user' && 'flex flex-col items-end')}>
                      {isEditing ? (
                        <div className="w-full rounded-2xl bg-card border-2 border-red-300 dark:border-red-700 p-3 shadow-sm">
                          <Textarea value={editingContent} onChange={(e) => setEditingContent(e.target.value)} className="min-h-[60px] resize-none text-sm border-0 focus-visible:ring-0 p-0" autoFocus />
                          <div className="flex items-center gap-2 mt-2 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingMsgId(null); setEditingContent(''); }}>Cancel</Button>
                            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirmEditMessage}>Save Edit</Button>
                          </div>
                        </div>
                      ) : (
                        <div className={cn('rounded-2xl px-4 py-3 shadow-sm', msg.role === 'assistant' ? 'bg-red-50 dark:bg-red-900/20 rounded-tl-sm border border-red-100 dark:border-red-800/40' : 'bg-slate-700 text-white rounded-tr-sm')}>
                          {msg.role === 'assistant' ? (
                            <div className="md-render text-sm">
                              {msg.reasoning && (
                                <details className="mb-3 group/details">
                                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 select-none">
                                    <GitBranch className="w-3 h-3" />
                                    <span className="group-open/details:hidden">Show thinking process...</span>
                                    <span className="hidden group-open/details:inline">Hide thinking process</span>
                                  </summary>
                                  <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border/50 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">{msg.reasoning}</div>
                                </details>
                              )}

                              {/* Tool execution status badges */}
                              {msg.toolResults && msg.toolResults.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                  {msg.toolResults.map((tr, ti) => (
                                    <Badge key={ti} className={cn('text-[10px] gap-1', tr.result?.success ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : tr.result?.error ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400')}>
                                      {tr.result?.success ? <CheckCircle2 className="w-2.5 h-2.5" /> : tr.result?.error ? <XCircle className="w-2.5 h-2.5" /> : <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                      {tr.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* Pending confirmations */}
                              {msg.pendingConfirmations && msg.pendingConfirmations.length > 0 && (
                                <div className="space-y-2 mb-3">
                                  {msg.pendingConfirmations.map((pc, pi) => (
                                    <div key={pi} className="p-3 rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                                      <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                                        <Shield className="w-3.5 h-3.5" />
                                        Confirmation Required: {pc.preview.action}
                                      </div>
                                      <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                                        <p><strong>Target:</strong> {pc.preview.target}</p>
                                        {pc.preview.details && Object.entries(pc.preview.details).map(([k, v]) => (
                                          <p key={k}><strong>{k}:</strong> {String(v)}</p>
                                        ))}
                                      </div>
                                      <div className="flex gap-2 mt-3">
                                        <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => { setPendingConfirmation(pc); }} disabled={confirmingTool}>
                                          <CheckCircle2 className="w-3 h-3 mr-1" /> Confirm
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleConfirmTool(false)} disabled={confirmingTool}>
                                          <XCircle className="w-3 h-3 mr-1" /> Reject
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeHighlight]}
                                components={{
                                  pre: ({ children, ...props }) => {
                                    const codeEl = (children as React.ReactElement<{ children?: React.ReactNode }>)?.props?.children;
                                    const codeText = typeof codeEl === 'string' ? codeEl : (codeEl as React.ReactElement<{ children?: React.ReactNode }>)?.props?.children;
                                    const codeId = `code-${msg.id}-${idx}`;
                                    return (
                                      <div className="relative group/code my-3">
                                        <button onClick={() => handleCopyCode(String(codeText || ''), codeId)} className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border opacity-0 group-hover/code:opacity-100 transition-opacity" title="Copy code">
                                          {copiedCode === codeId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                        <pre {...props}>{children}</pre>
                                      </div>
                                    );
                                  },
                                }}
                              >
                                {msg.content || (isStreamingThis ? '' : '')}
                              </ReactMarkdown>
                              {isStreamingThis && (
                                <span className="inline-flex gap-0.5 ml-1">
                                  <span className="w-1.5 h-4 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1.5 h-4 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                                  <span className="w-1.5 h-4 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          )}
                          {msg.isEdited && <p className="text-[9px] text-muted-foreground mt-1 italic">(edited)</p>}
                        </div>
                      )}

                      {!isEditing && (
                        <div className={cn('flex items-center gap-2 mt-1 mx-1 flex-wrap', msg.role === 'user' && 'flex-row-reverse')}>
                          <p className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</p>
                          {msg.tokensUsed ? <span className="text-[10px] text-muted-foreground/70">{msg.tokensUsed} tokens</span> : null}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                            <button onClick={() => handleCopyMessage(msg)} className="p-1 rounded hover:bg-accent" title="Copy message">
                              {copiedMessageId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                            </button>
                            {msg.role === 'user' && !isStreaming && canEditOwnMessages && (
                              <button onClick={() => handleEditMessage(msg.id, msg.content)} className="p-1 rounded hover:bg-accent" title="Edit message"><Pencil className="w-3 h-3 text-muted-foreground" /></button>
                            )}
                            {!isStreaming && canEditOwnMessages && (
                              <button onClick={() => setDeleteMsgId(msg.id)} className="p-1 rounded hover:bg-accent" title="Delete message"><Trash2 className="w-3 h-3 text-muted-foreground" /></button>
                            )}
                            {msg.role === 'assistant' && !isStreamingThis && msg.content && (
                              <>
                                <Separator orientation="vertical" className="h-3 mx-0.5" />
                                <button onClick={() => handleFeedback(msg.id, 'positive')} className={cn('p-1 rounded hover:bg-accent transition-colors', msg.feedback === 'positive' && 'text-emerald-600')} title="Good response">
                                  <ThumbsUp className={cn('w-3 h-3', msg.feedback === 'positive' ? 'text-emerald-600 fill-emerald-600' : 'text-muted-foreground')} />
                                </button>
                                <button onClick={() => handleFeedback(msg.id, 'negative')} className={cn('p-1 rounded hover:bg-accent transition-colors', msg.feedback === 'negative' && 'text-red-600')} title="Poor response">
                                  <ThumbsDown className={cn('w-3 h-3', msg.feedback === 'negative' ? 'text-red-600 fill-red-600' : 'text-muted-foreground')} />
                                </button>
                              </>
                            )}
                            {isLastAssistant && (
                              <button onClick={handleRegenerate} className="p-1 rounded hover:bg-accent" title="Regenerate response"><RefreshCw className="w-3 h-3 text-muted-foreground" /></button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {isLoading && messages.length === 0 && (
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm"><Sparkles className="w-4.5 h-4.5 text-white" /></div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl rounded-tl-sm px-4 py-3 border border-red-100 dark:border-red-800/40 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-muted-foreground ml-1">AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* ============ Tools Panel ============ */}
          {toolsPanelOpen && (
            <div className="w-72 border-l bg-card shrink-0 flex flex-col">
              <div className="p-3 border-b flex items-center justify-between shrink-0">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-red-600" /> Available Tools
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setToolsPanelOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Tool execution status */}
              {Object.keys(toolExecutions).length > 0 && (
                <div className="p-3 border-b shrink-0">
                  <p className="text-[10px] font-medium text-muted-foreground mb-2">RECENT EXECUTIONS</p>
                  <div className="space-y-1.5">
                    {Object.entries(toolExecutions).map(([name, exec]) => (
                      <div key={name} className="flex items-center gap-2 text-xs">
                        {getToolStatusIcon(exec.status)}
                        <span className="flex-1 truncate">{name}</span>
                        <Badge className={cn('text-[9px]', exec.status === 'success' ? 'bg-emerald-100 text-emerald-700' : exec.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                          {exec.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1">
                <div className="p-3 space-y-4">
                  {(['read', 'write', 'workflow', 'ai', 'asset'] as const).map(category => {
                    const categoryTools = availableTools.filter(t => t.category === category);
                    if (categoryTools.length === 0) return null;
                    const CategoryIcon = TOOL_CATEGORY_ICONS[category] || Database;
                    const categoryColor = TOOL_CATEGORY_COLORS[category] || '';
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          <CategoryIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{category}</span>
                          <Badge className={cn('text-[9px]', categoryColor)}>{categoryTools.length}</Badge>
                        </div>
                        <div className="space-y-1.5">
                          {categoryTools.map(tool => (
                            <div key={tool.name} className="p-2 rounded-lg border bg-background hover:bg-accent/50 transition-colors">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium">{tool.name}</span>
                                {tool.requiresConfirmation && (
                                  <Badge className="text-[8px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">⚠️ Confirm</Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                              {tool.isWrite && (
                                <Badge className="text-[8px] mt-1 bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                                  Write · {tool.requiredPermission}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Unavailable tools */}
                  {availableTools.length < 20 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Locked</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Some tools are hidden based on your role permissions. Contact your admin for access.
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t shrink-0 bg-card/50">
          {!inputMessage.trim() && !isStreaming && messages.length > 0 && !isReadOnly && (
            <div className="px-3 pt-2 pb-1 max-w-3xl mx-auto">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '🔍 Search', prompt: 'Search for Nike products in Article Master.' },
                  { label: '✏️ Create', prompt: 'Create a new article record with name: Test Product, brand: Nike, category: Footwear.' },
                  { label: '✅ Workflow', prompt: 'List all records in IN_REVIEW status.' },
                  { label: '🤖 Enrich', prompt: 'Run AI enrichment on a record and suggest missing fields.' },
                  { label: '🌐 Translate', prompt: 'Find a record and translate its description to English.' },
                  { label: '✨ Auto-Fill', prompt: 'Find a record and auto-fill all AI fields.' },
                ].map((s) => (
                  <button key={s.label} onClick={() => handleSendMessage(s.prompt)} className="text-xs px-2.5 py-1.5 rounded-full border border-border bg-background hover:bg-accent hover:border-red-300 dark:hover:border-red-700 transition-colors text-muted-foreground hover:text-foreground">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="p-3 pt-2">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-2 rounded-xl border bg-background focus-within:ring-2 focus-within:ring-red-500/30 focus-within:border-red-400 transition-all">
                <Textarea
                  ref={textareaRef}
                  placeholder={isReadOnly ? "Read-only access — you cannot send messages" : "Ask me anything about MDM... (Enter to send, Shift+Enter for new line)"}
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming || isReadOnly}
                  rows={1}
                  className="flex-1 min-h-[44px] max-h-[160px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-3 text-sm"
                />
                {isStreaming ? (
                  <Button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white h-11 w-11 shrink-0 my-1 mr-1 rounded-lg" size="icon" title="Stop"><Square className="w-4 h-4" /></Button>
                ) : (
                  <Button onClick={() => handleSendMessage()} disabled={!inputMessage.trim() || isStreaming || isReadOnly} className="bg-red-600 hover:bg-red-700 text-white h-11 w-11 shrink-0 my-1 mr-1 rounded-lg" size="icon" title="Send"><Send className="w-4 h-4" /></Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                {isReadOnly ? (
                  <span className="inline-flex items-center gap-1 text-slate-500"><ShieldCheck className="w-3 h-3" /> Read-only access — message sending is disabled</span>
                ) : (
                  <>AI can read & write MDM data. Destructive actions require confirmation. Press <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Enter</kbd> to send.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============ Confirmation Dialog for Destructive Operations ============ */}
      <AlertDialog open={pendingConfirmation !== null} onOpenChange={(open) => { if (!open && !confirmingTool) setPendingConfirmation(null); }}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Confirm Action
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2">
                <div className="p-3 rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    {pendingConfirmation?.preview?.action || 'Destructive Operation'}
                  </div>
                  <div className="text-sm text-amber-600 dark:text-amber-400 space-y-1">
                    <p><strong>Target:</strong> {pendingConfirmation?.preview?.target || 'Unknown'}</p>
                    {pendingConfirmation?.preview?.details && Object.entries(pendingConfirmation.preview.details).map(([k, v]) => (
                      <p key={k}><strong>{k}:</strong> {String(v)}</p>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. Are you sure you want to proceed?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmingTool} onClick={() => handleConfirmTool(false)}>Reject</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" disabled={confirmingTool} onClick={() => handleConfirmTool(true)}>
              {confirmingTool ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Executing...</> : <>Confirm & Execute</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ Rename Dialog ============ */}
      <Dialog open={renameConvId !== null} onOpenChange={(open) => !open && setRenameConvId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4 text-red-600" /> Rename Conversation</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Enter new title..." onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(); }} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameConvId(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirmRename} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Categorize Dialog ============ */}
      <Dialog open={categorizeConvId !== null} onOpenChange={(open) => !open && setCategorizeConvId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4 text-red-600" /> Set Category</DialogTitle></DialogHeader>
          <Select value={categorizeValue} onValueChange={setCategorizeValue}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(cat => (<SelectItem key={cat.value} value={cat.value}><div className="flex items-center gap-2"><cat.icon className="w-3.5 h-3.5" />{cat.label}</div></SelectItem>))}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategorizeConvId(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirmCategorize}>Set Category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Delete Conversation Confirmation ============ */}
      <AlertDialog open={deleteConvId !== null} onOpenChange={(open) => !open && setDeleteConvId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" /> Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the conversation and all its messages. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirmDeleteConv}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ Delete Message Confirmation ============ */}
      <AlertDialog open={deleteMsgId !== null} onOpenChange={(open) => !open && setDeleteMsgId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" /> Delete Message?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this message from the conversation. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirmDeleteMessage}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
