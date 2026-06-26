import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isAIConfigured } from '@/lib/ai';

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
  type: 'delta' | 'done' | 'error';
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

// POST /api/ai/chat/stream — Streaming chat via Server-Sent Events
export async function POST(request: NextRequest) {
  const tokenPayload = getTokenFromHeaders(request.headers);
  if (!tokenPayload) {
    return new Response(sseEncode({ type: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const hasAiRole = tokenPayload.roles.some(r => ['Super Admin', 'AI User', 'Manager'].includes(r));
  if (!hasAiRole) {
    return new Response(sseEncode({ type: 'error', message: 'Access denied. AI User role required.' }), {
      status: 403,
      headers: { 'Content-Type': 'text/event-stream' },
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

        const aiConfigured = isAIConfigured();
        let fullResponse = '';
        let tokensUsed = 0;

        if (aiConfigured) {
          // ---- Real AI streaming ----
          try {
            const { getAIClient } = await import('@/lib/ai');
            const zai = await getAIClient();
            const response: unknown = await zai.chat.completions.create({
              model: 'glm-4-flash',
              messages: aiMessages,
              stream: true,
            });

            // The SDK may return either an async iterable (true streaming) or a plain object.
            // Handle both cases gracefully.
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
              // Simulate streaming by chunking the full response
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
          } catch (aiError) {
            console.error('AI SDK stream error:', aiError);
            const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
            fullResponse = `_⚠️ AI Error: ${errMsg}_\n\n` + generateFallbackResponse(message, true);
            // Stream the fallback
            const chunkSize = 8;
            for (let i = 0; i < fullResponse.length; i += chunkSize) {
              const chunk = fullResponse.slice(i, i + chunkSize);
              send({ type: 'delta', content: chunk });
              await new Promise(r => setTimeout(r, 12));
            }
          }
        } else {
          // ---- Demo mode fallback (streamed) ----
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
    : '_Note: AI service is not configured (`ZAI_API_KEY` env var missing) — showing a demo response. Once the API key is set in Vercel, full AI responses will be available._\n\n';

  let body = '';

  if (lower.includes('create') && lower.includes('record')) {
    body = `To create a new record:

1. Navigate to **Data Records**
2. Select the target module (e.g. Article Master)
3. Click the **Create** button
4. Fill in the required fields (marked with \`\*\`)
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
  } else if (lower.includes('sftp') || lower.includes('sync')) {
    body = `To set up SFTP sync:

1. Navigate to **SFTP Configuration**
2. Click **Add New Configuration**
3. Enter host, port, credentials
4. Set sync direction (\`INBOUND\` / \`OUTBOUND\` / \`BIDIRECTIONAL\`)
5. Configure schedule and file pattern
6. Test the connection before enabling

**SFTP Manager** role is required for this operation.`;
  } else if (lower.includes('image') || lower.includes('photo') || lower.includes('upload')) {
    body = `To upload images:

1. Open a record detail page
2. Find the **IMAGE** type field
3. Click the upload button
4. Select your image file
5. Set as primary if needed

Supported formats: **PNG, JPG, GIF, WebP**. Images are stored in \`/public/uploads/\`.`;
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
