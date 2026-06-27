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
  Info,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];

  // Reset zoom/pan when changing images
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [currentIndex]);

  // Reset when lightbox opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setShowInfo(false);
    }
  }, [open, initialIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
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
          setZoom(1);
          setPan({ x: 0, y: 0 });
          break;
        case 'i':
          setShowInfo((v) => !v);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, images.length, onClose]);

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

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Pan/drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({
        x: panStart.current.panX + dx,
        y: panStart.current.panY + dy,
      });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
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

  if (!open || images.length === 0) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={(e) => {
            // Close only if clicking on the background (not the image or controls)
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
                  Primary
                </Badge>
              )}
              {currentImage?.pending && (
                <Badge className="bg-amber-500 text-white text-[10px] h-5 px-1.5 border-0">
                  Pending Upload
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
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
                onClick={handleResetZoom}
                title="Reset zoom (0)"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
                onClick={() => setZoom(2)}
                title="Fit to screen"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
              <div className="w-px h-5 bg-white/20 mx-1" />
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

          {/* Main content area */}
          <div className="flex-1 relative overflow-hidden flex">
            {/* Image container */}
            <div
              ref={containerRef}
              className={cn(
                'flex-1 flex items-center justify-center relative',
                zoom > 1 ? 'cursor-grab' : 'cursor-default',
                isDragging && 'cursor-grabbing'
              )}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
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
                    transform: `scale(${zoom})`,
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
                    'flex-shrink-0 w-12 h-12 rounded border-2 overflow-hidden transition-all',
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
// Info row sub-component
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
