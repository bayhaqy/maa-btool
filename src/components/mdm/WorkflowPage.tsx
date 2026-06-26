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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  GitBranch, CheckCircle2, XCircle, Clock, User,
  FileText, FileSearch, ChevronRight, Mail, Package, Building2, Hash,
  ArrowRight, Plus, Minus, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers (module-level pure functions for the "Lihat Detail Perubahan" dialog)
// ---------------------------------------------------------------------------

const RECORD_TITLE_FIELDS = [
  'name', 'title', 'articleName', 'article_name', 'displayName', 'display_name',
  'code', 'codeName', 'label', 'subject',
];

function extractRecordTitle(ticket: any): string {
  try {
    const payload = JSON.parse(ticket?.record?.currentPayload || '{}');
    for (const k of RECORD_TITLE_FIELDS) {
      const v = payload[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    for (const [, v] of Object.entries(payload)) {
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
  } catch {
    // ignore parse errors — fall through to module name fallback
  }
  return ticket?.record?.module?.moduleName || 'Untitled Record';
}

function prettyRecordJson(raw: string | null | undefined): string {
  if (!raw) return '{}';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return String(raw);
  }
}

export default function WorkflowPage() {
  const { token, navigate, user } = useAppStore();
  const canApprove = user?.roles?.some(r => ['Super Admin', 'Manager'].includes(r)) ?? false;
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDING');
  const [actionDialog, setActionDialog] = useState<{ ticketId: string; action: 'approve' | 'reject'; notes: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [detailTicket, setDetailTicket] = useState<any | null>(null);

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
      // If the action was launched from inside the detail dialog, close detail too
      if (detailTicket && detailTicket.id === actionDialog.ticketId) {
        setDetailTicket(null);
      }
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

  // Computed values for the "Lihat Detail Perubahan" dialog (cheap; recompute on render)
  const detailDiffs = detailTicket ? getPayloadDiff(detailTicket) : [];
  const detailRecordTitle = detailTicket ? extractRecordTitle(detailTicket) : 'Untitled Record';
  const detailRecordJson = detailTicket ? prettyRecordJson(detailTicket.record?.currentPayload) : '{}';

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

                      {/* Lihat Detail Perubahan — opens the detail dialog for this ticket */}
                      <Button
                        variant="outline"
                        className="w-full h-10 gap-2 border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                        onClick={() => setDetailTicket(ticket)}
                      >
                        <FileSearch className="w-4 h-4" />
                        Lihat Detail Perubahan
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </Button>
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

      {/* Detail Dialog — "Lihat Detail Perubahan" (PEMOHON / RINGKASAN PERUBAHAN / DATA RECORD LENGKAP) */}
      <Dialog open={!!detailTicket} onOpenChange={(open) => { if (!open) setDetailTicket(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          {detailTicket && (
            <>
              <DialogHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn(
                    'text-xs border',
                    detailTicket.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    detailTicket.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' :
                    'bg-red-50 text-red-700 border-red-200'
                  )}>
                    {detailTicket.status}
                  </Badge>
                  <Badge className={cn('text-xs border', STATUS_COLORS[detailTicket.record?.status] || '')}>
                    Record: {STATUS_LABELS[detailTicket.record?.status] || detailTicket.record?.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs font-mono">
                    <Hash className="w-3 h-3 mr-1" />
                    {detailTicket.recordId?.slice(0, 8)}…
                  </Badge>
                </div>
                <DialogTitle className="text-xl flex items-start gap-2">
                  <FileText className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="break-words">{detailRecordTitle}</span>
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    {detailTicket.record?.module?.moduleName || detailTicket.record?.module?.moduleCode || 'Unknown Module'}
                  </span>
                  {detailTicket.record?.company && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {detailTicket.record.company.companyName || detailTicket.record.company.companyCode}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-6 pr-2">
                  {/* PEMOHON — Requester Info */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Pemohon
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Diajukan Oleh</span>
                        </div>
                        <p className="text-sm font-medium break-words">
                          {detailTicket.requestedBy?.displayName || detailTicket.requestedBy?.username || 'Unknown'}
                        </p>
                        {detailTicket.requestedBy?.email && (
                          <p className="text-xs text-muted-foreground mt-0.5 break-words flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {detailTicket.requestedBy.email}
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">Waktu Pengajuan</span>
                        </div>
                        <p className="text-sm font-medium break-words">
                          {new Date(detailTicket.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {detailTicket.reviewedBy && (
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="font-medium">Direview Oleh</span>
                        </div>
                        <p className="text-sm font-medium break-words">
                          {detailTicket.reviewedBy?.displayName || detailTicket.reviewedBy?.username}
                          {detailTicket.reviewedAt && (
                            <span className="text-xs text-muted-foreground ml-2">
                              on {new Date(detailTicket.reviewedAt).toLocaleString()}
                            </span>
                          )}
                        </p>
                        {detailTicket.reviewNotes && (
                          <p className="text-sm mt-2 whitespace-pre-wrap">
                            <span className="font-medium">Catatan:</span>{' '}
                            {detailTicket.reviewNotes}
                          </p>
                        )}
                      </div>
                    )}
                  </section>

                  <Separator />

                  {/* RINGKASAN PERUBAHAN — Change Summary */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" />
                      Ringkasan Perubahan
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Perbandingan nilai lama → nilai baru untuk setiap field yang berubah.
                    </p>
                    {detailDiffs.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
                        <FileSearch className="w-5 h-5 text-gray-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Tidak Ada Perubahan Terdeteksi</p>
                          <p className="text-xs text-gray-700 mt-0.5">
                            Tidak ada perubahan field yang terdeteksi pada tiket ini.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                            <Plus className="w-3 h-3 mr-0.5" />
                            {detailDiffs.filter(d => !d.oldVal && d.newVal).length} ditambah
                          </Badge>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                            <Pencil className="w-3 h-3 mr-0.5" />
                            {detailDiffs.filter(d => d.oldVal && d.newVal).length} diubah
                          </Badge>
                          <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                            <Minus className="w-3 h-3 mr-0.5" />
                            {detailDiffs.filter(d => d.oldVal && !d.newVal).length} dihapus
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-1">
                            Total {detailDiffs.length} field berubah
                          </span>
                        </div>
                        <div className="space-y-2">
                          {detailDiffs.map((d) => {
                            const isAdded = !d.oldVal && d.newVal;
                            const isRemoved = d.oldVal && !d.newVal;
                            return (
                              <div
                                key={d.key}
                                className={cn(
                                  'rounded-md border border-l-4 bg-card p-3 space-y-2',
                                  isAdded ? 'border-l-emerald-400' :
                                  isRemoved ? 'border-l-red-400' :
                                  'border-l-amber-400',
                                )}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-medium font-mono">{d.key}</span>
                                  <Badge className={cn(
                                    'text-[10px] border',
                                    isAdded ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    isRemoved ? 'bg-red-50 text-red-700 border-red-200' :
                                    'bg-amber-50 text-amber-700 border-amber-200',
                                  )}>
                                    {isAdded ? 'ditambah' : isRemoved ? 'dihapus' : 'diubah'}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                                  <div className={cn(
                                    'rounded px-2 py-1.5 text-xs font-mono break-words border',
                                    isAdded ? 'bg-gray-50 text-muted-foreground border-gray-200' :
                                    'bg-red-50 text-red-900 border-red-200',
                                  )}>
                                    {isAdded ? (
                                      <span className="italic">(belum diset)</span>
                                    ) : (
                                      d.oldVal || <span className="italic text-muted-foreground">(kosong)</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-center">
                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                  <div className={cn(
                                    'rounded px-2 py-1.5 text-xs font-mono break-words border',
                                    isRemoved ? 'bg-gray-50 text-muted-foreground border-gray-200 line-through' :
                                    'bg-emerald-50 text-emerald-900 border-emerald-200',
                                  )}>
                                    {isRemoved ? (
                                      <span className="italic">(dihapus)</span>
                                    ) : (
                                      d.newVal || <span className="italic text-muted-foreground">(kosong)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </section>

                  <Separator />

                  {/* DATA RECORD LENGKAP — Complete Record Data (proposed) */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      Data Record Lengkap
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Data record lengkap yang akan disimpan jika tiket disetujui.
                    </p>
                    <ScrollArea className="h-64 rounded-md border bg-muted/40">
                      <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">
                        {detailRecordJson}
                      </pre>
                    </ScrollArea>
                  </section>
                </div>
              </ScrollArea>

              <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailTicket(null)}
                >
                  Tutup
                </Button>
                {detailTicket.status === 'PENDING' && canApprove && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setActionDialog({ ticketId: detailTicket.id, action: 'reject', notes: '' })}
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => setActionDialog({ ticketId: detailTicket.id, action: 'approve', notes: '' })}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
