import { NextResponse } from 'next/server';

// Force dynamic rendering so preview deployments always reflect current env vars
export const dynamic = 'force-dynamic';
// Use the Node.js runtime (reads process.env.* at request time)
export const runtime = 'nodejs';

// GET /api/deployment-info — Returns deployment metadata sourced from Vercel runtime env vars.
// No authentication required: this endpoint only exposes non-sensitive deployment metadata
// (environment name, region, project name, URL, analytics flags). It does NOT leak secrets.
export async function GET() {
  try {
    const environment =
      process.env.VERCEL_ENV ?? // 'production' | 'preview' | 'development' (set by Vercel)
      (process.env.NODE_ENV === 'production' ? 'production' : 'development');

    const deploymentUrl = process.env.VERCEL_URL ?? null; // e.g. maa-btool-abc123-bayhaqys-projects.vercel.app
    const region = process.env.VERCEL_REGION ?? null; // e.g. sin1
    const projectName = process.env.VERCEL_PROJECT_NAME ?? 'maa-btool';

    // Analytics & Speed Insights are wired in src/app/layout.tsx via @vercel/analytics
    // and @vercel/speed-insights components. They activate automatically in production.
    // We expose a feature flag that the frontend can use for status display.
    const analyticsEnabled = true;
    const speedInsightsEnabled = true;

    // Normalize the public URL: prefer canonical production domain, fall back to VERCEL_URL
    const publicUrl =
      environment === 'production'
        ? 'https://maa-btool.bayhaqy.my.id'
        : deploymentUrl
          ? `https://${deploymentUrl}`
          : 'http://localhost:3000';

    return NextResponse.json(
      {
        environment,
        region,
        deploymentUrl,
        publicUrl,
        projectName,
        analyticsEnabled,
        speedInsightsEnabled,
        framework: 'nextjs',
        frameworkVersion: '16',
        runtime: 'nodejs20',
        regions: ['sin1', 'hkg1', 'iad1'],
        regionsLabel: ['Singapore', 'Hong Kong', 'Washington D.C.'],
        buildCommand: 'next build',
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          // Short cache so preview deployments reflect updated env quickly
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('deployment-info GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
