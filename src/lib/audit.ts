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
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('Audit log error:', error);
  }
}
