/**
 * Upstash Redis Cache Integration
 *
 * Provides a thin caching layer over Upstash Redis with an in-memory Map
 * fallback so the app keeps working locally (or in any environment) without
 * a Redis instance configured. All functions are async to keep the API
 * uniform across both backends.
 *
 * Configure with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
 */

import { Redis } from '@upstash/redis';

/** In-memory fallback cache used when Redis is not configured. */
class MemoryCache {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deletePattern(pattern: string): Promise<number> {
    const regex = patternToRegExp(pattern);
    let count = 0;
    for (const key of [...this.store.keys()]) {
      if (regex.test(key)) {
        this.store.delete(key);
        count += 1;
      }
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = patternToRegExp(pattern);
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key)) result.push(key);
    }
    return result;
  }
}

/** Convert a Redis-style glob pattern (e.g. `user:*`) to a RegExp. */
function patternToRegExp(pattern: string): RegExp {
  // Escape regex special chars except `*` and `?` which we translate.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

// Singleton memory fallback (one per process).
const memoryCache = new MemoryCache();

/**
 * Get a configured Upstash Redis client.
 *
 * Returns `null` when either `UPSTASH_REDIS_REST_URL` or
 * `UPSTASH_REDIS_REST_TOKEN` is missing. Callers automatically fall back to
 * the in-memory cache via the wrapper helpers below.
 */
export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || url.trim() === '' || token.trim() === '') {
    return null;
  }
  try {
    return new Redis({ url, token });
  } catch (err) {
    console.warn('[redis] Failed to construct Redis client:', err);
    return null;
  }
}

/**
 * Retrieve a cached value by key.
 *
 * @typeParam T - The expected type of the cached value.
 * @param key - Cache key.
 * @returns The cached value, or `null` if not found / Redis not configured.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) {
    return memoryCache.get<T>(key);
  }
  try {
    const value = await redis.get<T>(key);
    return value ?? null;
  } catch (err) {
    console.warn('[redis] cacheGet failed, falling back to memory:', err);
    return memoryCache.get<T>(key);
  }
}

/**
 * Store a value in cache with an optional TTL.
 *
 * @param key - Cache key.
 * @param value - Any JSON-serializable value.
 * @param ttlSeconds - Optional time-to-live in seconds. If omitted the value
 *                     persists until explicitly deleted (or evicted by Redis
 *                     memory policy).
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    await memoryCache.set(key, value, ttlSeconds);
    return;
  }
  try {
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(key, value, { ex: ttlSeconds });
    } else {
      await redis.set(key, value);
    }
  } catch (err) {
    console.warn('[redis] cacheSet failed, falling back to memory:', err);
    await memoryCache.set(key, value, ttlSeconds);
  }
}

/**
 * Delete a single key from cache.
 *
 * @param key - Cache key.
 */
export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    await memoryCache.delete(key);
    return;
  }
  try {
    await redis.del(key);
  } catch (err) {
    console.warn('[redis] cacheDelete failed, falling back to memory:', err);
    await memoryCache.delete(key);
  }
}

/**
 * Delete all keys matching a glob pattern (e.g. `user:*`).
 *
 * Uses SCAN (Upstash) so it's safe for large keyspaces. Falls back to a
 * linear scan in the in-memory cache.
 *
 * @param pattern - Redis-style glob pattern.
 * @returns The number of keys deleted.
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const redis = getRedis();
  if (!redis) {
    return memoryCache.deletePattern(pattern);
  }
  try {
    let cursor = '0';
    let deleted = 0;
    do {
      const result = await redis.scan(cursor, { match: pattern, count: 200 });
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
    return deleted;
  } catch (err) {
    console.warn(
      '[redis] cacheDeletePattern failed, falling back to memory:',
      err,
    );
    return memoryCache.deletePattern(pattern);
  }
}
