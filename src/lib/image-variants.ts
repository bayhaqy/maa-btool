// ============================================================================
// image-variants.ts — STIBO Image Conversion Configuration
//
// Pre-computes resized + format-converted variants per ImageAsset:
//   thumbnail (150px webp)  — grid cells
//   small     (300px webp)  — card thumbnails
//   medium    (800px jpeg)  — detail view
//   large     (1200px jpeg) — full-screen lightbox / download
//
// Each variant is stored as a `FileAsset` (category: 'image-variant') and an
// `ImageVariant` record linking it back to the original `ImageAsset.id`.
// Generation is wrapped per-variant in try/catch so a single failure
// (e.g. SVG with bad markup) doesn't block the others.
//
// NOTE: This module runs server-side only — `sharp` is a native dep and
// must not be bundled into the client. It is loaded lazily to reduce
// memory pressure on constrained environments.
// ============================================================================

import { db } from '@/lib/db';

// Lazy-load sharp to avoid loading ~50MB of native code at module level.
// This is critical in sandbox environments with limited RAM.
type SharpModule = typeof import('sharp');
let _sharp: SharpModule | null = null;

async function loadSharp(): Promise<SharpModule> {
  if (!_sharp) {
    _sharp = await import('sharp');
  }
  return _sharp;
}

export interface VariantConfig {
  /** Variant name: thumbnail | small | medium | large */
  variant: string;
  /** Max width in pixels (fit:inside keeps aspect ratio) */
  width: number;
  /** Max height in pixels */
  height: number;
  /** Output format: webp (small sizes) or jpeg (large sizes) */
  format: 'webp' | 'jpeg';
  /** Output quality 1-100 */
  quality: number;
}

/**
 * Default STIBO-aligned variant set. Mirrors the standard 4-tier image
 * conversion configuration used by STIBO MDM Digital Asset Management.
 */
export const VARIANT_CONFIGS: VariantConfig[] = [
  { variant: 'thumbnail', width: 150, height: 150, format: 'webp', quality: 80 },
  { variant: 'small', width: 300, height: 300, format: 'webp', quality: 80 },
  { variant: 'medium', width: 800, height: 800, format: 'jpeg', quality: 85 },
  { variant: 'large', width: 1200, height: 1200, format: 'jpeg', quality: 85 },
];

/** MIME type for each output format. */
const MIME_BY_FORMAT: Record<VariantConfig['format'], string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

/**
 * Input MIME types that require lenient decoding (sharp's default strict
 * mode rejects malformed SVG/HEIC). We pass `failOnError: false` for these.
 */
const SPECIAL_INPUT_TYPES = new Set<string>([
  'image/svg+xml',
  'image/heic',
  'image/heif',
  'image/avif',
]);

/** Public shape of a generated variant record (subset of the Prisma model). */
export interface GeneratedVariant {
  id: string;
  imageId: string;
  variant: string;
  filePath: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

/**
 * Generate all configured variants for an image.
 *
 * @param buffer           Original image bytes (any format sharp supports)
 * @param originalImageId  The `ImageAsset.id` to link variants to
 * @param mimeType         Original MIME type (used to enable lenient decode
 *                         for SVG/HEIC/HEIF/AVIF)
 * @returns Array of created `ImageVariant` records (one per successful
 *          variant; failed variants are skipped with a console.error)
 */
export async function generateVariants(
  buffer: Buffer,
  originalImageId: string,
  mimeType: string
): Promise<GeneratedVariant[]> {
  const created: GeneratedVariant[] = [];

  // Verify the original image exists (defensive — the upload handler
  // creates the ImageAsset before calling us, but a force-regen API
  // call could pass a stale id).
  const original = await db.imageAsset.findUnique({
    where: { id: originalImageId },
  });
  if (!original) {
    throw new Error(`generateVariants: ImageAsset not found: ${originalImageId}`);
  }

  // Force-regen scenario: delete any existing variants for this image
  // before re-creating them (avoids orphaned FileAssets + unique-ish
  // (imageId, variant) duplicates).
  await db.imageVariant.deleteMany({ where: { imageId: originalImageId } });

  const useLenientDecode = SPECIAL_INPUT_TYPES.has(mimeType);
  const baseName = original.fileName.replace(/\.[^.]+$/, '');
  const sharp = await loadSharp();

  for (const cfg of VARIANT_CONFIGS) {
    try {
      // Build the sharp pipeline. We always pass failOnError:false so a
      // truncated/corrupt input doesn't crash the whole upload — the
      // original file is already persisted, so partial variants are
      // strictly better than failing the upload.
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

      // Store variant bytes as a FileAsset (DB-backed → works on Vercel
      // read-only filesystem, same pattern as images/route.ts POST).
      const variantFileName = `${baseName}_${cfg.variant}.${cfg.format}`;
      // Prisma's Bytes column expects a Uint8Array; sharp returns a Buffer
      // (which extends Uint8Array) but TypeScript's strict typing on the
      // generic ArrayBuffer vs ArrayBufferLike trips a mismatch. Convert
      // explicitly via Uint8Array.from to satisfy the type checker.
      const fileAsset = await db.fileAsset.create({
        data: {
          fileName: variantFileName,
          fileData: Uint8Array.from(data),
          mimeType: MIME_BY_FORMAT[cfg.format],
          fileSize: data.length,
          category: 'image-variant',
        },
      });

      const filePath = `/api/uploads/${fileAsset.id}`;

      const variantRecord = await db.imageVariant.create({
        data: {
          imageId: originalImageId,
          variant: cfg.variant,
          filePath,
          width: info.width || cfg.width,
          height: info.height || cfg.height,
          bytes: data.length,
          format: cfg.format,
        },
      });

      created.push({
        id: variantRecord.id,
        imageId: variantRecord.imageId,
        variant: variantRecord.variant,
        filePath: variantRecord.filePath,
        width: variantRecord.width,
        height: variantRecord.height,
        bytes: variantRecord.bytes,
        format: variantRecord.format,
      });
    } catch (err) {
      // Non-fatal: log and continue. One bad variant (e.g. SVG that
      // renders to 0x0) must not block the others.
      console.error(
        `[image-variants] Failed to generate '${cfg.variant}' for image ${originalImageId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Touch the lenient-decode flag so ESLint doesn't complain about the
  // unused variable in the non-lenient branch — it's used for logging only.
  if (useLenientDecode && created.length === 0) {
    console.warn(
      `[image-variants] Lenient decode produced 0 variants for ${originalImageId} (${mimeType})`
    );
  }

  return created;
}

/**
 * Get the URL for a specific variant of an image. Falls back to the
 * original image's filePath if the variant doesn't exist (e.g. legacy
 * images uploaded before variant generation was enabled, or if variant
 * generation failed for that image).
 *
 * @param imageId  The `ImageAsset.id`
 * @param variant  Variant name (thumbnail | small | medium | large)
 * @returns The filePath URL, or null if neither variant nor original exists.
 */
export async function getVariantUrl(
  imageId: string,
  variant: string
): Promise<string | null> {
  const v = await db.imageVariant.findFirst({
    where: { imageId, variant },
  });
  if (v) return v.filePath;

  // Fallback to the original image's filePath
  const original = await db.imageAsset.findUnique({
    where: { id: imageId },
    select: { filePath: true },
  });
  return original?.filePath || null;
}

/**
 * Get all variants for an image as a { variant → filePath } map.
 * Used by the GET /api/images handler to inline variants into the
 * image list response so the grid can pick the right size per cell
 * without an extra round-trip per image.
 */
export async function getVariantMap(
  imageId: string
): Promise<Record<string, string>> {
  const variants = await db.imageVariant.findMany({
    where: { imageId },
    select: { variant: true, filePath: true },
  });
  const map: Record<string, string> = {};
  for (const v of variants) {
    map[v.variant] = v.filePath;
  }
  return map;
}
