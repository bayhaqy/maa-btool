import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, generateAccessToken, generateRefreshToken, setAuthCookies } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

// Extract the client IP from request headers. On Vercel, `x-forwarded-for`
// is set by the platform; in local dev we fall back to `x-real-ip` or an
// unknown sentinel so the limiter still has a key to track.
function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // x-forwarded-for can be a comma-separated list; the first entry is
    // the original client IP.
    return xff.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    // ── Rate limit: 10 login attempts per IP per 5 minutes ───────────────
    const ip = getClientIp(request);
    const rl = rateLimit(`login:${ip}`, { limit: 10, windowMs: 5 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rl.retryAfterSeconds),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
          },
        }
      );
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await db.sysUser.findUnique({
      where: { username },
      include: {
        company: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const roles = user.userRoles.map((ur) => ur.role.roleName);
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      companyId: user.companyId,
      companyCode: user.company.companyCode,
      roles,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    const cookieHeaders = setAuthCookies(accessToken, refreshToken);

    const response = NextResponse.json({
      token: accessToken,
      user: tokenPayload,
    });

    // Set cookies on the response
    response.headers.set('Set-Cookie', cookieHeaders['Set-Cookie']);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
