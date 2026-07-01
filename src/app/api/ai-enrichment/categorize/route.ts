// ============================================================================
// AI Auto-Categorization from Images API — Stibo-like VLM Analysis
//
// POST endpoint that analyzes a product image using VLM (Vision Language Model)
// to auto-detect category, sub-category, brand, color, product type,
// suggested tags, and generate descriptions.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, type AIProvider } from '@/lib/ai';
import { logAudit, AuditAction } from '@/lib/audit';
import { rateLimitByCategory } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Types ──────────────────────────────────────────────────────────────

interface CategorizationResult {
  category: string;
  subCategory: string;
  brand: string;
  color: string;
  productType: string;
  suggestedTags: string[];
  description: {
    en: string;
    id: string;
  };
}

// ─── VLM call via z-ai-web-dev-sdk ─────────────────────────────────────

async function callVLM(
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number },
  imageUrl: string,
  prompt: string,
): Promise<{ content: string; tokensUsed: number }> {
  // Use z-ai-web-dev-sdk VLM (createVision) for image analysis
  const ZAIModule = await import('z-ai-web-dev-sdk');
  const ZAIClass = ZAIModule.default;
  interface ZAIConstructor {
    new (c: { baseUrl: string; apiKey: string }): {
      chat: {
        completions: {
          createVision: (opts: Record<string, unknown>) => Promise<{
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

  const response = await zai.chat.completions.createVision({
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: config.maxTokens,
    temperature: config.temperature,
  });

  return {
    content: response?.choices?.[0]?.message?.content || '',
    tokensUsed: response?.usage?.total_tokens || 0,
  };
}

// ─── Text-only LLM call (fallback for non-zai providers) ──────────────

async function callTextLLM(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<{ content: string; tokensUsed: number }> {
  switch (provider) {
    case 'zai': {
      // For zai provider, we already handle VLM above; this is fallback
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
      // OpenAI supports vision via chat completions with image_url content
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: config.maxTokens, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`OpenAI API error (${res.status})`);
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || '',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }
    default: {
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
        content: data?.choices?.[0]?.message?.content || '',
        tokensUsed: data?.usage?.total_tokens || 0,
      };
    }
  }
}

// ─── VLM call for non-zai providers (OpenAI/Gemini vision) ────────────

async function callVisionLLM(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  imageUrl: string,
  prompt: string,
): Promise<{ content: string; tokensUsed: number }> {
  // For zai provider, use the dedicated VLM method
  if (provider === 'zai') {
    return callVLM(config, imageUrl, prompt);
  }

  // For OpenAI-compatible providers, use chat completions with image_url content
  if (provider === 'openai' || provider === 'custom') {
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ];
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` };
    if (config.customHeaders) Object.assign(headers, config.customHeaders);
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: provider === 'openai' ? 'gpt-4o' : config.model, messages, max_tokens: config.maxTokens, temperature: config.temperature }),
    });
    if (!res.ok) throw new Error(`${provider} Vision API error (${res.status})`);
    const data = await res.json();
    return {
      content: data?.choices?.[0]?.message?.content || '',
      tokensUsed: data?.usage?.total_tokens || 0,
    };
  }

  // For Gemini, use the multimodal content format
  if (provider === 'gemini') {
    const url = `${config.baseUrl}/models/gemini-2.0-flash:generateContent?key=${config.apiKey}`;
    const body = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { file_data: { mime_type: 'image/jpeg', file_uri: imageUrl } },
        ],
      }],
      generationConfig: { maxOutputTokens: config.maxTokens, temperature: config.temperature },
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Gemini Vision API error (${res.status})`);
    const data = await res.json();
    return {
      content: data?.candidates?.[0]?.content?.parts?.[0]?.text || '',
      tokensUsed: data?.usageMetadata?.totalTokenCount || 0,
    };
  }

  // Fallback: use text-only LLM (image URL included in prompt text)
  const fallbackPrompt = `${prompt}\n\n[Image URL: ${imageUrl}]\n\nNote: The image URL is provided above. If you cannot see the image, analyze based on the URL context and provide your best assessment.`;
  return callTextLLM(provider, config, [
    { role: 'system', content: 'You are a product categorization AI assistant for a retail MDM system.' },
    { role: 'user', content: fallbackPrompt },
  ]);
}

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
    const { imageUrl, recordId } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: 'imageUrl is required and must be a string' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'imageUrl must be a valid URL' }, { status: 400 });
    }

    // 5. Get AI provider config
    const aiConfig = await getTenantAIProviderConfig(tokenPayload.companyId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: 'AI service is not configured. Please configure AI settings first.' },
        { status: 503 },
      );
    }

    // 6. Build categorization prompt
    const categorizationPrompt = `Analyze this product image and provide a detailed categorization for a retail Master Data Management (MDM) system.

Respond ONLY with a valid JSON object (no markdown, no code blocks, no explanation) with the following structure:

{
  "category": "One of: Sepatu, Tas, Apparel, Aksesoris, Sports Equipment, Food & Beverage, Beauty, Home & Living",
  "subCategory": "A more specific sub-category (e.g., Running Shoes, Backpack, T-Shirt, Watch, etc.)",
  "brand": "The brand name visible in the image (e.g., Nike, Adidas, Puma, etc.) or 'Unknown' if not identifiable",
  "color": "Primary color(s) of the product (e.g., Black, White/Red, Navy Blue, etc.)",
  "productType": "Specific product type (e.g., Running Shoe, Crossbody Bag, Graphic Tee, Digital Watch, etc.)",
  "suggestedTags": ["array", "of", "5-10", "relevant", "tags"],
  "description": {
    "en": "A detailed English product description (2-3 sentences) suitable for e-commerce",
    "id": "Deskripsi produk dalam Bahasa Indonesia (2-3 kalimat) yang cocok untuk e-commerce"
  }
}

Important rules:
- category MUST be one of the listed options
- subCategory should be specific and relevant
- If you cannot determine the brand, use "Unknown"
- Include 5-10 relevant tags for searchability
- Both descriptions should be detailed and suitable for e-commerce
- Return ONLY the JSON object, no additional text`;

    // 7. Call VLM
    let rawContent: string;
    let tokensUsed = 0;
    try {
      const vlmResult = await callVisionLLM(aiConfig.provider, aiConfig, imageUrl, categorizationPrompt);
      rawContent = vlmResult.content;
      tokensUsed = vlmResult.tokensUsed;
    } catch (aiError: unknown) {
      const msg = aiError instanceof Error ? aiError.message : 'VLM provider error';
      console.error('AI Categorization VLM error:', msg);

      // Fallback: try text-only LLM with image URL in prompt
      try {
        const fallbackPrompt = `Analyze this product based on its image URL and provide categorization data.

Image URL: ${imageUrl}

${categorizationPrompt}

Note: You may not be able to see the image directly. Use the URL context (domain, path, filename) to make your best assessment. If you truly cannot determine a value, use "Unknown".`;

        const fallbackResult = await callTextLLM(aiConfig.provider, aiConfig, [
          { role: 'system', content: 'You are a product categorization AI assistant for a retail MDM system. Always respond with valid JSON only.' },
          { role: 'user', content: fallbackPrompt },
        ]);
        rawContent = fallbackResult.content;
        tokensUsed = fallbackResult.tokensUsed;
      } catch (fallbackError: unknown) {
        const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : 'Fallback LLM error';
        return NextResponse.json(
          { error: `Categorization failed: ${msg}. Fallback also failed: ${fallbackMsg}` },
          { status: 502 },
        );
      }
    }

    // 8. Parse the VLM response as JSON
    let categorization: CategorizationResult;
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = rawContent.trim();
      // Remove markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      // Try to find JSON object in the response
      const braceStart = jsonStr.indexOf('{');
      const braceEnd = jsonStr.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd !== -1) {
        jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
      }

      categorization = JSON.parse(jsonStr);

      // Validate required fields
      if (!categorization.category) categorization.category = 'Unknown';
      if (!categorization.subCategory) categorization.subCategory = 'Unknown';
      if (!categorization.brand) categorization.brand = 'Unknown';
      if (!categorization.color) categorization.color = 'Unknown';
      if (!categorization.productType) categorization.productType = 'Unknown';
      if (!Array.isArray(categorization.suggestedTags)) categorization.suggestedTags = [];
      if (!categorization.description) {
        categorization.description = { en: '', id: '' };
      }
      if (!categorization.description.en) categorization.description.en = '';
      if (!categorization.description.id) categorization.description.id = '';
    } catch (parseError) {
      console.error('Failed to parse VLM categorization response:', parseError, 'Raw:', rawContent.substring(0, 500));
      // Return the raw content so the user can at least see what the AI said
      return NextResponse.json({
        error: 'AI returned an unparseable response. Please try again.',
        rawContent: rawContent.substring(0, 1000),
        tokensUsed,
        modelUsed: aiConfig.model,
      }, { status: 502 });
    }

    // 9. Optionally update record if recordId is provided
    let recordUpdated = false;
    if (recordId) {
      try {
        const record = await db.dataRecord.findUnique({
          where: { id: recordId },
          include: { module: { include: { fields: true } } },
        });

        if (record) {
          const { parsePayload } = await import('@/lib/parse-payload');
          const payload = parsePayload(record.currentPayload);

          // Map categorization to record fields if they exist
          const fieldMap: Record<string, string> = {
            category: 'category',
            sub_category: 'subCategory',
            subCategory: 'subCategory',
            brand: 'brand',
            color: 'color',
            product_type: 'productType',
            productType: 'productType',
            description_en: 'description.en',
            description_id: 'description.id',
            article_description: 'description.en',
            description: 'description.en',
          };

          let updated = false;
          for (const [fieldCode, valuePath] of Object.entries(fieldMap)) {
            if (payload[fieldCode] !== undefined || Object.keys(payload).includes(fieldCode)) {
              const catAny = categorization as any;
              const value = valuePath.includes('.')
                ? catAny.description?.[valuePath.split('.')[1]] || ''
                : catAny[valuePath];
              if (value && typeof value === 'string') {
                payload[fieldCode] = value;
                updated = true;
              }
            }
          }

          // Also set tags if tags field exists
          if (categorization.suggestedTags.length > 0) {
            const tagFields = ['tags', 'article_tags', 'tag'];
            for (const tf of tagFields) {
              if (Object.keys(payload).includes(tf)) {
                payload[tf] = categorization.suggestedTags.join(', ');
                updated = true;
              }
            }
          }

          if (updated) {
            await db.dataRecord.update({
              where: { id: recordId },
              data: {
                currentPayload: payload,
                status: 'IN_REVIEW',
              },
            });
            recordUpdated = true;
          }
        }
      } catch (recordError) {
        console.error('Failed to update record with categorization:', recordError);
        // Don't fail the whole request, just log the error
      }
    }

    // 10. Log audit trail
    await logAudit({
      action: AuditAction.AI_CATEGORIZE,
      userId: tokenPayload.userId,
      companyId: tokenPayload.companyId,
      entityType: recordId ? 'DataRecord' : undefined,
      entityId: recordId || undefined,
      details: {
        imageUrl: imageUrl.substring(0, 200),
        category: categorization.category,
        subCategory: categorization.subCategory,
        brand: categorization.brand,
        tokensUsed,
        modelUsed: aiConfig.model,
        recordUpdated,
      },
    });

    // 11. Return result
    return NextResponse.json({
      categorization,
      imageUrl,
      recordId,
      recordUpdated,
      tokensUsed,
      modelUsed: aiConfig.model,
      provider: aiConfig.provider,
    });
  } catch (error) {
    console.error('AI Categorization API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
