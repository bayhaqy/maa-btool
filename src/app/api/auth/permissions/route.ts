import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest, getUserPermissions } from '@/lib/auth';
import { rateLimitByCategory } from '@/lib/rate-limit';

// GET /api/auth/permissions - Get current user's permissions
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getAuthFromRequest(request);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: read endpoints per user ──────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
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
