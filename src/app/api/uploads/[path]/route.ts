import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join, normalize } from 'path';
import { existsSync } from 'fs';
import { db } from '@/lib/db';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

const MIME_MAP: Record<string, string> = {
  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
  'png': 'image/png', 'gif': 'image/gif',
  'webp': 'image/webp', 'bmp': 'image/bmp',
  'tiff': 'image/tiff', 'tif': 'image/tiff',
  'heic': 'image/heic', 'heif': 'image/heif',
  'avif': 'image/avif', 'svg': 'image/svg+xml',
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'txt': 'text/plain',
  'csv': 'text/csv',
};

/**
 * Defend against path traversal: reject any path that contains `..`,
 * starts with `/` (absolute path), contains a Windows drive prefix, or
 * contains a NUL byte. After validation, we still `normalize()` the
 * resolved disk path and confirm it stays within UPLOAD_DIR before
 * reading from disk.
 */
function isSafeRelativePath(p: string): boolean {
  if (!p) return false;
  if (p.includes('..')) return false;
  if (p.startsWith('/')) return false;
  if (p.startsWith('\\')) return false;
  if (/[a-zA-Z]:[\\/]/.test(p)) return false; // Windows drive prefix
  if (p.includes('\0')) return false;
  return true;
}

// GET /api/uploads/[path] - Serve uploaded files
// Supports both database-stored files (FileAsset by ID) and legacy disk files.
// Public: serves any uploaded file by ID/path — access control is enforced at
// upload time (write path), and uploaded files are not considered sensitive
// (they are product images, documentation attachments, etc.).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  try {
    const { path: filePath } = await params;

    // ── Path traversal protection ────────────────────────────────────────
    if (!isSafeRelativePath(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Strategy 1: Try database-backed storage first (Vercel-compatible)
    // The path could be a FileAsset ID (cuid format: starts with 'c', 24+ chars)
    const isCuid = /^c[a-z0-9]{20,}$/i.test(filePath);
    if (isCuid) {
      try {
        const fileAsset = await db.fileAsset.findUnique({ where: { id: filePath } });
        if (fileAsset) {
          const isImage = fileAsset.mimeType.startsWith('image/');
          const headers = new Headers();
          headers.set('Content-Type', fileAsset.mimeType);
          headers.set('Content-Length', fileAsset.fileSize.toString());
          // Cache uploaded files for a day at the browser/CDN level — they
          // are immutable (a new upload creates a new FileAsset ID).
          headers.set('Cache-Control', 'public, max-age=86400, immutable');
          headers.set(
            'Content-Disposition',
            `${isImage ? 'inline' : 'attachment'}; filename="${fileAsset.fileName.replace(/["\\]/g, '_')}"`
          );
          return new NextResponse(Buffer.from(fileAsset.fileData), { headers });
        }
        // Fall through to disk-based serving if not found in DB
      } catch {
        // Fall through to disk-based serving
      }
    }

    // Strategy 2: Legacy disk-based serving (for local dev with existing files)
    // Only allow paths that resolve strictly inside UPLOAD_DIR.
    const diskPath = normalize(join(UPLOAD_DIR, filePath));
    if (!diskPath.startsWith(UPLOAD_DIR + '/') && diskPath !== UPLOAD_DIR) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    if (!existsSync(diskPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileStat = await stat(diskPath);

    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeType = MIME_MAP[ext] || 'application/octet-stream';
    const isImage = mimeType.startsWith('image/');

    const fileBuffer = await readFile(diskPath);

    // Set caching + disposition headers
    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Length', fileStat.size.toString());
    headers.set('Cache-Control', 'public, max-age=86400, immutable');
    const safeFileName = (filePath.split('_').slice(2).join('_') || filePath).replace(/["\\]/g, '_');
    headers.set('Content-Disposition', `${isImage ? 'inline' : 'attachment'}; filename="${safeFileName}"`);

    return new NextResponse(fileBuffer, { headers });
  } catch (error) {
    console.error('File serve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
