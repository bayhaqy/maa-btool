'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS, STATE_TRANSITIONS } from '@/lib/constants';
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
import {
  ArrowLeft, Save, Send, CheckCircle2, XCircle, Archive,
  Clock, FileText, GitBranch, History,
  Image as ImageIcon, Upload, X, Star, RefreshCw,
  ChevronDown, Check,
} from 'lucide-react';
import { toast } from 'sonner';

const TRANSITION_ICONS: Record<string, React.ElementType> = {
  IN_REVIEW: Send,
  ACTIVE: CheckCircle2,
  REJECTED: XCircle,
  DRAFT: FileText,
  REVISION_PENDING: GitBranch,
  ARCHIVED: Archive,
};

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
}: {
  fieldName: string;
  images: any[];
  onAddFiles: (files: FileList | null) => void;
  onDeleteImage: (imageId: string) => void;
  onSetPrimary: (imageId: string) => void;
  onReplaceImage: (imageId: string, file: File) => void;
  disabled: boolean;
  hasPendingChanges: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
    return (
      <div className="flex flex-wrap gap-2">
        {images.map((img: any) => (
          <div
            key={img.id}
            className="relative group w-20 h-20 rounded-md overflow-hidden border bg-muted/30 cursor-pointer"
            onClick={() => setPreviewImage(img.filePath)}
          >
            <img
              src={img.filePath}
              alt={img.altText || img.fileName}
              className="w-full h-full object-cover"
            />
            {img.isPrimary && (
              <Star className="absolute top-1 right-1 w-3 h-3 text-amber-500 fill-amber-500" />
            )}
          </div>
        ))}
        {/* Lightbox preview */}
        {previewImage && (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-full rounded-lg shadow-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
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
          {images.map((img: any) => (
            <div
              key={img.id}
              className="relative group w-24 h-24 rounded-lg overflow-hidden border-2 bg-muted/20 transition-all"
            >
              <img
                src={img.filePath}
                alt={img.altText || img.fileName}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setPreviewImage(img.filePath)}
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
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
                  className="h-7 w-7 text-white hover:text-red-400"
                  onClick={() => onDeleteImage(img.id)}
                  title="Delete image"
                >
                  <X className="w-4 h-4" />
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

      {/* Lightbox preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-full rounded-lg shadow-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main RecordDetailPage
// ---------------------------------------------------------------------------
export default function RecordDetailPage() {
  const { token, selectedRecordId, selectedModuleId, navigate } = useAppStore();
  const [record, setRecord] = useState<any>(null);
  const [module, setModule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editPayload, setEditPayload] = useState<Record<string, any>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitionDialog, setTransitionDialog] = useState<{ target: string; notes: string } | null>(null);
  const [recordImages, setRecordImages] = useState<Record<string, any[]>>({});

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
          try {
            setEditPayload(JSON.parse(recData.record.currentPayload || '{}'));
          } catch {
            setEditPayload({});
          }
        }
        // Load images for this record
        loadImages(selectedRecordId);
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
      const filtered = options.filter((o: any) => !o.parentValueCode || o.parentValueCode === parentValue);
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
      toast.success(`Status changed to ${STATUS_LABELS[transitionDialog.target]}`);
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
        options = options.filter((o: any) => !o.parentValueCode || o.parentValueCode === parentValue);
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
      const newPayload = JSON.parse(record.currentPayload || '{}');
      const oldPayload = latestTicket.deltaPayload ? JSON.parse(latestTicket.deltaPayload) : {};
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
            {isNewRecord ? 'Create Record' : 'Record Detail'}
          </h2>
          {!isNewRecord && record && (
            <div className="flex items-center gap-2 mt-1">
              <Badge className={cn('text-xs border', STATUS_COLORS[record.status] || '')}>
                {STATUS_LABELS[record.status] || record.status}
              </Badge>
              <span className="text-xs text-muted-foreground">v{record.version} &middot; {record.module?.moduleName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNewRecord && !isEditing && (record?.status === 'DRAFT' || record?.status === 'REVISION_PENDING') && (
            <Button variant="outline" onClick={() => setIsEditing(true)} className="h-9">
              <Save className="w-4 h-4 mr-1" /> Edit
            </Button>
          )}
          {!isNewRecord && !isEditing && record?.status === 'ACTIVE' && (
            <Button variant="outline" onClick={() => setIsEditing(true)} className="h-9">
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
              <Button variant="outline" onClick={() => { setIsEditing(false); discardPendingImages(); if (record) { try { setEditPayload(JSON.parse(record.currentPayload)); } catch {} } }} className="h-9">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white h-9">
                {saving ? 'Saving...' : isNewRecord ? 'Create' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Record Data</CardTitle>
              <CardDescription>
                {module?.moduleName} — {fields.length} fields
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
          {/* Status Transition */}
          {!isNewRecord && availableTransitions.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
                <CardDescription>Available state transitions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {availableTransitions.map((target) => {
                  const Icon = TRANSITION_ICONS[target] || FileText;
                  return (
                    <Button
                      key={target}
                      variant="outline"
                      className="w-full justify-start h-11"
                      onClick={() => setTransitionDialog({ target, notes: '' })}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {STATUS_LABELS[target] || target}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Version History */}
          {!isNewRecord && record?.versions?.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Version History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {record.versions.map((v: any) => (
                    <div key={v.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                      <div className="p-1.5 rounded bg-muted mt-0.5">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">v{v.versionNumber}</span>
                          <Badge className={cn('text-xs border', STATUS_COLORS[v.status] || '')}>
                            {STATUS_LABELS[v.status] || v.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.changedBy?.displayName || v.changedBy?.username || 'System'} &middot; {v.changeReason || 'No reason'}
                        </p>
                        <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Approval History */}
          {!isNewRecord && record?.approvalTickets?.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GitBranch className="w-5 h-5" />
                  Approval History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar">
                  {record.approvalTickets.map((t: any) => (
                    <div key={t.id} className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Badge className={cn(
                          'text-xs border',
                          t.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          t.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-red-50 text-red-700 border-red-200'
                        )}>
                          {t.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Requested by {t.requestedBy?.displayName || t.requestedBy?.username}
                      </p>
                      {t.reviewedBy && (
                        <p className="text-xs text-muted-foreground">
                          Reviewed by {t.reviewedBy?.displayName || t.reviewedBy?.username}
                        </p>
                      )}
                      {t.reviewNotes && (
                        <p className="text-xs mt-1 italic">{t.reviewNotes}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(t.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Transition Dialog */}
      <Dialog open={!!transitionDialog} onOpenChange={() => setTransitionDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
            <DialogDescription>
              Change record status from {record ? STATUS_LABELS[record.status] : ''} to {transitionDialog ? STATUS_LABELS[transitionDialog.target] : ''}
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
