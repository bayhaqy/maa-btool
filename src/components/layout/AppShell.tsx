'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore, type PageView } from '@/stores/app-store';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Database,
  FileText,
  GitBranch,
  Network,
  Upload,
  Users,
  Shield,
  Building2,
  ListFilter,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Bell,
  User,
  Settings,
  Lock,
  ChevronRight as ChevronRightIcon,
  Home,
  ScrollText,
  Search,
  BookOpen,
  Sparkles,
  Key,
  HardDrive,
  Palette,
  Info,
  Activity,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { motion, AnimatePresence } from 'framer-motion';
import { useBranding } from '@/hooks/useBranding';
import type { SidebarStyle } from '@/lib/branding';
import OnboardingGuide from '@/components/layout/OnboardingGuide';
import {
  getAllowedPages,
  filterNavByRole,
  getDefaultPage,
  isSuperAdmin as isSuperAdminRole,
} from '@/lib/page-access';

// Lightweight placeholder shown while lazy-loaded pages compile.
function PageSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-md bg-muted/60" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-lg border bg-card/60" />
        ))}
      </div>
      <div className="h-64 rounded-lg border bg-card/40" />
    </div>
  );
}

// Lazy-load heavy page components so the initial bundle stays small and
// pages only compile on first visit. This dramatically improves the
// perceived performance of the dashboard shell.
import dynamic from 'next/dynamic';
const DashboardPage = dynamic(() => import('@/components/mdm/DashboardPage'), { loading: () => <PageSkeleton /> });
const ModulesPage = dynamic(() => import('@/components/mdm/ModulesPage'), { loading: () => <PageSkeleton /> });
const ModuleDetailPage = dynamic(() => import('@/components/mdm/ModuleDetailPage'), { loading: () => <PageSkeleton /> });
const DataRecordsPage = dynamic(() => import('@/components/mdm/DataRecordsPage'), { loading: () => <PageSkeleton /> });
const RecordDetailPage = dynamic(() => import('@/components/mdm/RecordDetailPage'), { loading: () => <PageSkeleton /> });
const WorkflowPage = dynamic(() => import('@/components/mdm/WorkflowPage'), { loading: () => <PageSkeleton /> });
const HierarchyPage = dynamic(() => import('@/components/mdm/HierarchyPage'), { loading: () => <PageSkeleton /> });
const HierarchyDetailPage = dynamic(() => import('@/components/mdm/HierarchyDetailPage'), { loading: () => <PageSkeleton /> });
const BulkImportPage = dynamic(() => import('@/components/mdm/BulkImportPage'), { loading: () => <PageSkeleton /> });
const AdminUsersPage = dynamic(() => import('@/components/mdm/AdminUsersPage'), { loading: () => <PageSkeleton /> });
const AdminRolesPage = dynamic(() => import('@/components/mdm/AdminRolesPage'), { loading: () => <PageSkeleton /> });
const AdminCompaniesPage = dynamic(() => import('@/components/mdm/AdminCompaniesPage'), { loading: () => <PageSkeleton /> });
const AdminLookupsPage = dynamic(() => import('@/components/mdm/AdminLookupsPage'), { loading: () => <PageSkeleton /> });
const AuditLogPage = dynamic(() => import('@/components/mdm/AuditLogPage'), { loading: () => <PageSkeleton /> });
const DocumentationPage = dynamic(() => import('@/components/mdm/DocumentationPage'), { loading: () => <PageSkeleton /> });
const AiAssistantPage = dynamic(() => import('@/components/mdm/AiAssistantPage'), { loading: () => <PageSkeleton /> });
const ApiManagementPage = dynamic(() => import('@/components/mdm/ApiManagementPage'), { loading: () => <PageSkeleton /> });
const BrandSettingsPage = dynamic(() => import('@/components/mdm/BrandSettingsPage'), { loading: () => <PageSkeleton /> });
const AboutPage = dynamic(() => import('@/components/mdm/AboutPage'), { loading: () => <PageSkeleton /> });
const SystemHealthPage = dynamic(() => import('@/components/mdm/SystemHealthPage'), { loading: () => <PageSkeleton /> });

interface NavItem {
  label: string;
  page: PageView;
  icon: React.ElementType;
  parent?: string;
}

const mainNav: NavItem[] = [
  { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
  { label: 'Data Records', page: 'data-records', icon: FileText },
  { label: 'Workflow', page: 'workflow', icon: GitBranch },
];

const toolsNav: NavItem[] = [
  { label: 'Hierarchy Manager', page: 'hierarchy', icon: Network },
  { label: 'Bulk Import', page: 'bulk-import', icon: Upload },
  { label: 'Audit Log', page: 'audit-log', icon: ScrollText },
  { label: 'Documentation Hub', page: 'documentation', icon: BookOpen },
  { label: 'AI Assistant', page: 'ai-assistant', icon: Sparkles },
];

const integrationsNav: NavItem[] = [
  { label: 'API Management', page: 'api-management', icon: Key },
];

const adminNav: NavItem[] = [
  { label: 'Users', page: 'admin-users', icon: Users },
  { label: 'Roles', page: 'admin-roles', icon: Shield },
  { label: 'Companies', page: 'admin-companies', icon: Building2 },
  { label: 'Lookups', page: 'admin-lookups', icon: ListFilter },
  { label: 'System Health', page: 'system-health', icon: Activity },
  { label: 'Settings', page: 'brand-settings', icon: Palette },
  { label: 'About', page: 'about', icon: Info },
];

function NavButton({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { currentPage, navigate } = useAppStore();
  const { settings } = useBranding();
  const isActive = currentPage === item.page;
  // Compact mode reduces padding and font size for a denser layout.
  const padClasses = settings.compactMode ? 'px-3 py-1.5 text-xs' : 'px-3 py-2.5 text-sm';
  const minHeight = settings.compactMode ? 'min-h-[36px]' : 'min-h-[44px]';

  const button = (
    <button
      onClick={() => navigate(item.page)}
      className={cn(
        'w-full flex items-center gap-3 rounded-lg font-medium transition-all duration-200 group relative',
        padClasses,
        minHeight,
        isActive
          ? 'nav-active-red text-red-900 dark:text-red-300 shadow-sm'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-red-600 to-red-800 dark:from-red-400 dark:to-red-600 transition-all duration-200" />
      )}
      <item.icon className={cn(
        'w-5 h-5 shrink-0 transition-transform duration-150',
        isActive
          ? 'text-red-600 dark:text-red-400'
          : 'group-hover:scale-110'
      )} />
      {!collapsed && (
        <span className="truncate">{item.label}</span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

function NavSection({ title, items, collapsed }: { title: string; items: NavItem[]; collapsed: boolean }) {
  return (
    <div className="py-2">
      {!collapsed && (
        <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      )}
      <div className="space-y-0.5 px-1">
        {items.map((item) => (
          <NavButton key={item.page} item={item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}

function PageContent() {
  const { currentPage, user, navigate } = useAppStore();
  const allowed = getAllowedPages(user?.roles);

  // Guard: if the current page is not allowed for the user's role, render a
  // "no access" notice and offer a safe redirect. We use a layout effect to
  // bounce them to their default page so the URL never lingers on a
  // forbidden view.
  useEffect(() => {
    if (!allowed.has(currentPage)) {
      const safe = getDefaultPage(user?.roles);
      // Defer the navigation to avoid setState-during-render warnings.
      const t = setTimeout(() => navigate(safe), 0);
      return () => clearTimeout(t);
    }
  }, [allowed, currentPage, user?.roles, navigate]);

  if (!allowed.has(currentPage)) {
    return (
      <div className="p-6">
        <PageSkeleton />
      </div>
    );
  }

  const pages: Record<PageView, React.ReactNode> = {
    dashboard: <DashboardPage />,
    modules: <ModulesPage />,
    'module-detail': <ModuleDetailPage />,
    'data-records': <DataRecordsPage />,
    'record-detail': <RecordDetailPage />,
    workflow: <WorkflowPage />,
    hierarchy: <HierarchyPage />,
    'hierarchy-detail': <HierarchyDetailPage />,
    'bulk-import': <BulkImportPage />,
    'admin-users': <AdminUsersPage />,
    'admin-roles': <AdminRolesPage />,
    'admin-companies': <AdminCompaniesPage />,
    'admin-lookups': <AdminLookupsPage />,
    'audit-log': <AuditLogPage />,
    settings: <SettingsPage />,
    documentation: <DocumentationPage />,
    'ai-assistant': <AiAssistantPage />,
    'api-management': <ApiManagementPage />,
    'brand-settings': <BrandSettingsPage />,
    'system-health': <SystemHealthPage />,
    about: <AboutPage />,
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentPage}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="h-full"
      >
        {pages[currentPage]}
      </motion.div>
    </AnimatePresence>
  );
}

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, replayOnboarding } = useAppStore();

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-muted-foreground mb-6">Manage your application preferences and account settings.</p>

      <div className="space-y-6">
        {/* Appearance */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Switch between light and dark themes</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="gap-2"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </Button>
          </div>
        </div>

        {/* Onboarding */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-1">Panduan & Onboarding</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Putar ulang tour pengenalan fitur kapan saja. Tour akan menampilkan informasi yang
            disesuaikan dengan peran Anda.
          </p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">Replay Onboarding Tour</p>
                <p className="text-xs text-muted-foreground">
                  Logged in as <span className="font-medium">{user?.username || '—'}</span>
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => replayOnboarding()}
              className="gap-2 shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              Replay
            </Button>
          </div>
        </div>

        {/* Account Info */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Account Information</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Username</span>
              <span className="text-sm font-medium">{user?.username || '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user?.email || '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Company</span>
              <span className="text-sm font-medium">{user?.companyCode || '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Role</span>
              <span className="text-sm font-medium">{user?.roles?.[0] || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { token } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must differ from the current password');
      return;
    }
    if (!token) {
      setError('You are not signed in. Please log in again.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to change password');
        return;
      }
      // Success — clear form + close dialog
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onOpenChange(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Update your account password. Make sure to choose a strong password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : 'Change Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getBreadcrumbPath(currentPage: PageView): { label: string; page?: PageView }[] {
  const paths: Record<PageView, { label: string; page?: PageView }[]> = {
    dashboard: [{ label: 'Home', page: 'dashboard' as PageView }],
    modules: [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Modules' }],
    'module-detail': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Modules', page: 'modules' as PageView }, { label: 'Module Builder' }],
    'data-records': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Data Records' }],
    'record-detail': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Data Records', page: 'data-records' as PageView }, { label: 'Record Detail' }],
    workflow: [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Workflow' }],
    hierarchy: [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Hierarchy Manager' }],
    'hierarchy-detail': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Hierarchy Manager', page: 'hierarchy' as PageView }, { label: 'Hierarchy Tree' }],
    'bulk-import': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Bulk Import' }],
    'admin-users': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Admin' }, { label: 'Users' }],
    'admin-roles': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Admin' }, { label: 'Roles' }],
    'admin-companies': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Admin' }, { label: 'Companies' }],
    'admin-lookups': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Admin' }, { label: 'Lookups' }],
    'audit-log': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Audit Log' }],
    settings: [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Settings' }],
    documentation: [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Documentation Hub' }],
    'ai-assistant': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'AI Assistant' }],
    'api-management': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Integrations' }, { label: 'API Management' }],
    'brand-settings': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Admin' }, { label: 'Settings' }],
    'system-health': [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Admin' }, { label: 'System Health' }],
    about: [{ label: 'Home', page: 'dashboard' as PageView }, { label: 'Admin' }, { label: 'About' }],
  };
  return paths[currentPage] || [{ label: 'Home', page: 'dashboard' as PageView }];
}

// Search command items
interface SearchCommandItem {
  label: string;
  page: PageView;
  icon: React.ElementType;
  keywords?: string[];
}

const searchNavigationItems: SearchCommandItem[] = [
  { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] },
  { label: 'Modules', page: 'modules', icon: Database, keywords: ['schema', 'builder', 'master'] },
  { label: 'Data Records', page: 'data-records', icon: FileText, keywords: ['records', 'entries', 'data'] },
  { label: 'Workflow', page: 'workflow', icon: GitBranch, keywords: ['approval', 'review', 'pending'] },
  { label: 'Hierarchy Manager', page: 'hierarchy', icon: Network, keywords: ['tree', 'structure'] },
  { label: 'Bulk Import', page: 'bulk-import', icon: Upload, keywords: ['upload', 'export', 'import'] },
  { label: 'Audit Log', page: 'audit-log', icon: ScrollText, keywords: ['log', 'history', 'activity'] },
  { label: 'Users', page: 'admin-users', icon: Users, keywords: ['admin', 'accounts'] },
  { label: 'Roles', page: 'admin-roles', icon: Shield, keywords: ['admin', 'permissions'] },
  { label: 'Companies', page: 'admin-companies', icon: Building2, keywords: ['admin', 'tenants'] },
  { label: 'Lookups', page: 'admin-lookups', icon: ListFilter, keywords: ['admin', 'dropdown', 'values'] },
  { label: 'Settings', page: 'settings', icon: Settings, keywords: ['preferences', 'theme', 'account'] },
  { label: 'Documentation Hub', page: 'documentation', icon: BookOpen, keywords: ['docs', 'knowledge', 'help', 'wiki'] },
  { label: 'AI Assistant', page: 'ai-assistant', icon: Sparkles, keywords: ['chat', 'ai', 'assistant', 'bot'] },
  { label: 'API Management', page: 'api-management', icon: Key, keywords: ['api', 'keys', 'rest', 'integration'] },
  { label: 'Settings', page: 'brand-settings', icon: Palette, keywords: ['brand', 'customization', 'logo', 'theme', 'style', 'settings'] },
  { label: 'System Health', page: 'system-health', icon: Activity, keywords: ['status', 'health', 'monitoring', 'services', 'system', 'uptime'] },
  { label: 'About', page: 'about', icon: Info, keywords: ['about', 'developer', 'info', 'version'] },
];

export default function AppShell() {
  const { user, logout, currentPage, sidebarOpen, setSidebarOpen, navigate, restoreImpersonation, originalUser } = useAppStore();
  const { theme, setTheme } = useTheme();
  const { settings } = useBranding();
  const isSuperAdmin = isSuperAdminRole(user?.roles);

  // ── Role-filtered navigation ───────────────────────────────────────────
  // Build the per-user nav lists using the centralized page-access map.
  const allowedPages = getAllowedPages(user?.roles);
  const filteredMainNav = filterNavByRole(mainNav, user?.roles);
  const filteredToolsNav = filterNavByRole(toolsNav, user?.roles);
  const filteredIntegrationsNav = filterNavByRole(integrationsNav, user?.roles);
  const filteredAdminNav = filterNavByRole(adminNav, user?.roles);
  // Modules menu item — only superadmin (Schema section).
  const showModules = allowedPages.has('modules');
  const showToolsSection = filteredToolsNav.length > 0;
  const showIntegrationsSection = filteredIntegrationsNav.length > 0;
  const showAdminSection = isSuperAdmin && filteredAdminNav.length > 0;
  const isImpersonating = !!originalUser;

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSelect = (page: PageView) => {
    setSearchOpen(false);
    navigate(page);
  };

  const getTitle = () => {
    const titles: Record<PageView, string> = {
      dashboard: 'Dashboard',
      modules: 'Modules',
      'module-detail': 'Module Builder',
      'data-records': 'Data Records',
      'record-detail': 'Record Detail',
      workflow: 'Approval Workflow',
      hierarchy: 'Hierarchy Manager',
      'hierarchy-detail': 'Hierarchy Tree',
      'bulk-import': 'Bulk Import / Export',
      'admin-users': 'User Management',
      'admin-roles': 'Role Management',
      'admin-companies': 'Company Management',
      'admin-lookups': 'Lookup Management',
      'audit-log': 'Audit Log',
      settings: 'Settings',
      documentation: 'Documentation Hub',
      'ai-assistant': 'AI Assistant',
      'api-management': 'API Management',
      'brand-settings': 'Settings',
      'system-health': 'System Health',
      about: 'About',
    };
    return titles[currentPage] || 'MAA BTOOL';
  };

  const breadcrumbs = getBreadcrumbPath(currentPage);

  // Resolve sidebar styling from branding settings. The `dark` variant
  // matches the original hardcoded look; `light` and `transparent` provide
  // the alternate styles surfaced in BrandSettingsPage.
  const sidebarStyleClasses: Record<SidebarStyle, string> = {
    dark: 'bg-slate-900 text-slate-100 border-slate-800',
    light: 'bg-white text-slate-900 border-slate-200',
    transparent: 'bg-transparent backdrop-blur-md border-slate-200/60',
  };
  const sidebarClass = sidebarStyleClasses[settings.sidebarStyle];

  // Logo to show in the sidebar header. If the user uploaded a custom logo
  // (data URL or absolute path), use it; otherwise fall back to the MAP Active logo.
  const logoSrc = settings.logoUrl || '/map-active-logo.png';

  // Render the company name with the last token highlighted in the brand color
  const renderCompanyName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const last = parts.pop();
      return (
        <>
          {parts.join(' ')} <span className="text-red-600 dark:text-red-500">{last}</span>
        </>
      );
    }
    return <span className="text-red-600 dark:text-red-500">{name}</span>;
  };

  return (
    <TooltipProvider>
      <div
        className="min-h-screen flex bg-background"
        style={{ fontFamily: settings.fontFamily }}
      >
        {/* Mobile overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            sidebarClass,
            sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0 lg:w-16'
          )}
          data-sidebar-style={settings.sidebarStyle}
        >
          {/* Sidebar Header */}
          <div className={cn(
            'flex items-center h-16 px-4 border-b shrink-0',
            !sidebarOpen && 'lg:justify-center lg:px-2'
          )}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shrink-0 shadow-sm ring-1 ring-red-400/20 overflow-hidden">
                <img
                  src={logoSrc}
                  alt={settings.companyName}
                  onError={(e) => {
                    const t = e.currentTarget;
                    if (t.src !== '/map-active-logo.png') {
                      t.src = '/map-active-logo.png';
                    }
                  }}
                  className="w-7 h-7 object-contain brightness-0 invert"
                />
              </div>
              {sidebarOpen && (
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-lg leading-tight truncate">
                    {renderCompanyName(settings.companyName)}
                  </span>
                  <span className="text-[10px] opacity-70 leading-tight truncate">{settings.slogan}</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:flex hidden h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Sidebar Content */}
          <ScrollArea className="flex-1 custom-scrollbar">
            {filteredMainNav.length > 0 && (
              <NavSection title="Main" items={filteredMainNav} collapsed={!sidebarOpen} />
            )}
            {showModules && (
              <>
                <Separator className="mx-3" />
                <NavSection title="Schema" items={[{ label: 'Modules', page: 'modules', icon: Database }]} collapsed={!sidebarOpen} />
              </>
            )}
            {showToolsSection && (
              <>
                <Separator className="mx-3" />
                <NavSection title="Tools" items={filteredToolsNav} collapsed={!sidebarOpen} />
              </>
            )}
            {showIntegrationsSection && (
              <>
                <Separator className="mx-3" />
                <NavSection title="Integrations" items={filteredIntegrationsNav} collapsed={!sidebarOpen} />
              </>
            )}
            {showAdminSection && (
              <>
                <Separator className="mx-3" />
                <NavSection title="Admin" items={filteredAdminNav} collapsed={!sidebarOpen} />
              </>
            )}
          </ScrollArea>

          {/* Sidebar Footer - User Info */}
          <div className="border-t p-3 shrink-0">
            {sidebarOpen ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg p-2 -m-1 hover:bg-accent/50 transition-colors duration-150">
                  <Avatar className="h-9 w-9 ring-2 ring-red-500/20">
                    <AvatarFallback className="bg-gradient-to-br from-red-50 to-slate-50 dark:from-red-900/40 dark:to-slate-800/30 text-red-700 dark:text-red-300 text-sm font-semibold">
                      {user?.username?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user?.username || 'User'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.roles?.[0] || ''}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[10px] opacity-70 truncate">{settings.footerText}</p>
                </div>
              </div>
            ) : (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="flex justify-center">
                    <Avatar className="h-8 w-8 ring-2 ring-red-500/20">
                      <AvatarFallback className="bg-gradient-to-br from-red-50 to-slate-50 dark:from-red-900/40 dark:to-slate-800/30 text-red-700 dark:text-red-300 text-xs font-semibold">
                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{user?.username || 'User'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          {/* Impersonation banner */}
          {isImpersonating && (
            <div className="flex items-center gap-3 border-b border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 text-xs dark:from-amber-950/40 dark:to-orange-950/30 dark:border-amber-700/40">
              <span className="inline-flex h-5 items-center rounded-full bg-amber-200 px-2 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                Impersonating
              </span>
              <span className="text-amber-900 dark:text-amber-100">
                You are signed in as{' '}
                <span className="font-semibold">{user?.username}</span>{' '}
                <span className="text-amber-700/70 dark:text-amber-300/70">
                  ({user?.roles?.join(', ') || 'no role'})
                </span>
                . Original admin:{' '}
                <span className="font-semibold">{originalUser?.username}</span>.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 border-amber-300 bg-white px-2 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/70"
                disabled={restoring}
                onClick={() => {
                  setRestoring(true);
                  // Defer to next tick so the button can repaint.
                  setTimeout(() => {
                    restoreImpersonation();
                    setRestoring(false);
                  }, 50);
                }}
              >
                {restoring ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="mr-1 h-3.5 w-3.5" />
                )}
                Exit Impersonation
              </Button>
            </div>
          )}

          {/* Top header */}
          <header className="h-14 border-b flex items-center px-4 lg:px-6 shrink-0 bg-card/80 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mr-2 h-9 w-9 text-muted-foreground"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Breadcrumb */}
            {settings.showBreadcrumbs && (
            <Breadcrumb className="hidden sm:flex">
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                  <span key={index} className="contents">
                    <BreadcrumbItem>
                      {index === 0 ? (
                        <BreadcrumbLink
                          className="cursor-pointer flex items-center gap-1"
                          onClick={() => crumb.page && navigate(crumb.page)}
                        >
                          <Home className="w-3.5 h-3.5" />
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : index < breadcrumbs.length - 1 ? (
                        <BreadcrumbLink
                          className="cursor-pointer"
                          onClick={() => crumb.page && navigate(crumb.page)}
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {index < breadcrumbs.length - 1 && <BreadcrumbSeparator><ChevronRightIcon className="w-3 h-3" /></BreadcrumbSeparator>}
                  </span>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            )}

            {/* Mobile title */}
            <h1 className="text-base font-semibold sm:hidden">{getTitle()}</h1>

            <div className="ml-auto flex items-center gap-1.5">
              {/* Search Button */}
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden md:flex h-8 gap-2 text-muted-foreground font-normal px-3 bg-background/50 hover:bg-accent/50 border-dashed"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span className="text-xs">Search...</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-1">
                      <span className="text-xs">⌘</span>K
                    </kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search & Navigate (⌘K)</TooltipContent>
              </Tooltip>

              {/* Mobile search button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="w-4.5 h-4.5" />
              </Button>

              {/* Notification Bell */}
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground relative">
                    <Bell className="w-4.5 h-4.5" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>

              {/* Dark Mode Toggle */}
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    <Sun className="w-4.5 h-4.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute w-4.5 h-4.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</TooltipContent>
              </Tooltip>

              {/* User Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-accent/50">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-semibold">
                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden md:block text-sm font-medium">{user?.username || 'User'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.username || 'User'}</p>
                      <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('dashboard')}>
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setChangePasswordOpen(true)}>
                      <Lock className="mr-2 h-4 w-4" />
                      Change Password
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                    {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <PageContent />
          </main>

          {/* Footer */}
          <footer className="border-t px-4 py-2.5 shrink-0 bg-card/60 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">
                {settings.footerText}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="hover:text-foreground transition-colors cursor-pointer">Documentation</span>
                <span className="hover:text-foreground transition-colors cursor-pointer">Support</span>
                <span className="font-mono text-[10px] bg-gradient-to-r from-red-50 to-slate-50 dark:from-red-900/40 dark:to-slate-800/30 px-1.5 py-0.5 rounded text-red-700 dark:text-red-300">v2.0.0</span>
              </div>
            </div>
          </footer>
        </div>

        {/* Change Password Dialog */}
        <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

        {/* Global Search Command Dialog */}
        <CommandDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          title="Search & Navigate"
          description="Quickly navigate to any page in the application"
        >
          <CommandInput placeholder="Type to search pages..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigation">
              {filterNavByRole(searchNavigationItems, user?.roles).map((item) => (
                <CommandItem
                  key={item.page}
                  value={`${item.label} ${item.keywords?.join(' ') || ''}`}
                  onSelect={() => handleSearchSelect(item.page)}
                  className="cursor-pointer"
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              <CommandItem
                value="Create new record"
                onSelect={() => handleSearchSelect('data-records')}
                className="cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Create New Record</span>
              </CommandItem>
              <CommandItem
                value="Review approvals"
                onSelect={() => handleSearchSelect('workflow')}
                className="cursor-pointer"
              >
                <GitBranch className="w-4 h-4" />
                <span>Review Approvals</span>
              </CommandItem>
              <CommandItem
                value="Import data bulk"
                onSelect={() => handleSearchSelect('bulk-import')}
                className="cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Bulk Import Data</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        {/* Onboarding Guide — shown on first login per user, skippable */}
        <OnboardingGuide />
      </div>
    </TooltipProvider>
  );
}
