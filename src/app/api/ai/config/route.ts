/**
 * AI Configuration API — Company-Scoped (Multi-Tenant)
 *
 * GET  — Return AI configuration for a specific company (API key masked)
 * PUT  — Update AI configuration for a specific company
 * POST — Test AI connection with company-specific settings
 *
 * Access Control:
 *   Super Admin  → can view/edit any company's config
 *   Company Admin → can view/edit only their own company's config
 *   Editor/Viewer → no access
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import {
  getTenantAIMaskedConfig,
  getTenantAIProviderConfig,
  getAIMaskedConfig,
  getAIProviderConfig,
  clearAICache,
  PROVIDER_DEFAULTS,
  type AIProvider,
} from '@/lib/ai';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

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
  customHeaders?: Record<string, string>;
  companyId?: string; // Super Admin can specify which company to update
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  model?: string;
  provider?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Determine the target companyId and verify access.
 * - Super Admin can specify any companyId via query/body param
 * - Company Admin can only access their own company
 * - Returns { companyId, authorized, error? }
 */
function resolveCompanyAccess(
  tokenPayload: { companyId: string; roles: string[] },
  requestedCompanyId?: string,
): { companyId: string; authorized: boolean; error?: string } {
  const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
  const isCompanyAdmin = hasPermission(tokenPayload.roles, 'ai:config:view');

  if (!isSuperAdmin && !isCompanyAdmin) {
    return { companyId: '', authorized: false, error: 'Insufficient permissions. Required: ai:config:view' };
  }

  // Super Admin can target any company
  if (isSuperAdmin && requestedCompanyId) {
    return { companyId: requestedCompanyId, authorized: true };
  }

  // Default to own company
  return { companyId: tokenPayload.companyId, authorized: true };
}

/**
 * Check if user can edit AI config for the given company.
 */
function canEditCompanyConfig(
  tokenPayload: { companyId: string; roles: string[] },
  targetCompanyId: string,
): boolean {
  const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
  const hasConfigEdit = hasPermission(tokenPayload.roles, 'ai:config:edit');

  if (!hasConfigEdit) return false;
  if (isSuperAdmin) return true; // Super Admin can edit any company
  return tokenPayload.companyId === targetCompanyId; // Company Admin can only edit own
}

// ─── GET — Company-specific AI config (masked) ───────────────────────

export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: read endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    // ── Resolve company access ────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const requestedCompanyId = searchParams.get('companyId') || undefined;
    const { companyId, authorized, error } = resolveCompanyAccess(tokenPayload, requestedCompanyId);

    if (!authorized) {
      return NextResponse.json({ error: error || 'Insufficient permissions' }, { status: 403 });
    }

    // ── Get company-specific config ───────────────────────────────────
    const config = await getTenantAIMaskedConfig(companyId);

    // If Super Admin, also return list of companies for the selector
    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    let companies: Array<{ id: string; name: string; code: string }> | undefined;
    if (isSuperAdmin) {
      const allCompanies = await db.tenantCompany.findMany({
        select: { id: true, companyName: true, companyCode: true },
        orderBy: { companyName: 'asc' },
      });
      companies = allCompanies.map(c => ({ id: c.id, name: c.companyName, code: c.companyCode }));
    }

    return NextResponse.json({ config, companies, activeCompanyId: companyId });
  } catch (error) {
    console.error('AI Config GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT — Update company-specific AI config ─────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body: AIConfigUpdate = await request.json();

    // ── Resolve target company ─────────────────────────────────────────
    const targetCompanyId = body.companyId || tokenPayload.companyId;

    if (!canEditCompanyConfig(tokenPayload, targetCompanyId)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. You can only edit AI config for your own company.' },
        { status: 403 }
      );
    }

    // ── Validate provider ──────────────────────────────────────────────
    const provider: AIProvider = body.provider ? (() => {
      if (['zai', 'gemini', 'openai', 'azure-openai', 'custom'].includes(body.provider!)) {
        return body.provider as AIProvider;
      }
      return 'zai' as AIProvider;
    })() : 'zai';

    const defaults = PROVIDER_DEFAULTS[provider];

    // ── Build TenantAiConfig upsert data ───────────────────────────────
    const upsertData: Record<string, unknown> = {
      provider,
      baseUrl: body.baseUrl !== undefined ? body.baseUrl : defaults.baseUrl,
      model: body.model !== undefined ? body.model : defaults.model,
      maxTokens: body.maxTokens ?? 4096,
      temperature: body.temperature ?? 0.7,
      isActive: true,
      updatedBy: tokenPayload.userId,
    };

    // Only update API key if a new one is provided (non-empty)
    if (body.apiKey !== undefined && body.apiKey !== '') {
      upsertData.apiKey = body.apiKey;
    }

    // Custom headers support
    if (body.customHeaders !== undefined) {
      upsertData.customHeaders = body.customHeaders;
    }

    // ── Upsert TenantAiConfig ──────────────────────────────────────────
    // First check if config exists to decide whether to set createdBy
    const existingConfig = await db.tenantAiConfig.findUnique({
      where: { companyId: targetCompanyId },
    });

    if (existingConfig) {
      await db.tenantAiConfig.update({
        where: { companyId: targetCompanyId },
        data: upsertData,
      });
    } else {
      await db.tenantAiConfig.create({
        data: {
          companyId: targetCompanyId,
          ...upsertData,
          createdBy: tokenPayload.userId,
        },
      });
    }

    // Clear cached config so next read picks up changes
    clearAICache();

    // ── Audit: AI config change ────────────────────────────────────────
    await logAudit({
      action: AuditAction.AI_CONFIG_CHANGE,
      entityType: 'TenantAiConfig',
      entityId: targetCompanyId,
      description: `Company AI configuration updated by "${tokenPayload.username}" for company ${targetCompanyId}`,
      newValues: {
        provider,
        baseUrl: upsertData.baseUrl,
        model: upsertData.model,
        maxTokens: upsertData.maxTokens,
        temperature: upsertData.temperature,
        apiKey: body.apiKey ? '***masked***' : undefined,
      },
      severity: 'warning',
      req: request,
    });

    // Return updated (masked) config
    const config = await getTenantAIMaskedConfig(targetCompanyId);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('AI Config PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST — Test AI connection (company-specific) ───────────────────

export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: AI endpoints ───────────────────────────────────────
    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    // ── Resolve target company ─────────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const targetCompanyId = body?.companyId || tokenPayload.companyId;

    if (!canEditCompanyConfig(tokenPayload, targetCompanyId)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. You can only test AI config for your own company.' },
        { status: 403 }
      );
    }

    // ── Get company-specific config ────────────────────────────────────
    const config = await getTenantAIProviderConfig(targetCompanyId);

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

      // Build headers — merge custom headers for custom provider
      const buildHeaders = (): Record<string, string> => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        };
        if (config.customHeaders) {
          Object.assign(headers, config.customHeaders);
        }
        return headers;
      };

      switch (config.provider) {
        case 'zai': {
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
            message = success ? 'Google Gemini connection successful' : 'Gemini returned unexpected response';
          } else {
            const errBody = await res.text().catch(() => '');
            message = `Gemini API error (${res.status}): ${errBody.slice(0, 200)}`;
          }
          break;
        }

        case 'openai': {
          const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: buildHeaders(),
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
          // Custom provider — OpenAI-compatible API with custom headers support
          const headers = buildHeaders();
          const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
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
            message = success ? `Custom provider (${config.model}) connection successful` : 'Custom provider returned unexpected response';
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
