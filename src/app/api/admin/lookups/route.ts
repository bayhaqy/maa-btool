import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

// GET /api/admin/lookups?lookupCode=xxx&parentValueCode=yyy&includeInactive=true - List all lookups with values
// When parentValueCode is provided, filters values to only those matching the given parent code
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write permission
    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const lookupCode = searchParams.get('lookupCode');
    const parentValueCode = searchParams.get('parentValueCode');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const where: Record<string, unknown> = {};
    if (lookupCode) {
      where.lookupCode = lookupCode;
    }
    if (!includeInactive) {
      where.isActive = true;
    }

    const valuesWhere: Record<string, unknown> = {};
    if (!includeInactive) {
      valuesWhere.isActive = true;
    }
    if (parentValueCode) {
      valuesWhere.parentValueCode = parentValueCode;
    }

    const lookups = await db.lookupMaster.findMany({
      where,
      orderBy: { lookupName: 'asc' },
      include: {
        values: {
          where: Object.keys(valuesWhere).length > 0 ? valuesWhere : undefined,
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            values: { where: { isActive: true } },
            fields: true, // where-used count
          },
        },
      },
    });

    return NextResponse.json({ lookups });
  } catch (error) {
    console.error('Admin Lookups GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/lookups - Create lookup
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write permission
    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const body = await request.json();
    const { lookupCode, lookupName, description, category, values } = body;

    if (!lookupCode || !lookupName) {
      return NextResponse.json(
        { error: 'lookupCode and lookupName are required' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await db.lookupMaster.findUnique({ where: { lookupCode } });
    if (existing) {
      return NextResponse.json({ error: 'Lookup code already exists' }, { status: 409 });
    }

    const lookup = await db.lookupMaster.create({
      data: {
        lookupCode,
        lookupName,
        description,
        category,
        values: {
          create: (values || []).map(
            (v: {
              valueCode: string;
              displayValue: string;
              description?: string;
              validFrom?: string;
              validTo?: string;
              parentValueCode?: string;
            },
            index: number
          ) => ({
            valueCode: v.valueCode,
            displayValue: v.displayValue,
            description: v.description || null,
            validFrom: v.validFrom ? new Date(v.validFrom) : null,
            validTo: v.validTo ? new Date(v.validTo) : null,
            parentValueCode: v.parentValueCode || null,
            sortOrder: index,
          })),
        },
      },
      include: {
        values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'LOOKUP_CREATE',
      entityType: 'LookupMaster',
      entityId: lookup.id,
      moduleName: 'Lookup',
      description: `Created lookup "${lookupName}" (${lookupCode})`,
      newValues: {
        id: lookup.id,
        lookupCode,
        lookupName,
        description: description || null,
        category: category || null,
        valueCount: (values || []).length,
      },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ lookup }, { status: 201 });
  } catch (error) {
    console.error('Admin Lookups POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/lookups - Update lookup (non-destructive: per-value upsert)
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write permission
    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const body = await request.json();
    const { id, lookupName, description, category, values } = body;

    if (!id) {
      return NextResponse.json({ error: 'Lookup id is required' }, { status: 400 });
    }

    const existing = await db.lookupMaster.findUnique({
      where: { id },
      include: { values: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Lookup not found' }, { status: 404 });
    }

    // Update lookup basic info
    const updateData: Record<string, unknown> = {};
    if (lookupName !== undefined) updateData.lookupName = lookupName;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;

    const lookup = await db.lookupMaster.update({
      where: { id },
      data: updateData,
    });

    // Upsert each value (preserves IDs, isActive, createdAt) — fixes destructive deleteMany+createMany bug
    if (values !== undefined) {
      // Pre-fetch existing active values so we can resolve parentValueCode → parentValueId
      // for cascading lookups. (parentValueCode is the stable, import-friendly reference.)
      const existingValues = await db.lookupValue.findMany({
        where: { lookupId: id },
        select: { id: true, valueCode: true },
      });
      const valueCodeToId = new Map(existingValues.map((v) => [v.valueCode, v.id]));

      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        // Resolve parentValueCode → parentValueId (within same lookup)
        let parentValueId: string | null = null;
        if (v.parentValueCode) {
          parentValueId = valueCodeToId.get(v.parentValueCode) ?? null;
          // If the parent value is part of this same submitted batch but not yet upserted,
          // we'll fall back to a lookup after the upsert loop completes.
        }
        await db.lookupValue.upsert({
          where: { lookupId_valueCode: { lookupId: id, valueCode: v.valueCode } },
          create: {
            lookupId: id,
            valueCode: v.valueCode,
            displayValue: v.displayValue,
            description: v.description || null,
            validFrom: v.validFrom ? new Date(v.validFrom) : null,
            validTo: v.validTo ? new Date(v.validTo) : null,
            parentValueCode: v.parentValueCode || null,
            parentValueId: parentValueId,
            sortOrder: i,
            isActive: true,
          },
          update: {
            displayValue: v.displayValue,
            description: v.description || null,
            validFrom: v.validFrom ? new Date(v.validFrom) : null,
            validTo: v.validTo ? new Date(v.validTo) : null,
            parentValueCode: v.parentValueCode || null,
            parentValueId: parentValueId,
            sortOrder: i,
            isActive: true,
          },
        });
      }
      // Second pass: now that all values exist, re-link parentValueId for any value
      // whose parent was inserted later in the batch.
      const refreshedValues = await db.lookupValue.findMany({
        where: { lookupId: id, isActive: true },
        select: { id: true, valueCode: true, parentValueCode: true, parentValueId: true },
      });
      const codeToIdFresh = new Map(refreshedValues.map((v) => [v.valueCode, v.id]));
      for (const rv of refreshedValues) {
        if (rv.parentValueCode) {
          const expectedParentId = codeToIdFresh.get(rv.parentValueCode) ?? null;
          if (rv.parentValueId !== expectedParentId) {
            await db.lookupValue.update({
              where: { id: rv.id },
              data: { parentValueId: expectedParentId },
            });
          }
        }
      }
      // Soft-delete values not in the submitted array (deactivate instead of delete)
      const submittedCodes = values.map((v: { valueCode: string }) => v.valueCode);
      await db.lookupValue.updateMany({
        where: { lookupId: id, valueCode: { notIn: submittedCodes } },
        data: { isActive: false },
      });
    }

    // Fetch updated lookup with values
    const updatedLookup = await db.lookupMaster.findUnique({
      where: { id },
      include: {
        values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'LOOKUP_UPDATE',
      entityType: 'LookupMaster',
      entityId: id,
      moduleName: 'Lookup',
      description: `Updated lookup "${existing.lookupName}" (${existing.lookupCode})`,
      oldValues: {
        id: existing.id,
        lookupName: existing.lookupName,
        description: existing.description,
        category: existing.category,
        valueCount: existing.values.length,
      },
      newValues: {
        ...updateData,
        valueCount: values !== undefined ? values.length : existing.values.length,
      },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ lookup: updatedLookup });
  } catch (error) {
    console.error('Admin Lookups PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/lookups - Soft-delete lookup by default; hard-delete with ?hardDelete=true
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write permission
    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get('hardDelete') === 'true';
    const force = searchParams.get('force') === 'true';

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Lookup id is required' }, { status: 400 });
    }

    const existing = await db.lookupMaster.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Lookup not found' }, { status: 404 });
    }

    // Referential integrity check: how many MetaFields use this lookup?
    const fieldCount = await db.metaField.count({ where: { lookupId: id } });

    // Block hard delete if referenced, unless ?force=true
    if (fieldCount > 0 && hardDelete && !force) {
      return NextResponse.json(
        {
          error: `Cannot delete lookup: it is referenced by ${fieldCount} module field(s). Deactivate it instead, or remove the field references first.`,
          fieldCount,
        },
        { status: 409 }
      );
    }

    // For soft delete (default), block only if explicitly requested AND referenced AND no force
    // (soft delete is safe even when referenced — MetaField.isActive still resolves the lookup)
    if (hardDelete) {
      // Hard delete: cascades to LookupValue
      await db.lookupMaster.delete({ where: { id } });

      await logAudit({
        userId: tokenPayload.userId,
        action: 'LOOKUP_DELETE',
        entityType: 'LookupMaster',
        entityId: id,
        moduleName: 'Lookup',
        description: `Hard-deleted lookup "${existing.lookupName}" (${existing.lookupCode})${fieldCount > 0 ? ` (forced — was referenced by ${fieldCount} fields)` : ''}`,
        oldValues: {
          id: existing.id,
          lookupCode: existing.lookupCode,
          lookupName: existing.lookupName,
          description: existing.description,
          category: existing.category,
        },
        companyId: tokenPayload.companyId,
      });

      return NextResponse.json({ message: 'Lookup permanently deleted' });
    }

    // Soft delete: set isActive=false on master and all active values
    await db.lookupMaster.update({ where: { id }, data: { isActive: false } });
    await db.lookupValue.updateMany({
      where: { lookupId: id, isActive: true },
      data: { isActive: false },
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'LOOKUP_DEACTIVATE',
      entityType: 'LookupMaster',
      entityId: id,
      moduleName: 'Lookup',
      description: `Deactivated lookup "${existing.lookupName}" (${existing.lookupCode})${fieldCount > 0 ? ` — still referenced by ${fieldCount} fields` : ''}`,
      oldValues: {
        id: existing.id,
        lookupCode: existing.lookupCode,
        lookupName: existing.lookupName,
        isActive: true,
      },
      newValues: { isActive: false },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ message: 'Lookup deactivated (soft-deleted)', fieldCount });
  } catch (error) {
    console.error('Admin Lookups DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
