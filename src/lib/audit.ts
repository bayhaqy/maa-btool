import { db } from '@/lib/db';

export async function logAudit(params: {
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
  try {
    return await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        moduleName: params.moduleName,
        description: params.description,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        companyId: params.companyId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('Audit log error:', error);
  }
}

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
