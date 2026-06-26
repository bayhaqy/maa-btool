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
  Image as ImageIcon, Upload, X, Star, Loader2,
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
// ImageUploadField – inline component for IMAGE data type fields
// ---------------------------------------------------------------------------
function ImageUploadField({
  token,
  recordId,
  fieldName,
  images,
  onImagesChange,
  disabled,
}: {
  token: string | null;
  recordId: string | null;
  fieldName: string;
  images: any[];
  onImagesChange: (imgs: any[]) => void;
  disabled: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // View-only mode (no recordId yet or disabled)
  if (!recordId) {
    return (
      <div className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/20">
        <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Save the record first to upload images</p>
      </div>
    );
  }

  if (disabled) {
    // View mode – just show thumbnails (no recordId yet)
    if (images.length === 0) {
      return (
        <div className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/20">
          <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Save the record first to upload images</p>
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

  // Edit mode – full upload UI
  const handleUpload = async (files: FileList | null) => {
    if (!files || !token || !recordId) return;
    setUploading(true);
    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Accept various image formats including HEIC
      const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'avif', 'svg'];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isImageType = file.type.startsWith('image/') || validExtensions.includes(ext);
      if (!isImageType) {
        toast.error(`"${file.name}" is not a supported image file (supported: ${validExtensions.join(', ')})`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds 10MB limit`);
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('recordId', recordId);
      formData.append('fieldName', fieldName);
      formData.append('isPrimary', String(images.length === 0 && i === 0));
      try {
        const res = await fetch('/api/images', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          successCount++;
          onImagesChange([...images, data.imageAsset]);
        } else {
          toast.error(data.error || `Failed to upload ${file.name}`);
        }
      } catch {
        toast.error(`Network error uploading ${file.name}`);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} image(s) uploaded`);
    }
    setUploading(false);
    // Reset the file input so re-uploading the same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (imageId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/images?imageId=${imageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        onImagesChange(images.filter((img: any) => img.id !== imageId));
        toast.success('Image deleted');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete image');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    if (!token || !recordId) return;
    // Optimistic update
    const updated = images.map((img: any) => ({
      ...img,
      isPrimary: img.id === imageId,
    }));
    onImagesChange(updated);
    try {
      const res = await fetch(`/api/images?imageId=${imageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to set primary image');
        // Revert optimistic update on failure by re-reading server state
        onImagesChange(images);
        return;
      }
      toast.success('Primary image updated');
    } catch {
      toast.error('Network error while setting primary image');
      onImagesChange(images);
    }
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

  return (
    <div className="space-y-3">
      {/* Existing images */}
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
                  onClick={() => handleSetPrimary(img.id)}
                  title="Set as primary"
                >
                  <Star className={cn('w-4 h-4', img.isPrimary && 'fill-amber-400 text-amber-400')} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:text-red-400"
                  onClick={() => handleDelete(img.id)}
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
          'cursor-pointer',
          uploading && 'pointer-events-none opacity-60'
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
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-6 h-6 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              Drag & drop images here, or <span className="text-red-600 font-medium">browse</span>
            </p>
            <p className="text-xs text-muted-foreground/60">PNG, JPG, GIF, WebP, HEIC up to 20MB</p>
          </div>
        )}
      </div>

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

  const isNewRecord = !selectedRecordId;

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
        toast.success('Record created');
        navigate('data-records', { moduleId: selectedModuleId });
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
        toast.success(data.message || 'Record updated');
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

    // IMAGE data type – special component
    // Images are always manageable regardless of record edit state,
    // since they're stored in a separate ImageAsset table (MDM best practice)
    if (field.dataType === 'IMAGE') {
      return (
        <ImageUploadField
          token={token}
          recordId={selectedRecordId || null}
          fieldName={field.fieldCode}
          images={recordImages[field.fieldCode] || []}
          onImagesChange={(imgs) => setRecordImages(prev => ({ ...prev, [field.fieldCode]: imgs }))}
          disabled={!selectedRecordId}
        />
      );
    }

    if (disabled) {
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
      const options = field.lookupMaster?.values || [];
      return (
        <Select
          value={String(value)}
          onValueChange={(v) => setEditPayload({ ...editPayload, [field.fieldCode]: v })}
          disabled={disabled}
        >
          <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select...'} /></SelectTrigger>
          <SelectContent>
            {options.map((o: any) => (
              <SelectItem key={o.valueCode} value={o.valueCode}>{o.displayValue}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Button variant="ghost" size="icon" onClick={() => navigate('data-records', { moduleId: selectedModuleId || undefined })} className="h-9 w-9">
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
          {isEditing && (
            <>
              <Button variant="outline" onClick={() => { setIsEditing(false); if (record) { try { setEditPayload(JSON.parse(record.currentPayload)); } catch {} } }} className="h-9">Cancel</Button>
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
