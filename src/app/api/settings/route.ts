import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';

// GET /api/settings - Get all settings or specific key
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'settings object is required' }, { status: 400 });
    }

    // Upsert each setting
    for (const [key, value] of Object.entries(settings)) {
      await db.appSettings.upsert({
        where: { settingKey: key },
        update: { settingValue: value, updatedById: tokenPayload.userId },
        create: { settingKey: key, settingValue: value, updatedById: tokenPayload.userId },
      });
    }

    return NextResponse.json({ message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
