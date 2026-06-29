import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, type AIProvider } from '@/lib/ai';
import { rateLimitByCategory } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are MAA BTOOL AI Assistant, an intelligent helper for the MAA BTOOL Enterprise Master Data Management system. You help users with data management tasks, explain workflows, suggest best practices, and assist with MDM operations.

Key information about the system:
- MAA BTOOL manages master data for the MAPI Group (PT Mitra Adiperkasa Tbk) and its subsidiaries
- Companies: MAPI (retail), MAPA (sports/lifestyle), MBA (F&B), MAPD (digital), MAPP (property), MAPL (logistics)
- Modules: Article Master, Budget, Asset, Store Master, Supplier Master, Pricing Master, Promotion Master
- Record statuses: DRAFT → IN_REVIEW → ACTIVE/REJECTED → ARCHIVED
- Features: CRUD operations, approval workflow, bulk import/export, hierarchy management, image upload, API keys, SFTP sync, documentation

Format your responses using Markdown when helpful: use **bold** for emphasis, bullet lists, numbered steps, and fenced code blocks for code or commands. Be concise but thorough.`;

interface SSEEvent {
  type: 'delta' | 'reasoning' | 'done' | 'error';
  content?: string;
  conversationId?: string;
  messageId?: string;
  tokensUsed?: number;
  aiConfigured?: boolean;
  message?: string;
}

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ─── Multi-provider streaming AI call ─────────────────────────────

type SendFn = (event: SSEEvent) => void;

async function streamFromProvider(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  send: SendFn,
): Promise<{ fullResponse: string; tokensUsed: number }> {
  switch (provider) {
    case 'zai': {
      // Use the ZAI SDK — supports streaming
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAIClass = ZAIModule.default;
      interface ZAIConstructor {
        new (c: { baseUrl: string; apiKey: string }): {
          chat: {
            completions: {
              create: (opts: Record<string, unknown>) => Promise<unknown>;
            };
          };
        };
      }
      const zai = new (ZAIClass as unknown as ZAIConstructor)({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      const response: unknown = await zai.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: true,
      });

      let fullResponse = '';
      let tokensUsed = 0;

      const asyncIterable = response as AsyncIterable<{
        choices?: Array<{ delta?: { content?: string } }>;
      }>;
      const responseObject = response as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      if (asyncIterable && typeof (asyncIterable as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of asyncIterable) {
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            send({ type: 'delta', content: delta });
          }
        }
      } else if (responseObject?.choices?.[0]?.message?.content) {
        fullResponse = responseObject.choices[0].message.content;
        tokensUsed = responseObject.usage?.total_tokens || 0;
        // Simulate streaming
        const chunkSize = 8;
        for (let i = 0; i < fullResponse.length; i += chunkSize) {
          const chunk = fullResponse.slice(i, i + chunkSize);
          send({ type: 'delta', content: chunk });
          await new Promise(r => setTimeout(r, 12));
        }
      } else {
        fullResponse = 'I apologize, but I was unable to generate a response. Please try again.';
        send({ type: 'delta', content: fullResponse });
      }

      return { fullResponse, tokensUsed };
    }

    case 'gemini': {
      // Gemini REST API — streamGenerateContent
      // Try streaming first, fall back to non-streaming
      try {
        const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
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

        let fullResponse = '';
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No readable stream from Gemini');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  fullResponse += text;
                  send({ type: 'delta', content: text });
                }
              } catch {
                // Skip malformed SSE chunks
              }
            }
          }
        }

        // If streaming produced no content, fall back to non-streaming
        if (!fullResponse.trim()) {
          return await callGeminiNonStreaming(config, messages, send);
        }

        return { fullResponse, tokensUsed: 0 };
      } catch {
        // Fallback to non-streaming Gemini call
        return await callGeminiNonStreaming(config, messages, send);
      }
    }

    case 'openai':
    case 'custom': {
      // OpenAI-compatible streaming
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
      if (config.customHeaders) {
        Object.assign(customHeaders, config.customHeaders);
      }

      // Try streaming first, fall back to non-streaming if needed
      const tryStream = async (): Promise<{ fullResponse: string; tokensUsed: number }> => {
        const res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: customHeaders,
          body: JSON.stringify({
            model: config.model,
            messages,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            stream: true,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 300)}`);
        }

        // Check if the response is actually a stream
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream') && !contentType.includes('application/octet-stream')) {
          // Provider returned a non-streaming response — parse it and simulate streaming
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || '';
          const tokensUsed = data?.usage?.total_tokens || 0;
          if (content) {
            // Simulate streaming by chunking the response
            const chunkSize = 8;
            for (let i = 0; i < content.length; i += chunkSize) {
              const chunk = content.slice(i, i + chunkSize);
              send({ type: 'delta', content: chunk });
              await new Promise(r => setTimeout(r, 12));
            }
          }
          return { fullResponse: content, tokensUsed };
        }

        let fullResponse = '';
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No readable stream from OpenAI');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const choice = parsed?.choices?.[0];
                if (choice?.delta) {
                  // Handle standard content delta
                  const delta = choice.delta.content;
                  if (delta) {
                    fullResponse += delta;
                    send({ type: 'delta', content: delta });
                  }
                  // Handle reasoning/thinking content (e.g., GLM-5.1 reasoning_content)
                  const reasoning = choice.delta.reasoning_content;
                  if (reasoning) {
                    // Send reasoning as a separate event type so the frontend can display it differently
                    send({ type: 'reasoning', content: reasoning });
                  }
                }
              } catch {
                // Skip malformed SSE chunks
              }
            }
          }
        }

        return { fullResponse, tokensUsed: 0 };
      };

      return tryStream();
    }

    case 'azure-openai': {
      // Azure OpenAI streaming
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
          stream: true,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Azure OpenAI API error (${res.status}): ${errBody.slice(0, 300)}`);
      }

      let fullResponse = '';
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream from Azure OpenAI');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                send({ type: 'delta', content: delta });
              }
            } catch {
              // Skip malformed SSE chunks
            }
          }
        }
      }

      return { fullResponse, tokensUsed: 0 };
    }

    default:
      throw new Error(`Unsupported AI provider for streaming: ${provider}`);
  }
}

// ─── Non-streaming fallback for Gemini ──────────────────────────────

async function callGeminiNonStreaming(
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  send: SendFn,
): Promise<{ fullResponse: string; tokensUsed: number }> {
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

  if (content) {
    // Simulate streaming
    const chunkSize = 8;
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      send({ type: 'delta', content: chunk });
      await new Promise(r => setTimeout(r, 12));
    }
  }

  return { fullResponse: content, tokensUsed };
}

// POST /api/ai/chat/stream — Streaming chat via Server-Sent Events
export async function POST(request: NextRequest) {
  const tokenPayload = getTokenFromHeaders(request.headers);
  if (!tokenPayload) {
    return new Response(sseEncode({ type: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const hasAiReadPerm = hasPermission(tokenPayload.roles, 'ai:read');
  if (!hasAiReadPerm) {
    return new Response(sseEncode({ type: 'error', message: 'Access denied. Required: ai:read permission.' }), {
      status: 403,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  // Rate limit AI endpoints
  const rl = rateLimitByCategory('ai', tokenPayload.userId);
  if (!rl.allowed) {
    return new Response(sseEncode({ type: 'error', message: 'Too many requests. Please try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'text/event-stream', 'Retry-After': String(rl.retryAfterSeconds) },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(sseEncode({ type: 'error', message: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const { message, conversationId } = body as { message?: string; conversationId?: string };
  if (!message || typeof message !== 'string') {
    return new Response(sseEncode({ type: 'error', message: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(sseEncode(event)));
      };

      try {
        // 1. Resolve / create conversation
        let conversation;
        let history: Array<{ role: string; content: string }> = [];

        if (conversationId) {
          conversation = await db.aiConversation.findUnique({
            where: { id: conversationId },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
          });
          if (!conversation) {
            send({ type: 'error', message: 'Conversation not found' });
            controller.close();
            return;
          }
          if (conversation.userId !== tokenPayload.userId) {
            send({ type: 'error', message: 'Access denied' });
            controller.close();
            return;
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

        // 2. Save user message
        await db.aiMessage.create({
          data: {
            conversationId: conversation.id,
            userId: tokenPayload.userId,
            role: 'user',
            content: message,
          },
        });

        // 3. Build AI messages
        const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          { role: 'user', content: message },
        ];

        let fullResponse = '';
        let tokensUsed = 0;
        let aiConfigured = false;

        try {
          const config = await getTenantAIProviderConfig(tokenPayload.companyId);
          aiConfigured = !!config.apiKey;

          if (aiConfigured) {
            const result = await streamFromProvider(config.provider, config, aiMessages, send);
            fullResponse = result.fullResponse;
            tokensUsed = result.tokensUsed;
          } else {
            // Demo mode fallback
            fullResponse = generateFallbackResponse(message, false);
            const chunkSize = 8;
            for (let i = 0; i < fullResponse.length; i += chunkSize) {
              const chunk = fullResponse.slice(i, i + chunkSize);
              send({ type: 'delta', content: chunk });
              await new Promise(r => setTimeout(r, 12));
            }
          }
        } catch (aiError) {
          console.error('AI stream error (falling back to demo mode):', aiError);
          fullResponse = generateFallbackResponse(message, false);
          const chunkSize = 8;
          for (let i = 0; i < fullResponse.length; i += chunkSize) {
            const chunk = fullResponse.slice(i, i + chunkSize);
            send({ type: 'delta', content: chunk });
            await new Promise(r => setTimeout(r, 12));
          }
        }

        // 4. Save assistant message
        const assistantMessage = await db.aiMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: fullResponse,
            tokensUsed,
          },
        });

        // 5. Update conversation timestamp
        await db.aiConversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        });

        send({
          type: 'done',
          conversationId: conversation.id,
          messageId: assistantMessage.id,
          tokensUsed,
          aiConfigured,
        });
      } catch (error) {
        console.error('AI Chat stream error:', error);
        send({ type: 'error', message: 'Internal server error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// Fallback response generator (mirrors /api/ai/chat/route.ts)
function generateFallbackResponse(userMessage: string, aiConfigured: boolean): string {
  const lower = userMessage.toLowerCase();
  const prefix = aiConfigured
    ? ''
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

Only users with the **Manager** or **Super Admin** role can approve records.`;
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

Supported formats: **PNG, JPG, GIF, WebP**.`;
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
