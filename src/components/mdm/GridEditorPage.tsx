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
  Image as ImageIcon,
  Loader2,
  PencilLine,
  ListFilter,
} from 'lucide-react';
import { toast } from 'sonner';

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
}

// ============================================================================
// Constants
// ============================================================================

const EDITABLE_STATUSES = new Set<string>(['DRAFT', 'REVISION_PENDING']);

const STATUS_FILTER_TABS: Array<{ value: 'ALL' | 'DRAFT' | 'REVISION_PENDING'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
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
  const { token, navigate, selectedModuleId } = useAppStore();

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string>(selectedModuleId || '');
  const [fields, setFields] = useState<MetaField[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingRow, setAddingRow] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'REVISION_PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [isDraggingCol, setIsDraggingCol] = useState(false);

  const [saveErrors, setSaveErrors] = useState<Array<{ id: string; error: string }>>([]);
  const [showErrors, setShowErrors] = useState(false);

  // Refs for column resize drag
  const dragRef = useRef<{ fieldCode: string; startX: number; startWidth: number } | null>(null);

  // Refs to focus inputs
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

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
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, activeModuleId]);

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
  const dirtyCount = useMemo(() => rows.filter((r) => r.isDirty).length, [rows]);

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
    return result;
  }, [rows, statusFilter, searchQuery]);

  const editableCount = useMemo(
    () => rows.filter((r) => EDITABLE_STATUSES.has(r.status)).length,
    [rows]
  );

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
    setRows((prev) =>
      prev.map((row) =>
        row.isDirty
          ? { ...row, editedPayload: { ...row.originalPayload }, isDirty: false }
          : row
      )
    );
    setSaveErrors([]);
    setShowErrors(false);
    toast.info('Unsaved changes discarded');
  }, []);

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
      const changes = rows
        .filter((r) => r.isDirty)
        .map((r) => ({ id: r.id, payload: r.editedPayload }));
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
      const updatedCount: number = data.updatedCount ?? 0;
      const errorCount: number = data.errorCount ?? 0;
      const errList: Array<{ id: string; error: string }> = data.errors || [];
      if (updatedCount > 0) {
        toast.success(`${updatedCount} record${updatedCount !== 1 ? 's' : ''} saved`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} record${errorCount !== 1 ? 's' : ''} failed`);
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
            </span>
          </div>
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
                {searchQuery || statusFilter !== 'ALL'
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
                                <div className="text-xs font-semibold truncate">
                                  {f.fieldName}
                                  {f.isRequired && <span className="text-red-600 ml-0.5">*</span>}
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
                                    onManageImages={() =>
                                      navigate('record-detail', {
                                        moduleId: activeModuleId,
                                        recordId: row.id,
                                      })
                                    }
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
        <span className="ml-auto">
          Only DRAFT and REVISION_PENDING rows are editable
        </span>
      </div>
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
  onManageImages: () => void;
  allFields: MetaField[];
  editedPayload: Record<string, unknown>;
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
  onManageImages,
  allFields,
  editedPayload,
}: CellRendererProps) {
  const cellBase =
    'w-full h-9 px-2 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 rounded-none';

  // IMAGE → Manage button
  if (field.dataType === 'IMAGE') {
    return (
      <div className="px-2 h-9 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onManageImages}
          disabled={!editable}
        >
          <ImageIcon className="w-3.5 h-3.5 mr-1" />
          Manage
        </Button>
      </div>
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
