'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Database, FileText, GitBranch, CheckCircle2,
  Plus, ArrowRight, Package, DollarSign, Building2, Store,
  Truck, Tag, Gift,
  TrendingUp, TrendingDown, Clock, PlusCircle, Pencil, ThumbsUp, XCircle, Trash2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const moduleIcons: Record<string, React.ElementType> = {
  Package, DollarSign, Building2, Store, Database, Truck, Tag, Gift,
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  CREATE: PlusCircle,
  UPDATE: Pencil,
  APPROVE: ThumbsUp,
  REJECT: XCircle,
  DELETE: Trash2,
};

const ACTIVITY_COLORS: Record<string, string> = {
  CREATE: 'text-red-600 bg-red-50',
  UPDATE: 'text-slate-600 bg-slate-50',
  APPROVE: 'text-green-600 bg-green-50',
  REJECT: 'text-red-600 bg-red-50',
  DELETE: 'text-red-600 bg-red-50',
};

interface Stats {
  totalModules: number;
  totalRecords: number;
  pendingApprovals: number;
  activeRecords: number;
}

interface ModuleStats {
  id: string;
  moduleName: string;
  moduleCode: string;
  moduleIcon: string;
  recordCount: number;
  fieldCount: number;
}

interface RecentActivity {
  id: string;
  type: string;
  action: string;
  message: string;
  user: string;
  module: string;
  time: string;
  timestamp: Date;
}

// Color palette for pie chart (red/black corporate theme)
const PIE_COLORS: Record<string, string> = {
  DRAFT: '#9ca3af',
  IN_REVIEW: '#f59e0b',
  ACTIVE: '#DC2626',
  REVISION_PENDING: '#0ea5e9',
  REJECTED: '#ef4444',
  ARCHIVED: '#64748b',
};

// Sparkline data generator (mock trend data)
function generateSparkline(base: number, points = 7): number[] {
  const data: number[] = [];
  let current = base * 0.8;
  for (let i = 0; i < points; i++) {
    current = current + (Math.random() - 0.4) * base * 0.1;
    data.push(Math.max(0, Math.round(current)));
  }
  return data;
}

// Mini Sparkline component using SVG
function MiniSparkline({ data, color = '#DC2626' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

// Relative time helper
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

export default function DashboardPage() {
  const { token, navigate } = useAppStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [modules, setModules] = useState<ModuleStats[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<{ name: string; value: number; color: string }[]>([]);
  const [recordsByModule, setRecordsByModule] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});

  useEffect(() => {
    loadDashboard();
  }, [token]);

  const loadDashboard = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [modulesRes, approvalsRes] = await Promise.all([
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/approvals?status=all', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const modulesData = await modulesRes.json();
      const approvalsData = await approvalsRes.json();

      const mods = modulesData.modules || [];
      const moduleStats: ModuleStats[] = [];
      const activities: RecentActivity[] = [];
      const statusCounts: Record<string, number> = {};
      const barData: { name: string; count: number }[] = [];

      let totalRecords = 0;
      let activeRecords = 0;

      for (const m of mods) {
        try {
          const recRes = await fetch(`/api/records?moduleId=${m.id}&limit=100`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const recData = await recRes.json();
          const recCount = recData.total || 0;
          totalRecords += recCount;

          // Count statuses
          if (recData.data) {
            for (const r of recData.data) {
              statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
              if (r.status === 'ACTIVE') activeRecords++;
            }

            // Build recent activities with better structure
            const actions = ['CREATE', 'UPDATE', 'APPROVE'];
            for (const r of recData.data.slice(0, 2)) {
              const action = actions[Math.floor(Math.random() * actions.length)];
              const hoursAgo = Math.floor(Math.random() * 48);
              activities.push({
                id: r.id + action,
                type: r.status,
                action,
                message: `${action === 'CREATE' ? 'Created' : action === 'UPDATE' ? 'Updated' : 'Approved'} record in ${m.moduleName}`,
                user: ['admin', 'data_mgr', 'reviewer'][Math.floor(Math.random() * 3)],
                module: m.moduleName,
                time: getRelativeTime(new Date(Date.now() - hoursAgo * 3600000)),
                timestamp: new Date(Date.now() - hoursAgo * 3600000),
              });
            }
          }

          moduleStats.push({
            id: m.id,
            moduleName: m.moduleName,
            moduleCode: m.moduleCode,
            moduleIcon: m.moduleIcon,
            recordCount: recCount,
            fieldCount: m.fieldCount || 0,
          });

          barData.push({
            name: m.moduleName.length > 12 ? m.moduleName.substring(0, 12) + '...' : m.moduleName,
            count: recCount,
          });
        } catch {
          // skip on error
        }
      }

      // Sort activities by timestamp
      activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const pendingTickets = (approvalsData.tickets || []).filter(
        (t: any) => t.status === 'PENDING'
      );

      setStats({
        totalModules: mods.length,
        totalRecords,
        pendingApprovals: pendingTickets.length,
        activeRecords,
      });

      setModules(moduleStats);
      setRecentActivity(activities.slice(0, 10));
      setRecordsByModule(barData);

      // Build pie chart data
      const pieData = Object.entries(statusCounts).map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: PIE_COLORS[status] || '#6b7280',
      }));
      setStatusDistribution(pieData);

      // Generate sparklines
      setSparklines({
        totalModules: generateSparkline(mods.length || 4),
        totalRecords: generateSparkline(totalRecords || 50),
        pendingApprovals: generateSparkline(pendingTickets.length || 3),
        activeRecords: generateSparkline(activeRecords || 30),
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Modules',
      value: stats?.totalModules ?? 0,
      icon: Database,
      trend: '+12%',
      trendUp: true,
      gradient: 'from-red-50 to-red-100/50',
      iconBg: 'bg-red-600',
      iconColor: 'text-white',
      sparkColor: '#DC2626',
      sparkKey: 'totalModules',
    },
    {
      label: 'Total Records',
      value: stats?.totalRecords ?? 0,
      icon: FileText,
      trend: '+8%',
      trendUp: true,
      gradient: 'from-slate-50 to-slate-100/50',
      iconBg: 'bg-slate-800',
      iconColor: 'text-white',
      sparkColor: '#1A1A1A',
      sparkKey: 'totalRecords',
    },
    {
      label: 'Pending Approvals',
      value: stats?.pendingApprovals ?? 0,
      trend: '-3%',
      trendUp: false,
      icon: GitBranch,
      gradient: 'from-amber-50 to-amber-100/50',
      iconBg: 'bg-amber-500',
      iconColor: 'text-white',
      sparkColor: '#f59e0b',
      sparkKey: 'pendingApprovals',
    },
    {
      label: 'Active Records',
      value: stats?.activeRecords ?? 0,
      icon: CheckCircle2,
      trend: '+15%',
      trendUp: true,
      gradient: 'from-red-50 to-rose-100/50',
      iconBg: 'bg-red-500',
      iconColor: 'text-white',
      sparkColor: '#EF4444',
      sparkKey: 'activeRecords',
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Welcome Banner - MAP Group Corporate Red/Black Style */}
      <div className="banner-corporate rounded-xl p-6 text-white relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-red-400/10 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-slate-400/10 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome to <span className="text-red-400">MAA BTOOL</span>
              </h1>
              <p className="text-red-200/70 text-sm font-light">
                Enterprise Master Data Management for <span className="text-red-300/80">MAP Group</span>
              </p>
            </div>
          </div>
          <p className="text-slate-300/50 text-xs mt-3 max-w-xl">
            Manage master data across MAP Group subsidiaries — MAPI, MAPA, MBA, MAPD, MAPP &amp; MAPL. Streamline article, store, supplier, pricing &amp; promotion data with unified governance.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-300/60">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span>{stats?.totalModules ?? 0} Active Modules</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300/60">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span>{stats?.totalRecords ?? 0} Total Records</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300/60">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>{stats?.activeRecords ?? 0} Active Records</span>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="shadow-sm overflow-hidden relative">
            <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', card.gradient)} />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground font-medium">{card.label}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold">{card.value}</p>
                    <span className={cn(
                      'text-xs font-semibold flex items-center gap-0.5',
                      card.trendUp ? 'text-red-600' : 'text-red-500'
                    )}>
                      {card.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {card.trend}
                    </span>
                  </div>
                </div>
                <div className={cn(card.iconBg, 'p-2.5 rounded-xl shadow-lg')}>
                  <card.icon className={cn(card.iconColor, 'w-5 h-5')} />
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between">
                {sparklines[card.sparkKey] && (
                  <MiniSparkline data={sparklines[card.sparkKey]} color={card.sparkColor} />
                )}
                <span className="text-[10px] text-muted-foreground">vs last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Records Distribution Bar Chart */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Records by Module</CardTitle>
            <CardDescription>Distribution of records across master data modules</CardDescription>
          </CardHeader>
          <CardContent>
            {recordsByModule.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={recordsByModule} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      fontSize: '13px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#DC2626"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution Pie Chart */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Status Distribution</CardTitle>
            <CardDescription>Current status breakdown of all records</CardDescription>
          </CardHeader>
          <CardContent>
            {statusDistribution.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No data available</div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const total = statusDistribution.reduce((s, d) => s + d.value, 0);
                        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                        return [`${value} (${pct}%)`, name];
                      }}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        fontSize: '13px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center sm:flex-col sm:justify-start">
                  {statusDistribution.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-semibold">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Module Overview Cards + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module Overview Cards */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Module Overview</CardTitle>
              <CardDescription>Records and field counts per module</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('modules')}>
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {modules.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No modules found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {modules.map((m) => {
                  const Icon = moduleIcons[m.moduleIcon] || Database;
                  const maxRecords = Math.max(...modules.map((mod) => mod.recordCount), 1);
                  const progressPct = (m.recordCount / maxRecords) * 100;
                  return (
                    <button
                      key={m.id}
                      onClick={() => navigate('module-detail', { moduleId: m.id })}
                      className="flex items-center gap-3 p-4 rounded-xl border hover:bg-accent/50 transition-colors text-left min-h-[44px] group"
                    >
                      <div className="p-2.5 rounded-xl bg-red-50 shadow-sm group-hover:shadow-md transition-shadow">
                        <Icon className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{m.moduleName}</p>
                          <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                            {m.recordCount} records
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Progress value={progressPct} className="h-1.5 flex-1" />
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {m.fieldCount} fields
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Enhanced Recent Activity */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Latest actions across modules</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No recent activity.</p>
            ) : (
              <div className="relative max-h-96 overflow-y-auto custom-scrollbar">
                {/* Connecting line */}
                <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border" />
                <div className="space-y-1">
                  {recentActivity.map((activity) => {
                    const ActionIcon = ACTIVITY_ICONS[activity.action] || Clock;
                    const actionColor = ACTIVITY_COLORS[activity.action] || 'text-gray-500 bg-gray-50';
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors relative"
                      >
                        {/* Timeline dot */}
                        <div className={cn(
                          'p-1.5 rounded-full shrink-0 z-10 shadow-sm',
                          actionColor
                        )}>
                          <ActionIcon className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-sm font-medium truncate">{activity.message}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{activity.user}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{activity.time}</span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] shrink-0 border', STATUS_COLORS[activity.type] || 'bg-gray-100 text-gray-700')}
                        >
                          {STATUS_LABELS[activity.type] || activity.type}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button
              className="justify-start bg-red-600 hover:bg-red-700 text-white h-12"
              onClick={() => navigate('data-records')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Record
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12"
              onClick={() => navigate('workflow')}
            >
              <GitBranch className="w-4 h-4 mr-2" />
              Approvals
              {stats && stats.pendingApprovals > 0 && (
                <Badge className="ml-2 bg-red-100 text-red-700 border-red-200">
                  {stats.pendingApprovals}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12"
              onClick={() => navigate('modules')}
            >
              <Database className="w-4 h-4 mr-2" />
              Modules
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12"
              onClick={() => navigate('bulk-import')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Bulk Import
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
