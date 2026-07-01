import { db } from '@/lib/db';
import { getTokenFromHeaders, type TokenPayload } from '@/lib/auth';

// ============================================================
// A. Audit Event Types
// ============================================================

export const AuditAction = {
  // Auth events
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_PASSWORD_CHANGE: 'AUTH_PASSWORD_CHANGE',

  // Record events
  RECORD_CREATE: 'RECORD_CREATE',
  RECORD_UPDATE: 'RECORD_UPDATE',
  RECORD_DELETE: 'RECORD_DELETE',
  RECORD_STATUS_CHANGE: 'RECORD_STATUS_CHANGE',

  // Module/Schema events
  MODULE_CREATE: 'MODULE_CREATE',
  MODULE_UPDATE: 'MODULE_UPDATE',
  MODULE_DELETE: 'MODULE_DELETE',

  // Workflow events
  WORKFLOW_APPROVE: 'WORKFLOW_APPROVE',
  WORKFLOW_REJECT: 'WORKFLOW_REJECT',
  WORKFLOW_DELEGATE: 'WORKFLOW_DELEGATE',

  // User management events
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  USER_IMPERSONATE: 'USER_IMPERSONATE',

  // Role events
  ROLE_ASSIGN: 'ROLE_ASSIGN',
  ROLE_REMOVE: 'ROLE_REMOVE',

  // Settings events
  SETTINGS_CHANGE: 'SETTINGS_CHANGE',
  AI_CONFIG_CHANGE: 'AI_CONFIG_CHANGE',

  // Bulk operations
  BULK_IMPORT: 'BULK_IMPORT',
  BULK_EXPORT: 'BULK_EXPORT',
  BULK_UPDATE: 'BULK_UPDATE',

  // Data quality events
  DATA_QUALITY_CHECK: 'DATA_QUALITY_CHECK',
  DEDUP_MERGE: 'DEDUP_MERGE',
  BUSINESS_RULE_TRIGGER: 'BUSINESS_RULE_TRIGGER',

  // AI events
  AI_CLASSIFY: 'AI_CLASSIFY',
  AI_ENRICH: 'AI_ENRICH',
  AI_QUALITY_CHECK: 'AI_QUALITY_CHECK',
  AI_IMAGE_ANALYZE: 'AI_IMAGE_ANALYZE',
  AI_DUPLICATE_DETECT: 'AI_DUPLICATE_DETECT',
  AI_MATCH_RECORDS: 'AI_MATCH_RECORDS',
  AI_TRANSLATE: 'AI_TRANSLATE',
  AI_CATEGORIZE: 'AI_CATEGORIZE',

  // Rate limit violations
  RATE_LIMIT_VIOLATION: 'RATE_LIMIT_VIOLATION',

  // Legacy compatibility
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  IMPERSONATE: 'IMPERSONATE',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

// ============================================================
// B. Severity levels
// ============================================================

export type AuditSeverity = 'info' | 'warning' | 'critical';

const DEFAULT_SEVERITY: Record<string, AuditSeverity> = {
  AUTH_LOGIN: 'info',
  AUTH_LOGOUT: 'info',
  AUTH_FAILED: 'warning',
  AUTH_PASSWORD_CHANGE: 'warning',
  RECORD_CREATE: 'info',
  RECORD_UPDATE: 'info',
  RECORD_DELETE: 'warning',
  RECORD_STATUS_CHANGE: 'info',
  MODULE_CREATE: 'info',
  MODULE_UPDATE: 'info',
  MODULE_DELETE: 'critical',
  WORKFLOW_APPROVE: 'info',
  WORKFLOW_REJECT: 'info',
  WORKFLOW_DELEGATE: 'warning',
  USER_CREATE: 'info',
  USER_UPDATE: 'info',
  USER_DELETE: 'critical',
  USER_IMPERSONATE: 'critical',
  ROLE_ASSIGN: 'warning',
  ROLE_REMOVE: 'warning',
  SETTINGS_CHANGE: 'warning',
  AI_CONFIG_CHANGE: 'warning',
  BULK_IMPORT: 'info',
  BULK_EXPORT: 'info',
  BULK_UPDATE: 'warning',
  DATA_QUALITY_CHECK: 'info',
  DEDUP_MERGE: 'warning',
  BUSINESS_RULE_TRIGGER: 'info',
  RATE_LIMIT_VIOLATION: 'warning',
  PASSWORD_CHANGE: 'warning',
  IMPERSONATE: 'critical',
};

// ============================================================
// C. Extract request info helpers
// ============================================================

function extractIp(req?: Request): string {
  if (!req) return 'unknown';
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function extractUserAgent(req?: Request): string {
  if (!req) return 'unknown';
  return req.headers.get('user-agent') || 'unknown';
}

// ============================================================
// D. Structured Audit Entry & Helper Function
// ============================================================

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  severity?: AuditSeverity;
  req?: Request;
  // Override userId/companyId — if not provided, attempts to extract from token
  userId?: string;
  companyId?: string;
  // Legacy field compatibility
  moduleName?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Enhanced audit logging function.
 *
 * Captures a structured audit entry with:
 * - timestamp, userId, username, companyId
 * - action (event type), entityType, entityId, description
 * - oldValues (JSON), newValues (JSON)
 * - ipAddress, userAgent
 * - severity (info | warning | critical)
 *
 * If userId/companyId are not provided and a Request is given,
 * attempts to extract them from the Bearer token.
 *
 * Audit logging failures are caught and logged to console — they
 * should NEVER break the main operation.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    // Attempt to extract token info if userId not provided
    let userId = event.userId;
    let companyId = event.companyId;
    let username = event.username;

    if (!userId && event.req) {
      const tokenPayload: TokenPayload | null = getTokenFromHeaders(event.req.headers);
      if (tokenPayload) {
        userId = tokenPayload.userId;
        username = tokenPayload.username;
        companyId = tokenPayload.companyId;
      }
    }

    const severity = event.severity || DEFAULT_SEVERITY[event.action] || 'info';
    const ipAddress = event.ipAddress || extractIp(event.req);
    const userAgent = event.userAgent || extractUserAgent(event.req);

    await db.auditLog.create({
      data: {
        userId: userId || null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        moduleName: event.moduleName || null,
        description: event.description,
        oldValues: event.oldValues ? JSON.stringify(event.oldValues) : null,
        newValues: event.newValues ? JSON.stringify(event.newValues) : null,
        companyId: companyId || null,
        ipAddress,
        userAgent,
      },
    });

    // Log critical events to console for ops visibility
    if (severity === 'critical') {
      console.warn(`[AUDIT CRITICAL] ${event.action}: ${event.description} (user=${username || userId})`);
    }
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('Audit log error:', error);
  }
}

// ============================================================
// E. Legacy compatibility — keep existing function signatures
// ============================================================

/**
 * @deprecated Use logAudit() instead for richer audit entries.
 * Kept for backward compatibility with existing callers.
 */
export async function logAuditLegacy(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  moduleName?: string;
  description: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  companyId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  return logAudit({
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    description: params.description,
    oldValues: params.oldValues,
    newValues: params.newValues,
    companyId: params.companyId,
    moduleName: params.moduleName,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}

// ============================================================
// F. Sanitization helpers (kept from original)
// ============================================================

/**
 * Sanitize input string to prevent XSS and injection attacks.
 * Strips HTML tags and encodes dangerous characters.
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '') // Strip angle brackets
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

/**
 * Validate that a string is safe for use in queries (no SQL injection patterns).
 */
export function validateSafeString(input: string): boolean {
  const dangerousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/|xp_|sp_)/i,
  ];
  return !dangerousPatterns.some(pattern => pattern.test(input));
}
