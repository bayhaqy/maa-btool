import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// GET /api/settings - Get all settings or specific key
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: read endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      const setting = await db.appSettings.findUnique({ where: { settingKey: key } });
      if (!setting) {
        return NextResponse.json({ value: null });
      }
      return NextResponse.json({ value: setting.settingValue });
    }

    const settings = await db.appSettings.findMany();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.settingKey] = s.settingValue;
    }
    return NextResponse.json({ settings: result });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/settings - Save settings
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can update settings' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'settings object is required' }, { status: 400 });
    }

    // Get old values for audit
    const oldSettings = await db.appSettings.findMany({
      where: { settingKey: { in: Object.keys(settings) } },
    });
    const oldValues: Record<string, string> = {};
    for (const s of oldSettings) {
      oldValues[s.settingKey] = s.settingValue;
    }

    // Upsert each setting
    for (const [key, value] of Object.entries(settings)) {
      await db.appSettings.upsert({
        where: { settingKey: key },
        update: { settingValue: value, updatedById: tokenPayload.userId },
        create: { settingKey: key, settingValue: value, updatedById: tokenPayload.userId },
      });
    }

    // ── Audit: settings change ──────────────────────────────────────────
    await logAudit({
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'AppSettings',
      description: `Settings updated: ${Object.keys(settings).join(', ')}`,
      oldValues,
      newValues: settings,
      severity: 'warning',
      req: request,
    });

    return NextResponse.json({ message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
