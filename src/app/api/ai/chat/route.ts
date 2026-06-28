import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, type AIProvider } from '@/lib/ai';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are MAA BTOOL AI Assistant, an intelligent helper for the MAA BTOOL Enterprise Master Data Management system. You help users with data management tasks, explain workflows, suggest best practices, and assist with MDM operations.

Key information about the system:
- MAA BTOOL manages master data for the MAPI Group (PT Mitra Adiperkasa Tbk) and its subsidiaries
- Companies: MAPI (retail), MAPA (sports/lifestyle), MBA (F&B), MAPD (digital), MAPP (property), MAPL (logistics)
- Modules: Article Master, Budget, Asset, Store Master, Supplier Master, Pricing Master, Promotion Master
- Record statuses: DRAFT → IN_REVIEW → ACTIVE/REJECTED → ARCHIVED
- Features: CRUD operations, approval workflow, bulk import/export, hierarchy management, image upload, API keys, SFTP sync, documentation

You can help with:
- Explaining how to use MDM features
- Suggesting data quality best practices
- Guiding users through workflows
- Answering questions about the system
- Providing recommendations for data management

Format your responses using Markdown when helpful: use **bold** for emphasis, bullet lists, numbered steps, and fenced code blocks (\`\`\`) for code or commands. Be concise but thorough.`;

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
      // Use the ZAI SDK
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
      // Gemini REST API: POST {baseUrl}/models/{model}:generateContent?key={apiKey}
      const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;
      const geminiContents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      const systemInstruction = messages.find(m => m.role === 'system');
      const body: Record<string, unknown> = {
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature,
        },
      };
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Gemini API error (${res.status}): ${errBody.slice(0, 300)}`);
      }
      const data = await res.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const tokensUsed = data?.usageMetadata?.totalTokenCount || 0;
      return {
        content: content || 'I apologize, but I was unable to generate a response. Please try again.',
        tokensUsed,
      };
    }

    case 'openai': {
      // OpenAI-compatible REST API
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 300)}`);
      }
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }

    case 'custom': {
      // Custom provider — OpenAI-compatible API with custom headers support
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
      if (config.customHeaders) {
        Object.assign(customHeaders, config.customHeaders);
      }
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Custom API error (${res.status}): ${errBody.slice(0, 300)}`);
      }
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }

    case 'azure-openai': {
      // Azure OpenAI REST API
      const url = `${config.baseUrl}/openai/deployments/${config.model}/chat/completions?api-version=2024-06-01`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.apiKey,
        },
        body: JSON.stringify({
          messages,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Azure OpenAI API error (${res.status}): ${errBody.slice(0, 300)}`);
      }
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.',
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
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiReadPerm = hasPermission(tokenPayload.roles, 'ai:read');
    if (!hasAiReadPerm) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: ai:read' }, { status: 403 });
    }

    // ── Rate limit: AI endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    // ---- Full conversation with messages ----
    if (conversationId) {
      const conversation = await db.aiConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      return NextResponse.json({ conversation });
    }

    // ---- Conversation list ----
    const userId = searchParams.get('userId') || tokenPayload.userId;
    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && userId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const conversations = await db.aiConversation.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
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
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiPerm = hasPermission(tokenPayload.roles, 'ai:read');
    if (!hasAiPerm) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: ai:read' }, { status: 403 });
    }

    // ── Rate limit: AI endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { message, conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    let conversation;
    let history: Array<{ role: string; content: string }> = [];

    if (conversationId) {
      conversation = await db.aiConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      if (conversation.userId !== tokenPayload.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      history = conversation.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));
    } else {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      conversation = await db.aiConversation.create({
        data: { userId: tokenPayload.userId, title },
      });
    }

    // Save user message
    await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        userId: tokenPayload.userId,
        role: 'user',
        content: message,
      },
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
      // Use company-specific AI config from TenantAiConfig, fall back to global
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
      // AI is configured but failed (e.g. quota exceeded), pass true to avoid "not configured" message
      aiResponse = generateFallbackResponse(message, aiConfigured);
    }

    const assistantMessage = await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse,
        tokensUsed,
      },
    });

    await db.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      message: assistantMessage,
      aiConfigured,
    });
  } catch (error) {
    console.error('AI Chat POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/ai/chat — Update conversation (bookmark/unbookmark/pin/unpin/rename/categorize)
// Also supports: editMessage, feedback on individual messages
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiWritePerm = hasPermission(tokenPayload.roles, 'ai:write');
    if (!hasAiWritePerm) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: ai:write' }, { status: 403 });
    }

    // ── Rate limit: AI endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { conversationId, action, title, category, messageId, content, feedback } = body;

    // ── Message-level actions (editMessage, feedback) ───────────────
    if (action === 'editMessage') {
      if (!messageId || !content || typeof content !== 'string') {
        return NextResponse.json({ error: 'messageId and content are required for editMessage' }, { status: 400 });
      }
      const message = await db.aiMessage.findUnique({ where: { id: messageId } });
      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }
      // Verify ownership via conversation
      const conv = await db.aiConversation.findUnique({ where: { id: message.conversationId } });
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conv?.userId !== tokenPayload.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      const updated = await db.aiMessage.update({
        where: { id: messageId },
        data: { editedContent: content.trim(), isEdited: true },
      });
      return NextResponse.json({ message: updated });
    }

    if (action === 'feedback') {
      if (!messageId || !feedback || !['positive', 'negative'].includes(feedback)) {
        return NextResponse.json({ error: 'messageId and feedback (positive|negative) are required' }, { status: 400 });
      }
      const message = await db.aiMessage.findUnique({ where: { id: messageId } });
      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }
      const conv = await db.aiConversation.findUnique({ where: { id: message.conversationId } });
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conv?.userId !== tokenPayload.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      const updated = await db.aiMessage.update({
        where: { id: messageId },
        data: { feedback },
      });
      return NextResponse.json({ message: updated });
    }

    // ── Conversation-level actions ──────────────────────────────────
    if (!conversationId || !action) {
      return NextResponse.json({ error: 'conversationId and action are required' }, { status: 400 });
    }

    const conversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let data: Record<string, unknown> = {};
    switch (action) {
      case 'bookmark':
        data = { bookmarked: true, bookmarkedAt: new Date() };
        break;
      case 'unbookmark':
        data = { bookmarked: false, bookmarkedAt: null };
        break;
      case 'pin':
        data = { pinned: true };
        break;
      case 'unpin':
        data = { pinned: false };
        break;
      case 'rename':
        if (!title || typeof title !== 'string') {
          return NextResponse.json({ error: 'title is required for rename' }, { status: 400 });
        }
        data = { title: title.trim().slice(0, 200) };
        break;
      case 'categorize':
        if (!category || !['DATA_QUALITY', 'ENRICHMENT', 'MAPPING', 'GENERAL'].includes(category)) {
          return NextResponse.json({ error: 'category must be DATA_QUALITY, ENRICHMENT, MAPPING, or GENERAL' }, { status: 400 });
        }
        data = { category };
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updated = await db.aiConversation.update({ where: { id: conversationId }, data });
    return NextResponse.json({ conversation: updated });
  } catch (error) {
    console.error('AI Chat PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/ai/chat?conversationId=xxx — Delete conversation + all messages (cascade)
// DELETE /api/ai/chat?messageId=xxx — Delete individual message
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiDeletePerm = hasPermission(tokenPayload.roles, 'ai:write');
    if (!hasAiDeletePerm) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: ai:write' }, { status: 403 });
    }

    // ── Rate limit: AI endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const messageId = searchParams.get('messageId');

    // ── Delete individual message ──────────────────────────────────
    if (messageId) {
      const message = await db.aiMessage.findUnique({ where: { id: messageId } });
      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }
      const conv = await db.aiConversation.findUnique({ where: { id: message.conversationId } });
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conv?.userId !== tokenPayload.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      await db.aiMessage.delete({ where: { id: messageId } });
      return NextResponse.json({ success: true });
    }

    // ── Delete entire conversation ─────────────────────────────────
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId or messageId is required' }, { status: 400 });
    }

    const conversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await db.aiConversation.delete({ where: { id: conversationId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI Chat DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Fallback response generator when AI SDK is unavailable or not configured
function generateFallbackResponse(userMessage: string, aiConfigured: boolean): string {
  const lower = userMessage.toLowerCase();
  const prefix = aiConfigured
    ? '_Note: The AI provider is temporarily unavailable (e.g., quota exceeded or network error). Showing a fallback response. Please try again later or check your API key in AI Settings._\n\n'
    : '_Note: AI service is not configured — showing a demo response. Once the API key is set, full AI responses will be available._\n\n';

  let body = '';

  if (lower.includes('create') && lower.includes('record')) {
    body = `To create a new record:

1. Navigate to **Data Records**
2. Select the target module (e.g. Article Master)
3. Click the **Create** button
4. Fill in the required fields (marked with \`*\`)
5. Save as **Draft** or **Submit for Review**

\`\`\`text
DRAFT → IN_REVIEW → ACTIVE
\`\`\`

Required fields are marked with an asterisk. The approval workflow will depend on the module configuration.`;
  } else if (lower.includes('approve') || lower.includes('review') || lower.includes('workflow')) {
    body = `To approve records:

1. Navigate to the **Workflow** page
2. Find the pending approval ticket
3. Review the changes in the diff panel
4. Click **Approve** or **Reject**
5. Add review notes if needed

Only users with the **Manager** or **Super Admin** role can approve records. Use the **"Lihat Detail Perubahan"** button to see a full field-by-field breakdown of the proposed changes.`;
  } else if (lower.includes('import') || lower.includes('bulk') || lower.includes('export')) {
    body = `For bulk operations:

1. Navigate to **Bulk Import** page
2. Select the module
3. Choose **Paste Data** or **Upload File** tab
4. For upload: drag & drop \`.xlsx\`, \`.xls\`, or \`.csv\` files
5. For export: click **Export** to download data

\`\`\`bash
# Supported formats
.xlsx .xls .csv
\`\`\`

Download the template first to ensure correct column format.`;
  } else if (lower.includes('api') && (lower.includes('key') || lower.includes('token'))) {
    body = `To manage API keys:

1. Navigate to **API Keys** section
2. Click **Create New Key**
3. Set name, permissions, and rate limit
4. Save the raw key — it's shown only once!
5. Use the key in your \`Authorization\` header

\`\`\`http
Authorization: Bearer YOUR_API_KEY
\`\`\`

Production keys have **1000 req/min**, testing keys have **100 req/min**.`;
  } else if (lower.includes('image') || lower.includes('photo') || lower.includes('upload')) {
    body = `To upload images:

1. Open a record detail page
2. Find the **IMAGE** type field
3. Click the upload button
4. Select your image file
5. Set as primary if needed

Supported formats: **PNG, JPG, GIF, WebP**. Images are stored via the API upload route.`;
  } else if (lower.includes('status') || lower.includes('draft') || lower.includes('lifecycle')) {
    body = `Record status workflow:

\`\`\`text
DRAFT → IN_REVIEW → ACTIVE
                ↘ REJECTED
ACTIVE → ARCHIVED
\`\`\`

- **DRAFT** — Initial state, editable
- **IN_REVIEW** — Submitted for approval
- **ACTIVE** — Approved and live
- **REJECTED** — Declined, can be revised
- **ARCHIVED** — Soft-deleted

Only **Super Admins** can bypass the approval workflow.`;
  } else if (lower.includes('hello') || lower.includes('hi ') || lower.startsWith('hi') || lower.includes('hey')) {
    body = `Hello! I'm the **MAA BTOOL AI Assistant**. I can help you with:

- **Record Management** — Creating, editing, and approving records
- **Workflows** — Understanding status transitions and approval processes
- **Bulk Operations** — Importing and exporting data
- **Integrations** — API keys and SFTP configuration
- **Best Practices** — Data quality and governance

What would you like to know?`;
  } else {
    body = `I'm the **MAA BTOOL AI Assistant**. I can help you with master data management tasks including:

- **Record Management**: Creating, editing, and approving records
- **Workflows**: Understanding status transitions and approval processes
- **Bulk Operations**: Importing and exporting data
- **Integrations**: API keys and SFTP configuration
- **Best Practices**: Data quality and governance

Try asking me:
- "How do I create a new record?"
- "Explain the approval workflow"
- "How to manage API keys?"
- "Best practices for bulk import"`;
  }

  return prefix + body;
}
