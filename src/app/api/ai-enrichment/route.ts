// @ts-nocheck
// ============================================================================
// AI Enrichment API — Stibo-like AI Features with Real LLM Calls
//
// Provides:
//   1. Auto-classification: Use LLM to suggest categories, tags, and attributes
//   2. Auto-enrichment: Use LLM to fill missing fields intelligently
//   3. Data quality scoring: Use LLM to analyze data quality and suggest improvements
//   4. Image analysis: Use VLM to analyze product images and generate descriptions
//   5. Duplicate detection: Use LLM to find potential duplicate records
//   6. Record matching: Use LLM to match related records across modules
//   7. Bulk enrichment: Process multiple records at once
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getTenantAIProviderConfig, isAIConfiguredAsync, type AIProvider } from '@/lib/ai';
import { jsonParse, jsonVal } from '@/lib/db-json';
import { logAudit, AuditAction } from '@/lib/audit';


export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnrichmentRequest {
  action: 'classify' | 'enrich' | 'quality-check' | 'image-analyze' | 'duplicate-detect' | 'match-records' | 'bulk-enrich';
  recordIds?: string[];
  moduleCode?: string;
  options?: {
    fields?: string[];
    dryRun?: boolean;
    batchSize?: number;
    threshold?: number;
  };
}

interface LLMResponse {
  content: string;
  tokensUsed: number;
  modelUsed: string;
}

// ─── Multi-provider AI call (reused from ai/chat route) ──────────────────

async function callAIProvider(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<LLMResponse> {
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
        modelUsed: config.model,
      };
    }

    case 'gemini': {
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
      return {
        content: data?.candidates?.[0]?.content?.parts?.[0]?.text || '',
        tokensUsed: data?.usageMetadata?.totalTokenCount || 0,
        modelUsed: config.model,
      };
    }

    case 'openai':
    case 'custom': {
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
      if (provider === 'custom' && config.customHeaders) {
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
        throw new Error(`${provider} API error (${res.status}): ${errBody.slice(0, 300)}`);
      }
      const data = await res.json();
      return {
        content: data?.choices?.[0]?.message?.content || '',
        tokensUsed: data?.usage?.total_tokens || 0,
        modelUsed: config.model,
      };
    }

    case 'azure-openai': {
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
        content: data?.choices?.[0]?.message?.content || '',
        tokensUsed: data?.usage?.total_tokens || 0,
        modelUsed: config.model,
      };
    }

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

// ─── VLM Image Analysis Call ────────────────────────────────────────────

async function callVLMProvider(
  provider: AIProvider,
  config: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; customHeaders?: Record<string, string> },
  prompt: string,
  imageUrl: string,
): Promise<LLMResponse> {
  // For VLM, we use the OpenAI Vision API format (works with ZAI, OpenAI, custom providers)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: unknown }> = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];

  if (provider === 'zai') {
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
      messages: messages as Array<Record<string, unknown>>,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: false,
    });
    return {
      content: response?.choices?.[0]?.message?.content || '',
      tokensUsed: response?.usage?.total_tokens || 0,
      modelUsed: config.model,
    };
  }

  // OpenAI-compatible Vision API (works with OpenAI, custom, etc.)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };
  if (provider === 'custom' && config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`VLM API error (${res.status}): ${errBody.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    content: data?.choices?.[0]?.message?.content || '',
    tokensUsed: data?.usage?.total_tokens || 0,
    modelUsed: config.model,
  };
}

// ─── Helper: safe JSON parse from LLM response ─────────────────────────

function extractJSON<T>(text: string): T | null {
  // Try to extract JSON from the LLM response (may be wrapped in markdown code block)
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ||
                    text.match(/\{[\s\S]*\}/) ||
                    text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]) as T;
  } catch {
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      return null;
    }
  }
}

// ─── POST /api/ai-enrichment ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasRead = hasPermission(tokenPayload.roles, 'data:read');
    if (!hasRead) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const hasAIWrite = hasPermission(tokenPayload.roles, 'ai:write');
    const body: EnrichmentRequest = await request.json();
    const { action } = body;

    // Actions that require ai:write
    const writeActions = ['enrich', 'bulk-enrich', 'duplicate-detect', 'match-records'];
    if (writeActions.includes(action) && !hasAIWrite) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: ai:write' }, { status: 403 });
    }

    // Check if AI is configured
    const aiConfigured = await isAIConfiguredAsync();
    const companyId = tokenPayload.companyId;

    switch (action) {
      case 'classify':
        return await handleClassify(body, companyId, aiConfigured);
      case 'enrich':
        return await handleEnrich(body, companyId, aiConfigured);
      case 'quality-check':
        return await handleQualityCheck(body, companyId, aiConfigured);
      case 'image-analyze':
        return await handleImageAnalyze(body, companyId, aiConfigured);
      case 'duplicate-detect':
        return await handleDuplicateDetect(body, companyId, aiConfigured);
      case 'match-records':
        return await handleMatchRecords(body, companyId, aiConfigured);
      case 'bulk-enrich':
        return await handleBulkEnrich(body, companyId, aiConfigured);
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('AI enrichment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Auto-Classification ────────────────────────────────────────────────────

async function handleClassify(body: EnrichmentRequest, companyId: string, aiConfigured: boolean) {
  const { recordIds } = body;
  if (!recordIds || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds are required' }, { status: 400 });
  }

  const records = await db.dataRecord.findMany({
    where: { id: { in: recordIds }, companyId },
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
      images: { select: { id: true, fileName: true } },
    },
  });

  const results = [];
  let totalTokens = 0;
  let modelUsed = 'rule-based';

  for (const record of records) {
    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};

    if (aiConfigured) {
      try {
        const config = await getTenantAIProviderConfig(companyId);
        const prompt = buildClassifyPrompt(payload, record.module.moduleCode, record.module.moduleName);

        const llmResult = await callAIProvider(config.provider, config, [
          { role: 'system', content: 'You are an expert MDM data classification AI. Analyze the record data and suggest appropriate categories, tags, and attributes. Always respond with valid JSON only, no markdown.' },
          { role: 'user', content: prompt },
        ]);

        totalTokens += llmResult.tokensUsed;
        modelUsed = llmResult.modelUsed;

        const suggestions = extractJSON<Array<{ field: string; suggestedValue: string; confidence: number; source: string }>>(llmResult.content);

        results.push({
          recordId: record.id,
          recordCode: record.recordCode || record.id,
          moduleCode: record.module.moduleCode,
          suggestions: suggestions || [{
            field: 'category',
            suggestedValue: 'Uncategorized',
            confidence: 0.3,
            source: 'llm-parse-failed',
          }],
          rawLLMResponse: suggestions ? undefined : llmResult.content,
        });
      } catch (err) {
        console.error('LLM classify error, falling back to rule-based:', err);
        const suggestions = generateClassificationSuggestions(payload, record.module.moduleCode);
        results.push({
          recordId: record.id,
          recordCode: record.recordCode || record.id,
          moduleCode: record.module.moduleCode,
          suggestions,
          fallback: true,
        });
      }
    } else {
      const suggestions = generateClassificationSuggestions(payload, record.module.moduleCode);
      results.push({
        recordId: record.id,
        recordCode: record.recordCode || record.id,
        moduleCode: record.module.moduleCode,
        suggestions,
        fallback: true,
      });
    }
  }

  // Audit log
  try {
    await logAudit({
      action: AuditAction.AI_CLASSIFY,
      entityType: 'ai-enrichment',
      description: `AI classification run on ${records.length} records. Tokens: ${totalTokens}`,
      userId: 'system',
    });
  } catch { /* ignore */ }

  return NextResponse.json({ results, modelUsed, totalTokens });
}

function buildClassifyPrompt(payload: Record<string, unknown>, moduleCode: string, moduleName: string): string {
  return `Analyze this ${moduleName} (${moduleCode}) record and suggest appropriate classifications.

Record data:
${JSON.stringify(payload, null, 2)}

Please suggest classifications as a JSON array with this exact format:
[
  {
    "field": "category",
    "suggestedValue": "suggested category name",
    "confidence": 0.85,
    "source": "llm-analysis"
  },
  {
    "field": "tags",
    "suggestedValue": "tag1, tag2, tag3",
    "confidence": 0.80,
    "source": "llm-analysis"
  },
  {
    "field": "attributes",
    "suggestedValue": "suggested attribute values",
    "confidence": 0.75,
    "source": "llm-analysis"
  }
]

Consider:
- The record's existing data (brand, name, description, etc.)
- Industry-standard classification for this type of record
- Common attributes that should be populated
- Relevant tags for searchability

Only suggest fields that are missing or could be improved. Return ONLY the JSON array, no other text.`;
}

// ─── Auto-Enrichment ────────────────────────────────────────────────────────

async function handleEnrich(body: EnrichmentRequest, companyId: string, aiConfigured: boolean) {
  const { recordIds, options } = body;
  const dryRun = options?.dryRun ?? true;

  if (!recordIds || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds are required' }, { status: 400 });
  }

  const records = await db.dataRecord.findMany({
    where: { id: { in: recordIds }, companyId },
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
      images: { select: { id: true, fileName: true } },
    },
  });

  const results = [];
  let totalTokens = 0;
  let modelUsed = 'rule-based';

  for (const record of records) {
    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};

    if (aiConfigured) {
      try {
        const config = await getTenantAIProviderConfig(companyId);
        const prompt = buildEnrichPrompt(payload, record.module.moduleCode, record.module.moduleName);

        const llmResult = await callAIProvider(config.provider, config, [
          { role: 'system', content: 'You are an expert MDM data enrichment AI. Fill in missing or incomplete fields based on available context and industry knowledge. Always respond with valid JSON only, no markdown.' },
          { role: 'user', content: prompt },
        ]);

        totalTokens += llmResult.tokensUsed;
        modelUsed = llmResult.modelUsed;

        const enrichmentData = extractJSON<{ filledFields: Record<string, unknown>; confidence: number; reasoning: string }>(llmResult.content);

        const filledFields = enrichmentData?.filledFields || {};
        const confidence = enrichmentData?.confidence || 0.5;

        // Create AiOutput for review if not dry run
        if (!dryRun && Object.keys(filledFields).length > 0) {
          const enrichedPayload = { ...payload, ...filledFields };
          try {
            await db.aiOutput.create({
              data: {
                promptId: 'ai-enrichment',
                recordId: record.id,
                outputAttribute: 'currentPayload',
                outputValue: jsonVal(enrichedPayload),
                status: 'PENDING_REVIEW',
                modelUsed: llmResult.modelUsed,
                tokensUsed: llmResult.tokensUsed,
              },
            });
          } catch {
            // AiOutput may not have promptId FK — skip
          }
        }

        results.push({
          recordId: record.id,
          recordCode: record.recordCode || record.id,
          missingFields: Object.keys(filledFields),
          filledFields,
          confidence,
          status: dryRun ? 'preview' : 'pending_review',
          reasoning: enrichmentData?.reasoning,
        });
      } catch (err) {
        console.error('LLM enrich error, falling back to rule-based:', err);
        const enrichmentData = generateEnrichmentData(payload, record.module.moduleCode);
        results.push({
          recordId: record.id,
          recordCode: record.recordCode || record.id,
          ...enrichmentData,
          status: dryRun ? 'preview' : 'pending_review',
          fallback: true,
        });
      }
    } else {
      const enrichmentData = generateEnrichmentData(payload, record.module.moduleCode);
      if (!dryRun && Object.keys(enrichmentData.filledFields).length > 0) {
        const enrichedPayload = { ...payload, ...enrichmentData.filledFields };
        try {
          await db.aiOutput.create({
            data: {
              promptId: 'auto-enrichment',
              recordId: record.id,
              outputAttribute: 'currentPayload',
              outputValue: jsonVal(enrichedPayload),
              status: 'PENDING_REVIEW',
              modelUsed: 'rule-based-enrichment',
              tokensUsed: 0,
            },
          });
        } catch { /* skip */ }
      }
      results.push({
        recordId: record.id,
        recordCode: record.recordCode || record.id,
        ...enrichmentData,
        status: dryRun ? 'preview' : 'pending_review',
        fallback: true,
      });
    }
  }

  return NextResponse.json({ results, dryRun, modelUsed, totalTokens });
}

function buildEnrichPrompt(payload: Record<string, unknown>, moduleCode: string, moduleName: string): string {
  // Find empty/null fields
  const emptyFields = Object.entries(payload)
    .filter(([, v]) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0))
    .map(([k]) => k);

  return `Analyze this ${moduleName} (${moduleCode}) record and suggest enrichments for missing or incomplete fields.

Current record data:
${JSON.stringify(payload, null, 2)}

Missing/empty fields: ${emptyFields.join(', ') || 'none detected'}

Please provide enrichment suggestions as JSON with this exact format:
{
  "filledFields": {
    "field_name": "suggested_value",
    "another_field": "suggested_value"
  },
  "confidence": 0.85,
  "reasoning": "Brief explanation of why these values were suggested"
}

Guidelines:
- Only fill fields that are genuinely missing or empty
- Use industry-standard default values when specific data isn't available
- Consider the context from existing populated fields
- For pricing/currency, use appropriate defaults for the region (IDR for Indonesia)
- For status fields, use "DRAFT" as default
- Be conservative - only suggest values you're confident about

Return ONLY the JSON object, no other text.`;
}

// ─── Data Quality Check ─────────────────────────────────────────────────────

async function handleQualityCheck(body: EnrichmentRequest, companyId: string, aiConfigured: boolean) {
  const { recordIds, moduleCode } = body;

  const where: Record<string, unknown> = { companyId };
  if (recordIds && recordIds.length > 0) {
    where.id = { in: recordIds };
  }
  if (moduleCode) {
    const mod = await db.metaModule.findFirst({ where: { moduleCode } });
    if (mod) where.moduleId = mod.id;
  }

  const records = await db.dataRecord.findMany({
    where,
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
    },
    take: 50,
  });

  const results = [];
  let totalTokens = 0;
  let modelUsed = 'rule-based';

  if (aiConfigured && records.length <= 10) {
    // Use LLM for quality check on small batches (up to 10 records)
    try {
      const config = await getTenantAIProviderConfig(companyId);
      const recordsSummary = records.map(r => ({
        id: r.id,
        recordCode: r.recordCode,
        moduleCode: r.module.moduleCode,
        payload: jsonParse<Record<string, unknown>>(r.currentPayload) || {},
      }));

      const prompt = `Analyze these ${records.length} master data records for quality issues.

Records:
${JSON.stringify(recordsSummary, null, 2)}

For each record, identify quality issues and provide a quality score. Return JSON with this exact format:
{
  "records": [
    {
      "recordId": "record-id",
      "recordCode": "record-code",
      "moduleCode": "module-code",
      "suggestedScore": 85,
      "issues": [
        {
          "field": "field_name",
          "type": "missing|invalid|inconsistent|outdated",
          "severity": "critical|warning|info",
          "message": "Description of the issue",
          "suggestion": "How to fix it"
        }
      ]
    }
  ]
}

Quality criteria:
- Completeness: Are required fields populated?
- Validity: Do values follow expected formats and ranges?
- Consistency: Are values consistent across related fields?
- Timeliness: Is the data up to date?
- Uniqueness: Are there potential duplicates?

Return ONLY the JSON object, no other text.`;

      const llmResult = await callAIProvider(config.provider, config, [
        { role: 'system', content: 'You are a master data quality expert AI. Analyze records for quality issues and provide actionable suggestions. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ]);

      totalTokens += llmResult.tokensUsed;
      modelUsed = llmResult.modelUsed;

      const analysis = extractJSON<{ records: Array<{
        recordId: string;
        recordCode: string;
        moduleCode: string;
        suggestedScore: number;
        issues: Array<{ field: string; type: string; severity: string; message: string; suggestion: string }>;
      }> }>(llmResult.content);

      if (analysis?.records) {
        for (const r of analysis.records) {
          results.push({
            recordId: r.recordId,
            recordCode: r.recordCode,
            moduleCode: r.moduleCode,
            suggestedScore: r.suggestedScore,
            issues: r.issues,
            suggestions: r.issues.map((issue) => ({
              field: issue.field,
              type: issue.type,
              suggestion: issue.suggestion,
              severity: issue.severity,
            })),
          });
        }
      } else {
        // LLM returned unparseable response, fall back to rule-based for all records
        for (const record of records) {
          const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
          const issues = identifyQualityIssues(payload, record.module.moduleCode);
          const overallScore = calculateQualityScore(payload, issues);
          results.push({
            recordId: record.id,
            recordCode: record.recordCode || record.id,
            moduleCode: record.module.moduleCode,
            suggestedScore: overallScore,
            issues,
            suggestions: issues.map((issue) => ({
              field: issue.field,
              type: issue.type,
              suggestion: issue.suggestion,
              severity: issue.severity,
            })),
            rawLLMResponse: llmResult.content,
            fallback: true,
          });
        }
      }
    } catch (err) {
      console.error('LLM quality check error, falling back to rule-based:', err);
      for (const record of records) {
        const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
        const issues = identifyQualityIssues(payload, record.module.moduleCode);
        const overallScore = calculateQualityScore(payload, issues);
        results.push({
          recordId: record.id,
          recordCode: record.recordCode || record.id,
          moduleCode: record.module.moduleCode,
          suggestedScore: overallScore,
          issues,
          suggestions: issues.map((issue) => ({
            field: issue.field,
            type: issue.type,
            suggestion: issue.suggestion,
            severity: issue.severity,
          })),
          fallback: true,
        });
      }
    }
  } else {
    // Rule-based for large batches or when AI not configured
    for (const record of records) {
      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      const issues = identifyQualityIssues(payload, record.module.moduleCode);
      const overallScore = calculateQualityScore(payload, issues);
      results.push({
        recordId: record.id,
        recordCode: record.recordCode || record.id,
        moduleCode: record.module.moduleCode,
        suggestedScore: overallScore,
        issues,
        suggestions: issues.map((issue) => ({
          field: issue.field,
          type: issue.type,
          suggestion: issue.suggestion,
          severity: issue.severity,
        })),
        fallback: !aiConfigured,
      });
    }
  }

  return NextResponse.json({ results, modelUsed, totalTokens });
}

// ─── Image Analysis (VLM) ──────────────────────────────────────────────────

async function handleImageAnalyze(body: EnrichmentRequest, companyId: string, aiConfigured: boolean) {
  const { recordIds } = body;
  if (!recordIds || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds are required' }, { status: 400 });
  }

  const records = await db.dataRecord.findMany({
    where: { id: { in: recordIds }, companyId },
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
      images: { select: { id: true, fileName: true, altText: true, r2Key: true } },
    },
  });

  const results = [];
  let totalTokens = 0;
  let modelUsed = 'rule-based';

  for (const record of records) {
    if (record.images.length === 0) continue;

    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
    const imageSuggestions = [];

    for (const img of record.images) {
      if (aiConfigured) {
        try {
          const config = await getTenantAIProviderConfig(companyId);
          // Build image URL - prefer R2 proxy, fallback to filename
          let imageUrl = `/api/r2-image?key=${encodeURIComponent(img.r2Key || img.fileName)}`;
          // For VLM, we need an absolute URL - use a descriptive prompt based on context instead
          // since VLM may not be able to access internal URLs

          // Try VLM first if we have an accessible image URL
          if (img.r2Key) {
            try {
              const vlmPrompt = `Analyze this product image for an e-commerce MDM system. The product is: ${JSON.stringify({ brand: payload.brand || payload.Brand, name: payload.name || payload.Name || payload.itemName, category: payload.category || payload.Category })}

Generate:
1. A concise alt text for accessibility (max 125 chars)
2. A detailed product description (2-3 sentences)
3. SEO keywords (5-8 keywords)
4. Image quality assessment (good/acceptable/poor)
5. Suggested image tags

Respond with JSON only:
{
  "altText": "...",
  "description": "...",
  "keywords": ["..."],
  "quality": "good|acceptable|poor",
  "tags": ["..."]
}`;

              const llmResult = await callVLMProvider(config.provider, config, vlmPrompt, imageUrl);
              totalTokens += llmResult.tokensUsed;
              modelUsed = llmResult.modelUsed;

              const analysis = extractJSON<{
                altText: string;
                description: string;
                keywords: string[];
                quality: string;
                tags: string[];
              }>(llmResult.content);

              imageSuggestions.push({
                imageId: img.id,
                fileName: img.fileName,
                currentAltText: img.altText,
                suggestedAltText: analysis?.altText || generateImageAltText(img.fileName, payload),
                suggestedDescription: analysis?.description || generateImageDescription(img.fileName, payload),
                suggestedKeywords: analysis?.keywords || generateImageKeywords(payload),
                imageQuality: analysis?.quality || 'unknown',
                suggestedTags: analysis?.tags || [],
                vlmAnalyzed: true,
              });
              continue;
            } catch (vlmErr) {
              console.error('VLM analysis failed, falling back to text-based:', vlmErr);
            }
          }

          // Fallback to text-based LLM analysis (no image input)
          const textPrompt = `Generate image metadata for a product image in an e-commerce MDM system.

Product info:
${JSON.stringify(payload, null, 2)}

Image filename: ${img.fileName}

Generate:
1. Alt text for accessibility (max 125 chars)
2. Product image description (2-3 sentences)
3. SEO keywords (5-8 keywords)

Respond with JSON only:
{
  "altText": "...",
  "description": "...",
  "keywords": ["..."]
}`;

          const llmResult = await callAIProvider(config.provider, config, [
            { role: 'system', content: 'You are an expert e-commerce image metadata AI. Generate accurate alt text, descriptions, and keywords. Always respond with valid JSON only.' },
            { role: 'user', content: textPrompt },
          ]);

          totalTokens += llmResult.tokensUsed;
          modelUsed = llmResult.modelUsed;

          const analysis = extractJSON<{
            altText: string;
            description: string;
            keywords: string[];
          }>(llmResult.content);

          imageSuggestions.push({
            imageId: img.id,
            fileName: img.fileName,
            currentAltText: img.altText,
            suggestedAltText: analysis?.altText || generateImageAltText(img.fileName, payload),
            suggestedDescription: analysis?.description || generateImageDescription(img.fileName, payload),
            suggestedKeywords: analysis?.keywords || generateImageKeywords(payload),
            vlmAnalyzed: false,
          });
        } catch (err) {
          console.error('LLM image analysis error, falling back to rule-based:', err);
          imageSuggestions.push({
            imageId: img.id,
            fileName: img.fileName,
            currentAltText: img.altText,
            suggestedAltText: generateImageAltText(img.fileName, payload),
            suggestedDescription: generateImageDescription(img.fileName, payload),
            suggestedKeywords: generateImageKeywords(payload),
            fallback: true,
          });
        }
      } else {
        imageSuggestions.push({
          imageId: img.id,
          fileName: img.fileName,
          currentAltText: img.altText,
          suggestedAltText: generateImageAltText(img.fileName, payload),
          suggestedDescription: generateImageDescription(img.fileName, payload),
          suggestedKeywords: generateImageKeywords(payload),
          fallback: true,
        });
      }
    }

    results.push({
      recordId: record.id,
      recordCode: record.recordCode || record.id,
      moduleCode: record.module.moduleCode,
      images: imageSuggestions,
    });
  }

  return NextResponse.json({ results, modelUsed, totalTokens });
}

// ─── Duplicate Detection ────────────────────────────────────────────────────

async function handleDuplicateDetect(body: EnrichmentRequest, companyId: string, aiConfigured: boolean) {
  const { moduleCode, recordIds, options } = body;
  const threshold = options?.threshold ?? 0.7;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { companyId };
  if (recordIds && recordIds.length > 0) {
    (where as Record<string, unknown>).id = { in: recordIds };
  }
  if (moduleCode) {
    const mod = await db.metaModule.findFirst({ where: { moduleCode } });
    if (mod) where.moduleId = mod.id;
  }

  const records = await db.dataRecord.findMany({
    where,
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
    },
    take: 100,
    orderBy: { updatedAt: 'desc' },
  });

  let totalTokens = 0;
  let modelUsed = 'rule-based';
  let duplicates: Array<{
    record1: { id: string; recordCode: string; moduleCode: string };
    record2: { id: string; recordCode: string; moduleCode: string };
    similarity: number;
    matchingFields: string[];
    reason: string;
  }> = [];

  if (aiConfigured && records.length >= 2 && records.length <= 30) {
    try {
      const config = await getTenantAIProviderConfig(companyId);
      const recordsSummary = records.map(r => ({
        id: r.id,
        recordCode: r.recordCode,
        moduleCode: r.module.moduleCode,
        payload: jsonParse<Record<string, unknown>>(r.currentPayload) || {},
      }));

      const prompt = `Analyze these ${records.length} master data records for potential duplicates.

Records:
${JSON.stringify(recordsSummary, null, 2)}

Find records that appear to be duplicates or near-duplicates. Consider:
- Similar names (typos, variations, abbreviations)
- Matching identifying fields (SKU, code, email, etc.)
- Similar attribute values
- Same product with minor variations

Return JSON with this format:
{
  "duplicates": [
    {
      "record1Id": "id1",
      "record2Id": "id2",
      "similarity": 0.92,
      "matchingFields": ["field1", "field2"],
      "reason": "Explanation of why these appear to be duplicates"
    }
  ]
}

Only include pairs with similarity >= ${threshold}. Be thorough but avoid false positives.
Return ONLY the JSON object, no other text.`;

      const llmResult = await callAIProvider(config.provider, config, [
        { role: 'system', content: 'You are a master data deduplication expert AI. Find potential duplicate records by analyzing data patterns. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ]);

      totalTokens += llmResult.tokensUsed;
      modelUsed = llmResult.modelUsed;

      const analysis = extractJSON<{ duplicates: Array<{
        record1Id: string;
        record2Id: string;
        similarity: number;
        matchingFields: string[];
        reason: string;
      }> }>(llmResult.content);

      if (analysis?.duplicates) {
        // Build lookup for record info
        const recordMap = new Map(records.map(r => [r.id, r]));
        duplicates = analysis.duplicates
          .filter(d => d.similarity >= threshold)
          .map(d => {
            const r1 = recordMap.get(d.record1Id);
            const r2 = recordMap.get(d.record2Id);
            return {
              record1: {
                id: d.record1Id,
                recordCode: r1?.recordCode || d.record1Id,
                moduleCode: r1?.module.moduleCode || 'unknown',
              },
              record2: {
                id: d.record2Id,
                recordCode: r2?.recordCode || d.record2Id,
                moduleCode: r2?.module.moduleCode || 'unknown',
              },
              similarity: d.similarity,
              matchingFields: d.matchingFields,
              reason: d.reason,
            };
          });
      }
    } catch (err) {
      console.error('LLM duplicate detect error, falling back to rule-based:', err);
      duplicates = findRuleBasedDuplicates(records);
    }
  } else {
    // Rule-based duplicate detection
    duplicates = findRuleBasedDuplicates(records);
  }

  return NextResponse.json({
    duplicates,
    totalRecords: records.length,
    duplicatePairs: duplicates.length,
    modelUsed,
    totalTokens,
    threshold,
  });
}

function findRuleBasedDuplicates(records: Array<{
  id: string;
  recordCode: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentPayload: any;
  module: { moduleCode: string };
}>): Array<{
  record1: { id: string; recordCode: string; moduleCode: string };
  record2: { id: string; recordCode: string; moduleCode: string };
  similarity: number;
  matchingFields: string[];
  reason: string;
}> {
  const duplicates: Array<{
    record1: { id: string; recordCode: string; moduleCode: string };
    record2: { id: string; recordCode: string; moduleCode: string };
    similarity: number;
    matchingFields: string[];
    reason: string;
  }> = [];

  for (let i = 0; i < records.length; i++) {
    const p1 = jsonParse<Record<string, unknown>>(records[i].currentPayload) || {};
    for (let j = i + 1; j < records.length; j++) {
      if (records[i].module.moduleCode !== records[j].module.moduleCode) continue;
      const p2 = jsonParse<Record<string, unknown>>(records[j].currentPayload) || {};

      let matchingFields: string[] = [];
      let totalFields = 0;

      for (const key of new Set([...Object.keys(p1), ...Object.keys(p2)])) {
        if (['createdAt', 'updatedAt', 'createdBy', 'updatedBy'].includes(key)) continue;
        totalFields++;
        const v1 = String(p1[key] || '').toLowerCase().trim();
        const v2 = String(p2[key] || '').toLowerCase().trim();
        if (v1 && v2 && v1 === v2) {
          matchingFields.push(key);
        }
      }

      const similarity = totalFields > 0 ? matchingFields.length / totalFields : 0;
      if (similarity >= 0.7) {
        duplicates.push({
          record1: {
            id: records[i].id,
            recordCode: records[i].recordCode || records[i].id,
            moduleCode: records[i].module.moduleCode,
          },
          record2: {
            id: records[j].id,
            recordCode: records[j].recordCode || records[j].id,
            moduleCode: records[j].module.moduleCode,
          },
          similarity: Math.round(similarity * 100) / 100,
          matchingFields,
          reason: `${matchingFields.length} fields match out of ${totalFields} compared`,
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

// ─── Record Matching ────────────────────────────────────────────────────────

async function handleMatchRecords(body: EnrichmentRequest, companyId: string, aiConfigured: boolean) {
  const { recordIds, moduleCode } = body;

  if (!recordIds || recordIds.length < 1) {
    return NextResponse.json({ error: 'At least one recordId is required' }, { status: 400 });
  }

  // Get the source records
  const sourceRecords = await db.dataRecord.findMany({
    where: { id: { in: recordIds }, companyId },
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
    },
  });

  if (sourceRecords.length === 0) {
    return NextResponse.json({ error: 'No records found' }, { status: 404 });
  }

  // Get potential match records from other modules
  const sourceModuleIds = [...new Set(sourceRecords.map(r => r.moduleId))];
  const otherRecords = await db.dataRecord.findMany({
    where: {
      companyId,
      moduleId: { notIn: sourceModuleIds },
    },
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
    },
    take: 50,
    orderBy: { updatedAt: 'desc' },
  });

  let totalTokens = 0;
  let modelUsed = 'rule-based';
  let matches: Array<{
    sourceRecord: { id: string; recordCode: string; moduleCode: string };
    matchedRecord: { id: string; recordCode: string; moduleCode: string };
    matchType: string;
    confidence: number;
    reason: string;
  }> = [];

  if (aiConfigured && otherRecords.length > 0) {
    try {
      const config = await getTenantAIProviderConfig(companyId);

      const sourceSummary = sourceRecords.map(r => ({
        id: r.id,
        recordCode: r.recordCode,
        moduleCode: r.module.moduleCode,
        payload: jsonParse<Record<string, unknown>>(r.currentPayload) || {},
      }));

      const targetSummary = otherRecords.map(r => ({
        id: r.id,
        recordCode: r.recordCode,
        moduleCode: r.module.moduleCode,
        payload: jsonParse<Record<string, unknown>>(r.currentPayload) || {},
      }));

      const prompt = `Find relationships and matches between these source records and target records across different modules.

Source records:
${JSON.stringify(sourceSummary, null, 2)}

Target records (from other modules):
${JSON.stringify(targetSummary, null, 2)}

Find meaningful business relationships between records. For example:
- An Article might relate to a Supplier (who supplies it)
- A Store might relate to a Pricing record (store-specific pricing)
- A Promotion might relate to Articles (promoted products)

Return JSON:
{
  "matches": [
    {
      "sourceId": "source-record-id",
      "targetId": "target-record-id",
      "matchType": "supplier-product|store-pricing|promotion-article|etc",
      "confidence": 0.85,
      "reason": "Explanation of the relationship"
    }
  ]
}

Only include matches with confidence >= 0.6. Return ONLY the JSON object.`;

      const llmResult = await callAIProvider(config.provider, config, [
        { role: 'system', content: 'You are a master data relationship expert AI. Find meaningful business relationships between records across different modules. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ]);

      totalTokens += llmResult.tokensUsed;
      modelUsed = llmResult.modelUsed;

      const analysis = extractJSON<{ matches: Array<{
        sourceId: string;
        targetId: string;
        matchType: string;
        confidence: number;
        reason: string;
      }> }>(llmResult.content);

      if (analysis?.matches) {
        const sourceMap = new Map(sourceRecords.map(r => [r.id, r]));
        const targetMap = new Map(otherRecords.map(r => [r.id, r]));

        matches = analysis.matches
          .filter(m => m.confidence >= 0.6)
          .map(m => {
            const src = sourceMap.get(m.sourceId);
            const tgt = targetMap.get(m.targetId);
            return {
              sourceRecord: {
                id: m.sourceId,
                recordCode: src?.recordCode || m.sourceId,
                moduleCode: src?.module.moduleCode || 'unknown',
              },
              matchedRecord: {
                id: m.targetId,
                recordCode: tgt?.recordCode || m.targetId,
                moduleCode: tgt?.module.moduleCode || 'unknown',
              },
              matchType: m.matchType,
              confidence: m.confidence,
              reason: m.reason,
            };
          });
      }
    } catch (err) {
      console.error('LLM match records error:', err);
    }
  }

  return NextResponse.json({
    matches,
    sourceCount: sourceRecords.length,
    targetCount: otherRecords.length,
    matchCount: matches.length,
    modelUsed,
    totalTokens,
  });
}

// ─── Bulk Enrichment ────────────────────────────────────────────────────────

async function handleBulkEnrich(body: EnrichmentRequest, companyId: string, aiConfigured: boolean) {
  const { moduleCode, options } = body;
  const batchSize = options?.batchSize ?? 50;
  const dryRun = options?.dryRun ?? true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { companyId };
  if (moduleCode) {
    const mod = await db.metaModule.findFirst({ where: { moduleCode } });
    if (mod) where.moduleId = mod.id;
  }

  const records = await db.dataRecord.findMany({
    where,
    take: batchSize,
    orderBy: { updatedAt: 'desc' },
    include: {
      module: { select: { moduleCode: true } },
    },
  });

  let totalTokens = 0;
  let modelUsed = 'rule-based';

  const results = records.map((record) => {
    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
    const enrichmentData = generateEnrichmentData(payload, record.module.moduleCode);

    return {
      recordId: record.id,
      moduleCode: record.module.moduleCode,
      missingFields: enrichmentData.missingFields,
      filledFields: enrichmentData.filledFields,
      confidence: enrichmentData.confidence,
    };
  });

  // For bulk, use LLM on a summary rather than individual records (too many API calls)
  if (aiConfigured && results.length > 0) {
    try {
      const config = await getTenantAIProviderConfig(companyId);
      const missingSummary = results
        .filter(r => r.missingFields.length > 0)
        .slice(0, 20)
        .map(r => ({ recordId: r.recordId, moduleCode: r.moduleCode, missingFields: r.missingFields }));

      if (missingSummary.length > 0) {
        const prompt = `Analyze these ${missingSummary.length} records with missing fields and suggest bulk enrichment defaults.

Records with missing fields:
${JSON.stringify(missingSummary, null, 2)}

For each record, suggest appropriate default values for the missing fields. Return JSON:
{
  "enrichments": [
    {
      "recordId": "id",
      "filledFields": { "field": "value" },
      "confidence": 0.8
    }
  ]
}

Use industry-standard defaults. Return ONLY the JSON object.`;

        const llmResult = await callAIProvider(config.provider, config, [
          { role: 'system', content: 'You are a master data bulk enrichment AI. Suggest appropriate default values for missing fields. Always respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ]);

        totalTokens += llmResult.tokensUsed;
        modelUsed = llmResult.modelUsed;

        const enrichments = extractJSON<{ enrichments: Array<{
          recordId: string;
          filledFields: Record<string, unknown>;
          confidence: number;
        }> }>(llmResult.content);

        if (enrichments?.enrichments) {
          const enrichmentMap = new Map(enrichments.enrichments.map(e => [e.recordId, e]));
          for (const result of results) {
            const enrichment = enrichmentMap.get(result.recordId);
            if (enrichment) {
              result.filledFields = { ...result.filledFields, ...enrichment.filledFields };
              result.confidence = enrichment.confidence;
            }
          }
        }
      }
    } catch (err) {
      console.error('LLM bulk enrich error:', err);
    }
  }

  const summary = {
    total: results.length,
    withMissingFields: results.filter((r) => r.missingFields.length > 0).length,
    avgConfidence:
      results.length > 0
        ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
        : 0,
  };

  return NextResponse.json({ results, summary, dryRun, modelUsed, totalTokens });
}

// ─── Rule-Based Fallback Functions ──────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Footwear: ['shoes', 'sneakers', 'boots', 'sandals', 'heels', 'loafers', 'running', 'training'],
  Apparel: ['shirt', 'pants', 'jacket', 'dress', 'jeans', 'hoodie', 'polo', 't-shirt', 'top'],
  Accessories: ['bag', 'watch', 'belt', 'wallet', 'sunglasses', 'hat', 'scarf', 'jewelry'],
  'Sports Equipment': ['ball', 'racket', 'gym', 'yoga', 'fitness', 'training', 'outdoor'],
  'Food & Beverage': ['coffee', 'tea', 'snack', 'drink', 'food', 'restaurant', 'cafe'],
};

const BRAND_CATEGORIES: Record<string, string> = {
  Nike: 'Footwear',
  Adidas: 'Footwear',
  Puma: 'Footwear',
  Zara: 'Apparel',
  'H&M': 'Apparel',
  Uniqlo: 'Apparel',
  Starbucks: 'Food & Beverage',
  'Pizza Hut': 'Food & Beverage',
  'Ray-Ban': 'Accessories',
  Casio: 'Accessories',
};

function generateClassificationSuggestions(
  payload: Record<string, unknown>,
  moduleCode: string
): { field: string; suggestedValue: string; confidence: number; source: string }[] {
  const suggestions: { field: string; suggestedValue: string; confidence: number; source: string }[] = [];

  if (moduleCode === 'ARTICLE_MASTER') {
    const brand = String(payload.brand || payload.Brand || '');
    const name = String(payload.name || payload.Name || payload.itemName || '');

    if (!payload.category && !payload.Category) {
      if (BRAND_CATEGORIES[brand]) {
        suggestions.push({
          field: 'category',
          suggestedValue: BRAND_CATEGORIES[brand],
          confidence: 0.85,
          source: 'brand-mapping',
        });
      }

      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some((kw) => name.toLowerCase().includes(kw))) {
          suggestions.push({
            field: 'category',
            suggestedValue: category,
            confidence: 0.7,
            source: 'name-keyword',
          });
          break;
        }
      }
    }

    if (!payload.tags || (Array.isArray(payload.tags) && payload.tags.length === 0)) {
      const tags: string[] = [];
      if (brand) tags.push(brand);
      if (payload.category) tags.push(String(payload.category));

      const nameLower = name.toLowerCase();
      if (nameLower.includes('men') || nameLower.includes('mens')) tags.push('Men');
      if (nameLower.includes('women') || nameLower.includes('womens')) tags.push('Women');
      if (nameLower.includes('kids') || nameLower.includes('children')) tags.push('Kids');

      if (tags.length > 0) {
        suggestions.push({
          field: 'tags',
          suggestedValue: tags.join(', '),
          confidence: 0.75,
          source: 'auto-tagging',
        });
      }
    }

    if (!payload.season && !payload.Season) {
      const currentMonth = new Date().getMonth();
      let season: string;
      if (currentMonth >= 2 && currentMonth <= 4) season = 'Spring';
      else if (currentMonth >= 5 && currentMonth <= 7) season = 'Summer';
      else if (currentMonth >= 8 && currentMonth <= 10) season = 'Fall';
      else season = 'Winter';

      suggestions.push({
        field: 'season',
        suggestedValue: season,
        confidence: 0.5,
        source: 'current-season',
      });
    }
  }

  if (moduleCode === 'SUPPLIER_MASTER') {
    const country = String(payload.country || payload.Country || 'Indonesia');
    if (!payload.region && !payload.Region) {
      const regionMap: Record<string, string> = {
        Indonesia: 'Southeast Asia',
        China: 'East Asia',
        Vietnam: 'Southeast Asia',
        Bangladesh: 'South Asia',
        India: 'South Asia',
        Turkey: 'Europe/Middle East',
      };
      suggestions.push({
        field: 'region',
        suggestedValue: regionMap[country] || 'Asia Pacific',
        confidence: 0.8,
        source: 'country-mapping',
      });
    }
  }

  return suggestions;
}

interface EnrichmentResult {
  missingFields: string[];
  filledFields: Record<string, unknown>;
  confidence: number;
}

function generateEnrichmentData(
  payload: Record<string, unknown>,
  moduleCode: string
): EnrichmentResult {
  const missingFields: string[] = [];
  const filledFields: Record<string, unknown> = {};
  let totalConfidence = 0;
  let fieldCount = 0;

  const requiredFields: Record<string, Record<string, { required: boolean; default: unknown }>> = {
    ARTICLE_MASTER: {
      status: { required: true, default: 'DRAFT' },
      brand: { required: false, default: 'Unknown' },
      category: { required: true, default: 'Uncategorized' },
      season: { required: false, default: 'All Season' },
      currency: { required: true, default: 'IDR' },
      countryOfOrigin: { required: false, default: 'Indonesia' },
      language: { required: false, default: 'en' },
    },
    STORE_MASTER: {
      status: { required: true, default: 'DRAFT' },
      storeType: { required: true, default: 'STANDARD' },
      country: { required: true, default: 'Indonesia' },
      currency: { required: true, default: 'IDR' },
      timezone: { required: false, default: 'Asia/Jakarta' },
    },
    SUPPLIER_MASTER: {
      status: { required: true, default: 'DRAFT' },
      supplierType: { required: true, default: 'DISTRIBUTOR' },
      country: { required: true, default: 'Indonesia' },
      currency: { required: true, default: 'IDR' },
      paymentTerms: { required: true, default: 'NET_30' },
    },
  };

  const fields = requiredFields[moduleCode] || {};
  for (const [field, config] of Object.entries(fields)) {
    const hasValue = payload[field] !== undefined && payload[field] !== null && payload[field] !== '';
    if (!hasValue) {
      missingFields.push(field);
      if (config.default !== undefined) {
        filledFields[field] = config.default;
        totalConfidence += config.required ? 0.7 : 0.5;
        fieldCount++;
      }
    }
  }

  return {
    missingFields,
    filledFields,
    confidence: fieldCount > 0 ? totalConfidence / fieldCount : 1.0,
  };
}

interface QualityIssue {
  field: string;
  type: 'missing' | 'invalid' | 'inconsistent' | 'outdated';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestion: string;
}

function identifyQualityIssues(
  payload: Record<string, unknown>,
  moduleCode: string
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  if (!payload.name && !payload.Name && !payload.itemName) {
    issues.push({
      field: 'name',
      type: 'missing',
      severity: 'critical',
      message: 'Record is missing a name/title',
      suggestion: 'Add a descriptive name for this record',
    });
  }

  if (!payload.description && !payload.Description) {
    issues.push({
      field: 'description',
      type: 'missing',
      severity: 'warning',
      message: 'Record is missing a description',
      suggestion: 'Add a description to improve data completeness',
    });
  }

  if (moduleCode === 'ARTICLE_MASTER') {
    if (!payload.brand && !payload.Brand) {
      issues.push({
        field: 'brand',
        type: 'missing',
        severity: 'critical',
        message: 'Article is missing brand information',
        suggestion: 'Assign a brand to this article',
      });
    }

    if (!payload.category && !payload.Category) {
      issues.push({
        field: 'category',
        type: 'missing',
        severity: 'warning',
        message: 'Article is not categorized',
        suggestion: 'Use AI auto-classification to suggest a category',
      });
    }

    const price = Number(payload.price || payload.Price || 0);
    if (price <= 0) {
      issues.push({
        field: 'price',
        type: 'missing',
        severity: 'critical',
        message: 'Article has no price or price is zero',
        suggestion: 'Set a valid price for this article',
      });
    }

    const sku = String(payload.sku || payload.SKU || payload.itemCode || '');
    if (!sku || sku.length < 3) {
      issues.push({
        field: 'sku',
        type: 'invalid',
        severity: 'warning',
        message: 'SKU code is missing or too short',
        suggestion: 'Assign a proper SKU code following the naming convention',
      });
    }
  }

  if (moduleCode === 'STORE_MASTER') {
    if (!payload.address && !payload.Address) {
      issues.push({
        field: 'address',
        type: 'missing',
        severity: 'critical',
        message: 'Store is missing address information',
        suggestion: 'Add the store address',
      });
    }
  }

  return issues;
}

function calculateQualityScore(
  payload: Record<string, unknown>,
  issues: QualityIssue[]
): number {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  let score = 100;
  score -= criticalCount * 15;
  score -= warningCount * 5;
  score -= infoCount * 1;

  const filledFields = Object.values(payload).filter(
    (v) =>
      v !== null &&
      v !== undefined &&
      v !== '' &&
      !(Array.isArray(v) && v.length === 0)
  ).length;
  const totalExpectedFields = 10;
  const completenessBonus = Math.min(filledFields / totalExpectedFields, 1) * 10;
  score += completenessBonus;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateImageAltText(
  fileName: string,
  payload: Record<string, unknown>
): string {
  const brand = String(payload.brand || payload.Brand || '');
  const name = String(payload.name || payload.Name || payload.itemName || '');
  const category = String(payload.category || payload.Category || '');

  const parts = [brand, name, category].filter(Boolean);
  if (parts.length > 0) {
    return `${parts.join(' ')} - product image`;
  }

  const cleanName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\d+/g, '')
    .trim();

  return cleanName || 'Product image';
}

function generateImageDescription(
  fileName: string,
  payload: Record<string, unknown>
): string {
  const brand = String(payload.brand || payload.Brand || '');
  const name = String(payload.name || payload.Name || payload.itemName || '');
  const category = String(payload.category || payload.Category || '');
  const color = String(payload.color || payload.Color || '');
  const material = String(payload.material || payload.Material || '');

  const parts = [brand, name, category, color, material].filter(Boolean);
  if (parts.length > 0) {
    return `High-quality product image of ${parts.join(' ')}. Suitable for e-commerce, catalog, and marketing materials.`;
  }

  return 'Product image for e-commerce and marketing use.';
}

function generateImageKeywords(payload: Record<string, unknown>): string[] {
  const keywords: string[] = [];
  const fields = [
    'brand', 'Brand', 'name', 'Name', 'category', 'Category',
    'color', 'Color', 'material', 'Material', 'season', 'Season',
  ];

  for (const field of fields) {
    const val = payload[field];
    if (val && typeof val === 'string' && val.trim()) {
      keywords.push(val.trim());
    }
  }

  keywords.push('product', 'e-commerce', 'retail');
  return [...new Set(keywords)];
}
