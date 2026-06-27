/**
 * AI Configuration API
 *
 * GET  — Return current AI configuration (API key masked)
 * PUT  — Update AI configuration (superadmin only)
 * POST — Test AI connection with current settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { getAIMaskedConfig, getAIProviderConfig, clearAICache, type AIProvider } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Types ───────────────────────────────────────────────────────────

interface AIConfigUpdate {
  provider?: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  model?: string;
  provider?: string;
}

// ─── Helper ──────────────────────────────────────────────────────────

function requireSuperAdmin(headers: Headers): { authorized: boolean; userId?: string } {
  const tokenPayload = getTokenFromHeaders(headers);
  if (!tokenPayload) return { authorized: false };
  if (!tokenPayload.roles.includes('Super Admin')) return { authorized: false };
  return { authorized: true, userId: tokenPayload.userId };
}

/**
 * Upsert a single AppSettings row.
 */
async function upsertSetting(key: string, value: string, updatedById?: string): Promise<void> {
  await db.appSettings.upsert({
    where: { settingKey: key },
    update: { settingValue: value, updatedById: updatedById ?? null },
    create: { settingKey: key, settingValue: value, updatedById: updatedById ?? null },
  });
}

// ─── GET — Current AI config (masked) ────────────────────────────────

export async function GET() {
  try {
    const config = await getAIMaskedConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error('AI Config GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT — Update AI config (superadmin only) ────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const { authorized, userId } = requireSuperAdmin(request.headers);
    if (!authorized) {
      return NextResponse.json({ error: 'Access denied. Super Admin role required.' }, { status: 403 });
    }

    const body: AIConfigUpdate = await request.json();
    const updates: Array<{ key: string; value: string }> = [];

    if (body.provider) {
      updates.push({ key: 'AI_PROVIDER', value: body.provider });
    }
    if (body.apiKey !== undefined) {
      // Allow empty string to clear the key
      updates.push({ key: 'AI_API_KEY', value: body.apiKey });
    }
    if (body.baseUrl !== undefined) {
      updates.push({ key: 'AI_BASE_URL', value: body.baseUrl });
    }
    if (body.model !== undefined) {
      updates.push({ key: 'AI_MODEL', value: body.model });
    }
    if (body.maxTokens !== undefined) {
      updates.push({ key: 'AI_MAX_TOKENS', value: String(body.maxTokens) });
    }
    if (body.temperature !== undefined) {
      updates.push({ key: 'AI_TEMPERATURE', value: String(body.temperature) });
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No settings provided to update' }, { status: 400 });
    }

    // Upsert all settings in a transaction
    await db.$transaction(
      updates.map((u) =>
        db.appSettings.upsert({
          where: { settingKey: u.key },
          update: { settingValue: u.value, updatedById: userId ?? null },
          create: { settingKey: u.key, settingValue: u.value, updatedById: userId ?? null },
        })
      )
    );

    // Clear cached config so next read picks up changes
    clearAICache();

    // Return updated (masked) config
    const config = await getAIMaskedConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('AI Config PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST — Test AI connection ───────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { authorized } = requireSuperAdmin(request.headers);
    if (!authorized) {
      return NextResponse.json({ error: 'Access denied. Super Admin role required.' }, { status: 403 });
    }

    const config = await getAIProviderConfig();

    if (!config.apiKey) {
      const result: TestConnectionResult = {
        success: false,
        message: 'No API key configured. Please set an API key in the AI Settings page.',
      };
      return NextResponse.json({ result });
    }

    const startTime = Date.now();

    try {
      let success = false;
      let model = config.model;
      let message = '';

      switch (config.provider) {
        case 'zai': {
          // Use the ZAI SDK — type assertion needed because the constructor
          // is private in d.ts but accessible at runtime.
          const ZAIModule = await import('z-ai-web-dev-sdk');
          const ZAIClass = ZAIModule.default;
          interface ZAIConstructor { new (c: { baseUrl: string; apiKey: string }): { chat: { completions: { create: (opts: Record<string, unknown>) => Promise<{ choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } }> } } } };
          const zai = new (ZAIClass as unknown as ZAIConstructor)({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
          });
          const response = await zai.chat.completions.create({
            model: config.model,
            messages: [{ role: 'user', content: 'Hello, respond with just "OK".' }],
            max_tokens: 5,
            stream: false,
          });
          success = !!response?.choices?.[0]?.message?.content;
          model = config.model;
          message = success ? 'Z.AI connection successful' : 'Z.AI returned an empty response';
          break;
        }

        case 'gemini': {
          // Gemini REST API
          const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Hello, respond with just OK.' }] }],
              generationConfig: { maxOutputTokens: 5, temperature: 0 },
            }),
          });
          if (res.ok) {
            const data = await res.json();
            success = !!data?.candidates?.[0]?.content?.parts?.[0]?.text;
            message = success ? 'Google Gemini connection successful' : `Gemini returned unexpected response`;
          } else {
            const errBody = await res.text().catch(() => '');
            message = `Gemini API error (${res.status}): ${errBody.slice(0, 200)}`;
          }
          break;
        }

        case 'openai': {
          // OpenAI-compatible REST API (also works for custom providers)
          const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model,
              messages: [{ role: 'user', content: 'Hello, respond with just OK.' }],
              max_tokens: 5,
              temperature: 0,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            success = !!data?.choices?.[0]?.message?.content;
            message = success ? 'OpenAI connection successful' : 'OpenAI returned unexpected response';
          } else {
            const errBody = await res.text().catch(() => '');
            message = `OpenAI API error (${res.status}): ${errBody.slice(0, 200)}`;
          }
          break;
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
              messages: [{ role: 'user', content: 'Hello, respond with just OK.' }],
              max_tokens: 5,
              temperature: 0,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            success = !!data?.choices?.[0]?.message?.content;
            message = success ? 'Azure OpenAI connection successful' : 'Azure OpenAI returned unexpected response';
          } else {
            const errBody = await res.text().catch(() => '');
            message = `Azure OpenAI API error (${res.status}): ${errBody.slice(0, 200)}`;
          }
          break;
        }

        case 'custom': {
          // Custom provider — OpenAI-compatible API
          const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model,
              messages: [{ role: 'user', content: 'Hello, respond with just OK.' }],
              max_tokens: 5,
              temperature: 0,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            success = !!data?.choices?.[0]?.message?.content;
            message = success ? 'Custom provider connection successful' : 'Custom provider returned unexpected response';
          } else {
            const errBody = await res.text().catch(() => '');
            message = `Custom API error (${res.status}): ${errBody.slice(0, 200)}`;
          }
          break;
        }

        default:
          message = `Unsupported provider: ${config.provider}`;
      }

      const latencyMs = Date.now() - startTime;

      const result: TestConnectionResult = {
        success,
        message,
        latencyMs,
        model,
        provider: config.provider,
      };

      return NextResponse.json({ result });
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const result: TestConnectionResult = {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latencyMs,
        provider: config.provider,
        model: config.model,
      };
      return NextResponse.json({ result });
    }
  } catch (error) {
    console.error('AI Config POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
