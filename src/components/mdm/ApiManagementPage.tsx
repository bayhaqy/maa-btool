'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { parsePayload } from '@/lib/parse-payload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Key, Plus, Copy, Trash2, Activity, Zap, BarChart3, CheckCircle2,
  BookOpen, Code2, Play, Send, AlertCircle, Lightbulb, ExternalLink,
  FileText, Shield, Clock, Cpu, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiKeyData {
  id: string;
  keyName: string;
  keyPrefix: string;
  companyId: string | null;
  company?: { id: string; companyCode: string; companyName: string } | null;
  permissions: string;
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  totalRequests: number;
}

interface Company {
  id: string;
  companyCode: string;
  companyName: string;
}

const PERMISSION_OPTIONS = [
  { value: 'READ', label: 'Read' },
  { value: 'WRITE', label: 'Write' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'APPROVE', label: 'Approve' },
];

// API Documentation Content
const API_ENDPOINTS = [
  {
    category: 'Records',
    endpoints: [
      { method: 'GET', path: '/api/records?moduleId=xxx', description: 'List records for a module', auth: true },
      { method: 'GET', path: '/api/records?action=detail&id=xxx', description: 'Get single record with versions', auth: true },
      { method: 'POST', path: '/api/records', description: 'Create new record', auth: true },
      { method: 'PUT', path: '/api/records?action=update', description: 'Update record payload', auth: true },
      { method: 'PUT', path: '/api/records?action=transition', description: 'Change record status', auth: true },
      { method: 'DELETE', path: '/api/records', description: 'Soft-delete (archive) record', auth: true },
    ],
  },
  {
    category: 'Modules & Fields',
    endpoints: [
      { method: 'GET', path: '/api/modules', description: 'List all modules', auth: true },
      { method: 'GET', path: '/api/modules?action=detail&id=xxx', description: 'Get module with fields', auth: true },
      { method: 'GET', path: '/api/fields?moduleId=xxx', description: 'List fields for a module', auth: true },
    ],
  },
  {
    category: 'Images',
    endpoints: [
      { method: 'GET', path: '/api/images?recordId=xxx', description: 'List images for a record', auth: true },
      { method: 'POST', path: '/api/images', description: 'Upload image (multipart/form-data)', auth: true },
      { method: 'DELETE', path: '/api/images?imageId=xxx', description: 'Delete an image', auth: true },
    ],
  },
  {
    category: 'Workflow',
    endpoints: [
      { method: 'GET', path: '/api/approvals?status=all', description: 'List approval tickets', auth: true },
      { method: 'PATCH', path: '/api/approvals', description: 'Approve or reject a ticket', auth: true },
    ],
  },
  {
    category: 'Documentation',
    endpoints: [
      { method: 'GET', path: '/api/documentation?public=true', description: 'List published docs (public)', auth: false },
      { method: 'GET', path: '/api/documentation?slug=xxx', description: 'Get doc by slug', auth: false },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 border-green-300',
  POST: 'bg-blue-100 text-blue-700 border-blue-300',
  PUT: 'bg-amber-100 text-amber-700 border-amber-300',
  PATCH: 'bg-orange-100 text-orange-700 border-orange-300',
  DELETE: 'bg-red-100 text-red-700 border-red-300',
};

// Best practices content
const BEST_PRACTICES = [
  {
    title: 'API Key Security',
    icon: Shield,
    items: [
      'Never expose API keys in client-side code or public repositories',
      'Use environment variables to store API keys in your application',
      'Rotate API keys periodically — create a new key, update your app, then deactivate the old one',
      'Set appropriate rate limits per key based on actual usage needs',
      'Use the minimum permission level required (READ > WRITE > DELETE > APPROVE)',
      'Set expiration dates on API keys for temporary integrations',
    ],
  },
  {
    title: 'Rate Limiting & Performance',
    icon: Cpu,
    items: [
      'Default rate limit is 100 requests/minute per API key',
      'Implement exponential backoff when receiving 429 (Rate Limit Exceeded) responses',
      'Cache frequently accessed data on your end to reduce API calls',
      'Use pagination (page & limit parameters) for large data sets',
      'Batch operations when possible to minimize round trips',
      'Monitor your API usage through the Access Logs tab',
    ],
  },
  {
    title: 'Data Operations',
    icon: Code2,
    items: [
      'Always validate data on your end before sending to the API',
      'Use proper Content-Type headers: application/json for payloads, multipart/form-data for files',
      'Handle amendment workflows properly — active records cannot be directly updated',
      'Store record IDs for future updates rather than searching by fields each time',
      'Use the version history to track changes and resolve conflicts',
      'Implement proper error handling for all API responses',
    ],
  },
  {
    title: 'Error Handling',
    icon: AlertCircle,
    items: [
      'Always check HTTP status codes before processing response data',
      '400: Validation error — check your request payload format',
      '401: Unauthorized — verify your API key is valid and active',
      '403: Forbidden — your key lacks the required permission',
      '404: Not found — verify the resource ID is correct',
      '422: Business rule violation — check the error message for details',
      '429: Rate limited — implement backoff and retry logic',
    ],
  },
];

export default function ApiManagementPage() {
  const { token, user } = useAppStore();
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rawKeyDialogOpen, setRawKeyDialogOpen] = useState(false);
  const [rawKeyValue, setRawKeyValue] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    keyName: '', companyId: '', permissions: 'READ', rateLimit: 100,
  });

  // API Testing state
  const [testMethod, setTestMethod] = useState('GET');
  const [testPath, setTestPath] = useState('/api/modules');
  const [testBody, setTestBody] = useState('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const canAccess = user?.roles?.some(r => ['Super Admin', 'API Manager'].includes(r)) ?? false;

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [kRes, cRes] = await Promise.all([
        fetch('/api/api-keys', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const kData = await kRes.json();
      const cData = await cRes.json();
      if (kRes.ok) setApiKeys(kData.apiKeys || []);
      if (cRes.ok) setCompanies(cData.companies || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (canAccess) loadData();
  }, [loadData, canAccess]);

  const handleCreate = async () => {
    if (!token || !form.keyName) {
      toast.error('Key name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
      setRawKeyValue(data.rawKey);
      setRawKeyDialogOpen(true);
      setDialogOpen(false);
      setForm({ keyName: '', companyId: '', permissions: 'READ', rateLimit: 100 });
      loadData();
      toast.success('API key created successfully');
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (keyId: string, currentActive: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: keyId, isActive: !currentActive }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return; }
      toast.success(`API key ${!currentActive ? 'activated' : 'deactivated'}`);
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteId) return;
    try {
      const res = await fetch(`/api/api-keys?id=${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return; }
      toast.success('API key deleted');
      setDeleteId(null);
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // API Test
  const handleTestApi = async () => {
    if (!token) { toast.error('No authentication token'); return; }
    setTestLoading(true);
    setTestResponse(null);
    setTestStatus(null);
    try {
      const startTime = Date.now();
      const options: RequestInit = {
        method: testMethod,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(testMethod !== 'GET' && testBody ? { 'Content-Type': 'application/json' } : {}),
        },
      };
      if (testBody && testMethod !== 'GET') {
        options.body = testBody;
      }
      const res = await fetch(testPath, options);
      const elapsed = Date.now() - startTime;
      setTestStatus(res.status);
      try {
        const data = await res.json();
        setTestResponse(JSON.stringify(data, null, 2) + `\n\n/* ${elapsed}ms */`);
      } catch {
        setTestResponse(`Status: ${res.status} ${res.statusText}\nResponse time: ${elapsed}ms`);
      }
    } catch (err) {
      setTestStatus(0);
      setTestResponse(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const totalKeys = apiKeys.length;
  const activeKeys = apiKeys.filter(k => k.isActive).length;
  const totalRequests = apiKeys.reduce((sum, k) => sum + (k.totalRequests || 0), 0);

  if (!canAccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full shadow-sm">
          <CardContent className="py-12 text-center">
            <Key className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Access Restricted</h3>
            <p className="text-muted-foreground text-sm mt-1">You need API Manager or Super Admin role to manage API keys.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6 text-red-600" />
            API Management
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Manage API keys, documentation, testing, and best practices</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-10" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Create API Key
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Keys</p>
                <p className="text-2xl font-bold mt-1">{totalKeys}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Key className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Active Keys</p>
                <p className="text-2xl font-bold mt-1">{activeKeys}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Requests</p>
                <p className="text-2xl font-bold mt-1">{totalRequests.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">API Endpoints</p>
                <p className="text-2xl font-bold mt-1">{API_ENDPOINTS.reduce((sum, e) => sum + e.endpoints.length, 0)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Code2 className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="keys" className="text-xs sm:text-sm">
            <Key className="w-3.5 h-3.5 mr-1" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="docs" className="text-xs sm:text-sm">
            <BookOpen className="w-3.5 h-3.5 mr-1" /> Documentation
          </TabsTrigger>
          <TabsTrigger value="testing" className="text-xs sm:text-sm">
            <Play className="w-3.5 h-3.5 mr-1" /> Testing
          </TabsTrigger>
          <TabsTrigger value="practices" className="text-xs sm:text-sm">
            <Lightbulb className="w-3.5 h-3.5 mr-1" /> Best Practices
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="keys" className="space-y-4">
          {/* Quick Start Guide */}
          <Card className="shadow-sm border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                Quick Start Guide
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <div>
                    <p className="font-medium">Create an API Key</p>
                    <p className="text-xs text-muted-foreground">Click &quot;Create API Key&quot; and set permissions</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <div>
                    <p className="font-medium">Copy & Store Securely</p>
                    <p className="text-xs text-muted-foreground">Save the key — you won&apos;t see it again</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <div>
                    <p className="font-medium">Make API Calls</p>
                    <p className="text-xs text-muted-foreground">Use Bearer token in Authorization header</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 p-2 rounded bg-muted/50">
                <code className="text-xs font-mono">
                  curl -H &quot;Authorization: Bearer YOUR_API_KEY&quot; https://your-domain.com/api/modules
                </code>
              </div>
            </CardContent>
          </Card>

          {/* API Keys Table */}
          <Card className="shadow-sm">
            <CardContent className="p-0">
              {apiKeys.length === 0 ? (
                <div className="py-16 text-center">
                  <Key className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No API keys yet</h3>
                  <p className="text-muted-foreground text-sm mt-1">Create your first API key to get started</p>
                  <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Create API Key
                  </Button>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Prefix</TableHead>
                        <TableHead className="hidden md:table-cell">Company</TableHead>
                        <TableHead>Rate Limit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden lg:table-cell">Last Used</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell className="font-medium">{key.keyName}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{key.keyPrefix}...</code>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            {key.company?.companyName || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{key.rateLimit}/min</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              'text-xs border',
                              key.isActive
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            )}>
                              {key.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {formatDate(key.lastUsedAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Switch checked={key.isActive} onCheckedChange={() => handleToggleActive(key.id, key.isActive)} className="scale-75" />
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(key.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documentation Tab */}
        <TabsContent value="docs" className="space-y-4">
          {/* Authentication */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-600" />
                Authentication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                All authenticated endpoints require a Bearer token in the Authorization header.
              </p>
              <div className="p-3 rounded-lg bg-muted font-mono text-sm">
                <p className="text-muted-foreground">{'// HTTP Header'}</p>
                <p>Authorization: Bearer {'<YOUR_API_KEY>'}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted font-mono text-sm">
                <p className="text-muted-foreground">{'// Example cURL'}</p>
                <p>curl -X GET \</p>
                <p>  -H &quot;Authorization: Bearer {'<YOUR_API_KEY>'}&quot; \</p>
                <p>  https://your-domain.com/api/records?moduleId=xxx</p>
              </div>
            </CardContent>
          </Card>

          {/* Endpoints by Category */}
          {API_ENDPOINTS.map((group) => (
            <Card key={group.category} className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{group.category}</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <div className="space-y-1">
                  {group.endpoints.map((ep, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <Badge className={cn('text-[10px] font-mono border min-w-[52px] justify-center', METHOD_COLORS[ep.method])}>
                        {ep.method}
                      </Badge>
                      <code className="text-sm font-mono flex-1 min-w-0 truncate">{ep.path}</code>
                      <span className="text-xs text-muted-foreground hidden md:block">{ep.description}</span>
                      {ep.auth && (
                        <Badge variant="outline" className="text-[9px] shrink-0">🔐 Auth</Badge>
                      )}
                      {!ep.auth && (
                        <Badge variant="outline" className="text-[9px] shrink-0 text-green-600">🌐 Public</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Request/Response Examples */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Code2 className="w-5 h-5 text-red-600" />
                Request & Response Examples
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Create Record Example */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Create Record (POST /api/records)</p>
                <div className="p-3 rounded-lg bg-muted font-mono text-xs">
                  <p className="text-muted-foreground">{'// Request Body'}</p>
                  <pre>{JSON.stringify({
                    moduleId: "clx_module_id",
                    payload: {
                      ARTICLE_CODE: "ART001",
                      ARTICLE_NAME: "Nike Air Max 90",
                      BRAND: "NIKE",
                      PRICE: 1599000,
                    }
                  }, null, 2)}</pre>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 font-mono text-xs">
                  <p className="text-green-600">{'// Response 201 Created'}</p>
                  <pre>{JSON.stringify({
                    record: {
                      id: "clx_record_id",
                      moduleId: "clx_module_id",
                      status: "DRAFT",
                      version: 1,
                      currentPayload: "{\"ARTICLE_CODE\":\"ART001\",...}",
                      createdAt: "2026-01-15T10:30:00Z"
                    }
                  }, null, 2)}</pre>
                </div>
              </div>

              <Separator />

              {/* Upload Image Example */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Upload Image (POST /api/images)</p>
                <div className="p-3 rounded-lg bg-muted font-mono text-xs">
                  <p className="text-muted-foreground">{'// Multipart Form Data'}</p>
                  <pre>{`file: <binary file data>
recordId: "clx_record_id"
fieldName: "PRODUCT_IMAGE"
isPrimary: "true"`}</pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Testing Tab */}
        <TabsContent value="testing" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Play className="w-5 h-5 text-red-600" />
                API Playground
              </CardTitle>
              <CardDescription>Test API endpoints directly from the browser</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Request Builder */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Select value={testMethod} onValueChange={setTestMethod}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                        <SelectItem key={m} value={m}>
                          <span className={cn('font-mono font-bold', m === 'GET' ? 'text-green-600' : m === 'POST' ? 'text-blue-600' : m === 'DELETE' ? 'text-red-600' : 'text-amber-600')}>
                            {m}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={testPath}
                    onChange={(e) => setTestPath(e.target.value)}
                    placeholder="/api/..."
                    className="flex-1 font-mono text-sm"
                  />
                  <Button onClick={handleTestApi} disabled={testLoading} className="bg-red-600 hover:bg-red-700 text-white shrink-0">
                    {testLoading ? <><Zap className="w-4 h-4 mr-1 animate-pulse" /> Sending...</> : <><Send className="w-4 h-4 mr-1" /> Send</>}
                  </Button>
                </div>

                {/* Quick endpoint buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { method: 'GET', path: '/api/modules' },
                    { method: 'GET', path: '/api/documentation?public=true' },
                    { method: 'GET', path: '/api/records?moduleId=REPLACE_WITH_ID' },
                  ].map((ep) => (
                    <Button
                      key={`${ep.method}-${ep.path}`}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setTestMethod(ep.method); setTestPath(ep.path); }}
                    >
                      <Badge className={cn('text-[9px] font-mono border mr-1.5', METHOD_COLORS[ep.method])}>
                        {ep.method}
                      </Badge>
                      {ep.path}
                    </Button>
                  ))}
                </div>

                {/* Request Body */}
                {testMethod !== 'GET' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Request Body (JSON)</Label>
                    <Textarea
                      value={testBody}
                      onChange={(e) => setTestBody(e.target.value)}
                      placeholder='{"key": "value"}'
                      className="min-h-[120px] font-mono text-sm"
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Response */}
              {testResponse && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Response</Label>
                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        'text-xs border',
                        testStatus && testStatus < 300 ? 'bg-green-50 text-green-700 border-green-200' :
                        testStatus && testStatus < 500 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      )}>
                        {testStatus || 'Error'}
                      </Badge>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(testResponse)}>
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                  </div>
                  <pre className="p-4 rounded-lg bg-muted font-mono text-xs max-h-[400px] overflow-auto custom-scrollbar whitespace-pre-wrap break-words">
                    {testResponse}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Best Practices Tab */}
        <TabsContent value="practices" className="space-y-4">
          {BEST_PRACTICES.map((section) => (
            <Card key={section.title} className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <section.icon className="w-5 h-5 text-red-600" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <ArrowRight className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          {/* Common Patterns */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Code2 className="w-5 h-5 text-red-600" />
                Common Integration Patterns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">1. Fetch records and process them</p>
                <div className="p-3 rounded-lg bg-muted font-mono text-xs">
                  <pre>{`// Using fetch
const response = await fetch('/api/records?moduleId=YOUR_MODULE_ID', {
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
});
const { data, total } = await response.json();

// Process records
for (const record of data) {
  const payload = parsePayload(record.currentPayload);
  console.log(payload.ARTICLE_NAME);
}`}</pre>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">2. Create and submit for approval</p>
                <div className="p-3 rounded-lg bg-muted font-mono text-xs">
                  <pre>{`// Step 1: Create record
const createRes = await fetch('/api/records', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    moduleId: 'YOUR_MODULE_ID',
    payload: { FIELD_CODE: 'value' }
  })
});
const { record } = await createRes.json();

// Step 2: Submit for approval
await fetch('/api/records?action=transition', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: record.id,
    targetStatus: 'IN_REVIEW'
  })
});`}</pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create API Key Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>Generate a new API key for programmatic access</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Key Name</Label>
              <Input placeholder="e.g., Production Integration" value={form.keyName} onChange={(e) => setForm({ ...form, keyName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <Select value={form.permissions} onValueChange={(v) => setForm({ ...form, permissions: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERMISSION_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rate Limit (requests per minute)</Label>
              <Input type="number" value={form.rateLimit} onChange={(e) => setForm({ ...form, rateLimit: parseInt(e.target.value) || 100 })} min={1} max={10000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raw Key Dialog */}
      <Dialog open={rawKeyDialogOpen} onOpenChange={setRawKeyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>API Key Created!</DialogTitle>
            <DialogDescription>Copy your API key now. You won&apos;t be able to see it again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                ⚠️ Warning: This is the only time you will see the full API key. Please copy it now.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">{rawKeyValue}</code>
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(rawKeyValue)}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRawKeyDialogOpen(false)} className="bg-red-600 hover:bg-red-700 text-white">
              I&apos;ve Copied the Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any applications using this key will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
