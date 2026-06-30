'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { parsePayload } from '@/lib/parse-payload';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  Search,
  Upload,
  Grid3X3,
  List,
  Filter,
  X,
  MoreVertical,
  Trash2,
  Edit3,
  Download,
  Eye,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Table2,
  Presentation,
  File,
  CheckSquare,
  Square,
  ChevronDown,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Globe,
  Archive,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  Maximize2,
  Tag,
  FolderOpen,
  Calendar,
  Copyright,
  Loader2,
  SlidersHorizontal,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import ImageLightbox, { type LightboxImage } from '@/components/mdm/ImageLightbox';

// ============================================================================
// Types
// ============================================================================

interface DigitalAssetVariant {
  id: string;
  variant: string;
  filePath: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

interface DigitalAsset {
  id: string;
  companyId: string;
  recordId: string | null;
  assetType: string;
  fileName: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  title: string | null;
  description: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  dpi: number | null;
  colorSpace: string | null;
  duration: number | null;
  frameRate: number | null;
  pageCount: number | null;
  status: string;
  tags: string | null;
  category: string | null;
  validFrom: string | null;
  validTo: string | null;
  rightsInfo: string | null;
  uploadedById: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  variants: DigitalAssetVariant[];
  uploader?: { id: string; displayName: string | null; username: string } | null;
  metadata?: Array<{ id: string; metaKey: string; metaValue: string }>;
}

interface AssetFilters {
  search: string;
  assetType: string;
  status: string;
  category: string;
  tags: string;
}

const ASSET_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  IMAGE: { label: 'Image', icon: ImageIcon, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  VIDEO: { label: 'Video', icon: Video, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  AUDIO: { label: 'Audio', icon: Music, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  DOCUMENT: { label: 'Document', icon: FileText, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  SPREADSHEET: { label: 'Spreadsheet', icon: Table2, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  PRESENTATION: { label: 'Presentation', icon: Presentation, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  OTHER: { label: 'Other', icon: File, color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700', icon: Edit3 },
  IN_REVIEW: { label: 'In Review', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: ShieldCheck },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: XCircle },
  PUBLISHED: { label: 'Published', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: Globe },
  ARCHIVED: { label: 'Archived', color: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', icon: Archive },
};

// ============================================================================
// Helpers
// ============================================================================

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  try {
    const parsed = JSON.parse(tagsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getVariantMap(variants: DigitalAssetVariant[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of variants) {
    map[v.variant] = v.filePath;
  }
  return map;
}

function getThumbnailUrl(asset: DigitalAsset): string {
  const vMap = getVariantMap(asset.variants);
  if (asset.assetType === 'IMAGE') {
    return vMap.thumbnail || vMap.small || asset.filePath;
  }
  return asset.filePath;
}

function isImageAsset(asset: DigitalAsset): boolean {
  return asset.assetType === 'IMAGE';
}

// ============================================================================
// Main Component
// ============================================================================

export default function DigitalAssetPage() {
  const { token } = useAppStore();
  const { theme } = useTheme();
  const perms = usePermissions();

  // Data state
  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 24;

  // Filters
  const [filters, setFilters] = useState<AssetFilters>({
    search: '',
    assetType: '',
    status: '',
    category: '',
    tags: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Upload
  const [uploading, setUploading] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit dialog
  const [editAsset, setEditAsset] = useState<DigitalAsset | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Detail dialog
  const [detailAsset, setDetailAsset] = useState<DigitalAsset | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; single?: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Bulk status dialog
  const [bulkStatusDialog, setBulkStatusDialog] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState('');

  // Rotation tracking for lightbox (not persisted, just UI)
  const [rotations, setRotations] = useState<Record<string, number>>({});

  // ============================================================================
  // Fetch assets
  // ============================================================================

  const fetchAssets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (filters.search) params.set('search', filters.search);
      if (filters.assetType) params.set('assetType', filters.assetType);
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      if (filters.tags) params.set('tags', filters.tags);

      const res = await fetch(`/api/digital-assets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch assets');
      const data = await res.json();
      setAssets(data.assets || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
      if (data.categories) setCategories(data.categories);
    } catch (err) {
      console.error('Fetch assets error:', err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [token, page, filters]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [filters]);

  // ============================================================================
  // Upload handlers
  // ============================================================================

  const handleUpload = async (files: FileList | File[]) => {
    if (!token || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('status', 'DRAFT');

        const res = await fetch('/api/digital-assets', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          console.error('Upload failed:', err.error);
        }
      }
      await fetchAssets();
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      setShowUploadZone(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }, [token]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // ============================================================================
  // Delete handlers
  // ============================================================================

  const handleDelete = async (ids: string[]) => {
    if (!token) return;
    setDeleting(true);
    try {
      for (const id of ids) {
        await fetch(`/api/digital-assets/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      await fetchAssets();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // ============================================================================
  // Bulk status change
  // ============================================================================

  const handleBulkStatusChange = async () => {
    if (!token || selectedIds.size === 0 || !bulkStatusValue) return;
    try {
      await fetch('/api/digital-assets', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedIds),
          action: 'updateStatus',
          data: { status: bulkStatusValue },
        }),
      });
      setSelectedIds(new Set());
      setBulkStatusDialog(false);
      setBulkStatusValue('');
      await fetchAssets();
    } catch (err) {
      console.error('Bulk status error:', err);
    }
  };

  // ============================================================================
  // Update asset
  // ============================================================================

  const handleUpdateAsset = async () => {
    if (!token || !editAsset) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/digital-assets/${editAsset.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          altText: editForm.altText,
          category: editForm.category,
          tags: editForm.tags ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          status: editForm.status,
          validFrom: editForm.validFrom || null,
          validTo: editForm.validTo || null,
          rightsInfo: editForm.rightsInfo || null,
        }),
      });
      if (res.ok) {
        setEditAsset(null);
        await fetchAssets();
      }
    } catch (err) {
      console.error('Update error:', err);
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // Lightbox
  // ============================================================================

  const openLightbox = (asset: DigitalAsset) => {
    if (!isImageAsset(asset)) {
      setDetailAsset(asset);
      return;
    }
    const imageAssets = assets.filter(a => isImageAsset(a));
    const idx = imageAssets.findIndex(a => a.id === asset.id);
    const images: LightboxImage[] = imageAssets.map(a => {
      const vMap = getVariantMap(a.variants);
      return {
        id: a.id,
        fileName: a.originalFileName,
        filePath: a.filePath,
        altText: a.altText,
        isPrimary: a.isPrimary,
        sortOrder: a.sortOrder,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        width: a.width || undefined,
        height: a.height || undefined,
        createdAt: a.createdAt,
        variants: vMap,
      };
    });
    setLightboxImages(images);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  };

  // ============================================================================
  // Selection
  // ============================================================================

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assets.map(a => a.id)));
    }
  };

  // ============================================================================
  // Render: Upload Zone
  // ============================================================================

  const renderUploadZone = () => (
    <AnimatePresence>
      {showUploadZone && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200',
              dragOver
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-muted-foreground/25 hover:border-muted-foreground/40',
              uploading && 'pointer-events-none opacity-60'
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading files...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Drag and drop files here</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse &mdash; supports images, videos, audio, documents (max 50MB)
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="w-4 h-4 mr-1" /> Browse Files
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUpload(e.target.files);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ============================================================================
  // Render: Filter Sidebar
  // ============================================================================

  const renderFilters = () => (
    <AnimatePresence>
      {showFilters && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden flex-shrink-0"
        >
          <div className="w-[280px] border-r bg-card p-4 space-y-5 h-full">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Filters</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilters({ search: '', assetType: '', status: '', category: '', tags: '' })}
              >
                Clear all
              </Button>
            </div>

            {/* Asset Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Asset Type</Label>
              <Select
                value={filters.assetType}
                onValueChange={(v) => setFilters(f => ({ ...f, assetType: v === '__all__' ? '' : v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All types</SelectItem>
                  {Object.entries(ASSET_TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <cfg.icon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters(f => ({ ...f, status: v === '__all__' ? '' : v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <cfg.icon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Category</Label>
              <Select
                value={filters.category}
                onValueChange={(v) => setFilters(f => ({ ...f, category: v === '__all__' ? '' : v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</Label>
              <Input
                className="h-9 text-sm"
                placeholder="e.g. marketing, banner"
                value={filters.tags}
                onChange={(e) => setFilters(f => ({ ...f, tags: e.target.value }))}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ============================================================================
  // Render: Asset Card (Grid View)
  // ============================================================================

  const renderAssetCard = (asset: DigitalAsset) => {
    const typeConfig = ASSET_TYPE_CONFIG[asset.assetType] || ASSET_TYPE_CONFIG.OTHER;
    const statusConfig = STATUS_CONFIG[asset.status] || STATUS_CONFIG.DRAFT;
    const isSelected = selectedIds.has(asset.id);
    const tags = parseTags(asset.tags);
    const thumbnail = getThumbnailUrl(asset);

    return (
      <motion.div
        key={asset.id}
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'group relative rounded-xl border bg-card overflow-hidden transition-all duration-200',
          'hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5',
          isSelected && 'ring-2 ring-primary border-primary/50'
        )}
      >
        {/* Selection checkbox */}
        <div className="absolute top-2 left-2 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id); }}
            className={cn(
              'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-white/80 border-gray-300 hover:border-primary dark:bg-black/50 dark:border-gray-600'
            )}
          >
            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Thumbnail */}
        <div
          className="relative aspect-square bg-muted/50 cursor-pointer overflow-hidden"
          onClick={() => openLightbox(asset)}
        >
          {isImageAsset(asset) ? (
            <img
              src={thumbnail}
              alt={asset.altText || asset.title || asset.originalFileName}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = '0.15';
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center', typeConfig.color)}>
                <typeConfig.icon className="w-7 h-7" />
              </div>
              <span className="text-xs text-muted-foreground font-medium truncate max-w-[80%]">
                {asset.originalFileName}
              </span>
            </div>
          )}

          {/* Status badge */}
          <div className="absolute top-2 right-2">
            <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 border backdrop-blur-sm', statusConfig.color)}>
              <statusConfig.icon className="w-2.5 h-2.5 mr-0.5" />
              {statusConfig.label}
            </Badge>
          </div>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5">
              {isImageAsset(asset) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-full bg-white/90 hover:bg-white text-gray-900"
                        onClick={(e) => { e.stopPropagation(); openLightbox(asset); }}
                      >
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Preview</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full bg-white/90 hover:bg-white text-gray-900"
                      onClick={(e) => { e.stopPropagation(); setDetailAsset(asset); }}
                    >
                      <Info className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Details</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Card body */}
        <div className="p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium truncate flex-1" title={asset.title || asset.originalFileName}>
              {asset.title || asset.originalFileName}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setEditAsset(asset)}>
                  <Edit3 className="w-4 h-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDetailAsset(asset)}>
                  <Eye className="w-4 h-4 mr-2" /> View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const link = document.createElement('a');
                  const vMap = getVariantMap(asset.variants);
                  link.href = vMap.large || vMap.original || asset.filePath;
                  link.download = asset.originalFileName;
                  link.target = '_blank';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}>
                  <Download className="w-4 h-4 mr-2" /> Download
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => setDeleteConfirm({ ids: [asset.id], single: true })}
                  disabled={!perms.canDeleteAssets}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary" className={cn('text-[10px] h-4 px-1 border-0', typeConfig.color)}>
              {typeConfig.label}
            </Badge>
            <span>{formatFileSize(asset.fileSize)}</span>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="outline" className="text-[9px] h-4 px-1">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Rights expiry indicator */}
          {asset.validTo && new Date(asset.validTo) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3 h-3" />
              {new Date(asset.validTo) < new Date() ? 'Rights expired' : 'Rights expiring soon'}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  // ============================================================================
  // Render: Asset Row (List View)
  // ============================================================================

  const renderAssetRow = (asset: DigitalAsset) => {
    const typeConfig = ASSET_TYPE_CONFIG[asset.assetType] || ASSET_TYPE_CONFIG.OTHER;
    const statusConfig = STATUS_CONFIG[asset.status] || STATUS_CONFIG.DRAFT;
    const isSelected = selectedIds.has(asset.id);
    const thumbnail = getThumbnailUrl(asset);

    return (
      <motion.div
        key={asset.id}
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          'flex items-center gap-4 px-4 py-3 border-b hover:bg-accent/40 transition-colors cursor-pointer',
          isSelected && 'bg-primary/5 border-l-2 border-l-primary'
        )}
        onClick={() => openLightbox(asset)}
      >
        {/* Selection checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id); }}
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0',
            isSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-gray-300 hover:border-primary dark:border-gray-600'
          )}
        >
          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
        </button>

        {/* Thumbnail */}
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
          {isImageAsset(asset) ? (
            <img
              src={thumbnail}
              alt={asset.altText || ''}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
            />
          ) : (
            <div className={cn('w-full h-full flex items-center justify-center', typeConfig.color)}>
              <typeConfig.icon className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{asset.title || asset.originalFileName}</p>
          <p className="text-xs text-muted-foreground truncate">{asset.originalFileName}</p>
        </div>

        {/* Type */}
        <Badge variant="secondary" className={cn('text-[10px] h-5 px-1.5 border-0 flex-shrink-0', typeConfig.color)}>
          {typeConfig.label}
        </Badge>

        {/* Status */}
        <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 flex-shrink-0', statusConfig.color)}>
          {statusConfig.label}
        </Badge>

        {/* Size */}
        <span className="text-xs text-muted-foreground w-16 text-right flex-shrink-0">
          {formatFileSize(asset.fileSize)}
        </span>

        {/* Date */}
        <span className="text-xs text-muted-foreground w-24 text-right flex-shrink-0">
          {new Date(asset.createdAt).toLocaleDateString()}
        </span>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditAsset(asset); }}>
              <Edit3 className="w-4 h-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetailAsset(asset); }}>
              <Eye className="w-4 h-4 mr-2" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              const link = document.createElement('a');
              const vMap = getVariantMap(asset.variants);
              link.href = vMap.large || vMap.original || asset.filePath;
              link.download = asset.originalFileName;
              link.target = '_blank';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}>
              <Download className="w-4 h-4 mr-2" /> Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ ids: [asset.id], single: true }); }}
              disabled={!perms.canDeleteAssets}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>
    );
  };

  // ============================================================================
  // Render: Edit Dialog
  // ============================================================================

  const renderEditDialog = () => {
    if (!editAsset) return null;
    const tags = parseTags(editAsset.tags);

    return (
      <Dialog open={!!editAsset} onOpenChange={(open) => { if (!open) setEditAsset(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
            <DialogDescription>Update metadata for {editAsset.originalFileName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Title</Label>
              <Input
                className="h-9"
                value={editForm.title ?? editAsset.title ?? ''}
                onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Description</Label>
              <Textarea
                rows={3}
                value={editForm.description ?? editAsset.description ?? ''}
                onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alt Text</Label>
              <Input
                className="h-9"
                value={editForm.altText ?? editAsset.altText ?? ''}
                onChange={(e) => setEditForm(f => ({ ...f, altText: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Category</Label>
              <Input
                className="h-9"
                value={editForm.category ?? editAsset.category ?? ''}
                onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tags (comma-separated)</Label>
              <Input
                className="h-9"
                value={editForm.tags ?? tags.join(', ')}
                onChange={(e) => setEditForm(f => ({ ...f, tags: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status</Label>
              <Select
                value={editForm.status ?? editAsset.status}
                onValueChange={(v) => setEditForm(f => ({ ...f, status: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Rights Management */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Copyright className="w-4 h-4 text-muted-foreground" />
                <Label className="text-xs font-semibold">Rights Management</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Valid From</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={editForm.validFrom ?? (editAsset.validFrom ? new Date(editAsset.validFrom).toISOString().split('T')[0] : '')}
                    onChange={(e) => setEditForm(f => ({ ...f, validFrom: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Valid To</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={editForm.validTo ?? (editAsset.validTo ? new Date(editAsset.validTo).toISOString().split('T')[0] : '')}
                    onChange={(e) => setEditForm(f => ({ ...f, validTo: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Rights Info</Label>
                <Textarea
                  rows={2}
                  placeholder='{"license": "CC-BY-4.0", "owner": "...", "restrictions": "..."}'
                  value={editForm.rightsInfo ?? editAsset.rightsInfo ?? ''}
                  onChange={(e) => setEditForm(f => ({ ...f, rightsInfo: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAsset(null)}>Cancel</Button>
            <Button onClick={handleUpdateAsset} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // ============================================================================
  // Render: Detail Dialog
  // ============================================================================

  const renderDetailDialog = () => {
    if (!detailAsset) return null;
    const tags = parseTags(detailAsset.tags);
    const typeConfig = ASSET_TYPE_CONFIG[detailAsset.assetType] || ASSET_TYPE_CONFIG.OTHER;
    const statusConfig = STATUS_CONFIG[detailAsset.status] || STATUS_CONFIG.DRAFT;
    const vMap = getVariantMap(detailAsset.variants);

    let rightsInfo: Record<string, string> | null = null;
    if (detailAsset.rightsInfo) {
      const parsed = parsePayload<Record<string, string>>(detailAsset.rightsInfo);
      rightsInfo = parsed && Object.keys(parsed).length > 0 ? parsed : null;
    }

    return (
      <Dialog open={!!detailAsset} onOpenChange={(open) => { if (!open) setDetailAsset(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailAsset.title || detailAsset.originalFileName}
              <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5', statusConfig.color)}>
                {statusConfig.label}
              </Badge>
            </DialogTitle>
            <DialogDescription>{detailAsset.originalFileName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Preview */}
            {isImageAsset(detailAsset) && (
              <div className="rounded-xl overflow-hidden bg-muted aspect-video flex items-center justify-center">
                <img
                  src={vMap.large || vMap.medium || detailAsset.filePath}
                  alt={detailAsset.altText || detailAsset.title || ''}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
                />
              </div>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Type" value={
                <Badge variant="secondary" className={cn('text-[10px] h-5 border-0', typeConfig.color)}>
                  <typeConfig.icon className="w-3 h-3 mr-1" /> {typeConfig.label}
                </Badge>
              } />
              <DetailField label="File Size" value={formatFileSize(detailAsset.fileSize)} />
              <DetailField label="MIME Type" value={detailAsset.mimeType} />
              <DetailField label="Category" value={detailAsset.category || '—'} />
              {detailAsset.width && detailAsset.height && (
                <DetailField label="Dimensions" value={`${detailAsset.width} × ${detailAsset.height}${detailAsset.dpi ? ` @ ${detailAsset.dpi} DPI` : ''}`} />
              )}
              {detailAsset.duration && (
                <DetailField label="Duration" value={`${Math.floor(detailAsset.duration / 60)}:${String(Math.floor(detailAsset.duration % 60)).padStart(2, '0')}`} />
              )}
              {detailAsset.pageCount && (
                <DetailField label="Pages" value={String(detailAsset.pageCount)} />
              )}
              <DetailField label="Uploaded By" value={detailAsset.uploader?.displayName || detailAsset.uploader?.username || '—'} />
              <DetailField label="Created" value={new Date(detailAsset.createdAt).toLocaleString()} />
              <DetailField label="Updated" value={new Date(detailAsset.updatedAt).toLocaleString()} />
            </div>

            {/* Description */}
            {detailAsset.description && (
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Description</Label>
                <p className="text-sm">{detailAsset.description}</p>
              </div>
            )}

            {/* Alt Text */}
            {detailAsset.altText && (
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Alt Text</Label>
                <p className="text-sm text-muted-foreground">{detailAsset.altText}</p>
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      <Tag className="w-2.5 h-2.5 mr-1" /> {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Variants */}
            {detailAsset.variants.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Asset Variants</Label>
                <div className="grid grid-cols-1 gap-2">
                  {detailAsset.variants.map(v => (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 text-xs">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-[10px] h-5 capitalize">{v.variant}</Badge>
                        <span className="text-muted-foreground">
                          {v.width}×{v.height} &middot; {formatFileSize(v.bytes)} &middot; {v.format}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = v.filePath;
                          link.download = `${detailAsset.originalFileName}_${v.variant}.${v.format}`;
                          link.target = '_blank';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rights Management */}
            {(detailAsset.validFrom || detailAsset.validTo || detailAsset.rightsInfo) && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Copyright className="w-3.5 h-3.5" /> Rights Management
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {detailAsset.validFrom && (
                    <DetailField label="Valid From" value={new Date(detailAsset.validFrom).toLocaleDateString()} />
                  )}
                  {detailAsset.validTo && (
                    <DetailField
                      label="Valid To"
                      value={
                        <span className={cn(
                          new Date(detailAsset.validTo) < new Date() && 'text-red-600 font-medium'
                        )}>
                          {new Date(detailAsset.validTo).toLocaleDateString()}
                          {new Date(detailAsset.validTo) < new Date() && ' (Expired)'}
                        </span>
                      }
                    />
                  )}
                </div>
                {rightsInfo && (
                  <div className="space-y-1.5 text-xs">
                    {rightsInfo.license && <DetailField label="License" value={rightsInfo.license} />}
                    {rightsInfo.owner && <DetailField label="Owner" value={rightsInfo.owner} />}
                    {rightsInfo.restrictions && <DetailField label="Restrictions" value={rightsInfo.restrictions} />}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setEditAsset(detailAsset)}>
              <Edit3 className="w-4 h-4 mr-1" /> Edit
            </Button>
            <Button variant="outline" onClick={() => {
              const link = document.createElement('a');
              link.href = vMap.large || vMap.original || detailAsset.filePath;
              link.download = detailAsset.originalFileName;
              link.target = '_blank';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}>
              <Download className="w-4 h-4 mr-1" /> Download
            </Button>
            <Button variant="destructive" onClick={() => setDeleteConfirm({ ids: [detailAsset.id], single: true })} disabled={!perms.canDeleteAssets}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Digital Asset Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total} asset{total !== 1 ? 's' : ''} &middot; Stibo DAM
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUploadZone(!showUploadZone)}
              disabled={!perms.canUploadAssets}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 pb-3 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Search assets by name, title, description..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            />
            {filters.search && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                onClick={() => setFilters(f => ({ ...f, search: '' }))}
              >
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="w-4 h-4 mr-1.5" />
            Filters
            {(filters.assetType || filters.status || filters.category || filters.tags) && (
              <Badge className="ml-1.5 h-4 px-1 text-[9px] bg-primary text-primary-foreground">
                {[filters.assetType, filters.status, filters.category, filters.tags].filter(Boolean).length}
              </Badge>
            )}
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* View mode toggle */}
          <div className="flex items-center border rounded-lg p-0.5">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode('list')}
            >
              <List className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 ml-2"
            >
              <Badge variant="secondary" className="text-xs">
                {selectedIds.size} selected
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkStatusDialog(true)}
              >
                <RotateCw className="w-3.5 h-3.5 mr-1" /> Change Status
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirm({ ids: Array.from(selectedIds) })}
                disabled={!perms.canDeleteAssets}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div className="flex-shrink-0 px-6 pt-4">
        {renderUploadZone()}
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Filter sidebar */}
        {renderFilters()}

        {/* Asset grid/list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6">
              <div className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
                  : 'space-y-0'
              )}>
                {Array.from({ length: 12 }).map((_, i) => (
                  viewMode === 'grid' ? (
                    <div key={i} className="space-y-2">
                      <Skeleton className="aspect-square rounded-xl" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ) : (
                    <Skeleton key={i} className="h-14 w-full" />
                  )
                ))}
              </div>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">No assets found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {filters.search || filters.assetType || filters.status || filters.category || filters.tags
                  ? 'Try adjusting your filters or search query.'
                  : 'Upload your first digital asset to get started.'}
              </p>
              {!filters.search && !filters.assetType && !filters.status && !filters.category && !filters.tags && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowUploadZone(true)}
                  disabled={!perms.canUploadAssets}
                >
                  <Upload className="w-4 h-4 mr-1.5" /> Upload Asset
                </Button>
              )}
            </div>
          ) : (
            <div className="p-6">
              {/* Select all row */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={toggleSelectAll}
                >
                  {selectedIds.size === assets.length && assets.length > 0 ? (
                    <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  Select all
                </button>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  <AnimatePresence mode="popLayout">
                    {assets.map(renderAssetCard)}
                  </AnimatePresence>
                </div>
              ) : (
                <Card>
                  <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-4 text-xs font-medium text-muted-foreground">
                    <span className="w-5" /> {/* checkbox spacer */}
                    <span className="w-10" /> {/* thumb spacer */}
                    <span className="flex-1">Name</span>
                    <span className="w-20">Type</span>
                    <span className="w-20">Status</span>
                    <span className="w-16 text-right">Size</span>
                    <span className="w-24 text-right">Date</span>
                    <span className="w-7" /> {/* actions spacer */}
                  </div>
                  <ScrollArea className="max-h-[calc(100vh-340px)]">
                    <AnimatePresence mode="popLayout">
                      {assets.map(renderAssetRow)}
                    </AnimatePresence>
                  </ScrollArea>
                </Card>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Edit Dialog */}
      {renderEditDialog()}

      {/* Detail Dialog */}
      {renderDetailDialog()}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.single
                ? 'Are you sure you want to delete this asset? This action cannot be undone.'
                : `Are you sure you want to delete ${deleteConfirm?.ids.length || 0} assets? This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteConfirm) handleDelete(deleteConfirm.ids);
              }}
              disabled={deleting}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Status Dialog */}
      <Dialog open={bulkStatusDialog} onOpenChange={setBulkStatusDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
            <DialogDescription>
              Update status for {selectedIds.size} selected asset{selectedIds.size !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          <Select value={bulkStatusValue} onValueChange={setBulkStatusValue}>
            <SelectTrigger>
              <SelectValue placeholder="Select new status" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <cfg.icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkStatusChange} disabled={!bulkStatusValue}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Global drag overlay */}
      {!showUploadZone && !uploading && (
        <div
          className={cn(
            'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center transition-all duration-200 pointer-events-none',
            dragOver ? 'opacity-100 pointer-events-auto' : 'opacity-0'
          )}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) {
              handleUpload(e.dataTransfer.files);
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          <div className="border-2 border-dashed border-white/50 rounded-2xl p-12 text-center">
            <Upload className="w-16 h-16 text-white mx-auto mb-4" />
            <p className="text-xl font-semibold text-white">Drop files to upload</p>
            <p className="text-sm text-white/70 mt-1">Release to add assets to your library</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
}
