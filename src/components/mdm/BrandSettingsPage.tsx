'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Palette, Building2, Type, Globe, Upload, X,
  Save, Eye, RotateCcw, Loader2, Layout, Monitor,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBranding } from '@/hooks/useBranding';
import {
  DEFAULT_BRANDING,
  type BrandingSettings,
  type SidebarStyle,
  type SidebarPosition,
} from '@/lib/branding';

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (Default)' },
  { value: 'system-ui', label: 'System UI' },
  { value: 'Georgia', label: 'Georgia (Serif)' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'Arial', label: 'Arial' },
];

const INDUSTRY_OPTIONS = [
  'Retail', 'Fashion & Lifestyle', 'Food & Beverage', 'Sports',
  'Department Store', 'E-commerce', 'Manufacturing', 'Technology',
  'Finance', 'Healthcare', 'Education', 'Other',
];

const SIDEBAR_STYLES: { value: SidebarStyle; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'transparent', label: 'Transparent' },
];

const SIDEBAR_POSITIONS: { value: SidebarPosition; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

export default function BrandSettingsPage() {
  const { user } = useAppStore();
  const isSuperAdmin = user?.roles?.includes('Super Admin') ?? false;

  // Pull branding state + persist helpers from the provider. The provider
  // is the single source of truth for applied branding; this page just
  // edits a local draft and pushes it back via applySettings.
  const { settings: appliedSettings, loading: providerLoading, applySettings, resetSettings } = useBranding();

  const [saving, setSaving] = useState(false);
  // Local draft state — initialized from the provider once it has loaded.
  const [settings, setSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [showPreview, setShowPreview] = useState(false);
  const [draftInitialized, setDraftInitialized] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Sync the local draft with the provider's settings once they finish loading.
  // This keeps the form populated even if the user refreshes the page.
  useEffect(() => {
    if (providerLoading || draftInitialized) return;
    setSettings(appliedSettings);
    setDraftInitialized(true);
  }, [providerLoading, draftInitialized, appliedSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Push to the provider — this applies CSS vars, persists to
      // localStorage, and (for Super Admins) writes to the DB via /api/settings.
      await applySettings(settings);
      // Notify any other mounted components (e.g. AppShell) to refresh.
      window.dispatchEvent(
        new CustomEvent('maa-btool:branding-updated', { detail: settings })
      );
      toast.success('Settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSettings(DEFAULT_BRANDING);
    await resetSettings();
    toast.success('Settings reset to defaults');
  };

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    setUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setSettings(prev => ({ ...prev, logoUrl: dataUrl }));
        toast.success('Logo uploaded');
        setUploadingLogo(false);
      };
      reader.onerror = () => {
        toast.error('Failed to read logo file');
        setUploadingLogo(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Failed to upload logo');
      setUploadingLogo(false);
    }
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const updateSetting = <K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (providerLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <Palette className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
            <p className="text-sm text-muted-foreground">
              Settings are only available to Super Admin users.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Palette className="w-6 h-6 text-red-600" />
            Settings
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Customize your organization&apos;s branding, theme, and layout preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="h-9">
            <RotateCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} className="h-9">
            <Eye className="w-4 h-4 mr-1" /> {showPreview ? 'Hide Preview' : 'Preview'}
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="bg-red-600 hover:bg-red-700 text-white h-9">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className={cn('grid gap-6', showPreview ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2')}>
        {/* Settings Column */}
        <div className={cn('space-y-6', showPreview ? 'xl:col-span-2' : 'lg:col-span-1')}>
          {/* Company Branding Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-red-600" />
                Company Branding
              </CardTitle>
              <CardDescription>Configure your organization&apos;s identity and branding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Company Logo</Label>
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-24 h-24 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted/20 cursor-pointer transition-colors',
                      'hover:border-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20'
                    )}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
                    ) : settings.logoUrl ? (
                      <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <Upload className="w-6 h-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e.target.files)} />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-muted-foreground">Upload your company logo. Recommended: 200×200px PNG or SVG.</p>
                    {settings.logoUrl && (
                      <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => updateSetting('logoUrl', '')}>
                        <X className="w-3 h-3 mr-1" /> Remove Logo
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" value={settings.companyName} onChange={(e) => updateSetting('companyName', e.target.value)} placeholder="Your company name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slogan">Slogan / Tagline</Label>
                <Input id="slogan" value={settings.slogan} onChange={(e) => updateSetting('slogan', e.target.value)} placeholder="Your company tagline" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={settings.description} onChange={(e) => updateSetting('description', e.target.value)} placeholder="Brief description" rows={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website" className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Website URL</Label>
                <Input id="website" type="url" value={settings.website} onChange={(e) => updateSetting('website', e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select value={settings.industry} onValueChange={(v) => updateSetting('industry', v)}>
                  <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Theme Customization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Type className="w-5 h-5 text-red-600" />
                Theme Customization
              </CardTitle>
              <CardDescription>Customize visual appearance and color scheme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map((colorKey) => (
                  <div key={colorKey} className="space-y-2">
                    <Label htmlFor={colorKey}>{colorKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" id={colorKey} value={settings[colorKey]} onChange={(e) => updateSetting(colorKey, e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
                      <Input value={settings[colorKey]} onChange={(e) => updateSetting(colorKey, e.target.value)} className="flex-1 font-mono text-xs" />
                    </div>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Font Family</Label>
                <Select value={settings.fontFamily} onValueChange={(v) => updateSetting('fontFamily', v)}>
                  <SelectTrigger><SelectValue placeholder="Select font" /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Border Radius</span>
                  <span className="text-xs font-mono text-muted-foreground">{settings.borderRadius}px</span>
                </Label>
                <input type="range" min={0} max={24} step={2} value={settings.borderRadius} onChange={(e) => updateSetting('borderRadius', parseInt(e.target.value))} className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-red-600" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sharp (0px)</span>
                  <span>Rounded (24px)</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Sidebar Style</Label>
                <div className="grid grid-cols-3 gap-3">
                  {SIDEBAR_STYLES.map((style) => (
                    <button key={style.value} type="button" onClick={() => updateSetting('sidebarStyle', style.value)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                        settings.sidebarStyle === style.value ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' : 'border-border hover:border-red-300'
                      )}
                    >
                      <div className={cn(
                        'w-12 h-8 rounded border',
                        style.value === 'dark' && 'bg-gray-900 border-gray-700',
                        style.value === 'light' && 'bg-white border-gray-200',
                        style.value === 'transparent' && 'bg-gradient-to-br from-gray-100 to-gray-50 border-gray-200',
                      )} />
                      <span className="text-xs font-medium">{style.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Layout Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layout className="w-5 h-5 text-red-600" />
                Layout Settings
              </CardTitle>
              <CardDescription>Configure interface layout and display preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Sidebar Position</Label>
                <div className="grid grid-cols-2 gap-3">
                  {SIDEBAR_POSITIONS.map((pos) => (
                    <button key={pos.value} type="button" onClick={() => updateSetting('sidebarPosition', pos.value)}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-lg border-2 transition-all capitalize',
                        settings.sidebarPosition === pos.value ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' : 'border-border hover:border-red-300'
                      )}
                    >
                      <Monitor className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm font-medium">{pos.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Compact Mode</p>
                  <p className="text-xs text-muted-foreground">Reduce spacing and padding for denser layout</p>
                </div>
                <Switch checked={settings.compactMode} onCheckedChange={(c) => updateSetting('compactMode', c)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Show Breadcrumbs</p>
                  <p className="text-xs text-muted-foreground">Display breadcrumb navigation in the header</p>
                </div>
                <Switch checked={settings.showBreadcrumbs} onCheckedChange={(c) => updateSetting('showBreadcrumbs', c)} />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Input id="footerText" value={settings.footerText} onChange={(e) => updateSetting('footerText', e.target.value)} placeholder="Custom footer text" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Column */}
        <div className={cn('space-y-6', showPreview ? 'xl:col-span-1' : 'lg:col-span-1')}>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="w-5 h-5 text-red-600" />
                Live Preview
              </CardTitle>
              <CardDescription>Preview how your branding looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border overflow-hidden">
                <div className={cn(
                  'w-full p-4',
                  settings.sidebarStyle === 'dark' && 'bg-gray-900 text-white',
                  settings.sidebarStyle === 'light' && 'bg-white text-gray-900 border-b',
                  settings.sidebarStyle === 'transparent' && 'bg-gradient-to-br from-gray-100 to-gray-50 text-gray-900 border-b',
                )}>
                  <div className="flex items-center gap-2 mb-4">
                    {settings.logoUrl ? (
                      <img src={settings.logoUrl} alt="Logo" className="w-8 h-8 rounded object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: settings.primaryColor }}>
                        {settings.companyName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold leading-tight" style={{ fontFamily: settings.fontFamily }}>{settings.companyName || 'Company Name'}</p>
                      <p className="text-[10px] opacity-70">{settings.slogan || 'Your tagline'}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {['Dashboard', 'Modules', 'Data Records', 'Settings'].map((item, i) => (
                      <div key={item} className={cn('px-3 py-1.5 rounded text-xs', i === 0 ? 'bg-red-700/30 font-medium' : 'opacity-60')}
                        style={{ fontFamily: settings.fontFamily, borderRadius: `${settings.borderRadius / 2}px` }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="bg-white dark:bg-gray-800 p-3 flex items-center gap-3 border-b">
                  <span className="text-xs text-muted-foreground">{settings.showBreadcrumbs ? 'Home > Dashboard' : ''}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: settings.primaryColor }}>A</div>
                  </div>
                </div>
                <div className="p-4 bg-muted/20">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {settings.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 rounded object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: settings.primaryColor, borderRadius: `${settings.borderRadius}px` }}>
                          {settings.companyName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm" style={{ fontFamily: settings.fontFamily }}>Welcome to {settings.companyName || 'Company Name'}</p>
                        <p className="text-xs text-muted-foreground">{settings.slogan || 'Your tagline here'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Modules', color: settings.primaryColor },
                        { label: 'Records', color: settings.secondaryColor },
                        { label: 'Users', color: settings.accentColor },
                      ].map((card) => (
                        <div key={card.label} className="p-2 rounded border bg-white dark:bg-gray-800" style={{ borderRadius: `${settings.borderRadius}px` }}>
                          <div className="w-5 h-1.5 rounded-full mb-1.5" style={{ backgroundColor: card.color }} />
                          <p className="text-[9px] text-muted-foreground">{card.label}</p>
                          <p className="text-sm font-bold" style={{ fontFamily: settings.fontFamily }}>12</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-2 bg-muted/10 border-t">
                  <p className="text-[9px] text-muted-foreground text-center truncate">{settings.footerText || 'MAA BTOOL Enterprise MDM © 2026 | MAP Group'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Color Palette</Label>
                <div className="flex gap-2">
                  <div className="flex-1 h-8 rounded-md" style={{ backgroundColor: settings.primaryColor, borderRadius: `${settings.borderRadius}px` }} />
                  <div className="flex-1 h-8 rounded-md" style={{ backgroundColor: settings.secondaryColor, borderRadius: `${settings.borderRadius}px` }} />
                  <div className="flex-1 h-8 rounded-md" style={{ backgroundColor: settings.accentColor, borderRadius: `${settings.borderRadius}px` }} />
                </div>
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  <span className="flex-1 text-center">Primary</span>
                  <span className="flex-1 text-center">Secondary</span>
                  <span className="flex-1 text-center">Accent</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
