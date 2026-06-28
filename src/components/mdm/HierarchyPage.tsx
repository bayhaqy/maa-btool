'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Network, Plus, MoreVertical, Pencil, Trash2, ArrowRight, ChevronRight,
  ChevronDown, Search, GripVertical, Eye, ChevronLeft,
  RefreshCw, Maximize2, Minimize2, Zap, FolderTree, Tag,
  ArrowUpDown, Copy, FolderOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Hierarchy {
  id: string;
  hierarchyName: string;
  description?: string;
  moduleId: string;
  nodeCount?: number;
  module?: { id: string; moduleCode: string; moduleName: string };
}

interface HierarchyNode {
  id: string;
  hierarchyId: string;
  parentNodeId: string | null;
  nodeLabel: string;
  recordId: string | null;
  materializedPath: string;
  depthLevel: number;
  sortOrder: number;
  status: string;
  description?: string;
  isActive: boolean;
  record?: { id: string; status: string; currentPayload: string } | null;
  children?: HierarchyNode[];
  _count?: { record?: number };
}

interface TreeNodeProps {
  node: HierarchyNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  searchQuery: string;
  onEdit: (node: HierarchyNode) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onReparent: (nodeId: string, newParentId: string | null) => void;
  dragNode: HierarchyNode | null;
  setDragNode: (node: HierarchyNode | null) => void;
}

function TreeNode({ node, depth, expanded, toggleExpand, searchQuery, onEdit, onDelete, onAddChild, onReparent, dragNode, setDragNode }: TreeNodeProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const matchesSearch = searchQuery && node.nodeLabel.toLowerCase().includes(searchQuery.toLowerCase());
  const isDragTarget = dragNode && dragNode.id !== node.id;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragNode && dragNode.id !== node.id) {
      onReparent(dragNode.id, node.id);
      setDragNode(null);
    }
  };

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-1.5 py-1.5 px-2 rounded-md transition-colors group',
          matchesSearch ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300' : 'hover:bg-muted/50',
          isDragTarget && 'ring-2 ring-primary ring-offset-1 bg-primary/5'
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        draggable
        onDragStart={() => setDragNode(node)}
        onDragEnd={() => setDragNode(null)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Expand/Collapse */}
        <button
          onClick={() => hasChildren && toggleExpand(node.id)}
          className="w-5 h-5 flex items-center justify-center shrink-0"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : (
            <span className="w-4 h-4" />
          )}
        </button>

        {/* Drag handle */}
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Node icon */}
        <FolderOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />

        {/* Label */}
        <span className={cn(
          'text-sm flex-1 truncate',
          matchesSearch && 'font-semibold text-amber-800 dark:text-amber-300'
        )}>
          {node.nodeLabel}
        </span>

        {/* Record count badge */}
        {hasChildren && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
            {node.children!.length}
          </Badge>
        )}

        {/* Record indicator */}
        {node.recordId && (
          <Badge className="text-[8px] px-1 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200 border shrink-0">
            <Eye className="w-2.5 h-2.5 mr-0.5" /> Linked
          </Badge>
        )}

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onAddChild(node.id)}>
              <Plus className="w-3.5 h-3.5 mr-2" /> Add Child
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(node)}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(node.id)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
          >
            {node.children!.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggleExpand={toggleExpand}
                searchQuery={searchQuery}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onReparent={onReparent}
                dragNode={dragNode}
                setDragNode={setDragNode}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HierarchyPage() {
  const { token, navigate } = useAppStore();
  const [hierarchies, setHierarchies] = useState<Hierarchy[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Hierarchy | null>(null);
  const [form, setForm] = useState({ moduleId: '', hierarchyName: '', description: '' });
  const [saving, setSaving] = useState(false);

  // Tree view state
  const [treeData, setTreeData] = useState<HierarchyNode[]>([]);
  const [flatNodes, setFlatNodes] = useState<HierarchyNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [dragNode, setDragNode] = useState<HierarchyNode | null>(null);

  // Node dialog
  const [nodeDialog, setNodeDialog] = useState<{
    mode: 'create' | 'edit';
    hierarchyId: string;
    parentNodeId: string | null;
    id?: string;
    nodeLabel: string;
    description: string;
  } | null>(null);

  // Classification rule dialog
  const [classDialog, setClassDialog] = useState<{
    hierarchyId: string;
    ruleName: string;
    fieldCode: string;
    pattern: string;
    targetNodeId: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [hRes, mRes] = await Promise.all([
        fetch('/api/hierarchies', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const hData = await hRes.json();
      const mData = await mRes.json();
      setHierarchies(hData.hierarchies || []);
      setModules(mData.modules || []);
    } catch {
      toast.error('Failed to load hierarchies');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load tree for a hierarchy
  const loadTree = useCallback(async (hierarchyId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/hierarchies?action=nodes&hierarchyId=${hierarchyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTreeData(data.nodes || []);
      setFlatNodes(data.flatNodes || []);
      // Auto-expand root nodes
      const rootIds = (data.nodes || []).map((n: HierarchyNode) => n.id);
      setExpanded(new Set(rootIds));
    } catch {
      toast.error('Failed to load hierarchy tree');
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (editItem) {
        const res = await fetch('/api/hierarchies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editItem.id, hierarchyName: form.hierarchyName, description: form.description }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Hierarchy updated');
      } else {
        const res = await fetch('/api/hierarchies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Hierarchy created');
      }
      setDialogOpen(false);
      setEditItem(null);
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Delete this hierarchy and all its nodes?')) return;
    try {
      const res = await fetch('/api/hierarchies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return; }
      toast.success('Hierarchy deleted');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (h: Hierarchy) => {
    setEditItem(h);
    setForm({ moduleId: h.moduleId, hierarchyName: h.hierarchyName, description: h.description || '' });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({ moduleId: modules[0]?.id || '', hierarchyName: '', description: '' });
    setDialogOpen(true);
  };

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Expand all / Collapse all
  const expandAll = () => {
    const allIds = new Set(flatNodes.map((n) => n.id));
    setExpanded(allIds);
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  // Node CRUD
  const handleNodeSave = async () => {
    if (!token || !nodeDialog) return;
    setSaving(true);
    try {
      if (nodeDialog.mode === 'edit') {
        const res = await fetch('/api/hierarchies?action=nodes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            id: nodeDialog.id,
            nodeLabel: nodeDialog.nodeLabel,
            description: nodeDialog.description,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Node updated');
      } else {
        const res = await fetch('/api/hierarchies?action=nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            hierarchyId: nodeDialog.hierarchyId,
            parentNodeId: nodeDialog.parentNodeId,
            nodeLabel: nodeDialog.nodeLabel,
            description: nodeDialog.description,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Node created');
      }
      setNodeDialog(null);
      loadTree(nodeDialog.hierarchyId);
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleNodeDelete = async (nodeId: string) => {
    if (!token || !confirm('Delete this node?')) return;
    try {
      const res = await fetch('/api/hierarchies?action=nodes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: nodeId }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return; }
      toast.success('Node deleted');
      // Reload tree
      if (treeData.length > 0) {
        const hId = flatNodes[0]?.hierarchyId;
        if (hId) loadTree(hId);
      }
    } catch {
      toast.error('Network error');
    }
  };

  // Reparent (drag-and-drop)
  const handleReparent = async (nodeId: string, newParentId: string | null) => {
    if (!token) return;
    try {
      const res = await fetch('/api/hierarchies?action=nodes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: nodeId, parentNodeId: newParentId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to reparent'); return; }
      toast.success('Node moved');
      if (treeData.length > 0) {
        const hId = flatNodes[0]?.hierarchyId;
        if (hId) loadTree(hId);
      }
    } catch {
      toast.error('Network error');
    }
  };

  // Classification rule
  const handleClassSave = async () => {
    if (!token || !classDialog) return;
    toast.success(`Classification rule "${classDialog.ruleName}" created (simulated)`);
    setClassDialog(null);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 min-h-screen">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FolderTree className="w-7 h-7 text-teal-600" />
            Hierarchy Manager
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Organize master data into tree structures with taxonomy and classification</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white h-11" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> New Hierarchy
          </Button>
        </div>
      </div>

      {hierarchies.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <Network className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No hierarchies</h3>
            <p className="text-muted-foreground text-sm mt-1">Create a hierarchy to organize your master data.</p>
            <Button className="mt-4 bg-teal-600 hover:bg-teal-700 text-white" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Create Hierarchy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hierarchies.map((h) => (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="shadow-sm hover:shadow-md transition-shadow group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/30">
                        <Network className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{h.hierarchyName}</CardTitle>
                        <CardDescription className="text-xs">{h.module?.moduleName}</CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 p-1.5 rounded-md hover:bg-background/80 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { loadTree(h.id); }}>
                          <Eye className="w-4 h-4 mr-2" /> View Tree
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate('hierarchy-detail', { hierarchyId: h.id })}>
                          <ArrowRight className="w-4 h-4 mr-2" /> Open Full Tree
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openEdit(h)}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setClassDialog({
                          hierarchyId: h.id,
                          ruleName: '',
                          fieldCode: '',
                          pattern: '',
                          targetNodeId: '',
                        })}>
                          <Zap className="w-4 h-4 mr-2" /> Classification Rule
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(h.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {h.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{h.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{h.nodeCount || 0} nodes</Badge>
                    <Badge variant="outline" className="text-xs">
                      <Tag className="w-3 h-3 mr-1" />
                      {h.module?.moduleCode || 'N/A'}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full mt-3 justify-center text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30 h-9"
                    onClick={() => { loadTree(h.id); }}
                  >
                    <Eye className="w-4 h-4 mr-2" /> Quick View Tree
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tree View Panel */}
      {treeData.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderTree className="w-5 h-5 text-teal-600" /> Tree View
                </CardTitle>
                <CardDescription>Drag and drop nodes to reorder or reparent</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 w-48 pl-8 text-xs"
                    placeholder="Search nodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={expandAll}>
                  <Maximize2 className="w-3.5 h-3.5" /> Expand All
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={collapseAll}>
                  <Minimize2 className="w-3.5 h-3.5" /> Collapse All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => {
                    const hId = flatNodes[0]?.hierarchyId;
                    if (hId) setNodeDialog({ mode: 'create', hierarchyId: hId, parentNodeId: null, nodeLabel: '', description: '' });
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Root Node
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setTreeData([]); setFlatNodes([]); }}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Close
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Tree stats */}
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="outline" className="text-xs">{flatNodes.length} total nodes</Badge>
              <Badge variant="outline" className="text-xs">{treeData.length} root nodes</Badge>
              <Badge variant="outline" className="text-xs">
                Max depth: {flatNodes.length > 0 ? Math.max(...flatNodes.map(n => n.depthLevel)) + 1 : 0}
              </Badge>
            </div>

            <ScrollArea className="max-h-[500px]">
              {treeData.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  searchQuery={searchQuery}
                  onEdit={(n) => setNodeDialog({
                    mode: 'edit',
                    hierarchyId: n.hierarchyId,
                    parentNodeId: n.parentNodeId,
                    id: n.id,
                    nodeLabel: n.nodeLabel,
                    description: n.description || '',
                  })}
                  onDelete={handleNodeDelete}
                  onAddChild={(parentId) => {
                    const hId = flatNodes[0]?.hierarchyId;
                    if (hId) setNodeDialog({ mode: 'create', hierarchyId: hId, parentNodeId: parentId, nodeLabel: '', description: '' });
                  }}
                  onReparent={handleReparent}
                  dragNode={dragNode}
                  setDragNode={setDragNode}
                />
              ))}
              {treeData.length === 0 && (
                <div className="py-8 text-center">
                  <FolderTree className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No nodes in this hierarchy</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Hierarchy Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Hierarchy' : 'Create Hierarchy'}</DialogTitle>
            <DialogDescription>Define the hierarchy structure</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Module</Label>
              <Select value={form.moduleId} onValueChange={(v) => setForm({ ...form, moduleId: v })} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                <SelectContent>
                  {modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.moduleName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hierarchy Name</Label>
              <Input
                value={form.hierarchyName}
                onChange={(e) => setForm({ ...form, hierarchyName: e.target.value })}
                placeholder="e.g. Product Category Tree"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.hierarchyName || !form.moduleId} className="bg-teal-600 hover:bg-teal-700 text-white">
              {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node Create/Edit Dialog */}
      <Dialog open={!!nodeDialog} onOpenChange={() => setNodeDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {nodeDialog?.mode === 'edit' ? (
                <><Pencil className="w-5 h-5" /> Edit Node</>
              ) : (
                <><Plus className="w-5 h-5" /> Add Node</>
              )}
            </DialogTitle>
            <DialogDescription>
              {nodeDialog?.parentNodeId ? 'Add a child node under the selected parent' : 'Add a root-level node'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Node Label</Label>
              <Input
                value={nodeDialog?.nodeLabel || ''}
                onChange={(e) => setNodeDialog(prev => prev ? { ...prev, nodeLabel: e.target.value } : null)}
                placeholder="e.g. Footwear"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={nodeDialog?.description || ''}
                onChange={(e) => setNodeDialog(prev => prev ? { ...prev, description: e.target.value } : null)}
                placeholder="Optional node description"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDialog(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleNodeSave} disabled={saving || !nodeDialog?.nodeLabel} className="bg-teal-600 hover:bg-teal-700 text-white">
              {saving ? 'Saving...' : nodeDialog?.mode === 'edit' ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Classification Rule Dialog */}
      <Dialog open={!!classDialog} onOpenChange={() => setClassDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" /> Classification Rule
            </DialogTitle>
            <DialogDescription>
              Auto-classify records based on hierarchy rules. Records matching the pattern will be assigned to the target node.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input
                value={classDialog?.ruleName || ''}
                onChange={(e) => setClassDialog(prev => prev ? { ...prev, ruleName: e.target.value } : null)}
                placeholder="e.g. Footwear Auto-Classification"
              />
            </div>
            <div className="space-y-2">
              <Label>Field Code</Label>
              <Input
                value={classDialog?.fieldCode || ''}
                onChange={(e) => setClassDialog(prev => prev ? { ...prev, fieldCode: e.target.value } : null)}
                placeholder="e.g. category or subCategory"
              />
            </div>
            <div className="space-y-2">
              <Label>Pattern (regex or exact match)</Label>
              <Input
                value={classDialog?.pattern || ''}
                onChange={(e) => setClassDialog(prev => prev ? { ...prev, pattern: e.target.value } : null)}
                placeholder="e.g. FOOTWEAR or .*shoe.*"
              />
            </div>
            <div className="space-y-2">
              <Label>Target Node</Label>
              <Select
                value={classDialog?.targetNodeId || ''}
                onValueChange={(v) => setClassDialog(prev => prev ? { ...prev, targetNodeId: v } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target node" />
                </SelectTrigger>
                <SelectContent>
                  {flatNodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {'  '.repeat(n.depthLevel)}{n.nodeLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <Zap className="w-3.5 h-3.5 inline mr-1" />
                When a record&apos;s <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{classDialog?.fieldCode || 'field'}</code> value matches <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{classDialog?.pattern || 'pattern'}</code>, it will be automatically classified under the selected node.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassDialog(null)}>Cancel</Button>
            <Button onClick={handleClassSave} disabled={!classDialog?.ruleName || !classDialog?.fieldCode || !classDialog?.pattern || !classDialog?.targetNodeId} className="bg-amber-600 hover:bg-amber-700 text-white">
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
