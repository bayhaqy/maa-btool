'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Plus, ChevronRight, ChevronDown, MoreVertical, Pencil, Trash2,
  ArrowUp, ArrowDown, Folder, FolderOpen, Search, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { toast } from 'sonner';

interface TreeNode {
  id: string;
  nodeLabel: string;
  depthLevel: number;
  sortOrder: number;
  status?: string;
  description?: string;
  materializedPath?: string;
  children: TreeNode[];
  parentNodeId?: string | null;
}

export default function HierarchyDetailPage() {
  const { token, selectedHierarchyId, navigate } = useAppStore();
  const [hierarchy, setHierarchy] = useState<any>(null);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [flatNodes, setFlatNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [editNode, setEditNode] = useState<any>(null);
  const [parentNodeForNew, setParentNodeForNew] = useState<string | null>(null);
  const [nodeForm, setNodeForm] = useState({ nodeLabel: '', sortOrder: 0 });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !selectedHierarchyId) return;
    setLoading(true);
    try {
      const [detailRes, nodesRes] = await Promise.all([
        fetch(`/api/hierarchies?action=detail&id=${selectedHierarchyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/hierarchies?action=nodes&hierarchyId=${selectedHierarchyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const detailData = await detailRes.json();
      const nodesData = await nodesRes.json();
      if (detailRes.ok) setHierarchy(detailData.hierarchy);
      if (nodesRes.ok) {
        setTreeNodes(nodesData.nodes || []);
        setFlatNodes(nodesData.flatNodes || []);
        // Auto-expand all nodes
        const allIds = new Set<string>();
        const collectIds = (nodes: TreeNode[]) => {
          for (const n of nodes) {
            allIds.add(n.id);
            if (n.children) collectIds(n.children);
          }
        };
        collectIds(nodesData.nodes || []);
        setExpandedNodes(allIds);
      }
    } catch {
      toast.error('Failed to load hierarchy');
    } finally {
      setLoading(false);
    }
  }, [token, selectedHierarchyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        allIds.add(n.id);
        if (n.children) collectIds(n.children);
      }
    };
    collectIds(treeNodes);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleSaveNode = async () => {
    if (!token || !selectedHierarchyId) return;
    setSaving(true);
    try {
      if (editNode) {
        const res = await fetch('/api/hierarchies?action=nodes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editNode.id, nodeLabel: nodeForm.nodeLabel, sortOrder: nodeForm.sortOrder }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Node updated');
      } else {
        const res = await fetch('/api/hierarchies?action=nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            hierarchyId: selectedHierarchyId,
            parentNodeId: parentNodeForNew,
            nodeLabel: nodeForm.nodeLabel,
            sortOrder: nodeForm.sortOrder,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Node created');
      }
      setNodeDialogOpen(false);
      setEditNode(null);
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNode = async (id: string) => {
    if (!token || !confirm('Delete this node and all its children?')) return;
    try {
      const res = await fetch('/api/hierarchies?action=nodes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return; }
      toast.success('Node deleted');
      if (selectedNodeId === id) setSelectedNodeId(null);
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleMoveNode = async (node: any, direction: 'up' | 'down') => {
    if (!token) return;
    try {
      // Find siblings (same parentNodeId) and sort by sortOrder
      const siblings = flatNodes
        .filter((n: any) => (n.parentNodeId || null) === (node.parentNodeId || null))
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      const currentIdx = siblings.findIndex((n: any) => n.id === node.id);
      const swapIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) {
        // Already at top/bottom — nothing to do
        return;
      }
      const swapNode = siblings[swapIdx];
      // Swap sortOrder values between the two nodes
      await Promise.all([
        fetch('/api/hierarchies?action=nodes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: node.id, sortOrder: swapNode.sortOrder }),
        }),
        fetch('/api/hierarchies?action=nodes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: swapNode.id, sortOrder: node.sortOrder }),
        }),
      ]);
      loadData();
    } catch {
      toast.error('Failed to move node');
    }
  };

  const openAddNode = (parentNodeId: string | null) => {
    setEditNode(null);
    setParentNodeForNew(parentNodeId);
    setNodeForm({ nodeLabel: '', sortOrder: 0 });
    setNodeDialogOpen(true);
  };

  const openEditNode = (node: any) => {
    setEditNode(node);
    setParentNodeForNew(null);
    setNodeForm({ nodeLabel: node.nodeLabel, sortOrder: node.sortOrder });
    setNodeDialogOpen(true);
  };

  // Search: find matching nodes + their ancestors
  const { filteredNodes, matchedIds, keepIds } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredNodes: treeNodes, matchedIds: new Set<string>(), keepIds: new Set<string>() };
    }
    const q = searchQuery.toLowerCase();

    // Find all matching node ids
    const matchIds = new Set<string>();
    const findMatches = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.nodeLabel.toLowerCase().includes(q)) {
          matchIds.add(n.id);
        }
        if (n.children) findMatches(n.children);
      }
    };
    findMatches(treeNodes);

    // Build ancestor map (parent chain for each match)
    const parentMap = new Map<string, string | null>();
    for (const flat of flatNodes) {
      parentMap.set(flat.id, flat.parentNodeId || null);
    }
    const keepIds = new Set<string>();
    for (const id of matchIds) {
      let cur: string | null = id;
      while (cur) {
        keepIds.add(cur);
        cur = parentMap.get(cur) || null;
      }
    }

    // Filter tree to keep only matching + ancestor nodes
    const filterTree = (nodes: TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];
      for (const n of nodes) {
        const filteredChildren = n.children ? filterTree(n.children) : [];
        if (keepIds.has(n.id)) {
          result.push({ ...n, children: filteredChildren });
        }
      }
      return result;
    };

    return { filteredNodes: filterTree(treeNodes), matchedIds: matchIds, keepIds };
  }, [searchQuery, treeNodes, flatNodes]);

  // Effective expanded set = user toggles ∪ ancestors of search matches (derived during render — no setState-in-effect)
  const effectiveExpanded = useMemo(() => {
    if (keepIds.size === 0) return expandedNodes;
    const next = new Set(expandedNodes);
    for (const id of keepIds) next.add(id);
    return next;
  }, [expandedNodes, keepIds]);

  // Build breadcrumb from selected node (using flatNodes parent chain)
  const breadcrumb = useMemo(() => {
    if (!selectedNodeId) return null;
    const parentMap = new Map<string, { node: TreeNode; parent: string | null }>();
    for (const flat of flatNodes) {
      parentMap.set(flat.id, { node: flat, parent: flat.parentNodeId || null });
    }
    const path: TreeNode[] = [];
    let cur: string | null = selectedNodeId;
    while (cur) {
      const entry = parentMap.get(cur);
      if (!entry) break;
      path.unshift(entry.node);
      cur = entry.parent;
    }
    return path;
  }, [selectedNodeId, flatNodes]);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = effectiveExpanded.has(node.id);
    const isMatch = matchedIds.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const statusColor = node.status ? STATUS_COLORS[node.status] : '';
    const statusLabel = node.status ? STATUS_LABELS[node.status] : '';

    return (
      <div key={node.id}>
        <div
          className={cn(
            'flex items-center gap-1 py-1.5 px-2 hover:bg-accent/50 rounded-lg min-h-[40px] cursor-pointer',
            isMatch && 'bg-yellow-100 hover:bg-yellow-200',
            isSelected && 'ring-2 ring-teal-400'
          )}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
          onClick={() => setSelectedNodeId(node.id)}
        >
          {/* Expand/collapse button */}
          <button
            onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(node.id); }}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded shrink-0 transition-colors',
              hasChildren ? 'hover:bg-accent cursor-pointer' : 'cursor-default'
            )}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <span className="w-4 h-4" />
            )}
          </button>

          {/* Node icon */}
          {hasChildren ? (
            isExpanded ? <FolderOpen className="w-4 h-4 text-teal-600 shrink-0" /> : <Folder className="w-4 h-4 text-teal-600 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-sm bg-teal-200 shrink-0" />
          )}

          {/* Label */}
          <span className="flex-1 text-sm font-medium truncate">{node.nodeLabel}</span>

          {/* Status badge */}
          {node.status && node.status !== 'DRAFT' && (
            <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5', statusColor)}>
              {statusLabel}
            </Badge>
          )}

          {/* Actions — always visible (no opacity-0) */}
          <div
            className="flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="ghost" size="icon" className="h-7 w-7 p-1.5 rounded-md hover:bg-background/80 transition-colors" onClick={() => openAddNode(node.id)}>
              <Plus className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 p-1.5 rounded-md hover:bg-background/80 transition-colors" onClick={() => handleMoveNode(node, 'up')}>
              <ArrowUp className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 p-1.5 rounded-md hover:bg-background/80 transition-colors" onClick={() => handleMoveNode(node, 'down')}>
              <ArrowDown className="w-3 h-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 p-1.5 rounded-md hover:bg-background/80 transition-colors">
                  <MoreVertical className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEditNode(node)}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteNode(node.id)}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!hierarchy) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Hierarchy not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('hierarchy')}>Back</Button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('hierarchy')} className="h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{hierarchy.hierarchyName}</h2>
          <p className="text-sm text-muted-foreground">
            {hierarchy.module?.moduleName} &middot; {hierarchy.nodes?.length || 0} nodes
          </p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white h-9" onClick={() => openAddNode(null)}>
          <Plus className="w-4 h-4 mr-1" /> Add Root Node
        </Button>
      </div>

      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap p-2 rounded-lg bg-accent/40">
          <span className="text-xs font-medium text-foreground/70">Path:</span>
          {breadcrumb.map((n, idx) => (
            <span key={n.id} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
              <button
                className={cn(
                  'hover:text-foreground hover:underline transition-colors',
                  idx === breadcrumb.length - 1 && 'text-teal-700 font-semibold'
                )}
                onClick={() => setSelectedNodeId(n.id)}
              >
                {n.nodeLabel}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tree */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg">Tree View</CardTitle>
              <CardDescription>Expand, collapse, search, and manage hierarchy nodes</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="h-8" onClick={expandAll}>
                <ChevronsUpDown className="w-3.5 h-3.5 mr-1" /> Expand All
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={collapseAll}>
                <ChevronsDownUp className="w-3.5 h-3.5 mr-1" /> Collapse All
              </Button>
            </div>
          </div>
          {/* Search input */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              className="pl-9 h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {treeNodes.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No nodes yet. Add a root node to start building the tree.</p>
              <Button className="mt-3 bg-red-600 hover:bg-red-700 text-white" onClick={() => openAddNode(null)}>
                <Plus className="w-4 h-4 mr-1" /> Add Root Node
              </Button>
            </div>
          ) : filteredNodes.length === 0 && searchQuery.trim() ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No nodes match &ldquo;{searchQuery}&rdquo;.</p>
            </div>
          ) : (
            <div className="space-y-0.5 max-h-[500px] overflow-y-auto custom-scrollbar">
              {filteredNodes.map((node) => renderNode(node))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Node Dialog */}
      <Dialog open={nodeDialogOpen} onOpenChange={setNodeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editNode ? 'Edit Node' : 'Add Node'}</DialogTitle>
            <DialogDescription>
              {editNode ? 'Update the node label' : parentNodeForNew ? 'Add a child node' : 'Add a root-level node'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Node Label</Label>
              <Input
                value={nodeForm.nodeLabel}
                onChange={(e) => setNodeForm({ ...nodeForm, nodeLabel: e.target.value })}
                placeholder="e.g. Category Name"
              />
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={nodeForm.sortOrder}
                onChange={(e) => setNodeForm({ ...nodeForm, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveNode} disabled={saving || !nodeForm.nodeLabel} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editNode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
