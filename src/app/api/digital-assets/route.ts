import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { jsonVal, jsonParse } from '@/lib/db-json';
import { ensureR2Config, isR2Configured, uploadWithVariants, deleteWithVariants, generateR2Key, getR2PublicUrl, uploadToR2 } from '@/lib/r2';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'digital-assets');

const ASSET_TYPES = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'SPREADSHEET', 'PRESENTATION', 'OTHER'];
const ASSET_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'];

const MIME_TYPE_MAP: Record<string, string> = {
  'image/jpeg': 'IMAGE', 'image/png': 'IMAGE', 'image/gif': 'IMAGE',
  'image/webp': 'IMAGE', 'image/bmp': 'IMAGE', 'image/tiff': 'IMAGE',
  'image/heic': 'IMAGE', 'image/heif': 'IMAGE', 'image/avif': 'IMAGE', 'image/svg+xml': 'IMAGE',
  'video/mp4': 'VIDEO', 'video/mpeg': 'VIDEO', 'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO', 'video/x-msvideo': 'VIDEO',
  'audio/mpeg': 'AUDIO', 'audio/wav': 'AUDIO', 'audio/ogg': 'AUDIO',
  'audio/aac': 'AUDIO', 'audio/flac': 'AUDIO',
  'application/pdf': 'DOCUMENT',
  'application/msword': 'DOCUMENT', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
  'text/plain': 'DOCUMENT', 'text/csv': 'DOCUMENT',
  'application/vnd.ms-excel': 'SPREADSHEET',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'SPREADSHEET',
  'application/vnd.ms-powerpoint': 'PRESENTATION',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PRESENTATION',
};

function detectAssetType(mimeType: string, fileName: string): string {
  if (MIME_TYPE_MAP[mimeType]) return MIME_TYPE_MAP[mimeType];
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const extMap: Record<string, string> = {
    'jpg': 'IMAGE', 'jpeg': 'IMAGE', 'png': 'IMAGE', 'gif': 'IMAGE', 'webp': 'IMAGE',
    'bmp': 'IMAGE', 'tiff': 'IMAGE', 'svg': 'IMAGE', 'heic': 'IMAGE', 'avif': 'IMAGE',
    'mp4': 'VIDEO', 'mov': 'VIDEO', 'avi': 'VIDEO', 'webm': 'VIDEO', 'mkv': 'VIDEO',
    'mp3': 'AUDIO', 'wav': 'AUDIO', 'ogg': 'AUDIO', 'flac': 'AUDIO', 'aac': 'AUDIO',
    'pdf': 'DOCUMENT', 'doc': 'DOCUMENT', 'docx': 'DOCUMENT', 'txt': 'DOCUMENT', 'rtf': 'DOCUMENT',
    'xls': 'SPREADSHEET', 'xlsx': 'SPREADSHEET', 'csv': 'SPREADSHEET',
    'ppt': 'PRESENTATION', 'pptx': 'PRESENTATION',
  };
  return extMap[ext] || 'OTHER';
}

function isReadOnlyFs(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.READONLY_FS === 'true';
}

// GET /api/digital-assets - List digital assets with pagination, filtering
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '24');
    const search = searchParams.get('search') || '';
    const assetType = searchParams.get('assetType') || '';
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const tags = searchParams.get('tags') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const isSA = tokenPayload.roles.includes('Super Admin');
    const companyId = tokenPayload.companyId;

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};
    if (!isSA) {
      where.companyId = companyId;
    }

    if (assetType && ASSET_TYPES.includes(assetType)) {
      where.assetType = assetType;
    }
    if (status && ASSET_STATUSES.includes(status)) {
      where.status = status;
    }
    if (category) {
      where.category = category;
    }

    // Handle tags filter separately
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        where.tags = { in: tagList.map(tag => ({ contains: tag })) };
        // Simpler approach: match any tag
        where.OR = tagList.map(tag => ({ tags: { contains: tag } }));
        delete where.tags;
      }
    }

    // Handle search
    if (search) {
      const searchConditions = [
        { fileName: { contains: search } },
        { originalFileName: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } },
        { altText: { contains: search } },
        { category: { contains: search } },
      ];
      // If we already have OR for tags, combine with AND
      if (where.OR) {
        const tagOr = where.OR;
        where.AND = [{ OR: searchConditions }, { OR: tagOr }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const skip = (page - 1) * pageSize;

    const [assets, total] = await Promise.all([
      db.digitalAsset.findMany({
        where,
        include: {
          variants: {
            select: { id: true, variant: true, filePath: true, width: true, height: true, bytes: true, format: true },
          },
          uploader: {
            select: { id: true, displayName: true, username: true },
          },
        },
        orderBy: { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' },
        skip,
        take: pageSize,
      }),
      db.digitalAsset.count({ where }),
    ]);

    // Get distinct categories for filter
    const categories = await db.digitalAsset.findMany({
      where: isSA ? {} : { companyId },
      select: { category: true },
      distinct: ['category'],
    });

    return NextResponse.json({
      assets,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      categories: categories.map(c => c.category).filter(Boolean) as string[],
    });
  } catch (error) {
    console.error('Digital assets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/digital-assets - Upload new digital asset
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:upload')) {
      return NextResponse.json({ error: 'Insufficient permissions to upload assets' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    const altText = formData.get('altText') as string | null;
    const tagsStr = formData.get('tags') as string | null;
    const category = formData.get('category') as string | null;
    const assetTypeOverride = formData.get('assetType') as string | null;
    const recordId = formData.get('recordId') as string | null;
    const status = formData.get('status') as string || 'DRAFT';

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // File size limit: 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: `File "${file.name}" exceeds 50MB limit` }, { status: 400 });
    }

    const companyId = tokenPayload.companyId;
    const mimeType = file.type || 'application/octet-stream';
    const assetType = (assetTypeOverride && ASSET_TYPES.includes(assetTypeOverride))
      ? assetTypeOverride
      : detectAssetType(mimeType, file.name);

    // Read file bytes
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure R2 config is loaded from database
    await ensureR2Config();

    let filePath: string;
    let r2Key: string | null = null;
    let storageType = 'local';

    if (isR2Configured()) {
      // R2 storage (preferred) — upload to Cloudflare R2 with variants
      const key = generateR2Key('digital-assets', recordId || 'unlinked', file.name);
      if (assetType === 'IMAGE') {
        // Generate variants for images
        await uploadWithVariants(buffer, key, mimeType, {
          metadata: { 'original-name': file.name, 'category': category || '' },
        });
        filePath = getR2PublicUrl(key) || `/api/r2-image?key=${encodeURIComponent(key)}/original`;
      } else {
        // Non-image assets: just upload original
        await uploadToR2(buffer, key, mimeType, {
          metadata: { 'original-name': file.name, 'category': category || '' },
        });
        filePath = getR2PublicUrl(key) || `/api/r2-image?key=${encodeURIComponent(key)}`;
      }
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

      // Also store in database for reliability
      await db.fileAsset.create({
        data: {
          fileName: file.name,
          fileData: buffer,
          mimeType,
          fileSize: file.size,
          category: 'digital-asset',
        },
      });
    }

    // Build tags as JSON array
    let tagsValue: unknown = null;
    if (tagsStr) {
      try {
        const parsed = JSON.parse(tagsStr);
        if (Array.isArray(parsed)) {
          tagsValue = jsonVal(parsed);
        } else {
          tagsValue = jsonVal(tagsStr.split(',').map(t => t.trim()).filter(Boolean));
        }
      } catch {
        tagsValue = jsonVal(tagsStr.split(',').map(t => t.trim()).filter(Boolean));
      }
    }

    const validStatus = ASSET_STATUSES.includes(status) ? status : 'DRAFT';

    const asset = await db.digitalAsset.create({
      data: {
        companyId,
        recordId: recordId || null,
        assetType,
        fileName: file.name.replace(/[^a-zA-Z0-9.-]/g, '_'),
        originalFileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType,
        title: title || file.name,
        description: description || null,
        altText: altText || null,
        tags: tagsValue,
        category: category || null,
        status: validStatus,
        uploadedById: tokenPayload.userId,
        isPrimary: false,
        sortOrder: 0,
        r2Key,
        storageType,
      },
      include: {
        variants: true,
        uploader: { select: { id: true, displayName: true, username: true } },
      },
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error('Digital asset upload error:', error);
    return NextResponse.json({ error: 'Internal server error during upload' }, { status: 500 });
  }
}

// PUT /api/digital-assets - Bulk update assets
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions to manage assets' }, { status: 403 });
    }

    const body = await request.json();
    const { assetIds, action, data } = body as {
      assetIds: string[];
      action: 'delete' | 'updateStatus' | 'updateCategory' | 'addTags' | 'removeTags';
      data?: Record<string, unknown>;
    };

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json({ error: 'assetIds array is required' }, { status: 400 });
    }

    const isSA = tokenPayload.roles.includes('Super Admin');
    const companyId = tokenPayload.companyId;

    const assets = await db.digitalAsset.findMany({
      where: { id: { in: assetIds } },
    });

    for (const asset of assets) {
      if (!isSA && asset.companyId !== companyId) {
        return NextResponse.json({ error: `Access denied for asset ${asset.id}` }, { status: 403 });
      }
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    switch (action) {
      case 'delete': {
        for (const assetId of assetIds) {
          try {
            const asset = assets.find(a => a.id === assetId);
            if (!asset) {
              results.push({ id: assetId, success: false, error: 'Not found' });
              continue;
            }
            // R2 cleanup
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
            try {
              const variants = await db.digitalAssetVariant.findMany({
                where: { assetId },
                select: { filePath: true },
              });
              const variantFileIds = variants
                .map(v => v.filePath.split('/').pop() || '')
                .filter(id => /^c[a-z0-9]{20,}$/i.test(id));
              if (variantFileIds.length > 0) {
                await db.fileAsset.deleteMany({ where: { id: { in: variantFileIds } } });
              }
            } catch { /* best effort */ }
            await db.digitalAsset.delete({ where: { id: assetId } });
            results.push({ id: assetId, success: true });
          } catch (err) {
            results.push({ id: assetId, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
          }
        }
        break;
      }
      case 'updateStatus': {
        const newStatus = String(data?.status || '');
        if (!ASSET_STATUSES.includes(newStatus)) {
          return NextResponse.json({ error: `Invalid status: ${newStatus}` }, { status: 400 });
        }
        for (const assetId of assetIds) {
          try {
            await db.digitalAsset.update({
              where: { id: assetId },
              data: { status: newStatus },
            });
            results.push({ id: assetId, success: true });
          } catch (err) {
            results.push({ id: assetId, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
          }
        }
        break;
      }
      case 'updateCategory': {
        const newCategory = String(data?.category || '');
        for (const assetId of assetIds) {
          try {
            await db.digitalAsset.update({
              where: { id: assetId },
              data: { category: newCategory || null },
            });
            results.push({ id: assetId, success: true });
          } catch (err) {
            results.push({ id: assetId, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
          }
        }
        break;
      }
      case 'addTags': {
        const tagsToAdd = (data?.tags as string[]) || [];
        for (const assetId of assetIds) {
          try {
            const asset = assets.find(a => a.id === assetId);
            if (!asset) { results.push({ id: assetId, success: false, error: 'Not found' }); continue; }
            let existingTags: string[] = [];
            try { existingTags = jsonParse<string[]>(asset.tags || '[]'); } catch { existingTags = []; }
            const merged = [...new Set([...existingTags, ...tagsToAdd])];
            await db.digitalAsset.update({
              where: { id: assetId },
              data: { tags: jsonVal(merged) },
            });
            results.push({ id: assetId, success: true });
          } catch (err) {
            results.push({ id: assetId, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
          }
        }
        break;
      }
      case 'removeTags': {
        const tagsToRemove = (data?.tags as string[]) || [];
        for (const assetId of assetIds) {
          try {
            const asset = assets.find(a => a.id === assetId);
            if (!asset) { results.push({ id: assetId, success: false, error: 'Not found' }); continue; }
            let existingTags: string[] = [];
            try { existingTags = jsonParse<string[]>(asset.tags || '[]'); } catch { existingTags = []; }
            const filtered = existingTags.filter(t => !tagsToRemove.includes(t));
            await db.digitalAsset.update({
              where: { id: assetId },
              data: { tags: jsonVal(filtered) },
            });
            results.push({ id: assetId, success: true });
          } catch (err) {
            results.push({ id: assetId, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
          }
        }
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
    });
  } catch (error) {
    console.error('Digital asset bulk PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/digital-assets - Bulk delete assets
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(tokenPayload.roles, 'dam:delete')) {
      return NextResponse.json({ error: 'Insufficient permissions to delete assets' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids') || '';

    if (!ids) {
      return NextResponse.json({ error: 'ids query parameter is required (comma-separated)' }, { status: 400 });
    }

    const assetIds = ids.split(',').filter(Boolean);
    const isSA = tokenPayload.roles.includes('Super Admin');
    const companyId = tokenPayload.companyId;

    let deleted = 0;
    let errors = 0;

    for (const assetId of assetIds) {
      try {
        const asset = await db.digitalAsset.findUnique({ where: { id: assetId } });
        if (!asset) { errors++; continue; }
        if (!isSA && asset.companyId !== companyId) { errors++; continue; }

        // R2 cleanup
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

        try {
          const variants = await db.digitalAssetVariant.findMany({
            where: { assetId },
            select: { filePath: true },
          });
          const variantFileIds = variants
            .map(v => v.filePath.split('/').pop() || '')
            .filter(id => /^c[a-z0-9]{20,}$/i.test(id));
          if (variantFileIds.length > 0) {
            await db.fileAsset.deleteMany({ where: { id: { in: variantFileIds } } });
          }
        } catch { /* best effort */ }

        await db.digitalAsset.delete({ where: { id: assetId } });
        deleted++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ deleted, errors, total: assetIds.length });
  } catch (error) {
    console.error('Digital asset DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
