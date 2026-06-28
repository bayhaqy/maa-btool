import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { createHash, randomBytes } from 'crypto';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// GET /api/api-keys - List API keys with usage stats
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    const hasApiRole = tokenPayload.roles.some(r => ['Super Admin', 'API Manager'].includes(r));
    if (!hasApiRole && !isSuperAdmin) {
      return NextResponse.json({ error: 'Access denied. API Manager role required.' }, { status: 403 });
    }

    // ── Rate limit: read endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const where: Record<string, unknown> = {};
    if (!isSuperAdmin) {
      where.companyId = tokenPayload.companyId;
    }

    const apiKeys = await db.apiKey.findMany({
      where,
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        user: { select: { id: true, username: true, displayName: true } },
        _count: { select: { accessLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get recent access stats
    const keysWithStats = apiKeys.map(key => ({
      id: key.id,
      keyName: key.keyName,
      keyPrefix: key.keyPrefix,
      companyId: key.companyId,
      company: key.company,
      userId: key.userId,
      user: key.user,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      totalRequests: key._count.accessLogs,
    }));

    return NextResponse.json({ apiKeys: keysWithStats });
  } catch (error) {
    console.error('API Keys GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/api-keys - Create new API key
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasApiRole = tokenPayload.roles.some(r => ['Super Admin', 'API Manager'].includes(r));
    if (!hasApiRole) {
      return NextResponse.json({ error: 'Access denied. API Manager role required.' }, { status: 403 });
    }

    // ── Rate limit: write endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('write', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { keyName, permissions, rateLimit, companyId, expiresAt } = body;

    if (!keyName) {
      return NextResponse.json({ error: 'keyName is required' }, { status: 400 });
    }

    // Generate random key
    const rawKey = `mapi_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const apiKey = await db.apiKey.create({
      data: {
        keyName,
        keyHash,
        keyPrefix,
        companyId: companyId || tokenPayload.companyId,
        userId: tokenPayload.userId,
        permissions: permissions || 'READ',
        rateLimit: rateLimit || 100,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Return the raw key only once - it cannot be retrieved again
    return NextResponse.json({
      apiKey: {
        id: apiKey.id,
        keyName: apiKey.keyName,
        keyPrefix: apiKey.keyPrefix,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      rawKey, // Only shown once!
    }, { status: 201 });
  } catch (error) {
    console.error('API Key POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/api-keys - Update API key (toggle active/inactive)
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasApiRole = tokenPayload.roles.some(r => ['Super Admin', 'API Manager'].includes(r));
    if (!hasApiRole) {
      return NextResponse.json({ error: 'Access denied. API Manager role required.' }, { status: 403 });
    }

    // ── Rate limit: write endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('write', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { id, keyName, permissions, rateLimit, isActive, expiresAt } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && existing.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (keyName !== undefined) updateData.keyName = keyName;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (rateLimit !== undefined) updateData.rateLimit = rateLimit;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const apiKey = await db.apiKey.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ apiKey });
  } catch (error) {
    console.error('API Key PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/api-keys - Delete API key
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    const hasApiRole = tokenPayload.roles.some(r => ['Super Admin', 'API Manager'].includes(r));
    if (!hasApiRole) {
      return NextResponse.json({ error: 'Access denied. API Manager role required.' }, { status: 403 });
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
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (!isSuperAdmin && existing.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await db.apiKey.delete({ where: { id } });

    return NextResponse.json({ message: 'API key deleted successfully' });
  } catch (error) {
    console.error('API Key DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
