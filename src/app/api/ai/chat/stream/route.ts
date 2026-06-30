import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, type AIProvider } from '@/lib/ai';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { jsonVal, jsonParse } from '@/lib/db-json';

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

You have access to the following tools that allow you to interact with the MDM system:
- search_records: Search for records by module, keyword, or status
- get_record: Get detailed record information
- create_record: Create new records (DRAFT status)
- update_record: Update existing records (triggers amendment workflow for ACTIVE records)
- delete_record: Delete DRAFT records
- submit_for_approval: Submit DRAFT records for review
- approve_record: Approve records in review
- get_data_quality: Get data quality scores
- list_modules: List all available modules

When users ask you to perform actions, use the appropriate tool. Always confirm with the user before making destructive changes (delete, approve).

When you need to call a tool, output it in this exact format on its own line:
[TOOL_CALL:tool_name(JSON arguments)]

For example:
[TOOL_CALL:search_records({"moduleCode": "ARTICLE_MASTER", "search": "Nike"})]
[TOOL_CALL:list_modules({})]
[TOOL_CALL:create_record({"moduleCode": "ARTICLE_MASTER", "data": {"name": "New Product", "code": "ART-001"}})]

You can call multiple tools in a single response if needed. After the tool results are returned, you will summarize the results for the user.

Format your responses using Markdown when helpful: use **bold** for emphasis, bullet lists, numbered steps, and fenced code blocks for code or commands. Be concise but thorough.`;

interface SSEEvent {
  type: 'delta' | 'reasoning' | 'tool_result' | 'done' | 'error';
  content?: string;
  conversationId?: string;
  messageId?: string;
  tokensUsed?: number;
  aiConfigured?: boolean;
  message?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; result: unknown }>;
}

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ─── AI Tool definitions ──────────────────────────────────────────

const AI_TOOLS = [
  {
    name: 'search_records',
    description: 'Search for data records in the MDM system. Returns matching records with their data.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code (e.g., ARTICLE_MASTER, STORE_MASTER)' },
        search: { type: 'string', description: 'Search query' },
        status: { type: 'string', description: 'Filter by status (DRAFT, IN_REVIEW, ACTIVE, REJECTED, ARCHIVED)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['moduleCode'],
    },
  },
  {
    name: 'get_record',
    description: 'Get detailed information about a specific data record by ID.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID' },
      },
      required: ['recordId'],
    },
  },
  {
    name: 'create_record',
    description: 'Create a new data record in the MDM system. The record will be created in DRAFT status.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code' },
        data: { type: 'object', description: 'Record data as key-value pairs' },
      },
      required: ['moduleCode', 'data'],
    },
  },
  {
    name: 'update_record',
    description: 'Update an existing data record. For ACTIVE records, this triggers the amendment workflow.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID' },
        data: { type: 'object', description: 'Fields to update as key-value pairs' },
      },
      required: ['recordId', 'data'],
    },
  },
  {
    name: 'delete_record',
    description: 'Delete a data record (only DRAFT records can be deleted directly).',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID' },
      },
      required: ['recordId'],
    },
  },
  {
    name: 'submit_for_approval',
    description: 'Submit a DRAFT record for approval (changes status to IN_REVIEW).',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID' },
      },
      required: ['recordId'],
    },
  },
  {
    name: 'approve_record',
    description: 'Approve a record that is IN_REVIEW (changes status to ACTIVE).',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID' },
        comment: { type: 'string', description: 'Optional approval comment' },
      },
      required: ['recordId'],
    },
  },
  {
    name: 'get_data_quality',
    description: 'Get data quality scores and issues for records.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code' },
        recordId: { type: 'string', description: 'Optional specific record ID' },
      },
    },
  },
  {
    name: 'list_modules',
    description: 'List all available modules in the MDM system.',
    parameters: { type: 'object', properties: {} },
  },
];

// ─── Tool execution engine ────────────────────────────────────────

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  companyId: string,
  _userId: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (toolName) {
      case 'search_records': {
        const { moduleCode, search, status, limit = 10 } = args;
        const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
        if (!mod) return { success: false, error: `Module ${moduleCode} not found` };

        const where: Record<string, unknown> = { moduleId: mod.id, companyId };
        if (status) where.status = String(status);

        let records = await db.dataRecord.findMany({
          where,
          take: Number(limit) * 3, // Fetch extra to allow in-memory search filtering
          orderBy: { updatedAt: 'desc' },
          include: { module: { select: { moduleCode: true, moduleName: true } } },
        });

        // If a search term is provided, filter in-memory on JSON payload fields
        if (search) {
          const term = String(search).toLowerCase();
          records = records.filter(r => {
            const payload = jsonParse<Record<string, unknown>>(r.currentPayload) || {};
            return Object.values(payload).some(v =>
              String(v).toLowerCase().includes(term),
            );
          });
        }

        return { success: true, data: records.slice(0, Number(limit)) };
      }

      case 'get_record': {
        const record = await db.dataRecord.findUnique({
          where: { id: String(args.recordId) },
          include: { module: { select: { moduleCode: true, moduleName: true } } },
        });
        if (!record) return { success: false, error: 'Record not found' };
        return { success: true, data: record };
      }

      case 'create_record': {
        const { moduleCode, data } = args;
        const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
        if (!mod) return { success: false, error: `Module ${moduleCode} not found` };

        const recordData = (data as Record<string, unknown>) || {};
        const record = await db.dataRecord.create({
          data: {
            moduleId: mod.id,
            companyId,
            currentPayload: jsonVal({
              ...recordData,
              name: recordData.name || recordData.recordName || 'New Record',
              code: recordData.code || recordData.recordCode || `REC-${Date.now()}`,
            }),
            status: 'DRAFT',
            createdById: _userId,
          },
        });
        return { success: true, data: record };
      }

      case 'update_record': {
        const { recordId, data } = args;
        const record = await db.dataRecord.findUnique({ where: { id: String(recordId) } });
        if (!record) return { success: false, error: 'Record not found' };

        // Merge with existing payload
        const existingPayload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
        const updatedPayload = { ...existingPayload, ...(data as Record<string, unknown>) };

        if (record.status === 'ACTIVE') {
          // Amendment workflow: create a DataVersion snapshot and set to REVISION_PENDING
          const versionCount = await db.dataVersion.count({ where: { recordId: record.id } });
          await db.dataVersion.create({
            data: {
              recordId: record.id,
              payloadSnapshot: jsonVal(updatedPayload),
              versionNumber: versionCount + 1,
              changeReason: 'AI Assistant update',
              status: 'REVISION_PENDING',
            },
          });
          await db.dataRecord.update({
            where: { id: String(recordId) },
            data: { status: 'REVISION_PENDING', currentPayload: jsonVal(updatedPayload) },
          });
        } else {
          await db.dataRecord.update({
            where: { id: String(recordId) },
            data: { currentPayload: jsonVal(updatedPayload) },
          });
        }
        return { success: true, data: { recordId, updated: Object.keys(data as Record<string, unknown>) } };
      }

      case 'delete_record': {
        const record = await db.dataRecord.findUnique({ where: { id: String(args.recordId) } });
        if (!record) return { success: false, error: 'Record not found' };
        if (record.status !== 'DRAFT') return { success: false, error: 'Only DRAFT records can be deleted' };
        await db.dataRecord.delete({ where: { id: String(args.recordId) } });
        return { success: true, data: { deleted: true } };
      }

      case 'submit_for_approval': {
        const record = await db.dataRecord.findUnique({ where: { id: String(args.recordId) } });
        if (!record) return { success: false, error: 'Record not found' };
        if (record.status !== 'DRAFT') return { success: false, error: 'Only DRAFT records can be submitted for approval' };
        await db.dataRecord.update({ where: { id: String(args.recordId) }, data: { status: 'IN_REVIEW' } });
        return { success: true, data: { status: 'IN_REVIEW' } };
      }

      case 'approve_record': {
        const record = await db.dataRecord.findUnique({ where: { id: String(args.recordId) } });
        if (!record) return { success: false, error: 'Record not found' };
        if (record.status !== 'IN_REVIEW' && record.status !== 'REVISION_PENDING') {
          return { success: false, error: 'Record is not in review (status: ' + record.status + ')' };
        }
        await db.dataRecord.update({ where: { id: String(args.recordId) }, data: { status: 'ACTIVE' } });
        return { success: true, data: { status: 'ACTIVE' } };
      }

      case 'get_data_quality': {
        const { moduleCode, recordId } = args;
        if (recordId) {
          const scores = await db.dataQualityScore.findMany({
            where: { recordId: String(recordId) },
          });
          return { success: true, data: scores };
        }
        const where: Record<string, unknown> = {};
        if (moduleCode) {
          const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
          if (mod) where.moduleId = mod.id;
        }
        const scores = await db.dataQualityScore.findMany({ where, take: 20, orderBy: { score: 'asc' } });
        return { success: true, data: scores };
      }

      case 'list_modules': {
        const modules = await db.metaModule.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
        return { success: true, data: modules.map(m => ({ code: m.moduleCode, name: m.moduleName, entityType: m.entityType })) };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
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

        // ── Tool call processing ──────────────────────────────────────
        // After the AI generates its response, check for [TOOL_CALL:...] patterns.
        // If found, execute the tool calls and generate a summary response.

        const toolCallRegex = /\[TOOL_CALL:(\w+)\((.+?\))\]/g;
        let match: RegExpExecArray | null;
        const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

        while ((match = toolCallRegex.exec(fullResponse)) !== null) {
          try {
            const toolName = match[1];
            const argsStr = match[2];
            const args = JSON.parse(argsStr);
            toolCalls.push({ name: toolName, args });
          } catch {
            // Invalid tool call format, skip
          }
        }

        if (toolCalls.length > 0) {
          // Strip tool call patterns from the displayed response
          const cleanedResponse = fullResponse.replace(/\[TOOL_CALL:\w+\(.+?\)\]/g, '').trim();

          // Execute tool calls
          const toolResults: Array<{ name: string; result: unknown }> = [];
          for (const tc of toolCalls) {
            const result = await executeToolCall(tc.name, tc.args, tokenPayload.companyId, tokenPayload.userId);
            toolResults.push({ name: tc.name, result });
          }

          // Send tool results as an event so the frontend can display them
          send({ type: 'tool_result', toolCalls, toolResults });

          // Generate a follow-up summary response based on tool results
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
              fullResponse = cleanedResponse + '\n\n' + summaryResult.fullResponse;
              tokensUsed += summaryResult.tokensUsed;
            } else {
              // Demo mode: generate a simple summary
              const demoSummary = generateToolResultSummary(toolResults);
              fullResponse = cleanedResponse + '\n\n' + demoSummary;
              const chunkSize = 8;
              for (let i = 0; i < demoSummary.length; i += chunkSize) {
                const chunk = demoSummary.slice(i, i + chunkSize);
                send({ type: 'delta', content: chunk });
                await new Promise(r => setTimeout(r, 12));
              }
            }
          } catch (summaryError) {
            console.error('AI summary generation error:', summaryError);
            // Fall back to a raw tool result display
            const fallbackSummary = generateToolResultSummary(toolResults);
            fullResponse = cleanedResponse + '\n\n' + fallbackSummary;
            const chunkSize = 8;
            for (let i = 0; i < fallbackSummary.length; i += chunkSize) {
              const chunk = fallbackSummary.slice(i, i + chunkSize);
              send({ type: 'delta', content: chunk });
              await new Promise(r => setTimeout(r, 12));
            }
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

// ── Tool result summary generator (fallback when AI is not configured) ──

function generateToolResultSummary(
  toolResults: Array<{ name: string; result: unknown }>,
): string {
  const lines: string[] = [];

  for (const tr of toolResults) {
    const result = tr.result as { success?: boolean; data?: unknown; error?: string } | undefined;
    if (!result) {
      lines.push(`**${tr.name}**: No result returned.`);
      continue;
    }

    if (result.success) {
      switch (tr.name) {
        case 'search_records': {
          const records = result.data as Array<Record<string, unknown>> | undefined;
          if (!records || records.length === 0) {
            lines.push('**Search Results**: No records found matching your criteria.');
          } else {
            lines.push(`**Search Results**: Found **${records.length}** record(s):`);
            for (const r of records.slice(0, 10)) {
              const payload = (r.currentPayload as Record<string, unknown>) || r;
              const name = String(payload.name || payload.recordName || r.id || 'Unknown');
              const status = String(r.status || '');
              lines.push(`- **${name}** (${status}) — ID: \`${r.id}\``);
            }
          }
          break;
        }
        case 'get_record': {
          const record = result.data as Record<string, unknown> | undefined;
          if (record) {
            const payload = (record.currentPayload as Record<string, unknown>) || {};
            lines.push('**Record Details**:');
            lines.push(`- **ID**: ${record.id}`);
            lines.push(`- **Status**: ${record.status}`);
            lines.push(`- **Version**: ${record.version}`);
            lines.push(`- **Data**: ${JSON.stringify(payload, null, 2)}`);
          }
          break;
        }
        case 'create_record': {
          const record = result.data as Record<string, unknown> | undefined;
          lines.push(`**Record Created** ✅`);
          if (record) {
            lines.push(`- **ID**: \`${record.id}\``);
            lines.push(`- **Status**: DRAFT`);
          }
          break;
        }
        case 'update_record': {
          const data = result.data as { recordId?: string; updated?: string[] } | undefined;
          lines.push(`**Record Updated** ✅`);
          if (data) {
            lines.push(`- **ID**: \`${data.recordId}\``);
            lines.push(`- **Updated fields**: ${data.updated?.join(', ')}`);
          }
          break;
        }
        case 'delete_record': {
          lines.push('**Record Deleted** ✅');
          break;
        }
        case 'submit_for_approval': {
          const data = result.data as { status?: string } | undefined;
          lines.push(`**Record Submitted for Approval** ✅`);
          if (data) lines.push(`- **New Status**: ${data.status}`);
          break;
        }
        case 'approve_record': {
          const data = result.data as { status?: string } | undefined;
          lines.push(`**Record Approved** ✅`);
          if (data) lines.push(`- **New Status**: ${data.status}`);
          break;
        }
        case 'get_data_quality': {
          const scores = result.data as Array<Record<string, unknown>> | undefined;
          if (!scores || scores.length === 0) {
            lines.push('**Data Quality**: No quality scores found.');
          } else {
            lines.push('**Data Quality Scores**:');
            for (const s of scores) {
              lines.push(`- ${s.metricType}: **${s.score}**${s.message ? ` — ${s.message}` : ''}`);
            }
          }
          break;
        }
        case 'list_modules': {
          const modules = result.data as Array<{ code: string; name: string; entityType: string }> | undefined;
          if (!modules || modules.length === 0) {
            lines.push('**Modules**: No modules found.');
          } else {
            lines.push(`**Available Modules** (${modules.length}):`);
            for (const m of modules) {
              lines.push(`- **${m.name}** (\`${m.code}\`) — ${m.entityType}`);
            }
          }
          break;
        }
        default:
          lines.push(`**${tr.name}**: ${JSON.stringify(result.data, null, 2)}`);
      }
    } else {
      lines.push(`**${tr.name}**: ❌ ${result.error || 'Unknown error'}`);
    }
  }

  return lines.join('\n');
}
