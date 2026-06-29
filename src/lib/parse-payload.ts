/**
 * Frontend-safe JSON parsers for data coming from the API.
 *
 * In PostgreSQL (production): Prisma returns Json fields as native JS objects.
 *   → NextResponse.json() serializes → fetch().json() deserializes back to object
 *   → The value is already a parsed object, NOT a string.
 *
 * In SQLite (local dev): Json fields are stored as strings.
 *   → After API round-trip, the value could be either a string or object.
 *
 * These helpers handle BOTH cases safely, preventing JSON.parse on non-string values.
 */

/**
 * Safely parse any JSON-capable value from the database.
 * Handles both string (SQLite) and object (PostgreSQL) values.
 */
export function parsePayload<T = Record<string, unknown>>(
  val: unknown,
  fallback: T = {} as T,
): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  // Already a parsed object/array (PostgreSQL round-trip)
  if (typeof val === 'object') {
    return val as T;
  }
  return fallback;
}

/**
 * Alias for parsePayload — semantically clearer when parsing
 * non-payload JSON columns (e.g., conditionJson, connectionConfig).
 */
export const safeJsonParse = parsePayload;

/**
 * Get a single field value from a currentPayload, with safe parsing.
 */
export function getPayloadField(
  record: { currentPayload?: unknown },
  fieldCode: string,
): unknown {
  const payload = parsePayload(record.currentPayload);
  return (payload as Record<string, unknown>)?.[fieldCode] ?? '-';
}

/**
 * Safely stringify a payload for editing/display purposes.
 */
export function stringifyPayload(val: unknown): string {
  if (val === null || val === undefined) return '{}';
  if (typeof val === 'string') return val;
  return JSON.stringify(val, null, 2);
}
