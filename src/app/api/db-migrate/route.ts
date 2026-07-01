// ============================================================================
// Database Schema Migration API
//
// Applies schema changes to the production PostgreSQL database that
// Prisma `db push` would normally handle. This is needed because
// the Supabase PostgreSQL needs manual ALTER TABLE statements for
// adding new columns.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  try {
    // Allow migration via secret token OR Super Admin auth
    // The secret is the Vercel API token, allowing CI/CD migration
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');
    const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
    
    if (secret && VERCEL_TOKEN && secret === VERCEL_TOKEN) {
      // Authenticated via secret token — proceed
    } else {
      // Only Super Admin can run migrations
      const tokenPayload = getTokenFromHeaders(request.headers);
      if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
        return NextResponse.json({ error: 'Only Super Admin can run migrations' }, { status: 403 });
      }
    }

    const migrations: Array<{ sql: string; description: string; status: 'success' | 'skipped' | 'error'; error?: string }> = [];

    const allMigrations = [
      // AppSettings: Ensure table exists (for R2 config storage)
      {
        sql: `CREATE TABLE IF NOT EXISTS "AppSettings" (
          "id" TEXT NOT NULL,
          "settingKey" TEXT NOT NULL,
          "settingValue" TEXT NOT NULL,
          "updatedById" TEXT,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
        )`,
        description: 'Create AppSettings table if not exists',
      },
      {
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS "AppSettings_settingKey_key" ON "AppSettings"("settingKey")`,
        description: 'Create unique index on AppSettings.settingKey',
      },
      // ImageAsset: Add R2 fields
      {
        sql: `ALTER TABLE "ImageAsset" ADD COLUMN IF NOT EXISTS "r2Key" TEXT`,
        description: 'Add r2Key column to ImageAsset',
      },
      {
        sql: `ALTER TABLE "ImageAsset" ADD COLUMN IF NOT EXISTS "storageType" TEXT NOT NULL DEFAULT 'local'`,
        description: 'Add storageType column to ImageAsset',
      },
      // ImageVariant: Add R2 key
      {
        sql: `ALTER TABLE "ImageVariant" ADD COLUMN IF NOT EXISTS "r2Key" TEXT`,
        description: 'Add r2Key column to ImageVariant',
      },
      // DigitalAsset: Add R2 fields
      {
        sql: `ALTER TABLE "DigitalAsset" ADD COLUMN IF NOT EXISTS "r2Key" TEXT`,
        description: 'Add r2Key column to DigitalAsset',
      },
      {
        sql: `ALTER TABLE "DigitalAsset" ADD COLUMN IF NOT EXISTS "storageType" TEXT NOT NULL DEFAULT 'local'`,
        description: 'Add storageType column to DigitalAsset',
      },
      // RLS: Add data scope fields to SysUser
      {
        sql: `ALTER TABLE "SysUser" ADD COLUMN IF NOT EXISTS "assignedBrands" TEXT`,
        description: 'Add assignedBrands column to SysUser',
      },
      {
        sql: `ALTER TABLE "SysUser" ADD COLUMN IF NOT EXISTS "assignedCountries" TEXT`,
        description: 'Add assignedCountries column to SysUser',
      },
      {
        sql: `ALTER TABLE "SysUser" ADD COLUMN IF NOT EXISTS "assignedTeams" TEXT`,
        description: 'Add assignedTeams column to SysUser',
      },
      {
        sql: `ALTER TABLE "SysUser" ADD COLUMN IF NOT EXISTS "dataScope" TEXT`,
        description: 'Add dataScope column to SysUser',
      },
      // RLS: Add data scope fields to SysRole
      {
        sql: `ALTER TABLE "SysRole" ADD COLUMN IF NOT EXISTS "dataScope" TEXT`,
        description: 'Add dataScope column to SysRole',
      },
      {
        sql: `ALTER TABLE "SysRole" ADD COLUMN IF NOT EXISTS "scopeConfig" TEXT`,
        description: 'Add scopeConfig column to SysRole',
      },
      // RLS: Add denormalized fields to DataRecord for fast filtering
      {
        sql: `ALTER TABLE "DataRecord" ADD COLUMN IF NOT EXISTS "brand" TEXT`,
        description: 'Add brand column to DataRecord',
      },
      {
        sql: `ALTER TABLE "DataRecord" ADD COLUMN IF NOT EXISTS "country" TEXT`,
        description: 'Add country column to DataRecord',
      },
      {
        sql: `ALTER TABLE "DataRecord" ADD COLUMN IF NOT EXISTS "region" TEXT`,
        description: 'Add region column to DataRecord',
      },
    ];

    for (const migration of allMigrations) {
      try {
        await db.$executeRawUnsafe(migration.sql);
        migrations.push({ ...migration, status: 'success' });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          migrations.push({ ...migration, status: 'skipped', error: 'Column already exists' });
        } else {
          migrations.push({ ...migration, status: 'error', error: msg });
        }
      }
    }

    const successCount = migrations.filter((m) => m.status === 'success').length;
    const skippedCount = migrations.filter((m) => m.status === 'skipped').length;
    const errorCount = migrations.filter((m) => m.status === 'error').length;

    return NextResponse.json({
      success: errorCount === 0,
      summary: { total: migrations.length, success: successCount, skipped: skippedCount, errors: errorCount },
      migrations,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
