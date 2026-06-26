import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';

// GET /api/admin/lookups?lookupCode=xxx - List all lookups with values
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can manage lookups
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can manage lookups.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const lookupCode = searchParams.get('lookupCode');

    const where: Record<string, unknown> = {};
    if (lookupCode) {
      where.lookupCode = lookupCode;
    }

    const lookups = await db.lookupMaster.findMany({
      where,
      orderBy: { lookupName: 'asc' },
      include: {
        values: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { values: { where: { isActive: true } } } },
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

    // Only Super Admin can create lookups
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can create lookups.' }, { status: 403 });
    }

    const body = await request.json();
    const { lookupCode, lookupName, description, values } = body;

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
        values: {
          create: (values || []).map((v: { valueCode: string; displayValue: string }, index: number) => ({
            valueCode: v.valueCode,
            displayValue: v.displayValue,
            sortOrder: index,
          })),
        },
      },
      include: {
        values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    return NextResponse.json({ lookup }, { status: 201 });
  } catch (error) {
    console.error('Admin Lookups POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/lookups - Update lookup
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can update lookups
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can update lookups.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, lookupName, description, values } = body;

    if (!id) {
      return NextResponse.json({ error: 'Lookup id is required' }, { status: 400 });
    }

    const existing = await db.lookupMaster.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Lookup not found' }, { status: 404 });
    }

    // Update lookup basic info
    const lookup = await db.lookupMaster.update({
      where: { id },
      data: {
        ...(lookupName !== undefined && { lookupName }),
        ...(description !== undefined && { description }),
      },
    });

    // Update values if provided
    if (values !== undefined) {
      // Delete existing values
      await db.lookupValue.deleteMany({ where: { lookupId: id } });

      // Create new values
      if (values.length > 0) {
        await db.lookupValue.createMany({
          data: values.map((v: { valueCode: string; displayValue: string }, index: number) => ({
            lookupId: id,
            valueCode: v.valueCode,
            displayValue: v.displayValue,
            sortOrder: index,
          })),
        });
      }
    }

    // Fetch updated lookup with values
    const updatedLookup = await db.lookupMaster.findUnique({
      where: { id },
      include: {
        values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    return NextResponse.json({ lookup: updatedLookup });
  } catch (error) {
    console.error('Admin Lookups PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/lookups - Delete lookup
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can delete lookups
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can delete lookups.' }, { status: 403 });
    }

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

    await db.lookupMaster.delete({ where: { id } });
    return NextResponse.json({ message: 'Lookup deleted' });
  } catch (error) {
    console.error('Admin Lookups DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
