import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// GET /api/admin/companies - List all companies
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can manage companies
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can manage companies.' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const companies = await db.tenantCompany.findMany({
      orderBy: { companyName: 'asc' },
      include: {
        _count: { select: { users: true, dataRecords: true } },
      },
    });

    const formattedCompanies = companies.map((c) => ({
      id: c.id,
      companyCode: c.companyCode,
      companyName: c.companyName,
      description: c.description,
      logoUrl: c.logoUrl,
      website: c.website,
      industry: c.industry,
      parentCode: c.parentCode,
      address: c.address,
      phone: c.phone,
      email: c.email,
      isActive: c.isActive,
      userCount: c._count.users,
      recordCount: c._count.dataRecords,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return NextResponse.json({ companies: formattedCompanies });
  } catch (error) {
    console.error('Admin Companies GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/companies - Create company
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can create companies
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can create companies.' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { companyCode, companyName } = body;

    if (!companyCode || !companyName) {
      return NextResponse.json(
        { error: 'companyCode and companyName are required' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await db.tenantCompany.findUnique({ where: { companyCode } });
    if (existing) {
      return NextResponse.json({ error: 'Company code already exists' }, { status: 409 });
    }

    const company = await db.tenantCompany.create({
      data: { companyCode, companyName },
    });

    // ── Audit: company create ──────────────────────────────────────────
    await logAudit({
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'TenantCompany',
      entityId: company.id,
      description: `Company "${companyName}" (${companyCode}) created`,
      newValues: { companyCode, companyName },
      req: request,
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    console.error('Admin Companies POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/companies - Update company
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can update companies
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can update companies.' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { id, companyName, isActive, description, logoUrl, website, industry, address, phone, email } = body;

    if (!id) {
      return NextResponse.json({ error: 'Company id is required' }, { status: 400 });
    }

    const existing = await db.tenantCompany.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = await db.tenantCompany.update({
      where: { id },
      data: {
        ...(companyName !== undefined && { companyName }),
        ...(isActive !== undefined && { isActive }),
        ...(description !== undefined && { description }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(website !== undefined && { website }),
        ...(industry !== undefined && { industry }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
      },
    });

    // ── Audit: company update ──────────────────────────────────────────
    await logAudit({
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'TenantCompany',
      entityId: id,
      description: `Company "${existing.companyName}" updated`,
      oldValues: { companyName: existing.companyName, isActive: existing.isActive },
      newValues: { companyName, isActive, description, logoUrl, website, industry, address, phone, email },
      req: request,
    });

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Admin Companies PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/companies - Deactivate company
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can delete companies
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can delete companies.' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Company id is required' }, { status: 400 });
    }

    const existing = await db.tenantCompany.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = await db.tenantCompany.update({
      where: { id },
      data: { isActive: false },
    });

    // ── Audit: company deactivate ──────────────────────────────────────
    await logAudit({
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'TenantCompany',
      entityId: id,
      description: `Company "${existing.companyName}" deactivated`,
      oldValues: { isActive: true },
      newValues: { isActive: false },
      severity: 'warning',
      req: request,
    });

    return NextResponse.json({ company: { id: company.id, companyCode: company.companyCode, isActive: company.isActive } });
  } catch (error) {
    console.error('Admin Companies DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
