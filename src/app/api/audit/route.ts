import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';

// GET /api/audit - Fetch audit logs with pagination and filtering
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');

    // Build where clause
    const where: Record<string, unknown> = {};

    // Company-based access: Super Admin sees all, others see their company's logs
    if (!isSuperAdmin) {
      where.companyId = tokenPayload.companyId;
    }

    if (action) {
      where.action = action;
    }
    if (entityType) {
      where.entityType = entityType;
    }
    if (userId) {
      where.userId = userId;
    }

    // Date range filter
    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) createdAt.lte = new Date(endDate);
      where.createdAt = createdAt;
    }

    // Search filter on description
    if (search) {
      where.description = { contains: search };
    }

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
            },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Audit GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
