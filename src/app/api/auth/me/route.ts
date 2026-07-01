import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { rateLimitByCategory } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getAuthFromRequest(request);

    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ── Rate limit: read endpoints per user ──────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    return NextResponse.json({ user: tokenPayload });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
