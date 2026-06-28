import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/db-check
 * Public endpoint to check database connectivity and basic schema state.
 * Does NOT require authentication (for debugging deployment issues).
 */
export async function GET() {
  try {
    // Check basic connectivity
    const result = await db.$queryRaw`SELECT 1 as ok`;
    const connected = Array.isArray(result) && result.length > 0;

    // Check if critical tables exist by trying to count rows
    const checks: Record<string, { exists: boolean; count?: number; error?: string }> = {};

    const tables = ['SysUser', 'TenantCompany', 'SysRole', 'SysUserRole', 'MetaModule', 'DataRecord'];

    for (const table of tables) {
      try {
        const count = await (db as Record<string, { count: () => Promise<number> }>)[table].count();
        checks[table] = { exists: true, count };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        checks[table] = { exists: false, error: message.slice(0, 200) };
      }
    }

    // Check if superadmin user exists
    let superAdmin = null;
    try {
      const user = await db.sysUser.findFirst({ where: { username: 'superadmin' } });
      if (user) {
        superAdmin = {
          id: user.id,
          username: user.username,
          isActive: user.isActive,
          hasPassword: !!user.passwordHash,
          companyId: user.companyId,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      superAdmin = { error: message.slice(0, 200) };
    }

    return NextResponse.json({
      connected,
      checks,
      superAdmin,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      connected: false,
      error: message.slice(0, 500),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
