'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FileText, Plus, ChevronLeft, ChevronRight, Search, Building2, XCircle } from 'lucide-react';

const STATUS_TABS = ['ALL', 'DRAFT', 'IN_REVIEW', 'ACTIVE', 'REVISION_PENDING', 'REJECTED', 'ARCHIVED'];

export default function DataRecordsPage() {
  const { token, navigate, selectedModuleId, user } = useAppStore();
  const [modules, setModules] = useState<any[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string>(selectedModuleId || '');
  const [activeStatus, setActiveStatus] = useState('ALL');
  const [records, setRecords] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [companies, setCompanies] = useState<any[]>([]);
  const limit = 20;

  useEffect(() => {
    if (activeModuleId) {
      setPage(1);
    }
  }, [activeModuleId, activeStatus]);

  const loadModules = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setModules(data.modules || []);
      if (!activeModuleId && data.modules?.length > 0) {
        setActiveModuleId(data.modules[0].id);
      }
    } catch {
      // silent
    }
  }, [token]);

  const loadCompanies = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch {
      // silent
    }
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
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token, activeModuleId, activeStatus, page]);

  const loadFields = useCallback(async () => {
    if (!token || !activeModuleId) return;
    try {
      const res = await fetch(`/api/fields?moduleId=${activeModuleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setFields(data.fields || []);
    } catch {
      // silent
    }
  }, [token, activeModuleId]);

  useEffect(() => {
    loadModules();
    loadCompanies();
  }, [loadModules, loadCompanies]);

  useEffect(() => {
    if (activeModuleId) {
      loadFields();
      loadRecords();
    }
  }, [activeModuleId, loadFields, loadRecords]);

  const totalPages = Math.ceil(total / limit);
  const displayFields = fields.slice(0, 5);

  const getPayloadValue = (record: any, fieldCode: string) => {
    try {
      const payload = JSON.parse(record.currentPayload || '{}');
      return payload[fieldCode] ?? '-';
    } catch {
      return '-';
    }
  };

  // Client-side search + company filter
  const filteredRecords = useMemo(() => {
    let result = records;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        // Search in payload values
        try {
          const payload = JSON.parse(r.currentPayload || '{}');
          const payloadMatch = Object.values(payload).some(
            (v) => String(v).toLowerCase().includes(q)
          );
          if (payloadMatch) return true;
        } catch {
          // skip
        }
        // Search in status, company code
        if (r.status?.toLowerCase().includes(q)) return true;
        if (r.company?.companyCode?.toLowerCase().includes(q)) return true;
        if (r.company?.companyName?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    // Company filter
    if (companyFilter !== 'ALL') {
      result = result.filter((r) => r.companyId === companyFilter);
    }

    return result;
  }, [records, searchQuery, companyFilter]);

  const isSuperAdmin = user?.roles?.includes('Super Admin') ?? false;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Module Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Data Records</h2>
          <p className="text-muted-foreground text-sm mt-1">Browse and manage master data records</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={activeModuleId} onValueChange={setActiveModuleId}>
            <SelectTrigger className="w-[200px] h-11">
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.moduleName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white h-11"
            onClick={() => {
              if (activeModuleId) {
                navigate('record-detail', { moduleId: activeModuleId });
              }
            }}
            disabled={!activeModuleId}
          >
            <Plus className="w-4 h-4 mr-2" /> New Record
          </Button>
        </div>
      </div>

      {!activeModuleId ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Select a module</h3>
            <p className="text-muted-foreground text-sm mt-1">Choose a module to view its records</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 space-y-3">
            <Tabs value={activeStatus} onValueChange={setActiveStatus}>
              <TabsList className="h-9">
                {STATUS_TABS.map((s) => (
                  <TabsTrigger key={s} value={s} className="text-xs px-3 h-7">
                    {s === 'ALL' ? 'All' : STATUS_LABELS[s] || s}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Search & Filters Row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
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
                    {companies.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyCode} - {c.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Record count display */}
            <div className="px-4 py-2 border-b bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Showing {filteredRecords.length} of {total} record{total !== 1 ? 's' : ''}
                {searchQuery && <span> matching &ldquo;{searchQuery}&rdquo;</span>}
                {companyFilter !== 'ALL' && <span> (filtered by company)</span>}
              </p>
            </div>

            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-16 text-center">
                {searchQuery || companyFilter !== 'ALL' ? (
                  <>
                    <Search className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium">No matching records</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Try adjusting your search or filters
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setSearchQuery('');
                        setCompanyFilter('ALL');
                      }}
                    >
                      Clear Filters
                    </Button>
                  </>
                ) : (
                  <>
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium">No records found</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Create your first record to get started
                    </p>
                    <Button
                      className="mt-4 bg-red-600 hover:bg-red-700 text-white"
                      size="sm"
                      onClick={() => navigate('record-detail', { moduleId: activeModuleId })}
                    >
                      <Plus className="w-4 h-4 mr-1.5" /> New Record
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Status</TableHead>
                        {displayFields.map((f: any) => (
                          <TableHead key={f.id}>{f.fieldName}</TableHead>
                        ))}
                        <TableHead>Company</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((r, idx) => (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => navigate('record-detail', { moduleId: activeModuleId, recordId: r.id })}
                        >
                          <TableCell className="text-muted-foreground text-xs">
                            {(page - 1) * limit + idx + 1}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('text-xs border', STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700')}>
                              {STATUS_LABELS[r.status] || r.status}
                            </Badge>
                          </TableCell>
                          {displayFields.map((f: any) => (
                            <TableCell key={f.id} className="max-w-[200px] truncate">
                              {String(getPayloadValue(r, f.fieldCode))}
                            </TableCell>
                          ))}
                          <TableCell className="text-xs">{r.company?.companyCode || '-'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(r.updatedAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline" size="sm" className="h-8"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm font-medium">{page} / {totalPages}</span>
                      <Button
                        variant="outline" size="sm" className="h-8"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
