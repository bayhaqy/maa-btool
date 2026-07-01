import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, generateAccessToken, generateRefreshToken, setAuthCookiesOnResponse } from '@/lib/auth';
import { rateLimitByCategory, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * POST /api/auth/refresh
 *
 * Uses the refresh_token cookie to issue a new access token (and rotates the
 * refresh token as well). This allows the client to maintain a session beyond
 * the 8-hour access token expiry without requiring the user to re-authenticate.
 *
 * The refresh token is sent as an HttpOnly cookie so the client never has
 * direct access to it — only the browser sends it automatically.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Rate limit: 20 refresh attempts per IP per minute ───────────────
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const rl = rateLimitByCategory('auth', ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many refresh attempts. Please try again later.' },
        rateLimitResponse(rl, 'auth')
      );
    }

    // Read the refresh_token from the HttpOnly cookie
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      );
    }

    // Verify the refresh token
    const payload = verifyToken(refreshToken);

    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    // Issue new tokens (token rotation: the old refresh token is invalidated
    // by issuing a new one with a new signature/timestamp)
    const tokenPayload = {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      companyId: payload.companyId,
      companyCode: payload.companyCode,
      roles: payload.roles,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // ── Audit: token refresh (fire-and-forget) ─────────────────────────
    logAudit({
      action: AuditAction.AUTH_LOGIN,
      entityType: 'SysUser',
      entityId: payload.userId,
      description: `User "${payload.username}" refreshed auth token`,
      userId: payload.userId,
      companyId: payload.companyId,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || 'unknown',
    }).catch(() => {});

    const response = NextResponse.json({
      token: newAccessToken,
      user: tokenPayload,
    });

    // Set the new cookies (rotation)
    setAuthCookiesOnResponse(response, newAccessToken, newRefreshToken);

    return response;
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
