'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useBranding } from '@/hooks/useBranding';

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

const DEMO_ACCOUNTS: {
  username: string;
  password: string;
  role: string;
  tone: DemoTone;
  scope: string;
}[] = [
  { username: 'superadmin', password: 'Admin@123', role: 'Super Admin', tone: 'red', scope: 'Full access' },
  { username: 'manager_mapi', password: 'Manager@123', role: 'Manager', tone: 'violet', scope: 'Operations + approvals' },
  { username: 'dataentry_mapi', password: 'DataEntry@123', role: 'Data Entry', tone: 'sky', scope: 'Create & submit data' },
  { username: 'viewer', password: 'Viewer@123', role: 'Viewer', tone: 'slate', scope: 'Read-only access' },
  { username: 'docwriter', password: 'DocWriter@123', role: 'Doc Writer', tone: 'amber', scope: 'Documentation Hub only' },
  { username: 'api_manager', password: 'ApiManager@123', role: 'API Manager', tone: 'emerald', scope: 'API Management only' },
  { username: 'ai_user', password: 'AiUser@123', role: 'AI User', tone: 'rose', scope: 'AI Assistant + Docs' },
];

const TONE_CLASSES: Record<DemoTone, string> = {
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
};

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

  // Logo fallback logic: only use the configured logo if it is a data URL or
  // absolute path; otherwise fall back to the bundled /map-active-logo.png.
  // The onError handler guarantees a fallback if the configured URL fails.
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

  const fillDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  /* ------------------------------------------------------------------------ */

  return (
    <div className="grid min-h-screen w-full bg-white lg:grid-cols-[1.1fr_0.9fr]">
      {/* ================================================================== */}
      {/* LEFT PANEL — branded showcase (lg+ only)                           */}
      {/* ================================================================== */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-10 lg:flex xl:p-14">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-red-950/80 to-slate-900" />

        {/* Floating orbs (CSS animations) */}
        <div
          aria-hidden
          className="animate-float-orb-1 absolute -left-16 -top-24 h-96 w-96 rounded-full bg-red-600/30 blur-3xl"
        />
        <div
          aria-hidden
          className="animate-float-orb-2 absolute -bottom-10 -right-10 h-[28rem] w-[28rem] rounded-full bg-red-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="animate-float-orb-3 absolute right-1/4 top-1/3 h-72 w-72 rounded-full bg-rose-400/10 blur-3xl"
        />

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
        <div className="animate-fade-in-up stagger-1 relative z-10 flex items-center gap-3">
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
        </div>

        {/* === Center: headline + features === */}
        <div className="animate-fade-in-up stagger-2 relative z-10 max-w-xl">
          <div className="animate-fade-in-up stagger-3 mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            Enterprise Edition · v2.0
          </div>

          <h1 className="animate-fade-in-up stagger-4 text-balance text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
            Enterprise Master Data Management,{' '}
            <span className="bg-gradient-to-r from-red-400 via-red-500 to-rose-400 bg-clip-text text-transparent">
              reimagined.
            </span>
          </h1>

          <p className="animate-fade-in-up stagger-5 mt-4 max-w-md text-base leading-relaxed text-white/60">
            One governed source of truth for products, suppliers, stores and
            hierarchies — built for the scale and pace of modern retail.
          </p>

          <div className="animate-fade-in-up stagger-6 mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm transition-colors hover:border-red-400/40 hover:bg-white/[0.07]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-500/30 to-red-600/10 text-red-300 ring-1 ring-inset ring-red-500/30">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs leading-snug text-white/50">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* === Bottom: footer === */}
        <div className="animate-fade-in-up stagger-7 relative z-10 flex items-center justify-between text-xs text-white/40">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" />
            <span>MAP Group — PT Mitra Adiperkasa Tbk</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-red-400/70" />
            <span>SOC 2 · ISO 27001 Ready</span>
          </div>
        </div>
      </aside>

      {/* ================================================================== */}
      {/* RIGHT PANEL — login form                                           */}
      {/* ================================================================== */}
      <main className="relative flex flex-col bg-white">
        {/* Soft decorative accents */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-red-100/50 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-slate-100/70 blur-3xl"
        />

        <div className="animate-fade-in-up stagger-8 relative z-10 flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
          <div className="w-full max-w-md">
            {/* Mobile compact branded header */}
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-2xl bg-red-500/20 blur-xl" />
                <div className="relative rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
                  <img
                    src={logoSrc}
                    alt={settings.companyName}
                    onError={() => setLogoFailed(true)}
                    className="h-12 w-auto"
                  />
                </div>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {renderCompanyName(settings.companyName)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{settings.slogan}</p>
            </div>

            {/* Desktop heading */}
            <div className="mb-7 hidden lg:block">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                <Lock className="h-3 w-3" />
                Secure Sign-In
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sign in to your {settings.companyName} workspace.
              </p>
            </div>

            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 ring-1 ring-slate-100/50 sm:p-7">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username */}
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className="text-sm font-medium text-slate-700"
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
                      className="h-12 border-slate-200 bg-slate-50/50 pl-10 text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-red-500 focus-visible:bg-white focus-visible:ring-red-500/20"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700"
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
                      className="h-12 border-slate-200 bg-slate-50/50 pl-10 pr-11 text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-red-500 focus-visible:bg-white focus-visible:ring-red-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
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
                {error && (
                  <div
                    role="alert"
                    className="animate-fade-in-down flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

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
                <Separator className="flex-1 bg-slate-200" />
                <span className="text-xs uppercase tracking-wider text-slate-400">
                  Demo Accounts
                </span>
                <Separator className="flex-1 bg-slate-200" />
              </div>

              {/* Demo accounts */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="space-y-1">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => fillDemo(acc.username, acc.password)}
                      title={`Fill ${acc.username} credentials — ${acc.scope}`}
                      className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-mono text-xs text-slate-700">
                          {acc.username}
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className="truncate font-mono text-xs text-slate-500">
                          {acc.password}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 border ${TONE_CLASSES[acc.tone]}`}
                      >
                        {acc.role}
                      </Badge>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 px-2 text-[11px] leading-relaxed text-slate-400">
                  Click any row to autofill credentials, then press Sign In. Each demo role sees a tailored set of menu items.
                </p>
              </div>
            </div>

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-slate-400">
              {settings.footerText}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
