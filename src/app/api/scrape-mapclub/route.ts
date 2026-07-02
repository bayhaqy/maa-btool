// ============================================================================
// scrape-mapclub/route.ts — Scrape MapClub product images and upload to R2/DAM
//
// This endpoint:
//   1. Finds DataRecords with mapclub URLs in their payload (source_url, image_url, etc.)
//   2. Downloads the product images from the mapclub URLs
//   3. Uploads them to Cloudflare R2 with variants (thumbnail, small, medium, large)
//   4. Creates ImageAsset records linked to the DataRecord
//   5. Optionally creates DigitalAsset records in the DAM
//
// POST /api/scrape-mapclub
//   Body: {
//     moduleCode?: string,        // Only scrape records from this module (default: ARTICLE_MASTER)
//     limit?: number,             // Max records to process (default: 20, max: 50)
//     createDamAssets?: boolean,  // Also create DigitalAsset records (default: true)
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { jsonParse } from '@/lib/db-json';
import {
  ensureR2Config,
  isR2Configured,
  uploadWithVariants,
  generateR2Key,
  getR2PublicUrl,
} from '@/lib/r2';

export const maxDuration = 60;

// Extract image URLs from a record's payload
function extractImageUrls(payload: Record<string, unknown>): string[] {
  const urls: string[] = [];

  // Check common field names for image URLs
  const imageFields = ['imageUrl', 'image_url', 'source_url', 'sourceUrl', 'image', 'images', 'productImage', 'thumbnail', 'photo'];
  for (const field of imageFields) {
    const val = payload[field];
    if (typeof val === 'string' && val.startsWith('http')) {
      urls.push(val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === 'string' && item.startsWith('http')) {
          urls.push(item);
        } else if (typeof item === 'object' && item !== null && 'url' in (item as Record<string, unknown>)) {
          const url = (item as Record<string, unknown>).url;
          if (typeof url === 'string' && url.startsWith('http')) urls.push(url);
        }
      }
    }
  }

  // Also check for any field value that looks like a mapclub image URL
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === 'string' && val.includes('mapclub.com') && (val.includes('.jpg') || val.includes('.png') || val.includes('.webp') || val.includes('/image'))) {
      if (!urls.includes(val)) urls.push(val);
    }
  }

  return [...new Set(urls)]; // Deduplicate
}

export async function POST(request: NextRequest) {
  try {
    // Auth check — Super Admin only
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    // Load R2 config
    await ensureR2Config();
    if (!isR2Configured()) {
      return NextResponse.json({ error: 'R2 storage is not configured. Configure R2 in System Health → R2 Settings.' }, { status: 503 });
    }

    const body = await request.json();
    const moduleCode = body.moduleCode || 'ARTICLE_MASTER';
    const limit = Math.min(parseInt(String(body.limit || '20')), 50);
    const createDamAssets = body.createDamAssets !== false;

    // Find the module
    const mod = await db.metaModule.findFirst({ where: { moduleCode } });
    if (!mod) {
      return NextResponse.json({ error: `Module "${moduleCode}" not found` }, { status: 404 });
    }

    // Find records with image URLs in their payload
    const records = await db.dataRecord.findMany({
      where: {
        moduleId: mod.id,
        companyId: tokenPayload.companyId,
        status: 'ACTIVE',
      },
      include: {
        images: { select: { id: true, fileName: true } },
      },
      take: limit * 3, // Get more since not all will have image URLs
      orderBy: { updatedAt: 'desc' },
    });

    const results: Array<{
      recordId: string;
      recordCode: string;
      imageUrls: string[];
      scraped: number;
      skipped: number;
      errors: string[];
    }> = [];

    let totalScraped = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let processedRecords = 0;

    for (const record of records) {
      if (processedRecords >= limit) break;

      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      const imageUrls = extractImageUrls(payload);

      if (imageUrls.length === 0) continue; // Skip records without image URLs

      processedRecords++;
      const recordResult = {
        recordId: record.id,
        recordCode: record.recordCode || record.id,
        imageUrls,
        scraped: 0,
        skipped: 0,
        errors: [] as string[],
      };

      for (const imageUrl of imageUrls) {
        try {
          // Check if this image is already in ImageAsset for this record
          const urlParts = imageUrl.split('/').pop() || '';
          const existingImage = record.images.find(img => {
            return img.fileName.includes(urlParts.split('?')[0].slice(0, 20));
          });

          if (existingImage) {
            recordResult.skipped++;
            totalSkipped++;
            continue;
          }

          // Download the image
          const response = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
              'Referer': 'https://www.mapclub.com/',
            },
            signal: AbortSignal.timeout(30000),
            redirect: 'follow',
          });

          if (!response.ok) {
            recordResult.errors.push(`Download failed: ${response.status} for ${imageUrl.slice(0, 80)}`);
            totalErrors++;
            continue;
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Skip if too small (likely a placeholder or error response)
          if (buffer.length < 500) {
            recordResult.errors.push(`Image too small (${buffer.length} bytes), likely placeholder`);
            totalErrors++;
            continue;
          }

          // Determine MIME type
          const contentType = response.headers.get('content-type') || '';
          let mimeType = 'image/jpeg';
          if (contentType.includes('png')) mimeType = 'image/png';
          else if (contentType.includes('webp')) mimeType = 'image/webp';
          else if (contentType.includes('gif')) mimeType = 'image/gif';
          else if (contentType.includes('svg')) mimeType = 'image/svg+xml';
          else if (contentType.includes('avif')) mimeType = 'image/avif';

          // Generate file name from URL
          let safeFileName = 'image.jpg';
          try {
            const urlPath = new URL(imageUrl).pathname;
            const urlFileName = urlPath.split('/').pop() || 'image.jpg';
            safeFileName = urlFileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
          } catch {
            // Use default filename
          }

          // Upload to R2 with variants
          const r2Key = generateR2Key('images', record.id, safeFileName);
          await uploadWithVariants(buffer, r2Key, mimeType, {
            metadata: {
              'original-name': safeFileName,
              'source-url': imageUrl.slice(0, 200),
              'scraped-by': 'mapclub-scraper',
            },
          });

          const filePath = getR2PublicUrl(r2Key) || `/api/r2-image?key=${encodeURIComponent(r2Key)}/original`;

          // Count existing images for sort order
          const existingCount = await db.imageAsset.count({ where: { recordId: record.id } });

          // Create ImageAsset
          const fieldName = payload.imageUrl === imageUrl ? 'imageUrl' :
                           payload.image_url === imageUrl ? 'image_url' :
                           payload.source_url === imageUrl ? 'source_url' : null;

          await db.imageAsset.create({
            data: {
              recordId: record.id,
              fieldName,
              fileName: safeFileName,
              filePath,
              fileSize: buffer.length,
              mimeType,
              altText: `${record.recordCode || 'Product'} image`,
              sortOrder: existingCount,
              isPrimary: existingCount === 0,
              r2Key,
              storageType: 'r2',
            },
          });

          // Optionally create DigitalAsset in DAM
          if (createDamAssets) {
            try {
              await db.digitalAsset.create({
                data: {
                  fileName: safeFileName,
                  originalFileName: safeFileName,
                  filePath,
                  fileSize: buffer.length,
                  mimeType,
                  altText: `${record.recordCode || 'Product'} image`,
                  assetType: 'IMAGE',
                  r2Key,
                  storageType: 'r2',
                  recordId: record.id,
                  companyId: record.companyId,
                  metadata: {
                    source: 'mapclub-scraper',
                    sourceUrl: imageUrl,
                    recordCode: record.recordCode,
                    moduleCode,
                  } as unknown as string,
                },
              });
            } catch {
              // DigitalAsset creation is optional, don't fail
            }
          }

          recordResult.scraped++;
          totalScraped++;
        } catch (err) {
          recordResult.errors.push(`${err instanceof Error ? err.message : String(err)} for ${imageUrl.slice(0, 50)}`);
          totalErrors++;
        }
      }

      results.push(recordResult);
    }

    return NextResponse.json({
      moduleCode,
      summary: {
        recordsProcessed: processedRecords,
        imagesScraped: totalScraped,
        imagesSkipped: totalSkipped,
        errors: totalErrors,
      },
      results,
    });
  } catch (error) {
    console.error('Mapclub scrape error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
