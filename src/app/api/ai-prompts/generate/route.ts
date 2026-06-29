import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isAIConfigured, getAIClient } from '@/lib/ai';
import { logAudit } from '@/lib/audit';
import { jsonVal, jsonParse } from '@/lib/db-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// Types
// ============================================================

interface GenerateBody {
  promptId: string;
  recordId: string;
}

interface GenerateBulkBody {
  promptId: string;
  recordIds: string[];
}

interface ParsedAIResult {
  text: string;
  confidence: number;
  reasons: string;
  suggestions: string[];
  tokensUsed: number;
}

// ============================================================
// Helpers
// ============================================================

const CONFIDENCE_INSTRUCTION =
  '\n\nAlso return a JSON object with \'confidence\' (0-100), \'reasons\' (string), and \'suggestions\' (array of strings, max 5) at the end of your response, wrapped in ```json blocks. Example:\n```json\n{ "confidence": 85, "reasons": "Based on...", "suggestions": ["...", "..."] }\n```';

/** Pull the trailing ```json ... ``` block out of an LLM response. */
function parseTrailingJson(text: string): {
  confidence?: number;
  reasons?: string;
  suggestions?: string[];
} {
  // Find the LAST ```json ... ``` block in the text.
  const matches = text.matchAll(/```json\s*([\s\S]*?)```/g);
  let last: string | null = null;
  for (const m of matches) {
    last = m[1];
  }
  if (!last) return {};
  try {
    const parsed = JSON.parse(last.trim());
    return {
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
          : undefined,
      reasons: typeof parsed.reasons === 'string' ? parsed.reasons : undefined,
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 5).map(String)
        : undefined,
    };
  } catch {
    return {};
  }
}

/** Strip the trailing ```json ... ``` block from the visible output text. */
function stripTrailingJson(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```\s*$/g, '').trim();
}

/** Replace {{fieldCode}} placeholders in a template with values from a payload. */
function fillTemplate(
  template: string,
  payload: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const val = payload[key];
    if (val === undefined || val === null) return match;
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  });
}

/** Build the user message + call the LLM. Returns the text + parsed metadata. */
async function callLLM(
  systemPrompt: string,
  userMessage: string
): Promise<ParsedAIResult> {
  const aiConfigured = isAIConfigured();
  if (!aiConfigured) {
    // Fallback for dev when the key isn't set — produce a deterministic
    // stub so the UI flow can still be exercised end-to-end.
    const stubText =
      '[AI not configured — ZAI_API_KEY env var missing. Showing a placeholder output so the review workflow can be tested.]\n\n' +
      userMessage.slice(0, 200) + '...';
    return {
      text: stubText,
      confidence: 50,
      reasons: 'AI service is not configured (no ZAI_API_KEY).',
      suggestions: ['Configure ZAI_API_KEY in Vercel project settings.'],
      tokensUsed: 0,
    };
  }

  try {
    const zai = await getAIClient();
    const response = await zai.chat.completions.create({
      model: 'glm-4-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage + CONFIDENCE_INSTRUCTION },
      ],
      stream: false,
    });

    const rawText =
      response?.choices?.[0]?.message?.content ||
      'AI was unable to generate a response.';
    const tokensUsed = response?.usage?.total_tokens || 0;
    const meta = parseTrailingJson(rawText);
    const visibleText = stripTrailingJson(rawText);

    return {
      text: visibleText,
      confidence: meta.confidence ?? 75,
      reasons: meta.reasons || 'Confidence score not provided by the model.',
      suggestions: meta.suggestions || [],
      tokensUsed,
    };
  } catch (err) {
    console.error('AI SDK error in /api/ai-prompts/generate:', err);
    return {
      text:
        '[AI generation failed — please try again. Error: ' +
        (err instanceof Error ? err.message : 'unknown') +
        ']',
      confidence: 0,
      reasons: 'AI call failed.',
      suggestions: [],
      tokensUsed: 0,
    };
  }
}

/** Core generation routine shared by single + bulk endpoints. */
async function generateForRecord(
  promptId: string,
  recordId: string,
  userId: string,
  companyId: string
) {
  // 1. Load prompt + record (with module + fields).
  const prompt = await db.aiPrompt.findUnique({ where: { id: promptId } });
  if (!prompt) throw new Error('Prompt not found');

  const record = await db.dataRecord.findUnique({
    where: { id: recordId },
    include: {
      module: { include: { fields: { where: { isActive: true } } } },
    },
  });
  if (!record) throw new Error('Record not found');

  // 2. Parse inputAttributes JSON (array of fieldCodes).
  let inputAttrs: string[] = [];
  try {
    inputAttrs = prompt.inputAttributes
      ? jsonParse<string[]>(prompt.inputAttributes)
      : [];
  } catch {
    inputAttrs = [];
  }

  // 3. Build the payload map.
  let payload: Record<string, unknown> = {};
  try {
    payload = record.currentPayload ? jsonParse<Record<string, unknown>>(record.currentPayload) : {};
  } catch {
    payload = {};
  }

  // If inputAttributes is non-empty, restrict the payload to those keys
  // (plus always include the canonical 'name' field if present).
  const filteredPayload: Record<string, unknown> = {};
  if (inputAttrs.length > 0) {
    for (const code of inputAttrs) {
      if (code in payload) filteredPayload[code] = payload[code];
    }
  } else {
    // Default: expose all currentPayload keys.
    Object.assign(filteredPayload, payload);
  }
  // Always include name + image-derived helpers if present.
  if ('name' in payload) filteredPayload.name = payload.name;
  if ('attributes_json' in payload === false) {
    filteredPayload.attributes_json = JSON.stringify(payload);
  }

  // 4. Build the user message by replacing {{fieldCode}} placeholders.
  const userMessage = fillTemplate(prompt.userPromptTemplate, filteredPayload);

  // 5. Call the LLM.
  const aiResult = await callLLM(prompt.systemPrompt, userMessage);

  // 6. Save as AiOutput with status='PENDING_REVIEW'.
  const aiOutput = await db.aiOutput.create({
    data: {
      promptId,
      recordId,
      userId,
      output: aiResult.text,
      confidenceScore: aiResult.confidence,
      reasons: aiResult.reasons,
      suggestions: jsonVal(aiResult.suggestions),
      status: 'PENDING_REVIEW',
      tokensUsed: aiResult.tokensUsed,
    },
  });

  // 7. Save an AiUsageMetric.
  await db.aiUsageMetric.create({
    data: {
      userId,
      promptId,
      tokensUsed: aiResult.tokensUsed,
    },
  });

  return aiOutput;
}

// ============================================================
// POST /api/ai-prompts/generate — generate for a single record
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed =
      tokenPayload.roles.includes('Super Admin') ||
      tokenPayload.roles.includes('Manager');
    if (!allowed) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin or Manager role required.' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as GenerateBody;
    const { promptId, recordId } = body;
    if (!promptId || !recordId) {
      return NextResponse.json(
        { error: 'promptId and recordId are required' },
        { status: 400 }
      );
    }

    const output = await generateForRecord(
      promptId,
      recordId,
      tokenPayload.userId,
      tokenPayload.companyId
    );

    await logAudit({
      userId: tokenPayload.userId,
      action: 'AI_GENERATE',
      entityType: 'AiOutput',
      entityId: output.id,
      description: `Generated AI output (prompt=${promptId}, record=${recordId}, confidence=${output.confidenceScore})`,
      newValues: {
        promptId,
        recordId,
        confidence: output.confidenceScore,
        tokensUsed: output.tokensUsed,
      },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ output }, { status: 201 });
  } catch (error) {
    console.error('AI generate POST error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ============================================================
// POST /api/ai-prompts/generate-bulk — generate for multiple records
// ============================================================
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed =
      tokenPayload.roles.includes('Super Admin') ||
      tokenPayload.roles.includes('Manager');
    if (!allowed) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin or Manager role required.' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as GenerateBulkBody;
    const { promptId, recordIds } = body;
    if (!promptId || !Array.isArray(recordIds) || recordIds.length === 0) {
      return NextResponse.json(
        { error: 'promptId and recordIds[] are required' },
        { status: 400 }
      );
    }
    if (recordIds.length > 50) {
      return NextResponse.json(
        { error: 'Max 50 records per bulk generate request' },
        { status: 413 }
      );
    }

    const outputs: Array<{
      id: string;
      promptId: string;
      recordId: string;
      status: string;
      confidenceScore: number;
      tokensUsed: number;
    }> = [];
    const errors: Array<{ recordId: string; error: string }> = [];
    for (const recordId of recordIds) {
      try {
        const out = await generateForRecord(
          promptId,
          recordId,
          tokenPayload.userId,
          tokenPayload.companyId
        );
        outputs.push(out);
      } catch (err) {
        errors.push({
          recordId,
          error: err instanceof Error ? err.message : 'Failed',
        });
      }
    }

    await logAudit({
      userId: tokenPayload.userId,
      action: 'AI_GENERATE_BULK',
      entityType: 'AiOutput',
      description: `Bulk AI generate: ${outputs.length} ok / ${errors.length} failed (prompt=${promptId})`,
      newValues: {
        promptId,
        okCount: outputs.length,
        errorCount: errors.length,
      },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ outputs, errors });
  } catch (error) {
    console.error('AI generate-bulk error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
