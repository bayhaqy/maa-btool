'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  ZoomIn,
  CheckCircle2,
  Loader2,
  Cloud,
  AlertCircle,
  Link2,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface GridImageInfo {
  id: string;
  fileName: string;
  filePath: string;
  altText?: string | null;
  isPrimary: boolean;
  sortOrder: number;
  fileSize?: number;
  mimeType?: string;
  pending?: boolean;
  variants?: Record<string, string>;
  /** Storage type: 'r2', 'local', or 'url' */
  storageType?: string;
  /** R2 object key (if stored in R2) */
  r2Key?: string | null;
  /** Whether this image is from a record payload URL field */
  isPayloadUrl?: boolean;
}

/**
 * Determine the best thumbnail URL for an image, handling R2 signed URLs
 * and variant resolution. Falls back to filePath if no variants available.
 */
function resolveThumbnailUrl(img: GridImageInfo): string {
  // If we have a thumbnail variant, prefer it
  if (img.variants?.thumbnail) return img.variants.thumbnail;
  // If we have a small variant, use it
  if (img.variants?.small) return img.variants.small;
  // Otherwise use the full filePath (may be signed URL or local path)
  return img.filePath;
}

/**
 * Determine if a URL is an R2 signed URL
 */
function isR2SignedUrl(url: string): boolean {
  return url.includes('X-Amz-Signature') || url.includes('X-Amz-Credential') || url.includes('/api/r2-image');
}

interface GridImageCellProps {
  /** Images for this cell's field. */
  images: GridImageInfo[];
  /** Whether the record/row is editable. */
  editable: boolean;
  /** Whether this cell is currently active (focused). */
  isActive: boolean;
  /** Fired when the user wants to add images (deferred — NOT sent to server yet). */
  onAddPendingImages?: (files: FileList | File[]) => void;
  /** Fired when the user wants to delete an image (deferred). */
  onRemoveImage?: (imageId: string) => void;
  /** Fired when the user clicks the thumbnail / zoom button to open lightbox. */
  onOpenLightbox?: () => void;
  /** Fired when the user clicks the upload overlay button. */
  onOpenImageManager?: () => void;
  /** Show skeleton loading state. */
  loading?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export default function GridImageCell({
  images,
  editable,
  isActive,
  onAddPendingImages,
  onRemoveImage,
  onOpenLightbox,
  onOpenImageManager,
  loading,
}: GridImageCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const primary = images.find((i) => i.isPrimary);
  const imageCount = images.length;
  const pendingCount = images.filter((i) => i.pending).length;

  // Handle drag & drop
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    [editable]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!editable || !e.dataTransfer.files || e.dataTransfer.files.length === 0)
        return;
      onAddPendingImages?.(e.dataTransfer.files);
    },
    [editable, onAddPendingImages]
  );

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddPendingImages?.(e.target.files);
      e.target.value = '';
    }
  };

  // Delete with confirmation
  const handleDeleteClick = (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (showDeleteConfirm === imageId) {
      onRemoveImage?.(imageId);
      setShowDeleteConfirm(null);
    } else {
      setShowDeleteConfirm(imageId);
      // Auto-cancel after 2 seconds
      setTimeout(() => setShowDeleteConfirm(null), 2000);
    }
  };

  // Skeleton loading
  if (loading) {
    return (
      <div className="h-9 flex items-center gap-1 px-1.5">
        <div className="w-7 h-7 rounded bg-muted animate-pulse" />
        <div className="w-4 h-3 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'h-9 flex items-center gap-1 px-1.5 relative group/cell',
        isDragOver && 'bg-red-50 ring-2 ring-inset ring-red-300'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowDeleteConfirm(null);
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for inline upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Thumbnail (40x40 → scaled down to 28x28 for grid) */}
      <div className="relative flex-shrink-0">
        {primary ? (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onOpenLightbox?.();
            }}
            className={cn(
              'w-7 h-7 rounded border overflow-hidden p-0 transition-all',
              'border-border hover:ring-2 hover:ring-red-400 hover:border-red-400',
              'cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-red-400',
              imageError === primary.id && 'bg-muted'
            )}
            aria-label={`Enlarge ${primary.fileName || 'image'}`}
            tabIndex={-1}
          >
            {imageError === primary.id ? (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <AlertCircle className="w-3 h-3 text-muted-foreground/50" />
              </div>
            ) : (
              <img
                src={resolveThumbnailUrl(primary)}
                alt={primary.altText || primary.fileName}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const imgEl = e.target as HTMLImageElement;
                  if (imgEl.src !== primary.filePath && !imgEl.dataset.fallback) {
                    imgEl.dataset.fallback = '1';
                    imgEl.src = primary.filePath;
                  } else {
                    setImageError(primary.id);
                  }
                }}
              />
            )}
          </button>
        ) : (
          <div
            className={cn(
              'w-7 h-7 rounded border border-dashed border-muted-foreground/40',
              'flex items-center justify-center flex-shrink-0',
              editable && 'cursor-pointer hover:border-red-400 hover:bg-red-50/50'
            )}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              if (!editable) return;
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/50" />
          </div>
        )}

        {/* Primary checkmark */}
        {primary && primary.isPrimary && (
          <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-emerald-500 fill-emerald-500 stroke-white" />
        )}

        {/* R2 / URL indicator */}
        {primary && (primary.storageType === 'r2' || isR2SignedUrl(primary.filePath)) && (
          <Cloud className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-sky-500" />
        )}
        {primary && primary.isPayloadUrl && !isR2SignedUrl(primary.filePath) && (
          <Link2 className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-violet-500" />
        )}

        {/* Hover preview (120x120) */}
        <AnimatePresence>
          {isHovered && primary && imageError !== primary.id && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1 z-50 pointer-events-none"
            >
              <div className="w-[120px] h-[120px] rounded-lg border border-border shadow-xl overflow-hidden bg-white">
                <img
                  src={primary.variants?.small || primary.variants?.thumbnail || primary.filePath}
                  alt={primary.altText || primary.fileName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = '0.2';
                  }}
                />
              </div>
              {imageCount > 1 && (
                <div className="text-center text-[10px] text-muted-foreground mt-0.5">
                  {imageCount} images
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Image count badge */}
      {imageCount > 0 && (
        <Badge
          variant="secondary"
          className="h-4 min-w-[16px] px-1 text-[9px] font-medium tabular-nums flex-shrink-0"
        >
          {imageCount}
          {pendingCount > 0 && (
            <span className="text-amber-600 ml-0.5">+{pendingCount}</span>
          )}
        </Badge>
      )}

      {/* Hover action overlays — only visible on hover when editable */}
      <AnimatePresence>
        {editable && isHovered && images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-0.5 ml-auto flex-shrink-0"
          >
            {/* Zoom button */}
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onOpenLightbox?.();
              }}
              aria-label="Zoom image"
              tabIndex={-1}
            >
              <ZoomIn className="w-3 h-3" />
            </button>

            {/* Upload button */}
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onOpenImageManager?.();
              }}
              aria-label="Upload image"
              tabIndex={-1}
            >
              <Upload className="w-3 h-3" />
            </button>

            {/* Delete button (for primary) */}
            {primary && (
              <button
                type="button"
                className={cn(
                  'h-5 w-5 flex items-center justify-center rounded transition-colors',
                  showDeleteConfirm === primary.id
                    ? 'bg-red-100 text-red-600'
                    : 'hover:bg-accent text-muted-foreground hover:text-red-600'
                )}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => handleDeleteClick(e, primary.id)}
                aria-label={
                  showDeleteConfirm === primary.id
                    ? 'Confirm delete'
                    : 'Delete image'
                }
                title={
                  showDeleteConfirm === primary.id
                    ? 'Click again to confirm'
                    : 'Delete image'
                }
                tabIndex={-1}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload overlay on drag-over */}
      {editable && isDragOver && (
        <div className="absolute inset-0 bg-red-50/80 border-2 border-dashed border-red-400 rounded flex items-center justify-center z-20">
          <Upload className="w-3.5 h-3.5 text-red-600" />
          <span className="text-[10px] text-red-600 font-medium ml-1">Drop</span>
        </div>
      )}

      {/* Inline upload hint for empty cells */}
      {editable && isHovered && images.length === 0 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          type="button"
          className="h-5 px-1.5 flex items-center gap-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            fileInputRef.current?.click();
          }}
          aria-label="Upload image"
          tabIndex={-1}
        >
          <Upload className="w-3 h-3" />
          <span className="text-[9px]">Add</span>
        </motion.button>
      )}
    </div>
  );
}
