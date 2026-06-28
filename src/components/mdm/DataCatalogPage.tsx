'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  BookOpen, Search, FolderTree, Database, Users, Package,
  ChevronRight, ChevronDown, FileText, Clock, TrendingUp,
  BarChart3, ArrowRight, Layers, Tag, Globe,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types & Mock Data
// ---------------------------------------------------------------------------

interface DataAsset {
  id: string;
  name: string;
  domain: string;
  type: 'module' | 'hierarchy' | 'lookup' | 'workflow';
  description: string;
  owner: string;
  lastUpdated: string;
  qualityScore: number;
  recordCount: number;
  tags: string[];
}

interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
  count?: number;
}

const dataAssets: DataAsset[] = [
  { id: 'DA-001', name: 'Article Master', domain: 'Product', type: 'module', description: 'Core product article definitions with SKUs, pricing, and categorization', owner: 'Dewi Sartika', lastUpdated: '2025-01-15', qualityScore: 87, recordCount: 65, tags: ['footwear', 'apparel', 'accessories'] },
  { id: 'DA-002', name: 'Store Master', domain: 'Location', type: 'module', description: 'Physical store locations with address, status, and regional data', owner: 'Budi Santoso', lastUpdated: '2025-01-14', qualityScore: 72, recordCount: 20, tags: ['retail', 'indonesia', 'physical'] },
  { id: 'DA-003', name: 'Supplier Master', domain: 'Partner', type: 'module', description: 'Vendor and supplier profiles with contact and tax information', owner: 'Rina Wati', lastUpdated: '2025-01-13', qualityScore: 81, recordCount: 12, tags: ['vendor', 'procurement'] },
  { id: 'DA-004', name: 'Pricing Master', domain: 'Commerce', type: 'module', description: 'Product pricing with regular, wholesale, cost, and promotional tiers', owner: 'Andi Pratama', lastUpdated: '2025-01-12', qualityScore: 90, recordCount: 20, tags: ['pricing', 'idr', 'wholesale'] },
  { id: 'DA-005', name: 'Promotion Master', domain: 'Marketing', type: 'module', description: 'Active and historical promotional campaigns and offers', owner: 'Unassigned', lastUpdated: '2025-01-10', qualityScore: 65, recordCount: 12, tags: ['campaign', 'discount', 'map-club'] },
  { id: 'DA-006', name: 'Product Category Tree', domain: 'Product', type: 'hierarchy', description: 'Hierarchical product taxonomy from category to sub-category', owner: 'Dewi Sartika', lastUpdated: '2025-01-08', qualityScore: 95, recordCount: 33, tags: ['taxonomy', 'classification'] },
  { id: 'DA-007', name: 'Brand Registry', domain: 'Product', type: 'lookup', description: 'Authorized brand list with mapping to supplier sources', owner: 'Rina Wati', lastUpdated: '2025-01-07', qualityScore: 88, recordCount: 16, tags: ['brand', 'nike', 'adidas'] },
  { id: 'DA-008', name: 'Region Hierarchy', domain: 'Location', type: 'hierarchy', description: 'Geographic organization: country → province → city → district', owner: 'Budi Santoso', lastUpdated: '2025-01-05', qualityScore: 82, recordCount: 45, tags: ['geo', 'indonesia', 'hierarchy'] },
];

const taxonomyTree: TaxonomyNode[] = [
  {
    id: 'root-1', label: 'Product Data', children: [
      { id: 'cat-1', label: 'Footwear', count: 38, children: [
        { id: 'sub-1', label: 'Running Shoes', count: 12 },
        { id: 'sub-2', label: 'Basketball Shoes', count: 8 },
        { id: 'sub-3', label: 'Casual Sneakers', count: 10 },
        { id: 'sub-4', label: 'Sandals', count: 5 },
        { id: 'sub-5', label: 'Formal Shoes', count: 3 },
      ]},
      { id: 'cat-2', label: 'Apparel', count: 24, children: [
        { id: 'sub-6', label: 'T-Shirts', count: 8 },
        { id: 'sub-7', label: 'Hoodies', count: 5 },
        { id: 'sub-8', label: 'Jackets', count: 4 },
        { id: 'sub-9', label: 'Pants & Shorts', count: 7 },
      ]},
      { id: 'cat-3', label: 'Accessories', count: 18, children: [
        { id: 'sub-10', label: 'Bags', count: 6 },
        { id: 'sub-11', label: 'Hats & Socks', count: 8 },
        { id: 'sub-12', label: 'Watches & Sunglasses', count: 4 },
      ]},
    ]
  },
  {
    id: 'root-2', label: 'Location Data', children: [
      { id: 'cat-4', label: 'Store Locations', count: 20 },
      { id: 'cat-5', label: 'Warehouse Locations', count: 5 },
    ]
  },
  {
    id: 'root-3', label: 'Partner Data', children: [
      { id: 'cat-6', label: 'Suppliers', count: 12 },
      { id: 'cat-7', label: 'Distributors', count: 4 },
    ]
  },
  {
    id: 'root-4', label: 'Commerce Data', children: [
      { id: 'cat-8', label: 'Pricing', count: 20 },
      { id: 'cat-9', label: 'Promotions', count: 12 },
    ]
  },
];

const domainFilters = ['All', 'Product', 'Location', 'Partner', 'Commerce', 'Marketing'];

// ---------------------------------------------------------------------------
// Tree Node Component
// ---------------------------------------------------------------------------

function TreeNode({ node, depth = 0 }: { node: TaxonomyNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
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
              <TreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DataCatalogPage() {
  const [activeTab, setActiveTab] = useState('assets');
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');
  const [selectedAsset, setSelectedAsset] = useState<DataAsset | null>(null);

  const filteredAssets = useMemo(() => {
    return dataAssets.filter(asset => {
      const matchesSearch = !searchQuery ||
        asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesDomain = domainFilter === 'All' || asset.domain === domainFilter;
      return matchesSearch && matchesDomain;
    });
  }, [searchQuery, domainFilter]);

  const typeIcons: Record<string, React.ElementType> = {
    module: Database,
    hierarchy: FolderTree,
    lookup: Tag,
    workflow: Layers,
  };

  const domainColorMap: Record<string, string> = {
    Product: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    Location: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    Partner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    Commerce: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    Marketing: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  };

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
            {dataAssets.length} Assets
          </Badge>
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
                            <CardTitle className="text-sm group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">{asset.name}</CardTitle>
                            <Badge className={cn('text-[10px] border-0 mt-0.5', domainColorMap[asset.domain] || 'bg-muted')}>{asset.domain}</Badge>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{asset.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{asset.recordCount} records</span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          <span className={cn('font-medium', asset.qualityScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                            {asset.qualityScore}%
                          </span>
                        </span>
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
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-0.5">
                    {taxonomyTree.map(node => (
                      <TreeNode key={node.id} node={node} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Data Lineage</CardTitle>
                <CardDescription>Source systems and data flow mapping.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { source: 'SAP ERP', target: 'Article Master', records: 65, status: 'synced' },
                  { source: 'POS System', target: 'Store Master', records: 20, status: 'synced' },
                  { source: 'Vendor Portal', target: 'Supplier Master', records: 12, status: 'pending' },
                  { source: 'SAP Pricing', target: 'Pricing Master', records: 20, status: 'synced' },
                  { source: 'MAP Club App', target: 'Promotion Master', records: 12, status: 'error' },
                ].map((lineage, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-accent/30 transition-colors"
                  >
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{lineage.source}</p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
              {selectedAsset?.name}
            </DialogTitle>
            <DialogDescription>{selectedAsset?.description}</DialogDescription>
          </DialogHeader>
          {selectedAsset && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Asset ID:</span> <span className="font-mono">{selectedAsset.id}</span></div>
                <div><span className="text-muted-foreground">Domain:</span> <Badge className={cn('border-0', domainColorMap[selectedAsset.domain])}>{selectedAsset.domain}</Badge></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{selectedAsset.type}</span></div>
                <div><span className="text-muted-foreground">Owner:</span> <span>{selectedAsset.owner}</span></div>
                <div><span className="text-muted-foreground">Records:</span> <span className="font-medium">{selectedAsset.recordCount}</span></div>
                <div><span className="text-muted-foreground">Quality:</span> <span className={cn('font-bold', selectedAsset.qualityScore >= 80 ? 'text-emerald-600' : 'text-amber-600')}>{selectedAsset.qualityScore}%</span></div>
                <div><span className="text-muted-foreground">Last Updated:</span> <span>{selectedAsset.lastUpdated}</span></div>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedAsset.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                <Button className="bg-red-600 hover:bg-red-700 text-white">View Records</Button>
                <Button variant="outline">View Lineage</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
