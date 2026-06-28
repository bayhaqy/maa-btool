import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/versions?recordId=xxx — Fetch version history for a specific record
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('recordId');

    if (!recordId) {
      return NextResponse.json({ error: 'recordId is required' }, { status: 400 });
    }

    const versions = await db.dataVersion.findMany({
      where: { recordId },
      orderBy: { versionNumber: 'desc' },
      include: {
        changedBy: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    return NextResponse.json({ versions });
  } catch (error) {
    console.error('Versions GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
