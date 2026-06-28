/**
 * API Security Middleware
 *
 * Provides helper functions for:
 *   - Input validation against a schema
 *   - XSS prevention via string sanitization
 *   - CSRF protection via origin/host check
 *   - Per-user rate limiting
 */

import { rateLimitByCategory, type EndpointCategory } from './rate-limit';
import { getTokenFromHeaders, type TokenPayload } from './auth';
import { hasPermission } from './rbac';

// ============================================================
// Input Validation
// ============================================================

type FieldRule = 'string' | 'number' | 'email' | 'url' | 'boolean' | 'date' | 'array' | 'object';

/**
 * Validate input data against a simple schema definition.
 *
 * @param data   The input data to validate
 * @param schema A map of field names to expected types, e.g. { name: 'string', age: 'number' }
 * @returns      { valid: boolean, errors: string[] }
 */
export function validateInput(
  data: unknown,
  schema: Record<string, string>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  const obj = data as Record<string, unknown>;

  for (const [field, rule] of Object.entries(schema)) {
    const value = obj[field];
    const isOptional = rule.endsWith('?');
    const type = isOptional ? rule.slice(0, -1) : rule;

    // Optional + missing → skip
    if (isOptional && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Required + missing → error
    if (!isOptional && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${field}" is required`);
      continue;
    }

    // Type checks
    switch (type as FieldRule) {
      case 'string':
        if (typeof value !== 'string') errors.push(`Field "${field}" must be a string`);
        break;
      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) errors.push(`Field "${field}" must be a number`);
        break;
      case 'email':
        if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(`Field "${field}" must be a valid email`);
        }
        break;
      case 'url':
        if (typeof value !== 'string' || !/^https?:\/\/.+/.test(value)) {
          errors.push(`Field "${field}" must be a valid URL`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`Field "${field}" must be a boolean`);
        break;
      case 'date':
        if (typeof value !== 'string' || isNaN(Date.parse(value))) {
          errors.push(`Field "${field}" must be a valid date`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) errors.push(`Field "${field}" must be an array`);
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push(`Field "${field}" must be an object`);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// XSS Prevention
// ============================================================

/**
 * Sanitize a string to prevent XSS attacks.
 *
 * - Strips all HTML tags
 * - Encodes dangerous characters (<, >, &, ", ')
 * - Trims whitespace
 *
 * For non-string inputs, returns an empty string.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    // Remove script tags and their contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers (on*)
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove javascript: URLs
    .replace(/javascript:/gi, '')
    // Remove data: URLs that could be harmful
    .replace(/data:text\/html/gi, '')
    // Strip remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Encode dangerous characters
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

// ============================================================
// CSRF Protection
// ============================================================

/**
 * Check CSRF protection by validating the Origin header against the Host.
 *
 * Returns true if the request is safe, false if it fails CSRF check.
 *
 * In a same-origin setup (which our MDM app is), the browser
 * automatically sends the Origin header on cross-origin requests.
 * If Origin is missing (e.g., server-to-server), we allow it since
 * CSRF primarily targets browser-based attacks.
 */
export function checkCSRF(origin: string | null, host: string | null): boolean {
  // No origin header → likely server-to-server or non-browser → allow
  if (!origin) return true;

  // No host header → can't verify → allow (defensive)
  if (!host) return true;

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.hostname;

    // Check if origin matches host (with or without port)
    if (originHost === host || host.startsWith(originHost + ':')) {
      return true;
    }

    // Allow localhost in development
    if (process.env.NODE_ENV !== 'production') {
      if (originHost === 'localhost' || originHost === '127.0.0.1') {
        return true;
      }
    }

    return false;
  } catch {
    // Malformed URL — reject
    return false;
  }
}

// ============================================================
// Per-user Rate Limiting
// ============================================================

/**
 * Rate limit by user ID for a specific endpoint category.
 *
 * Returns true if the request is allowed, false if rate limited.
 * When rate limited, the caller should return a 429 response.
 */
export async function rateLimitByUser(
  userId: string,
  endpoint: EndpointCategory,
): Promise<boolean> {
  const result = rateLimitByCategory(endpoint, userId);
  return result.allowed;
}

// ============================================================
// Combined security check helper for API routes
// ============================================================

export interface SecurityCheckResult {
  authorized: boolean;
  tokenPayload: TokenPayload | null;
  error?: string;
  status?: number;
}

/**
 * Combined security check that applies:
 *   1. Authentication (valid Bearer token)
 *   2. CSRF check (origin vs host)
 *   3. Rate limiting (per user by endpoint category)
 *   4. Authorization (permission check)
 *
 * Returns a result object with `authorized: true` if all checks pass,
 * or `authorized: false` with an appropriate error and status code.
 */
export function apiSecurityCheck(params: {
  headers: Headers;
  permission?: string;
  endpointCategory?: EndpointCategory;
  requireCSRF?: boolean;
}): SecurityCheckResult {
  const { headers, permission, endpointCategory, requireCSRF } = params;

  // 1. Authentication
  const tokenPayload = getTokenFromHeaders(headers);
  if (!tokenPayload) {
    return { authorized: false, tokenPayload: null, error: 'Unauthorized', status: 401 };
  }

  // 2. CSRF check (optional, for mutation endpoints)
  if (requireCSRF) {
    const origin = headers.get('origin');
    const host = headers.get('host');
    if (!checkCSRF(origin, host)) {
      return { authorized: false, tokenPayload, error: 'CSRF check failed', status: 403 };
    }
  }

  // 3. Rate limiting
  if (endpointCategory) {
    const result = rateLimitByCategory(endpointCategory, tokenPayload.userId);
    if (!result.allowed) {
      return {
        authorized: false,
        tokenPayload,
        error: 'Too many requests. Please try again later.',
        status: 429,
      };
    }
  }

  // 4. Authorization
  if (permission) {
    if (!hasPermission(tokenPayload.roles, permission)) {
      return {
        authorized: false,
        tokenPayload,
        error: `Insufficient permissions. Required: ${permission}`,
        status: 403,
      };
    }
  }

  return { authorized: true, tokenPayload };
}
