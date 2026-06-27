'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import {
  Brain,
  Eye,
  EyeOff,
  Plug,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings2,
  Globe,
  KeyRound,
  Thermometer,
  Hash,
  Cpu,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────

type AIProvider = 'zai' | 'gemini' | 'openai' | 'azure-openai' | 'custom';

interface AIConfigState {
  provider: AIProvider;
  apiKey: string;
  apiKeyMasked: string;
  apiKeySet: boolean;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  configured: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  model?: string;
  provider?: string;
}

const PROVIDER_INFO: Record<AIProvider, {
  label: string;
  icon: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
  requiresBaseUrl: boolean;
  description: string;
}> = {
  zai: {
    label: 'Z.AI',
    icon: '🤖',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long', 'glm-3-turbo'],
    requiresBaseUrl: false,
    description: 'Z.AI — Default AI provider with GLM models',
  },
  gemini: {
    label: 'Google Gemini',
    icon: '✨',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresBaseUrl: false,
    description: 'Google Gemini — Multimodal AI with fast inference',
  },
  openai: {
    label: 'OpenAI',
    icon: '🧠',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresBaseUrl: false,
    description: 'OpenAI — Industry-leading GPT models',
  },
  'azure-openai': {
    label: 'Azure OpenAI',
    icon: '☁️',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo'],
    requiresBaseUrl: true,
    description: 'Azure OpenAI — Enterprise-grade OpenAI on Azure',
  },
  custom: {
    label: 'Custom Provider',
    icon: '🔧',
    defaultBaseUrl: '',
    defaultModel: '',
    models: [],
    requiresBaseUrl: true,
    description: 'Custom — Connect to any OpenAI-compatible API endpoint',
  },
};

export default function AiSettingsPage() {
  const { token, user } = useAppStore();
  const isSuperAdmin = user?.roles?.includes('Super Admin') ?? false;

  // ─── State ────────────────────────────────────────────────────────
  const [config, setConfig] = useState<AIConfigState>({
    provider: 'zai',
    apiKey: '',
    apiKeyMasked: '',
    apiKeySet: false,
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4-plus',
    maxTokens: 4096,
    temperature: 0.7,
    configured: false,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ─── Fetch config on mount ────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const c = data.config;
        setConfig({
          provider: c.provider || 'zai',
          apiKey: '',
          apiKeyMasked: c.apiKeyMasked || '',
          apiKeySet: c.apiKeySet || false,
          baseUrl: c.baseUrl || PROVIDER_INFO[c.provider || 'zai'].defaultBaseUrl,
          model: c.model || PROVIDER_INFO[c.provider || 'zai'].defaultModel,
          maxTokens: c.maxTokens || 4096,
          temperature: c.temperature ?? 0.7,
          configured: c.configured || false,
        });
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleProviderChange = (newProvider: AIProvider) => {
    const info = PROVIDER_INFO[newProvider];
    setConfig((prev) => ({
      ...prev,
      provider: newProvider,
      baseUrl: info.defaultBaseUrl || prev.baseUrl,
      model: info.defaultModel || prev.model,
    }));
    setTestResult(null);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const body: Record<string, unknown> = {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      };

      // Only send API key if user actually typed a new one
      if (config.apiKey) {
        body.apiKey = config.apiKey;
      }

      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'AI configuration saved successfully.' });
        // Refresh config
        const c = data.config;
        setConfig((prev) => ({
          ...prev,
          apiKey: '',
          apiKeyMasked: c.apiKeyMasked || '',
          apiKeySet: c.apiKeySet || false,
          configured: c.configured || false,
          provider: c.provider || prev.provider,
          baseUrl: c.baseUrl || prev.baseUrl,
          model: c.model || prev.model,
          maxTokens: c.maxTokens || prev.maxTokens,
          temperature: c.temperature ?? prev.temperature,
        }));
        setShowApiKey(false);
      } else {
        setSaveMessage({ type: 'error', text: data.error || 'Failed to save configuration.' });
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!token) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.result) {
        setTestResult(data.result);
      } else {
        setTestResult({ success: false, message: data.error || 'Test failed unexpectedly.' });
      }
    } catch {
      setTestResult({ success: false, message: 'Network error during connection test.' });
    } finally {
      setTesting(false);
    }
  };

  const providerInfo = PROVIDER_INFO[config.provider];

  // ─── Loading skeleton ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded-md bg-muted/60" />
          <div className="h-4 w-96 rounded-md bg-muted/40" />
          <div className="h-48 rounded-xl border bg-card/60" />
          <div className="h-48 rounded-xl border bg-card/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure AI provider, API keys, and generation parameters
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config.configured ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Configured
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Not Configured
            </Badge>
          )}
        </div>
      </div>

      {/* ── Status Alert ─────────────────────────────────────────── */}
      {!config.configured && (
        <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-300">AI Not Configured</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            No AI provider is configured. AI features (Assistant, Prompts, Review) will use demo mode. 
            Set an API key below to enable live AI responses.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Save Message ─────────────────────────────────────────── */}
      <AnimatePresence>
        {saveMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Alert className={saveMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
            }>
              {saveMessage.type === 'success'
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                : <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              }
              <AlertTitle className={saveMessage.type === 'success'
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-red-800 dark:text-red-300'
              }>
                {saveMessage.type === 'success' ? 'Success' : 'Error'}
              </AlertTitle>
              <AlertDescription className={saveMessage.type === 'success'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
              }>
                {saveMessage.text}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Provider Selection Card ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            AI Provider
          </CardTitle>
          <CardDescription>
            Select the AI provider for the MDM platform. Each provider has different models and capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={config.provider}
              onValueChange={(v) => handleProviderChange(v as AIProvider)}
              disabled={!isSuperAdmin}
            >
              <SelectTrigger className="w-full" id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>AI Providers</SelectLabel>
                  {(Object.entries(PROVIDER_INFO) as [AIProvider, typeof PROVIDER_INFO[AIProvider]][]).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span>{info.icon}</span>
                        <span>{info.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Provider info card */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{providerInfo.icon}</span>
              <span className="font-semibold">{providerInfo.label}</span>
            </div>
            <p className="text-sm text-muted-foreground">{providerInfo.description}</p>
            {providerInfo.requiresBaseUrl && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                This provider requires a custom base URL
              </div>
            )}
          </div>

          {/* Model selection */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            {providerInfo.models.length > 0 ? (
              <Select
                value={config.model}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, model: v }))}
                disabled={!isSuperAdmin}
              >
                <SelectTrigger className="w-full" id="model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Available Models</SelectLabel>
                    {providerInfo.models.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="model"
                value={config.model}
                onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="Enter model name"
                disabled={!isSuperAdmin}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── API Key & Endpoint Card ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            API Key & Endpoint
          </CardTitle>
          <CardDescription>
            Provide your API key and endpoint URL. Keys are stored securely and never exposed in full.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={config.apiKey || config.apiKeyMasked}
                  onChange={(e) => {
                    // If user types over the masked value, replace with actual input
                    if (config.apiKeyMasked && e.target.value === config.apiKeyMasked) return;
                    setConfig((prev) => ({ ...prev, apiKey: e.target.value }));
                  }}
                  onFocus={() => {
                    // Clear masked value so user can type a new key
                    if (config.apiKeyMasked && !config.apiKey) {
                      setConfig((prev) => ({ ...prev, apiKey: '', apiKeyMasked: '' }));
                    }
                  }}
                  placeholder={config.apiKeySet ? 'Enter new key to replace existing' : 'Enter API key'}
                  disabled={!isSuperAdmin}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                  disabled={!isSuperAdmin}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            {config.apiKeySet && !config.apiKey && (
              <p className="text-xs text-muted-foreground">
                Current key: <span className="font-mono">{config.apiKeyMasked}</span>
                {' '}— Leave empty to keep the existing key.
              </p>
            )}
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="baseUrl">
              Base URL
              {providerInfo.requiresBaseUrl && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id="baseUrl"
              value={config.baseUrl}
              onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder={providerInfo.defaultBaseUrl || 'https://api.example.com/v1'}
              disabled={!isSuperAdmin}
            />
            <p className="text-xs text-muted-foreground">
              {config.provider === 'azure-openai'
                ? 'Your Azure OpenAI resource endpoint (e.g., https://your-resource.openai.azure.com)'
                : config.provider === 'custom'
                  ? 'The base URL for your OpenAI-compatible API endpoint'
                  : `Default: ${providerInfo.defaultBaseUrl}`
              }
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Generation Parameters Card ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Generation Parameters
          </CardTitle>
          <CardDescription>
            Fine-tune how the AI generates responses. These settings apply to all AI features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-orange-500" />
                Temperature
              </Label>
              <span className="text-sm font-mono font-medium tabular-nums bg-muted px-2 py-0.5 rounded">
                {config.temperature.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[config.temperature]}
              onValueChange={(v) => setConfig((prev) => ({ ...prev, temperature: v[0] }))}
              min={0}
              max={2}
              step={0.05}
              disabled={!isSuperAdmin}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Precise (0)</span>
              <span>Balanced (1)</span>
              <span>Creative (2)</span>
            </div>
          </div>

          <Separator />

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label htmlFor="maxTokens" className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-blue-500" />
              Max Tokens
            </Label>
            <Input
              id="maxTokens"
              type="number"
              value={config.maxTokens}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 128000) {
                  setConfig((prev) => ({ ...prev, maxTokens: val }));
                }
              }}
              min={1}
              max={128000}
              disabled={!isSuperAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of tokens per AI response (1–128,000). Higher values allow longer responses but cost more.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Test Connection Card ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Connection Test
          </CardTitle>
          <CardDescription>
            Verify that your AI provider configuration is working correctly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleTestConnection}
            disabled={testing || !isSuperAdmin}
            variant="outline"
            className="gap-2"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {testing ? 'Testing Connection...' : 'Test Connection'}
          </Button>

          {/* Test Result */}
          <AnimatePresence>
            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`
                  rounded-lg border p-4 space-y-2
                  ${testResult.success
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                    : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                  <span className={`font-medium ${testResult.success ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>
                    {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </span>
                </div>
                <p className={`text-sm ${testResult.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {testResult.message}
                </p>
                {testResult.success && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {testResult.latencyMs !== undefined && (
                      <Badge variant="outline" className="gap-1">
                        <RefreshCw className="w-3 h-3" />
                        {testResult.latencyMs}ms
                      </Badge>
                    )}
                    {testResult.model && (
                      <Badge variant="outline" className="gap-1">
                        <Cpu className="w-3 h-3" />
                        {testResult.model}
                      </Badge>
                    )}
                    {testResult.provider && (
                      <Badge variant="outline" className="gap-1">
                        <Globe className="w-3 h-3" />
                        {PROVIDER_INFO[testResult.provider as AIProvider]?.label || testResult.provider}
                      </Badge>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* ── Save Button ──────────────────────────────────────────── */}
      {isSuperAdmin && (
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={fetchConfig}
            disabled={saving}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white shadow-lg shadow-purple-500/20"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      )}

      {/* ── Non-superadmin notice ────────────────────────────────── */}
      {!isSuperAdmin && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Read Only</AlertTitle>
          <AlertDescription>
            Only Super Admins can modify AI settings. Contact your administrator to change the configuration.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
