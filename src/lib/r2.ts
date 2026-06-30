// ============================================================================
// r2.ts — Cloudflare R2 Storage Client (S3-compatible API)
//
// Provides upload, download, signed URL, delete, and variant generation
// for the MAA BTOOL MDM platform's Digital Asset Management.
//
// Architecture:
//   - Production: All images/digital assets stored in Cloudflare R2
//   - Legacy: Falls back to FileAsset DB storage for unmigrated assets
//   - Pre-signed URLs: Secure access with configurable expiry
//   - Variant support: Auto-generates thumbnail/small/medium/large variants
// ============================================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

// ─── R2 Client Configuration ────────────────────────────────────────────────

const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'maa-btool-assets';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

let _r2Client: S3Client | null = null;

/**
 * Check if R2 is configured (has endpoint + credentials)
 */
export function isR2Configured(): boolean {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

/**
 * Get or create the R2 S3 client singleton
 */
export function getR2Client(): S3Client {
  if (!_r2Client) {
    if (!isR2Configured()) {
      throw new Error('R2 storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.');
    }
    _r2Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _r2Client;
}

// ─── Upload Operations ──────────────────────────────────────────────────────

export interface UploadResult {
  key: string;
  bucket: string;
  size: number;
  mimeType: string;
  publicUrl?: string;
}

/**
 * Upload a buffer to R2
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  mimeType: string,
  options?: {
    cacheControl?: string;
    metadata?: Record<string, string>;
  }
): Promise<UploadResult> {
  const client = getR2Client();
  const cacheControl = options?.cacheControl ?? 'public, max-age=31536000, immutable';

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: cacheControl,
      Metadata: options?.metadata,
    })
  );

  return {
    key,
    bucket: R2_BUCKET,
    size: buffer.length,
    mimeType,
    publicUrl: R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : undefined,
  };
}

/**
 * Upload with variant generation (STIBO Image Conversion Configuration)
 * Generates thumbnail, small, medium, large variants and uploads all to R2
 */
export interface VariantUploadResult {
  original: UploadResult;
  variants: Record<string, UploadResult & { width: number; height: number; bytes: number; format: string }>;
}

const VARIANT_CONFIGS = [
  { variant: 'thumbnail', width: 150, height: 150, format: 'webp' as const, quality: 80 },
  { variant: 'small', width: 300, height: 300, format: 'webp' as const, quality: 80 },
  { variant: 'medium', width: 800, height: 800, format: 'jpeg' as const, quality: 85 },
  { variant: 'large', width: 1200, height: 1200, format: 'jpeg' as const, quality: 85 },
];

const MIME_BY_FORMAT: Record<string, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

export async function uploadWithVariants(
  buffer: Buffer,
  baseKey: string, // e.g., "images/products/abc123"
  mimeType: string,
  metadata?: Record<string, string>
): Promise<VariantUploadResult> {
  // Upload original
  const originalResult = await uploadToR2(buffer, `${baseKey}/original`, mimeType, {
    metadata,
  });

  const variants: VariantUploadResult['variants'] = {};

  // Generate and upload variants in parallel
  await Promise.all(
    VARIANT_CONFIGS.map(async (cfg) => {
      try {
        let chain = sharp(buffer, { failOnError: false }).resize(cfg.width, cfg.height, {
          fit: 'inside',
          withoutEnlargement: true,
        });

        if (cfg.format === 'webp') {
          chain = chain.webp({ quality: cfg.quality });
        } else {
          chain = chain.jpeg({ quality: cfg.quality, mozjpeg: false });
        }

        const { data, info } = await chain.toBuffer({ resolveWithObject: true });
        const variantMime = MIME_BY_FORMAT[cfg.format];
        const variantKey = `${baseKey}/${cfg.variant}`;

        const uploadResult = await uploadToR2(Buffer.from(data), variantKey, variantMime, {
          cacheControl: 'public, max-age=31536000, immutable',
          metadata,
        });

        variants[cfg.variant] = {
          ...uploadResult,
          width: info.width || cfg.width,
          height: info.height || cfg.height,
          bytes: data.length,
          format: cfg.format,
        };
      } catch (err) {
        console.error(`[R2] Failed to generate variant '${cfg.variant}':`, err instanceof Error ? err.message : err);
      }
    })
  );

  return { original: originalResult, variants };
}

// ─── Download Operations ────────────────────────────────────────────────────

/**
 * Download a file from R2 and return as Buffer
 */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`Empty response body for key: ${key}`);
  }

  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Download from an external URL and return as Buffer
 */
export async function downloadFromUrl(url: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MAA-BTOOL-MDM/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download from URL: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  const size = buffer.length;

  return { buffer, mimeType, size };
}

// ─── Signed URL Operations ──────────────────────────────────────────────────

/**
 * Generate a pre-signed URL for reading a file from R2
 * @param key The R2 object key
 * @param expiresIn URL expiry in seconds (default: 1 hour)
 */
export async function getSignedReadUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }),
    { expiresIn }
  );
}

/**
 * Generate a pre-signed URL for uploading a file to R2
 */
export async function getSignedUploadUrl(
  key: string,
  mimeType: string,
  expiresIn = 300
): Promise<string> {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn }
  );
}

// ─── Delete Operations ──────────────────────────────────────────────────────

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    })
  );
}

/**
 * Delete a file and all its variants from R2
 */
export async function deleteWithVariants(baseKey: string): Promise<void> {
  const client = getR2Client();
  const keysToDelete = [
    `${baseKey}/original`,
    ...VARIANT_CONFIGS.map((v) => `${baseKey}/${v.variant}`),
  ];

  await Promise.all(
    keysToDelete.map((key) =>
      client
        .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
        .catch(() => {
          // Ignore errors for missing keys
        })
    )
  );
}

// ─── Utility Operations ─────────────────────────────────────────────────────

/**
 * Get object metadata (HEAD) from R2
 */
export async function getR2ObjectMetadata(
  key: string
): Promise<{ size: number; mimeType: string; lastModified: Date } | null> {
  try {
    const client = getR2Client();
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      })
    );
    return {
      size: response.ContentLength ?? 0,
      mimeType: response.ContentType ?? 'application/octet-stream',
      lastModified: response.LastModified ?? new Date(),
    };
  } catch {
    return null;
  }
}

/**
 * List objects in R2 with a given prefix
 */
export async function listR2Objects(
  prefix: string,
  maxKeys = 1000
): Promise<string[]> {
  const client = getR2Client();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );
  return (response.Contents || []).map((obj) => obj.Key!).filter(Boolean);
}

/**
 * Copy an object within R2
 */
export async function copyWithinR2(sourceKey: string, destKey: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET,
      CopySource: `${R2_BUCKET}/${sourceKey}`,
      Key: destKey,
    })
  );
}

// ─── URL Helpers ────────────────────────────────────────────────────────────

/**
 * Get the public URL for an R2 object key (if public bucket is configured)
 */
export function getR2PublicUrl(key: string): string | null {
  if (!R2_PUBLIC_URL) return null;
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Get the best URL for serving an image.
 * Prefers public URL (CDN), falls back to signed URL, then to API proxy.
 */
export function getImageUrl(
  r2Key: string | null,
  variant: 'original' | 'thumbnail' | 'small' | 'medium' | 'large' = 'original',
  legacyFilePath?: string
): string {
  // If we have an R2 key, build the public or signed URL
  if (r2Key && isR2Configured()) {
    const variantKey = variant === 'original' ? r2Key : `${r2Key}/${variant}`;
    const publicUrl = getR2PublicUrl(variantKey);
    if (publicUrl) return publicUrl;
    // Fallback to API proxy that generates signed URLs
    return `/api/r2-image?key=${encodeURIComponent(variantKey)}`;
  }

  // Legacy: return the old filePath
  if (legacyFilePath) return legacyFilePath;

  return '';
}

/**
 * Generate a unique R2 key for an image asset
 */
export function generateR2Key(
  category: 'images' | 'digital-assets',
  recordId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${category}/${recordId}/${timestamp}_${random}_${safeName}`;
}
