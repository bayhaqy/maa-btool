import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { generateVariants, getVariantMap } from '@/lib/image-variants';
import { isR2Configured, uploadWithVariants, deleteWithVariants, generateR2Key, getR2PublicUrl } from '@/lib/r2';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

// Supported image types
const SUPPORTED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'image/heic', 'image/heif', 'image/avif', 'image/svg+xml',
];

// Also support these extensions for when browser doesn't detect MIME type
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'avif', 'svg'];

function isImageFile(file: File): boolean {
  // Check MIME type
  if (file.type && SUPPORTED_TYPES.includes(file.type)) return true;
  // Check extension as fallback
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTENSIONS.includes(ext);
}

// Check if we're running on a read-only filesystem (Vercel production)
function isReadOnlyFs(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.READONLY_FS === 'true';
}

// POST /api/images - Upload image
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:upload')) {
      return NextResponse.json({ error: 'Insufficient permissions to upload images' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const recordId = formData.get('recordId') as string | null;
    const fieldName = formData.get('fieldName') as string | null;
    const altText = formData.get('altText') as string | null;
    const isPrimary = formData.get('isPrimary') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!recordId) {
      return NextResponse.json({ error: 'recordId is required' }, { status: 400 });
    }

    // Validate file type (support HEIC, JPG, PNG, GIF, etc.)
    if (!isImageFile(file)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return NextResponse.json({ 
        error: `Unsupported file type. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}. Got: ${ext || file.type || 'unknown'}` 
      }, { status: 400 });
    }

    // File size limit: 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: `File "${file.name}" exceeds 20MB limit` }, { status: 400 });
    }

    // Verify record exists and user has access
    const record = await db.dataRecord.findUnique({ where: { id: recordId } });
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Read file bytes
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine MIME type (fallback for HEIC which may not have proper MIME)
    const ext = file.name.split('.').pop() || 'png';
    let mimeType = file.type || 'image/png';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const extLower = ext.toLowerCase();
      const mimeMap: Record<string, string> = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
        'heic': 'image/heic', 'heif': 'image/heif',
        'avif': 'image/avif', 'svg': 'image/svg+xml',
        'bmp': 'image/bmp', 'tiff': 'image/tiff', 'tif': 'image/tiff',
      };
      mimeType = mimeMap[extLower] || 'image/png';
    }

    let filePath: string;
    let r2Key: string | null = null;
    let storageType = 'local';

    if (isR2Configured()) {
      // R2 storage (preferred) — upload original + variants to Cloudflare R2
      const key = generateR2Key('images', recordId, file.name);
      await uploadWithVariants(buffer, key, mimeType, {
        metadata: { 'original-name': file.name, 'uploaded-by': 'mdm-system' },
      });
      filePath = getR2PublicUrl(key) || `/api/r2-image?key=${encodeURIComponent(key)}/original`;
      r2Key = key;
      storageType = 'r2';
    } else if (isReadOnlyFs()) {
      // Vercel/production (legacy): Store in database (FileAsset)
      const fileAsset = await db.fileAsset.create({
        data: {
          fileName: file.name,
          fileData: buffer,
          mimeType,
          fileSize: file.size,
          category: 'image',
        },
      });
      filePath = `/api/uploads/${fileAsset.id}`;
    } else {
      // Local dev: Store on disk (with database backup too for reliability)
      if (!existsSync(UPLOAD_DIR)) {
        const { mkdir } = await import('fs/promises');
        await mkdir(UPLOAD_DIR, { recursive: true });
      }
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${randomSuffix}_${safeName}`;
      await writeFile(join(UPLOAD_DIR, fileName), buffer);
      filePath = `/api/uploads/${fileName}`;

      // Also store in database for consistency
      await db.fileAsset.create({
        data: {
          fileName: file.name,
          fileData: buffer,
          mimeType,
          fileSize: file.size,
          category: 'image',
        },
      });
    }

    // Count existing images for sort order
    const existingCount = await db.imageAsset.count({ where: { recordId } });

    // Create ImageAsset record
    const imageAsset = await db.imageAsset.create({
      data: {
        recordId,
        fieldName: fieldName || null,
        fileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType,
        altText: altText || null,
        sortOrder: existingCount,
        isPrimary: isPrimary || existingCount === 0,
        r2Key,
        storageType,
      },
    });

    // Generate thumbnail/small/medium/large variants.
    // When R2 is used, variants are already uploaded by uploadWithVariants,
    // so we skip the local variant generation.
    // For non-R2 storage, run synchronously (NOT setTimeout) so it works on
    // Vercel serverless — the request stays open ~100-500ms longer. Wrapped
    // in try/catch so variant failure never blocks the upload response.
    if (storageType !== 'r2') {
      try {
        await generateVariants(buffer, imageAsset.id, mimeType);
      } catch (e) {
        console.error('[images POST] Variant generation failed (non-blocking):', e);
      }
    }

    return NextResponse.json({ imageAsset }, { status: 201 });
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json({ error: 'Internal server error during image upload' }, { status: 500 });
  }
}

// GET /api/images?recordId=xxx - List images for a record
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
    const recordId = searchParams.get('recordId');
    const imageId = searchParams.get('imageId');

    // Get single image — include variants map so the client can pick the
    // best-sized variant (thumbnail for grid cells, large for lightbox).
    if (imageId) {
      const image = await db.imageAsset.findUnique({ where: { id: imageId } });
      if (!image) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }
      const variants = await getVariantMap(image.id);
      return NextResponse.json({ image: { ...image, variants } });
    }

    // List images for a record
    if (!recordId) {
      return NextResponse.json({ error: 'recordId or imageId query parameter is required' }, { status: 400 });
    }

    const images = await db.imageAsset.findMany({
      where: { recordId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });

    // Attach a `variants` map (variant → filePath) to each image so the
    // grid can use the thumbnail variant for the 26x26 cell thumbnail
    // instead of downloading the full-resolution original.
    const imagesWithVariants = await Promise.all(
      images.map(async (img) => ({
        ...img,
        variants: await getVariantMap(img.id),
      }))
    );

    return NextResponse.json({ images: imagesWithVariants });
  } catch (error) {
    console.error('Image GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/images?imageId=xxx - Delete image
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:delete')) {
      return NextResponse.json({ error: 'Insufficient permissions to delete images' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json({ error: 'imageId query parameter is required' }, { status: 400 });
    }

    const image = await db.imageAsset.findUnique({
      where: { id: imageId },
      include: { record: true },
    });

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Check access
    const isSA = tokenPayload.roles.includes('Super Admin');
    if (!isSA && image.record.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Clean up stored file based on storage type
    if (image.storageType === 'r2' && image.r2Key) {
      // R2 storage: delete original + all variants from Cloudflare R2
      try {
        await deleteWithVariants(image.r2Key);
      } catch {
        // R2 delete may fail (e.g., already deleted), that's OK
      }
    } else {
      // Legacy storage: FileAsset (database) or disk
      const fileId = image.filePath.split('/').pop() || '';
      const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);
      if (isCuid) {
        try {
          await db.fileAsset.delete({ where: { id: fileId } });
        } catch {
          // FileAsset may already be deleted, that's OK
        }
      } else {
        // Legacy: delete file from disk
        const fullPath = join(process.cwd(), 'public', image.filePath);
        try {
          await unlink(fullPath);
        } catch {
          // File may already be deleted, that's OK
        }
      }
    }

    // Clean up variant FileAssets before the ImageVariant rows are
    // cascade-deleted with the ImageAsset below. We fetch the variant
    // filePaths first, delete the FileAsset rows, then delete the image
    // (which cascades the ImageVariant rows).
    // Skip this for R2-stored images since variants are in R2, not FileAsset.
    if (image.storageType !== 'r2') {
      try {
        const variants = await db.imageVariant.findMany({
          where: { imageId },
          select: { filePath: true },
        });
        const variantFileIds = variants
          .map((v) => v.filePath.split('/').pop() || '')
          .filter((id) => /^c[a-z0-9]{20,}$/i.test(id));
        if (variantFileIds.length > 0) {
          await db.fileAsset.deleteMany({
            where: { id: { in: variantFileIds } },
          });
        }
      } catch {
        // Best-effort cleanup — don't block the delete
      }
    }

    // Delete database record (ImageVariant rows cascade-delete)
    await db.imageAsset.delete({ where: { id: imageId } });

    return NextResponse.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Image DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/images - Batch image operations (deferred save pattern)
// Body: { operations: Array<{ type: 'upload'|'delete'|'setPrimary'|'reorder', ...params }> }
// This endpoint allows the grid to flush all pending image operations in a
// single request when the user clicks "Save Changes" (STIBO deferred-save pattern).
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const operations: Array<Record<string, unknown>> = body.operations || [];

    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json({ error: 'operations array is required' }, { status: 400 });
    }

    const results: Array<{ type: string; success: boolean; data?: unknown; error?: string }> = [];

    for (const op of operations) {
      const type = String(op.type || '');

      try {
        switch (type) {
          case 'delete': {
            const imageId = String(op.imageId || '');
            if (!imageId) {
              results.push({ type, success: false, error: 'imageId required' });
              break;
            }
            const image = await db.imageAsset.findUnique({
              where: { id: imageId },
              include: { record: true },
            });
            if (!image) {
              results.push({ type, success: false, error: 'Image not found' });
              break;
            }
            // Access control
            const isSA = tokenPayload.roles.includes('Super Admin');
            if (!isSA && image.record.companyId !== tokenPayload.companyId) {
              results.push({ type, success: false, error: 'Access denied' });
              break;
            }
            // Clean up stored file based on storage type
            if (image.storageType === 'r2' && image.r2Key) {
              // R2 storage: delete original + all variants from Cloudflare R2
              try { await deleteWithVariants(image.r2Key); } catch { /* ok */ }
            } else {
              // Legacy storage: FileAsset (database) or disk
              const fileId = image.filePath.split('/').pop() || '';
              const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);
              if (isCuid) {
                try { await db.fileAsset.delete({ where: { id: fileId } }); } catch { /* ok */ }
              } else {
                try { await unlink(join(process.cwd(), 'public', image.filePath)); } catch { /* ok */ }
              }
            }
            // Clean up variant FileAssets (skip for R2-stored images)
            if (image.storageType !== 'r2') {
              try {
                const variants = await db.imageVariant.findMany({
                  where: { imageId },
                  select: { filePath: true },
                });
                const variantFileIds = variants
                  .map((v) => v.filePath.split('/').pop() || '')
                  .filter((id) => /^c[a-z0-9]{20,}$/i.test(id));
                if (variantFileIds.length > 0) {
                  await db.fileAsset.deleteMany({ where: { id: { in: variantFileIds } } });
                }
              } catch { /* best-effort */ }
            }
            await db.imageAsset.delete({ where: { id: imageId } });
            results.push({ type, success: true });
            break;
          }

          case 'setPrimary': {
            const imageId = String(op.imageId || '');
            if (!imageId) {
              results.push({ type, success: false, error: 'imageId required' });
              break;
            }
            const image = await db.imageAsset.findUnique({
              where: { id: imageId },
              include: { record: true },
            });
            if (!image) {
              results.push({ type, success: false, error: 'Image not found' });
              break;
            }
            const isSA = tokenPayload.roles.includes('Super Admin');
            if (!isSA && image.record.companyId !== tokenPayload.companyId) {
              results.push({ type, success: false, error: 'Access denied' });
              break;
            }
            let fieldName: string | null = image.fieldName;
            if (typeof op.fieldName === 'string') fieldName = op.fieldName;
            await db.$transaction([
              db.imageAsset.updateMany({
                where: { recordId: image.recordId, ...(fieldName ? { fieldName } : {}) },
                data: { isPrimary: false },
              }),
              db.imageAsset.update({
                where: { id: imageId },
                data: { isPrimary: true },
              }),
            ]);
            results.push({ type, success: true });
            break;
          }

          case 'reorder': {
            const recordId = String(op.recordId || '');
            const fieldName = op.fieldName as string | null | undefined;
            const order = op.order as Array<{ imageId: string; sortOrder: number }> | undefined;
            if (!recordId || !order || !Array.isArray(order)) {
              results.push({ type, success: false, error: 'recordId and order[] required' });
              break;
            }
            const record = await db.dataRecord.findUnique({ where: { id: recordId } });
            if (!record) {
              results.push({ type, success: false, error: 'Record not found' });
              break;
            }
            for (const item of order) {
              await db.imageAsset.update({
                where: { id: item.imageId },
                data: { sortOrder: item.sortOrder },
              });
            }
            results.push({ type, success: true });
            break;
          }

          case 'updateAltText': {
            const imageId = String(op.imageId || '');
            const altText = op.altText as string | null | undefined;
            if (!imageId) {
              results.push({ type, success: false, error: 'imageId required' });
              break;
            }
            await db.imageAsset.update({
              where: { id: imageId },
              data: { altText: altText || null },
            });
            results.push({ type, success: true });
            break;
          }

          default:
            results.push({ type, success: false, error: `Unknown operation type: ${type}` });
        }
      } catch (err) {
        results.push({
          type,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      results,
      summary: { total: results.length, success: successCount, failed: failCount },
    });
  } catch (error) {
    console.error('Image batch PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/images?imageId=xxx - Mark an image as primary for its record
// Body: {} (no payload needed; the imageId is enough)
// Sets isPrimary=true for the target image and false for all other images
// of the same record (optionally scoped to the same fieldName if provided
// in the body).
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:manage')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update images' },
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

    // Access control: Super Admin or same company.
    const isSA = tokenPayload.roles.includes('Super Admin');
    if (!isSA && image.record.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Optional fieldName scoping from body (defaults to image's stored fieldName)
    let fieldName: string | null = image.fieldName;
    try {
      const body = await request.json();
      if (typeof body?.fieldName === 'string') fieldName = body.fieldName;
    } catch {
      // No body or invalid JSON — that's fine, we use the stored fieldName
    }

    // Transaction: clear other primaries in the same scope, then set this one
    await db.$transaction([
      db.imageAsset.updateMany({
        where: {
          recordId: image.recordId,
          ...(fieldName ? { fieldName } : {}),
        },
        data: { isPrimary: false },
      }),
      db.imageAsset.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    const updated = await db.imageAsset.findUnique({ where: { id: imageId } });
    return NextResponse.json({ image: updated });
  } catch (error) {
    console.error('Image PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
