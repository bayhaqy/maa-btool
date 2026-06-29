/**
 * Frontend-safe JSON payload parser
 *
 * When data comes from the API:
 * - PostgreSQL (production): Prisma returns currentPayload as a native JS object
 *   → NextResponse.json() serializes it → fetch().json() deserializes back to object
 *   → currentPayload is already an object, NOT a string
 *
 * - SQLite (local dev): currentPayload may be stored as a string
 *   → After API round-trip it could be either a string or object
 *
 * This helper handles BOTH cases safely, preventing JSON.parse on non-string values.
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
  // Already a parsed object (PostgreSQL round-trip)
  if (typeof val === 'object') {
    return val as T;
  }
  return fallback;
}

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
