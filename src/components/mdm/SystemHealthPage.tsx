'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Activity,
  Database,
  ShieldCheck,
  Mail,
  HardDrive,
  Layers,
  Sparkles,
  FileStack,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Server,
  Cpu,
  Clock,
  MemoryStick,
  Settings2,
  Users,
  Building2,
  Boxes,
  FileText,
  KeyRound,
  ListFilter,
  GitBranch,
  Loader2,
  CircleAlert,
  Gauge,
  HardDriveDownload,
  Table2,
  Zap,
  Cloud,
  CloudCog,
  ImageIcon,
} from 'lucide-react';

// ── Types matching the /api/health response ──────────────────────────────
type ServiceStatus = 'operational' | 'degraded' | 'down' | 'not_configured';
type OverallStatus = 'healthy' | 'degraded' | 'unhealthy';

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  responseTimeMs: number;
  details: string;
}

interface HealthStats {
  users: number;
  companies: number;
  modules: number;
  records: number;
  docs: number;
  apiKeys: number;
  lookups: number;
  pendingApprovals: number;
}

interface SystemInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
    heapUsedPct?: number;
  };
  cpuUsage?: {
    userMicros: number;
    systemMicros: number;
  };
  pid: number;
  timestamp: string;
}

interface ResourceUsage {
  databaseSizeBytes: number | null;
  databaseSizePretty: string | null;
  tableCount: number | null;
  connectionCount: number | null;
  cacheHitRatioPct: number | null;
  estimatedRows: Record<string, number>;
}

interface RedisUsage {
  available: boolean;
  dailyRequestCount: number | null;
  dailyRequestLimit: number | null;
  dailyBandwidthBytes: number | null;
  plan: string | null;
  error?: string;
}

interface R2Stats {
  r2AssetsCount: number;
  r2ImageAssetsCount: number;
  r2TotalSize: number;
  configInfo: {
    endpoint: string;
    bucket: string;
    publicUrl: string;
    hasPublicUrl: boolean;
  } | null;
  storageBreakdown: {
    r2: number;
    local: number;
    fileAsset: number;
  };
}

interface HealthResponse {
  status: OverallStatus;
  timestamp: string;
  services: ServiceCheck[];
  stats: HealthStats;
  systemInfo: SystemInfo;
  resourceUsage?: ResourceUsage;
  redisUsage?: RedisUsage;
  r2Stats?: R2Stats;
  envVars: Record<string, boolean>;
  requestedBy?: {
    userId: string;
    username: string;
    roles: string[];
  };
}

// ── Service icon + accent mapping ────────────────────────────────────────
const SERVICE_META: Record<
  string,
  { icon: React.ElementType; accent: string }
> = {
  Database: { icon: Database, accent: 'from-red-500 to-red-700' },
  Auth: { icon: ShieldCheck, accent: 'from-emerald-500 to-emerald-700' },
  Email: { icon: Mail, accent: 'from-sky-500 to-sky-700' },
  Cache: { icon: HardDrive, accent: 'from-amber-500 to-amber-700' },
  'Vector DB': { icon: Layers, accent: 'from-violet-500 to-violet-700' },
  AI: { icon: Sparkles, accent: 'from-fuchsia-500 to-fuchsia-700' },
  'File Storage': { icon: FileStack, accent: 'from-teal-500 to-teal-700' },
  'Cloud Storage': { icon: Cloud, accent: 'from-orange-500 to-orange-700' },
};

const STATUS_BADGE: Record<
  ServiceStatus,
  {
    label: string;
    className: string;
    icon: React.ElementType;
  }
> = {
  operational: {
    label: 'Operational',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
    icon: CheckCircle2,
  },
  degraded: {
    label: 'Degraded',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
    icon: AlertTriangle,
  },
  not_configured: {
    label: 'Not Configured',
    className: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-600',
    icon: CircleAlert,
  },
  down: {
    label: 'Down',
    className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
    icon: XCircle,
  },
};

const OVERALL_META: Record<
  OverallStatus,
  {
    label: string;
    banner: string;
    badge: string;
    icon: React.ElementType;
    ring: string;
  }
> = {
  healthy: {
    label: 'All Systems Operational',
    banner:
      'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    icon: CheckCircle2,
    ring: 'ring-emerald-200 dark:ring-emerald-800',
  },
  degraded: {
    label: 'System Degraded',
    banner:
      'bg-gradient-to-r from-amber-500 to-amber-600 text-white',
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
    icon: AlertTriangle,
    ring: 'ring-amber-200 dark:ring-amber-800',
  },
  unhealthy: {
    label: 'System Unhealthy',
    banner:
      'bg-gradient-to-r from-red-600 to-red-800 text-white',
    badge: 'bg-red-100 text-red-700 border-red-300',
    icon: XCircle,
    ring: 'ring-red-200 dark:ring-red-800',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 5_000) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

const REFRESH_INTERVAL_MS = 30_000;

// ── Page ─────────────────────────────────────────────────────────────────
export default function SystemHealthPage() {
  const { token, user } = useAppStore();
  const isSuperAdmin =
    user?.roles?.includes('Super Admin') ?? false;

  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadHealth = useCallback(
    async (isManual = false) => {
      if (!token) {
        setError('Not authenticated — please sign in again.');
        setLoading(false);
        return;
      }
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch('/api/health', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || `Request failed (${res.status})`);
        }
        setData(payload as HealthResponse);
        setLastChecked(new Date().toISOString());
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  // Initial fetch
  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  // Auto-refresh every 30s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void loadHealth(false);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, loadHealth]);

  // Re-render relative time every second so "last checked" stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Access guard ───────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Alert variant="destructive">
          <ShieldCheck className="w-4 h-4" />
          <AlertTitle>Super Admin access required</AlertTitle>
          <AlertDescription>
            The System Health monitoring page is restricted to Super Admin
            users. Contact your administrator if you believe this is an error.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const overall = data?.status ?? 'unhealthy';
  const overallMeta = OVERALL_META[overall];
  const OverallIcon = overallMeta.icon;

  const memUsed = data?.systemInfo.memoryUsage.heapUsed ?? 0;
  const memTotal = data?.systemInfo.memoryUsage.heapTotal ?? 1;
  const memPct = Math.min(100, Math.round((memUsed / memTotal) * 100));

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold">System Health</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Real-time monitoring of all integrated services, database stats,
            and runtime information. Restricted to Super Admin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              id="auto-refresh"
            />
            <label
              htmlFor="auto-refresh"
              className="text-xs font-medium cursor-pointer select-none"
            >
              Auto-refresh · 30s
            </label>
          </div>
          <Button
            onClick={() => loadHealth(true)}
            disabled={refreshing}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Overall status banner ───────────────────────────────────────── */}
      {loading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : error ? (
        <Alert variant="destructive">
          <XCircle className="w-4 h-4" />
          <AlertTitle>Failed to load system health</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => loadHealth(true)}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : data ? (
        <div
          className={cn(
            'rounded-xl p-5 shadow-sm ring-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4',
            overallMeta.banner,
            overallMeta.ring,
          )}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 shrink-0">
              <OverallIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/80 font-medium">
                Overall Status
              </p>
              <h2 className="text-xl font-bold text-white">
                {overallMeta.label}
              </h2>
              <p className="text-xs text-white/80 mt-0.5">
                {data.services.length} services monitored ·{' '}
                {data.services.filter((s) => s.status === 'operational').length}{' '}
                operational
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:items-end gap-1">
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
              <Clock className="w-3 h-3 mr-1" />
              {lastChecked ? formatRelativeTime(lastChecked) : '—'}
            </Badge>
            {lastChecked && (
              <p className="text-[10px] text-white/70">
                {new Date(lastChecked).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Service cards grid ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Server className="w-5 h-5 text-red-600" />
          Service Status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-3 w-full" />
                  </CardContent>
                </Card>
              ))
            : data?.services.map((svc) => {
                const meta = SERVICE_META[svc.name] ?? {
                  icon: Server,
                  accent: 'from-slate-500 to-slate-700',
                };
                const Icon = meta.icon;
                const badge = STATUS_BADGE[svc.status];
                const StatusIcon = badge.icon;
                return (
                  <Card
                    key={svc.name}
                    className="shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br shadow-sm',
                            meta.accent,
                          )}
                        >
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <Badge
                          variant="outline"
                          className={badge.className}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {badge.label}
                        </Badge>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{svc.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {svc.details}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Response
                        </span>
                        <span className="text-xs font-mono font-medium">
                          {svc.responseTimeMs > 0
                            ? `${svc.responseTimeMs} ms`
                            : '—'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
      </section>

      {/* ── Database stats grid ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Database className="w-5 h-5 text-red-600" />
          Database Statistics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <StatCard
                icon={Users}
                label="Users"
                value={data?.stats.users}
                accent="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              />
              <StatCard
                icon={Building2}
                label="Companies"
                value={data?.stats.companies}
                accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              />
              <StatCard
                icon={Boxes}
                label="Modules"
                value={data?.stats.modules}
                accent="bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
              />
              <StatCard
                icon={FileText}
                label="Data Records"
                value={data?.stats.records}
                accent="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              />
              <StatCard
                icon={FileStack}
                label="Documentation"
                value={data?.stats.docs}
                accent="bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
              />
              <StatCard
                icon={KeyRound}
                label="API Keys"
                value={data?.stats.apiKeys}
                accent="bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
              />
              <StatCard
                icon={ListFilter}
                label="Lookups"
                value={data?.stats.lookups}
                accent="bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300"
              />
              <StatCard
                icon={GitBranch}
                label="Pending Approvals"
                value={data?.stats.pendingApprovals}
                accent={
                  (data?.stats.pendingApprovals ?? 0) > 0
                    ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                    : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
                }
              />
            </>
          )}
        </div>
      </section>

      {/* ── Cloud Storage (Cloudflare R2) ──────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CloudCog className="w-5 h-5 text-red-600" />
          Cloud Storage
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* R2 Service status card */}
          {data?.services.find((s) => s.name === 'Cloud Storage') && (
            <Card className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-sm">
                    <Cloud className="w-5 h-5 text-white" />
                  </div>
                  {(() => {
                    const svc = data!.services.find((s) => s.name === 'Cloud Storage')!;
                    const badge = STATUS_BADGE[svc.status];
                    const StatusIcon = badge.icon;
                    return (
                      <Badge variant="outline" className={badge.className}>
                        <StatusIcon className="w-3 h-3" />
                        {badge.label}
                      </Badge>
                    );
                  })()}
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Cloudflare R2</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data?.services.find((s) => s.name === 'Cloud Storage')?.details ?? '—'}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-1 border-t">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Response
                  </span>
                  <span className="text-xs font-mono font-medium">
                    {data?.services.find((s) => s.name === 'Cloud Storage')?.responseTimeMs != null
                      ? `${data.services.find((s) => s.name === 'Cloud Storage')!.responseTimeMs} ms`
                      : '—'}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* R2 Configuration */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm">
                  <Settings2 className="w-5 h-5 text-white" />
                </div>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                  Config
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Endpoint</span>
                  <span className="font-mono text-[11px] truncate max-w-[180px]" title={data?.r2Stats?.configInfo?.endpoint}>
                    {data?.r2Stats?.configInfo?.endpoint || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Bucket</span>
                  <span className="font-mono text-[11px]">
                    {data?.r2Stats?.configInfo?.bucket || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Public URL</span>
                  {data?.r2Stats?.configInfo?.hasPublicUrl ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      Configured
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Not set
                    </span>
                  )}
                </div>
                <Separator />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Connection</span>
                  {(() => {
                    const svc = data?.services.find((s) => s.name === 'Cloud Storage');
                    if (!svc) return <span className="text-[11px]">—</span>;
                    if (svc.status === 'operational') {
                      return (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Connected
                        </span>
                      );
                    }
                    if (svc.status === 'degraded') {
                      return (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          Can't connect
                        </span>
                      );
                    }
                    return (
                      <span className="flex items-center gap-1 text-slate-500 text-[11px] font-medium">
                        <CircleAlert className="w-3 h-3" />
                        Not configured
                      </span>
                    );
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* R2 Storage Statistics */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-sm">
                  <HardDrive className="w-5 h-5 text-white" />
                </div>
                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">
                  R2 Stats
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label="DAM Assets (R2)"
                  value={data?.r2Stats?.r2AssetsCount?.toLocaleString() ?? '—'}
                />
                <MiniStat
                  label="Image Assets (R2)"
                  value={data?.r2Stats?.r2ImageAssetsCount?.toLocaleString() ?? '—'}
                />
                <MiniStat
                  label="Est. R2 Size"
                  value={data?.r2Stats?.r2TotalSize ? formatBytes(data.r2Stats.r2TotalSize) : '—'}
                />
                <MiniStat
                  label="Total R2 Objects"
                  value={data?.r2Stats ? String(data.r2Stats.r2AssetsCount + data.r2Stats.r2ImageAssetsCount) : '—'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Storage type breakdown */}
          <Card className="shadow-sm sm:col-span-2 lg:col-span-3">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-sm">
                    <ImageIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Storage Distribution</p>
                    <p className="text-[11px] text-muted-foreground">
                      Asset storage type breakdown
                    </p>
                  </div>
                </div>
              </div>
              {/* Progress bar for R2 vs Local vs FileAsset */}
              {(() => {
                const r2 = data?.r2Stats?.storageBreakdown.r2 ?? 0;
                const local = data?.r2Stats?.storageBreakdown.local ?? 0;
                const fileAsset = data?.r2Stats?.storageBreakdown.fileAsset ?? 0;
                const total = r2 + local + fileAsset || 1;
                const r2Pct = Math.round((r2 / total) * 100);
                const localPct = Math.round((local / total) * 100);
                const fileAssetPct = 100 - r2Pct - localPct;
                return (
                  <div className="space-y-3">
                    {/* Combined bar */}
                    <div className="h-4 w-full rounded-full overflow-hidden flex bg-muted">
                      {r2 > 0 && (
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all"
                          style={{ width: `${r2Pct}%` }}
                          title={`R2: ${r2} (${r2Pct}%)`}
                        />
                      )}
                      {local > 0 && (
                        <div
                          className="h-full bg-gradient-to-r from-slate-400 to-slate-500 transition-all"
                          style={{ width: `${localPct}%` }}
                          title={`Local: ${local} (${localPct}%)`}
                        />
                      )}
                      {fileAsset > 0 && (
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-teal-600 transition-all"
                          style={{ width: `${fileAssetPct}%` }}
                          title={`FileAsset: ${fileAsset} (${fileAssetPct}%)`}
                        />
                      )}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-orange-500 to-orange-600" />
                        <span className="text-xs text-muted-foreground">
                          R2 Cloud <span className="font-semibold text-foreground">{r2}</span> ({r2Pct}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-slate-400 to-slate-500" />
                        <span className="text-xs text-muted-foreground">
                          Local <span className="font-semibold text-foreground">{local}</span> ({localPct}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-teal-500 to-teal-600" />
                        <span className="text-xs text-muted-foreground">
                          FileAsset <span className="font-semibold text-foreground">{fileAsset}</span> ({fileAssetPct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Resource usage (DB size, connections, Redis quota) ──────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-red-600" />
          Resource Usage &amp; Quotas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Database size */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-sm">
                  <HardDriveDownload className="w-5 h-5 text-white" />
                </div>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                  PostgreSQL
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Database Size</p>
                <p className="text-2xl font-bold leading-none mt-1">
                  {data?.resourceUsage?.databaseSizePretty ?? '—'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {data?.resourceUsage?.databaseSizeBytes
                    ? `${formatBytes(data.resourceUsage.databaseSizeBytes)} total`
                    : 'Size query unavailable'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Active connections */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                  Live
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">DB Connections</p>
                <p className="text-2xl font-bold leading-none mt-1">
                  {data?.resourceUsage?.connectionCount ?? '—'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Active sessions to current database
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Cache hit ratio */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-sm">
                  <Gauge className="w-5 h-5 text-white" />
                </div>
                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">
                  Buffer
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cache Hit Ratio</p>
                <p className="text-2xl font-bold leading-none mt-1">
                  {data?.resourceUsage?.cacheHitRatioPct != null
                    ? `${data.resourceUsage.cacheHitRatioPct.toFixed(1)}%`
                    : '—'}
                </p>
                <Progress
                  value={data?.resourceUsage?.cacheHitRatioPct ?? 0}
                  className="h-1.5 mt-2 bg-sky-100 dark:bg-sky-900/30"
                />
              </div>
            </CardContent>
          </Card>

          {/* Upstash Redis usage */}
          <Card className="shadow-sm sm:col-span-2 lg:col-span-3">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm">
                    <HardDrive className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Upstash Redis</p>
                    <p className="text-[11px] text-muted-foreground">
                      Free-tier usage monitoring
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    data?.redisUsage?.available
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 text-[10px]'
                  }
                >
                  {data?.redisUsage?.available ? 'Reachable' : 'Unavailable'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <MiniStat
                  label="Total Commands"
                  value={
                    data?.redisUsage?.dailyRequestCount != null
                      ? data.redisUsage.dailyRequestCount.toLocaleString()
                      : '—'
                  }
                />
                <MiniStat
                  label="Output Bandwidth"
                  value={
                    data?.redisUsage?.dailyBandwidthBytes != null
                      ? formatBytes(data.redisUsage.dailyBandwidthBytes)
                      : '—'
                  }
                />
                <MiniStat
                  label="Plan"
                  value={data?.redisUsage?.plan ?? 'Free'}
                />
                <MiniStat
                  label="Status"
                  value={
                    data?.redisUsage?.error
                      ? `error: ${data.redisUsage.error}`
                      : data?.redisUsage?.available
                        ? 'online'
                        : '—'
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Table row estimates ────────────────────────────────────────── */}
      {data?.resourceUsage &&
        Object.keys(data.resourceUsage.estimatedRows).length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Table2 className="w-5 h-5 text-red-600" />
              Table Row Estimates
              <span className="text-xs font-normal text-muted-foreground">
                (top {Object.keys(data.resourceUsage.estimatedRows).length} by row count)
              </span>
            </h2>
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <div className="max-h-72 overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table</TableHead>
                        <TableHead className="text-right">Estimated Rows</TableHead>
                        <TableHead className="w-32">Distribution</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(data.resourceUsage.estimatedRows)
                        .sort(([, a], [, b]) => b - a)
                        .map(([table, rows]) => {
                          const maxRows = Math.max(
                            ...Object.values(data.resourceUsage!.estimatedRows),
                            1,
                          );
                          const pct = Math.max(2, (rows / maxRows) * 100);
                          return (
                            <TableRow key={table}>
                              <TableCell className="font-mono text-xs">{table}</TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold">
                                {rows.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-red-500 to-red-700"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

      {/* ── System info + Env vars ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System info */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-red-600" />
              System Information
            </CardTitle>
            <CardDescription>
              Runtime details for the currently running server process.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : data ? (
              <>
                <InfoRow
                  icon={Cpu}
                  label="Node.js Version"
                  value={data.systemInfo.nodeVersion}
                />
                <InfoRow
                  icon={Server}
                  label="Platform"
                  value={`${data.systemInfo.platform} · ${data.systemInfo.arch}`}
                />
                <InfoRow
                  icon={Clock}
                  label="Uptime"
                  value={formatUptime(data.systemInfo.uptimeSeconds)}
                />
                <InfoRow
                  icon={Activity}
                  label="Process ID"
                  value={String(data.systemInfo.pid)}
                />
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <MemoryStick className="w-4 h-4" />
                      Heap Memory
                    </span>
                    <span className="font-mono text-xs">
                      {formatBytes(memUsed)} / {formatBytes(memTotal)} ({memPct}%)
                    </span>
                  </div>
                  <Progress
                    value={memPct}
                    className="h-2 bg-red-100 dark:bg-red-900/30"
                  />
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <MiniStat
                      label="RSS"
                      value={formatBytes(data.systemInfo.memoryUsage.rss)}
                    />
                    <MiniStat
                      label="External"
                      value={formatBytes(data.systemInfo.memoryUsage.external)}
                    />
                    <MiniStat
                      label="Heap Total"
                      value={formatBytes(data.systemInfo.memoryUsage.heapTotal)}
                    />
                    <MiniStat
                      label="Array Buffers"
                      value={formatBytes(
                        data.systemInfo.memoryUsage.arrayBuffers,
                      )}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Env var checklist */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-red-600" />
              Environment Variables
            </CardTitle>
            <CardDescription>
              Configuration status — values are never displayed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : data ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(data.envVars).map(([key, configured]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent/40 transition-colors"
                  >
                    <span className="font-mono text-xs truncate" title={key}>
                      {key}
                    </span>
                    {configured ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Configured
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Not set
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── Footer note ─────────────────────────────────────────────────── */}
      <div className="text-center text-xs text-muted-foreground py-2">
        <p className="flex items-center justify-center gap-1">
          <Activity className="w-3 h-3 text-red-600" />
          Health checks verify SDK initialization &amp; env vars only — no
          external network calls are made to third-party APIs.
        </p>
        {data?.requestedBy && (
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            Requested by {data.requestedBy.username} ({data.requestedBy.roles.join(', ')})
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value?: number;
  accent: string;
}) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-2">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            accent,
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">
            {value === undefined ? '—' : value.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      <span className="font-mono text-xs font-medium">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="font-mono text-xs font-medium">{value}</p>
    </div>
  );
}
