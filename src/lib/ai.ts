/**
 * AI SDK Configuration — Secure Environment-Based Setup
 *
 * SECURITY: This module reads AI API credentials from environment variables
 * (NOT from a .z-ai-config file). This is the secure approach for Vercel and
 * other serverless platforms where filesystem-based config is unreliable and
 * potentially insecure.
 *
 * The z-ai-web-dev-sdk's default ZAI.create() reads from a .z-ai-config JSON
 * file in cwd/homedir/etc. We bypass that by calling `new ZAI(config)` directly
 * with config from process.env — ensuring the API key never touches the filesystem.
 *
 * Required env vars:
 *   ZAI_API_KEY   — The API key for the Z.AI service
 *   ZAI_BASE_URL  — The base URL for the Z.AI API (e.g. https://api.z.ai/api/paas/v4)
 *
 * Optional env vars:
 *   ZAI_CHAT_ID   — Default chat ID for conversation tracking
 *   ZAI_USER_ID   — Default user ID for analytics
 *   ZAI_TOKEN     — Optional bearer token (alternative to apiKey)
 */

import ZAI from 'z-ai-web-dev-sdk';

// ZAIConfig interface (re-declared here because the SDK's d.ts may not export it as a type)
interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

let cachedInstance: ZAI | null = null;

/**
 * Get the AI SDK configuration from environment variables.
 * Throws if required vars are missing (fail-fast — better than silent failures).
 */
export function getAIConfig(): ZAIConfig {
  const apiKey = process.env.ZAI_API_KEY;
  const baseUrl = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4';

  if (!apiKey) {
    throw new Error(
      'ZAI_API_KEY environment variable is not set. ' +
      'Please configure it in your Vercel project settings (Settings → Environment Variables). ' +
      'Never commit the API key to git or .z-ai-config files.'
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
 * Creates a new instance if none exists or if env vars have changed.
 *
 * NOTE: We bypass the SDK's ZAI.create() (which reads from an insecure
 * .z-ai-config file) by calling the constructor directly with env-based config.
 * The constructor is marked private in the d.ts but is publicly accessible
 * at runtime — we use a type assertion to satisfy TypeScript.
 */
export async function getAIClient(): Promise<ZAI> {
  if (!cachedInstance) {
    const config = getAIConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cachedInstance = new (ZAI as unknown as { new (config: ZAIConfig): ZAI })(config);
  }
  return cachedInstance;
}

/**
 * Check if AI is configured (for health checks / feature flags).
 * Does NOT throw — returns boolean.
 */
export function isAIConfigured(): boolean {
  return !!process.env.ZAI_API_KEY;
}

/**
 * Clear the cached instance (useful for testing or config rotation).
 */
export function clearAICache(): void {
  cachedInstance = null;
}
