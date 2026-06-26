/**
 * Simple in-memory rate limiter (no external dependencies).
 *
 * Uses a Map<string, { count, resetAt }> keyed by an arbitrary identifier
 * (typically an IP address or a composite key like `login:${ip}`).
 *
 * Note: Because this is in-memory and per-instance, it provides best-effort
 * rate limiting. In a serverless deployment (Vercel), each warm instance
 * keeps its own counter — which still raises the bar meaningfully for
 * brute-force attackers while keeping the implementation dependency-free.
 * For stricter guarantees, swap this out for a Redis-backed limiter.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

const buckets = new Map<string, RateLimitEntry>();

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

/**
 * Periodically prune expired entries to keep the Map from growing
 * unboundedly. Safe to call from anywhere; runs in O(n) over the keys.
 */
export function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

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
