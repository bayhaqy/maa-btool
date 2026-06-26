'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, type PageView } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Rocket, LayoutDashboard, Database, GitBranch, Package,
  Keyboard, Shield, BookOpen, Bot, ChevronRight,
  ChevronLeft, X, CheckCircle2, Sparkles, Zap, HelpCircle, Lightbulb,
  FileText, Boxes, Layers, Search, Upload, Network,
  Users, ScrollText, HardDrive, Settings as SettingsIcon, Eye,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types & role config                                                */
/* ------------------------------------------------------------------ */

type RoleKey =
  | 'Super Admin'
  | 'Manager'
  | 'Data Entry'
  | 'Viewer'
  | 'Doc Writer'
  | 'API Manager'
  | 'SFTP Manager'
  | 'AI User';

interface OnboardingStep {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  /** Accent color token used for the header pill (Tailwind gradient classes). */
  accent: 'red' | 'emerald' | 'amber' | 'sky' | 'rose';
  content: React.ReactNode;
  cta?: { label: string; page: PageView };
  /** Roles that should see this step. Empty = everyone. */
  roles?: RoleKey[];
}

const ROLE_LABELS: Record<RoleKey, string> = {
  'Super Admin': 'Full system access',
  'Manager': 'Operational oversight',
  'Data Entry': 'Data creation & submission',
  'Viewer': 'Read-only access',
  'Doc Writer': 'Documentation management',
  'API Manager': 'API integration management',
  'SFTP Manager': 'SFTP integration management',
  'AI User': 'AI Assistant access',
};

/** Maps each step id to the set of roles that should see it.
 *  Steps without a `roles` entry are shown to everyone. */
const STEP_ROLES: Record<string, RoleKey[]> = {
  welcome: [],
  dashboard: ['Super Admin', 'Manager', 'Data Entry', 'Viewer', 'AI User'],
  modules: ['Super Admin', 'Manager'],
  records: ['Super Admin', 'Manager', 'Data Entry', 'Viewer'],
  hierarchy: ['Super Admin', 'Manager'],
  workflow: ['Super Admin', 'Manager'],
  'bulk-import': ['Super Admin', 'Data Entry'],
  docs: ['Super Admin', 'Manager', 'Data Entry', 'Viewer', 'Doc Writer'],
  ai: ['Super Admin', 'AI User'],
  api: ['Super Admin', 'API Manager'],
  admin: ['Super Admin'],
  audit: ['Super Admin'],
  sftp: ['Super Admin', 'SFTP Manager'],
  tips: [],
};

const ACCENT_CLASSES: Record<OnboardingStep['accent'], { gradient: string; pill: string; bar: string; text: string }> = {
  red:     { gradient: 'from-red-600 to-rose-700',     pill: 'bg-white/15',         bar: 'bg-red-500',     text: 'text-red-600' },
  emerald: { gradient: 'from-emerald-500 to-emerald-700', pill: 'bg-white/15',      bar: 'bg-emerald-500', text: 'text-emerald-600' },
  amber:   { gradient: 'from-amber-500 to-orange-600',  pill: 'bg-white/15',        bar: 'bg-amber-500',   text: 'text-amber-600' },
  sky:     { gradient: 'from-sky-500 to-cyan-600',      pill: 'bg-white/15',        bar: 'bg-sky-500',     text: 'text-sky-600' },
  rose:    { gradient: 'from-rose-500 to-red-700',      pill: 'bg-white/15',        bar: 'bg-rose-500',    text: 'text-rose-600' },
};

/* ------------------------------------------------------------------ */
/*  Step definitions (single source of truth)                          */
/* ------------------------------------------------------------------ */

const STEP_DEFS: OnboardingStep[] = [
  /* ---- Welcome ---- */
  {
    id: 'welcome',
    icon: Rocket,
    accent: 'red',
    title: 'Selamat Datang!',
    subtitle: 'Tur singkat untuk mengenal MAA BTOOL',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Selamat datang di <span className="font-semibold text-foreground">MAA BTOOL</span> — platform
          Master Data Management enterprise MAP Group. Tour singkat ini akan memandu Anda mengenal
          fitur-fitur utama yang relevan dengan peran Anda.
        </p>
        <WelcomeRoleBadges />
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Yang dapat Anda lakukan
          </p>
          <WelcomeRoleSummary />
        </div>
      </div>
    ),
  },

  /* ---- Dashboard ---- */
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    accent: 'sky',
    title: 'Dashboard',
    subtitle: 'Pusat kendali Anda',
    cta: { label: 'Buka Dashboard', page: 'dashboard' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Dashboard memberikan ringkasan ekosistem master data Anda — jumlah modul,
          statistik record, persetujuan tertunda, dan aktivitas terbaru.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-foreground">Statistik</p>
            <p className="text-xs mt-1 text-muted-foreground">Metrik kunci dalam sekali pandang</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-foreground">Item Tertunda</p>
            <p className="text-xs mt-1 text-muted-foreground">Perlu perhatian Anda</p>
          </div>
        </div>
      </div>
    ),
  },

  /* ---- Modules ---- */
  {
    id: 'modules',
    icon: Package,
    accent: 'emerald',
    title: 'Module Builder',
    subtitle: 'Sculpt skema data tanpa kode',
    cta: { label: 'Jelajahi Modules', page: 'modules' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Modules</span> adalah jantung MAA BTOOL.
          Setiap modul (Article, Store, Supplier, dll.) mendefinisikan skema master data dengan
          field kustom, tipe data, validasi, dan aturan approval.
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Boxes className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Modul siap pakai</span> untuk operasi retail</p>
          </div>
          <div className="flex items-start gap-2">
            <Layers className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Field kustom</span> dengan tipe TEXT, NUMBER, DATE, SELECT, EMAIL</p>
          </div>
          <div className="flex items-start gap-2">
            <GitBranch className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Workflow approval</span> dengan governance maker-checker</p>
          </div>
        </div>
      </div>
    ),
  },

  /* ---- Records ---- */
  {
    id: 'records',
    icon: Database,
    accent: 'amber',
    title: 'Data Records',
    subtitle: 'Kelola master data Anda',
    cta: { label: 'Lihat Records', page: 'data-records' },
    content: <RecordsStepContent />,
  },

  /* ---- Hierarchy ---- */
  {
    id: 'hierarchy',
    icon: Network,
    accent: 'sky',
    title: 'Hierarchy Manager',
    subtitle: 'Struktur organisasi & data',
    cta: { label: 'Buka Hierarchy', page: 'hierarchy' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Hierarchy Manager</span> memungkinkan
          Anda membangun dan memvisualisasikan struktur hierarki data — misalnya
          Divisi → Departemen → Brand → Toko.
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Network className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Tree view</span> dengan drag-and-drop</p>
          </div>
          <div className="flex items-start gap-2">
            <Eye className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Visualisasi</span> relasi parent-child</p>
          </div>
        </div>
      </div>
    ),
  },

  /* ---- Workflow ---- */
  {
    id: 'workflow',
    icon: GitBranch,
    accent: 'rose',
    title: 'Approval Workflow',
    subtitle: 'Review perubahan dengan visibilitas penuh',
    cta: { label: 'Buka Workflow', page: 'workflow' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Halaman <span className="font-semibold text-foreground">Workflow</span> tempat manager
          me-review dan approve/reject permintaan tertunda. Setiap tiket menampilkan:
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">"View Details"</span> membuka diff lengkap yang menampilkan apa yang berubah (per field, dengan nilai lama → baru)</p>
          </div>
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Badge tipe perubahan</span> — Added (hijau), Modified (kuning), Removed (merah)</p>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Audit trail</span> — setiap aksi tercatat untuk compliance</p>
          </div>
        </div>
      </div>
    ),
  },

  /* ---- Bulk Import ---- */
  {
    id: 'bulk-import',
    icon: Upload,
    accent: 'amber',
    title: 'Bulk Import',
    subtitle: 'Impor ratusan record sekaligus',
    cta: { label: 'Buka Bulk Import', page: 'bulk-import' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Bulk Import</span> memungkinkan Anda
          mengunggah banyak record sekaligus menggunakan file CSV.
        </p>
        <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-3">
          <p className="text-xs flex items-start gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span><span className="font-medium">Tip:</span> Gunakan delimiter <code className="px-1 rounded bg-muted font-mono text-[10px]">;</code> (semicolon) pada file CSV Anda.</span>
          </p>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-2"><Upload className="w-3.5 h-3.5" /> Pilih modul target terlebih dahulu</p>
          <p className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Unggah CSV dengan header yang sesuai</p>
          <p className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> Review hasil preview sebelum submit</p>
        </div>
      </div>
    ),
  },

  /* ---- Documentation ---- */
  {
    id: 'docs',
    icon: BookOpen,
    accent: 'emerald',
    title: 'Documentation Hub',
    subtitle: 'Panduan, referensi, dan how-to',
    cta: { label: 'Baca Dokumentasi', page: 'documentation' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Documentation Hub</span> berisi
          panduan pengguna, referensi API, dan artikel best-practice. Artikel ditulis dalam
          Markdown dengan live preview.
        </p>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Kategori meliputi:</p>
          <p className="text-xs mt-1 font-medium">Getting Started, Modules, Workflow, API Reference, Best Practices</p>
        </div>
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs"><span className="font-medium">Doc Writer</span> dapat membuat dan mengedit artikel langsung dari UI.</p>
        </div>
      </div>
    ),
  },

  /* ---- AI Assistant ---- */
  {
    id: 'ai',
    icon: Bot,
    accent: 'sky',
    title: 'AI Assistant',
    subtitle: 'Operasi master data dengan bahasa natural',
    cta: { label: 'Coba AI Assistant', page: 'ai-assistant' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">AI Assistant</span> memungkinkan
          Anda mencari dan memahami master data menggunakan bahasa natural. Contoh pertanyaan:
        </p>
        <div className="space-y-1.5">
          {[
            '"Berapa record ACTIVE di Article Master?"',
            '"Tampilkan semua supplier dengan payment terms NET_30"',
            '"Apa bedanya Draft dan Revision Pending?"',
          ].map((q, i) => (
            <div key={i} className="rounded-lg border bg-muted/30 px-3 py-2 text-xs font-mono">
              {q}
            </div>
          ))}
        </div>
      </div>
    ),
  },

  /* ---- API Management ---- */
  {
    id: 'api',
    icon: Zap,
    accent: 'amber',
    title: 'API Management',
    subtitle: 'Endpoint REST aman & API keys',
    cta: { label: 'Buka API Mgmt', page: 'api-management' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Generate API keys, uji endpoint secara live, dan pelajari best-practice integrasi.
          Semua traffic API terotentikasi dan rate-limited untuk keamanan.
        </p>
        <div className="rounded-lg border bg-red-50/50 dark:bg-red-950/20 p-3">
          <p className="text-xs flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
            <span><span className="font-medium">Keamanan:</span> Jangan pernah membagikan raw API key. Simpan di environment variable.</span>
          </p>
        </div>
      </div>
    ),
  },

  /* ---- Admin (Users / Roles / Companies / Lookups / Settings) ---- */
  {
    id: 'admin',
    icon: Users,
    accent: 'red',
    title: 'Administrasi Sistem',
    subtitle: 'Users, Roles, Companies & Lookups',
    cta: { label: 'Buka Admin Users', page: 'admin-users' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Sebagai <span className="font-semibold text-foreground">Super Admin</span>, Anda dapat
          mengelola seluruh aspek administrasi sistem dari sidebar:
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs font-medium">Users</p>
          </div>
          <div className="rounded-lg border p-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs font-medium">Roles</p>
          </div>
          <div className="rounded-lg border p-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs font-medium">Companies</p>
          </div>
          <div className="rounded-lg border p-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs font-medium">Lookups</p>
          </div>
          <div className="rounded-lg border p-3 flex items-center gap-2 col-span-2">
            <SettingsIcon className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs font-medium">Settings (Brand, Appearance, dll.)</p>
          </div>
        </div>
      </div>
    ),
  },

  /* ---- Audit Log ---- */
  {
    id: 'audit',
    icon: ScrollText,
    accent: 'amber',
    title: 'Audit Log',
    subtitle: 'Jejak lengkap setiap perubahan',
    cta: { label: 'Buka Audit Log', page: 'audit-log' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Audit Log</span> mencatat setiap aksi
          di sistem — siapa, kapan, dan apa yang berubah — untuk kepatuhan (compliance) dan
          troubleshooting.
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <ScrollText className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Filter</span> berdasarkan user, modul, aksi, dan rentang tanggal</p>
          </div>
          <div className="flex items-start gap-2">
            <Search className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Search</span> untuk menemukan aksi spesifik dengan cepat</p>
          </div>
        </div>
      </div>
    ),
  },

  /* ---- SFTP ---- */
  {
    id: 'sftp',
    icon: HardDrive,
    accent: 'sky',
    title: 'SFTP Management',
    subtitle: 'Integrasi & sync otomatis via SFTP',
    cta: { label: 'Buka SFTP', page: 'audit-log' },
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">SFTP Management</span> memungkinkan
          konfigurasi koneksi SFTP untuk sinkronisasi data otomatis dengan sistem eksternal
          (ERP, WMS, dll.).
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <HardDrive className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Connection config</span> — host, port, auth (password/SSH key), remote path</p>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Scheduled sync</span> dengan cron expression</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs"><span className="font-medium">Test connection</span> sebelum menyimpan</p>
          </div>
        </div>
      </div>
    ),
  },

  /* ---- Tips (always last) ---- */
  {
    id: 'tips',
    icon: Lightbulb,
    accent: 'amber',
    title: 'Tips & Shortcut',
    subtitle: 'Lengkap dengan power features',
    content: <TipsStepContent />,
  },
];

/* ------------------------------------------------------------------ */
/*  Step content sub-components (need access to store)                 */
/* ------------------------------------------------------------------ */

function WelcomeRoleBadges() {
  const { user } = useAppStore();
  if (!user?.roles?.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Peran Anda:</span>
      {user.roles.map((role) => (
        <Badge key={role} variant="outline" className="text-xs gap-1">
          <Shield className="w-3 h-3" />
          {role}
        </Badge>
      ))}
    </div>
  );
}

function WelcomeRoleSummary() {
  const { user } = useAppStore();
  const labels = user?.roles
    ?.map((r) => ROLE_LABELS[r as RoleKey])
    .filter(Boolean)
    .join(', ');
  return <p className="text-sm font-medium">{labels || 'Navigasikan platform'}</p>;
}

function RecordsStepContent() {
  const { user } = useAppStore();
  const isViewer = user?.roles?.includes('Viewer') ?? false;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {isViewer ? (
          <>
            Sebagai <span className="font-semibold text-foreground">Viewer</span>, Anda memiliki
            akses <span className="font-semibold text-foreground">read-only</span> — dapat
            mencari dan melihat record tanpa mengubahnya.
          </>
        ) : (
          <>
            Browse, filter, dan kelola seluruh record lintas modul. Lifecycle setiap record
            mengikuti workflow yang governed:
          </>
        )}
      </p>
      {!isViewer && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <Badge variant="outline" className="bg-gray-50 text-gray-700">Draft</Badge>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <Badge variant="outline" className="bg-amber-50 text-amber-700">In Review</Badge>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Active</Badge>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <Badge variant="outline" className="bg-sky-50 text-sky-700">Revision</Badge>
        </div>
      )}
      <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-3">
        <p className="text-xs flex items-start gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span><span className="font-medium">Tip:</span> Mengedit record <span className="font-mono text-[10px]">ACTIVE</span> otomatis membuat amendment request — record asli tetap utuh sampai disetujui.</span>
        </p>
      </div>
    </div>
  );
}

function TipsStepContent() {
  const { user } = useAppStore();
  const isSuperAdmin = user?.roles?.includes('Super Admin') ?? false;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Search className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs"><span className="font-medium">Quick Search:</span> Tekan <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">Cmd+K</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">Ctrl+K</kbd> untuk mencari dan melompat ke halaman mana pun.</p>
        </div>
        <div className="flex items-start gap-2">
          <Keyboard className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs"><span className="font-medium">Theme Toggle:</span> Beralih light/dark mode dari header — preferensi Anda otomatis tersimpan.</p>
        </div>
        <div className="flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs"><span className="font-medium">Butuh bantuan?</span> Cek Documentation Hub atau halaman About untuk kontak support.</p>
        </div>
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs"><span className="font-medium">Replay tour:</span> Anda dapat memutar ulang panduan ini kapan saja dari halaman Settings.</p>
        </div>
      </div>
      {isSuperAdmin && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span><span className="font-medium">Super Admin:</span> Anda dapat mengelola users, roles, companies, dan system settings. Gunakan section Admin di sidebar.</span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function OnboardingGuide() {
  const { user, navigate, completeOnboarding, onboardingTrigger } = useAppStore();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  /* Build the role-filtered step list */
  const steps = useMemo<OnboardingStep[]>(() => {
    if (!user?.roles?.length) {
      // Unknown roles: show welcome + dashboard + tips only
      return STEP_DEFS.filter((s) => ['welcome', 'dashboard', 'tips'].includes(s.id));
    }
    return STEP_DEFS.filter((s) => {
      const allowed = STEP_ROLES[s.id];
      if (!allowed || allowed.length === 0) return true; // everyone
      return allowed.some((r) => user.roles.includes(r));
    });
  }, [user]);

  /* Auto-show on first login OR when replayOnboarding is triggered */
  useEffect(() => {
    if (!user) return;
    const completed = useAppStore.getState().onboardingCompleted[user.username];
    if (!completed) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [user, onboardingTrigger]);

  const handleFinish = useCallback(() => {
    if (user) completeOnboarding(user.username);
    setOpen(false);
    setStep(0);
  }, [user, completeOnboarding]);

  const handleSkip = useCallback(() => {
    if (user) completeOnboarding(user.username);
    setOpen(false);
    setStep(0);
  }, [user, completeOnboarding]);

  const handleNext = useCallback(() => {
    setStep((prev) => {
      if (prev < steps.length - 1) return prev + 1;
      handleFinish();
      return prev;
    });
  }, [steps.length, handleFinish]);

  const handlePrev = useCallback(() => {
    setStep((prev) => Math.max(0, prev - 1));
  }, []);

  const handleCta = useCallback(() => {
    const cta = steps[step]?.cta;
    if (cta) navigate(cta.page);
    handleNext();
  }, [steps, step, navigate, handleNext]);

  /* Keyboard nav (after callbacks so deps are defined) */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'Escape') handleSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step, steps, handleNext, handlePrev, handleSkip]);

  if (!open || !user) return null;

  const currentStep = steps[step];
  if (!currentStep) return null;

  const Icon = currentStep.icon;
  const accent = ACCENT_CLASSES[currentStep.accent];
  const progress = ((step + 1) / steps.length) * 100;
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg w-[calc(100%-2rem)] sm:w-full p-0 gap-0 overflow-hidden rounded-xl
                   shadow-2xl border-border/60 max-h-[92vh] flex flex-col"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Panduan Onboarding</DialogTitle>

        {/* Header with role-themed gradient + close */}
        <div className={cn('relative bg-gradient-to-br p-4 sm:p-5 pb-3 sm:pb-4', accent.gradient)}>
          <button
            onClick={handleSkip}
            className="absolute top-3 right-3 text-white/80 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Lewati panduan"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className={cn(
                'w-11 h-11 sm:w-12 sm:h-12 rounded-xl backdrop-blur flex items-center justify-center shrink-0 shadow-inner',
                accent.pill
              )}
            >
              <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </motion.div>
            <div className="min-w-0 flex-1 pr-6">
              <p className="text-[10px] uppercase tracking-wider text-white/70 font-semibold">
                Langkah {step + 1} dari {steps.length}
              </p>
              <h3 className="text-white font-semibold text-base sm:text-lg truncate leading-tight">
                {currentStep.title}
              </h3>
              <p className="text-white/80 text-xs truncate">{currentStep.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Progress bar (shadcn/ui) */}
        <div className="px-4 sm:px-5 pt-3 pb-1 bg-background">
          <Progress
            value={progress}
            className="h-1.5 bg-muted"
          />
        </div>

        {/* Content with animated transitions */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 sm:p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                {currentStep.content}
              </motion.div>
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Step dots */}
        <div className="px-4 sm:px-5 py-2 flex items-center justify-center gap-1.5 border-t bg-muted/30 flex-wrap">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === step ? 'w-6 bg-primary' :
                i < step ? 'w-1.5 bg-primary/50' :
                'w-1.5 bg-muted-foreground/30'
              )}
              aria-label={`Ke langkah ${i + 1}: ${s.title}`}
              aria-current={i === step ? 'step' : undefined}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-t bg-background">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground h-8"
          >
            Lewati tour
          </Button>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrev} className="h-8 text-xs">
                <ChevronLeft className="w-4 h-4 mr-0.5" />
                <span className="hidden sm:inline">Kembali</span>
              </Button>
            )}
            {currentStep.cta && !isLast && (
              <Button variant="outline" size="sm" onClick={handleCta} className="h-8 text-xs">
                {currentStep.cta.label}
                <ChevronRight className="w-4 h-4 ml-0.5" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs"
            >
              {isLast ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Selesai
                </>
              ) : (
                <>
                  Lanjut
                  <ChevronRight className="w-4 h-4 ml-0.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
