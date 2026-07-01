import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  ensureR2Config,
  isR2Configured,
  listR2Objects,
  getR2ConfigInfo,
} from '@/lib/r2';

/**
 * GET /api/health/r2
 *
 * Lightweight R2 connectivity test endpoint. Returns:
 *   - Connection status (operational / degraded / not_configured / down)
 *   - Config info (bucket, masked endpoint, public URL status)
 *   - R2 asset counts and total size
 *   - Storage breakdown (R2 vs Local vs FileAsset)
 *
 * Accessible ONLY to Super Admin users.
 */
export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const tokenPayload = getTokenFromHeaders(request.headers);
  if (!tokenPayload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tokenPayload.roles.includes('Super Admin')) {
    return NextResponse.json(
      { error: 'Forbidden — Super Admin role required' },
      { status: 403 },
    );
  }

  type ServiceStatus = 'operational' | 'degraded' | 'down' | 'not_configured';

  const start = Date.now();

  // ── Connectivity check ────────────────────────────────────────────────
  let status: ServiceStatus = 'not_configured';
  let details = '';
  let objectCount = 0;

  try {
    await ensureR2Config();
    const configured = isR2Configured();

    if (!configured) {
      status = 'not_configured';
      details = 'R2 credentials not configured — using local storage fallback';
    } else {
      // Verify connectivity by listing objects
      try {
        const keys = await listR2Objects('images/', 1);
        objectCount = keys.length;
        status = 'operational';
        const configInfo = getR2ConfigInfo();
        details = `Cloudflare R2 · Bucket: ${configInfo.bucket} · Connected`;
      } catch {
        status = 'degraded';
        const configInfo = getR2ConfigInfo();
        details = `Cloudflare R2 · Bucket: ${configInfo.bucket} · Config present but cannot connect`;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status = 'down';
    details = `R2 check failed: ${message}`;
  }

  const responseTimeMs = Date.now() - start;

  // ── Config info (masked) ──────────────────────────────────────────────
  let configInfo: {
    endpoint: string;
    bucket: string;
    publicUrl: string;
    hasPublicUrl: boolean;
  } | null = null;

  try {
    const raw = getR2ConfigInfo();
    if (raw.endpoint) {
      configInfo = {
        endpoint: raw.endpoint.replace(/^(https?:\/\/)/, (_, proto) => proto + '***'),
        bucket: raw.bucket,
        publicUrl: raw.publicUrl
          ? raw.publicUrl.replace(/^(https?:\/\/)/, (_, proto) => proto + '***')
          : '',
        hasPublicUrl: !!raw.publicUrl,
      };
    }
  } catch {
    // R2 not configured
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  const [
    r2AssetsCount,
    r2ImageAssetsCount,
    r2TotalSize,
    localAssetsCount,
    localImageAssetsCount,
    fileAssetCount,
  ] = await Promise.allSettled([
    db.digitalAsset.count({ where: { storageType: 'r2' } }),
    db.imageAsset.count({ where: { storageType: 'r2' } }),
    db.digitalAsset.aggregate({ where: { storageType: 'r2' }, _sum: { fileSize: true } }),
    db.digitalAsset.count({ where: { storageType: 'local' } }),
    db.imageAsset.count({ where: { storageType: 'local' } }),
    db.fileAsset.count(),
  ]);

  const r2Assets = r2AssetsCount.status === 'fulfilled' ? r2AssetsCount.value : 0;
  const r2ImageAssets = r2ImageAssetsCount.status === 'fulfilled' ? r2ImageAssetsCount.value : 0;
  const totalSize = r2TotalSize.status === 'fulfilled' ? (r2TotalSize.value._sum.fileSize as number) ?? 0 : 0;
  const localCount = (localAssetsCount.status === 'fulfilled' ? localAssetsCount.value : 0) +
    (localImageAssetsCount.status === 'fulfilled' ? localImageAssetsCount.value : 0);
  const fileAssets = fileAssetCount.status === 'fulfilled' ? fileAssetCount.value : 0;

  return NextResponse.json({
    status,
    details,
    responseTimeMs,
    objectCount,
    configInfo,
    r2AssetsCount: r2Assets,
    r2ImageAssetsCount: r2ImageAssets,
    r2TotalSize: totalSize,
    storageBreakdown: {
      r2: r2Assets + r2ImageAssets,
      local: localCount,
      fileAsset: fileAssets,
    },
    timestamp: new Date().toISOString(),
  });
}
