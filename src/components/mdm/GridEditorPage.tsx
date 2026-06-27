'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Plus,
  Save,
  RefreshCw,
  RotateCcw,
  Search,
  XCircle,
  LayoutGrid,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Image as ImageIcon,
  Loader2,
  PencilLine,
  ListFilter,
  Upload,
  Star,
  X,
  Trash2,
  BookmarkPlus,
  BookmarkCheck,
  Settings,
  Share2,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import ImageLightbox, { type LightboxImage } from '@/components/mdm/ImageLightbox';
import GridImageCell, { type GridImageInfo } from '@/components/mdm/GridImageCell';

// ============================================================================
// Types
// ============================================================================

interface LookupValue {
  id: string;
  valueCode: string;
  displayValue: string;
  parentValueId?: string | null;
  parentValueCode?: string | null;
  sortOrder: number;
}

interface ImageInfo {
  id: string;
  fileName: string;
  filePath: string;
  altText?: string | null;
  isPrimary: boolean;
  sortOrder: number;
  /** The fieldCode this image belongs to (matches a MetaField with
   *  dataType=IMAGE). May be null for legacy images. */
  fieldName?: string | null;
  /** True when this image only exists locally (pending upload) — the `id`
   *  is a synthetic client-side id and `filePath` is a blob URL. */
  pending?: boolean;
  /** Pre-computed variant URLs (variant → filePath). Populated from /api/images
   *  GET. Used to render the ~26x26 cell thumbnail from the 150px webp variant
   *  instead of the full-resolution original (STIBO Image Conversion — cuts
   *  grid bandwidth ~95%). */
  variants?: Record<string, string>;
}

interface MetaField {
  id: string;
  fieldCode: string;
  fieldName: string;
  dataType: string;
  isRequired: boolean;
  isUnique: boolean;
  defaultValue?: string | null;
  placeholder?: string | null;
  description?: string | null;
  cascadesFromFieldCode?: string | null;
  lookupMaster?: {
    id: string;
    lookupCode: string;
    lookupName: string;
    values: LookupValue[];
  } | null;
}

// ============================================================================
// Advanced multi-column multi-condition filter types & helpers
// ============================================================================

type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'is_true'
  | 'is_false'
  | 'has_image'
  | 'no_image';

type FilterConnector = 'AND' | 'OR';

interface AdvancedFilter {
  id: string;
  fieldCode: string;
  operator: FilterOperator;
  value: string;
  connector: FilterConnector;
}

/** Returns the list of valid operators for a given field dataType. */
function getOperatorsForDataType(dataType: string): FilterOperator[] {
  switch (dataType) {
    case 'TEXT':
    case 'EMAIL':
    case 'URL':
      return [
        'contains',
        'equals',
        'not_equals',
        'starts_with',
        'ends_with',
        'is_empty',
        'is_not_empty',
      ];
    case 'NUMBER':
    case 'DATE':
      return [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'greater_or_equal',
        'less_or_equal',
        'is_empty',
        'is_not_empty',
      ];
    case 'BOOLEAN':
      return ['is_true', 'is_false'];
    case 'SELECT':
    case 'MULTISELECT':
    case 'LOOKUP':
      return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
    case 'IMAGE':
      return ['has_image', 'no_image', 'is_empty', 'is_not_empty'];
    default:
      return ['equals', 'is_empty', 'is_not_empty'];
  }
}

/** Human-readable label for a filter operator (used in the operator dropdown). */
function formatOperator(op: FilterOperator): string {
  const map: Record<FilterOperator, string> = {
    contains: 'contains',
    equals: 'equals',
    not_equals: 'not equals',
    starts_with: 'starts with',
    ends_with: 'ends with',
    is_empty: 'is empty',
    is_not_empty: 'is not empty',
    greater_than: 'greater than',
    less_than: 'less than',
    greater_or_equal: '≥ (greater or equal)',
    less_or_equal: '≤ (less or equal)',
    is_true: 'is true',
    is_false: 'is false',
    has_image: 'has image',
    no_image: 'no image',
  };
  return map[op] || op;
}

/** Returns true if the operator needs a value input (some operators like
 *  is_empty / is_true / has_image have no value). */
function operatorNeedsValue(op: FilterOperator): boolean {
  return !['is_empty', 'is_not_empty', 'is_true', 'is_false', 'has_image', 'no_image'].includes(op);
}

/** Evaluate a single advanced-filter condition against a row's payload. */
function evaluateCondition(
  editedPayload: Record<string, unknown>,
  originalPayload: Record<string, unknown>,
  cond: AdvancedFilter,
  fields: MetaField[],
  row?: GridRow
): boolean {
  const field = fields.find((f) => f.fieldCode === cond.fieldCode);
  if (!field) return true; // unknown field → don't filter out
  const rawVal =
    editedPayload[cond.fieldCode] ?? originalPayload[cond.fieldCode] ?? '';
  const strVal = String(rawVal ?? '');
  const isEmpty =
    rawVal === null ||
    rawVal === undefined ||
    strVal === '' ||
    strVal === 'null' ||
    strVal === 'undefined';
  const condVal = cond.value || '';

  switch (cond.operator) {
    case 'is_empty':
      return isEmpty;
    case 'is_not_empty':
      return !isEmpty;
    case 'is_true':
      return (
        rawVal === true ||
        strVal === 'true' ||
        rawVal === 1 ||
        strVal === '1'
      );
    case 'is_false':
      return (
        rawVal === false ||
        strVal === 'false' ||
        rawVal === 0 ||
        strVal === '0' ||
        isEmpty
      );
    case 'has_image': {
      if (field.dataType !== 'IMAGE' || !row) return false;
      const fieldImgs = row.imagesByField?.[cond.fieldCode] || [];
      return fieldImgs.length > 0;
    }
    case 'no_image': {
      if (field.dataType !== 'IMAGE' || !row) return true;
      const fieldImgs = row.imagesByField?.[cond.fieldCode] || [];
      return fieldImgs.length === 0;
    }
    case 'contains':
      return (
        !isEmpty &&
        strVal.toLowerCase().includes(condVal.toLowerCase())
      );
    case 'equals':
      return strVal.toLowerCase() === condVal.toLowerCase();
    case 'not_equals':
      return strVal.toLowerCase() !== condVal.toLowerCase();
    case 'starts_with':
      return (
        !isEmpty &&
        strVal.toLowerCase().startsWith(condVal.toLowerCase())
      );
    case 'ends_with':
      return (
        !isEmpty &&
        strVal.toLowerCase().endsWith(condVal.toLowerCase())
      );
    case 'greater_than':
    case 'less_than':
    case 'greater_or_equal':
    case 'less_or_equal': {
      if (isEmpty) return false;
      if (field.dataType === 'DATE') {
        const a = new Date(strVal).getTime();
        const b = new Date(condVal).getTime();
        if (isNaN(a) || isNaN(b)) return false;
        if (cond.operator === 'greater_than') return a > b;
        if (cond.operator === 'less_than') return a < b;
        if (cond.operator === 'greater_or_equal') return a >= b;
        return a <= b;
      }
      const aNum = Number(strVal);
      const bNum = Number(condVal);
      if (isNaN(aNum) || isNaN(bNum)) return false;
      if (cond.operator === 'greater_than') return aNum > bNum;
      if (cond.operator === 'less_than') return aNum < bNum;
      if (cond.operator === 'greater_or_equal') return aNum >= bNum;
      return aNum <= bNum;
    }
  }
  return false;
}

/** Evaluate a list of advanced-filter conditions against a row, combining
 *  left-to-right with the per-condition connector (the first condition has
 *  no connector). Returns true if the row passes. Empty list → true. */
function evaluateAdvancedFilters(
  editedPayload: Record<string, unknown>,
  originalPayload: Record<string, unknown>,
  conds: AdvancedFilter[],
  fields: MetaField[],
  row?: GridRow
): boolean {
  if (conds.length === 0) return true;
  let result = evaluateCondition(
    editedPayload,
    originalPayload,
    conds[0],
    fields,
    row
  );
  for (let i = 1; i < conds.length; i++) {
    const c = conds[i];
    const r = evaluateCondition(editedPayload, originalPayload, c, fields, row);
    if (c.connector === 'AND') result = result && r;
    else result = result || r;
  }
  return result;
}

/** Saved view (STIBO User Configurable Views + Sharing Saved Searches). */
interface SavedView {
  id: string;
  userId: string;
  moduleId: string;
  name: string;
  scope: 'SEARCH' | 'COLUMNS' | 'COMBINED';
  columnConfig: string | null;
  filterConfig: string | null;
  /** null = private, '*' = all in company, 'uid1,uid2' = specific users */
  sharedWith: string | null;
  isDefault: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  user?: { id: string; username: string; displayName: string | null } | null;
}

interface ModuleItem {
  id: string;
  moduleCode: string;
  moduleName: string;
}

interface GridRow {
  id: string;
  status: string;
  originalPayload: Record<string, unknown>;
  editedPayload: Record<string, unknown>;
  isDirty: boolean;
  /** Images per IMAGE-typed fieldCode. Loaded lazily from /api/images when an
   *  IMAGE cell is first interacted with (or when a row becomes dirty).
   *  Stored at the row level so it survives cell re-renders. */
  imagesByField?: Record<string, ImageInfo[]>;
  /** Tracks whether images have been loaded from the server for this row.
   *  Prevents redundant fetches. */
  imagesLoaded?: boolean;
  /** Pending image deletions — executed when the user clicks Save Changes.
   *  Each entry is the server-side imageId to delete. */
  pendingImageDeletions?: string[];
}

// ============================================================================
// Constants
// ============================================================================

// Editable statuses now include ACTIVE per the Stibo "Linking Assets &
// Products" pattern: editing an ACTIVE record submits an amendment that
// moves the record into REVISION_PENDING and opens an approval ticket,
// rather than mutating the live record silently. The grid editor marks
// such rows with an "amendment pending" visual cue.
const EDITABLE_STATUSES = new Set<string>(['DRAFT', 'REVISION_PENDING', 'ACTIVE']);
// Records that, when edited, trigger the amendment workflow (approval).
const AMENDMENT_STATUSES = new Set<string>(['ACTIVE']);

const STATUS_FILTER_TABS: Array<{ value: 'ALL' | 'DRAFT' | 'ACTIVE' | 'REVISION_PENDING'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'REVISION_PENDING', label: 'Revision Pending' },
];

const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 90;
const MAX_COL_WIDTH = 480;
const FIRST_COL_WIDTH = 168; // row #, status badge, dirty dot

// ============================================================================
// Helpers
// ============================================================================

function shallowEqualPayload(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = a[k];
    const bv = b[k];
    if (String(av ?? '') !== String(bv ?? '')) return false;
  }
  return true;
}

function safeParsePayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Group a flat list of images by their fieldName. Images with no fieldName
 *  are placed under the 'images' key (the default IMAGE fieldCode convention). */
function groupImagesByField(images: ImageInfo[]): Record<string, ImageInfo[]> {
  const out: Record<string, ImageInfo[]> = {};
  for (const img of images) {
    const key = img.fieldName || 'images';
    if (!out[key]) out[key] = [];
    out[key].push(img);
  }
  return out;
}

/** Build a payload that passes API validation for a brand-new row.
 *  Required fields get sensible defaults (unique TEXT gets a timestamp suffix,
 *  required SELECT/MULTISELECT gets the first lookup value). */
function buildDefaultPayload(fields: MetaField[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const stamp = Date.now();
  for (const f of fields) {
    if (f.dataType === 'IMAGE') continue;
    if (f.defaultValue) {
      payload[f.fieldCode] = f.defaultValue;
      continue;
    }
    if (f.isRequired) {
      switch (f.dataType) {
        case 'TEXT':
        case 'EMAIL':
        case 'URL':
          payload[f.fieldCode] = f.isUnique ? `NEW-${stamp}` : '(new)';
          break;
        case 'NUMBER':
          payload[f.fieldCode] = 0;
          break;
        case 'DATE':
          payload[f.fieldCode] = new Date().toISOString().slice(0, 10);
          break;
        case 'BOOLEAN':
          payload[f.fieldCode] = false;
          break;
        case 'SELECT':
        case 'LOOKUP':
        case 'MULTISELECT': {
          const vals = f.lookupMaster?.values || [];
          payload[f.fieldCode] = vals[0]?.valueCode ?? '';
          break;
        }
        default:
          payload[f.fieldCode] = '';
      }
    } else {
      // Non-required: start empty
      switch (f.dataType) {
        case 'BOOLEAN':
          payload[f.fieldCode] = false;
          break;
        case 'NUMBER':
          payload[f.fieldCode] = '';
          break;
        default:
          payload[f.fieldCode] = '';
      }
    }
  }
  return payload;
}

// ============================================================================
// Component
// ============================================================================

export default function GridEditorPage() {
  const { token, user, navigate, selectedModuleId } = useAppStore();

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string>(selectedModuleId || '');
  const [fields, setFields] = useState<MetaField[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingRow, setAddingRow] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'ACTIVE' | 'REVISION_PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [isDraggingCol, setIsDraggingCol] = useState(false);

  const [saveErrors, setSaveErrors] = useState<Array<{ id: string; error: string }>>([]);
  const [showErrors, setShowErrors] = useState(false);
  /** Popover anchor for the IMAGE cell popover (in-grid image manager). */
  const [imagePopover, setImagePopover] = useState<{ rowId: string; fieldCode: string } | null>(null);
  /** Advanced filter builder state: an array of AND/OR conditions. */
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilter[]>([]);
  /** Toggles visibility of the advanced-filter builder panel. */
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  /** Lightbox overlay state: holds the image list + current index. */
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  // ── Saved Views state (STIBO User Configurable Views + Sharing Saved Searches) ──
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeSavedView, setActiveSavedView] = useState<SavedView | null>(null);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [showManageViewsDialog, setShowManageViewsDialog] = useState(false);
  const [saveViewForm, setSaveViewForm] = useState<{
    name: string;
    scope: 'SEARCH' | 'COLUMNS' | 'COMBINED';
    shareWith: 'private' | 'company' | 'specific';
    specificUserIds: string;
    isDefault: boolean;
  }>({ name: '', scope: 'COMBINED', shareWith: 'private', specificUserIds: '', isDefault: false });
  const [savingView, setSavingView] = useState(false);

  // Refs for column resize drag
  const dragRef = useRef<{ fieldCode: string; startX: number; startWidth: number } | null>(null);

  // Refs to focus inputs
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  // ── Pending image upload state (kept in refs, not React state, because
  //    File objects are not serialisable and would trigger wasteful
  //    re-renders). These maps are drained when the user clicks Save. ──
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const primaryChangesRef = useRef<Map<string, string>>(new Map());

  // ----------------------------------------------------------------
  // Data loaders
  // ----------------------------------------------------------------
  const loadModules = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/modules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const list: ModuleItem[] = (data.modules || []).map((m: { id: string; moduleCode: string; moduleName: string }) => ({
        id: m.id,
        moduleCode: m.moduleCode,
        moduleName: m.moduleName,
      }));
      setModules(list);
      if (!activeModuleId && list.length > 0) {
        setActiveModuleId(list[0].id);
      }
    } catch {
      // silent
    }
  }, [token, activeModuleId]);

  /** Bulk-load server-side images for ALL rows in the grid. Called after the
   *  initial data fetch (and after refresh / save) so thumbnails render
   *  immediately, rather than only when an IMAGE cell is opened. Fetches are
   *  chunked (8 in parallel) to avoid hammering the server. The grid renders
   *  the rows first (without images) and each chunk updates the relevant
   *  rows' `imagesByField` as it resolves — non-blocking. */
  const loadAllRowImages = useCallback(
    async (rowIds: string[]) => {
      if (!token || rowIds.length === 0) return;
      const CHUNK_SIZE = 8;
      for (let i = 0; i < rowIds.length; i += CHUNK_SIZE) {
        const chunk = rowIds.slice(i, i + CHUNK_SIZE);
        const chunkSet = new Set(chunk);
        // Mark as loaded first to prevent duplicate fetches from
        // ensureRowImages (which may be triggered concurrently by the user
        // opening an IMAGE cell popover while the bulk load is in flight).
        setRows((prev) =>
          prev.map((r) =>
            chunkSet.has(r.id) && !r.imagesLoaded
              ? { ...r, imagesLoaded: true }
              : r
          )
        );
        const results = await Promise.all(
          chunk.map(
            async (rid): Promise<{ rid: string; imgs: ImageInfo[] }> => {
              try {
                const res = await fetch(`/api/images?recordId=${rid}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return { rid, imgs: [] };
                const data = await res.json();
                const imgs: ImageInfo[] = (data.images || []).map(
                  (img: Record<string, unknown>) => ({
                    id: String(img.id),
                    fileName: String(img.fileName || ''),
                    filePath: String(img.filePath || ''),
                    altText: (img.altText as string) || null,
                    isPrimary: Boolean(img.isPrimary),
                    sortOrder: Number(img.sortOrder || 0),
                    fieldName: (img.fieldName as string) || null,
                    variants: (img.variants as Record<string, string>) || undefined,
                  })
                );
                return { rid, imgs };
              } catch {
                return { rid, imgs: [] };
              }
            }
          )
        );
        setRows((prev) =>
          prev.map((r) => {
            const found = results.find((x) => x.rid === r.id);
            if (!found) return r;
            return { ...r, imagesByField: groupImagesByField(found.imgs) };
          })
        );
      }
    },
    [token]
  );

  const loadFieldsAndRecords = useCallback(async () => {
    if (!token || !activeModuleId) return;
    setLoading(true);
    try {
      // Fetch fields + records in parallel
      const [fRes, rRes] = await Promise.all([
        fetch(`/api/fields?moduleId=${activeModuleId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/records?moduleId=${activeModuleId}&limit=500`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const fData = await fRes.json();
      const rData = await rRes.json();
      const fList: MetaField[] = fData.fields || [];
      setFields(fList);

      // Initialize column widths from field list
      setColWidths((prev) => {
        const next: Record<string, number> = { ...prev };
        for (const f of fList) {
          if (!next[f.fieldCode]) next[f.fieldCode] = DEFAULT_COL_WIDTH;
        }
        return next;
      });

      const dataRows: GridRow[] = (rData.data || []).map((r: { id: string; status: string; currentPayload: string | null }) => {
        const payload = safeParsePayload(r.currentPayload);
        return {
          id: r.id,
          status: r.status,
          originalPayload: payload,
          editedPayload: { ...payload },
          isDirty: false,
        };
      });
      setRows(dataRows);
      setSaveErrors([]);
      setShowErrors(false);
      setActiveCell(null);
      // Load images for ALL rows in the background (non-blocking). The grid
      // renders immediately with empty thumbnails, then images fill in as
      // each chunk of /api/images responses resolves. This fixes the user's
      // complaint that "gambar di grid view tidak muncul" — previously
      // images were only fetched lazily when the image popover was opened or
      // when a row became dirty.
      if (dataRows.length > 0) {
        void loadAllRowImages(dataRows.map((r) => r.id));
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, activeModuleId, loadAllRowImages]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  useEffect(() => {
    if (activeModuleId) {
      loadFieldsAndRecords();
    } else {
      setFields([]);
      setRows([]);
    }
  }, [activeModuleId, loadFieldsAndRecords]);

  // ----------------------------------------------------------------
  // Derived state
  // ----------------------------------------------------------------
  // A row is "dirty" if either (a) its payload fields have been edited, or
  // (b) it has pending image uploads/deletions that haven't been flushed yet.
  const dirtyCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.isDirty ||
          (r.imagesByField && Object.values(r.imagesByField).some((imgs) => imgs.some((i) => i.pending))) ||
          (r.pendingImageDeletions && r.pendingImageDeletions.length > 0)
      ).length,
    [rows]
  );

  const filteredRows = useMemo(() => {
    let result = rows;
    if (statusFilter !== 'ALL') {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const statusMatch = (r.status || '').toLowerCase().includes(q);
        if (statusMatch) return true;
        return Object.values(r.editedPayload).some((v) => String(v ?? '').toLowerCase().includes(q));
      });
    }
    if (advancedFilters.length > 0) {
      result = result.filter((r) =>
        evaluateAdvancedFilters(r.editedPayload, r.originalPayload, advancedFilters, fields, r)
      );
    }
    return result;
  }, [rows, statusFilter, searchQuery, advancedFilters, fields]);

  const editableCount = useMemo(
    () => rows.filter((r) => EDITABLE_STATUSES.has(r.status)).length,
    [rows]
  );

  // ----------------------------------------------------------------
  // Image management (in-grid, deferred save)
  // ----------------------------------------------------------------
  /** Lazily load server-side images for a row the first time an IMAGE cell
   *  is opened. Stored at the row level so it survives cell re-renders. */
  const ensureRowImages = useCallback(
    async (rowId: string) => {
      // Check if already loaded (read current state via setRows callback to
      // avoid stale closure issues).
      let needFetch = false;
      setRows((prev) => {
        const row = prev.find((r) => r.id === rowId);
        if (!row) return prev;
        if (row.imagesLoaded) return prev;
        needFetch = true;
        // Mark as loaded immediately to prevent duplicate fetches
        return prev.map((r) => (r.id === rowId ? { ...r, imagesLoaded: true } : r));
      });
      if (!needFetch || !token) return;
      try {
        const res = await fetch(`/api/images?recordId=${rowId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const imgs: ImageInfo[] = (data.images || []).map((img: Record<string, unknown>) => ({
          id: String(img.id),
          fileName: String(img.fileName || ''),
          filePath: String(img.filePath || ''),
          altText: (img.altText as string) || null,
          isPrimary: Boolean(img.isPrimary),
          sortOrder: Number(img.sortOrder || 0),
          fieldName: (img.fieldName as string) || null,
          variants: (img.variants as Record<string, string>) || undefined,
        }));
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? { ...r, imagesByField: groupImagesByField(imgs) }
              : r
          )
        );
      } catch {
        // silent — the cell will just show "no images"
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, imagesLoaded: false } : r))
        );
      }
    },
    [token]
  );

  /** Add pending image uploads to a row. The files are converted to blob URLs
   *  for instant preview; they are NOT sent to the server until the user
   *  clicks Save Changes. This fixes the user's complaint that images were
   *  "saved before I clicked Save". */
  const addPendingImages = useCallback(
    (rowId: string, fieldCode: string, files: FileList | File[]) => {
      const fileArr = Array.from(files);
      if (fileArr.length === 0) return;
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;
          const existing = row.imagesByField || {};
          const fieldImgs = existing[fieldCode] || [];
          const newPending: ImageInfo[] = fileArr.map((file, i) => ({
            id: `pending-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: file.name,
            filePath: URL.createObjectURL(file),
            altText: file.name,
            isPrimary: fieldImgs.length === 0 && i === 0,
            sortOrder: fieldImgs.length + i,
            fieldName: fieldCode,
            pending: true,
          }));
          // Keep the File objects around for the save step — attach via a
          // module-level Map (not React state, since File isn't serializable
          // and would bloat re-renders).
          for (const p of newPending) {
            const file = fileArr[newPending.indexOf(p)];
            pendingFilesRef.current.set(p.id, file);
          }
          return {
            ...row,
            imagesByField: { ...existing, [fieldCode]: [...fieldImgs, ...newPending] },
            isDirty: true, // mark row dirty so Save button enables
          };
        })
      );
    },
    []
  );

  /** Queue an image for deletion (executed on Save). Pending images are
   *  removed immediately (no server call needed). */
  const removeImage = useCallback((rowId: string, fieldCode: string, imageId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const existing = row.imagesByField || {};
        const fieldImgs = existing[fieldCode] || [];
        const target = fieldImgs.find((i) => i.id === imageId);
        const remaining = fieldImgs.filter((i) => i.id !== imageId);
        const nextImagesByField = { ...existing, [fieldCode]: remaining };
        if (target?.pending) {
          // Pending image — just drop it locally (revoke blob URL)
          URL.revokeObjectURL(target.filePath);
          pendingFilesRef.current.delete(imageId);
        } else {
          // Server image — queue for deletion on Save
          const pendingDeletions = row.pendingImageDeletions || [];
          if (!pendingDeletions.includes(imageId)) {
            pendingDeletions.push(imageId);
          }
          return {
            ...row,
            imagesByField: nextImagesByField,
            pendingImageDeletions: pendingDeletions,
            isDirty: true,
          };
        }
        return { ...row, imagesByField: nextImagesByField, isDirty: true };
      })
    );
  }, []);

  /** Mark an image as primary (executed on Save via PATCH). For now, just
   *  updates the local state optimistically. */
  const setPrimaryImage = useCallback((rowId: string, fieldCode: string, imageId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const existing = row.imagesByField || {};
        const fieldImgs = existing[fieldCode] || [];
        const updated = fieldImgs.map((img) => ({
          ...img,
          isPrimary: img.id === imageId,
        }));
        // Track the primary change for the save step
        primaryChangesRef.current.set(`${rowId}:${fieldCode}`, imageId);
        return {
          ...row,
          imagesByField: { ...existing, [fieldCode]: updated },
          isDirty: true,
        };
      })
    );
  }, []);

  // ----------------------------------------------------------------
  // Cell editing helpers
  // ----------------------------------------------------------------
  const setCellValue = useCallback(
    (rowId: string, fieldCode: string, value: unknown) => {
      setRows((prev) => {
        const next = prev.map((row) => {
          if (row.id !== rowId) return row;
          const editedPayload = { ...row.editedPayload, [fieldCode]: value };
          // Cascade: if this field is a parent of another field, clear children
          // whose parentValueCode no longer matches the new value.
          for (const f of fields) {
            if (f.cascadesFromFieldCode === fieldCode) {
              const childVal = editedPayload[f.fieldCode];
              if (childVal && childVal !== '') {
                const lookupValues = f.lookupMaster?.values || [];
                const stillValid = lookupValues.some(
                  (v) => v.valueCode === childVal && (v.parentValueCode || '') === (value || '')
                );
                if (!stillValid) {
                  editedPayload[f.fieldCode] = '';
                }
              }
            }
          }
          const isDirty = !shallowEqualPayload(editedPayload, row.originalPayload);
          return { ...row, editedPayload, isDirty };
        });
        return next;
      });
    },
    [fields]
  );

  const revertRow = useCallback((rowId: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, editedPayload: { ...row.originalPayload }, isDirty: false }
          : row
      )
    );
  }, []);

  const discardAll = useCallback(() => {
    // Revoke any pending blob URLs + clear the pending file/primary maps
    for (const row of rows) {
      if (!row.imagesByField) continue;
      for (const imgs of Object.values(row.imagesByField)) {
        for (const img of imgs) {
          if (img.pending) URL.revokeObjectURL(img.filePath);
        }
      }
    }
    pendingFilesRef.current.clear();
    primaryChangesRef.current.clear();
    setRows((prev) =>
      prev.map((row) =>
        row.isDirty
          ? {
              ...row,
              editedPayload: { ...row.originalPayload },
              isDirty: false,
              imagesByField: undefined, // force re-fetch from server
              imagesLoaded: false,
              pendingImageDeletions: [],
            }
          : row
      )
    );
    setSaveErrors([]);
    setShowErrors(false);
    toast.info('Unsaved changes discarded');
  }, [rows]);

  // ----------------------------------------------------------------
  // Keyboard navigation
  // ----------------------------------------------------------------
  const moveCell = useCallback(
    (dRow: number, dCol: number) => {
      setActiveCell((curr) => {
        if (!curr) return curr;
        const totalCols = fields.length;
        const totalRows = filteredRows.length;
        let newRow = curr.rowIdx + dRow;
        let newCol = curr.colIdx + dCol;
        // Wrap horizontally
        while (newCol < 0) {
          newCol = totalCols - 1;
          newRow -= 1;
        }
        while (newCol >= totalCols) {
          newCol = 0;
          newRow += 1;
        }
        // Clamp vertically
        if (newRow < 0) newRow = 0;
        if (newRow >= totalRows) newRow = totalRows - 1;
        if (newRow < 0 || totalRows === 0) return curr;
        return { rowIdx: newRow, colIdx: newCol };
      });
    },
    [fields.length, filteredRows.length]
  );

  // Focus active cell's input on change
  useEffect(() => {
    if (!activeCell) return;
    const row = filteredRows[activeCell.rowIdx];
    if (!row) return;
    const field = fields[activeCell.colIdx];
    if (!field) return;
    const key = `${row.id}__${field.fieldCode}`;
    // Defer focus to next tick so the input is rendered
    const t = setTimeout(() => {
      const el = inputRefs.current[key];
      if (el && document.activeElement !== el) {
        el.focus();
        if (el instanceof HTMLInputElement && el.type !== 'checkbox') {
          el.select();
        }
      }
    }, 0);
    return () => clearTimeout(t);
  }, [activeCell, filteredRows, fields]);

  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLElement>,
      rowId: string,
      rowIdx: number,
      colIdx: number,
      field: MetaField,
      currentValue: unknown
    ) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      const isTextInput =
        target instanceof HTMLInputElement &&
        target.type !== 'checkbox' &&
        target.type !== 'radio';

      // ENTER → move down
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        moveCell(1, 0);
        return;
      }
      // SHIFT+ENTER → move up
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        moveCell(-1, 0);
        return;
      }
      // TAB → move right; SHIFT+TAB → move left
      if (e.key === 'Tab') {
        e.preventDefault();
        moveCell(0, e.shiftKey ? -1 : 1);
        return;
      }
      // ESCAPE → revert cell to original
      if (e.key === 'Escape') {
        e.preventDefault();
        const row = rows.find((r) => r.id === rowId);
        const origVal = row?.originalPayload[field.fieldCode] ?? '';
        setCellValue(rowId, field.fieldCode, origVal);
        (target as HTMLInputElement).blur();
        return;
      }
      // CTRL/CMD + Backspace or Delete → clear cell
      if ((e.key === 'Backspace' || e.key === 'Delete') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setCellValue(rowId, field.fieldCode, '');
        return;
      }
      // Arrow-key navigation when at text bounds
      if (isTextInput && target instanceof HTMLInputElement) {
        const atStart = target.selectionStart === 0;
        const atEnd =
          target.selectionStart === target.value.length &&
          target.selectionEnd === target.value.length;
        if (e.key === 'ArrowDown' && (atEnd || target.value === '')) {
          e.preventDefault();
          moveCell(1, 0);
          return;
        }
        if (e.key === 'ArrowUp' && (atStart || target.value === '')) {
          e.preventDefault();
          moveCell(-1, 0);
          return;
        }
        if (e.key === 'ArrowRight' && atEnd) {
          e.preventDefault();
          moveCell(0, 1);
          return;
        }
        if (e.key === 'ArrowLeft' && atStart) {
          e.preventDefault();
          moveCell(0, -1);
          return;
        }
      }
      // For non-text inputs (checkbox, select): arrow keys move between cells
      if (!isTextInput) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveCell(1, 0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveCell(-1, 0);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveCell(0, 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveCell(0, -1);
        }
      }
      void currentValue;
      void rowIdx;
      void colIdx;
    },
    [moveCell, rows, setCellValue]
  );

  // ----------------------------------------------------------------
  // Column resize drag handlers
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!isDraggingCol) return;
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const newW = Math.min(
        MAX_COL_WIDTH,
        Math.max(MIN_COL_WIDTH, dragRef.current.startWidth + dx)
      );
      setColWidths((prev) => ({ ...prev, [dragRef.current!.fieldCode]: newW }));
    }
    function onUp() {
      dragRef.current = null;
      setIsDraggingCol(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingCol]);

  // While dragging, suppress text selection + show col-resize cursor globally.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isDraggingCol) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingCol]);

  const startColResize = (e: React.MouseEvent, fieldCode: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = colWidths[fieldCode] || DEFAULT_COL_WIDTH;
    dragRef.current = { fieldCode, startX: e.clientX, startWidth };
    setIsDraggingCol(true);
  };

  const autoFitCol = (fieldCode: string) => {
    // Double-click → reset to default width (simple auto-fit heuristic)
    setColWidths((prev) => ({ ...prev, [fieldCode]: DEFAULT_COL_WIDTH }));
  };

  // ----------------------------------------------------------------
  // Add row / save / refresh
  // ----------------------------------------------------------------
  const addRow = async () => {
    if (!token || !activeModuleId) return;
    setAddingRow(true);
    try {
      const payload = buildDefaultPayload(fields);
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ moduleId: activeModuleId, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || (data.errors && data.errors.join('; ')) || 'Failed to create row';
        toast.error(msg);
        return;
      }
      toast.success('New row added');
      await loadFieldsAndRecords();
      // Move focus to the new row's first editable cell
      setTimeout(() => {
        // Find the new row by updatedAt desc — or just open the first cell
        if (filteredRows.length === 0 && rows.length === 0) return;
        setActiveCell({ rowIdx: 0, colIdx: 0 });
      }, 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create row');
    } finally {
      setAddingRow(false);
    }
  };

  const saveChanges = async () => {
    if (!token || dirtyCount === 0) return;
    setSaving(true);
    setSaveErrors([]);
    setShowErrors(false);
    try {
      // ── Step 1: Flush pending image operations (uploads + deletions +
      //    primary-image changes) for every dirty row. This runs BEFORE the
      //    record payload save so that the "deferred save" model holds:
      //    images are only persisted when the user clicks Save Changes, not
      //    when they pick a file. (Stibo best practice: asset maintenance
      //    is part of the record's change transaction.) ──
      let imageOpsOk = 0;
      let imageOpsFail = 0;
      for (const row of rows) {
        if (!row.isDirty) continue;
        // 1a. Upload pending files
        const pendingUploads = Object.values(row.imagesByField || {})
          .flat()
          .filter((img) => img.pending);
        for (const img of pendingUploads) {
          const file = pendingFilesRef.current.get(img.id);
          if (!file) continue;
          const formData = new FormData();
          formData.append('file', file);
          formData.append('recordId', row.id);
          formData.append('fieldName', img.fieldName || 'images');
          formData.append('isPrimary', String(img.isPrimary));
          if (img.altText) formData.append('altText', img.altText);
          try {
            const upRes = await fetch('/api/images', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });
            if (upRes.ok) {
              imageOpsOk++;
              pendingFilesRef.current.delete(img.id);
            } else {
              imageOpsFail++;
              const d = await upRes.json().catch(() => ({}));
              console.error('Image upload failed:', d);
            }
          } catch {
            imageOpsFail++;
          }
        }
        // 1b. Execute pending deletions
        for (const imageId of row.pendingImageDeletions || []) {
          try {
            const delRes = await fetch(`/api/images?imageId=${imageId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (delRes.ok) imageOpsOk++;
            else imageOpsFail++;
          } catch {
            imageOpsFail++;
          }
        }
        // 1c. Execute primary-image changes
        for (const [key, imageId] of primaryChangesRef.current.entries()) {
          if (!key.startsWith(row.id + ':')) continue;
          try {
            const pRes = await fetch(`/api/images?imageId=${imageId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({}),
            });
            if (pRes.ok) {
              imageOpsOk++;
              primaryChangesRef.current.delete(key);
            } else {
              imageOpsFail++;
            }
          } catch {
            imageOpsFail++;
          }
        }
      }

      // ── Step 2: Save the record payload changes (text/number/select/etc.)
      //    Only rows where the payload actually changed (excluding IMAGE
      //    fields, which are managed separately) are sent. A row may be
      //    dirty solely due to image ops — in that case it's skipped here. ──
      const changes = rows
        .filter((r) => {
          if (!r.isDirty) return false;
          // Compare payloads excluding IMAGE fields
          const payloadFields = fields.filter((f) => f.dataType !== 'IMAGE');
          for (const f of payloadFields) {
            const a = r.originalPayload[f.fieldCode];
            const b = r.editedPayload[f.fieldCode];
            if (String(a ?? '') !== String(b ?? '')) return true;
          }
          return false;
        })
        .map((r) => ({ id: r.id, payload: r.editedPayload }));

      let updatedCount = 0;
      let errorCount = 0;
      let amendmentCount = 0;
      let errList: Array<{ id: string; error: string }> = [];

      if (changes.length > 0) {
        const res = await fetch('/api/records?action=bulk-update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ changes }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Save failed');
          return;
        }
        updatedCount = data.updatedCount ?? 0;
        errorCount = data.errorCount ?? 0;
        amendmentCount = data.amendmentCount ?? 0;
        errList = data.errors || [];
      }

      // Add image-op failures to the error list
      if (imageOpsFail > 0) {
        errList = [
          ...errList,
          { id: '(images)', error: `${imageOpsFail} image operation(s) failed (see console)` },
        ];
        errorCount += imageOpsFail;
      }

      // Build the toast message
      const parts: string[] = [];
      if (updatedCount > 0) parts.push(`${updatedCount} record${updatedCount !== 1 ? 's' : ''} saved`);
      if (amendmentCount > 0) parts.push(`${amendmentCount} amendment${amendmentCount !== 1 ? 's' : ''} pending approval`);
      if (imageOpsOk > 0) parts.push(`${imageOpsOk} image op${imageOpsOk !== 1 ? 's' : ''}`);
      if (parts.length > 0) toast.success(parts.join(' · '));
      if (errorCount > 0) {
        toast.error(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
        setSaveErrors(errList);
        setShowErrors(true);
      }
      // Reload to refresh updatedAt + drop dirty flags for successfully saved rows.
      // (We reload all; the failed rows' edited values are lost on reload — but
      //  the user can re-apply changes from the error list.)
      await loadFieldsAndRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    if (dirtyCount > 0) {
      const ok = window.confirm(
        `You have ${dirtyCount} unsaved change${dirtyCount !== 1 ? 's' : ''}. Discard and reload from server?`
      );
      if (!ok) return;
    }
    await loadFieldsAndRecords();
    toast.info('Refreshed from server');
  };

  // ----------------------------------------------------------------
  // Saved Views (STIBO User Configurable Views + Sharing Saved Searches)
  // ----------------------------------------------------------------
  /** Apply a saved view: parse filterConfig JSON (AdvancedFilter[]) and set
   *  advancedFilters. Best-effort PUT to bump lastUsedAt server-side. */
  const applySavedView = useCallback(
    (view: SavedView) => {
      let nextFilters: AdvancedFilter[] = [];
      if (view.filterConfig) {
        try {
          const parsed = JSON.parse(view.filterConfig);
          if (Array.isArray(parsed)) nextFilters = parsed as AdvancedFilter[];
        } catch {
          // malformed filterConfig — leave empty
        }
      }
      setAdvancedFilters(nextFilters);
      if (nextFilters.length > 0) setShowAdvancedFilter(true);
      setActiveSavedView(view);
      // Touch lastUsedAt (PUT with just the id bumps lastUsedAt server-side)
      if (token) {
        fetch('/api/saved-views', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: view.id }),
        }).catch(() => {});
      }
      toast.success(`Applied view: ${view.name}`);
    },
    [token]
  );

  /** Load saved views for a module. Uses localStorage as a quick cache for
   *  instant paint, then refreshes from the API. */
  const loadSavedViews = useCallback(
    async (moduleId: string) => {
      if (!token) return;
      // localStorage cache — instant paint
      try {
        const cached = localStorage.getItem(`saved-views:${moduleId}`);
        if (cached) {
          const parsed = JSON.parse(cached) as SavedView[];
          if (Array.isArray(parsed)) setSavedViews(parsed);
        }
      } catch {
        // ignore cache errors
      }
      try {
        const res = await fetch(`/api/saved-views?moduleId=${moduleId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const views: SavedView[] = ((data.views || []) as Record<string, unknown>[]).map((v) => ({
          id: String(v.id),
          userId: String(v.userId),
          moduleId: String(v.moduleId),
          name: String(v.name),
          scope: (v.scope as 'SEARCH' | 'COLUMNS' | 'COMBINED') || 'COMBINED',
          columnConfig: (v.columnConfig as string) || null,
          filterConfig: (v.filterConfig as string) || null,
          sharedWith: (v.sharedWith as string) || null,
          isDefault: Boolean(v.isDefault),
          lastUsedAt: v.lastUsedAt ? String(v.lastUsedAt) : null,
          createdAt: String(v.createdAt),
          user: v.user as { id: string; username: string; displayName: string | null } | null,
        }));
        setSavedViews(views);
        try {
          localStorage.setItem(`saved-views:${moduleId}`, JSON.stringify(views));
        } catch {
          // ignore quota errors
        }
      } catch {
        // silent
      }
    },
    [token]
  );

  /** Save the current advancedFilters + column widths as a new saved view. */
  const saveCurrentView = useCallback(async () => {
    if (!token || !activeModuleId) return;
    const name = saveViewForm.name.trim();
    if (!name) {
      toast.error('View name is required');
      return;
    }
    setSavingView(true);
    try {
      const filterConfig = JSON.stringify(advancedFilters);
      const columnConfig = JSON.stringify({
        colWidths,
        visibleFields: fields.map((f) => f.fieldCode),
      });
      const sharedWith =
        saveViewForm.shareWith === 'company'
          ? '*'
          : saveViewForm.shareWith === 'specific'
            ? saveViewForm.specificUserIds.trim()
            : null;
      const res = await fetch('/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          moduleId: activeModuleId,
          name,
          scope: saveViewForm.scope,
          columnConfig,
          filterConfig,
          sharedWith: sharedWith || null,
          isDefault: saveViewForm.isDefault,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error || 'Failed to save view');
        return;
      }
      const data = await res.json();
      const created = data.view as SavedView;
      toast.success(`Saved view "${name}"`);
      setShowSaveViewDialog(false);
      setSaveViewForm({ name: '', scope: 'COMBINED', shareWith: 'private', specificUserIds: '', isDefault: false });
      await loadSavedViews(activeModuleId);
      if (created) applySavedView(created);
    } catch {
      toast.error('Failed to save view');
    } finally {
      setSavingView(false);
    }
  }, [token, activeModuleId, saveViewForm, advancedFilters, colWidths, fields, loadSavedViews, applySavedView]);

  /** Delete a saved view (owner only — the API enforces it). */
  const deleteSavedView = useCallback(
    async (viewId: string, viewName: string) => {
      if (!token) return;
      if (!window.confirm(`Delete saved view "${viewName}"? This cannot be undone.`)) return;
      try {
        const res = await fetch('/api/saved-views', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: viewId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error((err as { error?: string }).error || 'Failed to delete view');
          return;
        }
        toast.success(`Deleted view "${viewName}"`);
        if (activeSavedView?.id === viewId) {
          setActiveSavedView(null);
          setAdvancedFilters([]);
        }
        if (activeModuleId) await loadSavedViews(activeModuleId);
      } catch {
        toast.error('Failed to delete view');
      }
    },
    [token, activeSavedView, activeModuleId, loadSavedViews]
  );

  // Load saved views when the active module changes (STIBO User Configurable
  // Views). Resets the active view since filters don't carry across modules.
  useEffect(() => {
    if (activeModuleId) {
      setActiveSavedView(null);
      void loadSavedViews(activeModuleId);
    } else {
      setSavedViews([]);
      setActiveSavedView(null);
    }
  }, [activeModuleId, loadSavedViews]);

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  if (!activeModuleId && !loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <Header
          modules={modules}
          activeModuleId={activeModuleId}
          onModuleChange={setActiveModuleId}
          onBack={() => navigate('data-records', { moduleId: activeModuleId || selectedModuleId || '' })}
        />
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <LayoutGrid className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Select a module</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Choose a module to load its records into the grid editor
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="p-3 lg:p-4 space-y-3">
          <Header
            modules={modules}
            activeModuleId={activeModuleId}
            onModuleChange={setActiveModuleId}
            onBack={() => navigate('data-records', { moduleId: activeModuleId || selectedModuleId || '' })}
          />

          {/* Toolbar row 1: filters + actions */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
            {/* Status filter tabs */}
            <div className="inline-flex items-center bg-muted rounded-md p-0.5 h-9">
              {STATUS_FILTER_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setStatusFilter(t.value)}
                  className={cn(
                    'px-3 h-8 text-xs font-medium rounded transition-colors',
                    statusFilter === t.value
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search box */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search any field..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Advanced Filter toggle button */}
            <Button
              variant={showAdvancedFilter ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-9',
                showAdvancedFilter && 'bg-red-600 hover:bg-red-700 text-white'
              )}
              onClick={() => setShowAdvancedFilter((v) => !v)}
              title="Advanced multi-column filter builder"
            >
              <SlidersHorizontal className="w-4 h-4 mr-1.5" />
              Advanced
              {advancedFilters.length > 0 && (
                <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-white/20 border-white/30 text-white">
                  {advancedFilters.length}
                </Badge>
              )}
            </Button>

            {/* Saved Views dropdown (STIBO User Configurable Views + Sharing Saved Searches) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  title="Saved views — apply, save, or manage"
                >
                  <BookmarkPlus className="w-4 h-4 mr-1.5" />
                  Views
                  <ChevronDown className="w-3 h-3 ml-1.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <SavedViewsList
                  views={savedViews}
                  currentUserId={user?.userId}
                  activeViewId={activeSavedView?.id}
                  onApply={(v) => applySavedView(v)}
                  onSaveCurrent={() => {
                    setSaveViewForm({ name: '', scope: 'COMBINED', shareWith: 'private', specificUserIds: '', isDefault: false });
                    setShowSaveViewDialog(true);
                  }}
                  onManage={() => setShowManageViewsDialog(true)}
                />
              </PopoverContent>
            </Popover>
            {activeSavedView && (
              <Badge
                variant="outline"
                className="bg-red-50 border-red-200 text-red-700 h-6"
                title={`Active view: ${activeSavedView.name}`}
              >
                <BookmarkCheck className="w-3 h-3 mr-1" />
                <span className="max-w-[120px] truncate">{activeSavedView.name}</span>
                <button
                  type="button"
                  onClick={() => { setActiveSavedView(null); setAdvancedFilters([]); }}
                  className="ml-1 hover:text-red-900"
                  aria-label="Clear active view"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={addRow}
                disabled={addingRow || loading}
              >
                {addingRow ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                Add Row
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={discardAll}
                disabled={dirtyCount === 0 || saving}
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Discard
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={refresh}
                disabled={loading || saving}
              >
                <RefreshCw className={cn('w-4 h-4 mr-1.5', loading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                size="sm"
                className="h-9 bg-red-600 hover:bg-red-700 text-white"
                onClick={saveChanges}
                disabled={dirtyCount === 0 || saving || loading}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1.5" />
                )}
                Save Changes
              </Button>
              {dirtyCount > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 h-6">
                  {dirtyCount} unsaved change{dirtyCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          {/* Toolbar row 2: summary */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ListFilter className="w-3.5 h-3.5" />
            <span>
              Showing <span className="font-medium text-foreground">{filteredRows.length}</span> of{' '}
              <span className="font-medium text-foreground">{rows.length}</span> records ·{' '}
              <span className="font-medium text-foreground">{editableCount}</span> editable
              {statusFilter !== 'ALL' && <span> · filtered by {statusFilter}</span>}
              {searchQuery && <span> · matching &ldquo;{searchQuery}&rdquo;</span>}
              {advancedFilters.length > 0 && (
                <span className="text-red-700 font-medium">
                  {' '}· {advancedFilters.length} advanced filter{advancedFilters.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>

          {/* Toolbar row 3: Advanced Filter builder panel (collapsible) */}
          {showAdvancedFilter && (
            <Card className="shadow-sm border-red-200">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-red-600" />
                    Advanced Filter
                    <span className="text-muted-foreground font-normal">
                      · pick columns + operators + values, combine with AND/OR
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setAdvancedFilters([])}
                      disabled={advancedFilters.length === 0}
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {advancedFilters.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      No filter conditions. Click &ldquo;Add Condition&rdquo; to narrow down records by specific columns.
                    </p>
                  )}
                  {advancedFilters.map((cond, i) => (
                    <AdvancedFilterRow
                      key={cond.id}
                      filter={cond}
                      isFirst={i === 0}
                      fields={fields}
                      onChange={(next) =>
                        setAdvancedFilters((prev) =>
                          prev.map((f) => (f.id === cond.id ? next : f))
                        )
                      }
                      onRemove={() =>
                        setAdvancedFilters((prev) => prev.filter((f) => f.id !== cond.id))
                      }
                    />
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const filterableFields = fields;
                    const firstField = filterableFields[0];
                    setAdvancedFilters((prev) => [
                      ...prev,
                      {
                        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        fieldCode: firstField?.fieldCode || '',
                        operator: firstField
                          ? getOperatorsForDataType(firstField.dataType)[0]
                          : 'contains',
                        value: '',
                        connector: 'AND',
                      },
                    ]);
                  }}
                  disabled={fields.length === 0}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Condition
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden p-3 lg:p-4 pt-3">
        {loading ? (
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <div className="p-3 space-y-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : filteredRows.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center">
              <LayoutGrid className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">No records to display</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchQuery || statusFilter !== 'ALL' || advancedFilters.length > 0
                  ? 'Try adjusting your filters'
                  : 'Add a row to get started'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setAdvancedFilters([]);
                }}
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="h-full flex flex-col gap-3">
            <Card className="shadow-sm flex-1 min-h-0 overflow-hidden">
              <CardContent className="p-0 h-full">
                <div className="max-h-[calc(100vh-220px)] overflow-auto custom-scrollbar">
                  <table className="grid-table border-collapse table-fixed w-full">
                    <colgroup>
                      <col style={{ width: FIRST_COL_WIDTH, minWidth: FIRST_COL_WIDTH }} />
                      {fields.map((f) => (
                        <col
                          key={f.id}
                          style={{
                            width: colWidths[f.fieldCode] || DEFAULT_COL_WIDTH,
                            minWidth: MIN_COL_WIDTH,
                          }}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="grid-th grid-th-corner">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold"># / Status</span>
                            {dirtyCount > 0 && (
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">
                                {dirtyCount} dirty
                              </span>
                            )}
                          </div>
                        </th>
                        {fields.map((f) => (
                          <th key={f.id} className="grid-th" title={f.description || f.fieldName}>
                            <div className="flex items-center justify-between gap-1 pr-2">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold truncate flex items-center gap-1">
                                  {f.fieldName}
                                  {f.isRequired && <span className="text-red-600 ml-0.5">*</span>}
                                  {f.dataType === 'IMAGE' && (() => {
                                    const imgCount = rows.filter(
                                      (r) => (r.imagesByField?.[f.fieldCode] || []).length > 0
                                    ).length;
                                    return imgCount > 0 ? (
                                      <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5 flex-shrink-0">
                                        🖼 {imgCount}
                                      </Badge>
                                    ) : null;
                                  })()}
                                </div>
                                <div className="text-[10px] font-normal text-muted-foreground uppercase tracking-wide truncate">
                                  {f.dataType}
                                  {f.cascadesFromFieldCode ? ` · from ${f.cascadesFromFieldCode}` : ''}
                                </div>
                              </div>
                            </div>
                            {/* Resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-red-400/40 transition-colors"
                              onMouseDown={(e) => startColResize(e, f.fieldCode)}
                              onDoubleClick={() => autoFitCol(f.fieldCode)}
                              aria-hidden="true"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, rowIdx) => {
                        const editable = EDITABLE_STATUSES.has(row.status);
                        return (
                          <tr
                            key={row.id}
                            data-dirty={row.isDirty ? 'true' : undefined}
                            data-editable={editable ? 'true' : undefined}
                            className={cn(
                              'group',
                              rowIdx % 2 === 1 ? 'bg-muted/30' : 'bg-white',
                              'hover:bg-accent/40'
                            )}
                          >
                            {/* Sticky first cell: row # + status badge + dirty dot */}
                            <td
                              className={cn(
                                'grid-td grid-td-first align-middle',
                                !editable && 'bg-muted/40'
                              )}
                            >
                              <div className="flex items-center gap-1.5 px-2">
                                <span className="text-xs text-muted-foreground w-6 text-right tabular-nums">
                                  {rowIdx + 1}
                                </span>
                                <Badge
                                  className={cn(
                                    'text-[10px] px-1.5 py-0 h-5 border whitespace-nowrap',
                                    STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-700 border-gray-300'
                                  )}
                                >
                                  {STATUS_LABELS[row.status] || row.status}
                                </Badge>
                                {AMENDMENT_STATUSES.has(row.status) && row.isDirty && (
                                  <span
                                    className="text-[9px] font-medium text-violet-700 bg-violet-100 border border-violet-300 rounded px-1 py-0 whitespace-nowrap"
                                    title="Editing this ACTIVE record will submit an amendment for approval (Stibo asset-maintenance pattern)"
                                  >
                                    amend
                                  </span>
                                )}
                                {row.isDirty && (
                                  <span
                                    className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-200"
                                    title="Unsaved changes"
                                    aria-label="Unsaved changes"
                                  />
                                )}
                              </div>
                            </td>
                            {/* Field cells */}
                            {fields.map((field, colIdx) => {
                              const value = row.editedPayload[field.fieldCode];
                              const isActive =
                                activeCell?.rowIdx === rowIdx && activeCell?.colIdx === colIdx;
                              const inputKey = `${row.id}__${field.fieldCode}`;
                              return (
                                <td
                                  key={field.id}
                                  className={cn(
                                    'grid-td p-0 align-middle',
                                    row.isDirty && 'bg-amber-50',
                                    !editable && 'bg-muted/40',
                                    isActive && 'ring-2 ring-inset ring-red-400 bg-red-50/50'
                                  )}
                                  onMouseDown={() => setActiveCell({ rowIdx, colIdx })}
                                >
                                  <CellRenderer
                                    field={field}
                                    value={value}
                                    editable={editable}
                                    inputKey={inputKey}
                                    isActive={isActive}
                                    onValueChange={(v) => setCellValue(row.id, field.fieldCode, v)}
                                    onKeyDown={(e) =>
                                      handleCellKeyDown(e, row.id, rowIdx, colIdx, field, value)
                                    }
                                    onFocus={() => setActiveCell({ rowIdx, colIdx })}
                                    inputRef={(el) => {
                                      inputRefs.current[inputKey] = el;
                                    }}
                                    // ── In-grid image management (deferred save) ──
                                    images={row.imagesByField?.[field.fieldCode]}
                                    onOpenImageManager={() => {
                                      ensureRowImages(row.id);
                                      setImagePopover({ rowId: row.id, fieldCode: field.fieldCode });
                                    }}
                                    imagePopoverOpen={
                                      imagePopover?.rowId === row.id &&
                                      imagePopover?.fieldCode === field.fieldCode
                                    }
                                    onAddPendingImages={(files) =>
                                      addPendingImages(row.id, field.fieldCode, files)
                                    }
                                    onRemoveImage={(imageId) =>
                                      removeImage(row.id, field.fieldCode, imageId)
                                    }
                                    onSetPrimaryImage={(imageId) =>
                                      setPrimaryImage(row.id, field.fieldCode, imageId)
                                    }
                                    onCloseImagePopover={() => setImagePopover(null)}
                                    onOpenLightbox={() => {
                                      const cellImgs =
                                        row.imagesByField?.[field.fieldCode] || [];
                                      if (cellImgs.length === 0) return;
                                      const primaryIdx = cellImgs.findIndex(
                                        (i) => i.isPrimary
                                      );
                                      setLightbox({
                                        images: cellImgs.map((img) => ({
                                          id: img.id,
                                          fileName: img.fileName,
                                          filePath: img.filePath,
                                          altText: img.altText,
                                          isPrimary: img.isPrimary,
                                          sortOrder: img.sortOrder,
                                          fileSize: img.pending ? undefined : undefined,
                                          pending: img.pending,
                                          variants: img.variants,
                                        })),
                                        index: primaryIdx >= 0 ? primaryIdx : 0,
                                      });
                                    }}
                                    allFields={fields}
                                    editedPayload={row.editedPayload}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Errors panel */}
            {saveErrors.length > 0 && (
              <Collapsible open={showErrors} onOpenChange={setShowErrors} className="border rounded-lg bg-red-50/50">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 text-left">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-red-800">
                        {saveErrors.length} save error{saveErrors.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {showErrors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 max-h-48 overflow-y-auto custom-scrollbar">
                    <ul className="space-y-1">
                      {saveErrors.map((err, i) => (
                        <li key={i} className="text-xs text-red-800">
                          <span className="font-mono text-[10px] text-red-600">[{err.id.slice(-8)}]</span>{' '}
                          {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </div>

      {/* Bottom hint bar */}
      <div className="border-t bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1">
          <PencilLine className="w-3 h-3" /> Click any cell to edit
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-background border rounded text-[10px]">Enter</kbd> next row ·{' '}
          <kbd className="px-1 py-0.5 bg-background border rounded text-[10px]">Tab</kbd> next col ·{' '}
          <kbd className="px-1 py-0.5 bg-background border rounded text-[10px]">Esc</kbd> revert ·{' '}
          <kbd className="px-1 py-0.5 bg-background border rounded text-[10px]">Ctrl</kbd>+
          <kbd className="px-1 py-0.5 bg-background border rounded text-[10px]">⌫</kbd> clear
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-violet-400" />
          <span className="text-violet-700">amend</span> = ACTIVE edit submits approval
        </span>
        <span className="ml-auto">
          DRAFT · REVISION_PENDING · ACTIVE rows are editable (ACTIVE → amendment workflow)
        </span>
      </div>

      {/* Save Current View dialog (STIBO User Configurable Views).
          Persists the current advancedFilters (and column widths) as a named,
          optionally-shared view via POST /api/saved-views. */}
      <Dialog open={showSaveViewDialog} onOpenChange={setShowSaveViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
            <DialogDescription>
              Save the current filter configuration as a named view you can re-apply later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sv-name">Name</Label>
              <Input
                id="sv-name"
                value={saveViewForm.name}
                onChange={(e) => setSaveViewForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Active SKUs · Apparel"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <ShadSelect
                value={saveViewForm.scope}
                onValueChange={(v) => setSaveViewForm((prev) => ({ ...prev, scope: v as 'SEARCH' | 'COLUMNS' | 'COMBINED' }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEARCH">Search (filter only)</SelectItem>
                  <SelectItem value="COLUMNS">Columns (visible columns)</SelectItem>
                  <SelectItem value="COMBINED">Combined (filter + columns)</SelectItem>
                </SelectContent>
              </ShadSelect>
            </div>
            <div className="space-y-1.5">
              <Label>Share with</Label>
              <ShadSelect
                value={saveViewForm.shareWith}
                onValueChange={(v) => setSaveViewForm((prev) => ({ ...prev, shareWith: v as 'private' | 'company' | 'specific' }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (just me)</SelectItem>
                  <SelectItem value="company">All users in my company</SelectItem>
                  <SelectItem value="specific">Specific user IDs</SelectItem>
                </SelectContent>
              </ShadSelect>
              {saveViewForm.shareWith === 'specific' && (
                <Input
                  value={saveViewForm.specificUserIds}
                  onChange={(e) => setSaveViewForm((prev) => ({ ...prev, specificUserIds: e.target.value }))}
                  placeholder="user-id-1, user-id-2, ..."
                  className="mt-1.5"
                />
              )}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={saveViewForm.isDefault}
                onCheckedChange={(v) => setSaveViewForm((prev) => ({ ...prev, isDefault: v === true }))}
                className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
              />
              <span>Set as default for this module + scope</span>
            </label>
            {advancedFilters.length === 0 && saveViewForm.scope !== 'COLUMNS' && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                You have no advanced filter conditions. The saved view will start with an empty filter.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveViewDialog(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={saveCurrentView}
              disabled={!saveViewForm.name.trim() || savingView}
            >
              {savingView ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Views dialog — list, apply, delete. */}
      <Dialog open={showManageViewsDialog} onOpenChange={setShowManageViewsDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Saved Views</DialogTitle>
            <DialogDescription>
              Apply or delete your saved views. Shared views can only be deleted by their owner.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1.5">
            {savedViews.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No saved views yet. Use &ldquo;Views → Save Current View&rdquo; to create one.
              </p>
            ) : (
              savedViews.map((v) => {
                const isOwner = v.userId === user?.userId;
                const sharedLabel = v.sharedWith === '*' ? 'Shared: Company' : v.sharedWith ? 'Shared: Users' : 'Private';
                const filterCount = v.filterConfig ? (JSON.parse(v.filterConfig).length || 0) : 0;
                return (
                  <div
                    key={v.id}
                    className={cn(
                      'flex items-center justify-between gap-2 p-2 border rounded',
                      activeSavedView?.id === v.id && 'border-red-300 bg-red-50/50'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{v.name}</span>
                        {v.isDefault && <Badge className="text-[10px] h-4 px-1 bg-red-600">Default</Badge>}
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{v.scope}</Badge>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{sharedLabel}</Badge>
                        {!isOwner && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            by {v.user?.username || 'unknown'}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {filterCount} filter condition{filterCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => { applySavedView(v); setShowManageViewsDialog(false); }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Apply
                      </Button>
                      {isOwner && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteSavedView(v.id, v.name)}
                          aria-label={`Delete view ${v.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageViewsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox overlay — replaced with the new ImageLightbox component
          that supports zoom/pan, image info panel, download, and smooth
          framer-motion animations. */}
      <ImageLightbox
        images={lightbox?.images || []}
        initialIndex={lightbox?.index || 0}
        open={!!lightbox}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

// ============================================================================
// Header sub-component
// ============================================================================

function Header({
  modules,
  activeModuleId,
  onModuleChange,
  onBack,
}: {
  modules: ModuleItem[];
  activeModuleId: string;
  onModuleChange: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="h-9" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          List View
        </Button>
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-red-600" />
            Grid Editor
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Excel-like bulk editor · edit multiple records inline
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ShadSelect value={activeModuleId} onValueChange={onModuleChange}>
          <SelectTrigger className="w-[220px] h-9">
            <SelectValue placeholder="Select module" />
          </SelectTrigger>
          <SelectContent>
            {modules.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.moduleName}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadSelect>
      </div>
    </div>
  );
}

// ============================================================================
// Cell renderer
// ============================================================================

interface CellRendererProps {
  field: MetaField;
  value: unknown;
  editable: boolean;
  inputKey: string;
  isActive: boolean;
  onValueChange: (v: unknown) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  inputRef: (el: HTMLInputElement | HTMLSelectElement | null) => void;
  allFields: MetaField[];
  editedPayload: Record<string, unknown>;
  // ── In-grid image management (deferred save) ──
  images?: ImageInfo[];
  onOpenImageManager?: () => void;
  imagePopoverOpen?: boolean;
  onAddPendingImages?: (files: FileList | File[]) => void;
  onRemoveImage?: (imageId: string) => void;
  onSetPrimaryImage?: (imageId: string) => void;
  onCloseImagePopover?: () => void;
  /** Opens the full-screen lightbox (click-to-enlarge) for this cell's
   *  images. Only triggered when the user clicks the primary thumbnail —
   *  NOT when the cell is being actively edited (isActive). The upload
   *  button opens the image-manager popover instead. */
  onOpenLightbox?: () => void;
}

function CellRenderer({
  field,
  value,
  editable,
  inputKey,
  isActive,
  onValueChange,
  onKeyDown,
  onFocus,
  inputRef,
  allFields,
  editedPayload,
  images,
  onOpenImageManager,
  imagePopoverOpen,
  onAddPendingImages,
  onRemoveImage,
  onSetPrimaryImage,
  onCloseImagePopover,
  onOpenLightbox,
}: CellRendererProps) {
  const cellBase =
    'w-full h-9 px-2 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 rounded-none';

  // IMAGE → GridImageCell component (thumbnail with hover preview, inline
  // upload, delete with confirmation, and lightbox integration).
  if (field.dataType === 'IMAGE') {
    const gridImages: GridImageInfo[] = (images || []).map((img) => ({
      id: img.id,
      fileName: img.fileName,
      filePath: img.filePath,
      altText: img.altText,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
      pending: img.pending,
      variants: img.variants,
    }));
    return (
      <GridImageCell
        images={gridImages}
        editable={editable}
        isActive={isActive}
        onAddPendingImages={onAddPendingImages}
        onRemoveImage={onRemoveImage}
        onOpenLightbox={onOpenLightbox}
        onOpenImageManager={() => {
          onOpenImageManager?.();
        }}
      />
    );
  }

  // BOOLEAN → checkbox
  if (field.dataType === 'BOOLEAN') {
    const boolVal = value === true || value === 'true' || value === 1 || value === '1';
    return (
      <div className="px-2 h-9 flex items-center justify-center">
        <input
          ref={(el) => inputRef(el as HTMLInputElement)}
          type="checkbox"
          checked={boolVal}
          disabled={!editable}
          onChange={(e) => onValueChange(e.target.checked)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          className="h-4 w-4 cursor-pointer accent-red-600"
          aria-label={field.fieldName}
        />
      </div>
    );
  }

  // SELECT / LOOKUP → native select
  if (field.dataType === 'SELECT' || field.dataType === 'LOOKUP') {
    const allValues = field.lookupMaster?.values || [];
    // Cascade filter
    let options = allValues;
    if (field.cascadesFromFieldCode) {
      const parentVal = String(editedPayload[field.cascadesFromFieldCode] ?? '');
      options = allValues.filter((v) => (v.parentValueCode || '') === parentVal);
    }
    // If current value isn't in filtered options, keep showing it as a special "ghost" option
    const currentVal = String(value ?? '');
    const currentMissing =
      currentVal !== '' && !options.some((o) => o.valueCode === currentVal);

    if (!editable) {
      // Read-only: show display value as text
      const display =
        allValues.find((v) => v.valueCode === currentVal)?.displayValue || currentVal || '-';
      return (
        <div className="px-2 h-9 flex items-center text-sm" title={display}>
          <span className="truncate">{display}</span>
        </div>
      );
    }
    return (
      <select
        ref={(el) => inputRef(el as HTMLSelectElement)}
        value={currentVal}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cn(cellBase, 'cursor-pointer pr-6 truncate')}
        aria-label={field.fieldName}
      >
        <option value="">—</option>
        {options.map((v) => (
          <option key={v.id} value={v.valueCode}>
            {v.displayValue}
          </option>
        ))}
        {currentMissing && (
          <option value={currentVal} disabled>
            {currentVal} (invalid)
          </option>
        )}
      </select>
    );
  }

  // MULTISELECT → comma-separated input + popover picker
  if (field.dataType === 'MULTISELECT') {
    const allValues = field.lookupMaster?.values || [];
    const selectedCodes = String(value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const selectedSet = new Set(selectedCodes);

    const toggle = (code: string) => {
      const next = new Set(selectedSet);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      onValueChange(Array.from(next).join(','));
    };

    if (!editable) {
      const labels = selectedCodes
        .map((c) => allValues.find((v) => v.valueCode === c)?.displayValue || c)
        .join(', ');
      return (
        <div className="px-2 h-9 flex items-center text-sm" title={labels}>
          <span className="truncate">{labels || '-'}</span>
        </div>
      );
    }

    return (
      <div className="h-9 flex items-stretch">
        <input
          ref={(el) => inputRef(el as HTMLInputElement)}
          value={String(value ?? '')}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          placeholder={field.placeholder || 'comma-separated'}
          className={cn(cellBase, 'flex-1 min-w-0')}
          aria-label={field.fieldName}
        />
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-7 h-full flex items-center justify-center border-l hover:bg-accent text-muted-foreground"
              aria-label="Pick values"
              tabIndex={-1}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start" onClick={(e) => e.stopPropagation()}>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {allValues.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  No options defined
                </div>
              )}
              {allValues.map((v) => {
                const checked = selectedSet.has(v.valueCode);
                return (
                  <label
                    key={v.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(v.valueCode)}
                      className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                    />
                    <span className="truncate">{v.displayValue}</span>
                  </label>
                );
              })}
            </div>
            {selectedCodes.length > 0 && (
              <button
                type="button"
                className="w-full text-xs text-red-600 hover:bg-red-50 mt-1 py-1 rounded"
                onClick={() => onValueChange('')}
              >
                Clear all
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // TEXT / EMAIL / URL / NUMBER / DATE
  let inputType = 'text';
  if (field.dataType === 'EMAIL') inputType = 'email';
  else if (field.dataType === 'URL') inputType = 'url';
  else if (field.dataType === 'NUMBER') inputType = 'number';
  else if (field.dataType === 'DATE') inputType = 'date';

  const textValue = String(value ?? '');
  const displayValue =
    field.dataType === 'BOOLEAN' ? (textValue === 'true' ? 'Yes' : 'No') : textValue;

  if (!editable) {
    return (
      <div className="px-2 h-9 flex items-center text-sm" title={displayValue}>
        <span className="truncate">{displayValue || '-'}</span>
      </div>
    );
  }

  return (
    <input
      ref={(el) => inputRef(el as HTMLInputElement)}
      type={inputType}
      value={textValue}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      placeholder={field.placeholder || ''}
      inputMode={field.dataType === 'NUMBER' ? 'decimal' : undefined}
      className={cn(cellBase, 'min-w-0')}
      aria-label={field.fieldName}
      data-active={isActive ? 'true' : undefined}
    />
  );
}

// ============================================================================
// Image Manager Popover — shown when the user clicks the upload button on an
// IMAGE cell. Lets the user add new images (queued for deferred upload),
// delete existing ones (queued for deferred delete), and set the primary
// image. Nothing is sent to the server until the user clicks "Save Changes".
// ============================================================================

interface ImageManagerPopoverProps {
  images: ImageInfo[];
  editable: boolean;
  onAddPendingImages?: (files: FileList | File[]) => void;
  onRemoveImage?: (imageId: string) => void;
  onSetPrimaryImage?: (imageId: string) => void;
}

function ImageManagerPopover({
  images,
  editable,
  onAddPendingImages,
  onRemoveImage,
  onSetPrimaryImage,
}: ImageManagerPopoverProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddPendingImages?.(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddPendingImages?.(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Images</span>
        <span className="text-[10px] text-muted-foreground">
          {images.length} total · {images.filter((i) => i.pending).length} pending
        </span>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
          {images.map((img) => (
            <div
              key={img.id}
              className={cn(
                'relative group w-full aspect-square rounded border-2 overflow-hidden bg-muted/30',
                img.isPrimary ? 'border-amber-400 ring-1 ring-amber-300' : 'border-border'
              )}
            >
              <img
                src={img.filePath}
                alt={img.altText || img.fileName}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setPreview(img.filePath)}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0.2';
                }}
              />
              {img.pending && (
                <span className="absolute top-0.5 left-0.5 bg-amber-500 text-white text-[8px] font-medium rounded px-1">
                  new
                </span>
              )}
              {img.isPrimary && (
                <span className="absolute top-0.5 right-0.5 bg-amber-500 text-white rounded-full p-0.5">
                  <Star className="w-2 h-2 fill-white" />
                </span>
              )}
              {editable && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5">
                  {!img.isPrimary && (
                    <button
                      type="button"
                      className="p-1 rounded bg-white/20 hover:bg-amber-500 text-white"
                      onClick={() => onSetPrimaryImage?.(img.id)}
                      title="Set as primary"
                    >
                      <Star className="w-2.5 h-2.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="p-1 rounded bg-white/20 hover:bg-red-500 text-white"
                    onClick={() => onRemoveImage?.(img.id)}
                    title="Delete image"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div
          className="border-2 border-dashed rounded-md p-2 text-center cursor-pointer hover:border-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif,.avif"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Upload className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
          <p className="text-[10px] text-muted-foreground">
            Drop or <span className="text-red-600 font-medium">browse</span>
          </p>
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">Saved on Save Changes</p>
        </div>
      )}

      {!editable && images.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-2">No images</p>
      )}

      {/* Lightbox preview */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <img
            src={preview}
            alt="Preview"
            className="max-w-full max-h-full rounded-lg shadow-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white"
            onClick={() => setPreview(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Saved Views List — popover content showing recent / my / shared views with
// quick actions (apply, save current, manage). Rendered inside the Views dropdown.
// ============================================================================

interface SavedViewsListProps {
  views: SavedView[];
  currentUserId?: string;
  activeViewId?: string;
  onApply: (view: SavedView) => void;
  onSaveCurrent: () => void;
  onManage: () => void;
}

function SavedViewsList({ views, currentUserId, activeViewId, onApply, onSaveCurrent, onManage }: SavedViewsListProps) {
  const myViews = views.filter((v) => v.userId === currentUserId);
  const sharedViews = views.filter((v) => v.userId !== currentUserId);
  const recent = views.slice(0, 5); // API already orders by lastUsedAt desc

  const renderItem = (v: SavedView) => (
    <button
      key={v.id}
      type="button"
      onClick={() => onApply(v)}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-accent transition-colors',
        activeViewId === v.id && 'bg-red-50 hover:bg-red-100'
      )}
    >
      {activeViewId === v.id ? (
        <BookmarkCheck className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
      ) : (
        <BookmarkPlus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      )}
      <span className="flex-1 min-w-0 truncate">{v.name}</span>
      {v.isDefault && <Badge className="text-[9px] h-4 px-1 bg-red-600 flex-shrink-0">Default</Badge>}
      {v.sharedWith === '*' && <Share2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
    </button>
  );

  // Helper: render a labeled section if items is non-empty.
  const renderSection = (label: string, items: SavedView[]) => {
    if (items.length === 0) return null;
    return (
      <>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 pt-2">
          {label}
        </div>
        {items.map(renderItem)}
      </>
    );
  };

  return (
    <div className="space-y-1">
      {views.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No saved views yet.
          <br />
          Configure filters, then click &ldquo;Save Current View&rdquo;.
        </p>
      ) : (
        <>
          {recent.length > 0 && (
            <>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 pt-1">
                Recent
              </div>
              {recent.map(renderItem)}
            </>
          )}
          {renderSection(`My Views (${myViews.length})`, myViews.slice(recent.length))}
          {renderSection(`Shared with me (${sharedViews.length})`, sharedViews)}
        </>
      )}
      <div className="border-t pt-1 mt-1 space-y-1">
        <Button size="sm" variant="outline" className="w-full justify-start h-8" onClick={onSaveCurrent}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Save Current View
        </Button>
        <Button size="sm" variant="ghost" className="w-full justify-start h-8" onClick={onManage}>
          <Settings className="w-3.5 h-3.5 mr-1.5" />
          Manage Views
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Advanced Filter Row — a single condition in the advanced-filter builder.
// Renders [connector (if not first)] [field select] [operator select]
// [value input/select] [remove button].
// ============================================================================

interface AdvancedFilterRowProps {
  filter: AdvancedFilter;
  isFirst: boolean;
  fields: MetaField[];
  onChange: (next: AdvancedFilter) => void;
  onRemove: () => void;
}

function AdvancedFilterRow({
  filter,
  isFirst,
  fields,
  onChange,
  onRemove,
}: AdvancedFilterRowProps) {
  const filterableFields = fields;
  const field = filterableFields.find((f) => f.fieldCode === filter.fieldCode);
  const dataType = field?.dataType || 'TEXT';
  const operators = getOperatorsForDataType(dataType);
  const needsValue = operatorNeedsValue(filter.operator);

  // When the field changes, reset the operator + value to valid defaults for
  // the new field's dataType (the old operator may not exist on the new type).
  const handleFieldChange = (newFieldCode: string) => {
    const newField = filterableFields.find((f) => f.fieldCode === newFieldCode);
    const newOps = getOperatorsForDataType(newField?.dataType || 'TEXT');
    const newOp = newOps.includes(filter.operator) ? filter.operator : newOps[0];
    onChange({ ...filter, fieldCode: newFieldCode, operator: newOp, value: '' });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!isFirst ? (
        <ShadSelect
          value={filter.connector}
          onValueChange={(v) =>
            onChange({ ...filter, connector: v as FilterConnector })
          }
        >
          <SelectTrigger className="w-[72px] h-8 text-xs font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </ShadSelect>
      ) : (
        <div className="w-[72px] text-[10px] font-semibold text-muted-foreground text-right uppercase tracking-wide">
          Where
        </div>
      )}

      <ShadSelect value={filter.fieldCode} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Pick column" />
        </SelectTrigger>
        <SelectContent>
          {filterableFields.map((f) => (
            <SelectItem key={f.id} value={f.fieldCode}>
              {f.fieldName}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadSelect>

      <ShadSelect
        value={filter.operator}
        onValueChange={(v) =>
          onChange({ ...filter, operator: v as FilterOperator })
        }
      >
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>
              {formatOperator(op)}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadSelect>

      {needsValue ? (
        <FilterValueInput
          field={field}
          value={filter.value}
          onChange={(v) => onChange({ ...filter, value: v })}
        />
      ) : (
        <div className="text-[10px] text-muted-foreground italic h-8 flex items-center px-2 min-w-[120px]">
          (no value needed)
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
        onClick={onRemove}
        aria-label="Remove condition"
        title="Remove condition"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ============================================================================
// Filter Value Input — renders the right input control for a filter's value
// based on the field dataType: text/number/date → Input; SELECT/LOOKUP →
// single-select dropdown; MULTISELECT → multi-select popover with checkboxes.
// ============================================================================

interface FilterValueInputProps {
  field: MetaField | undefined;
  value: string;
  onChange: (v: string) => void;
}

function FilterValueInput({ field, value, onChange }: FilterValueInputProps) {
  if (!field) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs flex-1 min-w-[120px]"
        placeholder="Value"
      />
    );
  }

  const dt = field.dataType;

  // SELECT / LOOKUP → single-select dropdown
  if (dt === 'SELECT' || dt === 'LOOKUP') {
    const options = field.lookupMaster?.values || [];
    return (
      <ShadSelect value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Pick value" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">&mdash; (any) &mdash;</SelectItem>
          {options.map((v) => (
            <SelectItem key={v.id} value={v.valueCode}>
              {v.displayValue}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadSelect>
    );
  }

  // MULTISELECT → multi-select popover (comma-separated values)
  if (dt === 'MULTISELECT') {
    const options = field.lookupMaster?.values || [];
    const selected = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const selectedSet = new Set(selected);
    const toggle = (code: string) => {
      const next = new Set(selectedSet);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      onChange(Array.from(next).join(','));
    };
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs min-w-[120px] justify-start"
          >
            {selected.length === 0 ? (
              <span className="text-muted-foreground">Pick values...</span>
            ) : (
              <span className="truncate">{selected.length} selected</span>
            )}
            <ChevronDown className="w-3 h-3 ml-auto" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {options.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                No options defined
              </div>
            )}
            {options.map((v) => {
              const checked = selectedSet.has(v.valueCode);
              return (
                <label
                  key={v.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(v.valueCode)}
                    className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <span className="truncate">{v.displayValue}</span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              className="w-full text-xs text-red-600 hover:bg-red-50 mt-1 py-1 rounded"
              onClick={() => onChange('')}
            >
              Clear all
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  // TEXT / EMAIL / URL / NUMBER / DATE → typed Input
  let inputType = 'text';
  if (dt === 'EMAIL') inputType = 'email';
  else if (dt === 'URL') inputType = 'url';
  else if (dt === 'NUMBER') inputType = 'number';
  else if (dt === 'DATE') inputType = 'date';

  return (
    <Input
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs flex-1 min-w-[120px]"
      placeholder="Value"
    />
  );
}
