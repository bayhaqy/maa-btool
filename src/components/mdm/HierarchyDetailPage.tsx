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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Plus, ChevronRight, ChevronDown, MoreVertical, Pencil, Trash2,
  ArrowUp, ArrowDown, Folder, FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';

interface TreeNode {
  id: string;
  nodeLabel: string;
  depthLevel: number;
  sortOrder: number;
  children: TreeNode[];
  parentNodeId?: string | null;
}

export default function HierarchyDetailPage() {
  const { token, selectedHierarchyId, navigate } = useAppStore();
  const [hierarchy, setHierarchy] = useState<any>(null);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [editNode, setEditNode] = useState<any>(null);
  const [parentNodeForNew, setParentNodeForNew] = useState<string | null>(null);
  const [nodeForm, setNodeForm] = useState({ nodeLabel: '', sortOrder: 0 });
  const [saving, setSaving] = useState(false);

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
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleMoveNode = async (node: any, direction: 'up' | 'down') => {
    if (!token) return;
    try {
      await fetch('/api/hierarchies?action=nodes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: node.id,
          sortOrder: node.sortOrder + (direction === 'up' ? -1 : 1),
        }),
      });
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

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 py-1.5 px-2 hover:bg-accent/50 rounded-lg group min-h-[40px]"
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          {/* Expand/collapse button */}
          <button
            onClick={() => hasChildren && toggleExpand(node.id)}
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

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAddNode(node.id)}>
              <Plus className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveNode(node, 'up')}>
              <ArrowUp className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveNode(node, 'down')}>
              <ArrowDown className="w-3 h-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
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

      {/* Tree */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Tree View</CardTitle>
          <CardDescription>Expand, collapse, and manage hierarchy nodes</CardDescription>
        </CardHeader>
        <CardContent>
          {treeNodes.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No nodes yet. Add a root node to start building the tree.</p>
              <Button className="mt-3 bg-red-600 hover:bg-red-700 text-white" onClick={() => openAddNode(null)}>
                <Plus className="w-4 h-4 mr-1" /> Add Root Node
              </Button>
            </div>
          ) : (
            <div className="space-y-0.5 max-h-[500px] overflow-y-auto custom-scrollbar">
              {treeNodes.map((node) => renderNode(node))}
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


