'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Plus, Trash2, Play,
  CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw, Server,
  Wifi, WifiOff, Globe, FileInput, FileOutput, Webhook, Database,
  MessageSquare, Zap, Settings, Activity, ChevronRight, Search,
  ExternalLink, Copy, Check, Loader2, Cable, Radio,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────

interface EndpointData {
  id: string;
  endpointName: string;
  endpointCode: string;
  description: string | null;
  endpointType: string;
  direction: string;
  connectionConfig: string;
  mappingConfig: string | null;
  scheduleConfig: string | null;
  transformRules: string | null;
  errorHandling: string | null;
  moduleId: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdAt: string;
  updatedAt: string;
  company?: { id: string; companyCode: string; companyName: string } | null;
  module?: { id: string; moduleCode: string; moduleName: string } | null;
  runLogs?: RunLogData[];
  _count?: { runLogs: number };
}

interface RunLogData {
  id: string;
  endpointId: string;
  runStatus: string;
  recordsProcessed: number;
  recordsSuccess: number;
  recordsFailed: number;
  errorDetail: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ─── Constants ──────────────────────────────────────────────────

const ENDPOINT_TYPES = [
  { value: 'REST_API', label: 'REST API', icon: Globe, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'SOAP_API', label: 'SOAP API', icon: Server, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'SFTP', label: 'SFTP', icon: FileInput, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'DATABASE', label: 'Database', icon: Database, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  { value: 'FILE_IMPORT', label: 'File Import', icon: FileInput, color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
  { value: 'FILE_EXPORT', label: 'File Export', icon: FileOutput, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  { value: 'WEBHOOK', label: 'Webhook', icon: Webhook, color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300' },
  { value: 'MESSAGE_QUEUE', label: 'Message Queue', icon: MessageSquare, color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
  { value: 'ODATA', label: 'OData', icon: Radio, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' },
  { value: 'GRAPHQL', label: 'GraphQL', icon: Zap, color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' },
];

const DIRECTION_OPTIONS = [
  { value: 'INBOUND', label: 'Inbound (Import)', icon: ArrowDownToLine, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'OUTBOUND', label: 'Outbound (Export)', icon: ArrowUpFromLine, color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  { value: 'BIDIRECTIONAL', label: 'Bidirectional', icon: ArrowLeftRight, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
];

const DEFAULT_CONFIGS: Record<string, Record<string, string>> = {
  REST_API: { url: '', method: 'GET', headers: '{}', authType: 'none', authToken: '' },
  SOAP_API: { url: '', soapAction: '', authType: 'none', authToken: '' },
  SFTP: { host: '', port: '22', username: '', authType: 'password', remotePath: '/' },
  DATABASE: { connectionString: '', query: '' },
  FILE_IMPORT: { path: '', filePattern: '*.csv', encoding: 'UTF-8', delimiter: ',' },
  FILE_EXPORT: { path: '', format: 'CSV', encoding: 'UTF-8', delimiter: ',' },
  WEBHOOK: { url: '', method: 'POST', headers: '{}', secret: '' },
  MESSAGE_QUEUE: { brokerUrl: '', queueName: '', messageType: 'JSON' },
  ODATA: { url: '', entitySet: '', authType: 'none', authToken: '' },
  GRAPHQL: { url: '', query: '', authType: 'none', authToken: '' },
};

// ─── DaaS Sample Endpoints ──────────────────────────────────────

const DAAS_ENDPOINTS = [
  { method: 'GET', path: '/api/v1/products', description: 'List all products with pagination', auth: 'API Key' },
  { method: 'GET', path: '/api/v1/products/{id}', description: 'Get a single product by ID', auth: 'API Key' },
  { method: 'POST', path: '/api/v1/products', description: 'Create a new product', auth: 'API Key + Role' },
  { method: 'PUT', path: '/api/v1/products/{id}', description: 'Update an existing product', auth: 'API Key + Role' },
  { method: 'GET', path: '/api/v1/suppliers', description: 'List all suppliers', auth: 'API Key' },
  { method: 'GET', path: '/api/v1/stores', description: 'List all store locations', auth: 'API Key' },
  { method: 'GET', path: '/api/v1/hierarchy/{code}', description: 'Get hierarchy tree by code', auth: 'API Key' },
  { method: 'GET', path: '/api/v1/data-quality/scores', description: 'Get quality scores for records', auth: 'API Key' },
];

// ─── Field Mapping Types ────────────────────────────────────────

interface FieldMapping {
  source: string;
  target: string;
  transform: string;
}

const TRANSFORM_OPTIONS = ['NONE', 'RENAME', 'UPPERCASE', 'LOWERCASE', 'TRIM', 'CONCAT', 'SPLIT', 'LOOKUP', 'DEFAULT', 'REGEX'];

// ─── Component ──────────────────────────────────────────────────

export default function DataExchangePage() {
  const { token, user } = useAppStore();
  const perms = usePermissions();
  const [endpoints, setEndpoints] = useState<EndpointData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDirection, setFilterDirection] = useState<string>('all');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteEndpointId, setDeleteEndpointId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    endpointName: '',
    endpointCode: '',
    description: '',
    endpointType: 'REST_API',
    direction: 'INBOUND',
    connectionConfig: {} as Record<string, string>,
    mappingConfig: [] as FieldMapping[],
    scheduleConfig: { type: 'manual', expression: '', interval: 60, timezone: 'UTC' },
    errorHandling: { onError: 'skip', maxRetries: 3, retryDelay: 1000 },
    moduleId: '',
    isActive: true,
  });

  const canManage = perms.canEditIntegration;

  // ─── Load endpoints ──────────────────────────────────────────
  const loadEndpoints = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/data-exchange', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setEndpoints(data.endpoints || []);
      }
    } catch {
      toast.error('Failed to load endpoints');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadEndpoints();
  }, [loadEndpoints]);

  // ─── Seed sample data if empty ───────────────────────────────
  useEffect(() => {
    if (!token || !canManage || loading || endpoints.length > 0) return;
    const seedSampleData = async () => {
      const samples = [
        {
          endpointName: 'SAP ERP Product Sync',
          endpointCode: 'SAP-ERP-PRODUCT',
          description: 'Bi-directional sync of product master data with SAP S/4HANA',
          endpointType: 'REST_API',
          direction: 'BIDIRECTIONAL',
          connectionConfig: JSON.stringify({ url: 'https://sap-erp.mapi.co.id/api/v1/products', method: 'GET', headers: '{"Accept":"application/json"}', authType: 'oauth2', authToken: '***' }),
          mappingConfig: JSON.stringify({ fieldMappings: [{ source: 'MATNR', target: 'articleCode', transform: 'UPPERCASE' }, { source: 'MAKTX', target: 'articleName', transform: 'TRIM' }, { source: 'MEINS', target: 'unitOfMeasure', transform: 'NONE' }], primaryKey: 'articleCode', conflictResolution: 'LATEST_WINS' }),
          scheduleConfig: JSON.stringify({ type: 'interval', expression: '', interval: 3600, timezone: 'Asia/Jakarta' }),
          errorHandling: JSON.stringify({ onError: 'skip', maxRetries: 3, retryDelay: 5000 }),
          isActive: true,
        },
        {
          endpointName: 'Supplier Feed Import',
          endpointCode: 'SFTP-SUPPLIER-FEED',
          description: 'Import supplier master data from SFTP drop folder',
          endpointType: 'SFTP',
          direction: 'INBOUND',
          connectionConfig: JSON.stringify({ host: 'sftp.suppliers.mapi.co.id', port: '22', username: 'mdm_service', authType: 'key', remotePath: '/inbound/suppliers/' }),
          mappingConfig: JSON.stringify({ fieldMappings: [{ source: 'VENDOR_ID', target: 'supplierCode', transform: 'TRIM' }, { source: 'VENDOR_NAME', target: 'supplierName', transform: 'NONE' }, { source: 'TAX_ID', target: 'taxId', transform: 'UPPERCASE' }], primaryKey: 'supplierCode', conflictResolution: 'MANUAL' }),
          scheduleConfig: JSON.stringify({ type: 'cron', expression: '0 */6 * * *', interval: 0, timezone: 'Asia/Jakarta' }),
          errorHandling: JSON.stringify({ onError: 'log', maxRetries: 2, retryDelay: 3000 }),
          isActive: true,
        },
        {
          endpointName: 'PIM Catalog Export',
          endpointCode: 'REST-PIM-EXPORT',
          description: 'Export enriched product catalog to PIM system',
          endpointType: 'REST_API',
          direction: 'OUTBOUND',
          connectionConfig: JSON.stringify({ url: 'https://pim.mapa.co.id/api/catalog/import', method: 'POST', headers: '{"Content-Type":"application/json"}', authType: 'bearer', authToken: '***' }),
          mappingConfig: JSON.stringify({ fieldMappings: [{ source: 'articleName', target: 'productName', transform: 'NONE' }, { source: 'description', target: 'productDescription', transform: 'NONE' }, { source: 'categoryCode', target: 'classification', transform: 'LOOKUP' }], primaryKey: 'productName', conflictResolution: 'SOURCE_WINS' }),
          scheduleConfig: JSON.stringify({ type: 'manual', expression: '', interval: 0, timezone: 'UTC' }),
          errorHandling: JSON.stringify({ onError: 'stop', maxRetries: 1, retryDelay: 10000 }),
          isActive: true,
        },
        {
          endpointName: 'Store Master OData',
          endpointCode: 'ODATA-STORE-MASTER',
          description: 'Real-time OData feed of store master data for analytics',
          endpointType: 'ODATA',
          direction: 'OUTBOUND',
          connectionConfig: JSON.stringify({ url: 'https://analytics.mapi.co.id/odata/Stores', entitySet: 'Stores', authType: 'basic', authToken: '***' }),
          mappingConfig: JSON.stringify({ fieldMappings: [{ source: 'storeCode', target: 'StoreID', transform: 'NONE' }, { source: 'storeName', target: 'StoreName', transform: 'NONE' }, { source: 'city', target: 'City', transform: 'UPPERCASE' }], primaryKey: 'StoreID', conflictResolution: 'LATEST_WINS' }),
          scheduleConfig: JSON.stringify({ type: 'interval', expression: '', interval: 1800, timezone: 'Asia/Jakarta' }),
          errorHandling: JSON.stringify({ onError: 'skip', maxRetries: 5, retryDelay: 2000 }),
          isActive: true,
        },
        {
          endpointName: 'Pricing Webhook',
          endpointCode: 'WEBHOOK-PRICING',
          description: 'Webhook endpoint for real-time pricing change notifications',
          endpointType: 'WEBHOOK',
          direction: 'OUTBOUND',
          connectionConfig: JSON.stringify({ url: 'https://pricing.mba.co.id/webhooks/price-change', method: 'POST', headers: '{"X-Webhook-Secret":"***"}', secret: 'whsec_***' }),
          mappingConfig: JSON.stringify({ fieldMappings: [{ source: 'articleCode', target: 'sku', transform: 'TRIM' }, { source: 'priceAmount', target: 'price', transform: 'NONE' }, { source: 'currency', target: 'currencyCode', transform: 'UPPERCASE' }], primaryKey: 'sku', conflictResolution: 'LATEST_WINS' }),
          scheduleConfig: JSON.stringify({ type: 'manual', expression: '', interval: 0, timezone: 'UTC' }),
          errorHandling: JSON.stringify({ onError: 'log', maxRetries: 3, retryDelay: 1000 }),
          isActive: false,
        },
      ];

      for (const sample of samples) {
        try {
          await fetch('/api/data-exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(sample),
          });
        } catch {
          // Continue seeding others
        }
      }
      loadEndpoints();
    };
    seedSampleData();
  }, [token, canManage, loading, endpoints.length, loadEndpoints]);

  // ─── Filtered endpoints ──────────────────────────────────────
  const filteredEndpoints = endpoints.filter(e => {
    if (filterType !== 'all' && e.endpointType !== filterType) return false;
    if (filterDirection !== 'all' && e.direction !== filterDirection) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return e.endpointName.toLowerCase().includes(q) || e.endpointCode.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ─── Dialog helpers ──────────────────────────────────────────
  const openCreateDialog = () => {
    setEditMode(false);
    setForm({
      endpointName: '', endpointCode: '', description: '', endpointType: 'REST_API',
      direction: 'INBOUND', connectionConfig: { ...DEFAULT_CONFIGS.REST_API },
      mappingConfig: [{ source: '', target: '', transform: 'NONE' }],
      scheduleConfig: { type: 'manual', expression: '', interval: 60, timezone: 'UTC' },
      errorHandling: { onError: 'skip', maxRetries: 3, retryDelay: 1000 },
      moduleId: '', isActive: true,
    });
    setShowCreateDialog(true);
  };

  const openEditDialog = (ep: EndpointData) => {
    setEditMode(true);
    setSelectedEndpoint(ep);
    const connConfig = JSON.parse(ep.connectionConfig || '{}');
    const mapConfig = ep.mappingConfig ? JSON.parse(ep.mappingConfig) : {};
    const schedConfig = ep.scheduleConfig ? JSON.parse(ep.scheduleConfig) : {};
    const errConfig = ep.errorHandling ? JSON.parse(ep.errorHandling) : {};
    setForm({
      endpointName: ep.endpointName,
      endpointCode: ep.endpointCode,
      description: ep.description || '',
      endpointType: ep.endpointType,
      direction: ep.direction,
      connectionConfig: connConfig,
      mappingConfig: mapConfig.fieldMappings || [{ source: '', target: '', transform: 'NONE' }],
      scheduleConfig: { type: schedConfig.type || 'manual', expression: schedConfig.expression || '', interval: schedConfig.interval || 60, timezone: schedConfig.timezone || 'UTC' },
      errorHandling: { onError: errConfig.onError || 'skip', maxRetries: errConfig.maxRetries || 3, retryDelay: errConfig.retryDelay || 1000 },
      moduleId: ep.moduleId || '',
      isActive: ep.isActive,
    });
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    if (!token) return;
    if (!form.endpointName.trim() || !form.endpointCode.trim()) {
      toast.error('Name and Code are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        endpointName: form.endpointName.trim(),
        endpointCode: form.endpointCode.trim(),
        description: form.description.trim() || null,
        endpointType: form.endpointType,
        direction: form.direction,
        connectionConfig: form.connectionConfig,
        mappingConfig: { fieldMappings: form.mappingConfig.filter(m => m.source && m.target), primaryKey: '', conflictResolution: 'LATEST_WINS' },
        scheduleConfig: form.scheduleConfig,
        errorHandling: form.errorHandling,
        moduleId: form.moduleId || null,
        isActive: form.isActive,
      };

      if (editMode && selectedEndpoint) {
        const res = await fetch(`/api/data-exchange/${selectedEndpoint.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success('Endpoint updated');
          setShowCreateDialog(false);
          loadEndpoints();
        } else {
          const data = await res.json();
          toast.error(data.error || 'Failed to update');
        }
      } else {
        const res = await fetch('/api/data-exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success('Endpoint created');
          setShowCreateDialog(false);
          loadEndpoints();
        } else {
          const data = await res.json();
          toast.error(data.error || 'Failed to create');
        }
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteEndpointId) return;
    try {
      const res = await fetch(`/api/data-exchange/${deleteEndpointId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Endpoint deleted');
        if (selectedEndpoint?.id === deleteEndpointId) setSelectedEndpoint(null);
        loadEndpoints();
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setShowDeleteDialog(false);
      setDeleteEndpointId(null);
    }
  };

  const handleToggleActive = async (ep: EndpointData) => {
    if (!token) return;
    try {
      const res = await fetch('/api/data-exchange', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpointId: ep.id, action: 'toggleActive' }),
      });
      if (res.ok) {
        toast.success(ep.isActive ? 'Endpoint disabled' : 'Endpoint enabled');
        loadEndpoints();
      } else {
        toast.error('Failed to update');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleTestConnection = async (ep: EndpointData) => {
    if (!token) return;
    setTesting(ep.id);
    try {
      const res = await fetch('/api/data-exchange', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpointId: ep.id, action: 'testConnection' }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.result.success) {
          toast.success(data.result.message);
        } else {
          toast.error(data.result.message);
        }
      } else {
        toast.error('Test failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setTesting(null);
    }
  };

  const handleTriggerRun = async (ep: EndpointData) => {
    if (!token) return;
    setTriggering(ep.id);
    try {
      const res = await fetch('/api/data-exchange', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpointId: ep.id, action: 'triggerRun' }),
      });
      if (res.ok) {
        toast.success('Sync triggered');
        setTimeout(loadEndpoints, 3000);
      } else {
        toast.error('Failed to trigger');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setTriggering(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // ─── Helper ──────────────────────────────────────────────────
  const getTypeInfo = (type: string) => ENDPOINT_TYPES.find(t => t.value === type) || ENDPOINT_TYPES[0];
  const getDirectionInfo = (dir: string) => DIRECTION_OPTIONS.find(d => d.value === dir) || DIRECTION_OPTIONS[0];

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      case 'FAILED': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      case 'PARTIAL': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      case 'RUNNING': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'FAILED': return <XCircle className="w-3.5 h-3.5" />;
      case 'PARTIAL': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'RUNNING': return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cable className="w-6 h-6 text-red-600" />
            Data Exchange
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage integration endpoints, data mappings, and sync schedules — aligned with Stibo IEP best practices
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="w-4 h-4" /> New Endpoint
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Endpoints', value: endpoints.length, icon: Cable, color: 'text-red-600' },
          { label: 'Active', value: endpoints.filter(e => e.isActive).length, icon: Wifi, color: 'text-green-600' },
          { label: 'Inbound', value: endpoints.filter(e => e.direction === 'INBOUND').length, icon: ArrowDownToLine, color: 'text-blue-600' },
          { label: 'Outbound', value: endpoints.filter(e => e.direction === 'OUTBOUND').length, icon: ArrowUpFromLine, color: 'text-amber-600' },
        ].map((stat) => (
          <Card key={stat.label} className="border-l-4 border-l-red-600/60">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={cn('w-8 h-8', stat.color)} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="endpoints" className="space-y-4">
        <TabsList>
          <TabsTrigger value="endpoints">Integration Endpoints</TabsTrigger>
          <TabsTrigger value="logs">Run History</TabsTrigger>
          <TabsTrigger value="daas">Data as a Service</TabsTrigger>
        </TabsList>

        {/* ─── Endpoints Tab ──────────────────────────────────────── */}
        <TabsContent value="endpoints" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search endpoints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ENDPOINT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDirection} onValueChange={setFilterDirection}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Direction" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                {DIRECTION_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Endpoint List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : filteredEndpoints.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Cable className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No endpoints found</p>
                {canManage && <Button onClick={openCreateDialog} variant="outline" className="mt-4 gap-2"><Plus className="w-4 h-4" /> Create Endpoint</Button>}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredEndpoints.map((ep) => {
                  const typeInfo = getTypeInfo(ep.endpointType);
                  const dirInfo = getDirectionInfo(ep.direction);
                  const TypeIcon = typeInfo.icon;
                  const DirIcon = dirInfo.icon;

                  return (
                    <motion.div
                      key={ep.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className={cn(
                        'transition-all hover:shadow-md cursor-pointer border-l-4',
                        ep.isActive ? 'border-l-green-500' : 'border-l-gray-300',
                        selectedEndpoint?.id === ep.id ? 'ring-2 ring-red-500/30' : '',
                      )} onClick={() => setSelectedEndpoint(ep)}>
                        <CardContent className="p-4 md:p-5">
                          <div className="flex flex-col md:flex-row md:items-center gap-4">
                            {/* Icon + Info */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', typeInfo.color)}>
                                <TypeIcon className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold truncate">{ep.endpointName}</h3>
                                  <Badge variant="outline" className="text-[10px] font-mono">{ep.endpointCode}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{ep.description || 'No description'}</p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <Badge className={cn('text-[10px] gap-1', typeInfo.color)}>
                                    <TypeIcon className="w-3 h-3" /> {typeInfo.label}
                                  </Badge>
                                  <Badge className={cn('text-[10px] gap-1', dirInfo.color)}>
                                    <DirIcon className="w-3 h-3" /> {dirInfo.label}
                                  </Badge>
                                  {ep.module && (
                                    <Badge variant="outline" className="text-[10px]">{ep.module.moduleName}</Badge>
                                  )}
                                  {!ep.isActive && (
                                    <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status */}
                            <div className="flex items-center gap-2">
                              {ep.lastRunStatus && (
                                <Badge className={cn('text-[10px] gap-1', getStatusColor(ep.lastRunStatus))}>
                                  {getStatusIcon(ep.lastRunStatus)}
                                  {ep.lastRunStatus}
                                </Badge>
                              )}
                              {ep.lastRunAt && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(ep.lastRunAt).toLocaleString()}
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTestConnection(ep)} disabled={testing === ep.id}>
                                      {testing === ep.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Test Connection</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTriggerRun(ep)} disabled={triggering === ep.id || !ep.isActive}>
                                      {triggering === ep.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Trigger Sync</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {canManage && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(ep)}>
                                        {ep.isActive ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{ep.isActive ? 'Disable' : 'Enable'}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {canManage && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(ep)}>
                                        <Settings className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {canManage && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setDeleteEndpointId(ep.id); setShowDeleteDialog(true); }}>
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>

                          {/* Expandable Details */}
                          {selectedEndpoint?.id === ep.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-4 pt-4 border-t"
                            >
                              <EndpointDetail ep={ep} onEdit={() => openEditDialog(ep)} />
                            </motion.div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        {/* ─── Run History Tab ─────────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5" /> Run History
              </CardTitle>
              <CardDescription>Recent synchronization runs across all endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
              ) : (() => {
                const allLogs = endpoints.flatMap(ep =>
                  (ep.runLogs || []).map(log => ({ ...log, endpointName: ep.endpointName, endpointType: ep.endpointType }))
                ).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

                if (allLogs.length === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-8">No run logs yet. Trigger a sync to see results here.</p>;
                }

                return (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-2">
                      {allLogs.map(log => (
                        <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                          <Badge className={cn('text-[10px] gap-1 shrink-0', getStatusColor(log.runStatus))}>
                            {getStatusIcon(log.runStatus)} {log.runStatus}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{log.endpointName}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(log.startedAt).toLocaleString()}
                              {log.completedAt && ` → ${new Date(log.completedAt).toLocaleTimeString()}`}
                            </p>
                          </div>
                          <div className="text-right text-xs shrink-0">
                            <p className="text-green-700 dark:text-green-400">{log.recordsSuccess} success</p>
                            {log.recordsFailed > 0 && <p className="text-red-700 dark:text-red-400">{log.recordsFailed} failed</p>}
                            <p className="text-muted-foreground">{log.recordsProcessed} total</p>
                          </div>
                          {log.errorDetail && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">{log.errorDetail}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── DaaS Tab ────────────────────────────────────────────── */}
        <TabsContent value="daas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5" /> Data as a Service (DaaS)
              </CardTitle>
              <CardDescription>
                REST API endpoints exposing master data for downstream consumers, aligned with Stibo DaaS architecture
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {DAAS_ENDPOINTS.map((ep, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                    <Badge className={cn(
                      'text-[10px] font-mono shrink-0',
                      ep.method === 'GET' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                      ep.method === 'POST' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    )}>
                      {ep.method}
                    </Badge>
                    <code className="text-sm font-mono flex-1 truncate">{ep.path}</code>
                    <span className="text-xs text-muted-foreground hidden sm:block">{ep.description}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{ep.auth}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(ep.path)}>
                      {copiedPath === ep.path ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">API Base URL</h4>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono bg-background px-3 py-1.5 rounded border flex-1">https://mdm.mapi.co.id/api/v1</code>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => copyToClipboard('https://mdm.mapi.co.id/api/v1')}>
                    {copiedPath === 'https://mdm.mapi.co.id/api/v1' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Authentication: Include your API key in the <code className="font-mono bg-background px-1 rounded">Authorization: Bearer {'<key>'}</code> header.
                  All endpoints support pagination via <code className="font-mono bg-background px-1 rounded">?page=1&limit=50</code> parameters.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Create/Edit Dialog ─────────────────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cable className="w-5 h-5" />
              {editMode ? 'Edit Endpoint' : 'Create Integration Endpoint'}
            </DialogTitle>
            <DialogDescription>
              Configure an integration endpoint following Stibo IEP (Integration Endpoint) best practices
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Endpoint Name *</Label>
                <Input value={form.endpointName} onChange={(e) => setForm({ ...form, endpointName: e.target.value })} placeholder="e.g. SAP ERP Product Sync" />
              </div>
              <div className="space-y-2">
                <Label>Endpoint Code *</Label>
                <Input value={form.endpointCode} onChange={(e) => setForm({ ...form, endpointCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="e.g. SAP-ERP-PRODUCT" disabled={editMode} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.endpointType} onValueChange={(v) => setForm({ ...form, endpointType: v, connectionConfig: { ...DEFAULT_CONFIGS[v] } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENDPOINT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the purpose of this integration endpoint..." rows={2} />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label>Active</Label>
              </div>
            </div>

            <Separator />

            {/* Connection Configuration */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Server className="w-4 h-4" /> Connection Configuration
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/30 rounded-lg p-4">
                {Object.keys(form.connectionConfig).map(key => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</Label>
                    {key.toLowerCase().includes('header') || key.toLowerCase().includes('query') || key === 'soapAction' ? (
                      <Textarea
                        value={form.connectionConfig[key] || ''}
                        onChange={(e) => setForm({ ...form, connectionConfig: { ...form.connectionConfig, [key]: e.target.value } })}
                        rows={2}
                        className="font-mono text-xs"
                      />
                    ) : (
                      <Input
                        value={form.connectionConfig[key] || ''}
                        onChange={(e) => setForm({ ...form, connectionConfig: { ...form.connectionConfig, [key]: e.target.value } })}
                        className="font-mono text-xs"
                        type={key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') ? 'password' : 'text'}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Field Mapping */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4" /> Field Mapping (Source → Target)
              </h3>
              <div className="space-y-2">
                {form.mappingConfig.map((mapping, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="Source field"
                      value={mapping.source}
                      onChange={(e) => {
                        const updated = [...form.mappingConfig];
                        updated[idx] = { ...updated[idx], source: e.target.value };
                        setForm({ ...form, mappingConfig: updated });
                      }}
                      className="flex-1 font-mono text-xs"
                    />
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Target field"
                      value={mapping.target}
                      onChange={(e) => {
                        const updated = [...form.mappingConfig];
                        updated[idx] = { ...updated[idx], target: e.target.value };
                        setForm({ ...form, mappingConfig: updated });
                      }}
                      className="flex-1 font-mono text-xs"
                    />
                    <Select
                      value={mapping.transform}
                      onValueChange={(v) => {
                        const updated = [...form.mappingConfig];
                        updated[idx] = { ...updated[idx], transform: v };
                        setForm({ ...form, mappingConfig: updated });
                      }}
                    >
                      <SelectTrigger className="w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSFORM_OPTIONS.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                      setForm({ ...form, mappingConfig: form.mappingConfig.filter((_, i) => i !== idx) });
                    }} disabled={form.mappingConfig.length <= 1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                  setForm({ ...form, mappingConfig: [...form.mappingConfig, { source: '', target: '', transform: 'NONE' }] });
                }}>
                  <Plus className="w-3.5 h-3.5" /> Add Mapping
                </Button>
              </div>
            </div>

            <Separator />

            {/* Schedule Configuration */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Schedule Configuration
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/30 rounded-lg p-4">
                <div className="space-y-1">
                  <Label className="text-xs">Schedule Type</Label>
                  <Select value={form.scheduleConfig.type} onValueChange={(v) => setForm({ ...form, scheduleConfig: { ...form.scheduleConfig, type: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Trigger</SelectItem>
                      <SelectItem value="interval">Interval</SelectItem>
                      <SelectItem value="cron">Cron Expression</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.scheduleConfig.type === 'interval' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Interval (seconds)</Label>
                    <Input type="number" value={form.scheduleConfig.interval} onChange={(e) => setForm({ ...form, scheduleConfig: { ...form.scheduleConfig, interval: parseInt(e.target.value) || 60 } })} />
                  </div>
                )}
                {form.scheduleConfig.type === 'cron' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Cron Expression</Label>
                    <Input value={form.scheduleConfig.expression} onChange={(e) => setForm({ ...form, scheduleConfig: { ...form.scheduleConfig, expression: e.target.value } })} placeholder="0 */6 * * *" className="font-mono" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Timezone</Label>
                  <Select value={form.scheduleConfig.timezone} onValueChange={(v) => setForm({ ...form, scheduleConfig: { ...form.scheduleConfig, timezone: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="Asia/Jakarta">Asia/Jakarta (WIB)</SelectItem>
                      <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Error Handling */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Error Handling
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-muted/30 rounded-lg p-4">
                <div className="space-y-1">
                  <Label className="text-xs">On Error</Label>
                  <Select value={form.errorHandling.onError} onValueChange={(v) => setForm({ ...form, errorHandling: { ...form.errorHandling, onError: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip & Continue</SelectItem>
                      <SelectItem value="stop">Stop Processing</SelectItem>
                      <SelectItem value="log">Log & Continue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Retries</Label>
                  <Input type="number" min={0} max={10} value={form.errorHandling.maxRetries} onChange={(e) => setForm({ ...form, errorHandling: { ...form.errorHandling, maxRetries: parseInt(e.target.value) || 0 } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Retry Delay (ms)</Label>
                  <Input type="number" min={100} value={form.errorHandling.retryDelay} onChange={(e) => setForm({ ...form, errorHandling: { ...form.errorHandling, retryDelay: parseInt(e.target.value) || 1000 } })} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editMode ? 'Update Endpoint' : 'Create Endpoint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─────────────────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this integration endpoint and all associated run logs. This action cannot be undone.
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

// ─── Endpoint Detail Sub-Component ─────────────────────────────

function EndpointDetail({ ep, onEdit }: { ep: EndpointData; onEdit: () => void }) {
  const connectionConfig = JSON.parse(ep.connectionConfig || '{}');
  const mappingConfig = ep.mappingConfig ? JSON.parse(ep.mappingConfig) : null;
  const scheduleConfig = ep.scheduleConfig ? JSON.parse(ep.scheduleConfig) : null;
  const errorHandling = ep.errorHandling ? JSON.parse(ep.errorHandling) : null;

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      case 'FAILED': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      case 'PARTIAL': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      case 'RUNNING': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Connection */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Connection</h4>
        <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
          {Object.entries(connectionConfig).map(([key, value]) => (
            <div key={key} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-mono truncate max-w-[200px]">
                {(key.toLowerCase().includes('token') || key.toLowerCase().includes('password') || key.toLowerCase().includes('secret'))
                  ? '••••••••'
                  : String(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Schedule</h4>
        <div className="bg-muted/30 rounded-lg p-3">
          {scheduleConfig ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-medium">{scheduleConfig.type === 'manual' ? 'Manual Trigger' : scheduleConfig.type === 'interval' ? `Every ${scheduleConfig.interval}s` : 'Cron'}</span>
              </div>
              {scheduleConfig.type === 'cron' && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Expression:</span>
                  <code className="font-mono">{scheduleConfig.expression}</code>
                </div>
              )}
              {scheduleConfig.timezone && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Timezone:</span>
                  <span>{scheduleConfig.timezone}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No schedule configured</p>
          )}
        </div>
      </div>

      {/* Field Mappings */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Field Mappings</h4>
        <div className="bg-muted/30 rounded-lg p-3 space-y-1">
          {mappingConfig?.fieldMappings?.length > 0 ? (
            mappingConfig.fieldMappings.map((m: FieldMapping, i: number) => (
              <div key={i} className="flex items-center gap-1 text-xs">
                <code className="font-mono bg-background px-1 rounded">{m.source}</code>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <code className="font-mono bg-background px-1 rounded">{m.target}</code>
                {m.transform && m.transform !== 'NONE' && (
                  <Badge variant="outline" className="text-[9px] ml-1">{m.transform}</Badge>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No field mappings configured</p>
          )}
        </div>
      </div>

      {/* Error Handling */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Error Handling</h4>
        <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
          {errorHandling ? (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">On Error:</span>
                <span className="font-medium capitalize">{errorHandling.onError}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Max Retries:</span>
                <span>{errorHandling.maxRetries}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Retry Delay:</span>
                <span>{errorHandling.retryDelay}ms</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Default error handling</p>
          )}
        </div>
      </div>

      {/* Run Logs (latest 5) */}
      {ep.runLogs && ep.runLogs.length > 0 && (
        <div className="md:col-span-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Runs</h4>
          <div className="space-y-1.5">
            {ep.runLogs.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-center gap-3 p-2 rounded bg-muted/20 text-xs">
                <Badge className={cn('text-[9px]', getStatusColor(log.runStatus))}>{log.runStatus}</Badge>
                <span>{new Date(log.startedAt).toLocaleString()}</span>
                <span className="ml-auto text-muted-foreground">{log.recordsSuccess}/{log.recordsProcessed} ok</span>
                {log.recordsFailed > 0 && <span className="text-red-600 dark:text-red-400">{log.recordsFailed} failed</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="md:col-span-2">
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
          <Settings className="w-3.5 h-3.5" /> Edit Configuration
        </Button>
      </div>
    </div>
  );
}
