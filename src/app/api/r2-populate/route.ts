// ============================================================================
// r2-populate/route.ts — Populate Digital Assets by downloading external URLs to R2
//
// This endpoint downloads all external image URLs from ImageAsset and DigitalAsset
// records, uploads them to Cloudflare R2 with variants, and updates the records
// with R2 keys.
//
// POST with action:
//   - "populate-all"     — Download ALL external images to R2 (both ImageAsset & DigitalAsset)
//   - "populate-dam"     — Download only DigitalAsset external images to R2
//   - "populate-images"  — Download only ImageAsset external images to R2
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import {
  ensureR2Config,
  isR2Configured,
  uploadWithVariants,
  uploadToR2,
  generateR2Key,
  getR2PublicUrl,
} from '@/lib/r2';

const BATCH_SIZE = 5; // Conservative to avoid timeout on serverless

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    // Load R2 config
    await ensureR2Config();
    if (!isR2Configured()) {
      return NextResponse.json({ error: 'R2 storage is not configured' }, { status: 503 });
    }

    const body = await request.json();
    const action = String(body.action || 'populate-all');
    const limit = Math.min(parseInt(String(body.limit || '50')), 50); // Max 50 per request

    const results: Array<{
      type: 'ImageAsset' | 'DigitalAsset';
      id: string;
      success: boolean;
      r2Key?: string;
      error?: string;
    }> = [];

    if (action === 'populate-all' || action === 'populate-dam') {
      // Process DigitalAssets with external URLs
      const digitalAssets = await db.digitalAsset.findMany({
        where: {
          filePath: { startsWith: 'http' },
          storageType: { not: 'r2' },
        },
        take: limit,
      });

      console.log(`[r2-populate] Found ${digitalAssets.length} DigitalAssets with external URLs`);

      for (let i = 0; i < digitalAssets.length; i += BATCH_SIZE) {
        const batch = digitalAssets.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async (asset) => {
            try {
              // Download from external URL
              const response = await fetch(asset.filePath, {
                headers: { 'User-Agent': 'MAA-BTOOL-MDM/1.0' },
                signal: AbortSignal.timeout(30000), // 30s timeout per image
              });

              if (!response.ok) {
                return {
                  type: 'DigitalAsset' as const,
                  id: asset.id,
                  success: false,
                  error: `Download failed: ${response.status}`,
                };
              }

              const arrayBuffer = await response.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const mimeType = response.headers.get('content-type') || asset.mimeType || 'image/jpeg';
              const isImage = mimeType.startsWith('image/');

              // Generate R2 key
              const r2Key = generateR2Key(
                'digital-assets',
                asset.recordId || 'unlinked',
                asset.fileName || `asset-${asset.id.slice(-6)}`
              );

              // Upload to R2
              if (isImage) {
                await uploadWithVariants(buffer, r2Key, mimeType, {
                  metadata: {
                    'original-name': (asset.originalFileName || asset.fileName).replace(/[^a-zA-Z0-9._-]/g, '_'),
                  },
                });
              } else {
                await uploadToR2(buffer, r2Key, mimeType, {
                  metadata: {
                    'original-name': (asset.originalFileName || asset.fileName).replace(/[^a-zA-Z0-9._-]/g, '_'),
                  },
                });
              }

              // Update the record
              const publicUrl = getR2PublicUrl(r2Key) || `/api/r2-image?key=${encodeURIComponent(r2Key)}/original`;
              await db.digitalAsset.update({
                where: { id: asset.id },
                data: {
                  r2Key,
                  storageType: 'r2',
                  filePath: publicUrl,
                },
              });

              return { type: 'DigitalAsset' as const, id: asset.id, success: true, r2Key };
            } catch (err) {
              return {
                type: 'DigitalAsset' as const,
                id: asset.id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          })
        );

        for (const r of batchResults) {
          if (r.status === 'fulfilled') results.push(r.value);
          else results.push({ type: 'DigitalAsset', id: '?', success: false, error: r.reason?.message || 'Unknown' });
        }
      }
    }

    if (action === 'populate-all' || action === 'populate-images') {
      // Process ImageAssets with external URLs
      const imageAssets = await db.imageAsset.findMany({
        where: {
          filePath: { startsWith: 'http' },
          storageType: { not: 'r2' },
        },
        take: limit,
      });

      console.log(`[r2-populate] Found ${imageAssets.length} ImageAssets with external URLs`);

      for (let i = 0; i < imageAssets.length; i += BATCH_SIZE) {
        const batch = imageAssets.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async (img) => {
            try {
              // Download from external URL
              const response = await fetch(img.filePath, {
                headers: { 'User-Agent': 'MAA-BTOOL-MDM/1.0' },
                signal: AbortSignal.timeout(30000),
              });

              if (!response.ok) {
                return {
                  type: 'ImageAsset' as const,
                  id: img.id,
                  success: false,
                  error: `Download failed: ${response.status}`,
                };
              }

              const arrayBuffer = await response.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const mimeType = img.mimeType || response.headers.get('content-type') || 'image/jpeg';

              // Generate R2 key
              const r2Key = generateR2Key('images', img.recordId, img.fileName);

              // Upload with variants
              await uploadWithVariants(buffer, r2Key, mimeType, {
                metadata: {
                  'original-name': img.fileName.replace(/[^a-zA-Z0-9._-]/g, '_'),
                },
              });

              // Update the record
              const publicUrl = getR2PublicUrl(r2Key) || `/api/r2-image?key=${encodeURIComponent(r2Key)}/original`;
              await db.imageAsset.update({
                where: { id: img.id },
                data: {
                  r2Key,
                  storageType: 'r2',
                  filePath: publicUrl,
                },
              });

              return { type: 'ImageAsset' as const, id: img.id, success: true, r2Key };
            } catch (err) {
              return {
                type: 'ImageAsset' as const,
                id: img.id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          })
        );

        for (const r of batchResults) {
          if (r.status === 'fulfilled') results.push(r.value);
          else results.push({ type: 'ImageAsset', id: '?', success: false, error: r.reason?.message || 'Unknown' });
        }
      }
    }

    const totalSuccess = results.filter((r) => r.success).length;
    const totalFailed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      action,
      summary: {
        total: results.length,
        synced: totalSuccess,
        failed: totalFailed,
      },
      results,
    });
  } catch (error) {
    console.error('R2 populate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
