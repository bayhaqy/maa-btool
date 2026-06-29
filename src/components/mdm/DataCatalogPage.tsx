'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  BookOpen, Search, FolderTree, Database, Users, Package,
  ChevronRight, ChevronDown, FileText, Clock, TrendingUp,
  BarChart3, ArrowRight, Layers, Tag, Globe, GitBranch,
  RefreshCw, ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataAsset {
  id: string;
  moduleCode: string;
  moduleName: string;
  domain: string;
  type: 'module' | 'hierarchy' | 'lookup' | 'workflow';
  description: string | null;
  owner: {
    id: string;
    username: string;
    displayName: string | null;
    email: string;
  } | null;
  lastUpdated: string;
  qualityScore: number;
  recordCount: number;
  fieldCount: number;
  requiredFieldCount: number;
  businessRuleCount: number;
  statusDistribution: Record<string, number>;
  fieldTypeDistribution: Record<string, number>;
  requireApproval: boolean;
  tags: string[];
}

interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
  count?: number;
}

interface LineageEntry {
  source: string;
  target: string;
  records: number;
  status: 'synced' | 'pending' | 'error';
  lastSync?: string;
}

// ---------------------------------------------------------------------------
// Tree Node Component
// ---------------------------------------------------------------------------

function TreeNode({ node, depth = 0, onSelect }: { node: TaxonomyNode; depth?: number; onSelect?: (node: TaxonomyNode) => void }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          else onSelect?.(node);
        }}
        className={cn(
          'w-full flex items-center gap-2 py-1.5 px-2 rounded-md text-sm hover:bg-accent/50 transition-colors text-left',
          depth > 0 && 'ml-4'
        )}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        {hasChildren ? (
          <FolderTree className="w-4 h-4 text-amber-500 shrink-0" />
        ) : (
          <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium truncate">{node.label}</span>
        {node.count !== undefined && (
          <Badge variant="secondary" className="text-[10px] ml-auto h-5 px-1.5">{node.count}</Badge>
        )}
      </button>
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children!.map(child => (
              <TreeNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lineage Dialog Component
// ---------------------------------------------------------------------------

function LineageDialog({ open, onOpenChange, asset }: { open: boolean; onOpenChange: (open: boolean) => void; asset: DataAsset | null }) {
  if (!asset) return null;

  // Build lineage entries based on module
  const lineageEntries: LineageEntry[] = [
    { source: 'SAP ERP', target: asset.moduleName, records: asset.recordCount, status: 'synced', lastSync: asset.lastUpdated },
    { source: 'POS System', target: asset.moduleName, records: Math.round(asset.recordCount * 0.6), status: asset.recordCount > 0 ? 'synced' : 'pending' },
    { source: 'Manual Entry', target: asset.moduleName, records: Math.round(asset.recordCount * 0.1), status: 'pending' },
  ];

  const downstreamTargets = [
    { target: 'MAP Club App', records: Math.round(asset.recordCount * 0.4), status: asset.recordCount > 0 ? 'synced' : 'pending' },
    { target: 'E-Commerce Platform', records: Math.round(asset.recordCount * 0.3), status: 'pending' },
    { target: 'Analytics Dashboard', records: asset.recordCount, status: 'synced' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Data Lineage: {asset.moduleName}
          </DialogTitle>
          <DialogDescription>
            Source systems and downstream consumers for this data asset.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1">
          <div className="space-y-6">
            {/* Upstream Sources */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                Upstream Sources
              </h3>
              <div className="space-y-2">
                {lineageEntries.map((lineage, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{lineage.source}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ArrowRight className="w-3 h-3" />
                        <span>{lineage.target}</span>
                        <span className="ml-auto">{lineage.records} records</span>
                      </div>
                    </div>
                    <Badge className={cn(
                      'text-[10px] border-0 shrink-0',
                      lineage.status === 'synced' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      lineage.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    )}>
                      {lineage.status}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Current Asset */}
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="h-px flex-1 bg-border" />
              <div className="rounded-lg border bg-muted/50 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-red-600" />
                  <span className="font-semibold text-sm">{asset.moduleName}</span>
                  <Badge variant="outline" className="text-[10px]">{asset.moduleCode}</Badge>
                </div>
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Downstream Consumers */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                Downstream Consumers
              </h3>
              <div className="space-y-2">
                {downstreamTargets.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{entry.target}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{entry.records} records</span>
                      </div>
                    </div>
                    <Badge className={cn(
                      'text-[10px] border-0 shrink-0',
                      entry.status === 'synced' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      entry.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    )}>
                      {entry.status}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DataCatalogPage() {
  const { token } = useAppStore();
  const navigate = useAppStore((s) => s.navigate);

  const [activeTab, setActiveTab] = useState('assets');
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');
  const [selectedAsset, setSelectedAsset] = useState<DataAsset | null>(null);
  const [lineageAsset, setLineageAsset] = useState<DataAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [assets, setAssets] = useState<DataAsset[]>([]);
  const [taxonomyTree, setTaxonomyTree] = useState<TaxonomyNode[]>([]);

  // Fetch data from API
  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/data-catalog', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const apiAssets: DataAsset[] = (data.assets || []).map((a: any) => ({
          ...a,
          type: 'module' as const,
          tags: extractTags(a),
        }));
        setAssets(apiAssets);
        setAvailableDomains(data.availableDomains || []);

        // Build taxonomy from domain groups
        if (data.domains) {
          const tree: TaxonomyNode[] = Object.entries(data.domains as Record<string, any[]>).map(([domain, domainAssets]) => ({
            id: `domain-${domain.toLowerCase()}`,
            label: `${domain} Data`,
            count: domainAssets.reduce((sum: number, a: any) => sum + a.recordCount, 0),
            children: domainAssets.map((a: any) => ({
              id: a.id,
              label: a.moduleName,
              count: a.recordCount,
            })),
          }));
          setTaxonomyTree(tree);
        }
      } else {
        toast.error(data.error || 'Failed to load data catalog');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract tags from asset data
  function extractTags(a: any): string[] {
    const tags: string[] = [];
    if (a.moduleCode) tags.push(a.moduleCode.toLowerCase());
    if (a.domain) tags.push(a.domain.toLowerCase());
    if (a.requireApproval) tags.push('approval-required');
    if (a.fieldTypeDistribution) {
      Object.keys(a.fieldTypeDistribution).forEach(k => {
        if (['EMAIL', 'NUMBER', 'URL'].includes(k)) tags.push(k.toLowerCase());
      });
    }
    return [...new Set(tags)].slice(0, 5);
  }

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesSearch = !searchQuery ||
        asset.moduleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (asset.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.moduleCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesDomain = domainFilter === 'All' || asset.domain === domainFilter;
      return matchesSearch && matchesDomain;
    });
  }, [searchQuery, domainFilter, assets]);

  const typeIcons: Record<string, React.ElementType> = {
    module: Database,
    hierarchy: FolderTree,
    lookup: Tag,
    workflow: Layers,
  };

  const domainColorMap: Record<string, string> = {
    Product: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    Location: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    Customer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    Supplier: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    Partner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    Asset: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    Commerce: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    Marketing: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    Other: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
    Reference: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  };

  const domainFilters = ['All', ...availableDomains];

  const handleViewRecords = (asset: DataAsset) => {
    setSelectedAsset(null);
    navigate('data-records', { moduleId: asset.id });
  };

  const handleViewLineage = (asset: DataAsset) => {
    setSelectedAsset(null);
    setLineageAsset(asset);
  };

  const handleTaxonomySelect = (node: TaxonomyNode) => {
    // Find the matching asset
    const match = assets.find(a => a.id === node.id);
    if (match) {
      setSelectedAsset(match);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Catalog</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse, search, and explore all data assets across your MDM domains.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs">
            <Database className="w-3.5 h-3.5" />
            {assets.length} Assets
          </Badge>
          <Button variant="outline" size="sm" className="gap-1" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets by name, description, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {domainFilters.map((domain) => (
            <Button
              key={domain}
              variant={domainFilter === domain ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 text-xs',
                domainFilter === domain && 'bg-red-600 hover:bg-red-700 text-white'
              )}
              onClick={() => setDomainFilter(domain)}
            >
              {domain}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="assets" className="gap-1.5">
            <Database className="w-4 h-4 hidden sm:block" />
            Assets
          </TabsTrigger>
          <TabsTrigger value="taxonomy" className="gap-1.5">
            <FolderTree className="w-4 h-4 hidden sm:block" />
            Taxonomy
          </TabsTrigger>
        </TabsList>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAssets.map((asset, i) => {
              const TypeIcon = typeIcons[asset.type];
              return (
                <motion.div
                  key={asset.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setSelectedAsset(asset)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', 'bg-muted')}>
                            <TypeIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <CardTitle className="text-sm group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">{asset.moduleName}</CardTitle>
                            <Badge className={cn('text-[10px] border-0 mt-0.5', domainColorMap[asset.domain] || 'bg-muted')}>{asset.domain}</Badge>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{asset.description || `${asset.moduleName} data module`}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{asset.recordCount} records</span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          <span className={cn('font-medium', asset.qualityScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                            {asset.qualityScore}%
                          </span>
                        </span>
                        <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{asset.fieldCount} fields</span>
                      </div>
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {asset.tags.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-1.5">{tag}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
            {filteredAssets.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Search className="w-12 h-12 mb-4 opacity-30" />
                <p className="font-medium">No assets found</p>
                <p className="text-sm">Try adjusting your search or filter criteria</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Taxonomy Tab */}
        <TabsContent value="taxonomy">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Classification & Taxonomy Tree</CardTitle>
                <CardDescription>Hierarchical data classification organized by domain and category.</CardDescription>
              </CardHeader>
              <CardContent>
                {taxonomyTree.length === 0 ? (
                  <div className="py-8 text-center">
                    <FolderTree className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No taxonomy data available</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-0.5">
                      {taxonomyTree.map(node => (
                        <TreeNode key={node.id} node={node} onSelect={handleTaxonomySelect} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Data Lineage</CardTitle>
                <CardDescription>Source systems and data flow mapping.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {assets.slice(0, 5).map((asset, i) => {
                  const sourceSystems = ['SAP ERP', 'POS System', 'Vendor Portal', 'SAP Pricing', 'MAP Club App'];
                  const source = sourceSystems[i % sourceSystems.length];
                  const statuses: ('synced' | 'pending' | 'error')[] = ['synced', 'synced', 'pending', 'synced', 'error'];
                  const status = statuses[i % statuses.length];

                  return (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => setLineageAsset(asset)}
                    >
                      <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{source}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <ArrowRight className="w-3 h-3" />
                          <span>{asset.moduleName}</span>
                          <span className="ml-auto">{asset.recordCount} records</span>
                        </div>
                      </div>
                      <Badge className={cn(
                        'text-[10px] border-0 shrink-0',
                        status === 'synced' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                        'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      )}>
                        {status}
                      </Badge>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Asset Detail Dialog */}
      <Dialog open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAsset && (() => {
                const Icon = typeIcons[selectedAsset.type];
                return <Icon className="w-5 h-5 text-muted-foreground" />;
              })()}
              {selectedAsset?.moduleName}
            </DialogTitle>
            <DialogDescription>{selectedAsset?.description}</DialogDescription>
          </DialogHeader>
          {selectedAsset && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Module ID:</span> <span className="font-mono">{selectedAsset.id.slice(0, 12)}...</span></div>
                <div><span className="text-muted-foreground">Code:</span> <span className="font-mono">{selectedAsset.moduleCode}</span></div>
                <div><span className="text-muted-foreground">Domain:</span> <Badge className={cn('border-0', domainColorMap[selectedAsset.domain] || 'bg-muted')}>{selectedAsset.domain}</Badge></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{selectedAsset.type}</span></div>
                <div><span className="text-muted-foreground">Owner:</span> <span>{selectedAsset.owner?.displayName || selectedAsset.owner?.username || 'Unassigned'}</span></div>
                <div><span className="text-muted-foreground">Records:</span> <span className="font-medium">{selectedAsset.recordCount}</span></div>
                <div><span className="text-muted-foreground">Quality:</span> <span className={cn('font-bold', selectedAsset.qualityScore >= 80 ? 'text-emerald-600' : 'text-amber-600')}>{selectedAsset.qualityScore}%</span></div>
                <div><span className="text-muted-foreground">Fields:</span> <span>{selectedAsset.fieldCount} ({selectedAsset.requiredFieldCount} required)</span></div>
                <div><span className="text-muted-foreground">Last Updated:</span> <span>{new Date(selectedAsset.lastUpdated).toLocaleDateString()}</span></div>
                <div><span className="text-muted-foreground">Rules:</span> <span>{selectedAsset.businessRuleCount} active</span></div>
              </div>
              {/* Status Distribution */}
              {Object.keys(selectedAsset.statusDistribution).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Record Status Distribution</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {Object.entries(selectedAsset.statusDistribution).map(([status, count]) => (
                      <Badge key={status} variant="outline" className="text-[10px]">{status}: {count}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {selectedAsset.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                <Button className="bg-red-600 hover:bg-red-700 text-white gap-1" onClick={() => handleViewRecords(selectedAsset)}>
                  <ExternalLink className="w-4 h-4" /> View Records
                </Button>
                <Button variant="outline" className="gap-1" onClick={() => handleViewLineage(selectedAsset)}>
                  <GitBranch className="w-4 h-4" /> View Lineage
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lineage Dialog */}
      <LineageDialog open={!!lineageAsset} onOpenChange={(open) => { if (!open) setLineageAsset(null); }} asset={lineageAsset} />
    </div>
  );
}
