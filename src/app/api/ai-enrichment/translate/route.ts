// ============================================================================
// AI Translation API — Stibo-like AI Translation for Descriptions
//
// POST endpoint that translates text from one language to another using LLM.
// Uses the z-ai-web-dev-sdk (or configured provider) for translation.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, type AIProvider } from '@/lib/ai';
import { logAudit, AuditAction } from '@/lib/audit';
import { rateLimitByCategory } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ─── Multi-provider AI call ─────────────────────────────────────────────

interface AIResponse {
  content: string;
  tokensUsed: number;
}

async function callAIForTranslation(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<AIResponse> {
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
        content: response?.choices?.[0]?.message?.content || '',
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
        content: data?.candidates?.[0]?.content?.parts?.[0]?.text || '',
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
        content: data?.choices?.[0]?.message?.content || '',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }

    case 'custom':
    case 'azure-openai': {
      const isAzure = provider === 'azure-openai';
      const url = isAzure
        ? `${config.baseUrl}/openai/deployments/${config.model}/chat/completions?api-version=2024-06-01`
        : `${config.baseUrl}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isAzure) headers['api-key'] = config.apiKey;
      else headers['Authorization'] = `Bearer ${config.apiKey}`;
      if (config.customHeaders) Object.assign(headers, config.customHeaders);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: isAzure ? undefined : config.model, messages, max_tokens: config.maxTokens, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`${provider} API error (${res.status})`);
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || '',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

// ─── Language Name Map ──────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  id: 'Indonesian (Bahasa Indonesia)',
  en: 'English',
  ms: 'Malay (Bahasa Melayu)',
  zh: 'Chinese (Mandarin)',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  vi: 'Vietnamese',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  ar: 'Arabic',
  hi: 'Hindi',
};

// ─── POST Handler ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Check ai:write permission
    const hasAiWrite = hasPermission(tokenPayload.roles, 'ai:write');
    if (!hasAiWrite) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: ai:write' },
        { status: 403 },
      );
    }

    // 3. Rate limit
    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    // 4. Parse request body
    const body = await request.json();
    const {
      text,
      sourceLang = 'id',
      targetLang = 'en',
      recordId,
    } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required and must be a string' }, { status: 400 });
    }

    if (text.length > 5000) {
      return NextResponse.json({ error: 'Text is too long (max 5000 characters)' }, { status: 400 });
    }

    // 5. Get AI provider config
    const aiConfig = await getTenantAIProviderConfig(tokenPayload.companyId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: 'AI service is not configured. Please configure AI settings first.' },
        { status: 503 },
      );
    }

    // 6. Build translation prompt
    const sourceName = LANGUAGE_NAMES[sourceLang] || sourceLang;
    const targetName = LANGUAGE_NAMES[targetLang] || targetLang;

    const systemPrompt = `You are a professional translator for product descriptions in a Master Data Management (MDM) system. 
Translate the given text from ${sourceName} to ${targetName}. 

Rules:
- Preserve all product-specific terminology (brand names, model numbers, sizes)
- Keep the same tone and style as the original
- If the text contains technical specifications, translate them accurately
- If a term has no direct translation, keep the original term
- Return ONLY the translated text, no explanations or commentary
- Maintain any formatting (line breaks, bullet points) from the original`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];

    // 7. Call AI provider
    let result: AIResponse;
    try {
      result = await callAIForTranslation(aiConfig.provider, aiConfig, messages);
    } catch (aiError: unknown) {
      const msg = aiError instanceof Error ? aiError.message : 'AI provider error';
      console.error('AI Translation error:', msg);
      return NextResponse.json(
        { error: `Translation failed: ${msg}` },
        { status: 502 },
      );
    }

    const translatedText = result.content.trim();

    if (!translatedText) {
      return NextResponse.json(
        { error: 'AI returned empty translation. Please try again.' },
        { status: 502 },
      );
    }

    // 8. Log audit trail
    await logAudit({
      action: AuditAction.AI_TRANSLATE,
      userId: tokenPayload.userId,
      companyId: tokenPayload.companyId,
      entityType: recordId ? 'DataRecord' : undefined,
      entityId: recordId || undefined,
      details: {
        sourceLang,
        targetLang,
        originalLength: text.length,
        translatedLength: translatedText.length,
        tokensUsed: result.tokensUsed,
        modelUsed: aiConfig.model,
      },
    });

    // 9. Return result
    return NextResponse.json({
      translatedText,
      sourceLang,
      targetLang,
      originalText: text,
      tokensUsed: result.tokensUsed,
      modelUsed: aiConfig.model,
      provider: aiConfig.provider,
    });
  } catch (error) {
    console.error('AI Translation API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
