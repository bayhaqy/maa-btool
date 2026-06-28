/**
 * AI Environment Variables API
 *
 * PUT — Save AI_PROVIDER and AI_API_KEY to AppSettings (database) AND
 *       register them as Vercel environment variables via the Vercel API.
 *       Super Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { clearAICache, type AIProvider } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EnvUpdateRequest {
  provider: AIProvider;
  apiKey: string;
}

function requireSuperAdmin(headers: Headers): boolean {
  const tokenPayload = getTokenFromHeaders(headers);
  if (!tokenPayload) return false;
  return tokenPayload.roles.includes('Super Admin');
}

async function upsertSetting(key: string, value: string, updatedById?: string): Promise<void> {
  await db.appSettings.upsert({
    where: { settingKey: key },
    update: { settingValue: value, updatedById: updatedById ?? null },
    create: { settingKey: key, settingValue: value, updatedById: updatedById ?? null },
  });
}

/**
 * Update a Vercel environment variable via the Vercel REST API.
 * Falls back gracefully if the Vercel token is not available.
 */
async function updateVercelEnvVar(key: string, value: string): Promise<{ success: boolean; message?: string }> {
  const vercelToken = process.env.VERCEL_TOKEN;
  const vercelTeamId = process.env.VERCEL_TEAM_ID;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;

  if (!vercelToken || !vercelProjectId) {
    return { success: false, message: 'Vercel integration not configured (VERCEL_TOKEN or VERCEL_PROJECT_ID missing)' };
  }

  const baseUrl = vercelTeamId
    ? `https://api.vercel.com/v9/projects/${vercelProjectId}/env?teamId=${vercelTeamId}`
    : `https://api.vercel.com/v9/projects/${vercelProjectId}/env`;

  try {
    // First, try to create the env var
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      }),
    });

    if (res.ok) {
      return { success: true };
    }

    // If conflict (already exists), update it via PATCH
    if (res.status === 409) {
      // Need to find the env var ID first
      const listRes = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${vercelToken}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const existing = listData.envs?.find((e: { key: string }) => e.key === key);
        if (existing?.id) {
          const patchUrl = vercelTeamId
            ? `https://api.vercel.com/v9/projects/${vercelProjectId}/env/${existing.id}?teamId=${vercelTeamId}`
            : `https://api.vercel.com/v9/projects/${vercelProjectId}/env/${existing.id}`;
          const patchRes = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ value }),
          });
          if (patchRes.ok) {
            return { success: true };
          }
          const errData = await patchRes.json().catch(() => ({}));
          return { success: false, message: `Vercel PATCH failed: ${errData.error?.message || 'Unknown error'}` };
        }
      }
      return { success: false, message: 'Vercel env var exists but could not update it' };
    }

    const errData = await res.json().catch(() => ({}));
    return { success: false, message: `Vercel API error: ${errData.error?.message || 'Unknown error'}` };
  } catch (err) {
    return { success: false, message: `Vercel request failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!requireSuperAdmin(request.headers)) {
      return NextResponse.json({ error: 'Access denied. Super Admin role required.' }, { status: 403 });
    }

    const body: EnvUpdateRequest = await request.json();

    if (!body.provider || !body.apiKey) {
      return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 });
    }

    const validProviders: AIProvider[] = ['zai', 'gemini', 'openai', 'azure-openai', 'custom'];
    if (!validProviders.includes(body.provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // 1. Save to AppSettings (database) — this is the primary storage
    const tokenPayload = getTokenFromHeaders(request.headers);
    const userId = tokenPayload?.userId;

    await db.$transaction([
      db.appSettings.upsert({
        where: { settingKey: 'AI_PROVIDER' },
        update: { settingValue: body.provider, updatedById: userId ?? null },
        create: { settingKey: 'AI_PROVIDER', settingValue: body.provider, updatedById: userId ?? null },
      }),
      db.appSettings.upsert({
        where: { settingKey: 'AI_API_KEY' },
        update: { settingValue: body.apiKey, updatedById: userId ?? null },
        create: { settingKey: 'AI_API_KEY', settingValue: body.apiKey, updatedById: userId ?? null },
      }),
    ]);

    // 2. Clear AI cache so next read picks up changes
    clearAICache();

    // 3. Attempt to update Vercel environment variables
    const vercelResults: Record<string, { success: boolean; message?: string }> = {};

    const providerResult = await updateVercelEnvVar('AI_PROVIDER', body.provider);
    vercelResults['AI_PROVIDER'] = providerResult;

    const keyResult = await updateVercelEnvVar('AI_API_KEY', body.apiKey);
    vercelResults['AI_API_KEY'] = keyResult;

    const allVercelSuccess = Object.values(vercelResults).every(r => r.success);

    return NextResponse.json({
      success: true,
      database: true,
      vercel: allVercelSuccess,
      vercelResults,
      message: allVercelSuccess
        ? 'AI settings saved to database and Vercel environment variables.'
        : 'AI settings saved to database. Vercel environment update had issues — see vercelResults for details.',
    });
  } catch (error) {
    console.error('AI Env PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
