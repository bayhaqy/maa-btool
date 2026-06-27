import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

// ============================================================================
// Image Deduplication API
// ============================================================================
// POST: Run image deduplication scan for a module
// GET:  Get deduplication results (groups of similar images)
// PUT:  Mark master image and mark duplicates for deletion
// ============================================================================

interface DupGroup {
  id: string;
  images: Array<{
    id: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    recordId: string;
    fieldName: string | null;
    isPrimary: boolean;
    variants?: Record<string, string>;
  }>;
  similarity: number; // 0-1, 1 = identical
  reason: string;
}

// In-memory dedup results cache (per-module, cleared on new scan)
const dedupCache = new Map<string, { groups: DupGroup[]; scannedAt: string }>();

// POST /api/images/dedup - Run deduplication scan
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:write')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const moduleId = String(body.moduleId || '');

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    }

    // Verify module exists
    const moduleRecord = await db.metaModule.findFirst({ where: { id: moduleId } });
    if (!moduleRecord) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // Get all records for this module
    const records = await db.dataRecord.findMany({
      where: { moduleId },
      select: { id: true },
    });
    const recordIds = records.map((r) => r.id);

    // Get all images for these records
    const allImages = await db.imageAsset.findMany({
      where: { recordId: { in: recordIds } },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });

    // Deduplication heuristics:
    // 1. Exact file-size match + same fileName → very likely duplicate
    // 2. Exact file-size match → possibly duplicate
    // 3. Same fileName (different sizes) → possibly different versions

    const groups: DupGroup[] = [];

    // Group 1: Exact matches (same fileName + same fileSize)
    const exactMap = new Map<string, typeof allImages>();
    for (const img of allImages) {
      const key = `${img.fileName.toLowerCase()}|${img.fileSize}`;
      if (!exactMap.has(key)) exactMap.set(key, []);
      exactMap.get(key)!.push(img);
    }

    for (const [key, imgs] of exactMap) {
      if (imgs.length < 2) continue;
      groups.push({
        id: `exact-${key.replace(/[^a-zA-Z0-9]/g, '_')}`,
        images: imgs.map((img) => ({
          id: img.id,
          fileName: img.fileName,
          filePath: img.filePath,
          fileSize: img.fileSize,
          mimeType: img.mimeType,
          recordId: img.recordId,
          fieldName: img.fieldName,
          isPrimary: img.isPrimary,
        })),
        similarity: 1.0,
        reason: `Exact match: same filename (${imgs[0].fileName}) and file size (${imgs[0].fileSize} bytes)`,
      });
    }

    // Group 2: Same fileName but different file sizes
    const nameMap = new Map<string, typeof allImages>();
    for (const img of allImages) {
      const key = img.fileName.toLowerCase();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(img);
    }

    for (const [key, imgs] of nameMap) {
      if (imgs.length < 2) continue;
      // Skip if already captured as exact match
      const exactKey = `${key}|${imgs[0].fileSize}`;
      const alreadyGrouped = groups.some(
        (g) => g.id === `exact-${exactKey.replace(/[^a-zA-Z0-9]/g, '_')}`
      );
      if (alreadyGrouped) continue;
      // Check if all have the same size (already grouped above) or different sizes
      const sizes = new Set(imgs.map((i) => i.fileSize));
      if (sizes.size > 1) {
        groups.push({
          id: `name-${key.replace(/[^a-zA-Z0-9]/g, '_')}`,
          images: imgs.map((img) => ({
            id: img.id,
            fileName: img.fileName,
            filePath: img.filePath,
            fileSize: img.fileSize,
            mimeType: img.mimeType,
            recordId: img.recordId,
            fieldName: img.fieldName,
            isPrimary: img.isPrimary,
          })),
          similarity: 0.7,
          reason: `Same filename (${imgs[0].fileName}) but different file sizes — may be different versions`,
        });
      }
    }

    // Group 3: Same fileSize but different fileName → possibly resized/cropped duplicates
    const sizeMap = new Map<number, typeof allImages>();
    for (const img of allImages) {
      if (img.fileSize === 0) continue; // skip zero-byte files
      if (!sizeMap.has(img.fileSize)) sizeMap.set(img.fileSize, []);
      sizeMap.get(img.fileSize)!.push(img);
    }

    for (const [size, imgs] of sizeMap) {
      if (imgs.length < 2) continue;
      // Skip if already captured as exact match
      const hasExact = groups.some((g) =>
        g.reason.includes(String(size)) && g.similarity === 1.0
      );
      if (hasExact) continue;
      // Only group if size > 0 and not already grouped by exact match
      const alreadyGroupedIds = new Set(groups.flatMap((g) => g.images.map((i) => i.id)));
      const ungrouped = imgs.filter((i) => !alreadyGroupedIds.has(i.id));
      if (ungrouped.length < 2) continue;
      groups.push({
        id: `size-${size}`,
        images: ungrouped.map((img) => ({
          id: img.id,
          fileName: img.fileName,
          filePath: img.filePath,
          fileSize: img.fileSize,
          mimeType: img.mimeType,
          recordId: img.recordId,
          fieldName: img.fieldName,
          isPrimary: img.isPrimary,
        })),
        similarity: 0.5,
        reason: `Same file size (${size} bytes) but different filenames — possibly resized/cropped duplicates`,
      });
    }

    // Cache results
    dedupCache.set(moduleId, {
      groups,
      scannedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      groups,
      scannedAt: new Date().toISOString(),
      totalImages: allImages.length,
      duplicateGroups: groups.length,
      potentialDuplicates: groups.reduce((sum, g) => sum + g.images.length - 1, 0),
    });
  } catch (error) {
    console.error('Image dedup POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/images/dedup?moduleId=xxx - Get deduplication results
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId query parameter is required' }, { status: 400 });
    }

    const cached = dedupCache.get(moduleId);
    if (!cached) {
      return NextResponse.json({
        groups: [],
        scannedAt: null,
        totalImages: 0,
        duplicateGroups: 0,
        potentialDuplicates: 0,
        message: 'No scan results found. Run a POST scan first.',
      });
    }

    return NextResponse.json({
      groups: cached.groups,
      scannedAt: cached.scannedAt,
      totalImages: cached.groups.reduce((sum, g) => sum + g.images.length, 0),
      duplicateGroups: cached.groups.length,
      potentialDuplicates: cached.groups.reduce((sum, g) => sum + g.images.length - 1, 0),
    });
  } catch (error) {
    console.error('Image dedup GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/images/dedup - Mark master image and mark duplicates for deletion
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:write')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const masterImageId = String(body.masterImageId || '');
    const duplicateImageIds: string[] = body.duplicateImageIds || [];

    if (!masterImageId) {
      return NextResponse.json({ error: 'masterImageId is required' }, { status: 400 });
    }
    if (!Array.isArray(duplicateImageIds) || duplicateImageIds.length === 0) {
      return NextResponse.json({ error: 'duplicateImageIds array is required' }, { status: 400 });
    }

    // Verify master image exists
    const master = await db.imageAsset.findUnique({
      where: { id: masterImageId },
      include: { record: true },
    });
    if (!master) {
      return NextResponse.json({ error: 'Master image not found' }, { status: 404 });
    }

    // Access control
    const isSA = tokenPayload.roles.includes('Super Admin');
    if (!isSA && master.record.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Ensure master is marked as primary
    if (!master.isPrimary) {
      await db.$transaction([
        db.imageAsset.updateMany({
          where: {
            recordId: master.recordId,
            ...(master.fieldName ? { fieldName: master.fieldName } : {}),
          },
          data: { isPrimary: false },
        }),
        db.imageAsset.update({
          where: { id: masterImageId },
          data: { isPrimary: true },
        }),
      ]);
    }

    // Delete duplicates
    let deletedCount = 0;
    const errors: string[] = [];

    for (const dupId of duplicateImageIds) {
      try {
        const dup = await db.imageAsset.findUnique({
          where: { id: dupId },
          include: { record: true },
        });
        if (!dup) {
          errors.push(`Duplicate ${dupId}: not found`);
          continue;
        }
        // Access check
        if (!isSA && dup.record.companyId !== tokenPayload.companyId) {
          errors.push(`Duplicate ${dupId}: access denied`);
          continue;
        }

        // Clean up file assets
        const fileId = dup.filePath.split('/').pop() || '';
        const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);
        if (isCuid) {
          try { await db.fileAsset.delete({ where: { id: fileId } }); } catch { /* ok */ }
        }

        // Clean up variant FileAssets
        try {
          const variants = await db.imageVariant.findMany({
            where: { imageId: dupId },
            select: { filePath: true },
          });
          const variantFileIds = variants
            .map((v) => v.filePath.split('/').pop() || '')
            .filter((id) => /^c[a-z0-9]{20,}$/i.test(id));
          if (variantFileIds.length > 0) {
            await db.fileAsset.deleteMany({ where: { id: { in: variantFileIds } } });
          }
        } catch { /* best-effort */ }

        // Delete the image asset (cascades ImageVariant)
        await db.imageAsset.delete({ where: { id: dupId } });
        deletedCount++;
      } catch (err) {
        errors.push(
          `Duplicate ${dupId}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    // Invalidate dedup cache for the module
    const moduleId = master.record.moduleId;
    dedupCache.delete(moduleId);

    return NextResponse.json({
      masterImageId,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Image dedup PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
