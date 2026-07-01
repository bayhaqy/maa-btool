import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, generateAccessToken, generateRefreshToken, setAuthCookiesOnResponse } from '@/lib/auth';
import { rateLimitByCategory, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';
import { validateInput, sanitizeString } from '@/lib/api-security';

// Extract the client IP from request headers.
function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    // ── Rate limit: 10 login attempts per IP per minute ───────────────
    const ip = getClientIp(request);
    const rl = rateLimitByCategory('auth', ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        rateLimitResponse(rl, 'auth')
      );
    }

    // ── Input validation ─────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = validateInput(body, { username: 'string', password: 'string' });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join(', ') }, { status: 400 });
    }

    const username = sanitizeString(body.username as string);
    const password = body.password as string; // Don't sanitize password — it's hashed

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
      // ── Audit: failed login ──────────────────────────────────────────
      // Fire-and-forget: don't await to reduce response latency
      logAudit({
        action: AuditAction.AUTH_FAILED,
        entityType: 'SysUser',
        description: `Failed login attempt for username "${username}"`,
        severity: 'warning',
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || 'unknown',
      }).catch(() => {});

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      // ── Audit: failed login ──────────────────────────────────────────
      logAudit({
        action: AuditAction.AUTH_FAILED,
        entityType: 'SysUser',
        entityId: user.id,
        description: `Failed login attempt for user "${username}"`,
        severity: 'warning',
        userId: user.id,
        companyId: user.companyId,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || 'unknown',
      }).catch(() => {});

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

    // ── Audit: successful login (fire-and-forget) ───────────────────────────
    logAudit({
      action: AuditAction.AUTH_LOGIN,
      entityType: 'SysUser',
      entityId: user.id,
      description: `User "${username}" logged in successfully`,
      userId: user.id,
      companyId: user.companyId,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || 'unknown',
    }).catch(() => {});

    const response = NextResponse.json({
      token: accessToken,
      user: tokenPayload,
    });

    // Set cookies on the response using the proper Next.js API
    setAuthCookiesOnResponse(response, accessToken, refreshToken);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    const message = error instanceof Error ? error.message : String(error);
    // In production, only return generic error; in dev, include details
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: 'Internal server error', ...(isDev ? { details: message } : {}) },
      { status: 500 }
    );
  }
}
