import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders, getUserPermissions } from '@/lib/auth';

// GET /api/auth/permissions - Get current user's permissions
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = await getUserPermissions(tokenPayload.userId);

    return NextResponse.json({
      permissions: permissions.modules,
      allowedPages: permissions.allowedPages,
      isSuperAdmin: permissions.isSuperAdmin,
    });
  } catch (error) {
    console.error('Permissions GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
