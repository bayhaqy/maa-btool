import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';
import { sanitizeInput, validateSafeString } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/audit - Fetch audit logs with pagination and filtering
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'audit:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');
    const moduleName = searchParams.get('moduleName');
    const entityId = searchParams.get('entityId');
    const exportCsv = searchParams.get('export') === 'csv';

    const isAdmin = tokenPayload!.roles.includes('Super Admin');

    // Validate search input
    if (search && !validateSafeString(search)) {
      return NextResponse.json({ error: 'Invalid search input' }, { status: 400 });
    }

    // Build where clause
    const where: Record<string, unknown> = {};

    // Company-based access: Super Admin sees all, others see their company's logs
    if (!isAdmin) {
      where.companyId = tokenPayload!.companyId;
    }

    if (action) where.action = sanitizeInput(action);
    if (entityType) where.entityType = sanitizeInput(entityType);
    if (userId) where.userId = sanitizeInput(userId);
    if (moduleName) where.moduleName = sanitizeInput(moduleName);
    if (entityId) where.entityId = sanitizeInput(entityId);

    // Date range filter
    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) createdAt.lte = new Date(endDate);
      where.createdAt = createdAt;
    }

    // Search filter on description
    if (search) {
      where.description = { contains: sanitizeInput(search) };
    }

    // ── CSV Export ───────────────────────────────────────────────
    if (exportCsv) {
      const logs = await db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000, // Safety limit
        include: {
          user: {
            select: {
              username: true,
              displayName: true,
              email: true,
            },
          },
        },
      });

      const csvHeader = 'Timestamp,User,Email,Action,Entity Type,Entity ID,Module,Description,IP Address,User Agent,Old Values,New Values\n';
      const csvRows = logs.map((log) => {
        const ts = log.createdAt.toISOString();
        const user = log.user?.displayName || log.user?.username || 'System';
        const email = log.user?.email || '';
        const desc = `"${(log.description || '').replace(/"/g, '""')}"`;
        const oldVals = log.oldValues ? `"${log.oldValues.replace(/"/g, '""')}"` : '';
        const newVals = log.newValues ? `"${log.newValues.replace(/"/g, '""')}"` : '';
        const ip = log.ipAddress || '';
        const ua = log.userAgent ? `"${log.userAgent.replace(/"/g, '""')}"` : '';

        return `${ts},${user},${email},${log.action},${log.entityType},${log.entityId || ''},${log.moduleName || ''},${desc},${ip},${ua},${oldVals},${newVals}`;
      }).join('\n');

      const csv = csvHeader + csvRows;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // ── Normal paginated response ────────────────────────────────
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    // Compute summary stats for the current filter
    const [
      actionTypes,
      entityTypes,
    ] = await Promise.all([
      db.auditLog.findMany({
        where: { ...where },
        select: { action: true },
      }).then((rows) => {
        const dist: Record<string, number> = {};
        rows.forEach((r) => { dist[r.action] = (dist[r.action] || 0) + 1; });
        return dist;
      }),
      db.auditLog.findMany({
        where: { ...where },
        select: { entityType: true },
      }).then((rows) => {
        const dist: Record<string, number> = {};
        rows.forEach((r) => { dist[r.entityType] = (dist[r.entityType] || 0) + 1; });
        return dist;
      }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        actionTypes,
        entityTypes,
      },
    });
  } catch (error) {
    console.error('Audit GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
