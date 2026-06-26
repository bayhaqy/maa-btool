'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PlusCircle, Pencil, ThumbsUp, XCircle, Trash2, Download, Search,
  ChevronLeft, ChevronRight, Filter, FileText,
} from 'lucide-react';

// Action types
type AuditAction = 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT' | 'DELETE';

const ACTION_CONFIG: Record<AuditAction, { label: string; color: string; icon: React.ElementType }> = {
  CREATE: { label: 'Created', color: 'bg-green-100 text-green-700 border-green-300', icon: PlusCircle },
  UPDATE: { label: 'Updated', color: 'bg-amber-100 text-amber-700 border-amber-300', icon: Pencil },
  APPROVE: { label: 'Approved', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: ThumbsUp },
  REJECT: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-300', icon: XCircle },
  DELETE: { label: 'Deleted', color: 'bg-red-100 text-red-700 border-red-300', icon: Trash2 },
};

const MODULES = ['Product Master', 'Pricing Master', 'Store Master', 'Vendor Master'];
const USERS = ['admin', 'data_mgr_jane', 'reviewer_bob', 'steward_alice', 'ops_mike', 'analyst_sarah'];
const ACTION_TYPES: AuditAction[] = ['CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'DELETE'];

// Generate realistic mock data
function generateMockAuditLogs() {
  const logs: {
    id: string;
    timestamp: Date;
    user: string;
    action: AuditAction;
    module: string;
    recordName: string;
    detail: string;
    companyId: string;
  }[] = [];

  const recordNames: Record<string, string[]> = {
    'Product Master': ['SKU-1001 Organic Milk 1L', 'SKU-1002 Whole Wheat Bread', 'SKU-1003 Fresh Orange Juice', 'SKU-1004 Premium Olive Oil', 'SKU-1005 Green Tea Pack'],
    'Pricing Master': ['PRC-2001 Q1 Promo Milk', 'PRC-2002 Holiday Bundle Bread', 'PRC-2003 Weekend Special Juice', 'PRC-2004 Bulk Discount Oil'],
    'Store Master': ['STR-3001 Downtown Flagship', 'STR-3002 Mall Outlet A', 'STR-3003 Airport Express', 'STR-3004 Suburban Branch'],
    'Vendor Master': ['VND-4001 FreshFarms Co.', 'VND-4002 BakeryPlus Ltd.', 'VND-4003 JuiceWorld Inc.', 'VND-4004 OliveGrove Supply'],
  };

  const details: Record<AuditAction, string[]> = {
    CREATE: ['New record created with all required fields', 'Record created from bulk import', 'New entry added via API'],
    UPDATE: ['Price updated from $2.99 to $3.49', 'Status changed to Active', 'Vendor contact details updated', 'Store operating hours modified', 'Product description revised'],
    APPROVE: ['Record approved for production use', 'Batch approval - 5 records', 'Auto-approved per business rules'],
    REJECT: ['Missing mandatory field: GST Number', 'Duplicate record detected', 'Price below minimum threshold'],
    DELETE: ['Record archived per retention policy', 'Duplicate entry removed', 'Test data cleanup'],
  };

  const companyIds = ['MAA01', 'MAA02', 'MAA03'];
  let idCounter = 1;

  // Generate 25 entries over the last 7 days
  for (let i = 0; i < 25; i++) {
    const hoursAgo = Math.floor(Math.random() * 168); // up to 7 days
    const action = ACTION_TYPES[Math.floor(Math.random() * ACTION_TYPES.length)];
    const moduleName = MODULES[Math.floor(Math.random() * MODULES.length)];
    const names = recordNames[moduleName];
    const recordName = names[Math.floor(Math.random() * names.length)];
    const actionDetails = details[action];
    const detail = actionDetails[Math.floor(Math.random() * actionDetails.length)];
    const user = USERS[Math.floor(Math.random() * USERS.length)];

    logs.push({
      id: `AUD-${String(idCounter++).padStart(4, '0')}`,
      timestamp: new Date(Date.now() - hoursAgo * 3600000),
      user,
      action,
      module: moduleName,
      recordName,
      detail,
      companyId: companyIds[Math.floor(Math.random() * companyIds.length)],
    });
  }

  // Sort by timestamp descending
  logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return logs;
}

const ALL_LOGS = generateMockAuditLogs();

// Relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function AuditLogPage() {
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterModule, setFilterModule] = useState<string>('ALL');
  const [filterUser, setFilterUser] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Apply filters
  const filteredLogs = useMemo(() => {
    return ALL_LOGS.filter((log) => {
      if (filterAction !== 'ALL' && log.action !== filterAction) return false;
      if (filterModule !== 'ALL' && log.module !== filterModule) return false;
      if (filterUser !== 'ALL' && log.user !== filterUser) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          log.recordName.toLowerCase().includes(q) ||
          log.detail.toLowerCase().includes(q) ||
          log.user.toLowerCase().includes(q) ||
          log.module.toLowerCase().includes(q) ||
          log.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filterAction, filterModule, filterUser, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);

  const handleResetFilters = () => {
    setFilterAction('ALL');
    setFilterModule('ALL');
    setFilterUser('ALL');
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters = filterAction !== 'ALL' || filterModule !== 'ALL' || filterUser !== 'ALL' || searchQuery !== '';

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <p className="text-muted-foreground text-sm mt-1">Track all data changes and user actions</p>
        </div>
        <Button variant="outline" className="h-10">
          <Download className="w-4 h-4 mr-2" />
          Export Log
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters</span>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1 w-full">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search records, users, details..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px] h-9">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Actions</SelectItem>
                  {ACTION_TYPES.map((a) => (
                    <SelectItem key={a} value={a}>{ACTION_CONFIG[a].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterModule} onValueChange={(v) => { setFilterModule(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[170px] h-9">
                  <SelectValue placeholder="Module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Modules</SelectItem>
                  {MODULES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterUser} onValueChange={(v) => { setFilterUser(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px] h-9">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Users</SelectItem>
                  {USERS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={handleResetFilters}>
                Clear all
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredLogs.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredLogs.length)} of {filteredLogs.length} entries
        </p>
      </div>

      {/* Activity Timeline */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No entries found</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {hasActiveFilters ? 'Try adjusting your filters' : 'No audit log entries available'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="mt-4" onClick={handleResetFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {paginatedLogs.map((log) => {
                const config = ACTION_CONFIG[log.action];
                const ActionIcon = config.icon;
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-4 p-4 hover:bg-accent/30 transition-colors"
                  >
                    {/* Action Icon */}
                    <div className={cn('p-2 rounded-lg shrink-0', config.color.split(' ')[0])}>
                      <ActionIcon className={cn('w-4 h-4', config.color.split(' ')[1])} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <div className="flex items-center gap-2">
                          <Badge className={cn('text-[10px] border font-medium', config.color)}>
                            {config.label}
                          </Badge>
                          <span className="text-sm font-medium">{log.recordName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{log.module}</span>
                          <span>·</span>
                          <span>{log.companyId}</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{log.detail}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">{log.id}</span>
                        <span>·</span>
                        <span>by <span className="font-medium">{log.user}</span></span>
                        <span>·</span>
                        <span>{getRelativeTime(log.timestamp)}</span>
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        {log.timestamp.toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="h-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
