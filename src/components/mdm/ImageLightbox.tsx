'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  RotateCw,
  Info,
  Maximize2,
  Minimize2,
  Trash2,
  Star,
  Maximize,
  Shrink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface LightboxImage {
  id: string;
  fileName: string;
  filePath: string;
  altText?: string | null;
  isPrimary: boolean;
  sortOrder: number;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  createdAt?: string;
  pending?: boolean;
  variants?: Record<string, string>;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
  onDelete?: (imageId: string) => void;
  onSetPrimary?: (imageId: string) => void;
  onRotate?: (imageId: string, degrees: number) => void;
  token?: string | null;
}

// ============================================================================
// Helper: format file size
// ============================================================================

function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Component
// ============================================================================

export default function ImageLightbox({
  images,
  initialIndex = 0,
  open,
  onClose,
  onDelete,
  onSetPrimary,
  onRotate,
  token,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];

  // Reset zoom/pan/rotation when changing images
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, [currentIndex]);

  // Reset when lightbox opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);
      setShowInfo(false);
      setIsFullscreen(false);
    }
  }, [open, initialIndex]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
          } else {
            onClose();
          }
          break;
        case 'ArrowLeft':
          if (images.length > 1) {
            setCurrentIndex((i) => (i - 1 + images.length) % images.length);
          }
          break;
        case 'ArrowRight':
          if (images.length > 1) {
            setCurrentIndex((i) => (i + 1) % images.length);
          }
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          handleFitToScreen();
          break;
        case '1':
          handleMaximize();
          break;
        case 'r':
          handleRotateCW();
          break;
        case 'R':
          handleRotateCCW();
          break;
        case 'i':
          setShowInfo((v) => !v);
          break;
        case 'f':
          handleToggleFullscreen();
          break;
        case 'Delete':
          if (onDelete && currentImage && !currentImage.pending) {
            handleDelete();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, images.length, onClose, isFullscreen, currentImage, onDelete]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom((prev) => Math.min(8, Math.max(0.5, prev + delta * prev)));
    },
    []
  );

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(8, prev * 1.3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = prev / 1.3;
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      return next;
    });
  }, []);

  const handleFitToScreen = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleMaximize = useCallback(() => {
    setZoom(2);
    setPan({ x: 0, y: 0 });
  }, []);

  // Rotate handlers
  const handleRotateCW = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleRotateCCW = useCallback(() => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  }, []);

  const handleResetRotation = useCallback(() => {
    setRotation(0);
  }, []);

  // Server-side rotate (calls API)
  const handleServerRotate = useCallback(async (degrees: number) => {
    if (!token || !currentImage || currentImage.pending || isRotating) return;
    setIsRotating(true);
    try {
      const res = await fetch(`/api/images/${currentImage.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'rotate', degrees }),
      });
      if (res.ok) {
        toast.success(`Image rotated ${degrees > 0 ? 'clockwise' : 'counter-clockwise'}`);
        if (onRotate) onRotate(currentImage.id, degrees);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to rotate image');
        // Revert local rotation on failure
        setRotation((prev) => (prev - degrees + 360) % 360);
      }
    } catch {
      toast.error('Network error during rotation');
      setRotation((prev) => (prev - degrees + 360) % 360);
    } finally {
      setIsRotating(false);
    }
  }, [token, currentImage, isRotating, onRotate]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!currentImage) return;

    if (currentImage.pending) {
      // Pending image: just call the onDelete callback
      if (onDelete) onDelete(currentImage.id);
      // Navigate away if possible
      if (images.length > 1) {
        setCurrentIndex((i) => {
          const next = i >= images.length - 1 ? i - 1 : i;
          return Math.max(0, next);
        });
      }
      return;
    }

    if (!token || isDeleting) return;

    // Confirm deletion
    const confirmed = window.confirm(`Delete "${currentImage.fileName}"? This action cannot be undone.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/images/${currentImage.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Image deleted');
        if (onDelete) onDelete(currentImage.id);
        // Navigate to next image or close
        if (images.length <= 1) {
          onClose();
        } else {
          setCurrentIndex((i) => {
            const next = i >= images.length - 1 ? i - 1 : i;
            return Math.max(0, next);
          });
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete image');
      }
    } catch {
      toast.error('Network error during deletion');
    } finally {
      setIsDeleting(false);
    }
  }, [currentImage, token, isDeleting, onDelete, images.length, onClose]);

  // Set primary handler
  const handleSetPrimary = useCallback(async () => {
    if (!currentImage || currentImage.pending) return;
    if (currentImage.isPrimary) {
      toast.info('This image is already the primary image');
      return;
    }
    if (onSetPrimary) {
      onSetPrimary(currentImage.id);
      return;
    }
    // Fallback: call API directly
    if (!token) return;
    try {
      const res = await fetch(`/api/images/${currentImage.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'setPrimary' }),
      });
      if (res.ok) {
        toast.success('Set as primary image');
      } else {
        toast.error('Failed to set primary image');
      }
    } catch {
      toast.error('Network error');
    }
  }, [currentImage, token, onSetPrimary]);

  // Fullscreen toggle
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Download handler
  const handleDownload = useCallback(() => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.href = currentImage.variants?.large || currentImage.filePath;
    link.download = currentImage.fileName || 'image';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentImage]);

  // Get the best image URL for lightbox display
  const getImageUrl = (img: LightboxImage) => {
    return img.variants?.large || img.variants?.medium || img.filePath;
  };

  // Combine zoom + rotation transform
  const imageTransform = `scale(${zoom}) rotate(${rotation}deg)`;

  if (!open || images.length === 0) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'fixed inset-0 z-50 bg-black/90 flex flex-col',
            isFullscreen && 'bg-black'
          )}
          onClick={(e) => {
            if (e.target === e.currentTarget && zoom <= 1) {
              onClose();
            }
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/60 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <span className="text-white/90 text-sm font-medium truncate max-w-[300px]">
                {currentImage?.fileName || 'Image'}
              </span>
              {images.length > 1 && (
                <Badge
                  variant="outline"
                  className="text-white/70 border-white/30 text-[11px]"
                >
                  {currentIndex + 1} / {images.length}
                </Badge>
              )}
              {currentImage?.isPrimary && (
                <Badge className="bg-emerald-600 text-white text-[10px] h-5 px-1.5 border-0">
                  <Star className="w-3 h-3 mr-0.5 fill-white" /> Primary
                </Badge>
              )}
              {currentImage?.pending && (
                <Badge className="bg-amber-500 text-white text-[10px] h-5 px-1.5 border-0">
                  Pending Upload
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {/* Zoom controls */}
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                title="Zoom out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-white/70 text-xs w-14 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={handleZoomIn}
                disabled={zoom >= 8}
                title="Zoom in (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={handleFitToScreen}
                title="Fit to screen (0)"
              >
                <Shrink className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={handleMaximize}
                title="Actual size (1)"
              >
                <Maximize className="w-4 h-4" />
              </Button>

              <div className="w-px h-5 bg-white/20 mx-1" />

              {/* Rotate controls */}
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={() => {
                  handleRotateCCW();
                  if (token && currentImage && !currentImage.pending) {
                    handleServerRotate(-90);
                  }
                }}
                disabled={isRotating}
                title="Rotate 90° counter-clockwise (R)"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={() => {
                  handleRotateCW();
                  if (token && currentImage && !currentImage.pending) {
                    handleServerRotate(90);
                  }
                }}
                disabled={isRotating}
                title="Rotate 90° clockwise (r)"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
              {rotation !== 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/80 hover:text-white hover:bg-white/10 h-8 px-2 text-[10px]"
                  onClick={handleResetRotation}
                  title="Reset rotation"
                >
                  {rotation}°
                </Button>
              )}

              <div className="w-px h-5 bg-white/20 mx-1" />

              {/* Action buttons */}
              {onSetPrimary && !currentImage?.isPrimary && !currentImage?.pending && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/80 hover:text-amber-400 hover:bg-white/10 h-8 w-8 p-0"
                  onClick={handleSetPrimary}
                  title="Set as primary image"
                >
                  <Star className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={() => setShowInfo((v) => !v)}
                title="Image info (I)"
              >
                <Info className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={handleDownload}
                title="Download"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={handleToggleFullscreen}
                title="Toggle fullscreen (F)"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/80 hover:text-red-400 hover:bg-white/10 h-8 w-8 p-0"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title="Delete image (Del)"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <div className="w-px h-5 bg-white/20 mx-1" />
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={onClose}
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Rotation indicator */}
          {isRotating && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
              <RotateCw className="w-4 h-4 animate-spin" />
              Rotating image...
            </div>
          )}

          {/* Main content area */}
          <div className="flex-1 relative overflow-hidden flex">
            {/* Image container */}
            <div
              className={cn(
                'flex-1 flex items-center justify-center relative',
                zoom > 1 ? 'cursor-grab' : 'cursor-default',
                isDragging && 'cursor-grabbing'
              )}
              onWheel={handleWheel}
              onMouseDown={(e) => {
                if (zoom <= 1) return;
                e.preventDefault();
                setIsDragging(true);
                setIsPanning(true);
                panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
              }}
              onMouseMove={(e) => {
                if (!isPanning) return;
                const dx = e.clientX - panStart.current.x;
                const dy = e.clientY - panStart.current.y;
                setPan({
                  x: panStart.current.panX + dx,
                  y: panStart.current.panY + dy,
                });
              }}
              onMouseUp={() => {
                setIsPanning(false);
                setIsDragging(false);
              }}
              onMouseLeave={() => {
                setIsPanning(false);
                setIsDragging(false);
              }}
            >
              {currentImage && (
                <motion.img
                  key={currentImage.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    x: pan.x,
                    y: pan.y,
                  }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  src={getImageUrl(currentImage)}
                  alt={currentImage.altText || currentImage.fileName || 'Image'}
                  className="max-w-full max-h-full object-contain select-none"
                  style={{
                    transform: imageTransform,
                    transformOrigin: 'center center',
                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                  }}
                  draggable={false}
                  onError={(e) => {
                    const imgEl = e.target as HTMLImageElement;
                    if (imgEl.src !== currentImage.filePath) {
                      imgEl.src = currentImage.filePath;
                    } else {
                      imgEl.style.opacity = '0.2';
                    }
                  }}
                />
              )}

              {/* Navigation arrows */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIndex(
                        (i) => (i - 1 + images.length) % images.length
                      );
                    }}
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIndex((i) => (i + 1) % images.length);
                    }}
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Info panel (slides in from right) */}
            <AnimatePresence>
              {showInfo && currentImage && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 280, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-black/70 backdrop-blur-sm border-l border-white/10 overflow-hidden flex-shrink-0"
                >
                  <div className="p-4 space-y-4 w-[280px]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-semibold text-sm">
                        Image Details
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white/60 hover:text-white hover:bg-white/10 h-6 w-6 p-0"
                        onClick={() => setShowInfo(false)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Thumbnail preview */}
                    <div className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
                      <img
                        src={
                          currentImage.variants?.small ||
                          currentImage.variants?.thumbnail ||
                          currentImage.filePath
                        }
                        alt={currentImage.altText || 'Preview'}
                        className="w-full h-40 object-cover"
                        style={{ transform: `rotate(${rotation}deg)` }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.opacity = '0.2';
                        }}
                      />
                    </div>

                    {/* Metadata */}
                    <div className="space-y-2.5">
                      <InfoRow
                        label="Filename"
                        value={currentImage.fileName || '-'}
                      />
                      <InfoRow
                        label="File Size"
                        value={formatFileSize(currentImage.fileSize)}
                      />
                      <InfoRow
                        label="MIME Type"
                        value={currentImage.mimeType || '-'}
                      />
                      <InfoRow
                        label="Dimensions"
                        value={
                          currentImage.width && currentImage.height
                            ? `${currentImage.width} × ${currentImage.height}`
                            : 'Unknown'
                        }
                      />
                      <InfoRow
                        label="Alt Text"
                        value={currentImage.altText || '-'}
                      />
                      <InfoRow
                        label="Sort Order"
                        value={String(currentImage.sortOrder)}
                      />
                      <InfoRow
                        label="Primary"
                        value={currentImage.isPrimary ? 'Yes' : 'No'}
                      />
                      <InfoRow
                        label="Rotation"
                        value={rotation !== 0 ? `${rotation}°` : '0° (none)'}
                      />
                      <InfoRow
                        label="Zoom"
                        value={`${Math.round(zoom * 100)}%`}
                      />
                      <InfoRow
                        label="Uploaded"
                        value={
                          currentImage.createdAt
                            ? new Date(
                                currentImage.createdAt
                              ).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'
                        }
                      />
                    </div>

                    {/* Quick actions */}
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Actions</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-white/70 hover:text-white hover:bg-white/10 h-8 text-xs gap-1.5 justify-start"
                          onClick={handleDownload}
                        >
                          <Download className="w-3 h-3" /> Download
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-white/70 hover:text-white hover:bg-white/10 h-8 text-xs gap-1.5 justify-start"
                          onClick={handleToggleFullscreen}
                        >
                          {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                          {isFullscreen ? 'Exit FS' : 'Fullscreen'}
                        </Button>
                        {!currentImage.isPrimary && !currentImage.pending && onSetPrimary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white/70 hover:text-amber-400 hover:bg-white/10 h-8 text-xs gap-1.5 justify-start"
                            onClick={handleSetPrimary}
                          >
                            <Star className="w-3 h-3" /> Set Primary
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white/70 hover:text-red-400 hover:bg-white/10 h-8 text-xs gap-1.5 justify-start"
                            onClick={handleDelete}
                            disabled={isDeleting}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Keyboard shortcuts */}
                    <div className="space-y-1.5 pt-2 border-t border-white/10">
                      <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Shortcuts</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <ShortcutRow label="Zoom in" shortcut="+" />
                        <ShortcutRow label="Zoom out" shortcut="-" />
                        <ShortcutRow label="Fit screen" shortcut="0" />
                        <ShortcutRow label="Actual size" shortcut="1" />
                        <ShortcutRow label="Rotate CW" shortcut="r" />
                        <ShortcutRow label="Rotate CCW" shortcut="R" />
                        <ShortcutRow label="Info panel" shortcut="I" />
                        <ShortcutRow label="Fullscreen" shortcut="F" />
                        <ShortcutRow label="Navigate" shortcut="←→" />
                        <ShortcutRow label="Delete" shortcut="Del" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom thumbnail strip */}
          {images.length > 1 && (
            <div className="bg-black/60 backdrop-blur-sm px-4 py-2 flex items-center justify-center gap-2 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    'flex-shrink-0 w-12 h-12 rounded border-2 overflow-hidden transition-all relative',
                    idx === currentIndex
                      ? 'border-white ring-2 ring-white/30 scale-110'
                      : 'border-white/20 opacity-50 hover:opacity-80 hover:border-white/40'
                  )}
                >
                  <img
                    src={img.variants?.thumbnail || img.filePath}
                    alt={img.altText || img.fileName || 'Thumbnail'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '0.2';
                    }}
                  />
                  {img.isPrimary && (
                    <Star className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-white/50 text-xs w-20 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-white/90 text-xs break-all">{value}</span>
    </div>
  );
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <>
      <span className="text-white/40">{label}</span>
      <span className="text-white/70 font-mono text-right">{shortcut}</span>
    </>
  );
}
