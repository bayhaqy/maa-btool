import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'docs');

const SUPPORTED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'avif', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'md',
];

const SUPPORTED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'image/heic', 'image/heif', 'image/avif', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'text/markdown',
];

// Check if we're running on a read-only filesystem (Vercel production)
function isReadOnlyFs(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.READONLY_FS === 'true';
}

const MIME_MAP: Record<string, string> = {
  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
  'gif': 'image/gif', 'webp': 'image/webp', 'heic': 'image/heic',
  'heif': 'image/heif', 'avif': 'image/avif', 'svg': 'image/svg+xml',
  'pdf': 'application/pdf', 'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'txt': 'text/plain', 'csv': 'text/csv', 'md': 'text/markdown',
};

// POST /api/doc-upload - Upload files for documentation (multi-file support)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    // Allow both authenticated doc writers AND public access for viewing
    // But write requires auth
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasDocRole = tokenPayload.roles.some(r => ['Super Admin', 'Doc Writer', 'Manager'].includes(r));
    if (!hasDocRole) {
      return NextResponse.json({ error: 'Insufficient permissions to upload documentation files' }, { status: 403 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const uploadedFiles: Array<{
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
    }> = [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isValidMime = file.type && SUPPORTED_MIME_TYPES.includes(file.type);
      const isValidExt = SUPPORTED_EXTENSIONS.includes(ext);

      if (!isValidMime && !isValidExt) {
        return NextResponse.json({
          error: `Unsupported file type: ${file.name}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
        }, { status: 400 });
      }

      if (file.size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: `File "${file.name}" exceeds 50MB limit` }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mimeType = file.type || MIME_MAP[ext] || 'application/octet-stream';

      let filePath: string;

      if (isReadOnlyFs()) {
        // Vercel/production: Store in database (FileAsset)
        const fileAsset = await db.fileAsset.create({
          data: {
            fileName: file.name,
            fileData: buffer,
            mimeType,
            fileSize: file.size,
            category: 'doc',
          },
        });
        filePath = `/api/uploads/${fileAsset.id}`;
      } else {
        // Local dev: Store on disk AND database
        if (!existsSync(UPLOAD_DIR)) {
          await mkdir(UPLOAD_DIR, { recursive: true });
        }
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${randomSuffix}_${safeName}`;
        await writeFile(join(UPLOAD_DIR, fileName), buffer);
        filePath = `/api/uploads/docs/${fileName}`;

        // Also store in database for Vercel compatibility
        await db.fileAsset.create({
          data: {
            fileName: file.name,
            fileData: buffer,
            mimeType,
            fileSize: file.size,
            category: 'doc',
          },
        });
      }

      uploadedFiles.push({
        fileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType,
      });
    }

    return NextResponse.json({ files: uploadedFiles }, { status: 201 });
  } catch (error) {
    console.error('Doc upload error:', error);
    return NextResponse.json({ error: 'Internal server error during file upload' }, { status: 500 });
  }
}
