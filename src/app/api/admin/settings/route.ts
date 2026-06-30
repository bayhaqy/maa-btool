// ============================================================================
// admin/settings/route.ts — System Settings Management API
//
// Manages AppSettings including R2 storage configuration.
// All endpoints require Super Admin access.
//
// GET  — List all settings (masks sensitive values)
// POST — Create or update a setting
// PUT  — Bulk update settings (used for R2 setup)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { reloadR2Config, getR2ConfigInfo } from '@/lib/r2';

// Keys that contain sensitive data (will be masked in GET responses)
const SENSITIVE_KEYS = ['R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'SMTP_PASSWORD', 'API_KEY'];

function maskValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.includes(key) && value.length > 4) {
    return value.substring(0, 4) + '***masked***';
  }
  return value;
}

// GET /api/admin/settings — List all settings
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    const settings = await db.appSettings.findMany({
      orderBy: { settingKey: 'asc' },
    });

    // Mask sensitive values
    const maskedSettings = settings.map((s) => ({
      ...s,
      settingValue: maskValue(s.settingKey, s.settingValue),
    }));

    // Also return current R2 config status
    const r2Config = getR2ConfigInfo();
    const r2Status = {
      configured: !!(r2Config.endpoint && r2Config.accessKeyId && r2Config.secretAccessKey),
      endpoint: r2Config.endpoint ? maskValue('R2_ENDPOINT', r2Config.endpoint) : '(not set)',
      bucket: r2Config.bucket || '(not set)',
      publicUrl: r2Config.publicUrl || '(not set)',
    };

    return NextResponse.json({ settings: maskedSettings, r2Status });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/settings — Create or update a single setting
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { settingKey, settingValue } = body as { settingKey: string; settingValue: string };

    if (!settingKey || settingValue === undefined) {
      return NextResponse.json({ error: 'settingKey and settingValue are required' }, { status: 400 });
    }

    const upserted = await db.appSettings.upsert({
      where: { settingKey },
      update: { settingValue, updatedById: tokenPayload.userId },
      create: { settingKey, settingValue, updatedById: tokenPayload.userId },
    });

    // If this is an R2 setting, reload the R2 config
    if (settingKey.startsWith('R2_')) {
      console.log(`[Settings] R2 setting changed: ${settingKey}, reloading config...`);
      await reloadR2Config();
    }

    return NextResponse.json({ setting: upserted });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/settings — Bulk update settings (used for R2 setup)
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'settings object is required' }, { status: 400 });
    }

    const results: Array<{ key: string; success: boolean; error?: string }> = [];
    let hasR2Changes = false;

    for (const [key, value] of Object.entries(settings)) {
      try {
        await db.appSettings.upsert({
          where: { settingKey: key },
          update: { settingValue: value, updatedById: tokenPayload.userId },
          create: { settingKey: key, settingValue: value, updatedById: tokenPayload.userId },
        });
        results.push({ key, success: true });
        if (key.startsWith('R2_')) hasR2Changes = true;
      } catch (err) {
        results.push({ key, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    // If any R2 settings changed, reload the R2 config
    if (hasR2Changes) {
      console.log('[Settings] R2 settings changed, reloading config...');
      await reloadR2Config();
    }

    const r2Config = getR2ConfigInfo();
    const r2Status = {
      configured: !!(r2Config.endpoint && r2Config.accessKeyId && r2Config.secretAccessKey),
      endpoint: r2Config.endpoint ? maskValue('R2_ENDPOINT', r2Config.endpoint) : '(not set)',
      bucket: r2Config.bucket || '(not set)',
      publicUrl: r2Config.publicUrl || '(not set)',
    };

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        success: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
      r2Status,
    });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
