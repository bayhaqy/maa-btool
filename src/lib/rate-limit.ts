/**
 * Enhanced rate limiter with different limits for different endpoint types.
 *
 * Endpoint categories and their limits:
 *   - Auth endpoints:    10 requests/minute per IP
 *   - Read endpoints:   100 requests/minute per user
 *   - Write endpoints:   30 requests/minute per user
 *   - Admin endpoints:   15 requests/minute per user
 *   - AI endpoints:      20 requests/minute per user
 *
 * When rate limited, returns proper 429 responses with Retry-After header.
 * Rate limit violations are logged to the audit trail.
 */

import { logAudit, AuditAction } from './audit';

// ============================================================
// Types
// ============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** Seconds until reset (suitable for the Retry-After header). */
  retryAfterSeconds: number;
}

// ============================================================
// Bucket store & cleanup
// ============================================================

const buckets = new Map<string, RateLimitEntry>();

// Lightweight self-cleanup: every 5 minutes, prune expired buckets.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    try {
      cleanupRateLimit();
    } catch {
      // ignore — cleanup is best-effort
    }
  }, 5 * 60 * 1000).unref?.();
}

export function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

// ============================================================
// Core rate limit function
// ============================================================

/**
 * Check and increment the rate limit for the given key.
 *
 * Returns a result describing whether the request is allowed. When the
 * limit has been exceeded, `allowed` is false and the caller should
 * respond with HTTP 429 Too Many Requests plus a Retry-After header.
 *
 * Example:
 *   const rl = rateLimit(`login:${ip}`, { limit: 10, windowMs: 5 * 60_000 });
 *   if (!rl.allowed) {
 *     return NextResponse.json({ error: 'Too many requests' }, {
 *       status: 429,
 *       headers: { 'Retry-After': String(rl.retryAfterSeconds) },
 *     });
 *   }
 */
export function rateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  // No existing entry, or the window has expired — start fresh.
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: options.limit - 1,
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  // Within the window — increment and check.
  entry.count += 1;
  const remaining = Math.max(0, options.limit - entry.count);
  const allowed = entry.count <= options.limit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.ceil((entry.resetAt - now) / 1000);

  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
    retryAfterSeconds,
  };
}

// ============================================================
// Endpoint-category rate limit presets
// ============================================================

export type EndpointCategory = 'auth' | 'read' | 'write' | 'admin' | 'ai';

const CATEGORY_LIMITS: Record<EndpointCategory, RateLimitOptions> = {
  auth:  { limit: 10,  windowMs: 60 * 1000 },         // 10 req/min per IP
  read:  { limit: 100, windowMs: 60 * 1000 },         // 100 req/min per user
  write: { limit: 30,  windowMs: 60 * 1000 },         // 30 req/min per user
  admin: { limit: 15,  windowMs: 60 * 1000 },         // 15 req/min per user
  ai:    { limit: 20,  windowMs: 60 * 1000 },         // 20 req/min per user
};

/**
 * Rate-limit by endpoint category.
 *
 * For `auth` endpoints, the key is the IP address.
 * For all other categories, the key is the userId.
 *
 * If rate limited, logs a RATE_LIMIT_VIOLATION audit event.
 *
 * @returns The RateLimitResult — callers should check `.allowed`.
 */
export function rateLimitByCategory(
  category: EndpointCategory,
  identifier: string, // IP for auth, userId for others
): RateLimitResult {
  const opts = CATEGORY_LIMITS[category];
  const key = `${category}:${identifier}`;
  const result = rateLimit(key, opts);

  // Log rate limit violations to audit trail (fire-and-forget)
  if (!result.allowed) {
    logAudit({
      action: AuditAction.RATE_LIMIT_VIOLATION,
      entityType: 'RateLimit',
      description: `Rate limit exceeded for ${category} endpoint (key=${key})`,
      severity: 'warning',
    }).catch(() => {
      // Audit log failure must not break the rate limiter
    });
  }

  return result;
}

/**
 * Build a standard 429 response with proper headers.
 */
export function rateLimitResponse(result: RateLimitResult, category: EndpointCategory): ResponseInit {
  return {
    status: 429,
    headers: {
      'Retry-After': String(result.retryAfterSeconds),
      'X-RateLimit-Limit': String(CATEGORY_LIMITS[category].limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    },
  };
}
