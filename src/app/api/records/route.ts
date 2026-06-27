import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders, canTransition, STATUS_DRAFT, STATUS_IN_REVIEW, STATUS_ACTIVE, STATUS_ARCHIVED, STATUS_REVISION_PENDING, STATUS_REJECTED } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';

// Validate a record's payload against META_FIELDS
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
        } catch {
          // Invalid regex, skip
        }
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

// GET /api/records?moduleId=xxx&status=xxx&page=1&limit=20
// GET /api/records?action=detail&id=xxx
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    // Get single record detail
    if (action === 'detail' && id) {
      const isSA = checkSuperAdmin(tokenPayload.roles);

      const record = await db.dataRecord.findUnique({
        where: { id },
        include: {
          module: true,
          company: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            include: { changedBy: { select: { id: true, username: true, displayName: true } } },
          },
          approvalTickets: {
            orderBy: { createdAt: 'desc' },
            include: {
              requestedBy: { select: { id: true, username: true, displayName: true } },
              reviewedBy: { select: { id: true, username: true, displayName: true } },
            },
          },
        },
      });

      if (!record) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }

      // RLS: check company access (Super Admin bypasses)
      if (!isSA && record.companyId !== tokenPayload.companyId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      return NextResponse.json({ record });
    }

    // List records
    const moduleId = searchParams.get('moduleId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId query parameter is required' }, { status: 400 });
    }

    const isSA = checkSuperAdmin(tokenPayload.roles);

    const where: Record<string, unknown> = {
      moduleId,
      status: { not: STATUS_ARCHIVED },
    };

    // RLS: filter by company (Super Admin sees all)
    if (!isSA) {
      where.companyId = tokenPayload.companyId;
    }

    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      db.dataRecord.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          company: { select: { id: true, companyCode: true, companyName: true } },
          locker: { select: { id: true, username: true, displayName: true } },
        },
      }),
      db.dataRecord.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error) {
    console.error('Records GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/records - Create record
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:write')) {
      return NextResponse.json({ error: 'Insufficient permissions to create records' }, { status: 403 });
    }

    const body = await request.json();
    const { moduleId, payload } = body;

    if (!moduleId || !payload) {
      return NextResponse.json({ error: 'moduleId and payload are required' }, { status: 400 });
    }

    const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    const errors = await validatePayload(moduleId, payload);
    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 422 });
    }

    const initialStatus = metaModule.requireApproval ? STATUS_DRAFT : STATUS_ACTIVE;

    const record = await db.dataRecord.create({
      data: {
        moduleId,
        companyId: tokenPayload.companyId,
        status: initialStatus,
        currentPayload: JSON.stringify(payload),
        createdById: tokenPayload.userId,
        updatedById: tokenPayload.userId,
      },
    });

    // If status is ACTIVE, create initial version snapshot
    if (initialStatus === STATUS_ACTIVE) {
      await db.dataVersion.create({
        data: {
          recordId: record.id,
          payloadSnapshot: JSON.stringify(payload),
          versionNumber: 1,
          changedById: tokenPayload.userId,
          changeReason: 'Initial creation (auto-approved)',
          status: STATUS_ACTIVE,
        },
      });
    }

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error('Records POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/records?action=update - Update record
// PUT /api/records?action=transition - Change status
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Handle status transition
    if (action === 'transition') {
      const { id, targetStatus, reviewNotes } = body;

      if (!id || !targetStatus) {
        return NextResponse.json({ error: 'id and targetStatus are required' }, { status: 400 });
      }

      const record = await db.dataRecord.findUnique({ where: { id } });
      if (!record) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }

      // RLS check
      const isSA = checkSuperAdmin(tokenPayload.roles);
      if (!isSA && record.companyId !== tokenPayload.companyId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Approval actions require data:approve permission
      if (targetStatus === STATUS_ACTIVE || targetStatus === STATUS_REJECTED) {
        if (!hasPermission(tokenPayload.roles, 'data:approve')) {
          return NextResponse.json({ error: 'Insufficient permissions to approve/reject' }, { status: 403 });
        }
      } else {
        // Other transitions require data:write
        if (!hasPermission(tokenPayload.roles, 'data:write')) {
          return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }
      }

      // Validate transition
      if (!canTransition(record.status, targetStatus)) {
        return NextResponse.json(
          { error: `Cannot transition from ${record.status} to ${targetStatus}` },
          { status: 422 }
        );
      }

      const updatedRecord = await db.dataRecord.update({
        where: { id },
        data: {
          status: targetStatus,
          updatedById: tokenPayload.userId,
        },
      });

      // If transitioning to IN_REVIEW, create ApprovalTicket
      if (targetStatus === STATUS_IN_REVIEW) {
        await db.approvalTicket.create({
          data: {
            recordId: id,
            requestedById: tokenPayload.userId,
            status: 'PENDING',
            deltaPayload: record.currentPayload,
          },
        });
      }

      // If approving (IN_REVIEW -> ACTIVE), create DataVersion snapshot
      if (record.status === STATUS_IN_REVIEW && targetStatus === STATUS_ACTIVE) {
        const maxVersion = await db.dataVersion.findFirst({
          where: { recordId: id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });

        await db.dataVersion.create({
          data: {
            recordId: id,
            payloadSnapshot: record.currentPayload,
            versionNumber: (maxVersion?.versionNumber ?? 0) + 1,
            changedById: tokenPayload.userId,
            changeReason: reviewNotes || 'Approved',
            status: STATUS_ACTIVE,
          },
        });
      }

      return NextResponse.json({ record: updatedRecord });
    }

    // Handle record update
    if (action === 'update') {
      if (!hasPermission(tokenPayload.roles, 'data:write')) {
        return NextResponse.json({ error: 'Insufficient permissions to update records' }, { status: 403 });
      }

      const { id, payload } = body;

      if (!id || !payload) {
        return NextResponse.json({ error: 'id and payload are required' }, { status: 400 });
      }

      const record = await db.dataRecord.findUnique({ where: { id } });
      if (!record) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }

      // RLS check
      const isSA = checkSuperAdmin(tokenPayload.roles);
      if (!isSA && record.companyId !== tokenPayload.companyId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const errors = await validatePayload(record.moduleId, payload);
      if (errors.length > 0) {
        return NextResponse.json({ error: 'Validation failed', errors }, { status: 422 });
      }

      // If record is ACTIVE, create amendment workflow:
      // 1. Change original record to REVISION_PENDING status
      // 2. Create a new DRAFT record with the proposed changes
      // 3. Create a DataVersion entry to track the amendment
      // 4. Create an ApprovalTicket for the amendment
      if (record.status === STATUS_ACTIVE) {
        // Create version snapshot of current active state before amendment
        const maxVersion = await db.dataVersion.findFirst({
          where: { recordId: id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const newVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;

        // Create a DataVersion entry for the amendment request
        await db.dataVersion.create({
          data: {
            recordId: id,
            payloadSnapshot: JSON.stringify(payload),
            versionNumber: newVersionNumber,
            changedById: tokenPayload.userId,
            changeReason: 'Amendment requested (pending approval)',
            status: STATUS_REVISION_PENDING,
          },
        });

        // Update the record with new payload but mark as REVISION_PENDING
        const updatedRecord = await db.dataRecord.update({
          where: { id },
          data: {
            currentPayload: JSON.stringify(payload),
            status: STATUS_REVISION_PENDING,
            updatedById: tokenPayload.userId,
          },
        });

        // Create ApprovalTicket for the amendment
        await db.approvalTicket.create({
          data: {
            recordId: id,
            requestedById: tokenPayload.userId,
            status: 'PENDING',
            deltaPayload: record.currentPayload, // Store original payload for diff
          },
        });

        return NextResponse.json({ 
          record: updatedRecord, 
          message: 'Amendment submitted for approval. Record status changed to Revision Pending.' 
        });
      }

      // If DRAFT, update in place
      if (record.status === STATUS_DRAFT) {
        const updatedRecord = await db.dataRecord.update({
          where: { id },
          data: {
            currentPayload: JSON.stringify(payload),
            updatedById: tokenPayload.userId,
          },
        });

        return NextResponse.json({ record: updatedRecord });
      }

      // If REVISION_PENDING, update the proposed changes
      if (record.status === STATUS_REVISION_PENDING) {
        const updatedRecord = await db.dataRecord.update({
          where: { id },
          data: {
            currentPayload: JSON.stringify(payload),
            updatedById: tokenPayload.userId,
          },
        });

        return NextResponse.json({ record: updatedRecord });
      }

      // Other statuses may not allow direct update
      return NextResponse.json(
        { error: `Cannot update record in ${record.status} status. Use transition to change status first.` },
        { status: 422 }
      );
    }

    // ============================================================
    // Handle bulk update (Excel-like grid editor)
    // PUT /api/records?action=bulk-update
    // Body: { changes: Array<{ id: string, payload: Record<string, unknown> }> }
    // Only updates records that are in DRAFT or REVISION_PENDING status.
    // ACTIVE records are skipped with a per-row error (amendment workflow
    // should be used for those). Returns { updated: [...], errors: [...] }.
    // ============================================================
    if (action === 'bulk-update') {
      if (!hasPermission(tokenPayload.roles, 'data:write')) {
        return NextResponse.json({ error: 'Insufficient permissions to update records' }, { status: 403 });
      }

      const { changes } = body;
      if (!Array.isArray(changes) || changes.length === 0) {
        return NextResponse.json({ error: 'changes array is required and must not be empty' }, { status: 400 });
      }
      if (changes.length > 500) {
        return NextResponse.json({ error: 'Too many changes in one request (max 500). Please save in smaller batches.' }, { status: 413 });
      }

      const isSA = checkSuperAdmin(tokenPayload.roles);
      // Each result entry now carries an optional `amendment` flag so the
      // grid editor can show the user that an ACTIVE record was moved into
      // the amendment/approval workflow (Stibo "Linking Assets & Products"
      // pattern — editing an active asset creates a revision ticket rather
      // than mutating the live record silently).
      const updated: Array<{ id: string; status: string; amendment?: boolean }> = [];
      const errors: Array<{ id: string; error: string }> = [];

      // Pre-fetch all records in one query for efficiency + RLS check
      const recordIds = changes.map((c: { id: string }) => c.id);
      const existingRecords = await db.dataRecord.findMany({
        where: { id: { in: recordIds } },
        select: { id: true, moduleId: true, companyId: true, status: true, currentPayload: true },
      });
      const recordMap = new Map(existingRecords.map((r) => [r.id, r]));

      // Group by module so we can cache field validations per module
      const moduleFieldsCache = new Map<string, Awaited<ReturnType<typeof db.metaField.findMany>>>();

      for (const change of changes) {
        const { id, payload } = change as { id: string; payload: Record<string, unknown> };
        if (!id || !payload) {
          errors.push({ id: id || '(missing)', error: 'id and payload are required' });
          continue;
        }
        const record = recordMap.get(id);
        if (!record) {
          errors.push({ id, error: 'Record not found' });
          continue;
        }
        // RLS check
        if (!isSA && record.companyId !== tokenPayload.companyId) {
          errors.push({ id, error: 'Access denied (company mismatch)' });
          continue;
        }
        // Editable statuses: DRAFT, REVISION_PENDING, and ACTIVE.
        // - DRAFT / REVISION_PENDING → update in place (direct save).
        // - ACTIVE → amendment workflow: create a DataVersion snapshot of the
        //   proposed changes, move the record to REVISION_PENDING, and open
        //   an ApprovalTicket so a reviewer can approve/reject the change.
        //   This mirrors the Stibo Systems asset-maintenance flow where
        //   editing a live asset submits a change request for approval.
        // IN_REVIEW, REJECTED, ARCHIVED records remain non-editable here.
        if (
          record.status !== STATUS_DRAFT &&
          record.status !== STATUS_REVISION_PENDING &&
          record.status !== STATUS_ACTIVE
        ) {
          errors.push({ id, error: `Cannot edit record in ${record.status} status. Wait for review to complete or use the single-record form.` });
          continue;
        }

        // Cache module fields for validation
        if (!moduleFieldsCache.has(record.moduleId)) {
          moduleFieldsCache.set(record.moduleId, await db.metaField.findMany({
            where: { moduleId: record.moduleId, isActive: true },
            include: { validations: true },
          }));
        }

        // Inline validation (mirrors validatePayload but uses cached fields)
        const fields = moduleFieldsCache.get(record.moduleId)!;
        const rowErrors: string[] = [];
        for (const field of fields) {
          const value = payload[field.fieldCode];
          if (field.isRequired && (value === undefined || value === null || value === '')) {
            rowErrors.push(`Field "${field.fieldName}" (${field.fieldCode}) is required`);
            continue;
          }
          if (value === undefined || value === null || value === '') continue;
          if (field.dataType === 'NUMBER' && isNaN(Number(value))) {
            rowErrors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a number`);
          }
          if (field.dataType === 'EMAIL' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            rowErrors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a valid email`);
          }
          if (field.dataType === 'URL' && typeof value === 'string' && !/^https?:\/\/.+/.test(value)) {
            rowErrors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a valid URL`);
          }
        }
        if (rowErrors.length > 0) {
          errors.push({ id, error: rowErrors.join('; ') });
          continue;
        }

        try {
          if (record.status === STATUS_ACTIVE) {
            // ── Amendment workflow for ACTIVE records ──
            // Stibo "Linking Assets & Products": editing a live asset creates
            // a revision (not a silent mutation). We snapshot the proposed
            // new payload as a DataVersion, flip the record to
            // REVISION_PENDING, and open an ApprovalTicket that stores the
            // original payload as `deltaPayload` so reviewers can diff.
            const maxVersion = await db.dataVersion.findFirst({
              where: { recordId: id },
              orderBy: { versionNumber: 'desc' },
              select: { versionNumber: true },
            });
            const newVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;

            await db.dataVersion.create({
              data: {
                recordId: id,
                payloadSnapshot: JSON.stringify(payload),
                versionNumber: newVersionNumber,
                changedById: tokenPayload.userId,
                changeReason: 'Amendment requested via grid editor (pending approval)',
                status: STATUS_REVISION_PENDING,
              },
            });

            const updatedRecord = await db.dataRecord.update({
              where: { id },
              data: {
                currentPayload: JSON.stringify(payload),
                status: STATUS_REVISION_PENDING,
                updatedById: tokenPayload.userId,
              },
            });

            await db.approvalTicket.create({
              data: {
                recordId: id,
                requestedById: tokenPayload.userId,
                status: 'PENDING',
                deltaPayload: record.currentPayload, // original payload for diff
              },
            });

            updated.push({ id, status: updatedRecord.status, amendment: true });
          } else {
            // DRAFT or REVISION_PENDING → update in place
            const updatedRecord = await db.dataRecord.update({
              where: { id },
              data: {
                currentPayload: JSON.stringify(payload),
                updatedById: tokenPayload.userId,
              },
            });
            updated.push({ id, status: updatedRecord.status, amendment: false });
          }
        } catch (err) {
          errors.push({ id, error: err instanceof Error ? err.message : 'Update failed' });
        }
      }

      // Summarise how many records went into the amendment workflow so the
      // grid editor can surface a clear toast to the user.
      const amendmentCount = updated.filter((u) => u.amendment).length;

      return NextResponse.json({
        updated,
        errors,
        updatedCount: updated.length,
        errorCount: errors.length,
        amendmentCount,
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use ?action=update, ?action=transition, or ?action=bulk-update' }, { status: 400 });
  } catch (error) {
    console.error('Records PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/records - Soft delete (ARCHIVED)
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:delete')) {
      return NextResponse.json({ error: 'Insufficient permissions to delete records' }, { status: 403 });
    }

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Record id is required' }, { status: 400 });
    }

    const record = await db.dataRecord.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // RLS check
    const isSA = checkSuperAdmin(tokenPayload.roles);
    if (!isSA && record.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const updatedRecord = await db.dataRecord.update({
      where: { id },
      data: {
        status: STATUS_ARCHIVED,
        updatedById: tokenPayload.userId,
      },
    });

    return NextResponse.json({ record: updatedRecord });
  } catch (error) {
    console.error('Records DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
