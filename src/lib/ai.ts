/**
 * AI SDK Configuration — Multi-Provider Support
 *
 * Supports multiple AI providers (Z.AI, Google Gemini, OpenAI, Azure OpenAI, Custom)
 * with configuration stored in the AppSettings database table, falling back to
 * environment variables when DB settings are absent.
 *
 * SECURITY: API keys are read from AppSettings (DB) or environment variables —
 * never from filesystem config files. API keys returned via API are masked.
 *
 * Supported AppSettings keys:
 *   AI_PROVIDER    — zai | gemini | openai | azure-openai | custom
 *   AI_API_KEY     — API key for the chosen provider
 *   AI_BASE_URL    — Base URL for custom provider endpoints
 *   AI_MODEL       — Model name (e.g., gemini-2.0-flash, gpt-4o)
 *   AI_MAX_TOKENS  — Max tokens per request
 *   AI_TEMPERATURE — Temperature setting (0-2)
 *
 * Backward compatible with ZAI_API_KEY env var.
 */

import ZAI from 'z-ai-web-dev-sdk';

// ─── Types ───────────────────────────────────────────────────────────

export type AIProvider = 'zai' | 'gemini' | 'openai' | 'azure-openai' | 'custom';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  customHeaders?: Record<string, string>;
}

export interface AIMaskedConfig {
  provider: AIProvider;
  apiKeyMasked: string;
  apiKeySet: boolean;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  customHeaders?: Record<string, string>;
  configured: boolean;
  source?: 'tenant' | 'global';  // Where the config came from
  companyId?: string;            // Which company this config belongs to
}

interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

// ─── Provider defaults ───────────────────────────────────────────────

export const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string; label: string }> = {
  zai: {
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4-plus',
    label: 'Z.AI',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    label: 'Google Gemini',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    label: 'OpenAI',
  },
  'azure-openai': {
    baseUrl: '',
    model: 'gpt-4o',
    label: 'Azure OpenAI',
  },
  custom: {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model: 'glm-5.1',
    label: 'GLM-5.1 (DashScope)',
  },
};

// ─── DB helper ───────────────────────────────────────────────────────

/**
 * Read a single setting from AppSettings table.
 * Returns null if not found (caller decides fallback).
 */
async function getSetting(key: string): Promise<string | null> {
  try {
    const { db } = await import('@/lib/db');
    const row = await db.appSettings.findUnique({ where: { settingKey: key } });
    return row?.settingValue ?? null;
  } catch {
    // DB not available (e.g. during migration) — fall back to env
    return null;
  }
}

// ─── Provider config from DB + env fallback ──────────────────────────

let cachedConfig: AIProviderConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30-second TTL to pick up DB changes reasonably fast

/**
 * Get the full AI provider configuration.
 * Reads from AppSettings DB first, then falls back to env vars.
 */
export async function getAIProviderConfig(): Promise<AIProviderConfig> {
  // Return cached config if still fresh
  const now = Date.now();
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const [providerRaw, apiKey, baseUrl, model, maxTokensRaw, temperatureRaw] = await Promise.all([
    getSetting('AI_PROVIDER'),
    getSetting('AI_API_KEY'),
    getSetting('AI_BASE_URL'),
    getSetting('AI_MODEL'),
    getSetting('AI_MAX_TOKENS'),
    getSetting('AI_TEMPERATURE'),
  ]);

  const provider: AIProvider = (() => {
    const p = providerRaw || process.env.AI_PROVIDER || 'custom';
    if (['zai', 'gemini', 'openai', 'azure-openai', 'custom'].includes(p)) return p as AIProvider;
    return 'custom';
  })();

  const resolvedApiKey = apiKey || process.env.AI_API_KEY || process.env.ZAI_API_KEY || '';
  const defaults = PROVIDER_DEFAULTS[provider];
  const resolvedBaseUrl = baseUrl || process.env.AI_BASE_URL || defaults.baseUrl;
  const resolvedModel = model || process.env.AI_MODEL || defaults.model;
  const resolvedMaxTokens = maxTokensRaw ? parseInt(maxTokensRaw, 10) : (process.env.AI_MAX_TOKENS ? parseInt(process.env.AI_MAX_TOKENS, 10) : 4096);
  const resolvedTemperature = temperatureRaw ? parseFloat(temperatureRaw) : (process.env.AI_TEMPERATURE ? parseFloat(process.env.AI_TEMPERATURE) : 0.7);

  cachedConfig = {
    provider,
    apiKey: resolvedApiKey,
    baseUrl: resolvedBaseUrl,
    model: resolvedModel,
    maxTokens: isNaN(resolvedMaxTokens) ? 4096 : resolvedMaxTokens,
    temperature: isNaN(resolvedTemperature) ? 0.7 : Math.min(2, Math.max(0, resolvedTemperature)),
  };
  cacheTimestamp = now;

  return cachedConfig;
}

/**
 * Get a masked version of the config (safe to send to the client).
 */
export async function getAIMaskedConfig(): Promise<AIMaskedConfig> {
  const config = await getAIProviderConfig();
  const apiKeySet = !!config.apiKey;
  const apiKeyMasked = config.apiKey
    ? '••••••••' + config.apiKey.slice(-4)
    : '';

  return {
    provider: config.provider,
    apiKeyMasked,
    apiKeySet,
    baseUrl: config.baseUrl,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    configured: apiKeySet,
  };
}

// ─── Tenant-scoped AI config (TenantAiConfig) ─────────────────────

/**
 * Get AI provider config for a specific company (tenant).
 * Reads from TenantAiConfig first, then falls back to global AppSettings.
 */
export async function getTenantAIProviderConfig(companyId: string): Promise<AIProviderConfig> {
  const { db } = await import('@/lib/db');

  try {
    const tenantConfig = await db.tenantAiConfig.findUnique({
      where: { companyId },
    });

    if (tenantConfig && tenantConfig.isActive) {
      const provider: AIProvider = (() => {
        const p = tenantConfig.provider;
        if (['zai', 'gemini', 'openai', 'azure-openai', 'custom'].includes(p)) return p as AIProvider;
        return 'zai';
      })();

      const defaults = PROVIDER_DEFAULTS[provider];
      return {
        provider,
        apiKey: tenantConfig.apiKey || '',
        baseUrl: tenantConfig.baseUrl || defaults.baseUrl,
        model: tenantConfig.model || defaults.model,
        maxTokens: tenantConfig.maxTokens,
        temperature: tenantConfig.temperature,
        customHeaders: (tenantConfig.customHeaders as unknown as Record<string, string>) || undefined,
      };
    }
  } catch {
    // TenantAiConfig table may not exist yet during migration
  }

  // Fall back to global config
  return getAIProviderConfig();
}

/**
 * Get a masked version of the tenant-scoped AI config (safe to send to the client).
 */
export async function getTenantAIMaskedConfig(companyId: string): Promise<AIMaskedConfig> {
  const { db } = await import('@/lib/db');

  try {
    const tenantConfig = await db.tenantAiConfig.findUnique({
      where: { companyId },
    });

    if (tenantConfig && tenantConfig.isActive) {
      const provider: AIProvider = (() => {
        const p = tenantConfig.provider;
        if (['zai', 'gemini', 'openai', 'azure-openai', 'custom'].includes(p)) return p as AIProvider;
        return 'zai';
      })();

      const defaults = PROVIDER_DEFAULTS[provider];
      const apiKeySet = !!tenantConfig.apiKey;
      const apiKeyMasked = tenantConfig.apiKey
        ? '••••••••' + tenantConfig.apiKey.slice(-4)
        : '';

      return {
        provider,
        apiKeyMasked,
        apiKeySet,
        baseUrl: tenantConfig.baseUrl || defaults.baseUrl,
        model: tenantConfig.model || defaults.model,
        maxTokens: tenantConfig.maxTokens,
        temperature: tenantConfig.temperature,
        customHeaders: (tenantConfig.customHeaders as unknown as Record<string, string>) || undefined,
        configured: apiKeySet,
        source: 'tenant',
        companyId,
      };
    }
  } catch {
    // TenantAiConfig table may not exist yet
  }

  // Fall back to global config
  const globalConfig = await getAIMaskedConfig();
  return { ...globalConfig, source: 'global', companyId };
}

// ─── Legacy ZAI helpers (backward compatible) ───────────────────────

let cachedZAIInstance: ZAI | null = null;

/**
 * Get the AI SDK configuration from environment variables (legacy).
 * @deprecated Use getAIProviderConfig() instead.
 */
export function getAIConfig(): ZAIConfig {
  const apiKey = process.env.ZAI_API_KEY;
  const baseUrl = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4';

  if (!apiKey) {
    throw new Error(
      'ZAI_API_KEY environment variable is not set. ' +
      'Please configure it in your Vercel project settings (Settings → Environment Variables) ' +
      'or via the AI Settings page. Never commit the API key to git or .z-ai-config files.'
    );
  }

  return {
    baseUrl,
    apiKey,
    chatId: process.env.ZAI_CHAT_ID,
    userId: process.env.ZAI_USER_ID,
    token: process.env.ZAI_TOKEN,
  };
}

/**
 * Get a cached ZAI instance (singleton per serverless invocation).
 * Uses the legacy ZAI_API_KEY env var for backward compatibility.
 */
export async function getAIClient(): Promise<ZAI> {
  if (!cachedZAIInstance) {
    const config = getAIConfig();
    cachedZAIInstance = new (ZAI as unknown as { new (config: ZAIConfig): ZAI })(config);
  }
  return cachedZAIInstance;
}

/**
 * Check if AI is configured (for health checks / feature flags).
 * Checks both DB settings and env vars.
 */
export function isAIConfigured(): boolean {
  // Synchronous check — only looks at env vars for immediate response.
  // For DB-based check use getAIMaskedConfig() which is async.
  return !!(process.env.ZAI_API_KEY || process.env.AI_API_KEY);
}

/**
 * Async version — checks DB settings too.
 */
export async function isAIConfiguredAsync(): Promise<boolean> {
  const config = await getAIProviderConfig();
  return !!config.apiKey;
}

/**
 * Clear the cached instances (useful for config rotation).
 */
export function clearAICache(): void {
  cachedZAIInstance = null;
  cachedConfig = null;
  cacheTimestamp = 0;
}
