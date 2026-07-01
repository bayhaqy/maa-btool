// ============================================================================
// r2.ts — Cloudflare R2 Storage Client (S3-compatible API)
//
// Provides upload, download, signed URL, delete, and variant generation
// for the MAA BTOOL MDM platform's Digital Asset Management.
//
// Architecture:
//   - Config source: AppSettings DB → env vars (database takes priority)
//   - Production: All images/digital assets stored in Cloudflare R2
//   - Legacy: Falls back to FileAsset DB storage for unmigrated assets
//   - Pre-signed URLs: Secure access with configurable expiry
//   - Variant support: Auto-generates thumbnail/small/medium/large variants
//
// IMPORTANT: Heavy imports (sharp, @aws-sdk/client-s3) are loaded lazily
// to reduce memory pressure. This is critical in constrained environments
// (e.g., sandbox with ~1.3GB RAM limit) where eager loading causes OOM.
// ============================================================================

// ─── Lazy-loaded heavy dependencies ────────────────────────────────────────
// These are NOT imported at module level to avoid loading ~50MB of native
// code (sharp) and AWS SDK into memory on every server cold-start.

type SharpModule = typeof import('sharp');
type S3Module = typeof import('@aws-sdk/client-s3');
type PresignerModule = typeof import('@aws-sdk/s3-request-presigner');

let _sharp: SharpModule | null = null;
let _s3: S3Module | null = null;
let _presigner: PresignerModule | null = null;

async function loadSharp(): Promise<SharpModule> {
  if (!_sharp) {
    _sharp = await import('sharp');
  }
  return _sharp;
}

async function loadS3(): Promise<S3Module> {
  if (!_s3) {
    _s3 = await import('@aws-sdk/client-s3');
  }
  return _s3;
}

async function loadPresigner(): Promise<PresignerModule> {
  if (!_presigner) {
    _presigner = await import('@aws-sdk/s3-request-presigner');
  }
  return _presigner;
}

// ─── R2 Configuration (loaded from DB or env vars) ──────────────────────────

interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

/** Cached R2 config — initialized from env vars, then overridden by DB values */
let _r2Config: R2Config = {
  endpoint: process.env.R2_ENDPOINT || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || 'maa-btool',
  publicUrl: process.env.R2_PUBLIC_URL || '',
};

// S3Client type from the lazy-loaded module — use `any` for the cached
// instance since we don't have the concrete type at module level.
let _r2Client: any = null;
let _configLoaded = false;
let _configLoading: Promise<void> | null = null;

/**
 * Ensure R2 config is loaded from AppSettings database.
 * Database values take priority over environment variables.
 * Safe to call multiple times — only loads once.
 */
export async function ensureR2Config(): Promise<void> {
  if (_configLoaded) return;

  // Deduplicate concurrent calls
  if (_configLoading) return _configLoading;

  _configLoading = (async () => {
    try {
      const { db } = await import('@/lib/db');
      const settings = await db.appSettings.findMany({
        where: {
          settingKey: {
            in: ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'],
          },
        },
      });

      if (settings.length > 0) {
        const configMap = Object.fromEntries(settings.map((s) => [s.settingKey, s.settingValue]));

        // DB values override env vars
        if (configMap.R2_ENDPOINT) _r2Config.endpoint = configMap.R2_ENDPOINT;
        if (configMap.R2_ACCESS_KEY_ID) _r2Config.accessKeyId = configMap.R2_ACCESS_KEY_ID;
        if (configMap.R2_SECRET_ACCESS_KEY) _r2Config.secretAccessKey = configMap.R2_SECRET_ACCESS_KEY;
        if (configMap.R2_BUCKET) _r2Config.bucket = configMap.R2_BUCKET;
        if (configMap.R2_PUBLIC_URL !== undefined) _r2Config.publicUrl = configMap.R2_PUBLIC_URL;

        console.log('[R2] Config loaded from AppSettings database');
      }
    } catch (err) {
      console.warn('[R2] Failed to load config from database (using env vars):', err instanceof Error ? err.message : err);
    } finally {
      _configLoaded = true;
      _configLoading = null;
    }
  })();

  return _configLoading;
}

/**
 * Force reload R2 config (e.g., after updating settings via admin API)
 */
export async function reloadR2Config(): Promise<R2Config> {
  _configLoaded = false;
  _r2Client = null;
  await ensureR2Config();
  return { ..._r2Config };
}

/**
 * Get current R2 config (for display/diagnostic purposes)
 */
export function getR2ConfigInfo(): R2Config {
  return { ..._r2Config };
}

/**
 * Check if R2 is configured (has endpoint + credentials).
 * IMPORTANT: Call `await ensureR2Config()` before this to ensure DB config is loaded.
 */
export function isR2Configured(): boolean {
  return !!(_r2Config.endpoint && _r2Config.accessKeyId && _r2Config.secretAccessKey);
}

/**
 * Get or create the R2 S3 client singleton.
 * IMPORTANT: Call `await ensureR2Config()` before this to ensure DB config is loaded.
 */
async function getR2Client() {
  if (!_r2Client) {
    if (!isR2Configured()) {
      throw new Error('R2 storage is not configured. Set R2 credentials in AppSettings or environment variables.');
    }
    const { S3Client } = await loadS3();
    _r2Client = new S3Client({
      region: 'auto',
      endpoint: _r2Config.endpoint,
      credentials: {
        accessKeyId: _r2Config.accessKeyId,
        secretAccessKey: _r2Config.secretAccessKey,
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
  const client = await getR2Client();
  const { PutObjectCommand } = await loadS3();
  const cacheControl = options?.cacheControl ?? 'public, max-age=31536000, immutable';

  // S3 metadata values must be ASCII-only. Sanitize any non-ASCII chars.
  const safeMetadata: Record<string, string> | undefined = options?.metadata
    ? Object.fromEntries(
        Object.entries(options.metadata).map(([k, v]) => [
          String(k).replace(/[^a-zA-Z0-9._-]/g, '_'),
          String(v).replace(/[^\x20-\x7E]/g, '_'),  // Only printable ASCII
        ])
      )
    : undefined;

  await client.send(
    new PutObjectCommand({
      Bucket: _r2Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: cacheControl,
      Metadata: safeMetadata,
    })
  );

  return {
    key,
    bucket: _r2Config.bucket,
    size: buffer.length,
    mimeType,
    publicUrl: _r2Config.publicUrl ? `${_r2Config.publicUrl}/${key}` : undefined,
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
  const sharp = await loadSharp();

  // Generate and upload variants in parallel
  await Promise.all(
    VARIANT_CONFIGS.map(async (cfg) => {
      try {
        let chain = sharp.default(buffer, { failOnError: false }).resize(cfg.width, cfg.height, {
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
  const client = await getR2Client();
  const { GetObjectCommand } = await loadS3();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: _r2Config.bucket,
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
  const client = await getR2Client();
  const { GetObjectCommand } = await loadS3();
  const { getSignedUrl } = await loadPresigner();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: _r2Config.bucket,
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
  const client = await getR2Client();
  const { PutObjectCommand } = await loadS3();
  const { getSignedUrl } = await loadPresigner();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: _r2Config.bucket,
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
  const client = await getR2Client();
  const { DeleteObjectCommand } = await loadS3();
  await client.send(
    new DeleteObjectCommand({
      Bucket: _r2Config.bucket,
      Key: key,
    })
  );
}

/**
 * Delete a file and all its variants from R2
 */
export async function deleteWithVariants(baseKey: string): Promise<void> {
  const client = await getR2Client();
  const { DeleteObjectCommand } = await loadS3();
  const keysToDelete = [
    `${baseKey}/original`,
    ...VARIANT_CONFIGS.map((v) => `${baseKey}/${v.variant}`),
  ];

  await Promise.all(
    keysToDelete.map((key) =>
      client
        .send(new DeleteObjectCommand({ Bucket: _r2Config.bucket, Key: key }))
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
    const client = await getR2Client();
    const { HeadObjectCommand } = await loadS3();
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: _r2Config.bucket,
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
  const client = await getR2Client();
  const { ListObjectsV2Command } = await loadS3();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: _r2Config.bucket,
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
  const client = await getR2Client();
  const { CopyObjectCommand } = await loadS3();
  await client.send(
    new CopyObjectCommand({
      Bucket: _r2Config.bucket,
      CopySource: `${_r2Config.bucket}/${sourceKey}`,
      Key: destKey,
    })
  );
}

// ─── URL Helpers ────────────────────────────────────────────────────────────

/**
 * Get the public URL for an R2 object key (if public bucket is configured)
 */
export function getR2PublicUrl(key: string): string | null {
  if (!_r2Config.publicUrl) return null;
  return `${_r2Config.publicUrl}/${key}`;
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
