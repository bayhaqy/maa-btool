'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { GitBranch, CheckCircle2, XCircle, Clock, User } from 'lucide-react';
import { toast } from 'sonner';

export default function WorkflowPage() {
  const { token, navigate, user } = useAppStore();
  const canApprove = user?.roles?.some(r => ['Super Admin', 'Manager'].includes(r)) ?? false;
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDING');
  const [actionDialog, setActionDialog] = useState<{ ticketId: string; action: 'approve' | 'reject'; notes: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const statusParam = activeTab === 'ALL' ? 'all' : activeTab;
      const res = await fetch(`/api/approvals?status=${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch {
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [token, activeTab]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleAction = async () => {
    if (!token || !actionDialog) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/approvals?action=${actionDialog.action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticketId: actionDialog.ticketId,
          reviewNotes: actionDialog.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(actionDialog.action === 'approve' ? 'Approved successfully' : 'Rejected');
      setActionDialog(null);
      loadTickets();
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(false);
    }
  };

  const getPayloadDiff = (ticket: any) => {
    try {
      const newPayload = JSON.parse(ticket.record?.currentPayload || '{}');
      const oldPayload = ticket.deltaPayload ? JSON.parse(ticket.deltaPayload) : {};
      const allKeys = new Set([...Object.keys(oldPayload), ...Object.keys(newPayload)]);
      const diffs: Array<{ key: string; oldVal: string; newVal: string }> = [];
      for (const key of allKeys) {
        const oldVal = String(oldPayload[key] ?? '');
        const newVal = String(newPayload[key] ?? '');
        if (oldVal !== newVal) {
          diffs.push({ key, oldVal, newVal });
        }
      }
      return diffs;
    } catch {
      return [];
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Approval Workflow</h2>
          <p className="text-muted-foreground text-sm mt-1">Review and manage approval requests</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="PENDING" className="gap-1">
            Pending {tickets.filter(t => t.status === 'PENDING').length > 0 && (
              <Badge className="ml-1 bg-amber-100 text-amber-700 border-amber-200 text-xs px-1.5">
                {tickets.filter(t => t.status === 'PENDING').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : tickets.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <GitBranch className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No approval tickets</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {activeTab === 'PENDING' ? 'All caught up! No pending approvals.' : `No ${activeTab.toLowerCase()} tickets found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const diffs = getPayloadDiff(ticket);
            return (
              <Card key={ticket.id} className="shadow-sm">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Ticket Info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge className={cn(
                          'text-xs border',
                          ticket.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          ticket.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-red-50 text-red-700 border-red-200'
                        )}>
                          {ticket.status}
                        </Badge>
                        <Badge className={cn('text-xs border', STATUS_COLORS[ticket.record?.status] || '')}>
                          Record: {STATUS_LABELS[ticket.record?.status] || ticket.record?.status}
                        </Badge>
                      </div>

                      <div>
                        <h3 className="font-semibold text-lg">
                          {ticket.record?.module?.moduleName || 'Unknown Module'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Record ID: {ticket.recordId.slice(0, 8)}...
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {ticket.requestedBy?.displayName || ticket.requestedBy?.username}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {new Date(ticket.createdAt).toLocaleString()}
                        </div>
                      </div>

                      {ticket.reviewedBy && (
                        <p className="text-sm text-muted-foreground">
                          Reviewed by {ticket.reviewedBy?.displayName || ticket.reviewedBy?.username}
                          {ticket.reviewedAt && ` on ${new Date(ticket.reviewedAt).toLocaleString()}`}
                        </p>
                      )}

                      {ticket.reviewNotes && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm"><span className="font-medium">Notes:</span> {ticket.reviewNotes}</p>
                        </div>
                      )}

                      {ticket.status === 'PENDING' && canApprove && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            className="bg-red-600 hover:bg-red-700 text-white h-10"
                            onClick={() => setActionDialog({ ticketId: ticket.id, action: 'approve', notes: '' })}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button
                            variant="destructive"
                            className="h-10"
                            onClick={() => setActionDialog({ ticketId: ticket.id, action: 'reject', notes: '' })}
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Diff Viewer */}
                    {diffs.length > 0 && (
                      <div className="lg:w-80 space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Changes</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {diffs.map((d) => (
                            <div key={d.key} className="rounded-lg border p-2 text-sm">
                              <p className="font-medium text-xs mb-1">{d.key}</p>
                              <div className="space-y-1">
                                <div className="px-2 py-1 bg-red-50 text-red-800 rounded text-xs border border-red-200">
                                  - {d.oldVal || '(empty)'}
                                </div>
                                <div className="px-2 py-1 bg-green-50 text-green-800 rounded text-xs border border-green-200">
                                  + {d.newVal || '(empty)'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actionDialog?.action === 'approve' ? 'Approve Request' : 'Reject Request'}</DialogTitle>
            <DialogDescription>
              {actionDialog?.action === 'approve'
                ? 'This will activate the record and create a new version.'
                : 'This will reject the record and send it back to the requester.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Review Notes</Label>
              <Textarea
                value={actionDialog?.notes || ''}
                onChange={(e) => setActionDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="Add your review comments..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              className={actionDialog?.action === 'approve' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-destructive hover:bg-destructive/90 text-white'}
            >
              {processing ? 'Processing...' : actionDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
