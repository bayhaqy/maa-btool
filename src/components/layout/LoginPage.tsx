'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Code2,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  User,
  Workflow,
  Cpu,
  BookOpen,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBranding } from '@/hooks/useBranding';
import { motion, AnimatePresence } from 'framer-motion';

/* -------------------------------------------------------------------------- */
/*  Static content                                                            */
/* -------------------------------------------------------------------------- */

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Database,
    title: 'Dynamic Module Builder',
    desc: 'Sculpt master-data schemas without writing code.',
  },
  {
    icon: Workflow,
    title: 'Maker-Checker Workflow',
    desc: 'Governed approvals with a full audit trail.',
  },
  {
    icon: Code2,
    title: 'API Management',
    desc: 'Versioned, secured REST endpoints out of the box.',
  },
  {
    icon: Sparkles,
    title: 'AI Assistant',
    desc: 'Operate on master data with natural language.',
  },
];

type DemoTone = 'red' | 'violet' | 'amber' | 'slate' | 'emerald' | 'sky' | 'rose';

// Icon name → component mapping (server returns string icon names)
const ICON_MAP: Record<string, LucideIcon> = {
  ShieldCheck,
  BarChart3,
  Database,
  Eye,
  BookOpen,
  Cpu,
  Sparkles,
};

// Demo account shape from the API (NO passwords — security!)
interface DemoAccount {
  username: string;
  role: string;
  scope: string;
  icon: string;
  tone: DemoTone;
}

const TONE_CLASSES: Record<DemoTone, { bg: string; text: string; border: string; iconBg: string; hoverBg: string }> = {
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', iconBg: 'bg-red-100 text-red-600', hoverBg: 'hover:bg-red-100/60' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', iconBg: 'bg-violet-100 text-violet-600', hoverBg: 'hover:bg-violet-100/60' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', iconBg: 'bg-amber-100 text-amber-600', hoverBg: 'hover:bg-amber-100/60' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', iconBg: 'bg-slate-200 text-slate-600', hoverBg: 'hover:bg-slate-200/60' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', iconBg: 'bg-emerald-100 text-emerald-600', hoverBg: 'hover:bg-emerald-100/60' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', iconBg: 'bg-sky-100 text-sky-600', hoverBg: 'hover:bg-sky-100/60' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', iconBg: 'bg-rose-100 text-rose-600', hoverBg: 'hover:bg-rose-100/60' },
};

/* -------------------------------------------------------------------------- */
/*  Animated background particles                                              */
/* -------------------------------------------------------------------------- */

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Animated gradient orbs */}
      <motion.div
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -40, 20, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-red-600/20 blur-3xl"
      />
      <motion.div
        animate={{
          x: [0, -30, 20, 0],
          y: [0, 30, -20, 0],
          scale: [1, 0.9, 1.1, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-red-500/15 blur-3xl"
      />
      <motion.div
        animate={{
          x: [0, 20, -10, 0],
          y: [0, -20, 30, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute right-1/4 top-1/3 h-60 w-60 rounded-full bg-rose-400/10 blur-3xl"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Brand mark component                                                       */
/* -------------------------------------------------------------------------- */

function BrandMark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const isLg = size === 'lg';
  return (
    <div className={cn(
      'relative rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shadow-lg',
      isLg ? 'w-12 h-12' : 'w-9 h-9'
    )}>
      <div className="absolute inset-0 rounded-xl bg-white/10" />
      <span className={cn(
        'font-black text-white relative z-10',
        isLg ? 'text-lg' : 'text-sm'
      )}>
        M
      </span>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function LoginPage() {
  const { setAuth } = useAppStore();
  const { settings } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  // Fetch demo accounts from API (no passwords exposed in client bundle)
  useEffect(() => {
    let cancelled = false;
    const fetchDemoAccounts = async () => {
      try {
        const res = await fetch('/api/auth/demo-accounts');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setDemoAccounts(data.accounts || []);
        }
      } catch {
        // Silently fail — demo accounts are non-critical
      }
    };
    fetchDemoAccounts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render the company name with the last token highlighted in the brand color.
  const renderCompanyName = (name: string, highlightClass = 'text-red-600') => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const last = parts.pop();
      return (
        <>
          {parts.join(' ')} <span className={highlightClass}>{last}</span>
        </>
      );
    }
    return <span className={highlightClass}>{name}</span>;
  };

  // Logo fallback logic
  const configuredLogo = settings.logoUrl;
  const isUsableLogo = (url: string) => url.startsWith('data:') || url.startsWith('/');
  const logoSrc =
    !logoFailed && configuredLogo && isUsableLogo(configuredLogo)
      ? configuredLogo
      : '/map-active-logo.png';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      setAuth(data.token, data.user);
      toast.success('Welcome back, ' + data.user.username);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fill only the username — user must type the password manually (security)
  const fillDemoUsername = useCallback((u: string) => {
    setUsername(u);
    setPassword('');
    setError('');
    // Focus the password field so the user can type immediately
    setTimeout(() => {
      document.getElementById('password')?.focus();
    }, 50);
  }, []);

  /* ------------------------------------------------------------------------ */

  return (
    <div className="grid min-h-screen w-full bg-white lg:grid-cols-[1.1fr_0.9fr]">
      {/* ================================================================== */}
      {/* LEFT PANEL — branded showcase (lg+ only)                           */}
      {/* ================================================================== */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-10 lg:flex xl:p-14">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-red-950/80 to-slate-900" />

        {/* Animated floating particles */}
        <FloatingParticles />

        {/* Subtle grid overlay (masked) */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage:
              'radial-gradient(ellipse at 30% 30%, black 40%, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at 30% 30%, black 40%, transparent 75%)',
          }}
        />

        {/* Top accent bar */}
        <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-red-600 via-red-500 to-transparent" />

        {/* === Top: brand === */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative z-10 flex items-center gap-3"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-red-500/40 blur-xl" />
            <div className="relative rounded-xl bg-white/5 p-2 ring-1 ring-white/15 backdrop-blur-sm">
              <img
                src={logoSrc}
                alt={settings.companyName}
                onError={() => setLogoFailed(true)}
                className="relative h-11 w-auto"
              />
            </div>
          </div>
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight text-white">
              {renderCompanyName(settings.companyName, 'text-red-400')}
            </p>
            <p className="text-xs text-white/50">{settings.slogan}</p>
          </div>
        </motion.div>

        {/* === Center: headline + features === */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative z-10 max-w-xl"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur-sm"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            Enterprise Edition · v2.0
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="text-balance text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl"
          >
            Enterprise Master Data Management,{' '}
            <span className="bg-gradient-to-r from-red-400 via-red-500 to-rose-400 bg-clip-text text-transparent">
              reimagined.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="mt-4 max-w-md text-base leading-relaxed text-white/60"
          >
            One governed source of truth for products, suppliers, stores and
            hierarchies — built for the scale and pace of modern retail.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm transition-all duration-300 hover:border-red-400/40 hover:bg-white/[0.07] hover:scale-[1.02]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-500/30 to-red-600/10 text-red-300 ring-1 ring-inset ring-red-500/30 transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs leading-snug text-white/50">{desc}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* === Bottom: footer === */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
          className="relative z-10 flex items-center justify-between text-xs text-white/40"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" />
            <span>MAP Group — PT Mitra Adiperkasa Tbk</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-red-400/70" />
            <span>SOC 2 · ISO 27001 Ready</span>
          </div>
        </motion.div>
      </aside>

      {/* ================================================================== */}
      {/* RIGHT PANEL — login form                                           */}
      {/* ================================================================== */}
      <main className="relative flex flex-col bg-white dark:bg-slate-950">
        {/* Animated decorative accents */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-red-100/40 dark:bg-red-900/10 blur-3xl"
          />
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-slate-100/50 dark:bg-slate-800/20 blur-3xl"
          />
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-8 lg:px-12 xl:px-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            {/* Mobile compact branded header */}
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="relative mb-4"
              >
                <div className="absolute inset-0 rounded-2xl bg-red-500/20 blur-xl" />
                <div className="relative rounded-2xl bg-white dark:bg-slate-900 p-2 shadow-lg ring-1 ring-slate-200 dark:ring-slate-700">
                  <img
                    src={logoSrc}
                    alt={settings.companyName}
                    onError={() => setLogoFailed(true)}
                    className="h-12 w-auto"
                  />
                </div>
              </motion.div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {renderCompanyName(settings.companyName)}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{settings.slogan}</p>
            </div>

            {/* Desktop heading */}
            <div className="mb-7 hidden lg:block">
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-900/30 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-200 dark:ring-red-800">
                  <Lock className="h-3 w-3" />
                  Secure Sign-In
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Welcome back
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Sign in to your {settings.companyName} workspace.
                </p>
              </motion.div>
            </div>

            {/* Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-200/50 dark:shadow-none ring-1 ring-slate-100/50 dark:ring-slate-800/50 sm:p-7"
            >
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username */}
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Username
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="e.g. superadmin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="username"
                      className="h-12 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 pl-10 text-slate-900 dark:text-white transition-colors placeholder:text-slate-400 focus-visible:border-red-500 focus-visible:bg-white dark:focus-visible:bg-slate-800 focus-visible:ring-red-500/20"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="current-password"
                      className="h-12 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 pl-10 pr-11 text-slate-900 dark:text-white transition-colors placeholder:text-slate-400 focus-visible:border-red-500 focus-visible:bg-white dark:focus-visible:bg-slate-800 focus-visible:ring-red-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      role="alert"
                      className="flex items-start gap-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-400"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="group h-12 w-full bg-red-600 font-semibold text-white shadow-lg shadow-red-600/25 transition-all duration-200 hover:bg-red-700 hover:shadow-red-600/30 focus-visible:ring-red-500/40"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <Separator className="flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Demo Accounts
                </span>
                <Separator className="flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* Demo accounts with role-based icon + colors */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-3">
                <div className="space-y-1">
                  {demoAccounts.map((acc, i) => {
                    const toneClasses = TONE_CLASSES[acc.tone];
                    const RoleIcon = ICON_MAP[acc.icon] || Database;
                    return (
                      <motion.button
                        key={acc.username}
                        type="button"
                        onClick={() => fillDemoUsername(acc.username)}
                        title={`Fill username "${acc.username}" — ${acc.scope}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.5 + i * 0.05 }}
                        className={cn(
                          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-200',
                          toneClasses.hoverBg
                        )}
                      >
                        {/* Role icon with tone color */}
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110',
                          toneClasses.iconBg
                        )}>
                          <RoleIcon className="w-3.5 h-3.5" />
                        </div>
                        {/* Username only — no password exposed */}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                            {acc.username}
                          </span>
                        </div>
                        {/* Role badge */}
                        <Badge
                          variant="outline"
                          className={cn('shrink-0 border text-[10px] font-medium', toneClasses.bg, toneClasses.text, toneClasses.border)}
                        >
                          {acc.role}
                        </Badge>
                      </motion.button>
                    );
                  })}
                </div>
                <p className="mt-2.5 px-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                  Click any row to autofill the username, then type the password and press Sign In.
                </p>
              </div>
            </motion.div>

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
              {settings.footerText}
            </p>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
