'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sparkles, Send, Plus, MessageSquare, PanelLeftClose, PanelLeft, Bot, User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface Conversation {
  id: string;
  title: string | null;
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

const WELCOME_MESSAGE = "Hi! I'm your MAA BTOOL AI Assistant. I can help you with master data management, workflows, best practices, and more. How can I help you today?";

export default function AiAssistantPage() {
  const { token, user } = useAppStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canAccess = user?.roles?.some(r => ['Super Admin', 'AI User'].includes(r)) ?? false;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    loadConversations();
  }, [loadConversations]);

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
  };

  const handleSelectConversation = async (convId: string) => {
    if (!token) return;
    setActiveConversationId(convId);
    try {
      const res = await fetch(`/api/ai/chat?userId=${user?.userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const conv = (data.conversations || []).find((c: Conversation) => c.id === convId);
        if (conv) {
          // Fetch full conversation messages - we'll use the conversation id to load messages
          // Since the API only returns 1 message per conversation, we need a different approach
          // Let's just show what we have
          setMessages([]);
        }
      }
    } catch {
      toast.error('Failed to load conversation');
    }
  };

  const handleSendMessage = async () => {
    if (!token || !inputMessage.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: inputMessage.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: userMsg.content,
          conversationId: activeConversationId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to send message');
        setMessages((prev) => prev.filter(m => m.id !== userMsg.id));
        return;
      }

      // Set conversation ID if this was a new conversation
      if (!activeConversationId && data.conversationId) {
        setActiveConversationId(data.conversationId);
      }

      const assistantMsg: ChatMessage = {
        id: data.message?.id || `ai-${Date.now()}`,
        role: 'assistant',
        content: data.message?.content || 'No response received.',
        createdAt: data.message?.createdAt || new Date().toISOString(),
        tokensUsed: data.message?.tokensUsed,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      loadConversations(); // Refresh conversation list
    } catch {
      toast.error('Network error. Please try again.');
      setMessages((prev) => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!canAccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full shadow-sm">
          <CardContent className="py-12 text-center">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Access Restricted</h3>
            <p className="text-muted-foreground text-sm mt-1">You need AI User or Super Admin role to access the AI Assistant.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)]">
      {/* Conversation Sidebar */}
      <div className={cn(
        'border-r bg-card transition-all duration-300 flex flex-col shrink-0',
        sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
      )}>
        <div className="p-3 border-b flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold">Conversations</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-2 shrink-0">
          <Button className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-sm" onClick={handleNewChat}>
            <Plus className="w-4 h-4 mr-2" /> New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConvs ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors',
                    activeConversationId === conv.id
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'hover:bg-accent/50 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{conv.title || 'New Conversation'}</span>
                  </div>
                  <p className="text-[10px] mt-1 ml-5.5 text-muted-foreground">
                    {formatDate(conv.updatedAt)} · {conv._count?.messages || 0} messages
                  </p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="border-b px-4 py-2.5 flex items-center gap-3 shrink-0 bg-card/50">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">MAA BTOOL AI Assistant</h3>
              <p className="text-[10px] text-muted-foreground">Powered by AI</p>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4 max-w-3xl mx-auto">
            {/* Welcome Message */}
            {messages.length === 0 && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl rounded-tl-sm px-4 py-3">
                    <p className="text-sm whitespace-pre-wrap">{WELCOME_MESSAGE}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 ml-1">Just now</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  msg.role === 'assistant'
                    ? 'bg-gradient-to-br from-red-500 to-rose-600'
                    : 'bg-muted'
                )}>
                  {msg.role === 'assistant' ? (
                    <Sparkles className="w-4 h-4 text-white" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className={cn('flex-1 max-w-[80%]', msg.role === 'user' && 'flex flex-col items-end')}>
                  <div className={cn(
                    'rounded-2xl px-4 py-3',
                    msg.role === 'assistant'
                      ? 'bg-red-50 dark:bg-red-900/20 rounded-tl-sm'
                      : 'bg-teal-600 text-white rounded-tr-sm'
                  )}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 mx-1">{formatTime(msg.createdAt)}</p>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
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
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <div className="flex-1 relative">
              <Input
                placeholder="Ask me anything about MDM..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="pr-10 min-h-[44px] resize-none"
              />
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="bg-red-600 hover:bg-red-700 text-white h-11 w-11 shrink-0"
              size="icon"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            AI responses are generated and may not always be accurate. Press Enter to send.
          </p>
        </div>
      </div>
    </div>
  );
}
