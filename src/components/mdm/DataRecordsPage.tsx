'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { parsePayload } from '@/lib/parse-payload';
import { STATUS_LABELS, WORKFLOW_STATE_LABELS, WORKFLOW_STATE_DESCRIPTIONS } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger, ContextMenuShortcut,
} from '@/components/ui/context-menu';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@/components/ui/resizable';
import {
  FileText, Plus, ChevronLeft, ChevronRight, Search, Building2, XCircle,
  LayoutGrid, List, Filter, SlidersHorizontal, Eye, EyeOff, ArrowUpDown,
  ArrowUp, ArrowDown, Copy, Trash2, Pencil, ThumbsUp,
  Save, X, ExternalLink, Check, Columns3, Clock, User,
  RefreshCw, Image as ImageIcon, ZoomIn, Star, BarChart3, CircleDot,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ImageLightbox, { LightboxImage } from '@/components/mdm/ImageLightbox';

// ============================================================================
// Constants
// ============================================================================

const STATUS_BADGE_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  DRAFT: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300 dark:border-gray-600', dot: 'bg-gray-400' },
  IN_REVIEW: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
  ACTIVE: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
  REVISION_PENDING: { bg: 'bg-sky-50 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-300 dark:border-sky-700', dot: 'bg-sky-500' },
  REJECTED: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-700', dot: 'bg-red-500' },
  ARCHIVED: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-300 dark:border-slate-600', dot: 'bg-slate-400' },
};

const STATUS_TABS = ['ALL', 'DRAFT', 'IN_REVIEW', 'ACTIVE', 'REVISION_PENDING', 'REJECTED', 'ARCHIVED'];

const QUICK_FILTERS = [
  { key: 'ALL', label: 'All Instances', icon: List },
  { key: 'MY', label: 'My Instances', icon: User },
  { key: 'PENDING', label: 'Pending Review', icon: Clock },
  { key: 'RECENT', label: 'Recently Modified', icon: RefreshCw },
];

// ============================================================================
// Standalone Sub-Components (outside main render)
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_BADGE_CONFIG[status];
  const label = WORKFLOW_STATE_LABELS[status] || STATUS_LABELS[status] || status;
  if (!config) return <Badge className="text-xs border">{label}</Badge>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={cn('text-xs border inline-flex items-center gap-1.5 font-medium', config.bg, config.text, config.border)}>
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />
            {label}
          </Badge>
        </TooltipTrigger>
        {WORKFLOW_STATE_DESCRIPTIONS[status] && (
          <TooltipContent side="bottom" className="text-xs">
            {WORKFLOW_STATE_DESCRIPTIONS[status]}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

function SortIcon({ columnKey, sortConfig }: { columnKey: string; sortConfig: { key: string; direction: 'asc' | 'desc' } | null }) {
  if (sortConfig?.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />;
  return sortConfig.direction === 'asc'
    ? <ArrowUp className="w-3 h-3 text-red-600" />
    : <ArrowDown className="w-3 h-3 text-red-600" />;
}

function RecordPreview({ record, fields, activeModuleId, navigate, perms }: {
  record: any;
  fields: any[];
  activeModuleId: string;
  navigate: (page: any, params?: any) => void;
  perms: ReturnType<typeof usePermissions>;
}) {
  if (!record) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
      <div className="text-center">
        <Eye className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Select an entity instance to preview</p>
      </div>
    </div>
  );

  const payload = parsePayload(record.currentPayload);

  // Calculate completeness: percentage of non-empty fields
  const totalFields = fields.length || 1;
  const filledFields = fields.filter((f: any) => {
    const val = payload[f.fieldCode];
    return val !== undefined && val !== null && val !== '';
  }).length;
  const completeness = Math.round((filledFields / totalFields) * 100);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Instance Preview</h3>
        <Button
          size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
          onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: record.id })}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open Detail
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={record.status} />
          <span className="text-xs text-muted-foreground">
            Updated {new Date(record.updatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Quality / Completeness indicators */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2.5 bg-muted/20">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Completeness</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    completeness >= 85 ? 'bg-emerald-500' :
                    completeness >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <span className={cn(
                'text-xs font-bold tabular-nums',
                completeness >= 85 ? 'text-emerald-600' :
                completeness >= 60 ? 'text-amber-600' : 'text-red-600'
              )}>{completeness}%</span>
            </div>
          </div>
          <div className="rounded-lg border p-2.5 bg-muted/20">
            <div className="flex items-center gap-1.5 mb-1">
              <CircleDot className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Attributes</span>
            </div>
            <p className="text-xs font-bold">{filledFields}<span className="text-muted-foreground font-normal">/{totalFields}</span> <span className="text-muted-foreground font-normal text-[10px]">filled</span></p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Company</p>
              <p className="font-medium">{record.company?.companyCode || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Module</p>
              <p className="font-medium">{record.module?.moduleName || '-'}</p>
            </div>
          </div>

          <Separator />

          {fields.slice(0, 6).map((f: any) => (
            <div key={f.id} className="grid grid-cols-[1fr_2fr] gap-2 text-sm">
              <p className="text-muted-foreground text-xs truncate" title={f.fieldName}>{f.fieldName}</p>
              <p className="font-medium truncate" title={String(payload[f.fieldCode] ?? '-')}>
                {String(payload[f.fieldCode] ?? '-')}
              </p>
            </div>
          ))}
          {fields.length > 6 && (
            <p className="text-xs text-muted-foreground italic">+{fields.length - 6} more attributes</p>
          )}
        </div>
      </div>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          disabled={!perms.canEdit}
          onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: record.id })}>
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          disabled={!perms.canCreate}
          onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: record.id })}>
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-amber-600"
          disabled={!perms.canApprove}>
          <ThumbsUp className="w-3.5 h-3.5" /> Submit
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function DataRecordsPage() {
  const { token, navigate, selectedModuleId, user } = useAppStore();
  const perms = usePermissions();
  const [modules, setModules] = useState<any[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string>(selectedModuleId || '');
  const [activeStatus, setActiveStatus] = useState('ALL');
  const [activeQuickFilter, setActiveQuickFilter] = useState('ALL');
  const [records, setRecords] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [companies, setCompanies] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<Array<{ status: string; count: number }>>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [columnPopoverOpen, setColumnPopoverOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'split'>('split');
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldCode: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<Array<{ id: string; name: string; filterConfig?: string | null; isDefault?: boolean }>>([]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const [columnFilters, setColumnFilters] = useState<Array<{ fieldCode: string; operator: string; value: string }>>([]);
  const [recordImagesMap, setRecordImagesMap] = useState<Record<string, any[]>>({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const limit = 20;

  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeModuleId) setPage(1);
  }, [activeModuleId, activeStatus]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // ─── Data Loaders ───
  const loadModules = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const modules = data.modules || [];
      // Sort modules: Article Master first, then by record count descending,
      // so the default selection is the most relevant module (not "E2E Test").
      modules.sort((a: any, b: any) => {
        // Article Master always first
        if (a.moduleCode === 'ARTICLE_MASTER' || a.moduleName === 'Article Master') return -1;
        if (b.moduleCode === 'ARTICLE_MASTER' || b.moduleName === 'Article Master') return 1;
        // Then sort by name alphabetically (skip test modules)
        return (a.moduleName || '').localeCompare(b.moduleName || '');
      });
      setModules(modules);
      if (!activeModuleId && modules.length > 0) {
        setActiveModuleId(modules[0].id);
      }
    } catch { /* silent */ }
  }, [token]);

  const loadCompanies = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch { /* silent */ }
  }, [token]);

  const loadRecords = useCallback(async () => {
    if (!token || !activeModuleId) return;
    setLoading(true);
    try {
      const statusParam = activeStatus !== 'ALL' ? `&status=${activeStatus}` : '';
      const res = await fetch(`/api/records?moduleId=${activeModuleId}&page=${page}&limit=${limit}${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRecords(data.data || []);
      setTotal(data.total || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, activeModuleId, activeStatus, page]);

  const loadRecordImages = useCallback(async () => {
    if (!token || records.length === 0) return;
    const newMap: Record<string, any[]> = {};
    // Load images for each record in parallel (limit to first 20 for performance)
    const ids = records.slice(0, 20).map((r: any) => r.id);
    await Promise.all(ids.map(async (recId: string) => {
      try {
        const res = await fetch(`/api/images?recordId=${recId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.images?.length > 0) {
          newMap[recId] = data.images;
        }
      } catch { /* silent */ }
    }));
    setRecordImagesMap(newMap);
  }, [token, records]);

  useEffect(() => {
    if (records.length > 0) loadRecordImages();
  }, [records, loadRecordImages]);

  const loadFields = useCallback(async () => {
    if (!token || !activeModuleId) return;
    try {
      const res = await fetch(`/api/fields?moduleId=${activeModuleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const newFields = data.fields || [];
      setFields(newFields);
      const vis: Record<string, boolean> = {};
      newFields.forEach((f: any, i: number) => { vis[f.id] = i < 5; });
      setVisibleColumns(vis);
    } catch { /* silent */ }
  }, [token, activeModuleId]);

  const loadStatusCounts = useCallback(async () => {
    if (!token || !activeModuleId) return;
    try {
      const res = await fetch(`/api/records?moduleId=${activeModuleId}&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const counts: Record<string, number> = {};
      if (data.data) {
        for (const r of data.data) { counts[r.status] = (counts[r.status] || 0) + 1; }
      }
      setStatusCounts(Object.entries(counts).map(([status, count]) => ({ status, count })));
    } catch { /* silent */ }
  }, [token, activeModuleId]);

  const loadSavedViews = useCallback(async () => {
    if (!token || !activeModuleId) return;
    try {
      const res = await fetch(`/api/saved-views?moduleId=${activeModuleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSavedViews(data.views || []);
    } catch { /* silent */ }
  }, [token, activeModuleId]);

  useEffect(() => { loadModules(); loadCompanies(); }, [loadModules, loadCompanies]);

  useEffect(() => {
    if (activeModuleId) {
      loadFields(); loadRecords(); loadStatusCounts(); loadSavedViews();
    }
  }, [activeModuleId, loadFields, loadRecords, loadStatusCounts, loadSavedViews]);

  const totalPages = Math.ceil(total / limit);

  const displayFields = useMemo(() => {
    return fields.filter((f: any) => visibleColumns[f.id] !== false);
  }, [fields, visibleColumns]);

  const getPayloadValue = useCallback((record: any, fieldCode: string) => {
    const payload = parsePayload(record.currentPayload);
    return payload[fieldCode] ?? '-';
  }, []);

  const filteredRecords = useMemo(() => {
    let result = records;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const payload = parsePayload(r.currentPayload);
        if (Object.values(payload).some((v) => String(v).toLowerCase().includes(q))) return true;
        if (r.status?.toLowerCase().includes(q)) return true;
        if (r.company?.companyCode?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    if (companyFilter !== 'ALL') {
      result = result.filter((r) => r.companyId === companyFilter);
    }

    if (activeQuickFilter === 'MY') {
      result = result.filter((r) => r.createdById === user?.userId);
    } else if (activeQuickFilter === 'PENDING') {
      result = result.filter((r) => r.status === 'IN_REVIEW' || r.status === 'REVISION_PENDING');
    } else if (activeQuickFilter === 'RECENT') {
      const oneDayAgo = new Date(Date.now() - 24 * 3600000);
      result = result.filter((r) => new Date(r.updatedAt) >= oneDayAgo);
    }

    if (columnFilters.length > 0) {
      result = result.filter((r) => {
        const results = columnFilters.map((cf) => {
          const val = String(getPayloadValue(r, cf.fieldCode)).toLowerCase();
          const filterVal = cf.value.toLowerCase();
          switch (cf.operator) {
            case 'contains': return val.includes(filterVal);
            case 'equals': return val === filterVal;
            case 'starts': return val.startsWith(filterVal);
            case 'not_contains': return !val.includes(filterVal);
            default: return val.includes(filterVal);
          }
        });
        return filterLogic === 'AND' ? results.every(Boolean) : results.some(Boolean);
      });
    }

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aVal: any, bVal: any;
        if (sortConfig.key === 'status') {
          aVal = a.status || ''; bVal = b.status || '';
        } else if (sortConfig.key === 'updatedAt') {
          aVal = new Date(a.updatedAt).getTime(); bVal = new Date(b.updatedAt).getTime();
        } else {
          aVal = String(getPayloadValue(a, sortConfig.key)); bVal = String(getPayloadValue(b, sortConfig.key));
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [records, searchQuery, companyFilter, activeQuickFilter, columnFilters, filterLogic, sortConfig, user, getPayloadValue]);

  const isSuperAdmin = user?.roles?.includes('Super Admin') ?? false;

  const activeFilters = useMemo(() => {
    const filters: { key: string; label: string; onClear: () => void }[] = [];
    if (searchQuery.trim()) filters.push({ key: 'search', label: `"${searchQuery}"`, onClear: () => setSearchQuery('') });
    if (companyFilter !== 'ALL') {
      const comp = companies.find((c: any) => c.id === companyFilter);
      filters.push({ key: 'company', label: comp ? `${comp.companyCode}` : 'Company', onClear: () => setCompanyFilter('ALL') });
    }
    if (activeStatus !== 'ALL') filters.push({ key: 'status', label: STATUS_LABELS[activeStatus] || activeStatus, onClear: () => setActiveStatus('ALL') });
    columnFilters.forEach((cf, i) => {
      filters.push({
        key: `col-${i}`,
        label: `${cf.fieldCode} ${cf.operator} "${cf.value}"`,
        onClear: () => setColumnFilters((prev) => prev.filter((_, idx) => idx !== i)),
      });
    });
    return filters;
  }, [searchQuery, companyFilter, activeStatus, columnFilters, companies]);

  // ─── Handlers ───
  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      return { key, direction: 'asc' };
    });
  }, []);

  const handleRowSelect = useCallback((id: string, checked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) setSelectedRows(new Set(filteredRecords.map((r) => r.id)));
    else setSelectedRows(new Set());
  }, [filteredRecords]);

  const handleInlineEdit = useCallback((recordId: string, fieldCode: string, currentValue: string) => {
    setEditingCell({ recordId, fieldCode });
    setEditingValue(currentValue === '-' ? '' : currentValue);
  }, []);

  const handleInlineSave = useCallback(async () => {
    if (!editingCell || !token || !activeModuleId) return;
    const record = records.find((r) => r.id === editingCell.recordId);
    if (!record) return;
    try {
      const payload = parsePayload(record.currentPayload);
      payload[editingCell.fieldCode] = editingValue;
      await fetch(`/api/records?id=${editingCell.recordId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPayload: payload }),
      });
      setRecords((prev) => prev.map((r) =>
        r.id === editingCell.recordId ? { ...r, currentPayload: JSON.stringify(payload) } : r
      ));
    } catch { /* silent */ }
    setEditingCell(null);
  }, [editingCell, editingValue, token, activeModuleId, records]);

  const handleInlineCancel = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
  }, []);

  const handleSaveView = useCallback(async () => {
    if (!token || !activeModuleId) return;
    const name = prompt('Enter a name for this view:');
    if (!name) return;
    try {
      await fetch('/api/saved-views', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: activeModuleId,
          name,
          scope: 'COMBINED',
          columnConfig: JSON.stringify(visibleColumns),
          filterConfig: JSON.stringify({ search: searchQuery, status: activeStatus, company: companyFilter, columnFilters, filterLogic }),
        }),
      });
      loadSavedViews();
    } catch { /* silent */ }
  }, [token, activeModuleId, visibleColumns, searchQuery, activeStatus, companyFilter, columnFilters, filterLogic, loadSavedViews]);

  const handleLoadView = useCallback((view: { filterConfig?: string | null }) => {
    try {
      const fc = view.filterConfig ? JSON.parse(view.filterConfig) : {};
      if (fc.search) setSearchQuery(fc.search);
      if (fc.status) setActiveStatus(fc.status);
      if (fc.company) setCompanyFilter(fc.company);
      if (fc.columnFilters) setColumnFilters(fc.columnFilters);
      if (fc.filterLogic) setFilterLogic(fc.filterLogic);
    } catch { /* silent */ }
  }, []);

  // ─── Main Render ───
  return (
    <div className="p-4 lg:p-6 space-y-4 h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Entity Instances</h2>
          <p className="text-muted-foreground text-sm mt-1">Browse and manage master data entity instances</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">

          <Select value={activeModuleId} onValueChange={setActiveModuleId}>
            <SelectTrigger className="w-[200px] h-10">
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.moduleName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View Mode Toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm" className="h-9 rounded-none"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>List View</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'split' ? 'default' : 'ghost'}
                    size="sm" className={cn('h-9 rounded-none', viewMode === 'split' && 'bg-red-600 hover:bg-red-700 text-white')}
                    onClick={() => setViewMode('split')}
                  >
                    <Columns3 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Split View</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Button variant="outline" className="h-10" onClick={() => { if (activeModuleId) navigate('grid-editor', { moduleId: activeModuleId }); }} disabled={!activeModuleId}>
            <LayoutGrid className="w-4 h-4 mr-2" /> Grid View
          </Button>
          {perms.canCreate && (
            <Button className="bg-red-600 hover:bg-red-700 text-white h-10" onClick={() => { if (activeModuleId) navigate('record-detail', { moduleId: activeModuleId }); }} disabled={!activeModuleId}>
              <Plus className="w-4 h-4 mr-2" /> New Instance
            </Button>
          )}
        </div>
      </div>

      {!activeModuleId ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Select a module</h3>
            <p className="text-muted-foreground text-sm mt-1">Choose a module to view its entity instances</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm flex flex-col">
          {/* ── Workflow State Bar ── */}
          <div className="px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {STATUS_TABS.map((s) => {
                const count = s === 'ALL'
                  ? statusCounts.reduce((acc, sc) => acc + sc.count, 0)
                  : statusCounts.find((sc) => sc.status === s)?.count || 0;
                const config = STATUS_BADGE_CONFIG[s];
                const isActive = activeStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => setActiveStatus(s)}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all whitespace-nowrap min-h-[36px]',
                      isActive ? 'ring-2 ring-offset-1 ring-red-500/30 shadow-sm font-semibold' : 'opacity-70 hover:opacity-100',
                      s === 'ALL'
                        ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        : cn(config?.bg, config?.text, config?.border)
                    )}
                  >
                    {s === 'ALL' ? <List className="w-3 h-3" /> : <span className={cn('w-1.5 h-1.5 rounded-full', config?.dot || 'bg-gray-400')} />}
                    {s === 'ALL' ? 'All' : STATUS_LABELS[s] || s}
                    <span className={cn('font-bold tabular-nums', isActive && 'text-red-600 dark:text-red-400')}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Quick Filter Tabs ── */}
          <div className="px-4 py-2 border-b flex items-center gap-2 flex-wrap">
            {QUICK_FILTERS.map((qf) => (
              <Button
                key={qf.key}
                variant={activeQuickFilter === qf.key ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-8 text-xs gap-1.5', activeQuickFilter === qf.key && qf.key !== 'ALL' && 'bg-red-600 hover:bg-red-700 text-white')}
                onClick={() => setActiveQuickFilter(qf.key)}
              >
                <qf.icon className="w-3.5 h-3.5" />
                {qf.label}
              </Button>
            ))}
          </div>

          {/* ── Filter Panel ── */}
          <AnimatePresence>
            {filterPanelOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 border-b bg-muted/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Attribute Filters</p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Logic:</span>
                        <Select value={filterLogic} onValueChange={(v) => setFilterLogic(v as 'AND' | 'OR')}>
                          <SelectTrigger className="w-[70px] h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AND">AND</SelectItem>
                            <SelectItem value="OR">OR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterPanelOpen(false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {columnFilters.map((cf, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={cf.fieldCode} onValueChange={(v) => setColumnFilters((prev) => prev.map((f, idx) => idx === i ? { ...f, fieldCode: v } : f))}>
                        <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Field" /></SelectTrigger>
                        <SelectContent>
                          {fields.map((f: any) => (<SelectItem key={f.id} value={f.fieldCode}>{f.fieldName}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Select value={cf.operator} onValueChange={(v) => setColumnFilters((prev) => prev.map((f, idx) => idx === i ? { ...f, operator: v } : f))}>
                        <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="equals">Equals</SelectItem>
                          <SelectItem value="starts">Starts with</SelectItem>
                          <SelectItem value="not_contains">Not contains</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={cf.value} onChange={(e) => setColumnFilters((prev) => prev.map((f, idx) => idx === i ? { ...f, value: e.target.value } : f))} className="h-8 text-xs flex-1" placeholder="Filter value..." />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setColumnFilters((prev) => prev.filter((_, idx) => idx !== i))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1"
                      onClick={() => setColumnFilters((prev) => [...prev, { fieldCode: fields[0]?.fieldCode || '', operator: 'contains', value: '' }])}
                      disabled={fields.length === 0}>
                      <Plus className="w-3 h-3" /> Add Filter
                    </Button>
                    {columnFilters.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setColumnFilters([])}>
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Search & Controls Row ── */}
          <div className="px-4 py-3 border-b space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search records..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isSuperAdmin && companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] h-9">
                    <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="All Companies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Companies</SelectItem>
                    {companies.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.companyCode} - {c.companyName}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}

              <Button variant={filterPanelOpen ? 'default' : 'outline'} size="sm" className="h-9 gap-1.5" onClick={() => setFilterPanelOpen(!filterPanelOpen)}>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {columnFilters.length > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px] bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400">{columnFilters.length}</Badge>
                )}
              </Button>

              <Popover open={columnPopoverOpen} onOpenChange={setColumnPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5">
                    {Object.values(visibleColumns).filter(Boolean).length < fields.length ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    Columns
                    <span className="text-[10px] text-muted-foreground">({Object.values(visibleColumns).filter(Boolean).length}/{fields.length})</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="end">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Toggle Columns</p>
                    {fields.map((f: any) => (
                      <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm">
                        <Checkbox checked={visibleColumns[f.id] !== false} onCheckedChange={(checked) => setVisibleColumns((prev) => ({ ...prev, [f.id]: checked === true }))} />
                        <span className="truncate">{f.fieldName}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleSaveView}>
                      <Save className="w-3.5 h-3.5" /> Save View
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save current filter/column configuration</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {savedViews.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Saved Views:</span>
                {savedViews.map((v) => (
                  <Button key={v.id} variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleLoadView(v)}>
                    {v.isDefault && <Check className="w-3 h-3 text-emerald-600" />}
                    {v.name}
                  </Button>
                ))}
              </div>
            )}

            <AnimatePresence>
              {activeFilters.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  {activeFilters.map((f) => (
                    <span key={f.key} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-accent border border-border">
                      {f.label}
                      <button onClick={f.onClear} className="hover:text-red-600 transition-colors"><XCircle className="w-3 h-3" /></button>
                    </span>
                  ))}
                  <button onClick={() => { setSearchQuery(''); setCompanyFilter('ALL'); setActiveStatus('ALL'); setColumnFilters([]); setActiveQuickFilter('ALL'); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                    Clear all
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bulk Actions Toolbar */}
          <AnimatePresence>
            {selectedRows.size > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mx-4 mt-2">
                <span className="text-sm font-medium text-red-700 dark:text-red-400">{selectedRows.size} selected</span>
                <Separator orientation="vertical" className="h-5" />
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={!perms.canBulk || !perms.canApprove}><ThumbsUp className="w-3 h-3" /> Submit for Approval</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={!perms.canBulk || !perms.canEdit}><Pencil className="w-3 h-3" /> Bulk Edit</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600" disabled={!perms.canBulk || !perms.canDelete}><Trash2 className="w-3 h-3" /> Delete</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => setSelectedRows(new Set())}><X className="w-3 h-3" /> Clear</Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Record count */}
          <div className="px-4 py-2 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {filteredRecords.length} of {total} instance{total !== 1 ? 's' : ''}
                {searchQuery && <span> matching &ldquo;{searchQuery}&rdquo;</span>}
                {companyFilter !== 'ALL' && <span> (filtered by company)</span>}
              </p>
              <p className="text-[10px] text-muted-foreground hidden sm:block">{perms.canEdit ? 'Double-click a cell to edit · Right-click for more actions' : 'Right-click for more actions'}</p>
            </div>
          </div>

          {/* ── Main Content ── */}
          <CardContent className="p-0 flex-1">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-16 text-center">
                {searchQuery || companyFilter !== 'ALL' || columnFilters.length > 0 ? (
                  <>
                    <Search className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium">No matching entity instances</h3>
                    <p className="text-muted-foreground text-sm mt-1">Try adjusting your search or filters</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearchQuery(''); setCompanyFilter('ALL'); setColumnFilters([]); }}>Clear Filters</Button>
                  </>
                ) : (
                  <>
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium">No entity instances found</h3>
                    <p className="text-muted-foreground text-sm mt-1">Create your first instance to get started</p>
                    {perms.canCreate && (
                      <Button className="mt-4 bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => navigate('record-detail', { moduleId: activeModuleId })}>
                        <Plus className="w-4 h-4 mr-1.5" /> New Instance
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : viewMode === 'split' ? (
              <ResizablePanelGroup direction="horizontal" className="min-h-[400px]">
                <ResizablePanel defaultSize={60} minSize={35}>
                  {/* Table inside split view */}
                  <div className="max-h-[calc(100vh-380px)] overflow-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox checked={selectedRows.size === filteredRecords.length && filteredRecords.length > 0} onCheckedChange={handleSelectAll} />
                          </TableHead>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-accent/50" onClick={() => handleSort('status')}>
                            <div className="flex items-center gap-1">Workflow State <SortIcon columnKey="status" sortConfig={sortConfig} /></div>
                          </TableHead>
                          <TableHead className="w-10">Image</TableHead>
                          {displayFields.map((f: any) => (
                            <TableHead key={f.id} className="cursor-pointer select-none hover:bg-accent/50" onClick={() => handleSort(f.fieldCode)}>
                              <div className="flex items-center gap-1">{f.fieldName} <SortIcon columnKey={f.fieldCode} sortConfig={sortConfig} /></div>
                            </TableHead>
                          ))}
                          <TableHead>Company</TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-accent/50" onClick={() => handleSort('updatedAt')}>
                            <div className="flex items-center gap-1">Updated <SortIcon columnKey="updatedAt" sortConfig={sortConfig} /></div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.map((r, idx) => (
                          <ContextMenu key={r.id}>
                            <ContextMenuTrigger asChild>
                              <TableRow
                                className={cn(
                                  'cursor-pointer transition-colors',
                                  selectedRecord?.id === r.id && 'bg-red-50/50 dark:bg-red-900/10',
                                  selectedRows.has(r.id) && 'bg-amber-50/50 dark:bg-amber-900/10',
                                  'hover:bg-accent/50'
                                )}
                                onClick={() => setSelectedRecord(r)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox checked={selectedRows.has(r.id)} onCheckedChange={(checked) => handleRowSelect(r.id, checked === true)} />
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">{(page - 1) * limit + idx + 1}</TableCell>
                                <TableCell><StatusBadge status={r.status} /></TableCell>
                                <TableCell>
                                  {recordImagesMap[r.id]?.length > 0 ? (
                                    <button
                                      type="button"
                                      className="w-7 h-7 rounded overflow-hidden border hover:ring-2 hover:ring-red-400 transition-all"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const imgs = (recordImagesMap[r.id] || []).map((img: any) => ({
                                          id: img.id,
                                          fileName: img.fileName,
                                          filePath: img.filePath,
                                          altText: img.altText,
                                          isPrimary: img.isPrimary,
                                          sortOrder: img.sortOrder,
                                          fileSize: img.fileSize,
                                          mimeType: img.mimeType,
                                          variants: img.variants,
                                        }));
                                        setLightboxImages(imgs);
                                        setLightboxIndex(imgs.findIndex((i: any) => i.isPrimary) || 0);
                                        setLightboxOpen(true);
                                      }}
                                      title="View images"
                                    >
                                      <img
                                        src={recordImagesMap[r.id][0]?.variants?.thumbnail || recordImagesMap[r.id][0]?.filePath}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                                      />
                                    </button>
                                  ) : (
                                    <div className="w-7 h-7 rounded border border-dashed flex items-center justify-center text-muted-foreground/30">
                                      <ImageIcon className="w-3 h-3" />
                                    </div>
                                  )}
                                </TableCell>
                                {displayFields.map((f: any) => (
                                  <TableCell key={f.id} className="max-w-[200px]">
                                    {editingCell?.recordId === r.id && editingCell?.fieldCode === f.fieldCode ? (
                                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Input ref={editInputRef} value={editingValue} onChange={(e) => setEditingValue(e.target.value)} className="h-7 text-xs"
                                          onKeyDown={(e) => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') handleInlineCancel(); }}
                                          onBlur={handleInlineSave} />
                                      </div>
                                    ) : (
                                      <span className={cn('truncate block rounded px-1 -mx-1', perms.canEdit ? 'cursor-text hover:bg-accent/30' : 'cursor-default')}
                                        onDoubleClick={perms.canEdit ? (e) => { e.stopPropagation(); handleInlineEdit(r.id, f.fieldCode, String(getPayloadValue(r, f.fieldCode))); } : undefined}
                                        title={perms.canEdit ? 'Double-click to edit' : 'Read only'}>
                                        {String(getPayloadValue(r, f.fieldCode))}
                                      </span>
                                    )}
                                  </TableCell>
                                ))}
                                <TableCell className="text-xs">{r.company?.companyCode || '-'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString()}</TableCell>
                              </TableRow>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-52">
                              {perms.canEdit && (
                                <ContextMenuItem onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: r.id })}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit <ContextMenuShortcut>⌘E</ContextMenuShortcut>
                                </ContextMenuItem>
                              )}
                              <ContextMenuItem onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: r.id })}>
                                <Eye className="w-4 h-4 mr-2" /> View <ContextMenuShortcut>⌘V</ContextMenuShortcut>
                              </ContextMenuItem>
                              {perms.canCreate && (
                                <ContextMenuItem><Copy className="w-4 h-4 mr-2" /> Duplicate <ContextMenuShortcut>⌘D</ContextMenuShortcut></ContextMenuItem>
                              )}
                              <ContextMenuSeparator />
                              {(r.status === 'DRAFT' || r.status === 'REJECTED') && perms.canApprove && (
                                <ContextMenuItem><ThumbsUp className="w-4 h-4 mr-2" /> Submit for Approval <ContextMenuShortcut>⌘S</ContextMenuShortcut></ContextMenuItem>
                              )}
                              {perms.canDelete && (
                                <ContextMenuItem variant="destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete <ContextMenuShortcut>⌘⌫</ContextMenuShortcut></ContextMenuItem>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={40} minSize={25}>
                  <ScrollArea className="h-full">
                    <RecordPreview record={selectedRecord} fields={fields} activeModuleId={activeModuleId} navigate={navigate} perms={perms} />
                  </ScrollArea>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              /* List view (no split) */
              <div className="max-h-[calc(100vh-380px)] overflow-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={selectedRows.size === filteredRecords.length && filteredRecords.length > 0} onCheckedChange={handleSelectAll} />
                      </TableHead>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-accent/50" onClick={() => handleSort('status')}>
                        <div className="flex items-center gap-1">Workflow State <SortIcon columnKey="status" sortConfig={sortConfig} /></div>
                      </TableHead>
                      <TableHead className="w-10">Image</TableHead>
                      {displayFields.map((f: any) => (
                        <TableHead key={f.id} className="cursor-pointer select-none hover:bg-accent/50" onClick={() => handleSort(f.fieldCode)}>
                          <div className="flex items-center gap-1">{f.fieldName} <SortIcon columnKey={f.fieldCode} sortConfig={sortConfig} /></div>
                        </TableHead>
                      ))}
                      <TableHead>Company</TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-accent/50" onClick={() => handleSort('updatedAt')}>
                        <div className="flex items-center gap-1">Updated <SortIcon columnKey="updatedAt" sortConfig={sortConfig} /></div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((r, idx) => (
                      <ContextMenu key={r.id}>
                        <ContextMenuTrigger asChild>
                          <TableRow
                            className={cn('cursor-pointer hover:bg-accent/50', selectedRows.has(r.id) && 'bg-amber-50/50 dark:bg-amber-900/10')}
                            onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: r.id })}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={selectedRows.has(r.id)} onCheckedChange={(checked) => handleRowSelect(r.id, checked === true)} />
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{(page - 1) * limit + idx + 1}</TableCell>
                            <TableCell><StatusBadge status={r.status} /></TableCell>
                            <TableCell>
                              {recordImagesMap[r.id]?.length > 0 ? (
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded overflow-hidden border hover:ring-2 hover:ring-red-400 transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const imgs = (recordImagesMap[r.id] || []).map((img: any) => ({
                                      id: img.id,
                                      fileName: img.fileName,
                                      filePath: img.filePath,
                                      altText: img.altText,
                                      isPrimary: img.isPrimary,
                                      sortOrder: img.sortOrder,
                                      fileSize: img.fileSize,
                                      mimeType: img.mimeType,
                                      variants: img.variants,
                                    }));
                                    setLightboxImages(imgs);
                                    setLightboxIndex(imgs.findIndex((i: any) => i.isPrimary) || 0);
                                    setLightboxOpen(true);
                                  }}
                                  title="View images"
                                >
                                  <img
                                    src={recordImagesMap[r.id][0]?.variants?.thumbnail || recordImagesMap[r.id][0]?.filePath}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                                  />
                                </button>
                              ) : (
                                <div className="w-7 h-7 rounded border border-dashed flex items-center justify-center text-muted-foreground/30">
                                  <ImageIcon className="w-3 h-3" />
                                </div>
                              )}
                            </TableCell>
                            {displayFields.map((f: any) => (
                              <TableCell key={f.id} className="max-w-[200px]">
                                {editingCell?.recordId === r.id && editingCell?.fieldCode === f.fieldCode ? (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input ref={editInputRef} value={editingValue} onChange={(e) => setEditingValue(e.target.value)} className="h-7 text-xs"
                                      onKeyDown={(e) => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') handleInlineCancel(); }}
                                      onBlur={handleInlineSave} />
                                  </div>
                                ) : (
                                  <span className={cn('truncate block rounded px-1 -mx-1', perms.canEdit ? 'cursor-text hover:bg-accent/30' : 'cursor-default')}
                                    onDoubleClick={perms.canEdit ? (e) => { e.stopPropagation(); handleInlineEdit(r.id, f.fieldCode, String(getPayloadValue(r, f.fieldCode))); } : undefined}
                                    title={perms.canEdit ? 'Double-click to edit' : 'Read only'}>
                                    {String(getPayloadValue(r, f.fieldCode))}
                                  </span>
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-xs">{r.company?.companyCode || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString()}</TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          {perms.canEdit && (
                            <ContextMenuItem onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: r.id })}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit <ContextMenuShortcut>⌘E</ContextMenuShortcut>
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: r.id })}>
                            <Eye className="w-4 h-4 mr-2" /> View <ContextMenuShortcut>⌘V</ContextMenuShortcut>
                          </ContextMenuItem>
                          {perms.canCreate && (
                            <ContextMenuItem><Copy className="w-4 h-4 mr-2" /> Duplicate <ContextMenuShortcut>⌘D</ContextMenuShortcut></ContextMenuItem>
                          )}
                          <ContextMenuSeparator />
                          {(r.status === 'DRAFT' || r.status === 'REJECTED') && perms.canApprove && (
                            <ContextMenuItem><ThumbsUp className="w-4 h-4 mr-2" /> Submit for Approval <ContextMenuShortcut>⌘S</ContextMenuShortcut></ContextMenuItem>
                          )}
                          {perms.canDelete && (
                            <ContextMenuItem variant="destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete <ContextMenuShortcut>⌘⌫</ContextMenuShortcut></ContextMenuItem>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onDelete={(imageId) => {
          setLightboxImages((prev) => prev.filter((img) => img.id !== imageId));
          if (lightboxImages.length <= 1) setLightboxOpen(false);
        }}
        token={token}
      />
    </div>
  );
}
