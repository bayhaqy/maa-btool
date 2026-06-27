'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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
  Sparkles, Send, Plus, MessageSquare, PanelLeftClose, PanelLeft, Bot, User as UserIcon,
  Search, Star, Pin, MoreHorizontal, Trash2, Pencil, Copy, Check, RefreshCw, Square,
  FilePlus, GitBranch, Upload, Key, Bookmark, BookmarkCheck, AlertCircle, Zap, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface Conversation {
  id: string;
  title: string | null;
  bookmarked: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: { content: string; role: string; createdAt: string }[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  tokensUsed?: number;
}

type FilterTab = 'all' | 'bookmarked' | 'pinned';

const WELCOME_MESSAGE = "Hi! I'm your **MAA BTOOL AI Assistant**. I can help you with master data management, workflows, best practices, and more. How can I help you today?";

const SUGGESTED_PROMPTS = [
  { icon: FilePlus, title: 'Create a Record', prompt: 'How do I create a new record in the Article Master module?' },
  { icon: GitBranch, title: 'Approval Workflow', prompt: 'Explain the approval workflow and record status lifecycle.' },
  { icon: Upload, title: 'Bulk Import', prompt: 'What are the best practices for bulk importing data?' },
  { icon: Key, title: 'Manage API Keys', prompt: 'How do I create and manage API keys for integration?' },
];

export default function AiAssistantPage() {
  const { token, user } = useAppStore();
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
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const canAccess = user?.roles?.some(r => ['Super Admin', 'AI User', 'Manager'].includes(r)) ?? false;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ---- Load conversations ----
  const loadConversations = useCallback(async () => {
    if (!token || !user?.userId) return;
    setLoadingConvs(true);
    try {
      const res = await fetch(`/api/ai/chat?userId=${user.userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setConversations(data.conversations || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingConvs(false);
    }
  }, [token, user?.userId]);

  useEffect(() => {
    if (canAccess) loadConversations();
  }, [loadConversations, canAccess]);

  // ---- Load full conversation (with all messages) ----
  const loadConversation = useCallback(async (convId: string) => {
    if (!token) return;
    setActiveConversationId(convId);
    setLoadingMessages(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/ai/chat?conversationId=${convId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.conversation) {
        const msgs: ChatMessage[] = (data.conversation.messages || []).map((m: { id: string; role: string; content: string; createdAt: string; tokensUsed?: number }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          createdAt: m.createdAt,
          tokensUsed: m.tokensUsed,
        }));
        setMessages(msgs);
      } else {
        toast.error('Failed to load conversation');
      }
    } catch {
      toast.error('Failed to load conversation');
    } finally {
      setLoadingMessages(false);
    }
  }, [token]);

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    setActiveConversationId(null);
    setMessages([]);
    setIsStreaming(false);
    setIsLoading(false);
    setAiConfigured(null);
    textareaRef.current?.focus();
  };

  // ---- Filtered conversations (search + tab) ----
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
    if (!token || !content || isStreaming) return;

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
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: content,
          conversationId: activeConversationId || undefined,
        }),
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
      let finalConversationId = activeConversationId;
      let finalMessageId = assistantId;
      let finalTokens = 0;
      let finalAiConfigured: boolean | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events (separated by \n\n)
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
                  m.id === assistantId ? { ...m, content: fullContent } : m
                )
              );
            } else if (evt.type === 'done') {
              finalConversationId = evt.conversationId || finalConversationId;
              finalMessageId = evt.messageId || finalMessageId;
              finalTokens = evt.tokensUsed || 0;
              finalAiConfigured = evt.aiConfigured ?? null;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, id: finalMessageId, tokensUsed: finalTokens }
                    : m
                )
              );
              if (!activeConversationId && finalConversationId) {
                setActiveConversationId(finalConversationId);
              }
              if (finalAiConfigured !== null) setAiConfigured(finalAiConfigured);
            } else if (evt.type === 'error') {
              toast.error(evt.message || 'AI request failed');
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            }
          } catch {
            // ignore malformed events
          }
        }
      }
      loadConversations();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User stopped — keep partial content, mark as complete
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || '_(stopped)_' }
              : m
          )
        );
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
  }, [token, inputMessage, isStreaming, activeConversationId, loadConversations]);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  // ---- Regenerate last assistant response ----
  const handleRegenerate = useCallback(() => {
    if (isStreaming) return;
    // Find last user message
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    const lastUserMsg = messages[messages.length - 1 - lastUserIdx];
    // Remove everything after (and including) the last assistant response
    setMessages((prev) => prev.slice(0, messages.length - 1 - lastUserIdx));
    // Re-send the user message
    setTimeout(() => handleSendMessage(lastUserMsg.content), 50);
  }, [messages, isStreaming, handleSendMessage]);

  // ---- Conversation actions ----
  const handleToggleBookmark = async (convId: string, current: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId: convId, action: current ? 'unbookmark' : 'bookmark' }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, bookmarked: !current, bookmarkedAt: current ? null : new Date().toISOString() }
              : c
          )
        );
        toast.success(current ? 'Removed bookmark' : 'Bookmarked');
      } else {
        toast.error('Failed to update');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleTogglePin = async (convId: string, current: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId: convId, action: current ? 'unpin' : 'pin' }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, pinned: !current } : c))
        );
        // Re-sort
        setConversations((prev) =>
          [...prev].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (a.bookmarked !== b.bookmarked) return a.bookmarked ? -1 : 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          })
        );
        toast.success(current ? 'Unpinned' : 'Pinned');
      } else {
        toast.error('Failed to update');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleOpenRename = (convId: string, currentTitle: string) => {
    setRenameConvId(convId);
    setRenameValue(currentTitle || '');
  };

  const handleConfirmRename = async () => {
    if (!token || !renameConvId || !renameValue.trim()) return;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId: renameConvId, action: 'rename', title: renameValue.trim() }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === renameConvId ? { ...c, title: renameValue.trim() } : c))
        );
        toast.success('Conversation renamed');
      } else {
        toast.error('Failed to rename');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setRenameConvId(null);
      setRenameValue('');
    }
  };

  const handleConfirmDelete = async () => {
    if (!token || !deleteConvId) return;
    try {
      const res = await fetch(`/api/ai/chat?conversationId=${deleteConvId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== deleteConvId));
        if (activeConversationId === deleteConvId) {
          setActiveConversationId(null);
          setMessages([]);
        }
        toast.success('Conversation deleted');
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setDeleteConvId(null);
    }
  };

  // ---- Copy helpers ----
  const handleCopyMessage = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedMessageId(msg.id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    toast.success('Code copied');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ---- Auto-resize textarea ----
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ---- Helpers ----
  const formatRelativeTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) return 'just now';
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day < 7) return `${day}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ---- Access gate ----
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
      <div className={cn(
        'border-r bg-card transition-all duration-300 flex flex-col shrink-0',
        sidebarOpen ? 'w-80' : 'w-0 overflow-hidden'
      )}>
        <div className="p-3 border-b flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-red-600" />
            Conversations
          </h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-2 shrink-0 space-y-2">
          <Button className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-sm" onClick={handleNewChat}>
            <Plus className="w-4 h-4 mr-2" /> New Chat
          </Button>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
            {([
              { key: 'all', label: 'All' },
              { key: 'bookmarked', label: 'Starred' },
              { key: 'pinned', label: 'Pinned' },
            ] as { key: FilterTab; label: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={cn(
                  'flex-1 text-xs font-medium px-2 py-1 rounded transition-colors',
                  filterTab === tab.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
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
                <p className="text-xs text-muted-foreground">
                  {searchQuery || filterTab !== 'all'
                    ? 'No conversations match your filter.'
                    : 'No conversations yet. Start a new chat!'}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredConversations.map((conv) => (
                  <motion.div
                    key={conv.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className={cn(
                      'group relative rounded-lg border transition-colors flex items-stretch',
                      activeConversationId === conv.id
                        ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                        : 'bg-transparent border-transparent hover:bg-accent/50'
                    )}
                  >
                    {/* Conversation button (title + meta) — takes available space, title truncates */}
                    <button
                      onClick={() => loadConversation(conv.id)}
                      className="flex-1 min-w-0 overflow-hidden text-left px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                        {conv.pinned ? (
                          <Pin className="w-3.5 h-3.5 shrink-0 text-red-600 fill-red-600" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className={cn(
                          'truncate flex-1 min-w-0',
                          activeConversationId === conv.id
                            ? 'text-red-700 dark:text-red-300 font-medium'
                            : 'text-foreground'
                        )}>
                          {conv.title || 'New Conversation'}
                        </span>
                      </div>
                      <p className="text-[10px] mt-1 ml-5.5 text-muted-foreground truncate">
                        {formatRelativeTime(conv.updatedAt)} · {conv._count?.messages || 0} msgs
                      </p>
                    </button>

                    {/* Quick actions — inline (not absolute), always fully visible, clearly clickable */}
                    <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleBookmark(conv.id, conv.bookmarked); }}
                        className={cn(
                          'p-1.5 rounded-md transition-colors',
                          conv.bookmarked
                            ? 'bg-amber-100 dark:bg-amber-900/40'
                            : 'hover:bg-background/80'
                        )}
                        title={conv.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                        aria-label={conv.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                      >
                        {conv.bookmarked ? (
                          <BookmarkCheck className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Bookmark className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 rounded-md hover:bg-background/80 transition-colors border border-transparent hover:border-border"
                            title="More options"
                            aria-label="More options"
                          >
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 z-50">
                          <DropdownMenuItem onClick={() => handleOpenRename(conv.id, conv.title || '')}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleBookmark(conv.id, conv.bookmarked)}>
                            {conv.bookmarked ? (
                              <>
                                <BookmarkCheck className="w-3.5 h-3.5 mr-2" /> Remove bookmark
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3.5 h-3.5 mr-2" /> Bookmark
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTogglePin(conv.id, conv.pinned)}>
                            <Pin className="w-3.5 h-3.5 mr-2" />
                            {conv.pinned ? 'Unpin' : 'Pin to top'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-700"
                            onClick={() => setDeleteConvId(conv.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                ))}
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
              <p className="text-[10px] text-muted-foreground">Powered by Z.AI · Markdown & streaming supported</p>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6 max-w-3xl mx-auto">
            {/* Empty / Welcome state with suggested prompts */}
            {messages.length === 0 && !loadingMessages && (
              <div className="space-y-6 pt-4">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Sparkles className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="md-render text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {WELCOME_MESSAGE}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 ml-1">Just now</p>
                  </div>
                </div>

                {/* Suggested prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SUGGESTED_PROMPTS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.title}
                        onClick={() => handleSendMessage(s.prompt)}
                        disabled={isStreaming}
                        className="group text-left p-3 rounded-xl border bg-card hover:bg-accent/50 hover:border-red-300 dark:hover:border-red-700 transition-all disabled:opacity-50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <Icon className="w-4 h-4 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{s.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.prompt}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Loading messages state */}
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
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex gap-3 group', msg.role === 'user' && 'flex-row-reverse')}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm',
                    msg.role === 'assistant'
                      ? 'bg-gradient-to-br from-red-500 to-rose-600'
                      : 'bg-muted'
                  )}>
                    {msg.role === 'assistant' ? (
                      <Sparkles className="w-4.5 h-4.5 text-white" />
                    ) : (
                      <UserIcon className="w-4.5 h-4.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className={cn('flex-1 min-w-0 max-w-[80%]', msg.role === 'user' && 'flex flex-col items-end')}>
                    <div className={cn(
                      'rounded-2xl px-4 py-3',
                      msg.role === 'assistant'
                        ? 'bg-red-50 dark:bg-red-900/20 rounded-tl-sm'
                        : 'bg-teal-600 text-white rounded-tr-sm'
                    )}>
                      {msg.role === 'assistant' ? (
                        <div className="md-render text-sm">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              pre: ({ children, ...props }) => {
                                const codeEl = (children as React.ReactElement<{ children?: React.ReactNode }>)?.props?.children;
                                const codeText = typeof codeEl === 'string'
                                  ? codeEl
                                  : (codeEl as React.ReactElement<{ children?: React.ReactNode }>)?.props?.children;
                                const codeId = `code-${msg.id}-${idx}`;
                                return (
                                  <div className="relative group/code my-3">
                                    <button
                                      onClick={() => handleCopyCode(String(codeText || ''), codeId)}
                                      className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border opacity-0 group-hover/code:opacity-100 transition-opacity"
                                      title="Copy code"
                                    >
                                      {copiedCode === codeId ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
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
                            <span className="inline-block w-2 h-4 bg-red-500 animate-pulse ml-0.5 align-text-bottom" />
                          )}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    <div className={cn('flex items-center gap-2 mt-1 mx-1', msg.role === 'user' && 'flex-row-reverse')}>
                      <p className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</p>
                      {msg.tokensUsed ? (
                        <span className="text-[10px] text-muted-foreground/70">{msg.tokensUsed} tokens</span>
                      ) : null}
                      {/* Message actions */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        <button
                          onClick={() => handleCopyMessage(msg)}
                          className="p-1 rounded hover:bg-accent"
                          title="Copy message"
                        >
                          {copiedMessageId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          )}
                        </button>
                        {isLastAssistant && (
                          <button
                            onClick={handleRegenerate}
                            className="p-1 rounded hover:bg-accent"
                            title="Regenerate response"
                          >
                            <RefreshCw className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Initial loading (before stream starts) */}
            {isLoading && messages.length === 0 && (
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0">
                  <Bot className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Bar */}
        <div className="border-t p-3 shrink-0 bg-card/50">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 rounded-xl border bg-background focus-within:ring-2 focus-within:ring-red-500/30 focus-within:border-red-400 transition-all">
              <Textarea
                ref={textareaRef}
                placeholder="Ask me anything about MDM... (Enter to send, Shift+Enter for new line)"
                value={inputMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                rows={1}
                className="flex-1 min-h-[44px] max-h-[160px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-3 text-sm"
              />
              {isStreaming ? (
                <Button
                  onClick={handleStop}
                  className="bg-red-600 hover:bg-red-700 text-white h-11 w-11 shrink-0 my-1 mr-1 rounded-lg"
                  size="icon"
                  title="Stop"
                >
                  <Square className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isStreaming}
                  className="bg-red-600 hover:bg-red-700 text-white h-11 w-11 shrink-0 my-1 mr-1 rounded-lg"
                  size="icon"
                  title="Send"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              AI responses may be inaccurate. Press <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Shift+Enter</kbd> for new line.
            </p>
          </div>
        </div>
      </div>

      {/* ============ Rename Dialog ============ */}
      <Dialog open={renameConvId !== null} onOpenChange={(open) => !open && setRenameConvId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-red-600" /> Rename Conversation
            </DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Enter new title..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameConvId(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirmRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Delete Confirmation ============ */}
      <AlertDialog open={deleteConvId !== null} onOpenChange={(open) => !open && setDeleteConvId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" /> Delete Conversation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the conversation and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
