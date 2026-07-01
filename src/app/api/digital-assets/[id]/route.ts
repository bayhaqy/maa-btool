import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { join } from 'path';
import { existsSync } from 'fs';
import { jsonVal } from '@/lib/db-json';
import { ensureR2Config, isR2Configured, uploadWithVariants, deleteWithVariants, generateR2Key, getR2PublicUrl, uploadToR2 } from '@/lib/r2';
import { writeFile } from 'fs/promises';

const ASSET_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'];

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'digital-assets');

function isReadOnlyFs(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.READONLY_FS === 'true';
}

// GET /api/digital-assets/[id] - Get single asset with variants and metadata
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const isSA = tokenPayload.roles.includes('Super Admin');

    const asset = await db.digitalAsset.findUnique({
      where: { id },
      include: {
        variants: true,
        metadata: true,
        uploader: { select: { id: true, displayName: true, username: true, email: true } },
        company: { select: { id: true, companyName: true, companyCode: true } },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Access control
    if (!isSA && asset.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Digital asset GET [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/digital-assets/[id] - Replace asset image file
// Body: FormData with 'file' and 'action' = 'replace'
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:upload')) {
      return NextResponse.json({ error: 'Insufficient permissions to update assets' }, { status: 403 });
    }

    const { id } = await params;
    const isSA = tokenPayload.roles.includes('Super Admin');

    const asset = await db.digitalAsset.findUnique({ where: { id } });
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (!isSA && asset.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const action = formData.get('action') as string | null;
    const file = formData.get('file') as File | null;

    if (action === 'replace' && file) {
      // Replace the image file
      if (file.size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 });
      }

      // Clean up old file
      if (asset.storageType === 'r2' && asset.r2Key) {
        try { await deleteWithVariants(asset.r2Key); } catch { /* best effort */ }
      } else {
        const fileId = asset.filePath.split('/').pop() || '';
        const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);
        if (isCuid) {
          try { await db.fileAsset.delete({ where: { id: fileId } }); } catch { /* ok */ }
        } else {
          try {
            const { unlink } = await import('fs/promises');
            await unlink(join(process.cwd(), 'public', asset.filePath));
          } catch { /* ok */ }
        }
      }

      // Clean up old variant FileAssets
      try {
        const variants = await db.digitalAssetVariant.findMany({
          where: { assetId: id },
          select: { filePath: true },
        });
        const variantFileIds = variants
          .map(v => v.filePath.split('/').pop() || '')
          .filter(vid => /^c[a-z0-9]{20,}$/i.test(vid));
        if (variantFileIds.length > 0) {
          await db.fileAsset.deleteMany({ where: { id: { in: variantFileIds } } });
        }
      } catch { /* best effort */ }

      // Delete old variants from DB
      await db.digitalAssetVariant.deleteMany({ where: { assetId: id } });

      // Upload new file
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mimeType = file.type || 'application/octet-stream';

      await ensureR2Config();

      let filePath: string;
      let r2Key: string | null = null;
      let storageType = 'local';

      if (isR2Configured()) {
        const key = generateR2Key('digital-assets', asset.recordId || id, file.name);
        if (asset.assetType === 'IMAGE' || mimeType.startsWith('image/')) {
          await uploadWithVariants(buffer, key, mimeType, {
            metadata: { 'original-name': file.name, 'category': asset.category || '' },
          });
        } else {
          await uploadToR2(buffer, key, mimeType, {
            metadata: { 'original-name': file.name, 'category': asset.category || '' },
          });
        }
        filePath = getR2PublicUrl(key) || `/api/r2-image?key=${encodeURIComponent(key)}`;
        r2Key = key;
        storageType = 'r2';
      } else if (isReadOnlyFs()) {
        const fileAsset = await db.fileAsset.create({
          data: {
            fileName: file.name,
            fileData: buffer,
            mimeType,
            fileSize: file.size,
            category: 'digital-asset',
          },
        });
        filePath = `/api/uploads/${fileAsset.id}`;
      } else {
        if (!existsSync(UPLOAD_DIR)) {
          const { mkdir } = await import('fs/promises');
          await mkdir(UPLOAD_DIR, { recursive: true });
        }
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${randomSuffix}_${safeName}`;
        await writeFile(join(UPLOAD_DIR, fileName), buffer);
        filePath = `/api/uploads/digital-assets/${fileName}`;
      }

      // Update asset record
      const updated = await db.digitalAsset.update({
        where: { id },
        data: {
          fileName: file.name.replace(/[^a-zA-Z0-9.-]/g, '_'),
          originalFileName: file.name,
          filePath,
          fileSize: file.size,
          mimeType,
          r2Key,
          storageType,
        },
        include: {
          variants: true,
          metadata: true,
          uploader: { select: { id: true, displayName: true, username: true } },
        },
      });

      return NextResponse.json({ asset: updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Digital asset POST [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/digital-assets/[id] - Update single asset
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
      return NextResponse.json({ error: 'Insufficient permissions to update assets' }, { status: 403 });
    }

    const { id } = await params;
    const isSA = tokenPayload.roles.includes('Super Admin');

    const asset = await db.digitalAsset.findUnique({ where: { id } });
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (!isSA && asset.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title || null;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.altText !== undefined) updateData.altText = body.altText || null;
    if (body.category !== undefined) updateData.category = body.category || null;
    if (body.isPrimary !== undefined) updateData.isPrimary = Boolean(body.isPrimary);
    if (body.sortOrder !== undefined) updateData.sortOrder = Number(body.sortOrder);
    if (body.width !== undefined) updateData.width = Number(body.width) || null;
    if (body.height !== undefined) updateData.height = Number(body.height) || null;
    if (body.dpi !== undefined) updateData.dpi = Number(body.dpi) || null;
    if (body.colorSpace !== undefined) updateData.colorSpace = body.colorSpace || null;
    if (body.duration !== undefined) updateData.duration = Number(body.duration) || null;
    if (body.frameRate !== undefined) updateData.frameRate = Number(body.frameRate) || null;
    if (body.pageCount !== undefined) updateData.pageCount = Number(body.pageCount) || null;
    if (body.validFrom !== undefined) updateData.validFrom = body.validFrom ? new Date(body.validFrom) : null;
    if (body.validTo !== undefined) updateData.validTo = body.validTo ? new Date(body.validTo) : null;
    if (body.rightsInfo !== undefined) updateData.rightsInfo = body.rightsInfo || null;

    if (body.status !== undefined) {
      if (ASSET_STATUSES.includes(body.status)) {
        updateData.status = body.status;
      }
    }

    if (body.tags !== undefined) {
      if (Array.isArray(body.tags)) {
        updateData.tags = jsonVal(body.tags);
      } else if (typeof body.tags === 'string') {
        try { updateData.tags = jsonVal(JSON.parse(body.tags)); } catch { updateData.tags = body.tags; }
      }
    }

    const updated = await db.digitalAsset.update({
      where: { id },
      data: updateData,
      include: {
        variants: true,
        metadata: true,
        uploader: { select: { id: true, displayName: true, username: true } },
      },
    });

    return NextResponse.json({ asset: updated });
  } catch (error) {
    console.error('Digital asset PUT [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/digital-assets/[id] - Delete single asset
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
      return NextResponse.json({ error: 'Insufficient permissions to delete assets' }, { status: 403 });
    }

    const { id } = await params;
    const isSA = tokenPayload.roles.includes('Super Admin');

    const asset = await db.digitalAsset.findUnique({ where: { id } });
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (!isSA && asset.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Clean up R2 or local file
    if (asset.storageType === 'r2' && asset.r2Key) {
      try { await deleteWithVariants(asset.r2Key); } catch { /* best effort */ }
    } else {
      const fileId = asset.filePath.split('/').pop() || '';
      const isCuid = /^c[a-z0-9]{20,}$/i.test(fileId);
      if (isCuid) {
        try { await db.fileAsset.delete({ where: { id: fileId } }); } catch { /* ok */ }
      } else {
        try {
          const { unlink } = await import('fs/promises');
          await unlink(join(process.cwd(), 'public', asset.filePath));
        } catch { /* ok */ }
      }
    }

    // Clean up variant FileAssets
    try {
      const variants = await db.digitalAssetVariant.findMany({
        where: { assetId: id },
        select: { filePath: true },
      });
      const variantFileIds = variants
        .map(v => v.filePath.split('/').pop() || '')
        .filter(vid => /^c[a-z0-9]{20,}$/i.test(vid));
      if (variantFileIds.length > 0) {
        await db.fileAsset.deleteMany({ where: { id: { in: variantFileIds } } });
      }
    } catch { /* best effort */ }

    // Delete asset (cascades variants and metadata)
    await db.digitalAsset.delete({ where: { id } });

    return NextResponse.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Digital asset DELETE [id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
