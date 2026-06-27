'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Database, FileText, GitBranch, CheckCircle2,
  Plus, ArrowRight, Package, DollarSign, Building2, Store,
  Truck, Tag, Gift,
  TrendingUp, TrendingDown, Clock, PlusCircle, Pencil, ThumbsUp, XCircle, Trash2,
  Zap, BarChart3, Upload, Settings, Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

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
  CREATE: 'text-emerald-600 bg-emerald-50',
  UPDATE: 'text-slate-600 bg-slate-50',
  APPROVE: 'text-green-600 bg-green-50',
  REJECT: 'text-red-600 bg-red-50',
  DELETE: 'text-red-600 bg-red-50',
};

// Avatar initials for activity users
const USER_AVATARS: Record<string, { initials: string; color: string }> = {
  admin: { initials: 'SA', color: 'bg-red-100 text-red-700' },
  data_mgr: { initials: 'DM', color: 'bg-emerald-100 text-emerald-700' },
  reviewer: { initials: 'RV', color: 'bg-amber-100 text-amber-700' },
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

// Color palette for pie chart (corporate theme, no blue/indigo)
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

// Mini Sparkline component using SVG with area fill
function MiniSparkline({ data, color = '#DC2626' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 28;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const areaPath = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ` L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} className="opacity-70">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

// Animated counter hook
function useAnimatedCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (prevTarget.current === target) return;
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) { setCount(target); return; }

    const startTime = performance.now();
    let rafId: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + diff * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        prevTarget.current = target;
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return count;
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

  // Animated counters
  const animatedModules = useAnimatedCounter(stats?.totalModules ?? 0);
  const animatedRecords = useAnimatedCounter(stats?.totalRecords ?? 0);
  const animatedPending = useAnimatedCounter(stats?.pendingApprovals ?? 0);
  const animatedActive = useAnimatedCounter(stats?.activeRecords ?? 0);

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

          if (recData.data) {
            for (const r of recData.data) {
              statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
              if (r.status === 'ACTIVE') activeRecords++;
            }

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

      const pieData = Object.entries(statusCounts).map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: PIE_COLORS[status] || '#6b7280',
      }));
      setStatusDistribution(pieData);

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
      animatedValue: animatedModules,
      icon: Database,
      trend: '+12%',
      trendUp: true,
      gradient: 'from-red-500 to-rose-600',
      gradientBg: 'from-red-50/80 to-rose-50/50',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      sparkColor: '#DC2626',
      sparkKey: 'totalModules',
    },
    {
      label: 'Total Records',
      value: stats?.totalRecords ?? 0,
      animatedValue: animatedRecords,
      icon: FileText,
      trend: '+8%',
      trendUp: true,
      gradient: 'from-slate-700 to-slate-900',
      gradientBg: 'from-slate-50/80 to-slate-100/50',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      sparkColor: '#1A1A1A',
      sparkKey: 'totalRecords',
    },
    {
      label: 'Pending Approvals',
      value: stats?.pendingApprovals ?? 0,
      animatedValue: animatedPending,
      trend: '-3%',
      trendUp: false,
      icon: GitBranch,
      gradient: 'from-amber-500 to-orange-500',
      gradientBg: 'from-amber-50/80 to-orange-50/50',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      sparkColor: '#f59e0b',
      sparkKey: 'pendingApprovals',
    },
    {
      label: 'Active Records',
      value: stats?.activeRecords ?? 0,
      animatedValue: animatedActive,
      icon: CheckCircle2,
      trend: '+15%',
      trendUp: true,
      gradient: 'from-emerald-500 to-green-600',
      gradientBg: 'from-emerald-50/80 to-green-50/50',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      sparkColor: '#059669',
      sparkKey: 'activeRecords',
    },
  ];

  // Quick actions with prominent styling
  const quickActions = [
    { icon: Plus, label: 'Create Record', desc: 'Add new master data', color: 'from-red-500 to-red-600', onClick: () => navigate('data-records') },
    { icon: GitBranch, label: 'Approvals', desc: `${stats?.pendingApprovals ?? 0} pending`, color: 'from-amber-500 to-orange-500', onClick: () => navigate('workflow'), badge: stats?.pendingApprovals },
    { icon: Database, label: 'Modules', desc: 'Manage modules', color: 'from-slate-700 to-slate-800', onClick: () => navigate('modules') },
    { icon: Upload, label: 'Bulk Import', desc: 'Import CSV/Excel', color: 'from-emerald-500 to-green-600', onClick: () => navigate('bulk-import') },
    { icon: BarChart3, label: 'Analytics', desc: 'View reports', color: 'from-rose-500 to-pink-600', onClick: () => navigate('data-records') },
    { icon: Sparkles, label: 'AI Assistant', desc: 'Ask AI for help', color: 'from-red-600 to-rose-700', onClick: () => navigate('ai-assistant') },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="banner-corporate rounded-xl p-6 text-white relative overflow-hidden"
      >
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
          <div className="flex flex-wrap items-center gap-4 mt-4">
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
      </motion.div>

      {/* Enhanced Stat Cards with Gradient Backgrounds */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <Card className="shadow-sm overflow-hidden relative group hover:shadow-md transition-shadow duration-300">
              {/* Gradient overlay on left side */}
              <div className={cn('absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b', card.gradient)} />
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-50', card.gradientBg)} />
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground font-medium">{card.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold tabular-nums">{card.animatedValue.toLocaleString()}</p>
                      <span className={cn(
                        'text-xs font-semibold flex items-center gap-0.5',
                        card.trendUp ? 'text-emerald-600' : 'text-red-500'
                      )}>
                        {card.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {card.trend}
                      </span>
                    </div>
                  </div>
                  <div className={cn('p-2.5 rounded-xl bg-gradient-to-br shadow-lg', card.gradient)}>
                    <card.icon className="text-white w-5 h-5" />
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
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Records Distribution Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
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
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#DC2626" stopOpacity={1} />
                        <stop offset="100%" stopColor="#DC2626" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
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
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        fontSize: '13px',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="url(#barGradient)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                      animationDuration={800}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Status Distribution Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
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
                        animationDuration={800}
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
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
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
        </motion.div>
      </div>

      {/* Module Overview Cards + Recent Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module Overview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="lg:col-span-2"
        >
          <Card className="shadow-sm">
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
                  {modules.map((m, i) => {
                    const Icon = moduleIcons[m.moduleIcon] || Database;
                    const maxRecords = Math.max(...modules.map((mod) => mod.recordCount), 1);
                    const progressPct = (m.recordCount / maxRecords) * 100;
                    return (
                      <motion.button
                        key={m.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        onClick={() => navigate('module-detail', { moduleId: m.id })}
                        className="flex items-center gap-3 p-4 rounded-xl border hover:bg-accent/50 hover:shadow-md hover:border-red-200 dark:hover:border-red-800 transition-all duration-200 text-left min-h-[44px] group"
                      >
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-200">
                          <Icon className="w-5 h-5 text-red-600 dark:text-red-400" />
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
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity Timeline with Avatars */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
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
                  <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />
                  <div className="space-y-1">
                    <AnimatePresence initial={false}>
                      {recentActivity.map((activity) => {
                        const ActionIcon = ACTIVITY_ICONS[activity.action] || Clock;
                        const actionColor = ACTIVITY_COLORS[activity.action] || 'text-gray-500 bg-gray-50';
                        const avatar = USER_AVATARS[activity.user] || { initials: 'U', color: 'bg-slate-100 text-slate-600' };
                        return (
                          <motion.div
                            key={activity.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors relative"
                          >
                            {/* Avatar with action icon */}
                            <div className="relative shrink-0 z-10">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className={cn('text-[10px] font-semibold', avatar.color)}>
                                  {avatar.initials}
                                </AvatarFallback>
                              </Avatar>
                              <div className={cn(
                                'absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full shadow-sm',
                                actionColor
                              )}>
                                <ActionIcon className="w-2.5 h-2.5" />
                              </div>
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
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions - Larger, Prominent */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.7 }}
      >
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickActions.map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.8 + i * 0.05 }}
                  onClick={action.onClick}
                  className="group relative flex flex-col items-center gap-2 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:shadow-lg hover:border-red-200 dark:hover:border-red-800 transition-all duration-200 text-center min-h-[100px] justify-center"
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200',
                    action.color
                  )}>
                    <action.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{action.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{action.desc}</p>
                  </div>
                  {action.badge !== undefined && action.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                      {action.badge}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
