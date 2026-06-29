import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders, STATUS_ACTIVE, STATUS_DRAFT } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

// Validate a single row against META_FIELDS (reused from records)
async function validatePayload(moduleId: string, payload: Record<string, unknown>) {
  const fields = await db.metaField.findMany({
    where: { moduleId, isActive: true },
    include: { validations: true },
  });

  const errors: string[] = [];

  for (const field of fields) {
    const value = payload[field.fieldCode];

    if (field.isRequired && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) is required`);
      continue;
    }

    if (value === undefined || value === null || value === '') continue;

    if (field.dataType === 'NUMBER' && isNaN(Number(value))) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a number`);
    }
    if (field.dataType === 'EMAIL' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a valid email`);
    }
    if (field.dataType === 'URL' && typeof value === 'string' && !/^https?:\/\/.+/.test(value)) {
      errors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a valid URL`);
    }
    // IMAGE type: accept URLs or empty values
    if (field.dataType === 'IMAGE' && typeof value === 'string' && value.trim() !== '') {
      // IMAGE fields accept URLs — validate it looks like a URL
      if (!/^https?:\/\/.+/i.test(value) && !/^\/api\/uploads\//i.test(value)) {
        errors.push(`Field "${field.fieldName}" (${field.fieldCode}) must be a valid image URL (http:// or https://)`);
      }
    }

    for (const validation of field.validations) {
      if (validation.ruleType === 'REGEX') {
        try {
          const regex = new RegExp(validation.ruleValue);
          if (typeof value === 'string' && !regex.test(value)) {
            errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) does not match pattern`);
          }
        } catch { /* skip invalid regex */ }
      }
      if (validation.ruleType === 'MIN_LENGTH' && typeof value === 'string') {
        if (value.length < parseInt(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at least ${validation.ruleValue} characters`);
        }
      }
      if (validation.ruleType === 'MAX_LENGTH' && typeof value === 'string') {
        if (value.length > parseInt(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at most ${validation.ruleValue} characters`);
        }
      }
      if (validation.ruleType === 'MIN_VALUE') {
        if (Number(value) < Number(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at least ${validation.ruleValue}`);
        }
      }
      if (validation.ruleType === 'MAX_VALUE') {
        if (Number(value) > Number(validation.ruleValue)) {
          errors.push(validation.errorMessage || `Field "${field.fieldName}" (${field.fieldCode}) must be at most ${validation.ruleValue}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Download an image from a URL and save it locally, creating a FileAsset and ImageAsset.
 * Returns the local file path (e.g. /api/uploads/xxx) or the original URL if download fails.
 */
async function downloadAndUploadImage(
  imageUrl: string,
  recordId: string,
  fieldName: string | null,
): Promise<string> {
  try {
    // Skip if already a local path
    if (imageUrl.startsWith('/api/uploads/')) {
      return imageUrl;
    }

    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      console.warn(`[bulk import] Failed to download image: ${imageUrl} (status: ${response.status})`);
      return imageUrl; // Return original URL if download fails
    }

    const contentType = response.headers.get('content-type') || '';
    const isImage = contentType.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif|heic|heif|avif|svg)(\?.*)?$/i.test(imageUrl);

    if (!isImage) {
      console.warn(`[bulk import] URL does not appear to be an image: ${imageUrl} (content-type: ${contentType})`);
      return imageUrl;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Determine file extension
    const extMatch = imageUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif|heic|heif|avif|svg)(\?.*)?$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'png';

    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
      'heic': 'image/heic', 'heif': 'image/heif',
      'avif': 'image/avif', 'svg': 'image/svg+xml',
      'bmp': 'image/bmp', 'tiff': 'image/tiff', 'tif': 'image/tiff',
    };
    const mimeType = mimeMap[ext] || contentType || 'image/png';

    let filePath: string;

    // Save to disk
    if (!existsSync(UPLOAD_DIR)) {
      const { mkdir } = await import('fs/promises');
      await mkdir(UPLOAD_DIR, { recursive: true });
    }
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const safeName = `bulk_import_${timestamp}_${randomSuffix}.${ext}`;
    await writeFile(join(UPLOAD_DIR, safeName), buffer);
    filePath = `/api/uploads/${safeName}`;

    // Also store in database for consistency
    await db.fileAsset.create({
      data: {
        fileName: safeName,
        fileData: buffer,
        mimeType,
        fileSize: buffer.length,
        category: 'image',
      },
    });

    // Create ImageAsset for the record
    const existingCount = await db.imageAsset.count({ where: { recordId } });
    await db.imageAsset.create({
      data: {
        recordId,
        fieldName,
        fileName: safeName,
        filePath,
        fileSize: buffer.length,
        mimeType,
        sortOrder: existingCount,
        isPrimary: existingCount === 0,
      },
    });

    return filePath;
  } catch (error) {
    console.warn(`[bulk import] Error downloading image ${imageUrl}:`, error);
    return imageUrl; // Return original URL if download fails
  }
}

// GET /api/bulk?action=template&moduleId=xxx - Generate Excel template
// GET /api/bulk?action=export&moduleId=xxx - Export ACTIVE records
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check data:read permission
    const readCheck = hasPermission(tokenPayload.roles, 'data:read');
    if (!readCheck) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: data:read' }, { status: 403 });
    }

    // ── Rate limit: read endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const moduleId = searchParams.get('moduleId');

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    }

    const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    const fields = await db.metaField.findMany({
      where: { moduleId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Generate template with headers from META_FIELDS (including IMAGE type)
    if (action === 'template') {
      const headers = fields.map((f) => ({
        fieldCode: f.fieldCode,
        fieldName: f.fieldName,
        dataType: f.dataType,
        isRequired: f.isRequired,
        placeholder: f.dataType === 'IMAGE'
          ? 'https://example.com/image.jpg'
          : (f.placeholder || ''),
        isImage: f.dataType === 'IMAGE',
      }));

      return NextResponse.json({ headers, moduleName: metaModule.moduleName, moduleCode: metaModule.moduleCode });
    }

    // Export all ACTIVE records for the module (with image URLs)
    if (action === 'export') {
      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');

      const where: Record<string, unknown> = {
        moduleId,
        status: STATUS_ACTIVE,
      };

      if (!isSuperAdmin) {
        where.companyId = tokenPayload.companyId;
      }

      const records = await db.dataRecord.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          company: { select: { companyCode: true, companyName: true } },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            select: {
              id: true,
              fieldName: true,
              filePath: true,
              isPrimary: true,
              mimeType: true,
            },
          },
        },
      });

      // Build a set of IMAGE field codes for this module
      const imageFieldCodes = new Set(
        fields.filter((f) => f.dataType === 'IMAGE').map((f) => f.fieldCode)
      );

      const data = records.map((r) => {
        const payload = JSON.parse(r.currentPayload);

        // For IMAGE fields in the payload, ensure URLs are included
        // Also build image URL entries from the ImageAsset records
        const imageUrls: Record<string, string> = {};
        for (const img of r.images) {
          const key = img.fieldName || '_images';
          if (!imageUrls[key]) {
            imageUrls[key] = img.filePath;
          }
        }

        return {
          _id: r.id,
          _status: r.status,
          _company: r.company.companyCode,
          _createdAt: r.createdAt,
          _updatedAt: r.updatedAt,
          ...payload,
          // Override IMAGE fields with full URLs from ImageAsset if available
          ...Object.fromEntries(
            Object.entries(imageUrls).filter(([key]) => key !== '_images')
          ),
        };
      });

      return NextResponse.json({
        data,
        total: data.length,
        moduleName: metaModule.moduleName,
        moduleCode: metaModule.moduleCode,
        fields: fields.map((f) => ({
          fieldCode: f.fieldCode,
          dataType: f.dataType,
          isImage: f.dataType === 'IMAGE',
        })),
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use ?action=template or ?action=export' }, { status: 400 });
  } catch (error) {
    console.error('Bulk GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/bulk?action=import - Import records
// POST /api/bulk?action=export - Export records (POST with filters)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: write endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('write', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Import requires data:import permission
    if (action === 'import') {
      if (!hasPermission(tokenPayload.roles, 'data:import')) {
        return NextResponse.json({ error: 'Insufficient permissions. Required: data:import' }, { status: 403 });
      }
    }
    if (action === 'export') {
      if (!hasPermission(tokenPayload.roles, 'data:read')) {
        return NextResponse.json({ error: 'Insufficient permissions. Required: data:read' }, { status: 403 });
      }
    }
    const body = await request.json();

    // Import
    if (action === 'import') {
      // Check data:import permission
      if (!hasPermission(tokenPayload.roles, 'data:import')) {
        return NextResponse.json({ error: 'Insufficient permissions. Required: data:import' }, { status: 403 });
      }

      const { moduleId, data } = body;

      if (!moduleId || !data || !Array.isArray(data)) {
        return NextResponse.json({ error: 'moduleId and data array are required' }, { status: 400 });
      }

      const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
      if (!metaModule) {
        return NextResponse.json({ error: 'Module not found' }, { status: 404 });
      }

      // Get IMAGE type fields for this module
      const imageFields = await db.metaField.findMany({
        where: { moduleId, isActive: true, dataType: 'IMAGE' },
        select: { fieldCode: true, fieldName: true },
      });
      const imageFieldCodes = new Set(imageFields.map((f) => f.fieldCode));

      // Create async job to track
      const job = await db.asyncBatchJob.create({
        data: {
          userId: tokenPayload.userId,
          moduleId,
          jobType: 'IMPORT',
          status: 'PROCESSING',
          totalRows: data.length,
        },
      });

      let validRows = 0;
      let invalidRows = 0;
      let imageDownloadCount = 0;
      const errors: Array<{ row: number; errors: string[] }> = [];

      for (let i = 0; i < data.length; i++) {
        const rowErrors = await validatePayload(moduleId, data[i]);
        if (rowErrors.length > 0) {
          invalidRows++;
          errors.push({ row: i + 1, errors: rowErrors });
        } else {
          validRows++;

          // Extract image URLs from IMAGE fields before saving the record
          const imageUrls: Record<string, string> = {};
          for (const fieldCode of imageFieldCodes) {
            const value = data[i][fieldCode];
            if (typeof value === 'string' && value.trim() !== '' && /^https?:\/\/.+/i.test(value)) {
              imageUrls[fieldCode] = value;
              // Remove the URL from the payload; we'll replace it with the local path after download
              data[i][fieldCode] = '';
            }
          }

          // Create the record
          const record = await db.dataRecord.create({
            data: {
              moduleId,
              companyId: tokenPayload.companyId,
              status: STATUS_DRAFT,
              currentPayload: JSON.stringify(data[i]),
              createdById: tokenPayload.userId,
              updatedById: tokenPayload.userId,
            },
          });

          // Download and upload images for IMAGE fields
          if (Object.keys(imageUrls).length > 0) {
            const updatedPayload = { ...data[i] };

            for (const [fieldCode, url] of Object.entries(imageUrls)) {
              try {
                const localPath = await downloadAndUploadImage(url, record.id, fieldCode);
                updatedPayload[fieldCode] = localPath;
                imageDownloadCount++;
              } catch (err) {
                // If image download fails, keep the original URL in the payload
                updatedPayload[fieldCode] = url;
                console.warn(`[bulk import] Image download failed for row ${i + 1}, field ${fieldCode}:`, err);
              }
            }

            // Update the record with the local image paths
            await db.dataRecord.update({
              where: { id: record.id },
              data: {
                currentPayload: JSON.stringify(updatedPayload),
                updatedById: tokenPayload.userId,
              },
            });
          }
        }
      }

      // Update job status
      await db.asyncBatchJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          processedRows: validRows,
          failedRows: invalidRows,
          errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        jobId: job.id,
        totalRows: data.length,
        validRows,
        invalidRows,
        imageDownloadCount,
        errors,
      });
    }

    // Export with filters (POST)
    if (action === 'export') {
      const { moduleId, filters } = body;

      if (!moduleId) {
        return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
      }

      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      const where: Record<string, unknown> = {
        moduleId,
        status: STATUS_ACTIVE,
      };

      if (!isSuperAdmin) {
        where.companyId = tokenPayload.companyId;
      }

      const records = await db.dataRecord.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          company: { select: { companyCode: true, companyName: true } },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            select: {
              id: true,
              fieldName: true,
              filePath: true,
              isPrimary: true,
            },
          },
        },
      });

      const data = records.map((r) => {
        const payload = JSON.parse(r.currentPayload);

        // Build image URLs from ImageAsset records
        const imageUrls: Record<string, string> = {};
        for (const img of r.images) {
          const key = img.fieldName;
          if (key && !imageUrls[key]) {
            imageUrls[key] = img.filePath;
          }
        }

        return {
          _id: r.id,
          _status: r.status,
          _company: r.company.companyCode,
          _createdAt: r.createdAt,
          _updatedAt: r.updatedAt,
          ...payload,
          ...imageUrls,
        };
      });

      return NextResponse.json({ data, total: data.length, filters });
    }

    return NextResponse.json({ error: 'Invalid action. Use ?action=import or ?action=export' }, { status: 400 });
  } catch (error) {
    console.error('Bulk POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
