import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';
import { rateLimitByCategory } from '@/lib/rate-limit';
import {
  filterRecords,
  type AdvancedFilter,
  type FilterableField,
} from '@/lib/advanced-filter';
import {
  STATUS_ACTIVE,
  STATUS_DRAFT,
  STATUS_REVISION_PENDING,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// Types
// ============================================================

type OperationType =
  | 'SET_VALUE'
  | 'CLEAR'
  | 'MERGE'
  | 'SET_NAME'
  | 'SET_STATUS'
  | 'RUN_RULE';

interface BulkOperation {
  operation: OperationType;
  fieldCode?: string;
  value?: string;
  config?: Record<string, unknown>;
}

type BulkMode = 'PREVIEW' | 'PREFLIGHT' | 'APPLY';

interface CreateBulkJobBody {
  moduleId: string;
  name?: string;
  targetFilter: AdvancedFilter[];
  operations: BulkOperation[];
  mode: BulkMode;
}

interface RowResult {
  recordId: string;
  ok: boolean;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  error?: string;
  amendment?: boolean;
}

const VALID_STATUSES = new Set(['DRAFT', 'IN_REVIEW', 'ACTIVE', 'ARCHIVED']);

// ============================================================
// GET /api/bulk-update         → list all jobs (Super Admin + Manager)
// GET /api/bulk-update?id=xxx  → single job with full results
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'data:read')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: data:read' },
        { status: 403 }
      );
    }

    // ── Rate limit: read endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const job = await db.bulkUpdateJob.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, username: true, displayName: true },
          },
          module: {
            select: { id: true, moduleCode: true, moduleName: true },
          },
        },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json({ job });
    }

    const isSA = checkSuperAdmin(tokenPayload.roles);
    const where = isSA ? {} : { userId: tokenPayload.userId };

    const jobs = await db.bulkUpdateJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, displayName: true },
        },
        module: {
          select: { id: true, moduleCode: true, moduleName: true },
        },
      },
      take: 200,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Bulk update GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// POST /api/bulk-update — create + optionally run a bulk update job
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'data:bulk')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: data:bulk' },
        { status: 403 }
      );
    }

    // ── Rate limit: write endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('write', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = (await request.json()) as CreateBulkJobBody;
    const { moduleId, name, targetFilter, operations, mode } = body;

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    }
    if (!Array.isArray(targetFilter)) {
      return NextResponse.json(
        { error: 'targetFilter must be an array' },
        { status: 400 }
      );
    }
    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json(
        { error: 'operations must be a non-empty array' },
        { status: 400 }
      );
    }
    if (!['PREVIEW', 'PREFLIGHT', 'APPLY'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be PREVIEW, PREFLIGHT, or APPLY' },
        { status: 400 }
      );
    }

    const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // 1. Save the job to DB with status='QUEUED'.
    const job = await db.bulkUpdateJob.create({
      data: {
        userId: tokenPayload.userId,
        moduleId,
        name: name || `Bulk Update — ${operations.length} ops`,
        targetFilter: JSON.stringify(targetFilter),
        operations: JSON.stringify(operations),
        status: 'QUEUED',
        mode,
      },
    });

    // 2. Load all records in the module (excluding ARCHIVED).
    const isSA = checkSuperAdmin(tokenPayload.roles);
    const recordWhere: Record<string, unknown> = {
      moduleId,
      status: { not: 'ARCHIVED' },
    };
    if (!isSA) recordWhere.companyId = tokenPayload.companyId;

    const allRecords = await db.dataRecord.findMany({
      where: recordWhere,
      select: {
        id: true,
        currentPayload: true,
        status: true,
        moduleId: true,
        companyId: true,
        version: true,
      },
    });

    // 3. Load module fields for filter evaluation.
    const fields = await db.metaField.findMany({
      where: { moduleId, isActive: true },
      select: { fieldCode: true, dataType: true, fieldName: true, isRequired: true },
    });
    const filterableFields: FilterableField[] = fields.map((f) => ({
      fieldCode: f.fieldCode,
      dataType: f.dataType,
    }));

    // 4. Apply targetFilter client-side.
    const matched = filterRecords(allRecords, targetFilter, filterableFields);

    // Mark as RUNNING.
    await db.bulkUpdateJob.update({
      where: { id: job.id },
      data: {
        status: mode === 'PREVIEW' ? 'PREVIEWING' : 'RUNNING',
        totalRecords: matched.length,
        startedAt: new Date(),
      },
    });

    // 5/6/7. Apply operations.
    let processed: RowResult[] = [];
    let writeCount = 0;
    let amendmentCount = 0;

    if (mode === 'PREVIEW') {
      // PREVIEW: first 10 matched, no DB writes.
      const previewSet = matched.slice(0, 10);
      processed = previewSet.map((rec) => {
        const before = safeParsePayload(rec.currentPayload);
        const after = applyOperations(before, operations);
        return {
          recordId: rec.id,
          ok: true,
          before,
          after,
        };
      });
    } else {
      // PREFLIGHT or APPLY — process ALL matched records.
      processed = matched.map((rec) => {
        const before = safeParsePayload(rec.currentPayload);
        try {
          const after = applyOperations(before, operations);
          return {
            recordId: rec.id,
            ok: true,
            before,
            after,
          };
        } catch (err) {
          return {
            recordId: rec.id,
            ok: false,
            before,
            after: before,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      });

      // For APPLY — persist changes to DB following the amendment workflow.
      if (mode === 'APPLY') {
        for (const result of processed) {
          if (!result.ok) continue;
          try {
            const rec = allRecords.find((r) => r.id === result.recordId);
            if (!rec) {
              result.ok = false;
              result.error = 'Record not found';
              continue;
            }

            // Handle SET_STATUS operation: change the record.status directly
            // (no DataVersion needed for status transitions via bulk update).
            let newStatus: string | null = null;
            for (const op of operations) {
              if (op.operation === 'SET_STATUS' && op.value && VALID_STATUSES.has(op.value)) {
                newStatus = op.value;
              }
            }

            if (rec.status === STATUS_ACTIVE) {
              // ── Amendment workflow ──
              // Snapshot the proposed new payload as a DataVersion, flip
              // record to REVISION_PENDING, and open an ApprovalTicket.
              const maxVersion = await db.dataVersion.findFirst({
                where: { recordId: rec.id },
                orderBy: { versionNumber: 'desc' },
                select: { versionNumber: true },
              });
              const newVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;

              await db.dataVersion.create({
                data: {
                  recordId: rec.id,
                  payloadSnapshot: JSON.stringify(result.after),
                  versionNumber: newVersionNumber,
                  changedById: tokenPayload.userId,
                  changeReason: `Bulk Update: ${job.name || job.id}`,
                  status: STATUS_REVISION_PENDING,
                },
              });

              await db.dataRecord.update({
                where: { id: rec.id },
                data: {
                  currentPayload: JSON.stringify(result.after),
                  status: newStatus || STATUS_REVISION_PENDING,
                  updatedById: tokenPayload.userId,
                },
              });

              await db.approvalTicket.create({
                data: {
                  recordId: rec.id,
                  requestedById: tokenPayload.userId,
                  status: 'PENDING',
                  deltaPayload: rec.currentPayload,
                },
              });

              result.amendment = true;
              amendmentCount += 1;
              writeCount += 1;
            } else if (
              rec.status === STATUS_DRAFT ||
              rec.status === STATUS_REVISION_PENDING
            ) {
              // Direct update for DRAFT / REVISION_PENDING records.
              await db.dataRecord.update({
                where: { id: rec.id },
                data: {
                  currentPayload: JSON.stringify(result.after),
                  status: newStatus || rec.status,
                  updatedById: tokenPayload.userId,
                },
              });
              writeCount += 1;
            } else {
              // IN_REVIEW / REJECTED / ARCHIVED — skip with explanation.
              result.ok = false;
              result.error = `Cannot edit record in ${rec.status} status via bulk update`;
            }
          } catch (err) {
            result.ok = false;
            result.error = err instanceof Error ? err.message : 'Update failed';
          }
        }
      }
    }

    const okCount = processed.filter((r) => r.ok).length;
    const failedCount = processed.length - okCount;

    // 8. Update the job with results.
    await db.bulkUpdateJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        totalRecords: matched.length,
        okRecords: okCount,
        failedRecords: failedCount,
        results: JSON.stringify(processed),
        completedAt: new Date(),
      },
    });

    // 9. Audit log entry.
    await logAudit({
      userId: tokenPayload.userId,
      action: 'BULK_UPDATE',
      entityType: 'BulkUpdateJob',
      entityId: job.id,
      moduleName: metaModule.moduleCode,
      description: `Bulk update ${mode.toLowerCase()} on module ${metaModule.moduleName}: ${matched.length} matched, ${okCount} ok, ${failedCount} failed${amendmentCount > 0 ? `, ${amendmentCount} amendments` : ''}`,
      newValues: {
        mode,
        matchedCount: matched.length,
        okCount,
        failedCount,
        amendmentCount,
        operationsCount: operations.length,
      },
      companyId: tokenPayload.companyId,
    });

    const finalJob = await db.bulkUpdateJob.findUnique({
      where: { id: job.id },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
      },
    });

    void writeCount;

    return NextResponse.json({ job: finalJob, results: processed });
  } catch (error) {
    console.error('Bulk update POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// Helpers
// ============================================================

function safeParsePayload(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Apply a list of operations to a payload IN-MEMORY (no DB writes). */
function applyOperations(
  payload: Record<string, unknown>,
  operations: BulkOperation[]
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  for (const op of operations) {
    switch (op.operation) {
      case 'SET_VALUE': {
        if (!op.fieldCode) throw new Error('SET_VALUE requires fieldCode');
        next[op.fieldCode] = op.value ?? '';
        break;
      }
      case 'CLEAR': {
        if (!op.fieldCode) throw new Error('CLEAR requires fieldCode');
        delete next[op.fieldCode];
        break;
      }
      case 'MERGE': {
        if (!op.fieldCode) throw new Error('MERGE requires fieldCode');
        const existing = next[op.fieldCode];
        const parts: string[] = [];
        if (typeof existing === 'string' && existing.trim()) {
          parts.push(...existing.split(',').map((s) => s.trim()).filter(Boolean));
        } else if (existing !== undefined && existing !== null && existing !== '') {
          parts.push(String(existing));
        }
        if (op.value) {
          parts.push(
            ...op.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          );
        }
        next[op.fieldCode] = parts.join(', ');
        break;
      }
      case 'SET_NAME': {
        // Set the canonical "name" field on the payload.
        next['name'] = op.value ?? '';
        break;
      }
      case 'SET_STATUS': {
        // Status is applied at the record level — for in-memory preview we
        // also stash it on the payload under `_status` so reviewers can see
        // the proposed transition.
        if (op.value && VALID_STATUSES.has(op.value)) {
          next['_status'] = op.value;
        }
        break;
      }
      case 'RUN_RULE': {
        // Skip for MVP — would invoke BusinessRule engine.
        break;
      }
      default:
        throw new Error(`Unknown operation: ${op.operation}`);
    }
  }
  return next;
}
