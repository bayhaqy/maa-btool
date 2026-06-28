import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// GET /api/admin/companies - List all companies with full tenant info
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
      tenantTier: c.tenantTier,
      maxUsers: c.maxUsers,
      maxRecords: c.maxRecords,
      dataRetentionDays: c.dataRetentionDays,
      onboardingStatus: c.onboardingStatus,
      provisionedAt: c.provisionedAt,
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

    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const {
      companyCode, companyName, description, industry,
      tenantTier, maxUsers, maxRecords, dataRetentionDays,
    } = body;

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
      data: {
        companyCode,
        companyName,
        description: description || null,
        industry: industry || null,
        tenantTier: tenantTier || 'PROFESSIONAL',
        maxUsers: maxUsers || 50,
        maxRecords: maxRecords || 100000,
        dataRetentionDays: dataRetentionDays || 365,
        onboardingStatus: 'PENDING',
      },
    });

    await logAudit({
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'TenantCompany',
      entityId: company.id,
      description: `Account "${companyName}" (${companyCode}) created`,
      newValues: { companyCode, companyName, tenantTier: tenantTier || 'PROFESSIONAL' },
      req: request,
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    console.error('Admin Companies POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/companies - Update company (full field support)
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const {
      id, companyName, isActive, description, logoUrl, website, industry,
      address, phone, email, tenantTier, maxUsers, maxRecords,
      dataRetentionDays, onboardingStatus,
    } = body;

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
        ...(tenantTier !== undefined && { tenantTier }),
        ...(maxUsers !== undefined && { maxUsers }),
        ...(maxRecords !== undefined && { maxRecords }),
        ...(dataRetentionDays !== undefined && { dataRetentionDays }),
        ...(onboardingStatus !== undefined && { onboardingStatus }),
      },
    });

    await logAudit({
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'TenantCompany',
      entityId: id,
      description: `Account "${existing.companyName}" updated`,
      oldValues: { companyName: existing.companyName, isActive: existing.isActive },
      newValues: { companyName, isActive, tenantTier, maxUsers, maxRecords, dataRetentionDays, onboardingStatus },
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

    if (!hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write' }, { status: 403 });
    }

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

    await logAudit({
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'TenantCompany',
      entityId: id,
      description: `Account "${existing.companyName}" deactivated`,
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
