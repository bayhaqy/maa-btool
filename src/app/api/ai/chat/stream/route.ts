import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, type AIProvider } from '@/lib/ai';
import { rateLimitByCategory } from '@/lib/rate-limit';
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
export const maxDuration = 60;

// ─── SSE Event Types ────────────────────────────────────────────

interface SSEEvent {
  type: 'delta' | 'reasoning' | 'tool_result' | 'tool_confirmation' | 'done' | 'error';
  content?: string;
  conversationId?: string;
  messageId?: string;
  tokensUsed?: number;
  aiConfigured?: boolean;
  message?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; result: ToolCallResult }>;
  /** Confirmation-required tool calls with preview data */
  confirmations?: Array<{
    toolName: string;
    args: Record<string, unknown>;
    preview: { action: string; target: string; details: Record<string, unknown> };
  }>;
}

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ─── Multi-provider streaming AI call ───────────────────────────

type SendFn = (event: SSEEvent) => void;

async function streamFromProvider(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  send: SendFn,
): Promise<{ fullResponse: string; tokensUsed: number }> {
  switch (provider) {
    case 'zai': {
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
              } catch { /* skip malformed SSE chunks */ }
            }
          }
        }

        if (!fullResponse.trim()) {
          return await callGeminiNonStreaming(config, messages, send);
        }

        return { fullResponse, tokensUsed: 0 };
      } catch {
        return await callGeminiNonStreaming(config, messages, send);
      }
    }

    case 'openai':
    case 'custom': {
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
      if (config.customHeaders) Object.assign(customHeaders, config.customHeaders);

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

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream') && !contentType.includes('application/octet-stream')) {
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || '';
          const tokensUsed = data?.usage?.total_tokens || 0;
          if (content) {
            const chunkSize = 8;
            for (let i = 0; i < content.length; i += chunkSize) {
              send({ type: 'delta', content: content.slice(i, i + chunkSize) });
              await new Promise(r => setTimeout(r, 12));
            }
          }
          return { fullResponse: content, tokensUsed };
        }

        let fullResponse = '';
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No readable stream');
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
                  const delta = choice.delta.content;
                  if (delta) { fullResponse += delta; send({ type: 'delta', content: delta }); }
                  const reasoning = choice.delta.reasoning_content;
                  if (reasoning) send({ type: 'reasoning', content: reasoning });
                }
              } catch { /* skip */ }
            }
          }
        }

        return { fullResponse, tokensUsed: 0 };
      };

      return tryStream();
    }

    case 'azure-openai': {
      const url = `${config.baseUrl}/openai/deployments/${config.model}/chat/completions?api-version=2024-06-01`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey },
        body: JSON.stringify({ messages, max_tokens: config.maxTokens, temperature: config.temperature, stream: true }),
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
              if (delta) { fullResponse += delta; send({ type: 'delta', content: delta }); }
            } catch { /* skip */ }
          }
        }
      }
      return { fullResponse, tokensUsed: 0 };
    }

    default:
      throw new Error(`Unsupported AI provider for streaming: ${provider}`);
  }
}

async function callGeminiNonStreaming(
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  send: SendFn,
): Promise<{ fullResponse: string; tokensUsed: number }> {
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
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokensUsed = data?.usageMetadata?.totalTokenCount || 0;
  if (content) {
    const chunkSize = 8;
    for (let i = 0; i < content.length; i += chunkSize) {
      send({ type: 'delta', content: content.slice(i, i + chunkSize) });
      await new Promise(r => setTimeout(r, 12));
    }
  }
  return { fullResponse: content, tokensUsed };
}

// Fallback response generator
function generateFallbackResponse(userMessage: string, aiConfigured: boolean): string {
  const lower = userMessage.toLowerCase();
  const prefix = aiConfigured
    ? ''
    : '_Note: AI service is not configured — showing a demo response. Once the API key is set, full AI responses will be available._\n\n';

  let body = '';

  if (lower.includes('create') && lower.includes('record')) {
    body = `To create a new record, I can use the \`create_record\` tool. For example:

\`\`\`
[TOOL_CALL:create_record({"moduleCode": "ARTICLE_MASTER", "data": {"name": "New Product", "code": "ART-001"}})]
\`\`\`

The record will be created in **DRAFT** status. Would you like me to create a specific record? Just tell me the module and the data!`;
  } else if (lower.includes('search') || lower.includes('find') || lower.includes('list')) {
    body = `I can search for records using the \`search_records\` tool. For example:

\`\`\`
[TOOL_CALL:search_records({"moduleCode": "ARTICLE_MASTER", "search": "Nike"})]
\`\`\`

What would you like me to search for?`;
  } else if (lower.includes('approve') || lower.includes('review') || lower.includes('workflow')) {
    body = `I can help with approval workflows:

- **submit_for_approval**: Submit a DRAFT record for review
- **approve_record**: Approve a record in IN_REVIEW status
- **reject_record**: Reject a record in IN_REVIEW status

Would you like me to perform one of these actions?`;
  } else if (lower.includes('delete')) {
    body = `I can delete DRAFT records using the \`delete_record\` tool. Note that this is a **destructive operation** that requires your confirmation before I proceed.

Only DRAFT records can be deleted. Active records must be archived instead.`;
  } else if (lower.includes('quality') || lower.includes('enrich') || lower.includes('classify')) {
    body = `I can help with data quality and AI-powered operations:

- **check_quality**: Run data quality checks
- **enrich_record**: Suggest missing field values
- **classify_record**: Suggest categories and tags
- **get_data_quality**: View quality scores

Would you like me to run any of these?`;
  } else if (lower.includes('hello') || lower.includes('hi ') || lower.startsWith('hi') || lower.includes('hey')) {
    body = `Hello! I'm the **MAA BTOOL AI Assistant**. I can now **directly interact with your MDM data** — search records, create new entries, update fields, manage approval workflows, run quality checks, and more!

What would you like to do?`;
  } else {
    body = `I'm the **MAA BTOOL AI Assistant** with full read/write access to your MDM data. I can help you with:

- **🔍 Search & Read**: Find records, view details, check quality scores
- **✏️ Create & Update**: Create new records, update existing ones
- **🗑️ Delete**: Remove DRAFT records (with confirmation)
- **✅ Workflows**: Submit for approval, approve, or reject records
- **🤖 AI Features**: Enrich data, classify records, run quality checks
- **📂 Assets**: Search and create digital assets
- **🌳 Hierarchy**: View hierarchy structures

Just tell me what you need!`;
  }

  return prefix + body;
}

// POST /api/ai/chat/stream — Streaming chat via Server-Sent Events
export async function POST(request: NextRequest) {
  const tokenPayload = getTokenFromHeaders(request.headers);
  if (!tokenPayload) {
    return new Response(sseEncode({ type: 'error', message: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const hasAiReadPerm = hasPermission(tokenPayload.roles, 'ai:read');
  if (!hasAiReadPerm) {
    return new Response(sseEncode({ type: 'error', message: 'Access denied. Required: ai:read permission.' }), {
      status: 403, headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const rl = rateLimitByCategory('ai', tokenPayload.userId);
  if (!rl.allowed) {
    return new Response(sseEncode({ type: 'error', message: 'Too many requests. Please try again later.' }), {
      status: 429, headers: { 'Content-Type': 'text/event-stream', 'Retry-After': String(rl.retryAfterSeconds) },
    });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(sseEncode({ type: 'error', message: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const { message, conversationId } = body as { message?: string; conversationId?: string };
  if (!message || typeof message !== 'string') {
    return new Response(sseEncode({ type: 'error', message: 'message is required' }), {
      status: 400, headers: { 'Content-Type': 'text/event-stream' },
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
            fullResponse = generateFallbackResponse(message, false);
            const chunkSize = 8;
            for (let i = 0; i < fullResponse.length; i += chunkSize) {
              send({ type: 'delta', content: fullResponse.slice(i, i + chunkSize) });
              await new Promise(r => setTimeout(r, 12));
            }
          }
        } catch (aiError) {
          console.error('AI stream error (falling back to demo mode):', aiError);
          fullResponse = generateFallbackResponse(message, false);
          const chunkSize = 8;
          for (let i = 0; i < fullResponse.length; i += chunkSize) {
            send({ type: 'delta', content: fullResponse.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 12));
          }
        }

        // ── Tool call processing ─────────────────────────────────
        const toolCalls = parseToolCalls(fullResponse);

        if (toolCalls.length > 0) {
          const cleanedResponse = stripToolCalls(fullResponse);

          // Separate destructive and non-destructive tool calls
          const nonDestructive = toolCalls.filter(tc => !isDestructiveTool(tc.name));
          const destructive = toolCalls.filter(tc => isDestructiveTool(tc.name));

          // Execute non-destructive tools immediately
          const toolResults: Array<{ name: string; result: ToolCallResult }> = [];
          const confirmations: SSEEvent['confirmations'] = [];

          for (const tc of nonDestructive) {
            const result = await executeToolCall(tc.name, tc.args, tokenPayload.companyId, tokenPayload.userId, tokenPayload.roles);
            toolResults.push({ name: tc.name, result });
          }

          // For destructive tools, generate confirmation previews
          for (const tc of destructive) {
            const result = await executeToolCall(tc.name, tc.args, tokenPayload.companyId, tokenPayload.userId, tokenPayload.roles, false);
            if (result.preview) {
              confirmations.push({
                toolName: tc.name,
                args: tc.args,
                preview: result.preview,
              });
              // Don't include in toolResults — these are pending confirmation
            } else {
              // Tool failed validation (e.g., record not found, wrong status)
              toolResults.push({ name: tc.name, result });
            }
          }

          // Send tool results for non-destructive calls
          if (toolResults.length > 0 || confirmations.length > 0) {
            send({
              type: 'tool_result',
              toolCalls: nonDestructive.map(tc => ({ name: tc.name, args: tc.args })),
              toolResults,
            });

            // Send confirmation requests for destructive calls
            if (confirmations.length > 0) {
              send({ type: 'tool_confirmation', confirmations });
            }
          }

          // Generate summary for executed tools (non-destructive)
          let summaryContent = '';
          if (toolResults.length > 0) {
            const toolResultSummary = JSON.stringify(toolResults, null, 2);
            const summaryPrompt: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
              ...aiMessages,
              { role: 'assistant', content: cleanedResponse || 'I will look that up for you.' },
              {
                role: 'user',
                content: `[TOOL RESULTS]\n${toolResultSummary}\n\nBased on these tool results, provide a clear and helpful summary to the user. If the tool call was successful, describe what was done or what data was found. If it failed, explain the error and suggest next steps. Do not mention the tool call mechanism — just present the information naturally.`,
              },
            ];

            try {
              const config = await getTenantAIProviderConfig(tokenPayload.companyId);
              if (config.apiKey) {
                const summaryResult = await streamFromProvider(config.provider, config, summaryPrompt, send);
                summaryContent = summaryResult.fullResponse;
                tokensUsed += summaryResult.tokensUsed;
              } else {
                const demoSummary = generateToolResultSummary(toolResults);
                summaryContent = demoSummary;
                const chunkSize = 8;
                for (let i = 0; i < demoSummary.length; i += chunkSize) {
                  send({ type: 'delta', content: demoSummary.slice(i, i + chunkSize) });
                  await new Promise(r => setTimeout(r, 12));
                }
              }
            } catch (summaryError) {
              console.error('AI summary generation error:', summaryError);
              const fallbackSummary = generateToolResultSummary(toolResults);
              summaryContent = fallbackSummary;
              const chunkSize = 8;
              for (let i = 0; i < fallbackSummary.length; i += chunkSize) {
                send({ type: 'delta', content: fallbackSummary.slice(i, i + chunkSize) });
                await new Promise(r => setTimeout(r, 12));
              }
            }
          }

          // Add confirmation notice to the saved response
          let confirmationNotice = '';
          if (confirmations.length > 0) {
            confirmationNotice = '\n\n⚠️ **Action requires confirmation**: ' +
              confirmations.map(c => `**${c.preview.action}** on **${c.preview.target}**`).join(', ') +
              '\n_Please review and confirm or reject this action._';
          }

          fullResponse = cleanedResponse + (summaryContent ? '\n\n' + summaryContent : '') + confirmationNotice;
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
