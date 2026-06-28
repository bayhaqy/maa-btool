import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders, STATUS_ACTIVE, STATUS_DRAFT } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin, checkAuthAndPermission } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// Validate a single row against META_FIELDS (reused from records)
async function validatePayload(moduleId: string, payload: Record<string, unknown>) {
  const fields = await db.metaField.findMany({
    where: { moduleId, isActive: true },
    include: { validations: true },
  });

  const errors: string[] = [];

  for (const field of fields) {
    const value = payload[field.fieldCode];

    if (field.isRequired && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) is required`);
      continue;
    }

    if (value === undefined || value === null || value === '') continue;

    if (field.dataType === 'NUMBER' && isNaN(Number(value))) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a number`);
    }
    if (field.dataType === 'EMAIL' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a valid email`);
    }
    if (field.dataType === 'URL' && typeof value === 'string' && !/^https?:\/\/.+/.test(value)) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a valid URL`);
    }

    for (const validation of field.validations) {
      if (validation.ruleType === 'REGEX') {
        try {
          const regex = new RegExp(validation.ruleValue);
          if (typeof value === 'string' && !regex.test(value)) {
            errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) does not match pattern`);
          }
        } catch { /* skip invalid regex */ }
      }
      if (validation.ruleType === 'MIN_LENGTH' && typeof value === 'string') {
        if (value.length < parseInt(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at least ${validation.ruleValue} characters`);
        }
      }
      if (validation.ruleType === 'MAX_LENGTH' && typeof value === 'string') {
        if (value.length > parseInt(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at most ${validation.ruleValue} characters`);
        }
      }
      if (validation.ruleType === 'MIN_VALUE') {
        if (Number(value) < Number(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at least ${validation.ruleValue}`);
        }
      }
      if (validation.ruleType === 'MAX_VALUE') {
        if (Number(value) > Number(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at most ${validation.ruleValue}`);
        }
      }
    }
  }

  return errors;
}

// GET /api/bulk?action=template&moduleId=xxx - Generate Excel template
// GET /api/bulk?action=export&moduleId=xxx - Export ACTIVE records
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check bulk:read permission
    const readCheck = checkAuthAndPermission(tokenPayload, 'bulk:read');
    if (readCheck.error) {
      return NextResponse.json({ error: readCheck.error }, { status: readCheck.status });
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
    const action = searchParams.get('action');
    const moduleId = searchParams.get('moduleId');

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    }

    const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    const fields = await db.metaField.findMany({
      where: { moduleId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Generate template with headers from META_FIELDS
    if (action === 'template') {
      const headers = fields.map((f) => ({
        fieldCode: f.fieldCode,
        fieldName: f.fieldName,
        dataType: f.dataType,
        isRequired: f.isRequired,
        placeholder: f.placeholder || '',
      }));

      return NextResponse.json({ headers, moduleName: metaModule.moduleName, moduleCode: metaModule.moduleCode });
    }

    // Export all ACTIVE records for the module
    if (action === 'export') {
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');

      const where: Record<string, unknown> = {
        moduleId,
        status: STATUS_ACTIVE,
      };

      if (!isSuperAdmin) {
        where.companyId = tokenPayload.companyId;
      }

      const records = await db.dataRecord.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          company: { select: { companyCode: true, companyName: true } },
        },
      });

      const data = records.map((r) => {
        const payload = JSON.parse(r.currentPayload);
        return {
          _id: r.id,
          _status: r.status,
          _company: r.company.companyCode,
          _createdAt: r.createdAt,
          _updatedAt: r.updatedAt,
          ...payload,
        };
      });

      return NextResponse.json({
        data,
        total: data.length,
        moduleName: metaModule.moduleName,
        moduleCode: metaModule.moduleCode,
        fields: fields.map((f) => f.fieldCode),
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use ?action=template or ?action=export' }, { status: 400 });
  } catch (error) {
    console.error('Bulk GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/bulk?action=import - Import records
// POST /api/bulk?action=export - Export records (POST with filters)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: write endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('write', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Import requires bulk:write, export requires bulk:read
    if (action === 'import') {
      const writeCheck = checkAuthAndPermission(tokenPayload, 'bulk:write');
      if (writeCheck.error) {
        return NextResponse.json({ error: writeCheck.error }, { status: writeCheck.status });
      }
    }
    if (action === 'export') {
      const readCheck = checkAuthAndPermission(tokenPayload, 'bulk:read');
      if (readCheck.error) {
        return NextResponse.json({ error: readCheck.error }, { status: readCheck.status });
      }
    }
    const body = await request.json();

    // Import
    if (action === 'import') {
      // Check bulk:write permission
      const writeCheck = checkAuthAndPermission(tokenPayload, 'bulk:write');
      if (writeCheck.error) {
        return NextResponse.json({ error: writeCheck.error }, { status: writeCheck.status });
      }

      const { moduleId, data } = body;

      if (!moduleId || !data || !Array.isArray(data)) {
        return NextResponse.json({ error: 'moduleId and data array are required' }, { status: 400 });
      }

      const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
      if (!metaModule) {
        return NextResponse.json({ error: 'Module not found' }, { status: 404 });
      }

      // Create async job to track
      const job = await db.asyncBatchJob.create({
        data: {
          userId: tokenPayload.userId,
          moduleId,
          jobType: 'IMPORT',
          status: 'PROCESSING',
          totalRows: data.length,
        },
      });

      let validRows = 0;
      let invalidRows = 0;
      const errors: Array<{ row: number; errors: string[] }> = [];

      for (let i = 0; i < data.length; i++) {
        const rowErrors = await validatePayload(moduleId, data[i]);
        if (rowErrors.length > 0) {
          invalidRows++;
          errors.push({ row: i + 1, errors: rowErrors });
        } else {
          validRows++;
          await db.dataRecord.create({
            data: {
              moduleId,
              companyId: tokenPayload.companyId,
              status: STATUS_DRAFT,
              currentPayload: JSON.stringify(data[i]),
              createdById: tokenPayload.userId,
              updatedById: tokenPayload.userId,
            },
          });
        }
      }

      // Update job status
      await db.asyncBatchJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          processedRows: validRows,
          failedRows: invalidRows,
          errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        jobId: job.id,
        totalRows: data.length,
        validRows,
        invalidRows,
        errors,
      });
    }

    // Export with filters (POST)
    if (action === 'export') {
      const { moduleId, filters } = body;

      if (!moduleId) {
        return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
      }

      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      const where: Record<string, unknown> = {
        moduleId,
        status: STATUS_ACTIVE,
      };

      if (!isSuperAdmin) {
        where.companyId = tokenPayload.companyId;
      }

      const records = await db.dataRecord.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          company: { select: { companyCode: true, companyName: true } },
        },
      });

      const data = records.map((r) => {
        const payload = JSON.parse(r.currentPayload);
        return {
          _id: r.id,
          _status: r.status,
          _company: r.company.companyCode,
          _createdAt: r.createdAt,
          _updatedAt: r.updatedAt,
          ...payload,
        };
      });

      return NextResponse.json({ data, total: data.length, filters });
    }

    return NextResponse.json({ error: 'Invalid action. Use ?action=import or ?action=export' }, { status: 400 });
  } catch (error) {
    console.error('Bulk POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
