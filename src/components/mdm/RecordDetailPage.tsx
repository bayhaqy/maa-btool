'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { parsePayload } from '@/lib/parse-payload';
import { STATUS_COLORS, STATUS_LABELS, STATE_TRANSITIONS, WORKFLOW_STATE_LABELS, WORKFLOW_STATE_DESCRIPTIONS, STIBO_TERMINOLOGY } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, Send, CheckCircle2, XCircle, Archive,
  Clock, FileText, GitBranch, History,
  Image as ImageIcon, Upload, X, Star, RefreshCw,
  ChevronDown, Check, Shield, Activity, Database,
  TrendingUp, BarChart3, Eye, ArrowRight, User, Layers,
  Search, Zap, AlertTriangle, ZoomIn, RotateCw, RotateCcw,
  Trash2, Download, Maximize2, GripVertical, Link2, Copy, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import ImageLightbox, { LightboxImage } from '@/components/mdm/ImageLightbox';

const TRANSITION_ICONS: Record<string, React.ElementType> = {
  IN_REVIEW: Send,
  ACTIVE: CheckCircle2,
  REJECTED: XCircle,
  DRAFT: FileText,
  REVISION_PENDING: GitBranch,
  ARCHIVED: Archive,
};

// StatusBadge helper for the RecordDetailPage
const STATUS_BADGE_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  DRAFT: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300 dark:border-gray-600', dot: 'bg-gray-400' },
  IN_REVIEW: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
  ACTIVE: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
  REVISION_PENDING: { bg: 'bg-sky-50 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-300 dark:border-sky-700', dot: 'bg-sky-500' },
  REJECTED: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-700', dot: 'bg-red-500' },
  ARCHIVED: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-300 dark:border-slate-600', dot: 'bg-slate-400' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_BADGE_CONFIG[status];
  const label = WORKFLOW_STATE_LABELS[status] || STATUS_LABELS[status] || status;
  if (!config) return <Badge className="text-xs border">{label}</Badge>;
  return (
    <Badge className={cn('text-xs border inline-flex items-center gap-1.5 font-medium', config.bg, config.text, config.border)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// ImageGalleryCard – card component for the Images tab gallery
// Shows a single image with action buttons (delete, primary, replace, zoom, copy URL, view in DAM)
// ---------------------------------------------------------------------------
function ImageGalleryCard({
  image,
  isEditing,
  onDelete,
  onSetPrimary,
  onReplace,
  onZoom,
  onViewInDAM,
  onCopyUrl,
  token,
}: {
  image: any;
  isEditing: boolean;
  onDelete: () => void;
  onSetPrimary: () => void;
  onReplace: (file: File) => void;
  onZoom: () => void;
  onViewInDAM?: () => void;
  onCopyUrl?: () => void;
  token?: string | null;
}) {
  const replaceRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <div className="relative group rounded-lg border overflow-hidden bg-muted/20 aspect-square">
        <img
          src={image.variants?.small || image.variants?.thumbnail || image.filePath}
          alt={image.altText || image.fileName}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
        />

        {/* Primary badge */}
        {image.isPrimary && (
          <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white rounded-full p-0.5 shadow-sm">
            <Star className="w-3 h-3 fill-white" />
          </div>
        )}

        {/* Pending badge */}
        {image.pending && (
          <div className="absolute top-1.5 right-1.5 bg-amber-400 text-white rounded px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide shadow-sm">
            Pending
          </div>
        )}

        {/* File name at bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
          <p className="text-[9px] text-white truncate">{image.fileName}</p>
        </div>

        {/* Hover overlay with action buttons */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
            onClick={onZoom}
            title="Zoom / View"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-sky-300 hover:bg-white/20"
            onClick={onCopyUrl}
            title="Copy Image URL"
          >
            <Link2 className="w-4 h-4" />
          </Button>
          {onViewInDAM && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:text-emerald-300 hover:bg-white/20"
              onClick={onViewInDAM}
              title="View in Digital Assets"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}
          {isEditing && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:text-amber-300 hover:bg-white/20"
                onClick={onSetPrimary}
                title="Set as primary"
              >
                <Star className={cn('w-4 h-4', image.isPrimary && 'fill-amber-300 text-amber-300')} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:text-blue-300 hover:bg-white/20"
                onClick={() => replaceRef.current?.click()}
                title="Replace image"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:text-red-400 hover:bg-white/20"
                onClick={onDelete}
                title="Delete image"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {/* Hidden file input for replace */}
        <input
          ref={replaceRef}
          type="file"
          accept="image/*,.heic,.heif,.avif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onReplace(file);
          }}
        />
      </div>

      {/* Lightbox for this image */}
      <ImageLightbox
        images={[{
          id: image.id,
          fileName: image.fileName,
          filePath: image.filePath,
          altText: image.altText,
          isPrimary: image.isPrimary,
          sortOrder: image.sortOrder,
          fileSize: image.fileSize,
          mimeType: image.mimeType,
          variants: image.variants,
          pending: image.pending,
          r2Key: image.r2Key,
          storageType: image.storageType,
        }]}
        initialIndex={0}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onDelete={() => { onDelete(); setLightboxOpen(false); }}
        onSetPrimary={onSetPrimary}
        token={token}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// ImageUploadField – inline component for IMAGE data type fields.
// Deferred-save variant (Stibo-style asset maintenance): all mutations
// (upload / delete / set-primary / replace) are dispatched to the parent
// via callbacks and only flushed to /api/images when the user clicks the
// main record "Save" button. Local blob URLs are used for instant preview.
// ---------------------------------------------------------------------------
function ImageUploadField({
  fieldName,
  images,
  onAddFiles,
  onDeleteImage,
  onSetPrimary,
  onReplaceImage,
  disabled,
  hasPendingChanges,
  token,
}: {
  fieldName: string;
  images: any[];
  onAddFiles: (files: FileList | null) => void;
  onDeleteImage: (imageId: string) => void;
  onSetPrimary: (imageId: string) => void;
  onReplaceImage: (imageId: string, file: File) => void;
  disabled: boolean;
  hasPendingChanges: boolean;
  token?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [rotatingImages, setRotatingImages] = useState<Set<string>>(new Set());

  const handleUpload = (files: FileList | null) => {
    onAddFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openReplacePicker = (imageId: string) => {
    setReplaceTarget(imageId);
    // Allow re-picking the same file by resetting value before click
    if (replaceInputRef.current) replaceInputRef.current.value = '';
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = (files: FileList | null) => {
    if (!files || files.length === 0 || !replaceTarget) {
      setReplaceTarget(null);
      return;
    }
    onReplaceImage(replaceTarget, files[0]);
    setReplaceTarget(null);
    if (replaceInputRef.current) replaceInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleUpload(e.dataTransfer.files);
  };

  // View-only mode (disabled): show thumbnails only
  if (disabled) {
    if (images.length === 0) {
      return (
        <div className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/20">
          <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No images yet</p>
        </div>
      );
    }
    const lightboxImgs = images.map((img: any) => ({
      id: img.id,
      fileName: img.fileName,
      filePath: img.filePath,
      altText: img.altText,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
      fileSize: img.fileSize,
      mimeType: img.mimeType,
      variants: img.variants,
      r2Key: img.r2Key,
      storageType: img.storageType,
    }));
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {images.map((img: any, idx: number) => (
            <div
              key={img.id}
              className="relative group w-20 h-20 rounded-md overflow-hidden border bg-muted/30 cursor-pointer"
              onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
            >
              <img
                src={img.variants?.small || img.variants?.thumbnail || img.filePath}
                alt={img.altText || img.fileName}
                className="w-full h-full object-cover"
              />
              {img.isPrimary && (
                <Star className="absolute top-1 right-1 w-3 h-3 text-amber-500 fill-amber-500" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ZoomIn className="w-5 h-5 text-white" />
              </div>
            </div>
          ))}
        </div>
        <ImageLightbox
          images={lightboxImgs}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          token={token}
        />
      </div>
    );
  }

  // Edit mode – deferred-save upload UI
  return (
    <div className="space-y-3">
      {/* Unsaved indicator */}
      {hasPendingChanges && (
        <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Unsaved image changes — click <span className="font-semibold">Save</span> to persist
        </div>
      )}

      {/* Existing + pending images */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img: any, idx: number) => (
            <div
              key={img.id}
              className="relative group w-24 h-24 rounded-lg overflow-hidden border-2 bg-muted/20 transition-all"
            >
              <img
                src={img.variants?.small || img.variants?.thumbnail || img.filePath}
                alt={img.altText || img.fileName}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:text-amber-400"
                  onClick={() => onSetPrimary(img.id)}
                  title="Set as primary"
                >
                  <Star className={cn('w-4 h-4', img.isPrimary && 'fill-amber-400 text-amber-400')} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:text-blue-400"
                  onClick={() => openReplacePicker(img.id)}
                  title="Replace image"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:text-emerald-400"
                  onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                  title="Zoom / View"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:text-red-400"
                  onClick={() => onDeleteImage(img.id)}
                  title="Delete image"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {img.isPrimary && (
                <div className="absolute top-1 left-1 bg-amber-500 text-white rounded-full p-0.5">
                  <Star className="w-2.5 h-2.5 fill-white" />
                </div>
              )}
              {img.pending && (
                <div className="absolute top-1 right-1 bg-amber-400 text-white rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide leading-none">
                  Pending
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                <p className="text-[9px] text-white truncate">{img.fileName}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <ImageLightbox
        images={images.map((img: any) => ({
          id: img.id,
          fileName: img.fileName,
          filePath: img.filePath,
          altText: img.altText,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
          fileSize: img.fileSize,
          mimeType: img.mimeType,
          variants: img.variants,
          pending: img.pending,
          r2Key: img.r2Key,
          storageType: img.storageType,
        }))}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onDelete={(imageId) => { onDeleteImage(imageId); }}
        onSetPrimary={(imageId) => { onSetPrimary(imageId); }}
        token={token}
      />

      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
          'hover:border-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20',
          'cursor-pointer'
        )}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif,.avif"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-6 h-6 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            Drag &amp; drop images here, or <span className="text-red-600 font-medium">browse</span>
          </p>
          <p className="text-xs text-muted-foreground/60">
            PNG, JPG, GIF, WebP, HEIC up to 20MB · saved when you click Save
          </p>
        </div>
      </div>

      {/* Hidden replace file input (single-file picker) */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        className="hidden"
        onChange={(e) => handleReplaceFile(e.target.files)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main RecordDetailPage
// ---------------------------------------------------------------------------
export default function RecordDetailPage() {
  const { token, selectedRecordId, selectedModuleId, navigate } = useAppStore();
  const perms = usePermissions();
  const [record, setRecord] = useState<any>(null);
  const [module, setModule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editPayload, setEditPayload] = useState<Record<string, any>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitionDialog, setTransitionDialog] = useState<{ target: string; notes: string } | null>(null);
  const [recordImages, setRecordImages] = useState<Record<string, any[]>>({});
  const [activeDetailTab, setActiveDetailTab] = useState('details');
  const [auditTrail, setAuditTrail] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [relatedRecords, setRelatedRecords] = useState<any[]>([]);
  const [recordQualityScore, setRecordQualityScore] = useState<number | null>(null);

  // Deferred image-save state (Stibo-style asset maintenance).
  // Pending uploads are stored as File objects + a blob URL for instant
  // preview; pending deletions are server image IDs queued for DELETE
  // (kept with their fieldCode so we can show per-field "unsaved" badges);
  // pendingPrimary records the user's per-field primary choice (image ID
  // can be either a server id or a `pending-` temp id).
  const [pendingUploads, setPendingUploads] = useState<Array<{
    tempId: string;
    fieldCode: string;
    file: File;
    blobUrl: string;
  }>>([]);
  const [pendingDeletions, setPendingDeletions] = useState<Array<{
    imageId: string;
    fieldCode: string;
  }>>([]);
  const [pendingPrimary, setPendingPrimary] = useState<Record<string, string>>({});

  const isNewRecord = !selectedRecordId;

  // True when there are ANY unflushed image ops across all fields.
  const hasPendingImageOps =
    pendingUploads.length > 0 ||
    pendingDeletions.length > 0 ||
    Object.keys(pendingPrimary).length > 0;

  // True when the given field has any unflushed image ops (drives the
  // per-field "Unsaved image changes" amber badge).
  const fieldHasPendingOps = (fieldCode: string) =>
    pendingUploads.some((u) => u.fieldCode === fieldCode) ||
    pendingDeletions.some((d) => d.fieldCode === fieldCode) ||
    pendingPrimary[fieldCode] !== undefined;

  const loadImages = useCallback(async (recId: string) => {
    if (!token || !recId) return;
    try {
      const res = await fetch(`/api/images?recordId=${recId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        // Group images by fieldName
        const grouped: Record<string, any[]> = {};
        for (const img of data.images || []) {
          const key = img.fieldName || '_general';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(img);
        }
        setRecordImages(grouped);
      }
    } catch {
      // Silently fail image loading
    }
  }, [token]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Load module details
      const modId = selectedModuleId;
      if (modId) {
        const modRes = await fetch(`/api/modules?action=detail&id=${modId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const modData = await modRes.json();
        if (modRes.ok) {
          setModule(modData.module);
          if (!selectedRecordId) {
            // New record - initialize empty payload
            const payload: Record<string, any> = {};
            for (const f of modData.module.fields || []) {
              payload[f.fieldCode] = f.defaultValue || '';
            }
            setEditPayload(payload);
            setIsEditing(true);
          }
        }
      }

      // Load record if existing
      if (selectedRecordId) {
        const recRes = await fetch(`/api/records?action=detail&id=${selectedRecordId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const recData = await recRes.json();
        if (recRes.ok) {
          setRecord(recData.record);
          setEditPayload(parsePayload(recData.record.currentPayload));
        }
        // Load images for this record
        loadImages(selectedRecordId);

        // Load audit trail for this record
        setAuditLoading(true);
        try {
          const auditRes = await fetch(`/api/audit?entityType=DataRecord&entityId=${selectedRecordId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const auditData = await auditRes.json();
          if (auditRes.ok) setAuditTrail(auditData.logs || auditData.entries || auditData.audits || []);
        } catch { /* non-critical */ }
        finally { setAuditLoading(false); }

        // Load related records (same module, different records)
        try {
          const relRes = await fetch(`/api/records?moduleId=${selectedModuleId}&pageSize=5`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const relData = await relRes.json();
          if (relRes.ok) setRelatedRecords((relData.records || []).filter((r: any) => r.id !== selectedRecordId).slice(0, 5));
        } catch { /* non-critical */ }

        // Calculate record quality score
        try {
          const qualRes = await fetch(`/api/data-quality?moduleId=${selectedModuleId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const qualData = await qualRes.json();
          if (qualRes.ok && qualData.moduleBreakdown) {
            const modQual = qualData.moduleBreakdown.find((m: any) => m.moduleId === selectedModuleId);
            if (modQual) setRecordQualityScore(modQual.overall);
          }
        } catch { /* non-critical */ }
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, selectedRecordId, selectedModuleId, loadImages]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cascading dropdown safety: when a parent field's value changes, auto-clear
  // any child field whose cascadesFromFieldCode points to it AND whose current
  // value is no longer in the filtered option set. Prevents stale child values
  // like "Sepatu Running" lingering after the user switches Category to "Tas".
  useEffect(() => {
    if (!module?.fields || !isEditing) return;
    const fieldsList = module.fields as any[];
    let needsUpdate = false;
    const next = { ...editPayload };
    for (const f of fieldsList) {
      const parentCode = f.cascadesFromFieldCode;
      if (!parentCode) continue;
      const currentValue = next[f.fieldCode];
      if (!currentValue) continue;
      const parentValue = next[parentCode];
      const options = (f.lookupMaster?.values || []) as any[];
      const filtered = parentValue
        ? options.filter((o: any) => o.parentValueCode === parentValue)
        : options.filter((o: any) => !o.parentValueCode);
      const stillValid = filtered.some((o: any) => o.valueCode === currentValue);
      if (!stillValid) {
        next[f.fieldCode] = '';
        needsUpdate = true;
      }
    }
    if (needsUpdate) setEditPayload(next);
  }, [editPayload, module, isEditing]);

  // -------------------------------------------------------------------------
  // Deferred image-save helpers (Stibo-style asset maintenance).
  // All image mutations below stay local (blob URLs + pending queues) and
  // are only flushed to /api/images inside handleSave via flushPendingImages.
  // -------------------------------------------------------------------------

  const SUPPORTED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'avif', 'svg'];

  const validateImageFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImageType = file.type.startsWith('image/') || SUPPORTED_IMAGE_EXTS.includes(ext);
    if (!isImageType) {
      return `"${file.name}" is not a supported image file (supported: ${SUPPORTED_IMAGE_EXTS.join(', ')})`;
    }
    if (file.size > 20 * 1024 * 1024) {
      return `"${file.name}" exceeds 20MB limit`;
    }
    return null;
  };

  // Returns the currently displayed image list for a field (server images
  // minus queued deletions, plus pending uploads). The recordImages state
  // already holds this merged list, so this is just a safe accessor.
  const getDisplayImages = (fieldCode: string): any[] => recordImages[fieldCode] || [];

  // Add new files as pending uploads for the given field. Auto-marks the
  // first file as primary when the field currently has no displayed images.
  const addPendingFiles = (fieldCode: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const err = validateImageFile(file);
      if (err) {
        toast.error(err);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    const current = getDisplayImages(fieldCode);
    const hasPrimary = current.some((img) => img.isPrimary);

    const newEntries: any[] = [];
    const newUploads: typeof pendingUploads = [];
    const now = Date.now();
    accepted.forEach((file, i) => {
      const tempId = `pending-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const blobUrl = URL.createObjectURL(file);
      const isFirstAndNoPrimary = !hasPrimary && i === 0 && !current.some((img) => img.pending);
      newEntries.push({
        id: tempId,
        filePath: blobUrl,
        fileName: file.name,
        altText: '',
        isPrimary: isFirstAndNoPrimary,
        pending: true,
      });
      newUploads.push({ tempId, fieldCode, file, blobUrl });
      if (isFirstAndNoPrimary) {
        // Record the auto-primary choice so flushPendingImages sets it on POST.
        setPendingPrimary((prev) => ({ ...prev, [fieldCode]: tempId }));
      }
    });

    setRecordImages((prev) => ({
      ...prev,
      [fieldCode]: [...(prev[fieldCode] || []), ...newEntries],
    }));
    setPendingUploads((prev) => [...prev, ...newUploads]);
  };

  // Delete an image (pending or server). For pending images we just revoke
  // the blob URL and drop the entry. For server images we queue a DELETE.
  const deleteImage = (fieldCode: string, imageId: string) => {
    const current = getDisplayImages(fieldCode);
    const target = current.find((img) => img.id === imageId);
    if (!target) return;

    const wasPrimary = !!target.isPrimary;

    if (target.pending) {
      // Pending: revoke blob URL, drop from uploads.
      URL.revokeObjectURL(target.filePath);
      setPendingUploads((prev) => prev.filter((u) => u.tempId !== imageId));
    } else {
      // Server image: queue DELETE.
      setPendingDeletions((prev) =>
        prev.some((d) => d.imageId === imageId) ? prev : [...prev, { imageId, fieldCode }]
      );
    }

    // Remove from the displayed list.
    setRecordImages((prev) => ({
      ...prev,
      [fieldCode]: (prev[fieldCode] || []).filter((img) => img.id !== imageId),
    }));

    // If we just removed the primary, clear the pending-primary choice for
    // this field so flushPendingImages doesn't PATCH a deleted image. The
    // server will keep whatever primary remains.
    if (wasPrimary) {
      setPendingPrimary((prev) => {
        if (!(fieldCode in prev)) return prev;
        const next = { ...prev };
        delete next[fieldCode];
        return next;
      });
    } else if (pendingPrimary[fieldCode] === imageId) {
      // Removed a non-primary image that was queued to become primary.
      setPendingPrimary((prev) => {
        const next = { ...prev };
        delete next[fieldCode];
        return next;
      });
    }
  };

  // Mark an image as primary (local-only; PATCH happens on Save).
  const setPrimaryImage = (fieldCode: string, imageId: string) => {
    const current = getDisplayImages(fieldCode);
    if (!current.some((img) => img.id === imageId)) return;
    setRecordImages((prev) => ({
      ...prev,
      [fieldCode]: (prev[fieldCode] || []).map((img) => ({
        ...img,
        isPrimary: img.id === imageId,
      })),
    }));
    setPendingPrimary((prev) => ({ ...prev, [fieldCode]: imageId }));
  };

  // Replace an existing image with a new file. For pending images we just
  // swap the File + blob URL. For server images we queue a DELETE on the
  // old id + add the new file as a pending upload, preserving the primary
  // status of the replaced image.
  const replaceImage = (fieldCode: string, imageId: string, file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    const current = getDisplayImages(fieldCode);
    const target = current.find((img) => img.id === imageId);
    if (!target) return;

    const wasPrimary = !!target.isPrimary;
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const blobUrl = URL.createObjectURL(file);

    if (target.pending) {
      // Swap the underlying File + blob URL for the pending entry. Reuse
      // the same tempId so any pendingPrimary entry stays valid.
      URL.revokeObjectURL(target.filePath);
      setPendingUploads((prev) =>
        prev.map((u) => (u.tempId === imageId ? { ...u, file, blobUrl } : u))
      );
      setRecordImages((prev) => ({
        ...prev,
        [fieldCode]: (prev[fieldCode] || []).map((img) =>
          img.id === imageId ? { ...img, filePath: blobUrl, fileName: file.name } : img
        ),
      }));
      toast.success('Image replaced (pending Save)');
      return;
    }

    // Server image: queue DELETE + add pending upload.
    setPendingDeletions((prev) =>
      prev.some((d) => d.imageId === imageId) ? prev : [...prev, { imageId, fieldCode }]
    );
    setPendingUploads((prev) => [...prev, { tempId, fieldCode, file, blobUrl }]);
    setRecordImages((prev) => ({
      ...prev,
      [fieldCode]: (prev[fieldCode] || [])
        .filter((img) => img.id !== imageId)
        .concat([{
          id: tempId,
          filePath: blobUrl,
          fileName: file.name,
          altText: '',
          isPrimary: wasPrimary,
          pending: true,
        }]),
    }));
    if (wasPrimary) {
      setPendingPrimary((prev) => ({ ...prev, [fieldCode]: tempId }));
    }
    toast.success('Image replaced (pending Save)');
  };

  // Discard all pending image ops (Cancel / navigate-away). Revokes blob
  // URLs and reloads server images to discard local display mutations.
  const discardPendingImages = () => {
    for (const u of pendingUploads) {
      URL.revokeObjectURL(u.blobUrl);
    }
    setPendingUploads([]);
    setPendingDeletions([]);
    setPendingPrimary({});
    if (selectedRecordId) {
      loadImages(selectedRecordId);
    } else {
      setRecordImages({});
    }
  };

  // Flush all pending image ops to /api/images. Returns counts for the
  // toast summary. Flush order: (1) deletions, (2) uploads, (3) primary
  // PATCHes (only for server image ids — pending uploads already carry
  // their isPrimary flag on POST).
  const flushPendingImages = async (recordId: string): Promise<{ uploaded: number; deleted: number; primarySet: number }> => {
    const counts = { uploaded: 0, deleted: 0, primarySet: 0 };
    if (!token) return counts;

    // (1) Deletions
    for (const d of pendingDeletions) {
      try {
        const res = await fetch(`/api/images?imageId=${d.imageId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) counts.deleted++;
      } catch {
        // Continue on individual failure; surface via toast summary.
      }
    }

    // (2) Uploads — determine isPrimary per upload from pendingPrimary.
    for (const u of pendingUploads) {
      const isPrimary = pendingPrimary[u.fieldCode] === u.tempId;
      const formData = new FormData();
      formData.append('file', u.file);
      formData.append('recordId', recordId);
      formData.append('fieldName', u.fieldCode);
      formData.append('isPrimary', String(isPrimary));
      try {
        const res = await fetch('/api/images', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) counts.uploaded++;
      } catch {
        // Continue on individual failure.
      }
      // Revoke the blob URL — the server now owns the persisted image.
      URL.revokeObjectURL(u.blobUrl);
    }

    // (3) Primary PATCH — only for server image ids (not temp ids).
    for (const [fieldCode, imageId] of Object.entries(pendingPrimary)) {
      if (!imageId || imageId.startsWith('pending-')) continue;
      // Skip if the image is also queued for deletion.
      if (pendingDeletions.some((d) => d.imageId === imageId)) continue;
      try {
        const res = await fetch(`/api/images?imageId=${imageId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
        if (res.ok) counts.primarySet++;
      } catch {
        // Continue on individual failure.
      }
      // Reference fieldCode to satisfy linter even when no per-field logic
      // is needed here — the PATCH endpoint derives the field from the image.
      void fieldCode;
    }

    // Clear pending state.
    setPendingUploads([]);
    setPendingDeletions([]);
    setPendingPrimary({});

    // Reload server images to reflect the flushed state.
    await loadImages(recordId);

    return counts;
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (isNewRecord) {
        const res = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ moduleId: selectedModuleId, payload: editPayload }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.errors) {
            toast.error(data.errors.join('; '));
          } else {
            toast.error(data.error || 'Failed to create');
          }
          return;
        }
        // New record created → flush any pending image ops against the new id.
        const newRecordId: string | undefined = data.record?.id;
        if (newRecordId && hasPendingImageOps) {
          const counts = await flushPendingImages(newRecordId);
          const parts = ['Record created'];
          if (counts.uploaded) parts.push(`${counts.uploaded} image(s) uploaded`);
          if (counts.deleted) parts.push(`${counts.deleted} deleted`);
          if (counts.primarySet) parts.push(`${counts.primarySet} primary set`);
          toast.success(parts.join(' · '));
        } else {
          toast.success('Record created');
        }
        navigate('data-records', { moduleId: selectedModuleId || undefined });
      } else {
        const res = await fetch('/api/records?action=update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: selectedRecordId, payload: editPayload }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.errors) {
            toast.error(data.errors.join('; '));
          } else {
            toast.error(data.error || 'Failed to update');
          }
          return;
        }
        // Existing record updated → flush any pending image ops.
        let summary = data.message || 'Record updated';
        if (hasPendingImageOps) {
          const counts = await flushPendingImages(selectedRecordId!);
          const parts: string[] = [];
          if (counts.uploaded) parts.push(`${counts.uploaded} image(s) uploaded`);
          if (counts.deleted) parts.push(`${counts.deleted} deleted`);
          if (counts.primarySet) parts.push(`${counts.primarySet} primary set`);
          if (parts.length) summary = `${summary} · ${parts.join(' · ')}`;
        }
        toast.success(summary);
        setIsEditing(false);
        loadData();
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async () => {
    if (!token || !selectedRecordId || !transitionDialog) return;
    setSaving(true);
    try {
      const res = await fetch('/api/records?action=transition', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: selectedRecordId,
          targetStatus: transitionDialog.target,
          reviewNotes: transitionDialog.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(`Workflow state changed to ${WORKFLOW_STATE_LABELS[transitionDialog.target] || STATUS_LABELS[transitionDialog.target]}`);
      setTransitionDialog(null);
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const renderFieldInput = (field: any) => {
    const value = editPayload[field.fieldCode] ?? '';
    const disabled = !isEditing;

    // IMAGE data type – deferred-save inline component (Stibo-style asset
    // maintenance). Mutations stay local (blob URLs + pending queues) and
    // are only flushed to /api/images when the user clicks Save.
    if (field.dataType === 'IMAGE') {
      return (
        <ImageUploadField
          fieldName={field.fieldCode}
          images={recordImages[field.fieldCode] || []}
          onAddFiles={(files) => addPendingFiles(field.fieldCode, files)}
          onDeleteImage={(imageId) => deleteImage(field.fieldCode, imageId)}
          onSetPrimary={(imageId) => setPrimaryImage(field.fieldCode, imageId)}
          onReplaceImage={(imageId, file) => replaceImage(field.fieldCode, imageId, file)}
          disabled={disabled}
          hasPendingChanges={fieldHasPendingOps(field.fieldCode)}
          token={token}
        />
      );
    }

    if (disabled) {
      // For MULTISELECT/SELECT in view mode, render displayValue badges instead
      // of raw codes for a friendlier read-only experience.
      if (field.dataType === 'MULTISELECT' || field.dataType === 'SELECT' || field.dataType === 'LOOKUP') {
        const options = field.lookupMaster?.values || [];
        const codes: string[] = String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (codes.length === 0) {
          return (
            <div className="px-3 py-2 border rounded-md bg-muted/30 min-h-[38px] flex items-center">
              <span className="text-sm text-muted-foreground">-</span>
            </div>
          );
        }
        const labels = codes
          .map((c) => options.find((o: any) => o.valueCode === c)?.displayValue || c);
        return (
          <div className="px-3 py-2 border rounded-md bg-muted/30 min-h-[38px] flex flex-wrap items-center gap-1.5">
            {labels.map((label, i) => (
              <Badge key={i} variant="secondary" className="text-[11px] bg-red-50 text-red-700 border-red-200">
                {label}
              </Badge>
            ))}
          </div>
        );
      }
      return (
        <div className="px-3 py-2 border rounded-md bg-muted/30 min-h-[38px] flex items-center">
          <span className="text-sm">{String(value) || '-'}</span>
        </div>
      );
    }

    if (field.dataType === 'BOOLEAN') {
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={value === 'true' || value === true}
            onCheckedChange={(c) => setEditPayload({ ...editPayload, [field.fieldCode]: String(c) })}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">{value === 'true' ? 'Yes' : 'No'}</span>
        </div>
      );
    }

    if (field.dataType === 'SELECT' || field.dataType === 'LOOKUP') {
      // Cascading dropdown: if this field has cascadesFromFieldCode set,
      // filter lookupMaster.values to those whose parentValueCode matches
      // the current value of the parent field within the same module.
      let options = field.lookupMaster?.values || [];
      const parentCode = field.cascadesFromFieldCode;
      let parentValue: string | undefined;
      if (parentCode) {
        parentValue = editPayload[parentCode];
        if (parentValue) {
          // Parent selected: show ONLY values whose parentValueCode matches
          options = options.filter((o: any) => o.parentValueCode === parentValue);
        } else {
          // No parent selected: show values that have no parentValueCode (root values)
          options = options.filter((o: any) => !o.parentValueCode);
        }
      }
      return (
        <div className="space-y-1.5">
          <Select
            value={String(value)}
            onValueChange={(v) => setEditPayload({ ...editPayload, [field.fieldCode]: v })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select...'} /></SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                  {parentCode && !parentValue
                    ? `Pilih ${parentCode} terlebih dulu`
                    : 'Tidak ada opsi'}
                </div>
              ) : (
                options.map((o: any) => (
                  <SelectItem key={o.valueCode} value={o.valueCode}>{o.displayValue}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {parentCode && (
            <p className="text-[11px] text-muted-foreground">
              Opsi tergantung pada field <span className="font-mono font-medium">{parentCode}</span>
              {parentValue ? ` (= ${parentValue})` : ' (belum dipilih)'}
            </p>
          )}
        </div>
      );
    }

    if (field.dataType === 'MULTISELECT') {
      // Multi-value list field. Stored as comma-separated valueCodes in the
      // payload. Renders as a chip + checkbox popover.
      const options = field.lookupMaster?.values || [];
      const selectedCodes: string[] = String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const selectedSet = new Set(selectedCodes);
      const toggleCode = (code: string) => {
        const next = new Set(selectedSet);
        if (next.has(code)) next.delete(code); else next.add(code);
        const nextStr = Array.from(next).join(',');
        setEditPayload({ ...editPayload, [field.fieldCode]: nextStr });
      };
      const selectedLabels = options
        .filter((o: any) => selectedSet.has(o.valueCode))
        .map((o: any) => o.displayValue);
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-sm',
                'ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/40 min-h-[38px]'
              )}
              disabled={disabled}
            >
              <span className={cn('flex-1 truncate', selectedLabels.length === 0 && 'text-muted-foreground')}>
                {selectedLabels.length === 0
                  ? (field.placeholder || 'Pilih beberapa...')
                  : selectedLabels.join(', ')}
              </span>
              {selectedLabels.length > 0 && (
                <Badge variant="secondary" className="shrink-0 h-5 px-1.5 text-[10px]">{selectedLabels.length}</Badge>
              )}
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
            <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground italic">Tidak ada opsi</div>
              ) : (
                options.map((o: any) => {
                  const checked = selectedSet.has(o.valueCode);
                  return (
                    <label
                      key={o.valueCode}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm cursor-pointer',
                        'hover:bg-accent/60 transition-colors',
                        checked && 'bg-red-50/60'
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCode(o.valueCode)}
                        className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                      />
                      <span className="flex-1">{o.displayValue}</span>
                      {checked && <Check className="w-3.5 h-3.5 text-red-600" />}
                    </label>
                  );
                })
              )}
            </div>
            {selectedLabels.length > 0 && (
              <div className="border-t px-2 py-1.5 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{selectedLabels.length} dipilih</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setEditPayload({ ...editPayload, [field.fieldCode]: '' })}
                >
                  Clear all
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      );
    }

    if (field.dataType === 'NUMBER') {
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => setEditPayload({ ...editPayload, [field.fieldCode]: e.target.value })}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      );
    }

    if (field.dataType === 'DATE') {
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => setEditPayload({ ...editPayload, [field.fieldCode]: e.target.value })}
          disabled={disabled}
        />
      );
    }

    if (field.dataType === 'EMAIL') {
      return (
        <Input
          type="email"
          value={value}
          onChange={(e) => setEditPayload({ ...editPayload, [field.fieldCode]: e.target.value })}
          placeholder={field.placeholder || 'email@example.com'}
          disabled={disabled}
        />
      );
    }

    if (field.dataType === 'URL') {
      return (
        <Input
          type="url"
          value={value}
          onChange={(e) => setEditPayload({ ...editPayload, [field.fieldCode]: e.target.value })}
          placeholder={field.placeholder || 'https://...'}
          disabled={disabled}
        />
      );
    }

    if (field.dataType === 'TEXT' && field.validations?.some((v: any) => v.ruleType === 'MAX_LENGTH' && parseInt(v.ruleValue) > 200)) {
      return (
        <Textarea
          value={value}
          onChange={(e) => setEditPayload({ ...editPayload, [field.fieldCode]: e.target.value })}
          placeholder={field.placeholder}
          disabled={disabled}
          rows={3}
        />
      );
    }

    return (
      <Input
        value={value}
        onChange={(e) => setEditPayload({ ...editPayload, [field.fieldCode]: e.target.value })}
        placeholder={field.placeholder}
        disabled={disabled}
      />
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const fields = module?.fields || [];
  const availableTransitions = record ? (STATE_TRANSITIONS[record.status] || []) : [];

  // For diff viewer: get old vs new values for IN_REVIEW and REVISION_PENDING records
  const getDiffData = () => {
    if (!record || (record.status !== 'IN_REVIEW' && record.status !== 'REVISION_PENDING')) return null;
    const latestTicket = record.approvalTickets?.find((t: any) => t.status === 'PENDING');
    if (!latestTicket) return null;
    try {
      const newPayload = parsePayload(record.currentPayload);
      const oldPayload = parsePayload(latestTicket.deltaPayload);
      const allKeys = new Set([...Object.keys(oldPayload), ...Object.keys(newPayload)]);
      const diffs: Array<{ key: string; label: string; oldVal: string; newVal: string }> = [];
      for (const key of allKeys) {
        const field = fields.find((f: any) => f.fieldCode === key);
        if (!field) continue;
        const oldVal = String(oldPayload[key] ?? '');
        const newVal = String(newPayload[key] ?? '');
        if (oldVal !== newVal) {
          diffs.push({ key, label: field.fieldName, oldVal, newVal });
        }
      }
      return diffs;
    } catch {
      return null;
    }
  };

  const diffs = getDiffData();

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => { discardPendingImages(); navigate('data-records', { moduleId: selectedModuleId || undefined }); }} className="h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">
            {isNewRecord ? 'Create Entity Instance' : 'Entity Instance Detail'}
          </h2>
          {!isNewRecord && record && (
            <div className="flex items-center gap-2 mt-1">
              <Badge className={cn('text-xs border', STATUS_COLORS[record.status] || '')}>
                {(WORKFLOW_STATE_LABELS[record.status] || STATUS_LABELS[record.status] || record.status)}
              </Badge>
              <span className="text-xs text-muted-foreground">v{record.version} &middot; {record.module?.moduleName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNewRecord && !isEditing && (record?.status === 'DRAFT' || record?.status === 'REVISION_PENDING') && (
            <Button variant="outline" onClick={() => setIsEditing(true)} className="h-9" disabled={!perms.canEdit}>
              <Save className="w-4 h-4 mr-1" /> Edit
            </Button>
          )}
          {!isNewRecord && !isEditing && record?.status === 'ACTIVE' && (
            <Button variant="outline" onClick={() => setIsEditing(true)} className="h-9" disabled={!perms.canEdit}>
              <Save className="w-4 h-4 mr-1" /> Request Amendment
            </Button>
          )}

          {isEditing && hasPendingImageOps && (
            <Badge variant="outline" className="text-[11px] border-amber-300 bg-amber-50 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1.5" />
              Unsaved images
            </Badge>
          )}
          {isEditing && (
            <>
              <Button variant="outline" onClick={() => { setIsEditing(false); discardPendingImages(); if (record) { setEditPayload(parsePayload(record.currentPayload)) } }} className="h-9">Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !perms.canEdit} className="bg-red-600 hover:bg-red-700 text-white h-9">
                {saving ? 'Saving...' : isNewRecord ? 'Create' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Detail Tabs */}
      {!isNewRecord && (
        <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab} className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="details" className="gap-1.5">
              <FileText className="w-4 h-4" /> Details
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-1.5">
              <ImageIcon className="w-4 h-4" /> Images
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-1.5">
              <History className="w-4 h-4" /> Version History
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <Shield className="w-4 h-4" /> Audit Trail
            </TabsTrigger>
            <TabsTrigger value="related" className="gap-1.5">
              <Layers className="w-4 h-4" /> Related
            </TabsTrigger>
            <TabsTrigger value="lineage" className="gap-1.5">
              <GitBranch className="w-4 h-4" /> Lineage
            </TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Attribute Values</CardTitle>
                    <CardDescription>
                      {module?.moduleName} — {fields.length} attributes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {fields.map((field: any) => {
                        const isLongText = field.dataType === 'TEXT' && field.validations?.some((v: any) => v.ruleType === 'MAX_LENGTH' && parseInt(v.ruleValue) > 200);
                        const isImage = field.dataType === 'IMAGE';
                        return (
                          <div key={field.id} className={isLongText || isImage ? 'md:col-span-2' : ''}>
                            <Label className="text-sm mb-1.5 block">
                              {field.fieldName}
                              {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                            </Label>
                            {renderFieldInput(field)}
                            {field.description && <p className="text-xs text-muted-foreground mt-1">{field.description}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Diff Viewer for IN_REVIEW */}
                {diffs && diffs.length > 0 && (
                  <Card className="shadow-sm border-amber-200">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-amber-600" />
                        Change Preview
                      </CardTitle>
                      <CardDescription>Comparison of proposed changes</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {diffs.map((d) => (
                          <div key={d.key} className="grid grid-cols-2 gap-4 p-3 rounded-lg border">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">{d.label} (Current)</p>
                              <div className="px-3 py-1.5 bg-red-50 text-red-800 rounded border border-red-200 text-sm">
                                {d.oldVal || <span className="italic text-red-400">empty</span>}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">{d.label} (Proposed)</p>
                              <div className="px-3 py-1.5 bg-red-50 text-red-800 rounded border border-red-200 text-sm">
                                {d.newVal || <span className="italic text-red-400">empty</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Quality Score & Completeness */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" /> Instance Quality
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {recordQualityScore !== null && (
                      <div className="flex flex-col items-center">
                        <div className="relative w-24 h-24">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
                            <circle
                              cx="60" cy="60" r="50" fill="none"
                              className={recordQualityScore >= 85 ? 'text-emerald-500' : recordQualityScore >= 70 ? 'text-amber-500' : 'text-red-500'}
                              strokeWidth="10"
                              strokeLinecap="round"
                              strokeDasharray={`${(recordQualityScore / 100) * 314} 314`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={cn('text-xl font-bold', recordQualityScore >= 85 ? 'text-emerald-600' : recordQualityScore >= 70 ? 'text-amber-600' : 'text-red-600')}>
                              {recordQualityScore}
                            </span>
                            <span className="text-[9px] text-muted-foreground">quality</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Completeness bar */}
                    {(() => {
                      const totalAttrs = fields.length || 1;
                      const filledAttrs = fields.filter((f: any) => {
                        const val = editPayload[f.fieldCode];
                        return val !== undefined && val !== null && val !== '';
                      }).length;
                      const completeness = Math.round((filledAttrs / totalAttrs) * 100);
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground font-medium">Completeness</span>
                            <span className={cn('text-xs font-bold', completeness >= 85 ? 'text-emerald-600' : completeness >= 60 ? 'text-amber-600' : 'text-red-600')}>
                              {completeness}%
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                completeness >= 85 ? 'bg-emerald-500' :
                                completeness >= 60 ? 'bg-amber-500' : 'bg-red-500'
                              )}
                              style={{ width: `${completeness}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {filledAttrs} of {totalAttrs} attributes filled
                          </p>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Workflow State & Transitions */}
                {record && (
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Workflow State
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Current state indicator */}
                      <div className="flex items-center gap-2">
                        <StatusBadge status={record.status} />
                        {WORKFLOW_STATE_DESCRIPTIONS[record.status] && (
                          <span className="text-[10px] text-muted-foreground">{WORKFLOW_STATE_DESCRIPTIONS[record.status]}</span>
                        )}
                      </div>

                      {/* Available transitions */}
                      {availableTransitions.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Available Transitions</p>
                          {availableTransitions.map((target) => {
                            const Icon = TRANSITION_ICONS[target] || FileText;
                            return (
                              <Button
                                key={target}
                                variant="outline"
                                className="w-full justify-start h-9 text-xs"
                                onClick={() => setTransitionDialog({ target, notes: '' })}
                              >
                                <Icon className="w-3.5 h-3.5 mr-2" />
                                {WORKFLOW_STATE_LABELS[target] || STATUS_LABELS[target] || target}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Approval History */}
                {record?.approvalTickets?.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <GitBranch className="w-4 h-4" /> Approval History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {record.approvalTickets.map((t: any) => (
                          <div key={t.id} className="p-2 rounded-lg border">
                            <div className="flex items-center gap-2">
                              <Badge className={cn(
                                'text-[10px] border',
                                t.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                t.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                'bg-red-50 text-red-700 border-red-200'
                              )}>
                                {t.status}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>
                            </div>
                            {t.reviewNotes && (
                              <p className="text-xs mt-1 italic text-muted-foreground">{t.reviewNotes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Source Link — displayed when source_url is present in payload */}
                {(() => {
                  const sourceUrl = editPayload?.source_url;
                  if (!sourceUrl || typeof sourceUrl !== 'string') return null;
                  return (
                    <Card className="shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ExternalLink className="w-4 h-4" /> Source Link
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                        >
                          {sourceUrl}
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          External source where this record data can be verified
                        </p>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            </div>
          </TabsContent>

          {/* Images Tab - Full Image Gallery */}
          <TabsContent value="images">
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ImageIcon className="w-5 h-5" /> Image Gallery
                    </CardTitle>
                    <CardDescription>
                      All images associated with this entity instance
                    </CardDescription>
                  </div>
                  {isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*,.heic,.heif,.avif';
                        input.multiple = true;
                        input.onchange = (e) => {
                          const files = (e.target as HTMLInputElement).files;
                          // Add to the first IMAGE field, or use '_general'
                          const imageFields = fields.filter((f: any) => f.dataType === 'IMAGE');
                          const fieldCode = imageFields.length > 0 ? imageFields[0].fieldCode : '_general';
                          addPendingFiles(fieldCode, files);
                        };
                        input.click();
                      }}
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload Images
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Collect all images from all fields
                  const allImages = Object.entries(recordImages).flatMap(([fieldCode, imgs]) =>
                    (imgs as any[]).map((img) => ({ ...img, fieldCode }))
                  );

                  if (allImages.length === 0) {
                    return (
                      <div className="py-12 text-center">
                        <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No images</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                          This entity instance has no images attached
                        </p>
                        {isEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 gap-1.5"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = 'image/*,.heic,.heif,.avif';
                              input.multiple = true;
                              input.onchange = (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                const imageFields = fields.filter((f: any) => f.dataType === 'IMAGE');
                                const fieldCode = imageFields.length > 0 ? imageFields[0].fieldCode : '_general';
                                addPendingFiles(fieldCode, files);
                              };
                              input.click();
                            }}
                          >
                            <Upload className="w-3.5 h-3.5" /> Upload First Image
                          </Button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {Object.entries(recordImages).map(([fieldCode, imgs]) => {
                        if ((imgs as any[]).length === 0) return null;
                        const field = fields.find((f: any) => f.fieldCode === fieldCode);
                        return (
                          <div key={fieldCode}>
                            <div className="flex items-center gap-2 mb-3">
                              <h4 className="text-sm font-semibold">
                                {field?.fieldName || fieldCode === '_general' ? 'General Images' : fieldCode}
                              </h4>
                              <Badge variant="outline" className="text-[10px]">
                                {(imgs as any[]).length} image{(imgs as any[]).length !== 1 ? 's' : ''}
                              </Badge>
                              {fieldHasPendingOps(fieldCode) && (
                                <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 border">
                                  Unsaved changes
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                              {(imgs as any[]).map((img: any, idx: number) => (
                                <ImageGalleryCard
                                  key={img.id}
                                  image={img}
                                  isEditing={isEditing}
                                  onDelete={() => deleteImage(fieldCode, img.id)}
                                  onSetPrimary={() => setPrimaryImage(fieldCode, img.id)}
                                  onReplace={(file) => replaceImage(fieldCode, img.id, file)}
                                  onZoom={() => {}}
                                  onViewInDAM={() => navigate('digital-assets')}
                                  onCopyUrl={() => {
                                    const imageUrl = img.variants?.large || img.variants?.medium || img.filePath;
                                    const fullUrl = imageUrl.startsWith('/')
                                      ? `${window.location.origin}${imageUrl}`
                                      : imageUrl;
                                    navigator.clipboard.writeText(fullUrl).then(() => {
                                      toast.success('Image URL copied');
                                    }).catch(() => {
                                      toast.error('Failed to copy URL');
                                    });
                                  }}
                                  token={token}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* Summary stats */}
                      <div className="flex items-center gap-4 pt-4 border-t">
                        <div className="text-xs text-muted-foreground">
                          Total: <span className="font-bold">{allImages.length}</span> images
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Primary: <span className="font-bold">{allImages.filter((i) => i.isPrimary).length}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Pending: <span className="font-bold">{allImages.filter((i) => i.pending).length}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Version History Tab */}
          <TabsContent value="versions">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-5 h-5" /> Version History
                </CardTitle>
                <CardDescription>All changes made to this record with before/after values</CardDescription>
              </CardHeader>
              <CardContent>
                {versionsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-lg border p-4 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                ) : !record?.versions || record.versions.length === 0 ? (
                  <div className="py-8 text-center">
                    <History className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No version history available</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-4">
                      {record.versions.map((v: any, idx: number) => {
                        const isLatest = idx === 0;
                        let prevPayload: Record<string, unknown> = {};
                        if (idx < record.versions.length - 1) {
                          prevPayload = parsePayload(record.versions[idx + 1]?.payloadSnapshot);
                        }
                        let currPayload: Record<string, unknown> = {};
                        currPayload = parsePayload(v.payloadSnapshot);

                        // Compute field-level diff
                        const allKeys = new Set([...Object.keys(prevPayload), ...Object.keys(currPayload)]);
                        const changes: Array<{ key: string; oldVal: string; newVal: string }> = [];
                        for (const k of allKeys) {
                          const oldV = String(prevPayload[k] ?? '');
                          const newV = String(currPayload[k] ?? '');
                          if (oldV !== newV) changes.push({ key: k, oldVal: oldV, newVal: newV });
                        }

                        return (
                          <motion.div
                            key={v.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={cn(
                              'rounded-lg border p-4',
                              isLatest && 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20'
                            )}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-sm">v{v.versionNumber}</span>
                                {isLatest && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 border">Latest</Badge>}
                              </div>
                              <Badge className={cn('text-xs border', STATUS_COLORS[v.status] || '')}>
                                {STATUS_LABELS[v.status] || v.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(v.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              <User className="w-3.5 h-3.5 inline mr-1" />
                              {v.changedBy?.displayName || v.changedBy?.username || 'System'}
                              {v.changeReason && <span> — {v.changeReason}</span>}
                            </p>
                            {changes.length > 0 && (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground">{changes.length} field(s) changed</p>
                                {changes.map((c) => (
                                  <div key={c.key} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-xs">
                                    <span className="font-mono font-medium truncate">{c.key}</span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                    <div className="flex items-center gap-1">
                                      {c.oldVal && (
                                        <span className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 truncate max-w-[120px] dark:bg-red-950/40 dark:text-red-300">
                                          {c.oldVal}
                                        </span>
                                      )}
                                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 truncate max-w-[120px] dark:bg-emerald-950/40 dark:text-emerald-300">
                                        {c.newVal || '(empty)'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Trail Tab */}
          <TabsContent value="audit">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-5 h-5" /> Audit Trail
                </CardTitle>
                <CardDescription>Complete audit log for this specific record</CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : auditTrail.length === 0 ? (
                  <div className="py-8 text-center">
                    <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No audit entries for this record</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-0">
                      {auditTrail.map((entry: any, idx: number) => {
                        const actionColors: Record<string, string> = {
                          RECORD_CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300',
                          RECORD_UPDATE: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300',
                          RECORD_DELETE: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300',
                          STATUS_CHANGE: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300',
                          APPROVE: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300',
                          REJECT: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300',
                        };
                        const color = actionColors[entry.action] || 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/40 dark:text-gray-300';
                        return (
                          <div key={entry.id || idx} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center border text-[10px] font-bold', color)}>
                                {idx + 1}
                              </div>
                              {idx < auditTrail.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
                            </div>
                            <div className="pb-4 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={cn('text-[10px] border', color)}>{entry.action}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {entry.user?.displayName || entry.user?.username || 'System'}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(entry.createdAt).toLocaleString()}
                              </p>
                              {entry.description && (
                                <p className="text-sm mt-1">{entry.description}</p>
                              )}
                              {entry.oldValues && entry.newValues && (
                                <div className="mt-2 p-2 rounded bg-muted/50 text-xs">
                                  <p className="font-medium mb-1">Changes:</p>
                                  <pre className="whitespace-pre-wrap font-mono text-[10px]">
                                    {JSON.stringify(entry.newValues, null, 2).slice(0, 200)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Related Records Tab */}
          <TabsContent value="related">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-5 h-5" /> Related Records
                </CardTitle>
                <CardDescription>Other records in the same module that may be related</CardDescription>
              </CardHeader>
              <CardContent>
                {relatedRecords.length === 0 ? (
                  <div className="py-8 text-center">
                    <Database className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No related records found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {relatedRecords.map((rel: any) => {
                      let title = 'Untitled';
                      const payload = parsePayload(rel.currentPayload);
                      for (const k of ['name', 'title', 'articleName', 'displayName', 'code', 'supplierName', 'storeName']) {
                        if (payload[k]) { title = String(payload[k]); break; }
                      }
                      return (
                        <div
                          key={rel.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => navigate('record-detail', { recordId: rel.id, moduleId: selectedModuleId || undefined })}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{title}</p>
                            <p className="text-xs text-muted-foreground font-mono">{rel.id.slice(0, 12)}...</p>
                          </div>
                          <Badge className={cn('text-[10px] border', STATUS_COLORS[rel.status] || '')}>
                            {STATUS_LABELS[rel.status] || rel.status}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Data Lineage Tab */}
          <TabsContent value="lineage">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="w-5 h-5" /> Data Lineage
                </CardTitle>
                <CardDescription>Trace where this record's data came from and how it has been transformed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Source System */}
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/30 border-2 border-teal-400 flex items-center justify-center">
                        <Database className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <span className="text-[10px] mt-1 text-muted-foreground text-center">Source</span>
                    </div>
                    <div className="flex-1 border-t-2 border-dashed border-muted-foreground/30 relative">
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-background px-2 text-[10px] text-muted-foreground">MDM Platform</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="text-[10px] mt-1 text-muted-foreground text-center">Processing</span>
                    </div>
                    <div className="flex-1 border-t-2 border-dashed border-muted-foreground/30 relative">
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-background px-2 text-[10px] text-muted-foreground">Validation</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <span className="text-[10px] mt-1 text-muted-foreground text-center">Active</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Lineage details */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lineage Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Source System</p>
                        <p className="text-sm font-medium">MAA BTOOL MDM Platform</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Module</p>
                        <p className="text-sm font-medium">{module?.moduleName || 'Unknown'}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Created</p>
                        <p className="text-sm font-medium">{record?.createdAt ? new Date(record.createdAt).toLocaleString() : 'Unknown'}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Last Modified</p>
                        <p className="text-sm font-medium">{record?.updatedAt ? new Date(record.updatedAt).toLocaleString() : 'Unknown'}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Created By</p>
                        <p className="text-sm font-medium">{record?.createdBy?.displayName || record?.createdBy?.username || 'System'}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Current Version</p>
                        <p className="text-sm font-medium">v{record?.version || 1}</p>
                      </div>
                    </div>
                  </div>

                  {/* Transformation History */}
                  {record?.versions?.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Transformation History</h4>
                      <div className="space-y-2">
                        {record.versions.slice(0, 5).map((v: any, idx: number) => (
                          <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg border">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted text-xs font-bold">
                              v{v.versionNumber}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{v.changeReason || 'Version update'}</p>
                              <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</p>
                            </div>
                            <Badge className={cn('text-[10px] border', STATUS_COLORS[v.status] || '')}>
                              {STATUS_LABELS[v.status] || v.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* New Record Mode - Show form without tabs */}
      {isNewRecord && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Attribute Values</CardTitle>
            <CardDescription>
              {module?.moduleName} — {fields.length} attributes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field: any) => {
                const isLongText = field.dataType === 'TEXT' && field.validations?.some((v: any) => v.ruleType === 'MAX_LENGTH' && parseInt(v.ruleValue) > 200);
                const isImage = field.dataType === 'IMAGE';
                return (
                  <div key={field.id} className={isLongText || isImage ? 'md:col-span-2' : ''}>
                    <Label className="text-sm mb-1.5 block">
                      {field.fieldName}
                      {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                    </Label>
                    {renderFieldInput(field)}
                    {field.description && <p className="text-xs text-muted-foreground mt-1">{field.description}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transition Dialog */}
      <Dialog open={!!transitionDialog} onOpenChange={() => setTransitionDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Workflow State Transition</DialogTitle>
            <DialogDescription>
              Change entity instance workflow state from {record ? (WORKFLOW_STATE_LABELS[record.status] || STATUS_LABELS[record.status]) : ''} to {transitionDialog ? (WORKFLOW_STATE_LABELS[transitionDialog.target] || STATUS_LABELS[transitionDialog.target]) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={transitionDialog?.notes || ''}
                onChange={(e) => setTransitionDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Add notes about this change"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionDialog(null)}>Cancel</Button>
            <Button onClick={handleTransition} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
