import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, type AIProvider } from '@/lib/ai';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';
import {
  executeToolCall,
  parseToolCalls,
  stripToolCalls,
  generateToolResultSummary,
  SYSTEM_PROMPT,
  isDestructiveTool,
  type ToolCallResult,
} from '@/lib/ai-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Multi-provider AI call (non-streaming) ──────────────────────

interface AIChatResponse {
  content: string;
  tokensUsed: number;
}

async function callAIProvider(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<AIChatResponse> {
  switch (provider) {
    case 'zai': {
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAIClass = ZAIModule.default;
      interface ZAIConstructor {
        new (c: { baseUrl: string; apiKey: string }): {
          chat: {
            completions: {
              create: (opts: Record<string, unknown>) => Promise<{
                choices?: Array<{ message?: { content?: string } }>;
                usage?: { total_tokens?: number };
              }>;
            };
          };
        };
      }
      const zai = new (ZAIClass as unknown as ZAIConstructor)({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      const response = await zai.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: false,
      });
      return {
        content: response?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.',
        tokensUsed: response?.usage?.total_tokens || 0,
      };
    }

    case 'gemini': {
      const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;
      const geminiContents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const systemInstruction = messages.find(m => m.role === 'system');
      const body: Record<string, unknown> = {
        contents: geminiContents,
        generationConfig: { maxOutputTokens: config.maxTokens, temperature: config.temperature },
      };
      if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Gemini API error (${res.status})`);
      const data = await res.json();
      return {
        content: data?.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, but I was unable to generate a response.',
        tokensUsed: data?.usageMetadata?.totalTokenCount || 0,
      };
    }

    case 'openai': {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages, max_tokens: config.maxTokens, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`OpenAI API error (${res.status})`);
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }

    case 'custom': {
      const customHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` };
      if (config.customHeaders) Object.assign(customHeaders, config.customHeaders);
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({ model: config.model, messages, max_tokens: config.maxTokens, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`Custom API error (${res.status})`);
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }

    case 'azure-openai': {
      const url = `${config.baseUrl}/openai/deployments/${config.model}/chat/completions?api-version=2024-06-01`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey },
        body: JSON.stringify({ messages, max_tokens: config.maxTokens, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`Azure OpenAI API error (${res.status})`);
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

// GET /api/ai/chat?userId=xxx                    → list conversations for user
// GET /api/ai/chat?conversationId=xxx            → full conversation with all messages
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hasAiReadPerm = hasPermission(tokenPayload.roles, 'ai:read');
    if (!hasAiReadPerm) return NextResponse.json({ error: 'Insufficient permissions. Required: ai:read' }, { status: 403 });

    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const conversation = await db.aiConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      return NextResponse.json({ conversation });
    }

    const userId = searchParams.get('userId') || tokenPayload.userId;
    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const conversations = await db.aiConversation.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 }, _count: { select: { messages: true } } },
      orderBy: [{ pinned: 'desc' }, { bookmarked: 'desc' }, { updatedAt: 'desc' }],
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('AI Chat GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/ai/chat — Send message to AI assistant (non-streaming)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hasAiPerm = hasPermission(tokenPayload.roles, 'ai:read');
    if (!hasAiPerm) return NextResponse.json({ error: 'Insufficient permissions. Required: ai:read' }, { status: 403 });

    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { message, conversationId } = body;
    if (!message || typeof message !== 'string') return NextResponse.json({ error: 'message is required' }, { status: 400 });

    let conversation;
    let history: Array<{ role: string; content: string }> = [];

    if (conversationId) {
      conversation = await db.aiConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      if (conversation.userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      history = conversation.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    } else {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      conversation = await db.aiConversation.create({ data: { userId: tokenPayload.userId, title } });
    }

    await db.aiMessage.create({
      data: { conversationId: conversation.id, userId: tokenPayload.userId, role: 'user', content: message },
    });

    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: message },
    ];

    let aiResponse: string;
    let tokensUsed = 0;
    let aiConfigured = false;

    try {
      const config = await getTenantAIProviderConfig(tokenPayload.companyId);
      aiConfigured = !!config.apiKey;
      if (aiConfigured) {
        const result = await callAIProvider(config.provider, config, aiMessages);
        aiResponse = result.content;
        tokensUsed = result.tokensUsed;
      } else {
        aiResponse = generateFallbackResponse(message, false);
      }
    } catch (aiError) {
      console.error('AI provider error (falling back to demo mode):', aiError);
      aiResponse = generateFallbackResponse(message, aiConfigured);
    }

    // ── Tool call processing ─────────────────────────────────
    const toolCalls = parseToolCalls(aiResponse);

    let toolExecutionResults: Array<{ name: string; result: ToolCallResult }> = [];
    let confirmations: Array<{ toolName: string; args: Record<string, unknown>; preview: { action: string; target: string; details: Record<string, unknown> } }> = [];

    if (toolCalls.length > 0) {
      const cleanedResponse = stripToolCalls(aiResponse);
      const nonDestructive = toolCalls.filter(tc => !isDestructiveTool(tc.name));
      const destructive = toolCalls.filter(tc => isDestructiveTool(tc.name));

      // Execute non-destructive tools
      for (const tc of nonDestructive) {
        const result = await executeToolCall(tc.name, tc.args, tokenPayload.companyId, tokenPayload.userId, tokenPayload.roles);
        toolExecutionResults.push({ name: tc.name, result });
      }

      // Generate confirmation previews for destructive tools
      for (const tc of destructive) {
        const result = await executeToolCall(tc.name, tc.args, tokenPayload.companyId, tokenPayload.userId, tokenPayload.roles, false);
        if (result.preview) {
          confirmations.push({ toolName: tc.name, args: tc.args, preview: result.preview });
        } else {
          toolExecutionResults.push({ name: tc.name, result });
        }
      }

      // Generate AI summary for non-destructive tool results
      if (toolExecutionResults.length > 0) {
        const toolResultSummary = JSON.stringify(toolExecutionResults, null, 2);
        const summaryMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          ...aiMessages,
          { role: 'assistant', content: cleanedResponse || 'I will look that up for you.' },
          {
            role: 'user',
            content: `[TOOL RESULTS]\n${toolResultSummary}\n\nBased on these tool results, provide a clear and helpful summary to the user. Do not mention the tool call mechanism — just present the information naturally.`,
          },
        ];

        try {
          const config = await getTenantAIProviderConfig(tokenPayload.companyId);
          if (config.apiKey) {
            const summaryResult = await callAIProvider(config.provider, config, summaryMessages);
            aiResponse = cleanedResponse + '\n\n' + summaryResult.content;
            tokensUsed += summaryResult.tokensUsed;
          } else {
            aiResponse = cleanedResponse + '\n\n' + generateToolResultSummary(toolExecutionResults);
          }
        } catch {
          aiResponse = cleanedResponse + '\n\n' + generateToolResultSummary(toolExecutionResults);
        }
      }

      // Add confirmation notice
      if (confirmations.length > 0) {
        aiResponse += '\n\n⚠️ **Action requires confirmation**: ' +
          confirmations.map(c => `**${c.preview.action}** on **${c.preview.target}**`).join(', ') +
          '\n_Please review and confirm or reject this action._';
      }
    }

    const assistantMessage = await db.aiMessage.create({
      data: { conversationId: conversation.id, role: 'assistant', content: aiResponse, tokensUsed },
    });

    await db.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    return NextResponse.json({
      conversationId: conversation.id,
      message: assistantMessage,
      aiConfigured,
      toolResults: toolExecutionResults.length > 0 ? toolExecutionResults : undefined,
      confirmations: confirmations.length > 0 ? confirmations : undefined,
    });
  } catch (error) {
    console.error('AI Chat POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/ai/chat — Update conversation
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const hasAiWritePerm = hasPermission(tokenPayload.roles, 'ai:write');
    if (!hasAiWritePerm) return NextResponse.json({ error: 'Insufficient permissions. Required: ai:write' }, { status: 403 });

    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await request.json();
    const { conversationId, action, title, category, messageId, content, feedback } = body;

    if (action === 'editMessage') {
      if (!messageId || !content) return NextResponse.json({ error: 'messageId and content are required' }, { status: 400 });
      const message = await db.aiMessage.findUnique({ where: { id: messageId } });
      if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      const conv = await db.aiConversation.findUnique({ where: { id: message.conversationId } });
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conv?.userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      const updated = await db.aiMessage.update({ where: { id: messageId }, data: { editedContent: content.trim(), isEdited: true } });
      return NextResponse.json({ message: updated });
    }

    if (action === 'feedback') {
      if (!messageId || !feedback || !['positive', 'negative'].includes(feedback)) return NextResponse.json({ error: 'messageId and feedback required' }, { status: 400 });
      const message = await db.aiMessage.findUnique({ where: { id: messageId } });
      if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      const conv = await db.aiConversation.findUnique({ where: { id: message.conversationId } });
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conv?.userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      const updated = await db.aiMessage.update({ where: { id: messageId }, data: { feedback } });
      return NextResponse.json({ message: updated });
    }

    if (!conversationId || !action) return NextResponse.json({ error: 'conversationId and action are required' }, { status: 400 });
    const conversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    let data: Record<string, unknown> = {};
    switch (action) {
      case 'bookmark': data = { bookmarked: true, bookmarkedAt: new Date() }; break;
      case 'unbookmark': data = { bookmarked: false, bookmarkedAt: null }; break;
      case 'pin': data = { pinned: true }; break;
      case 'unpin': data = { pinned: false }; break;
      case 'rename':
        if (!title) return NextResponse.json({ error: 'title is required for rename' }, { status: 400 });
        data = { title: title.trim().slice(0, 200) }; break;
      case 'categorize':
        if (!category || !['DATA_QUALITY', 'ENRICHMENT', 'MAPPING', 'GENERAL'].includes(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
        data = { category }; break;
      default: return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updated = await db.aiConversation.update({ where: { id: conversationId }, data });
    return NextResponse.json({ conversation: updated });
  } catch (error) {
    console.error('AI Chat PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/ai/chat?conversationId=xxx or ?messageId=xxx
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const hasAiDeletePerm = hasPermission(tokenPayload.roles, 'ai:write');
    if (!hasAiDeletePerm) return NextResponse.json({ error: 'Insufficient permissions. Required: ai:write' }, { status: 403 });

    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const messageId = searchParams.get('messageId');

    if (messageId) {
      const message = await db.aiMessage.findUnique({ where: { id: messageId } });
      if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      const conv = await db.aiConversation.findUnique({ where: { id: message.conversationId } });
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conv?.userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      await db.aiMessage.delete({ where: { id: messageId } });
      return NextResponse.json({ success: true });
    }

    if (!conversationId) return NextResponse.json({ error: 'conversationId or messageId is required' }, { status: 400 });
    const conversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    await db.aiConversation.delete({ where: { id: conversationId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI Chat DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateFallbackResponse(userMessage: string, aiConfigured: boolean): string {
  const lower = userMessage.toLowerCase();
  const prefix = aiConfigured
    ? '_Note: The AI provider is temporarily unavailable. Showing a fallback response._\n\n'
    : '_Note: AI service is not configured — showing a demo response._\n\n';

  let body = '';
  if (lower.includes('create') && lower.includes('record')) {
    body = `I can create records for you using the \`create_record\` tool. Please tell me the module and the data you'd like to create.`;
  } else if (lower.includes('search') || lower.includes('find')) {
    body = `I can search for records using the \`search_records\` tool. What module and criteria would you like me to search?`;
  } else {
    body = `I'm the **MAA BTOOL AI Assistant** with full read/write access. I can search, create, update, and delete records, manage workflows, run quality checks, and more. How can I help?`;
  }
  return prefix + body;
}
