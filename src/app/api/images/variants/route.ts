import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission, isSuperAdmin } from '@/lib/rbac';
import { generateVariants, VARIANT_CONFIGS } from '@/lib/image-variants';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * GET /api/images/variants?imageId=xxx
 * Returns all generated variants for an image (thumbnail/small/medium/large).
 * Used by the grid to display the variant list in the image manager popover
 * and to verify which variants exist for a given image.
 */
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
    const imageId = searchParams.get('imageId');
    if (!imageId) {
      return NextResponse.json(
        { error: 'imageId query parameter is required' },
        { status: 400 }
      );
    }

    const image = await db.imageAsset.findUnique({
      where: { id: imageId },
      include: { record: true },
    });
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Access control: Super Admin or same company
    if (
      !isSuperAdmin(tokenPayload.roles) &&
      image.record.companyId !== tokenPayload.companyId
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const variants = await db.imageVariant.findMany({
      where: { imageId },
      orderBy: { variant: 'asc' },
    });

    // Build a presence map so the client can quickly tell which variants
    // are missing (e.g. for the "Regenerate" button state).
    const present = new Set(variants.map((v) => v.variant));
    const config = VARIANT_CONFIGS.map((c) => ({
      ...c,
      exists: present.has(c.variant),
      filePath: variants.find((v) => v.variant === c.variant)?.filePath || null,
    }));

    return NextResponse.json({
      imageId,
      variants,
      config,
    });
  } catch (error) {
    console.error('Image variants GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/images/variants?imageId=xxx
 * Force-regenerate all variants for an image. Super Admin only (the
 * regeneration is expensive — sharp resize of the original buffer 4 times).
 *
 * Workflow:
 * 1. Fetch the ImageAsset (with record for access check).
 * 2. Load the original image buffer (from FileAsset DB or disk).
 * 3. Call generateVariants() which deletes existing variants + re-creates.
 */
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json(
        { error: 'Super Admin role required to regenerate image variants' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');
    if (!imageId) {
      return NextResponse.json(
        { error: 'imageId query parameter is required' },
        { status: 400 }
      );
    }

    const image = await db.imageAsset.findUnique({
      where: { id: imageId },
      include: { record: true },
    });
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Load the original image bytes
    const fileId = image.filePath.split('/').pop() || '';
    const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);
    let buffer: Buffer;

    if (isCuid) {
      const fileAsset = await db.fileAsset.findUnique({ where: { id: fileId } });
      if (!fileAsset) {
        return NextResponse.json(
          { error: 'Original file asset not found in database' },
          { status: 404 }
        );
      }
      buffer = Buffer.from(fileAsset.fileData);
    } else {
      // Legacy disk-based storage
      const diskPath = join(process.cwd(), 'public', image.filePath);
      try {
        buffer = await readFile(diskPath);
      } catch {
        return NextResponse.json(
          { error: 'Original file not found on disk' },
          { status: 404 }
        );
      }
    }

    const variants = await generateVariants(buffer, image.id, image.mimeType);

    return NextResponse.json({
      imageId: image.id,
      generated: variants.length,
      variants,
    });
  } catch (error) {
    console.error('Image variants POST (regen) error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
