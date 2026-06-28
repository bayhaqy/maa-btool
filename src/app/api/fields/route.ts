import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission, hasPermission } from '@/lib/rbac';

// Valid STIBO data types
const VALID_DATA_TYPES = new Set([
  'TEXT', 'LONG_TEXT', 'RICH_TEXT',
  'NUMBER', 'INTEGER', 'DECIMAL', 'CURRENCY',
  'DATE', 'DATETIME',
  'BOOLEAN',
  'SELECT', 'MULTISELECT',
  'LOV',
  'LOOKUP',
  'IMAGE', 'VIDEO', 'DOCUMENT', 'FILE',
  'URL', 'EMAIL', 'PHONE', 'COLOR',
  'COMPOUND', 'CONTAINER',
]);

// Valid STIBO validation rule types
const VALID_RULE_TYPES = new Set([
  'REQUIRED', 'UNIQUE', 'MIN_LENGTH', 'MAX_LENGTH', 'PATTERN',
  'MIN_VALUE', 'MAX_VALUE',
  'EMAIL_FORMAT', 'URL_FORMAT',
  'LOV_VALIDATION', 'CROSS_FIELD', 'CONDITIONAL_REQUIRED',
  'CUSTOM',
]);

const NO_VALUE_RULE_TYPES = new Set(['REQUIRED', 'UNIQUE', 'EMAIL_FORMAT', 'URL_FORMAT']);

// GET /api/fields?moduleId=xxx - List fields for a module
// GET /api/fields?lookupId=xxx - List fields referencing a lookup
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    const lookupId = searchParams.get('lookupId');

    // "Where used" query: list fields referencing a specific lookup
    if (lookupId) {
      const fields = await db.metaField.findMany({
        where: { lookupId },
        orderBy: { fieldCode: 'asc' },
        include: {
          module: { select: { id: true, moduleCode: true, moduleName: true } },
        },
      });
      return NextResponse.json({ fields });
    }

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
        group: true,
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
    if (!tokenPayload || !hasPermission(tokenPayload.roles, 'schema:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: schema:write' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Handle validation creation
    if (action === 'validation') {
      const { fieldId, ruleType, ruleValue, errorMessage } = body;

      if (!fieldId || !ruleType) {
        return NextResponse.json(
          { error: 'fieldId and ruleType are required' },
          { status: 400 }
        );
      }

      if (!VALID_RULE_TYPES.has(ruleType)) {
        return NextResponse.json(
          { error: `Invalid rule type. Valid types: ${[...VALID_RULE_TYPES].join(', ')}` },
          { status: 400 }
        );
      }

      const field = await db.metaField.findUnique({ where: { id: fieldId } });
      if (!field) {
        return NextResponse.json({ error: 'Field not found' }, { status: 404 });
      }

      const noValueNeeded = NO_VALUE_RULE_TYPES.has(ruleType);
      const finalRuleValue = noValueNeeded ? '__NONE__' : (ruleValue || '');

      const validation = await db.fieldValidation.create({
        data: { fieldId, ruleType, ruleValue: finalRuleValue, errorMessage },
      });

      return NextResponse.json({ validation }, { status: 201 });
    }

    // Handle field creation
    const {
      moduleId, fieldCode, fieldName, dataType,
      isRequired, isUnique, defaultValue, placeholder,
      description, sortOrder, lookupId, cascadesFromFieldCode,
      isMultiple, groupId, isInherited, categoryScope,
      unitOfMeasure, minValue, maxValue, maxLength, regexPattern,
    } = body;

    if (!moduleId || !fieldCode || !fieldName || !dataType) {
      return NextResponse.json(
        { error: 'moduleId, fieldCode, fieldName, and dataType are required' },
        { status: 400 }
      );
    }

    if (!VALID_DATA_TYPES.has(dataType)) {
      return NextResponse.json(
        { error: `Invalid data type. Valid types: ${[...VALID_DATA_TYPES].join(', ')}` },
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

    // Validate cascadesFromFieldCode references an existing field in same module
    if (cascadesFromFieldCode) {
      const parentField = await db.metaField.findUnique({
        where: { moduleId_fieldCode: { moduleId, fieldCode: cascadesFromFieldCode } },
      });
      if (!parentField) {
        return NextResponse.json(
          { error: `cascadesFromFieldCode '${cascadesFromFieldCode}' not found in this module` },
          { status: 422 }
        );
      }
    }

    // Validate groupId references an existing group in same module
    if (groupId) {
      const group = await db.attributeGroup.findUnique({ where: { id: groupId } });
      if (!group || group.moduleId !== moduleId) {
        return NextResponse.json(
          { error: `Attribute group '${groupId}' not found in this module` },
          { status: 422 }
        );
      }
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
        cascadesFromFieldCode: cascadesFromFieldCode || null,
        isMultiple: isMultiple ?? false,
        groupId: groupId || null,
        isInherited: isInherited ?? false,
        categoryScope: categoryScope || null,
        unitOfMeasure: unitOfMeasure || null,
        minValue: minValue ?? null,
        maxValue: maxValue ?? null,
        maxLength: maxLength ?? null,
        regexPattern: regexPattern || null,
      },
      include: {
        validations: true,
        lookupMaster: true,
        group: true,
      },
    });

    return NextResponse.json({ field }, { status: 201 });
  } catch (error) {
    console.error('Fields POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/fields - Update field (Super Admin only)
// PUT /api/fields?action=validation - Update a field validation rule
// PUT /api/fields?action=reorder - Batch reorder fields
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !hasPermission(tokenPayload.roles, 'schema:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: schema:write' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Handle field reordering (batch)
    if (action === 'reorder') {
      const { orders } = body as { orders: { id: string; sortOrder: number }[] };

      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return NextResponse.json({ error: 'orders array is required' }, { status: 400 });
      }

      const fieldIds = orders.map((o) => o.id);
      const fields = await db.metaField.findMany({
        where: { id: { in: fieldIds } },
        select: { id: true },
      });

      if (fields.length !== fieldIds.length) {
        return NextResponse.json({ error: 'One or more field IDs not found' }, { status: 404 });
      }

      await db.$transaction(
        orders.map((o) =>
          db.metaField.update({
            where: { id: o.id },
            data: { sortOrder: o.sortOrder },
          })
        )
      );

      return NextResponse.json({ message: 'Fields reordered successfully', count: orders.length });
    }

    // Handle validation update
    if (action === 'validation') {
      const { id: validationId, ruleType, ruleValue, errorMessage } = body;

      if (!validationId || !ruleType) {
        return NextResponse.json(
          { error: 'id and ruleType are required' },
          { status: 400 }
        );
      }

      if (!VALID_RULE_TYPES.has(ruleType)) {
        return NextResponse.json(
          { error: `Invalid rule type. Valid types: ${[...VALID_RULE_TYPES].join(', ')}` },
          { status: 400 }
        );
      }

      const existing = await db.fieldValidation.findUnique({ where: { id: validationId } });
      if (!existing) {
        return NextResponse.json({ error: 'Validation not found' }, { status: 404 });
      }

      const noValueNeeded = NO_VALUE_RULE_TYPES.has(ruleType);
      const finalRuleValue = noValueNeeded ? '__NONE__' : (ruleValue || '');

      const validation = await db.fieldValidation.update({
        where: { id: validationId },
        data: { ruleType, ruleValue: finalRuleValue, errorMessage },
      });

      return NextResponse.json({ validation });
    }

    // Handle field update
    const {
      id, fieldCode, fieldName, dataType,
      isRequired, isUnique, defaultValue, placeholder,
      description, sortOrder, isActive, lookupId, cascadesFromFieldCode,
      isMultiple, groupId, isInherited, categoryScope,
      unitOfMeasure, minValue, maxValue, maxLength, regexPattern,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Field id is required' }, { status: 400 });
    }

    const existing = await db.metaField.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    }

    if (dataType && !VALID_DATA_TYPES.has(dataType)) {
      return NextResponse.json(
        { error: `Invalid data type. Valid types: ${[...VALID_DATA_TYPES].join(', ')}` },
        { status: 400 }
      );
    }

    if (fieldCode && fieldCode !== existing.fieldCode) {
      const duplicate = await db.metaField.findUnique({
        where: { moduleId_fieldCode: { moduleId: existing.moduleId, fieldCode } },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'Field code already exists in this module' }, { status: 409 });
      }
    }

    // Validate cascadesFromFieldCode references an existing field in same module
    if (cascadesFromFieldCode) {
      const parentField = await db.metaField.findFirst({
        where: { moduleId: existing.moduleId, fieldCode: cascadesFromFieldCode, isActive: true },
      });
      if (!parentField) {
        return NextResponse.json(
          { error: `cascadesFromFieldCode '${cascadesFromFieldCode}' not found in this module` },
          { status: 422 }
        );
      }
    }

    // Validate groupId if provided
    if (groupId !== undefined && groupId) {
      const group = await db.attributeGroup.findUnique({ where: { id: groupId } });
      if (!group || group.moduleId !== existing.moduleId) {
        return NextResponse.json(
          { error: `Attribute group '${groupId}' not found in this module` },
          { status: 422 }
        );
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
        ...(lookupId !== undefined && { lookupId: lookupId || null }),
        ...(cascadesFromFieldCode !== undefined && { cascadesFromFieldCode: cascadesFromFieldCode || null }),
        ...(isMultiple !== undefined && { isMultiple }),
        ...(groupId !== undefined && { groupId: groupId || null }),
        ...(isInherited !== undefined && { isInherited }),
        ...(categoryScope !== undefined && { categoryScope: categoryScope || null }),
        ...(unitOfMeasure !== undefined && { unitOfMeasure: unitOfMeasure || null }),
        ...(minValue !== undefined && { minValue: minValue ?? null }),
        ...(maxValue !== undefined && { maxValue: maxValue ?? null }),
        ...(maxLength !== undefined && { maxLength: maxLength ?? null }),
        ...(regexPattern !== undefined && { regexPattern: regexPattern || null }),
      },
      include: {
        validations: true,
        lookupMaster: true,
        group: true,
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
    if (!tokenPayload || !hasPermission(tokenPayload.roles, 'schema:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: schema:write' }, { status: 403 });
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
