import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { generateVariants, getVariantMap } from '@/lib/image-variants';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

function isReadOnlyFs(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.READONLY_FS === 'true';
}

// GET /api/images/[id] - Get single image with variants
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'data:read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const image = await db.imageAsset.findUnique({ where: { id } });
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const variants = await getVariantMap(image.id);
    return NextResponse.json({ image: { ...image, variants } });
  } catch (error) {
    console.error('Image GET [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/images/[id] - Delete an image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:delete')) {
      return NextResponse.json({ error: 'Insufficient permissions to delete images' }, { status: 403 });
    }

    const { id } = await params;

    const image = await db.imageAsset.findUnique({
      where: { id },
      include: { record: true },
    });

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Access control
    const isSA = tokenPayload.roles.includes('Super Admin');
    if (!isSA && image.record.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Clean up file asset (database-stored file)
    const fileId = image.filePath.split('/').pop() || '';
    const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);
    if (isCuid) {
      try { await db.fileAsset.delete({ where: { id: fileId } }); } catch { /* ok */ }
    } else {
      try { await unlink(join(process.cwd(), 'public', image.filePath)); } catch { /* ok */ }
    }

    // Clean up variant FileAssets
    try {
      const variants = await db.imageVariant.findMany({
        where: { imageId: id },
        select: { filePath: true },
      });
      const variantFileIds = variants
        .map((v) => v.filePath.split('/').pop() || '')
        .filter((vid) => /^c[a-z0-9]{20,}$/i.test(vid));
      if (variantFileIds.length > 0) {
        await db.fileAsset.deleteMany({ where: { id: { in: variantFileIds } } });
      }
    } catch { /* best-effort */ }

    // Delete the image asset (cascade-deletes variants)
    await db.imageAsset.delete({ where: { id } });

    return NextResponse.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Image DELETE [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/images/[id] - Update image (rotate, set primary, update alt text, replace file)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const image = await db.imageAsset.findUnique({
      where: { id },
      include: { record: true },
    });

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Access control
    const isSA = tokenPayload.roles.includes('Super Admin');
    if (!isSA && image.record.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case 'rotate': {
        // Rotate image by specified degrees (90, 180, 270)
        const degrees = Number(body.degrees) || 90;
        if (![90, 180, 270, -90, -180, -270].includes(degrees)) {
          return NextResponse.json({ error: 'Invalid rotation degrees. Use 90, 180, 270, -90, -180, or -270' }, { status: 400 });
        }

        // Get the original image data
        const fileId = image.filePath.split('/').pop() || '';
        const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);

        let imageBuffer: Buffer;
        if (isCuid) {
          const fileAsset = await db.fileAsset.findUnique({ where: { id: fileId } });
          if (!fileAsset) {
            return NextResponse.json({ error: 'Original file data not found' }, { status: 404 });
          }
          imageBuffer = Buffer.from(fileAsset.fileData);
        } else {
          // Read from disk
          const fs = await import('fs/promises');
          const fullPath = join(process.cwd(), 'public', image.filePath);
          imageBuffer = await fs.readFile(fullPath);
        }

        // Rotate using sharp
        const sharp = (await import('sharp')).default;
        const rotatedBuffer = await sharp(imageBuffer, { failOnError: false })
          .rotate(degrees)
          .toBuffer();

        // Store the rotated image
        if (isReadOnlyFs() || isCuid) {
          // Update the FileAsset in database
          await db.fileAsset.update({
            where: { id: fileId },
            data: { fileData: Uint8Array.from(rotatedBuffer) },
          });
        } else {
          // Write to disk
          await writeFile(join(process.cwd(), 'public', image.filePath), rotatedBuffer);
          // Also update the FileAsset if exists
          try {
            await db.fileAsset.update({
              where: { id: fileId },
              data: { fileData: Uint8Array.from(rotatedBuffer) },
            });
          } catch { /* best-effort */ }
        }

        // Regenerate variants for the rotated image
        try {
          await generateVariants(rotatedBuffer, image.id, image.mimeType);
        } catch (e) {
          console.error('[images PATCH rotate] Variant regeneration failed:', e);
        }

        // Update width/height if stored
        const metadata = await sharp(rotatedBuffer, { failOnError: false }).metadata();
        const updatedImage = await db.imageAsset.update({
          where: { id },
          data: {
            ...(metadata.width && metadata.height ? { 
              // Note: we don't store width/height on ImageAsset currently,
              // but we could in the future. For now, just return the updated image.
            } : {}),
          },
        });

        const variants = await getVariantMap(image.id);
        return NextResponse.json({ image: { ...updatedImage, variants } });
      }

      case 'setPrimary': {
        // Set this image as primary for its record/field
        const fieldName = body.fieldName || image.fieldName;
        await db.$transaction([
          db.imageAsset.updateMany({
            where: { recordId: image.recordId, ...(fieldName ? { fieldName } : {}) },
            data: { isPrimary: false },
          }),
          db.imageAsset.update({
            where: { id },
            data: { isPrimary: true },
          }),
        ]);

        const updated = await db.imageAsset.findUnique({ where: { id } });
        const variants = await getVariantMap(image.id);
        return NextResponse.json({ image: { ...updated, variants } });
      }

      case 'updateAltText': {
        const altText = body.altText as string | null;
        const updated = await db.imageAsset.update({
          where: { id },
          data: { altText: altText || null },
        });
        const variants = await getVariantMap(image.id);
        return NextResponse.json({ image: { ...updated, variants } });
      }

      case 'reorder': {
        const sortOrder = Number(body.sortOrder);
        if (isNaN(sortOrder)) {
          return NextResponse.json({ error: 'sortOrder must be a number' }, { status: 400 });
        }
        const updated = await db.imageAsset.update({
          where: { id },
          data: { sortOrder },
        });
        const variants = await getVariantMap(image.id);
        return NextResponse.json({ image: { ...updated, variants } });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}. Supported: rotate, setPrimary, updateAltText, reorder` }, { status: 400 });
    }
  } catch (error) {
    console.error('Image PATCH [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/images/[id] - Replace image file
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:upload')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const image = await db.imageAsset.findUnique({
      where: { id },
      include: { record: true },
    });

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Access control
    const isSA = tokenPayload.roles.includes('Super Admin');
    if (!isSA && image.record.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Validate file type
    const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'avif', 'svg'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImageType = file.type.startsWith('image/') || SUPPORTED_EXTENSIONS.includes(ext);
    if (!isImageType) {
      return NextResponse.json({ error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}` }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 20MB limit' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine MIME type
    let mimeType = file.type || 'image/png';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const mimeMap: Record<string, string> = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
        'heic': 'image/heic', 'heif': 'image/heif',
        'avif': 'image/avif', 'svg': 'image/svg+xml',
        'bmp': 'image/bmp', 'tiff': 'image/tiff', 'tif': 'image/tiff',
      };
      mimeType = mimeMap[ext] || 'image/png';
    }

    // Update the stored file
    const fileId = image.filePath.split('/').pop() || '';
    const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);

    if (isCuid) {
      await db.fileAsset.update({
        where: { id: fileId },
        data: { fileData: Uint8Array.from(buffer), mimeType, fileSize: file.size },
      });
    } else {
      if (!isReadOnlyFs()) {
        await writeFile(join(process.cwd(), 'public', image.filePath), buffer);
      }
      // Also try to update FileAsset if exists
      try {
        await db.fileAsset.update({
          where: { id: fileId },
          data: { fileData: Uint8Array.from(buffer), mimeType, fileSize: file.size },
        });
      } catch { /* best-effort */ }
    }

    // Update ImageAsset metadata
    const updated = await db.imageAsset.update({
      where: { id },
      data: {
        fileName: file.name,
        fileSize: file.size,
        mimeType,
      },
    });

    // Regenerate variants
    try {
      await generateVariants(buffer, image.id, mimeType);
    } catch (e) {
      console.error('[images PUT replace] Variant regeneration failed:', e);
    }

    const variants = await getVariantMap(image.id);
    return NextResponse.json({ image: { ...updated, variants } });
  } catch (error) {
    console.error('Image PUT [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
