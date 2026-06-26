import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission, isSuperAdmin } from '@/lib/rbac';

// GET /api/fields?moduleId=xxx - List fields for a module
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId query parameter is required' }, { status: 400 });
    }

    const fields = await db.metaField.findMany({
      where: { moduleId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        validations: true,
        lookupMaster: {
          include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    return NextResponse.json({ fields });
  } catch (error) {
    console.error('Fields GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/fields - Create field (Super Admin only)
// POST /api/fields?action=validation - Create field validation
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can create fields' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Handle validation creation
    if (action === 'validation') {
      const { fieldId, ruleType, ruleValue, errorMessage } = body;

      if (!fieldId || !ruleType || !ruleValue) {
        return NextResponse.json(
          { error: 'fieldId, ruleType, and ruleValue are required' },
          { status: 400 }
        );
      }

      const field = await db.metaField.findUnique({ where: { id: fieldId } });
      if (!field) {
        return NextResponse.json({ error: 'Field not found' }, { status: 404 });
      }

      const validation = await db.fieldValidation.create({
        data: { fieldId, ruleType, ruleValue, errorMessage },
      });

      return NextResponse.json({ validation }, { status: 201 });
    }

    // Handle field creation
    const {
      moduleId, fieldCode, fieldName, dataType,
      isRequired, isUnique, defaultValue, placeholder,
      description, sortOrder, lookupId,
    } = body;

    if (!moduleId || !fieldCode || !fieldName || !dataType) {
      return NextResponse.json(
        { error: 'moduleId, fieldCode, fieldName, and dataType are required' },
        { status: 400 }
      );
    }

    const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    const existing = await db.metaField.findUnique({
      where: { moduleId_fieldCode: { moduleId, fieldCode } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Field code already exists in this module' }, { status: 409 });
    }

    const field = await db.metaField.create({
      data: {
        moduleId,
        fieldCode,
        fieldName,
        dataType,
        isRequired: isRequired ?? false,
        isUnique: isUnique ?? false,
        defaultValue,
        placeholder,
        description,
        sortOrder: sortOrder ?? 0,
        lookupId: lookupId || null,
      },
    });

    return NextResponse.json({ field }, { status: 201 });
  } catch (error) {
    console.error('Fields POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/fields - Update field (Super Admin only)
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can update fields' }, { status: 403 });
    }

    const body = await request.json();
    const {
      id, fieldCode, fieldName, dataType,
      isRequired, isUnique, defaultValue, placeholder,
      description, sortOrder, isActive, lookupId,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Field id is required' }, { status: 400 });
    }

    const existing = await db.metaField.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    }

    if (fieldCode && fieldCode !== existing.fieldCode) {
      const duplicate = await db.metaField.findUnique({
        where: { moduleId_fieldCode: { moduleId: existing.moduleId, fieldCode } },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'Field code already exists in this module' }, { status: 409 });
      }
    }

    const field = await db.metaField.update({
      where: { id },
      data: {
        ...(fieldCode !== undefined && { fieldCode }),
        ...(fieldName !== undefined && { fieldName }),
        ...(dataType !== undefined && { dataType }),
        ...(isRequired !== undefined && { isRequired }),
        ...(isUnique !== undefined && { isUnique }),
        ...(defaultValue !== undefined && { defaultValue }),
        ...(placeholder !== undefined && { placeholder }),
        ...(description !== undefined && { description }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
        ...(lookupId !== undefined && { lookupId }),
      },
    });

    return NextResponse.json({ field });
  } catch (error) {
    console.error('Fields PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/fields - Delete field (Super Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can delete fields' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    if (action === 'validation') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: 'Validation id is required' }, { status: 400 });
      }

      const existing = await db.fieldValidation.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Validation not found' }, { status: 404 });
      }

      await db.fieldValidation.delete({ where: { id } });
      return NextResponse.json({ message: 'Validation deleted' });
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Field id is required' }, { status: 400 });
    }

    const existing = await db.metaField.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    }

    await db.metaField.delete({ where: { id } });
    return NextResponse.json({ message: 'Field deleted' });
  } catch (error) {
    console.error('Fields DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
