import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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
    if (!hasPermission(tokenPayload.roles, 'data:write')) {
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

    if (isReadOnlyFs()) {
      // Vercel/production: Store in database (FileAsset)
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
      },
    });

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

    // Get single image
    if (imageId) {
      const image = await db.imageAsset.findUnique({ where: { id: imageId } });
      if (!image) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }
      return NextResponse.json({ image });
    }

    // List images for a record
    if (!recordId) {
      return NextResponse.json({ error: 'recordId or imageId query parameter is required' }, { status: 400 });
    }

    const images = await db.imageAsset.findMany({
      where: { recordId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });

    return NextResponse.json({ images });
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
    if (!hasPermission(tokenPayload.roles, 'data:write')) {
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

    // If filePath references a FileAsset ID, delete from database
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

    // Delete database record
    await db.imageAsset.delete({ where: { id: imageId } });

    return NextResponse.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Image DELETE error:', error);
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
    if (!hasPermission(tokenPayload.roles, 'data:write')) {
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
