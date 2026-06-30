// ============================================================================
// r2-migrate/route.ts — R2 Migration & Digital Asset Sync API
//
// Three actions (all POST, require Super Admin):
//   1. migrate-existing — Move ImageAsset + DigitalAsset files to R2
//   2. sync-external     — Download external URLs → R2 + create DigitalAssets
//   3. sync-to-dam       — Populate DigitalAssets from existing ImageAssets
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import {
  isR2Configured,
  uploadWithVariants,
  uploadToR2,
  deleteFromR2,
  downloadFromUrl,
  generateR2Key,
  getR2PublicUrl,
} from '@/lib/r2';
import { jsonVal, jsonParse } from '@/lib/db-json';

const BATCH_SIZE = 10;

// ─── Auth Guard ──────────────────────────────────────────────────────────────

function requireSuperAdmin(request: NextRequest): { error: NextResponse<unknown> } | { token: ReturnType<typeof getTokenFromHeaders> } {
  const token = getTokenFromHeaders(request.headers);
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!token.roles.includes('Super Admin')) {
    return { error: NextResponse.json({ error: 'Super Admin permissions required for migration operations' }, { status: 403 }) };
  }
  return { token };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract a FileAsset cuid from a legacy filePath.
 * Examples:
 *   "/api/uploads/clxxxx123"      → "clxxxx123"
 *   "/api/uploads/digital-assets/clxxxx123" → "clxxxx123"
 *   "/api/uploads/1234_photo.jpg" → null (not a cuid)
 */
function extractFileAssetId(filePath: string): string | null {
  const segments = filePath.split('/');
  const last = segments[segments.length - 1];
  if (last && /^c[a-z0-9]{20,}$/i.test(last)) return last;
  // Also check second-to-last / third-to-last for nested paths
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && /^c[a-z0-9]{20,}$/i.test(seg)) return seg;
  }
  return null;
}

/**
 * Download image buffer from a legacy filePath.
 * Tries FileAsset DB first, then falls back to disk.
 */
async function downloadFromLegacyPath(filePath: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // 1. Try FileAsset in database
  const fileAssetId = extractFileAssetId(filePath);
  if (fileAssetId) {
    try {
      const fileAsset = await db.fileAsset.findUnique({ where: { id: fileAssetId } });
      if (fileAsset?.fileData) {
        return {
          buffer: Buffer.from(fileAsset.fileData),
          mimeType: fileAsset.mimeType || 'image/jpeg',
        };
      }
    } catch (err) {
      console.warn(`[r2-migrate] FileAsset lookup failed for ID ${fileAssetId}:`, err instanceof Error ? err.message : err);
    }
  }

  // 2. Try reading from disk (local dev filesystem)
  try {
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const { existsSync } = await import('fs');
    const diskPath = join(process.cwd(), 'public', filePath);
    if (existsSync(diskPath)) {
      const buffer = await readFile(diskPath);
      // Infer MIME from extension
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff',
        heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
      };
      return { buffer, mimeType: mimeMap[ext] || 'image/jpeg' };
    }
  } catch (err) {
    console.warn(`[r2-migrate] Disk read failed for ${filePath}:`, err instanceof Error ? err.message : err);
  }

  return null;
}

/**
 * Check if a filePath looks like an external URL
 */
function isExternalUrl(filePath: string): boolean {
  return filePath.startsWith('http://') || filePath.startsWith('https://');
}

// ─── POST Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth check ──
  const authResult = requireSuperAdmin(request);
  if ('error' in authResult) return authResult.error;
  const tokenPayload = authResult.token;

  // ── R2 check ──
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'R2 storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.' },
      { status: 503 }
    );
  }

  // ── Parse body ──
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action || '');

  switch (action) {
    case 'migrate-existing':
      return handleMigrateExisting(body, tokenPayload);
    case 'sync-external':
      return handleSyncExternal(body, tokenPayload);
    case 'sync-to-dam':
      return handleSyncToDam(tokenPayload);
    default:
      return NextResponse.json(
        { error: `Unknown action "${action}". Valid actions: migrate-existing, sync-external, sync-to-dam` },
        { status: 400 }
      );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. migrate-existing — Move local/FileAsset images to R2
// ═══════════════════════════════════════════════════════════════════════════════

async function handleMigrateExisting(
  _body: Record<string, unknown>,
  _token: NonNullable<ReturnType<typeof getTokenFromHeaders>>
) {
  const imageResults: Array<{
    type: 'ImageAsset' | 'DigitalAsset';
    id: string;
    success: boolean;
    error?: string;
    r2Key?: string;
  }> = [];

  const digitalResults: Array<{
    type: 'ImageAsset' | 'DigitalAsset';
    id: string;
    success: boolean;
    error?: string;
    r2Key?: string;
  }> = [];

  // ── Migrate ImageAssets ──
  const imageAssets = await db.imageAsset.findMany({
    where: { storageType: { not: 'r2' } },
    include: { record: { select: { companyId: true } } },
  });

  console.log(`[r2-migrate] Found ${imageAssets.length} ImageAssets to migrate`);

  for (let i = 0; i < imageAssets.length; i += BATCH_SIZE) {
    const batch = imageAssets.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (img) => {
        try {
          // Skip external URLs — they need sync-external action
          if (isExternalUrl(img.filePath)) {
            imageResults.push({
              type: 'ImageAsset',
              id: img.id,
              success: false,
              error: 'External URL — use sync-external action instead',
            });
            return;
          }

          // Download the file from legacy storage
          const downloaded = await downloadFromLegacyPath(img.filePath);
          if (!downloaded) {
            imageResults.push({
              type: 'ImageAsset',
              id: img.id,
              success: false,
              error: `Could not download file from path: ${img.filePath}`,
            });
            return;
          }

          // Upload to R2 with variants
          const r2Key = generateR2Key('images', img.recordId, img.fileName);
          await uploadWithVariants(downloaded.buffer, r2Key, img.mimeType || downloaded.mimeType, {
            metadata: { 'original-name': img.fileName, 'migrated-from': img.filePath },
          });

          // Update the ImageAsset record
          const publicUrl = getR2PublicUrl(r2Key) || `/api/r2-image?key=${encodeURIComponent(r2Key)}/original`;
          await db.imageAsset.update({
            where: { id: img.id },
            data: {
              r2Key,
              storageType: 'r2',
              filePath: publicUrl,
            },
          });

          imageResults.push({ type: 'ImageAsset', id: img.id, success: true, r2Key });
        } catch (err) {
          imageResults.push({
            type: 'ImageAsset',
            id: img.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );
  }

  // ── Migrate DigitalAssets ──
  const digitalAssets = await db.digitalAsset.findMany({
    where: { storageType: { not: 'r2' } },
  });

  console.log(`[r2-migrate] Found ${digitalAssets.length} DigitalAssets to migrate`);

  for (let i = 0; i < digitalAssets.length; i += BATCH_SIZE) {
    const batch = digitalAssets.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (asset) => {
        try {
          // Skip external URLs
          if (isExternalUrl(asset.filePath)) {
            digitalResults.push({
              type: 'DigitalAsset',
              id: asset.id,
              success: false,
              error: 'External URL — use sync-external action instead',
            });
            return;
          }

          // Download the file from legacy storage
          const downloaded = await downloadFromLegacyPath(asset.filePath);
          if (!downloaded) {
            digitalResults.push({
              type: 'DigitalAsset',
              id: asset.id,
              success: false,
              error: `Could not download file from path: ${asset.filePath}`,
            });
            return;
          }

          // Upload to R2
          const isImage = asset.assetType === 'IMAGE' || downloaded.mimeType.startsWith('image/');
          const r2Key = generateR2Key('digital-assets', asset.recordId || 'unlinked', asset.originalFileName || asset.fileName);

          if (isImage) {
            await uploadWithVariants(downloaded.buffer, r2Key, downloaded.mimeType, {
              metadata: { 'original-name': asset.originalFileName || asset.fileName, 'migrated-from': asset.filePath },
            });
          } else {
            await uploadToR2(downloaded.buffer, r2Key, downloaded.mimeType, {
              metadata: { 'original-name': asset.originalFileName || asset.fileName, 'migrated-from': asset.filePath },
            });
          }

          // Update the DigitalAsset record
          const publicUrl = getR2PublicUrl(r2Key) || `/api/r2-image?key=${encodeURIComponent(r2Key)}`;
          await db.digitalAsset.update({
            where: { id: asset.id },
            data: {
              r2Key,
              storageType: 'r2',
              filePath: publicUrl,
            },
          });

          digitalResults.push({ type: 'DigitalAsset', id: asset.id, success: true, r2Key });
        } catch (err) {
          digitalResults.push({
            type: 'DigitalAsset',
            id: asset.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );
  }

  const allResults = [...imageResults, ...digitalResults];
  const totalSuccess = allResults.filter((r) => r.success).length;
  const totalFailed = allResults.filter((r) => !r.success).length;

  return NextResponse.json({
    action: 'migrate-existing',
    summary: {
      imageAssets: {
        total: imageResults.length,
        migrated: imageResults.filter((r) => r.success).length,
        failed: imageResults.filter((r) => !r.success).length,
      },
      digitalAssets: {
        total: digitalResults.length,
        migrated: digitalResults.filter((r) => r.success).length,
        failed: digitalResults.filter((r) => !r.success).length,
      },
      totalMigrated: totalSuccess,
      totalFailed,
    },
    results: allResults,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. sync-external — Download external URLs → R2 + create DigitalAssets
// ═══════════════════════════════════════════════════════════════════════════════

interface SyncExternalInput {
  url: string;
  recordId: string;
  title?: string;
  altText?: string;
}

async function handleSyncExternal(
  body: Record<string, unknown>,
  token: NonNullable<ReturnType<typeof getTokenFromHeaders>>
) {
  const urls = body.urls as SyncExternalInput[] | undefined;

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: 'urls array is required with at least one entry. Format: [{ url, recordId, title?, altText? }]' },
      { status: 400 }
    );
  }

  const results: Array<{
    url: string;
    recordId: string;
    success: boolean;
    error?: string;
    digitalAssetId?: string;
    r2Key?: string;
  }> = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (entry) => {
        try {
          const { url, recordId, title, altText } = entry;

          if (!url || !recordId) {
            results.push({
              url: url || '',
              recordId: recordId || '',
              success: false,
              error: 'Both url and recordId are required',
            });
            return;
          }

          // Download from external URL
          const { buffer, mimeType, size } = await downloadFromUrl(url);

          // Determine asset type from MIME
          const isImage = mimeType.startsWith('image/');
          const assetType = isImage ? 'IMAGE' : 'DOCUMENT';
          const fileName = url.split('/').pop() || `external_asset_${Date.now()}`;
          const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

          // Upload to R2 with variants (if image)
          const r2Key = generateR2Key('digital-assets', recordId, safeName);
          if (isImage) {
            await uploadWithVariants(buffer, r2Key, mimeType, {
              metadata: { 'source-url': url, 'original-name': fileName },
            });
          } else {
            await uploadToR2(buffer, r2Key, mimeType, {
              metadata: { 'source-url': url, 'original-name': fileName },
            });
          }

          const publicUrl = getR2PublicUrl(r2Key) || `/api/r2-image?key=${encodeURIComponent(r2Key)}`;

          // Look up the record to get companyId
          const record = await db.dataRecord.findUnique({
            where: { id: recordId },
            select: { companyId: true },
          });
          const companyId = record?.companyId || token.companyId;

          // Create DigitalAsset record
          const digitalAsset = await db.digitalAsset.create({
            data: {
              companyId,
              recordId,
              assetType,
              fileName: safeName,
              originalFileName: fileName,
              filePath: publicUrl,
              fileSize: size,
              mimeType,
              title: title || fileName,
              description: `Synced from external URL: ${url}`,
              altText: altText || title || null,
              status: 'APPROVED',
              category: 'synced-external',
              tags: jsonVal(['external', 'synced']),
              uploadedById: token.userId,
              r2Key,
              storageType: 'r2',
            },
          });

          results.push({
            url,
            recordId,
            success: true,
            digitalAssetId: digitalAsset.id,
            r2Key,
          });
        } catch (err) {
          results.push({
            url: entry.url || '',
            recordId: entry.recordId || '',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );
  }

  const totalSuccess = results.filter((r) => r.success).length;
  const totalFailed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    action: 'sync-external',
    summary: {
      total: results.length,
      synced: totalSuccess,
      failed: totalFailed,
    },
    results,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. sync-to-dam — Create DigitalAssets from existing ImageAssets
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSyncToDam(
  token: NonNullable<ReturnType<typeof getTokenFromHeaders>>
) {
  const imageAssets = await db.imageAsset.findMany({
    include: { record: { select: { companyId: true } } },
  });

  console.log(`[r2-migrate] Found ${imageAssets.length} ImageAssets to sync to DAM`);

  const results: Array<{
    imageAssetId: string;
    recordId: string;
    fileName: string;
    success: boolean;
    error?: string;
    digitalAssetId?: string;
    skipped?: boolean;
  }> = [];

  for (let i = 0; i < imageAssets.length; i += BATCH_SIZE) {
    const batch = imageAssets.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (img) => {
        try {
          // Check if a DigitalAsset already exists for this recordId + fileName
          const existing = await db.digitalAsset.findFirst({
            where: {
              recordId: img.recordId,
              fileName: img.fileName,
            },
          });

          if (existing) {
            results.push({
              imageAssetId: img.id,
              recordId: img.recordId,
              fileName: img.fileName,
              success: true,
              skipped: true,
              digitalAssetId: existing.id,
            });
            return;
          }

          // Determine the best filePath and r2Key
          const filePath = img.r2Key
            ? (getR2PublicUrl(img.r2Key) || `/api/r2-image?key=${encodeURIComponent(img.r2Key)}/original`)
            : img.filePath;
          const r2Key = img.r2Key || null;
          const storageType = img.r2Key ? 'r2' : img.storageType || 'local';

          // Get companyId from the record relation
          const companyId = img.record?.companyId || token.companyId;

          // Create DigitalAsset
          const digitalAsset = await db.digitalAsset.create({
            data: {
              companyId,
              recordId: img.recordId,
              assetType: 'IMAGE',
              fileName: img.fileName,
              originalFileName: img.fileName,
              filePath,
              fileSize: img.fileSize,
              mimeType: img.mimeType,
              title: img.altText || img.fileName,
              altText: img.altText || null,
              status: 'APPROVED',
              category: 'synced-from-images',
              tags: jsonVal(['synced-from-imageasset']),
              uploadedById: token.userId,
              isPrimary: img.isPrimary,
              sortOrder: img.sortOrder,
              r2Key,
              storageType,
            },
          });

          results.push({
            imageAssetId: img.id,
            recordId: img.recordId,
            fileName: img.fileName,
            success: true,
            digitalAssetId: digitalAsset.id,
          });
        } catch (err) {
          results.push({
            imageAssetId: img.id,
            recordId: img.recordId,
            fileName: img.fileName,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );
  }

  const created = results.filter((r) => r.success && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    action: 'sync-to-dam',
    summary: {
      totalImageAssets: imageAssets.length,
      created,
      skipped,
      failed,
    },
    results,
  });
}
