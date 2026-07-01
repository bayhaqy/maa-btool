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
    // Only Super Admin can run migrations
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can run migrations' }, { status: 403 });
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
