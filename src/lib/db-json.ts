/**
 * Dual-DB JSON compatibility helpers
 *
 * In production (PostgreSQL): Prisma Json fields accept/return native JS objects
 * In local dev (SQLite):      Those same fields are String — need JSON.stringify/parse
 *
 * These helpers auto-detect the provider so a single codebase works with both.
 */

let _isPostgreSQL: boolean | undefined;

function isPostgreSQL(): boolean {
  if (_isPostgreSQL !== undefined) return _isPostgreSQL;
  const url = (process.env.DATABASE_URL ?? '').toLowerCase();
  _isPostgreSQL = url.startsWith('postgresql://') || url.startsWith('postgres://');
  return _isPostgreSQL;
}

/**
 * Prepare a value for writing to a JSON-capable field.
 * - PostgreSQL (Json column): return the object as-is so Prisma stores proper JSON
 * - SQLite (String column):   return JSON.stringify(obj) so the string is stored
 */
export function jsonVal(obj: unknown): string | unknown {
  if (obj === null || obj === undefined) return obj;
  if (isPostgreSQL()) return obj;
  return JSON.stringify(obj);
}

/**
 * Parse a value read from a JSON-capable field.
 * - PostgreSQL (Json column): Prisma already returns the parsed object, return as-is
 * - SQLite (String column):   Parse the JSON string into an object
 */
export function jsonParse<T = unknown>(val: unknown): T {
  if (val === null || val === undefined) return val as T;
  if (typeof val === 'string') return JSON.parse(val) as T;
  return val as T; // Already an object (PostgreSQL)
}

/**
 * Return the DB provider name for display/logging.
 */
export function dbProvider(): 'postgresql' | 'sqlite' {
  return isPostgreSQL() ? 'postgresql' : 'sqlite';
}
