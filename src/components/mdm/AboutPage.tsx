'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Info, Globe, Phone, Heart, Code2, Shield, Database, Users,
  GitBranch, BookOpen, Key, Sparkles, ExternalLink, MessageCircle,
  Copyright, Mail, MapPin, Rocket, Activity, Zap, Server, Cpu,
  Cloud, ShieldCheck, ArrowUpRight,
} from 'lucide-react';
import DeploymentChecklist from './DeploymentChecklist';

interface DeploymentInfo {
  environment: string;
  region: string | null;
  deploymentUrl: string | null;
  publicUrl: string;
  projectName: string;
  analyticsEnabled: boolean;
  speedInsightsEnabled: boolean;
  framework: string;
  frameworkVersion: string;
  runtime: string;
  regions: string[];
  regionsLabel: string[];
  buildCommand: string;
}

export default function AboutPage() {
  const [deployInfo, setDeployInfo] = useState<DeploymentInfo | null>(null);
  const [deployLoading, setDeployLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/deployment-info', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch deployment info');
        const data = (await res.json()) as DeploymentInfo;
        if (!cancelled) setDeployInfo(data);
      } catch {
        if (!cancelled) {
          // Fallback to known production defaults so the section always renders
          setDeployInfo({
            environment: 'production',
            region: 'sin1',
            deploymentUrl: 'maa-btool.bayhaqy.my.id',
            publicUrl: 'https://maa-btool.bayhaqy.my.id',
            projectName: 'maa-btool',
            analyticsEnabled: true,
            speedInsightsEnabled: true,
            framework: 'nextjs',
            frameworkVersion: '16',
            runtime: 'nodejs20',
            regions: ['sin1', 'hkg1', 'iad1'],
            regionsLabel: ['Singapore', 'Hong Kong', 'Washington D.C.'],
            buildCommand: 'next build',
          });
        }
      } finally {
        if (!cancelled) setDeployLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const features = [
    {
      icon: Database,
      title: 'Dynamic Module Builder',
      description: 'EAV-JSON hybrid schema engine for creating custom data modules with any field structure',
      color: 'bg-red-100 dark:bg-red-900/30 text-red-600',
    },
    {
      icon: GitBranch,
      title: 'Maker-Checker Workflow',
      description: 'Amendment approval process with version history, diff viewer, and audit trail',
      color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-600',
    },
    {
      icon: Shield,
      title: 'RBAC + ABAC Security',
      description: 'Role-based and attribute-based access control with granular permissions',
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    },
    {
      icon: Users,
      title: 'Row-Level Security',
      description: 'Data access filtered by user-assigned attributes (city, brand, region)',
      color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
    },
    {
      icon: BookOpen,
      title: 'Documentation Hub',
      description: 'Markdown-based knowledge base with multi-file upload and public access',
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    },
    {
      icon: Key,
      title: 'API Management',
      description: 'RESTful API with key-based authentication, rate limiting, and access logs',
      color: 'bg-green-100 dark:bg-green-900/30 text-green-600',
    },
    {
      icon: Sparkles,
      title: 'AI Assistant',
      description: 'AI-powered data assistant for querying and managing master data',
      color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600',
    },
  ];

  const techStack = [
    { name: 'Next.js 16', category: 'Framework' },
    { name: 'TypeScript', category: 'Language' },
    { name: 'Prisma ORM', category: 'Database' },
    { name: 'SQLite', category: 'Database' },
    { name: 'Tailwind CSS 4', category: 'Styling' },
    { name: 'shadcn/ui', category: 'Components' },
    { name: 'Zustand', category: 'State' },
    { name: 'React Query', category: 'Data' },
    { name: 'Framer Motion', category: 'Animation' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-3 py-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 shadow-lg ring-4 ring-red-100 dark:ring-red-900/40">
          <span className="text-white font-bold text-2xl">MB</span>
        </div>
        <h1 className="text-3xl font-bold">
          MAA <span className="text-red-600 dark:text-red-500">BTOOL</span>
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Enterprise Master Data Management platform for <strong>MAP Group</strong> — PT Mitra Adiperkasa Tbk
        </p>
        <div className="flex items-center justify-center gap-2">
          <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">v2.0.0</Badge>
          <Badge variant="outline" className="text-xs">Enterprise MDM</Badge>
          <Badge variant="outline" className="text-xs">Production</Badge>
        </div>
      </div>

      {/* About Description */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Info className="w-5 h-5 text-red-600" />
            About This Platform
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            MAA BTOOL is an enterprise-grade Master Data Management (MDM) platform designed for 
            <strong> PT Mitra Adiperkasa Tbk (MAP Group)</strong>, Indonesia&apos;s leading retail company. 
            It provides comprehensive data governance, maker-checker workflows, dynamic schema management, 
            and robust security features to ensure data quality and compliance across the organization.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-3">
            The platform supports multiple subsidiary companies including MAPI, MAPA, MBA, MAPD, MAPP, and MAPL, 
            with granular role-based access control and row-level security to ensure each user only accesses 
            the data relevant to their role and assignment.
          </p>
        </CardContent>
      </Card>

      {/* Key Features */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-red-600" />
          Key Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <Card key={feature.title} className="shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', feature.color)}>
                  <feature.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm">{feature.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-red-600" />
            Technology Stack
          </h2>
          <div className="flex flex-wrap gap-2">
            {techStack.map((tech) => (
              <Badge key={tech.name} variant="outline" className="text-xs py-1 px-3">
                <span className="text-muted-foreground mr-1.5">{tech.category}:</span>
                <span className="font-medium">{tech.name}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Deployment Information */}
      <Card className="shadow-sm border-emerald-200 dark:border-emerald-900/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <Rocket className="w-5 h-5 text-emerald-600" />
                Deployment Information
              </CardTitle>
              <CardDescription>
                Production deployment powered by Vercel — preview deployments are auto-generated per git push
              </CardDescription>
            </div>
            {deployLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                {deployInfo?.environment === 'production' ? 'Live' : deployInfo?.environment ?? 'Live'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2 space-y-5">
          {/* Production URL hero banner */}
          <a
            href="https://maa-btool.bayhaqy.my.id"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-4 hover:shadow-md hover:border-emerald-300 transition-all group"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
                    Production URL
                  </p>
                  <p className="text-sm font-mono font-semibold truncate">
                    https://maa-btool.bayhaqy.my.id
                  </p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-emerald-600 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </a>

          {/* Detail grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <DeployTile
              icon={Rocket}
              label="Preview Deployments"
              value="Enabled"
              sub="Auto per git push / CLI"
              status="active"
              loading={deployLoading}
            />
            <DeployTile
              icon={Code2}
              label="Framework"
              value={`Next.js ${deployInfo?.frameworkVersion ?? '16'}`}
              sub="Turbopack"
              status="active"
              loading={deployLoading}
            />
            <DeployTile
              icon={Server}
              label="Regions"
              value="3 regions"
              sub={deployInfo?.regionsLabel?.join(' · ') ?? 'Singapore · Hong Kong · Washington D.C.'}
              status="active"
              loading={deployLoading}
            />
            <DeployTile
              icon={Cpu}
              label="Runtime"
              value="Node.js 20.x"
              sub="Serverless + Edge"
              status="active"
              loading={deployLoading}
            />
            <DeployTile
              icon={Activity}
              label="Vercel Analytics"
              value={deployInfo?.analyticsEnabled ? 'Enabled' : 'Disabled'}
              sub="Real User Monitoring"
              status={deployInfo?.analyticsEnabled ? 'active' : 'warning'}
              loading={deployLoading}
            />
            <DeployTile
              icon={Zap}
              label="Speed Insights"
              value={deployInfo?.speedInsightsEnabled ? 'Enabled' : 'Disabled'}
              sub="Core Web Vitals"
              status={deployInfo?.speedInsightsEnabled ? 'active' : 'warning'}
              loading={deployLoading}
            />
            <DeployTile
              icon={Cloud}
              label="Build Command"
              value={deployInfo?.buildCommand ?? 'next build'}
              sub="Bun install"
              status="active"
              loading={deployLoading}
              mono
            />
            <DeployTile
              icon={ShieldCheck}
              label="Security Headers"
              value="5 headers"
              sub="HSTS · X-Frame · CSP-ready"
              status="active"
              loading={deployLoading}
            />
          </div>

          {/* Region detail row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground mr-1">Edge regions:</span>
            {(deployInfo?.regionsLabel ?? ['Singapore', 'Hong Kong', 'Washington D.C.']).map((region) => (
              <Badge
                key={region}
                variant="outline"
                className="text-xs py-1 px-2.5 border-emerald-200 text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400"
              >
                <Globe className="w-3 h-3 mr-1" />
                {region}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Deployment Checklist */}
      <DeploymentChecklist />

      {/* Developer Info */}
      <Card className="shadow-sm border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-600" />
            Developer Information
          </CardTitle>
          <CardDescription>Designed and developed by</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-white font-bold text-3xl">B</span>
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-xl font-bold">Bayhaqy</h3>
                <p className="text-sm text-muted-foreground">Full-Stack Developer & System Architect</p>
              </div>
              <div className="space-y-2">
                <a
                  href="https://bayhaqy.my.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 hover:underline transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  bayhaqy.my.id
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://wa.me/6287880008592"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 hover:underline transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp: 087880008592
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row items-center gap-3 p-4 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground flex-1 text-center sm:text-left">
              Have questions, suggestions, or need support? Feel free to reach out!
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9" asChild>
                <a href="https://bayhaqy.my.id" target="_blank" rel="noopener noreferrer">
                  <Globe className="w-4 h-4 mr-1.5" />
                  Website
                </a>
              </Button>
              <Button size="sm" className="h-9 bg-green-600 hover:bg-green-700 text-white" asChild>
                <a href="https://wa.me/6287880008592" target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4 mr-1.5" />
                  WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MAP Group */}
      <Card className="shadow-sm">
        <CardContent className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-red-600" />
            <span className="font-semibold">PT Mitra Adiperkasa Tbk</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Indonesia&apos;s leading retail company operating over 3,000 stores across the archipelago, 
            representing more than 150 international brands in fashion, sports, lifestyle, and food & beverage.
          </p>
          <a
            href="https://www.map.co.id"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline mt-3"
          >
            www.map.co.id
            <ExternalLink className="w-3 h-3" />
          </a>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-4">
        <p className="flex items-center justify-center gap-1">
          <Copyright className="w-3 h-3" />
          2026 MAA BTOOL Enterprise MDM. All rights reserved.
        </p>
        <p className="mt-1">MAP Group — PT Mitra Adiperkasa Tbk</p>
      </div>
    </div>
  );
}

interface DeployTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  status: 'active' | 'warning';
  loading: boolean;
  mono?: boolean;
}

function DeployTile({ icon: Icon, label, value, sub, status, loading, mono }: DeployTileProps) {
  const isActive = status === 'active';
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isActive
          ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20'
          : 'border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center',
            isActive
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide',
            isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              isActive ? 'bg-emerald-500' : 'bg-amber-500',
            )}
          />
          {isActive ? 'Active' : 'Check'}
        </span>
      </div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-4 w-20 mt-1" />
      ) : (
        <p className={cn('text-sm font-semibold mt-0.5 truncate', mono && 'font-mono')}>
          {value}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={sub}>
        {sub}
      </p>
    </div>
  );
}
