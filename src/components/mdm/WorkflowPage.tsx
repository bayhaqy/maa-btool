'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { parsePayload } from '@/lib/parse-payload';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  GitBranch, CheckCircle2, XCircle, Clock, User,
  FileText, FileSearch, ChevronRight, Mail, Package, Building2,
  ArrowRight, Plus, Minus, Pencil, AlertTriangle, Zap, Timer,
  Workflow, ListChecks, LayoutTemplate, Trash2, Copy, Users,
  ChevronDown, ChevronUp, CircleDot, ArrowUpRight, Shield,
  TrendingUp, BarChart3, Target, Activity, RotateCcw,
  Search, RefreshCw, Eye, Play, Pause, Settings2,
  Bell, BellRing, ArrowDownRight, ArrowLeftRight,
  GripVertical, Download, Upload, Archive,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WFState {
  id: string;
  stateCode: string;
  stateName: string;
  stateType: string;
  color: string;
  isInitial: boolean;
  isFinal: boolean;
  sortOrder: number;
}

interface WFTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  transitionName: string;
  condition: string | null;
  requiredRole: string | null;
  isAuto: boolean;
  notifyRoles: string | null;
  sortOrder: number;
  fromState: WFState;
  toState: WFState;
}

interface WFWorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  moduleScope: string | null;
  stepCount: number;
  stepConfig: string;
  autoApproveRules: string | null;
  slaConfig: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  states: WFState[];
  transitions: WFTransition[];
}

interface ApprovalTicket {
  id: string;
  recordId: string;
  requestedById: string;
  reviewedById: string | null;
  status: string;
  deltaPayload: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  workflowType: string;
  currentStep: number;
  totalSteps: number;
  stepName: string | null;
  deadline: string | null;
  escalatedTo: string | null;
  delegatedFrom: string | null;
  priority: string;
  parentTicketId: string | null;
  workflowHistory: string | null;
  record: {
    id: string;
    currentPayload: string;
    status: string;
    module: { id: string; moduleCode: string; moduleName: string };
    company: { id: string; companyCode: string; companyName: string } | null;
  };
  requestedBy: { id: string; username: string; displayName: string | null; email: string | null };
  reviewedBy: { id: string; username: string; displayName: string | null } | null;
}

interface WorkflowHistoryEntry {
  step: number;
  userId: string;
  action: string;
  timestamp: string;
  notes?: string;
}

interface SysUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECORD_TITLE_FIELDS = [
  'name', 'title', 'articleName', 'article_name', 'displayName', 'display_name',
  'code', 'codeName', 'label', 'subject',
];

const STATE_TYPE_OPTIONS = [
  { value: 'DRAFT', label: 'Draft', color: '#6b7280' },
  { value: 'IN_REVIEW', label: 'In Review', color: '#f59e0b' },
  { value: 'APPROVED', label: 'Approved', color: '#10b981' },
  { value: 'REJECTED', label: 'Rejected', color: '#ef4444' },
  { value: 'PUBLISHED', label: 'Published', color: '#8b5cf6' },
  { value: 'ARCHIVED', label: 'Archived', color: '#94a3b8' },
];

const ROLE_OPTIONS = ['Super Admin', 'Manager', 'Data Entry', 'Viewer', 'API Manager', 'Data Steward', 'Approver'];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  LOW: { label: 'Low', color: 'bg-gray-100 text-gray-600 border-gray-300', icon: ChevronDown },
  NORMAL: { label: 'Normal', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: CircleDot },
  HIGH: { label: 'High', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: ChevronUp },
  URGENT: { label: 'Urgent', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRecordTitle(ticket: ApprovalTicket): string {
  const payload = parsePayload(ticket?.record?.currentPayload);
  for (const k of RECORD_TITLE_FIELDS) {
    const v = payload[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  for (const [, v] of Object.entries(payload)) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return ticket?.record?.module?.moduleName || 'Untitled Record';
}

function prettyRecordJson(raw: string | null | undefined): string {
  if (!raw) return '{}';
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return String(raw); }
}

function parseWorkflowHistory(raw: string | null | undefined): WorkflowHistoryEntry[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch { return []; }
}

function getDeadlineInfo(deadline: string | null): { isOverdue: boolean; isUpcoming: boolean; display: string } {
  if (!deadline) return { isOverdue: false, isUpcoming: false, display: '' };
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  const hours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
  const minutes = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));
  if (diff < 0) return { isOverdue: true, isUpcoming: false, display: hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h overdue` : `${hours}h ${minutes}m overdue` };
  if (diff < 24 * 60 * 60 * 1000) return { isOverdue: false, isUpcoming: true, display: `${hours}h ${minutes}m remaining` };
  return { isOverdue: false, isUpcoming: false, display: `${Math.floor(hours / 24)}d ${hours % 24}h remaining` };
}

function getPayloadDiff(ticket: ApprovalTicket) {
  try {
    const newP = parsePayload(ticket.record?.currentPayload);
    const oldP = ticket.deltaPayload ? JSON.parse(ticket.deltaPayload) : {};
    const allKeys = new Set([...Object.keys(oldP), ...Object.keys(newP)]);
    const diffs: Array<{ key: string; oldVal: string; newVal: string }> = [];
    for (const key of allKeys) {
      const o = String(oldP[key] ?? '');
      const n = String(newP[key] ?? '');
      if (o !== n) diffs.push({ key, oldVal: o, newVal: n });
    }
    return diffs;
  } catch { return []; }
}

function parseSlaConfig(raw: string | null): { defaultDeadlineHours: number; escalationRules: Array<{ afterHours: number; assignToRole: string; description?: string }> } | null {
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function parseAutoApproveRules(raw: string | null): Array<{ condition: string; targetState: string; description?: string }> | null {
  if (!raw) return null;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : null; }
  catch { return null; }
}

// ---------------------------------------------------------------------------
// Visual Workflow Diagram Component (SVG-based)
// ---------------------------------------------------------------------------

function VisualWorkflowDiagram({ states, transitions, selectedStateId, onStateClick }: {
  states: WFState[];
  transitions: WFTransition[];
  selectedStateId?: string | null;
  onStateClick?: (state: WFState) => void;
}) {
  if (states.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Workflow className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">No states defined yet</p>
      </div>
    );
  }

  // Layout: horizontal flow, wrapping every 4 states
  const NODE_RADIUS = 36;
  const H_GAP = 160;
  const V_GAP = 120;
  const PER_ROW = 4;
  const SVG_PADDING = 60;

  // Position states in a grid layout
  const positions: Map<string, { x: number; y: number }> = new Map();
  states.forEach((s, i) => {
    const col = i % PER_ROW;
    const row = Math.floor(i / PER_ROW);
    positions.set(s.id, {
      x: SVG_PADDING + col * H_GAP + NODE_RADIUS,
      y: SVG_PADDING + row * V_GAP + NODE_RADIUS,
    });
  });

  const maxCol = Math.min(states.length - 1, PER_ROW - 1);
  const maxRow = Math.floor((states.length - 1) / PER_ROW);
  const svgWidth = SVG_PADDING * 2 + maxCol * H_GAP + NODE_RADIUS * 2;
  const svgHeight = SVG_PADDING * 2 + maxRow * V_GAP + NODE_RADIUS * 2;

  // Draw curved arrows between states
  const renderArrow = (t: WFTransition, idx: number) => {
    const from = positions.get(t.fromStateId);
    const to = positions.get(t.toStateId);
    if (!from || !to) return null;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    const nx = dx / dist;
    const ny = dy / dist;

    // Start/end at circle edge
    const startX = from.x + nx * (NODE_RADIUS + 4);
    const startY = from.y + ny * (NODE_RADIUS + 4);
    const endX = to.x - nx * (NODE_RADIUS + 8);
    const endY = to.y - ny * (NODE_RADIUS + 8);

    // For backward arrows (going left), curve them upward/downward
    const isBackward = dx < -20;
    const isSameCol = Math.abs(dx) < 20 && dy > 0;

    let pathD: string;
    let labelX: number;
    let labelY: number;

    if (isSameCol) {
      // Straight down
      const midY = (startY + endY) / 2;
      pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
      labelX = endX + 8;
      labelY = midY;
    } else if (isBackward) {
      // Curve upward for rejection/backward paths
      const offset = (idx % 2 === 0 ? -1 : 1) * (50 + idx * 10);
      const midX = (startX + endX) / 2;
      const midY = startY + offset;
      pathD = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
      labelX = midX;
      labelY = midY - 4;
    } else {
      // Forward - gentle curve
      const offset = idx % 2 === 0 ? 0 : 15;
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2 - offset;
      pathD = `M ${startX} ${startY} Q ${midX} ${midY - 15} ${endX} ${endY}`;
      labelX = midX;
      labelY = midY - 12;
    }

    const arrowColor = t.isAuto ? '#8b5cf6' : isBackward ? '#ef4444' : '#64748b';
    const arrowDash = isBackward ? '6,3' : 'none';

    return (
      <g key={t.id}>
        <path
          d={pathD}
          fill="none"
          stroke={arrowColor}
          strokeWidth={2}
          strokeDasharray={arrowDash}
          opacity={0.6}
        />
        {/* Arrow head */}
        <polygon
          points={`${endX},${endY} ${endX - nx * 8 - ny * 5},${endY - ny * 8 + nx * 5} ${endX - nx * 8 + ny * 5},${endY - ny * 8 - nx * 5}`}
          fill={arrowColor}
          opacity={0.6}
        />
        {/* Transition label */}
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fontSize={9}
          fill={arrowColor}
          fontWeight={500}
          className="select-none pointer-events-none"
        >
          {t.transitionName.length > 18 ? t.transitionName.slice(0, 16) + '…' : t.transitionName}
        </text>
        {/* Auto indicator */}
        {t.isAuto && (
          <text
            x={labelX}
            y={labelY + 11}
            textAnchor="middle"
            fontSize={7}
            fill="#8b5cf6"
            fontStyle="italic"
            className="select-none pointer-events-none"
          >
            AUTO
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={Math.max(svgWidth, 400)}
        height={Math.max(svgHeight, 200)}
        viewBox={`0 0 ${Math.max(svgWidth, 400)} ${Math.max(svgHeight, 200)}`}
        className="w-full min-w-[400px]"
      >
        {/* Transitions (arrows) */}
        {transitions.map((t, idx) => renderArrow(t, idx))}

        {/* State nodes */}
        {states.map((s) => {
          const pos = positions.get(s.id);
          if (!pos) return null;
          const isSelected = selectedStateId === s.id;
          return (
            <g
              key={s.id}
              className={cn('cursor-pointer transition-all', onStateClick ? 'hover:opacity-80' : '')}
              onClick={() => onStateClick?.(s)}
            >
              {/* Outer ring for selected */}
              {isSelected && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS + 6}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={3}
                  strokeDasharray="6,3"
                  opacity={0.7}
                />
              )}
              {/* Glow for initial */}
              {s.isInitial && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS + 3}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  opacity={0.3}
                />
              )}
              {/* Main circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={NODE_RADIUS}
                fill={s.color}
                stroke={s.isFinal ? s.color : 'white'}
                strokeWidth={s.isFinal ? 3 : 2}
                opacity={0.9}
              />
              {/* Double border for final states */}
              {s.isFinal && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS - 5}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.5}
                  opacity={0.5}
                />
              )}
              {/* State name */}
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={600}
                fill="white"
                className="select-none pointer-events-none"
              >
                {s.stateName.length > 10 ? s.stateName.slice(0, 9) + '…' : s.stateName}
              </text>
              {/* Initial indicator */}
              {s.isInitial && (
                <text
                  x={pos.x}
                  y={pos.y - NODE_RADIUS - 8}
                  textAnchor="middle"
                  fontSize={8}
                  fill={s.color}
                  fontWeight={600}
                  className="select-none pointer-events-none"
                >
                  START
                </text>
              )}
              {/* Final indicator */}
              {s.isFinal && (
                <text
                  x={pos.x}
                  y={pos.y + NODE_RADIUS + 14}
                  textAnchor="middle"
                  fontSize={8}
                  fill={s.color}
                  fontWeight={600}
                  className="select-none pointer-events-none"
                >
                  END
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Priority badge */
function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.NORMAL;
  const Icon = config.icon;
  return (
    <Badge className={cn('text-[10px] border gap-0.5', config.color)}>
      <Icon className="w-3 h-3" /> {config.label}
    </Badge>
  );
}

/** Deadline display */
function DeadlineDisplay({ deadline }: { deadline: string | null }) {
  const info = getDeadlineInfo(deadline);
  if (!deadline) return null;
  return (
    <div className={cn(
      'flex items-center gap-1 text-xs',
      info.isOverdue ? 'text-red-600 font-semibold' : info.isUpcoming ? 'text-amber-600' : 'text-muted-foreground'
    )}>
      {info.isOverdue ? <AlertTriangle className={cn('w-3.5 h-3.5', info.isOverdue && 'animate-pulse')} /> : <Timer className="w-3.5 h-3.5" />}
      {info.display}
    </div>
  );
}

/** Stat card */
function StatCard({ title, value, icon: Icon, color, subtitle }: {
  title: string; value: number | string; icon: typeof Clock; color: string; subtitle?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** SoD Warning Banner */
function SoDWarningBanner({ onOverride }: { onOverride: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-4">
      <div className="flex items-start gap-3">
        <Shield className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-semibold text-orange-800 dark:text-orange-300 text-sm">Segregation of Duties Violation</h4>
          <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">The same user who submitted this record cannot approve it per SoD policy.</p>
          <Button variant="outline" size="sm" className="mt-2 border-orange-300 text-orange-700 hover:bg-orange-100" onClick={onOverride}>
            <Shield className="w-3.5 h-3.5 mr-1" /> Override (Super Admin Only)
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/** Color picker input */
function ColorPickerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const presetColors = ['#6b7280', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#94a3b8', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presetColors.map(c => (
        <button
          key={c}
          type="button"
          className={cn('w-7 h-7 rounded-full border-2 transition-all', value === c ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/50')}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border border-border"
      />
    </div>
  );
}

/** Workflow history timeline */
function WorkflowHistoryTimeline({ history, users }: { history: WorkflowHistoryEntry[]; users: SysUser[] }) {
  if (history.length === 0) return <p className="text-sm text-muted-foreground italic">No workflow history available</p>;

  const actionIcons: Record<string, typeof CheckCircle2> = {
    CREATED: FileText, APPROVED: CheckCircle2, REJECTED: XCircle,
    DELEGATED: ArrowUpRight, REASSIGNED: Users, ESCALATED: Zap, REQUEST_CHANGES: RotateCcw,
  };
  const actionColors: Record<string, string> = {
    CREATED: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300',
    APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300',
    REJECTED: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300',
    DELEGATED: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300',
    REASSIGNED: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300',
    ESCALATED: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300',
    REQUEST_CHANGES: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300',
  };

  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const Icon = actionIcons[entry.action] || CircleDot;
        const user = users.find(u => u.id === entry.userId);
        return (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center border', actionColors[entry.action] || 'bg-muted border-muted')}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              {idx < history.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
            </div>
            <div className="pb-4 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn('text-[10px] border', actionColors[entry.action] || '')}>{entry.action}</Badge>
                <span className="text-xs text-muted-foreground">Step {entry.step} · {user?.displayName || user?.username || entry.userId.slice(0, 8)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{new Date(entry.timestamp).toLocaleString()}</p>
              {entry.notes && <p className="text-sm mt-1 bg-muted/50 rounded px-2 py-1 max-w-md">{entry.notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function WorkflowPage() {
  const { token, user } = useAppStore();
  const perms = usePermissions();
  const canApprove = perms.canApprove;
  const isSuperAdmin = perms.isSuperAdmin;

  // Main tab
  const [mainTab, setMainTab] = useState('templates');

  // Templates
  const [templates, setTemplates] = useState<WFWorkflowTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Tickets
  const [tickets, setTickets] = useState<ApprovalTicket[]>([]);
  const [allTickets, setAllTickets] = useState<ApprovalTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [activeTicketTab, setActiveTicketTab] = useState('PENDING');

  // Users
  const [users, setUsers] = useState<SysUser[]>([]);

  // Detail dialog
  const [detailTicket, setDetailTicket] = useState<ApprovalTicket | null>(null);

  // Action dialogs
  const [actionDialog, setActionDialog] = useState<{ ticketId: string; action: 'approve' | 'reject'; notes: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<{ action: 'approve' | 'reject'; notes: string } | null>(null);

  // Delegation / Escalation / Request Changes
  const [delegateDialog, setDelegateDialog] = useState<{ ticketId: string; userId: string; notes: string } | null>(null);
  const [escalateDialog, setEscalateDialog] = useState<{ ticketId: string; userId: string; notes: string } | null>(null);
  const [requestChangesDialog, setRequestChangesDialog] = useState<{ ticketId: string; notes: string } | null>(null);

  // SoD
  const [sodWarning, setSodWarning] = useState<string | null>(null);

  // Template editor
  const [templateEditDialog, setTemplateEditDialog] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    name: string;
    description: string;
    moduleScope: string;
    states: Array<{
      stateCode: string;
      stateName: string;
      stateType: string;
      color: string;
      isInitial: boolean;
      isFinal: boolean;
      sortOrder: number;
    }>;
    transitions: Array<{
      fromStateCode: string;
      toStateCode: string;
      transitionName: string;
      condition: string;
      requiredRole: string;
      isAuto: boolean;
      notifyRoles: string[];
      sortOrder: number;
    }>;
    autoApproveRules: string;
    slaDeadlineHours: string;
    slaEscalations: Array<{ afterHours: string; assignToRole: string }>;
  } | null>(null);
  const [templateProcessing, setTemplateProcessing] = useState(false);

  // State detail dialog
  const [stateDetailDialog, setStateDetailDialog] = useState<WFState | null>(null);

  // Filters
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState('');

  // ── Data loading ──────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    if (!token) return;
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/workflow-templates', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, [token]);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setTicketsLoading(true);
    try {
      const statusParam = activeTicketTab === 'ALL' ? 'all' : activeTicketTab;
      let url = `/api/approvals?status=${statusParam}`;
      if (filterPriority !== 'all') url += `&priority=${filterPriority}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch {
      toast.error('Failed to load approvals');
    } finally {
      setTicketsLoading(false);
    }
  }, [token, activeTicketTab, filterPriority]);

  const loadAllTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/approvals?status=all', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAllTickets(data.tickets || []);
    } catch { /* non-critical */ }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.users) setUsers(data.users.map((u: SysUser) => ({ id: u.id, username: u.username, displayName: u.displayName, email: u.email })));
    } catch { /* non-critical */ }
  }, [token]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { if (mainTab === 'queue') { loadTickets(); loadAllTickets(); } }, [mainTab, loadTickets, loadAllTickets]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Selected template ─────────────────────────────────────────────────

  const selectedTemplate = useMemo(() => templates.find(t => t.id === selectedTemplateId) || null, [templates, selectedTemplateId]);

  // ── Workflow statistics ───────────────────────────────────────────────

  const workflowStatistics = useMemo(() => {
    const total = allTickets.length;
    const approved = allTickets.filter(t => t.status === 'APPROVED').length;
    const rejected = allTickets.filter(t => t.status === 'REJECTED').length;
    const pending = allTickets.filter(t => t.status === 'PENDING').length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    const rejectionReasons: Record<string, number> = {};
    allTickets.filter(t => t.status === 'REJECTED' && t.reviewNotes).forEach(t => {
      const note = t.reviewNotes!.slice(0, 50);
      rejectionReasons[note] = (rejectionReasons[note] || 0) + 1;
    });

    const stepDurations: Record<number, { totalMs: number; count: number }> = {};
    allTickets.forEach(t => {
      const history = parseWorkflowHistory(t.workflowHistory);
      for (let i = 0; i < history.length - 1; i++) {
        const step = history[i].step;
        const duration = new Date(history[i + 1].timestamp).getTime() - new Date(history[i].timestamp).getTime();
        if (!stepDurations[step]) stepDurations[step] = { totalMs: 0, count: 0 };
        stepDurations[step].totalMs += duration;
        stepDurations[step].count++;
      }
    });

    const bottleneckSteps = Object.entries(stepDurations)
      .map(([step, { totalMs, count }]) => ({ step: parseInt(step), avgHours: count > 0 ? Math.round((totalMs / count / (1000 * 60 * 60)) * 10) / 10 : 0 }))
      .sort((a, b) => b.avgHours - a.avgHours);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentApproved = allTickets.filter(t => t.status === 'APPROVED' && t.reviewedAt && new Date(t.reviewedAt) >= sevenDaysAgo);
    const avgTime7d = recentApproved.length > 0 ? Math.round(recentApproved.reduce((acc, t) => acc + new Date(t.reviewedAt!).getTime() - new Date(t.createdAt).getTime(), 0) / recentApproved.length / (1000 * 60 * 60) * 10) / 10 : 0;

    const throughput: Array<{ day: string; approved: number; rejected: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      const dayLabel = dayStart.toLocaleDateString('en-US', { weekday: 'short' });
      throughput.push({
        day: dayLabel,
        approved: allTickets.filter(t => t.status === 'APPROVED' && t.reviewedAt && new Date(t.reviewedAt) >= dayStart && new Date(t.reviewedAt) <= dayEnd).length,
        rejected: allTickets.filter(t => t.status === 'REJECTED' && t.reviewedAt && new Date(t.reviewedAt) >= dayStart && new Date(t.reviewedAt) <= dayEnd).length,
      });
    }

    return { total, approved, rejected, pending, approvalRate, rejectionReasons, bottleneckSteps, avgTime7d, throughput };
  }, [allTickets]);

  // SLA tracking: overdue and upcoming deadlines from pending tickets
  const slaItems = useMemo(() => {
    return allTickets
      .filter(t => t.status === 'PENDING' && t.deadline)
      .map(t => ({ ...t, deadlineInfo: getDeadlineInfo(t.deadline), recordTitle: extractRecordTitle(t) }))
      .sort((a, b) => {
        if (a.deadlineInfo.isOverdue && !b.deadlineInfo.isOverdue) return -1;
        if (!a.deadlineInfo.isOverdue && b.deadlineInfo.isOverdue) return 1;
        return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
      });
  }, [allTickets]);

  // ── Actions ───────────────────────────────────────────────────────────

  const handleAction = async () => {
    if (!token || !actionDialog) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/approvals?action=${actionDialog.action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticketId: actionDialog.ticketId, reviewNotes: actionDialog.notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes('Separation of Duties')) { setSodWarning(actionDialog.ticketId); toast.error('SoD violation detected'); }
        else toast.error(data.error || 'Failed');
        return;
      }
      toast.success(actionDialog.action === 'approve' ? 'Approved successfully' : 'Rejected');
      setActionDialog(null);
      setDetailTicket(null);
      loadTickets(); loadAllTickets();
    } catch { toast.error('Network error'); } finally { setProcessing(false); }
  };

  const handleBulkAction = async () => {
    if (!token || !bulkDialog) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/approvals?action=bulk-${bulkDialog.action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticketIds: Array.from(selectedIds), reviewNotes: bulkDialog.notes }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      const results = data.results || [];
      const succeeded = results.filter((r: { success: boolean }) => r.success).length;
      const failed = results.filter((r: { success: boolean }) => !r.success).length;
      if (failed > 0) toast.warning(`${succeeded} succeeded, ${failed} failed`);
      else toast.success(`${succeeded} ticket(s) ${bulkDialog.action === 'approve' ? 'approved' : 'rejected'}`);
      setSelectedIds(new Set()); setBulkDialog(null);
      loadTickets(); loadAllTickets();
    } catch { toast.error('Network error'); } finally { setProcessing(false); }
  };

  const handleDelegate = async () => {
    if (!token || !delegateDialog) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/approvals?action=delegate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticketId: delegateDialog.ticketId, delegateToUserId: delegateDialog.userId, reviewNotes: delegateDialog.notes }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Ticket delegated'); setDelegateDialog(null); loadTickets(); loadAllTickets();
    } catch { toast.error('Network error'); } finally { setProcessing(false); }
  };

  const handleEscalate = async () => {
    if (!token || !escalateDialog) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/approvals?action=delegate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticketId: escalateDialog.ticketId, delegateToUserId: escalateDialog.userId, reviewNotes: `[ESCALATED] ${escalateDialog.notes}` }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Ticket escalated'); setEscalateDialog(null); loadTickets(); loadAllTickets();
    } catch { toast.error('Network error'); } finally { setProcessing(false); }
  };

  const handleRequestChanges = async () => {
    if (!token || !requestChangesDialog) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/approvals?action=reject', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticketId: requestChangesDialog.ticketId, reviewNotes: `[REQUEST CHANGES] ${requestChangesDialog.notes}` }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Changes requested'); setRequestChangesDialog(null); loadTickets(); loadAllTickets();
    } catch { toast.error('Network error'); } finally { setProcessing(false); }
  };

  const handleSodOverride = async (ticketId: string) => {
    if (!token || !isSuperAdmin) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/approvals?action=approve', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticketId, reviewNotes: '[SoD OVERRIDE] Approved by Super Admin' }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Approved with SoD override'); setSodWarning(null); setActionDialog(null); loadTickets(); loadAllTickets();
    } catch { toast.error('Network error'); } finally { setProcessing(false); }
  };

  const isSodViolation = (ticket: ApprovalTicket) => user && ticket.requestedById === user.userId;

  // ── Template CRUD ─────────────────────────────────────────────────────

  const openTemplateEditor = (mode: 'create' | 'edit', tpl?: WFWorkflowTemplate) => {
    if (mode === 'edit' && tpl) {
      const sla = parseSlaConfig(tpl.slaConfig);
      setTemplateEditDialog({
        mode: 'edit',
        id: tpl.id,
        name: tpl.name,
        description: tpl.description || '',
        moduleScope: tpl.moduleScope || '',
        states: tpl.states.map(s => ({ stateCode: s.stateCode, stateName: s.stateName, stateType: s.stateType, color: s.color, isInitial: s.isInitial, isFinal: s.isFinal, sortOrder: s.sortOrder })),
        transitions: tpl.transitions.map(t => ({ fromStateCode: t.fromState.stateCode, toStateCode: t.toState.stateCode, transitionName: t.transitionName, condition: t.condition || '', requiredRole: t.requiredRole || '', isAuto: t.isAuto, notifyRoles: t.notifyRoles ? JSON.parse(t.notifyRoles) : [], sortOrder: t.sortOrder })),
        autoApproveRules: tpl.autoApproveRules || '',
        slaDeadlineHours: sla ? String(sla.defaultDeadlineHours) : '48',
        slaEscalations: sla?.escalationRules?.map(e => ({ afterHours: String(e.afterHours), assignToRole: e.assignToRole })) || [],
      });
    } else {
      setTemplateEditDialog({
        mode: 'create',
        name: '',
        description: '',
        moduleScope: '',
        states: [
          { stateCode: 'DRAFT', stateName: 'Draft', stateType: 'DRAFT', color: '#6b7280', isInitial: true, isFinal: false, sortOrder: 0 },
          { stateCode: 'APPROVED', stateName: 'Approved', stateType: 'APPROVED', color: '#10b981', isInitial: false, isFinal: true, sortOrder: 1 },
        ],
        transitions: [{ fromStateCode: 'DRAFT', toStateCode: 'APPROVED', transitionName: 'Approve', condition: '', requiredRole: 'Manager', isAuto: false, notifyRoles: [], sortOrder: 0 }],
        autoApproveRules: '',
        slaDeadlineHours: '48',
        slaEscalations: [],
      });
    }
  };

  const handleTemplateSave = async () => {
    if (!token || !templateEditDialog) return;
    if (!templateEditDialog.name) { toast.error('Name is required'); return; }
    if (templateEditDialog.states.length === 0) { toast.error('At least one state is required'); return; }
    if (!templateEditDialog.states.some(s => s.isInitial)) { toast.error('At least one initial state is required'); return; }

    setTemplateProcessing(true);
    try {
      const slaConfig = JSON.stringify({
        defaultDeadlineHours: parseInt(templateEditDialog.slaDeadlineHours) || 48,
        escalationRules: templateEditDialog.slaEscalations.map(e => ({ afterHours: parseInt(e.afterHours) || 0, assignToRole: e.assignToRole })),
      });

      const body = {
        ...(templateEditDialog.mode === 'edit' ? { id: templateEditDialog.id } : {}),
        name: templateEditDialog.name,
        description: templateEditDialog.description || null,
        moduleScope: templateEditDialog.moduleScope || null,
        states: templateEditDialog.states.map((s, i) => ({ ...s, sortOrder: i })),
        transitions: templateEditDialog.transitions.map((t, i) => ({ ...t, sortOrder: i })),
        autoApproveRules: templateEditDialog.autoApproveRules || null,
        slaConfig,
      };

      const res = await fetch('/api/workflow-templates', {
        method: templateEditDialog.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success(templateEditDialog.mode === 'create' ? 'Template created' : 'Template updated');
      setTemplateEditDialog(null);
      loadTemplates();
    } catch { toast.error('Network error'); } finally { setTemplateProcessing(false); }
  };

  const handleTemplateDelete = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/workflow-templates?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Template deleted');
      if (selectedTemplateId === id) setSelectedTemplateId(null);
      loadTemplates();
    } catch { toast.error('Network error'); }
  };

  // ── Toggle selection ──────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    const pendingIds = tickets.filter(t => t.status === 'PENDING').map(t => t.id);
    if (selectedIds.size === pendingIds.length && pendingIds.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(pendingIds));
  };

  // ── Detail dialog computed ────────────────────────────────────────────

  const detailDiffs = detailTicket ? getPayloadDiff(detailTicket) : [];
  const detailRecordTitle = detailTicket ? extractRecordTitle(detailTicket) : '';
  const detailHistory = detailTicket ? parseWorkflowHistory(detailTicket.workflowHistory) : [];

  // ── Filtered tickets ──────────────────────────────────────────────────

  const filteredTickets = useMemo(() => {
    let result = tickets;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      result = result.filter(t => {
        const title = extractRecordTitle(t).toLowerCase();
        const moduleName = t.record?.module?.moduleName?.toLowerCase() || '';
        const requester = t.requestedBy?.displayName?.toLowerCase() || t.requestedBy?.username?.toLowerCase() || '';
        return title.includes(q) || moduleName.includes(q) || requester.includes(q);
      });
    }
    return result;
  }, [tickets, filterSearch]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="p-4 lg:p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="w-7 h-7 text-primary" />
            Workflow Center
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Design visual workflows, manage approvals, and track SLAs — Stibo MDM aligned</p>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && selectedIds.size > 0 && (
            <>
              <Badge variant="outline" className="text-xs">{selectedIds.size} selected</Badge>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => setBulkDialog({ action: 'approve', notes: '' })}>
                <CheckCircle2 className="w-4 h-4" /> Bulk Approve
              </Button>
              <Button size="sm" variant="destructive" className="gap-1" onClick={() => setBulkDialog({ action: 'reject', notes: '' })}>
                <XCircle className="w-4 h-4" /> Bulk Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => { loadTemplates(); loadTickets(); loadAllTickets(); }}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="templates" className="gap-1.5"><LayoutTemplate className="w-4 h-4" /> Templates</TabsTrigger>
          <TabsTrigger value="designer" className="gap-1.5"><GitBranch className="w-4 h-4" /> Designer</TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5"><ListChecks className="w-4 h-4" /> Approval Queue</TabsTrigger>
          <TabsTrigger value="sla" className="gap-1.5"><Timer className="w-4 h-4" /> SLA Tracking</TabsTrigger>
          <TabsTrigger value="statistics" className="gap-1.5"><BarChart3 className="w-4 h-4" /> Statistics</TabsTrigger>
        </TabsList>

        {/* ============= TEMPLATES TAB ============= */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Workflow Templates</h3>
              <p className="text-sm text-muted-foreground">Visual state-machine workflows aligned with Stibo MDM best practices</p>
            </div>
            {perms.canEditSchema && (
              <Button className="gap-1" onClick={() => openTemplateEditor('create')}>
                <Plus className="w-4 h-4" /> New Template
              </Button>
            )}
          </div>

          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="shadow-sm"><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <LayoutTemplate className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No workflow templates</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {isSuperAdmin ? 'Create a template to define visual state-machine workflows.' : 'No templates have been configured yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl) => (
                <motion.div key={tpl.id} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
                  <Card className={cn('shadow-sm cursor-pointer transition-all hover:shadow-md', selectedTemplateId === tpl.id ? 'ring-2 ring-primary' : '')}
                    onClick={() => setSelectedTemplateId(tpl.id === selectedTemplateId ? null : tpl.id)}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{tpl.name}</CardTitle>
                          {tpl.description && <CardDescription className="text-xs mt-1 line-clamp-2">{tpl.description}</CardDescription>}
                        </div>
                        {perms.canEditSchema && (
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTemplateEditor('edit', tpl)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleTemplateDelete(tpl.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {tpl.moduleScope && (
                        <Badge variant="outline" className="text-[10px]"><Package className="w-3 h-3 mr-1" /> {tpl.moduleScope}</Badge>
                      )}

                      {/* State bubbles */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {tpl.states.map((s) => (
                          <TooltipProvider key={s.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white border border-white/20"
                                  style={{ backgroundColor: s.color }}
                                >
                                  {s.isInitial && <Play className="w-2.5 h-2.5" />}
                                  {s.isFinal && <Archive className="w-2.5 h-2.5" />}
                                  {s.stateName}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p className="text-xs font-medium">{s.stateName} ({s.stateCode})</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {s.stateType} · {s.isInitial ? 'Initial' : s.isFinal ? 'Final' : 'Intermediate'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>

                      {/* Counts */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><CircleDot className="w-3 h-3" /> {tpl.states.length} states</span>
                        <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" /> {tpl.transitions.length} transitions</span>
                      </div>

                      {/* SLA badge */}
                      {tpl.slaConfig && (
                        <Badge variant="outline" className="text-[9px]">
                          <Timer className="w-2.5 h-2.5 mr-0.5" />
                          SLA: {parseSlaConfig(tpl.slaConfig)?.defaultDeadlineHours || '?'}h
                        </Badge>
                      )}

                      {/* Auto-approve badge */}
                      {tpl.autoApproveRules && (
                        <Badge variant="outline" className="text-[9px] ml-1">
                          <Zap className="w-2.5 h-2.5 mr-0.5" /> Auto-rules
                        </Badge>
                      )}

                      {/* Mini diagram */}
                      <div className="bg-muted/30 rounded-lg p-2 overflow-hidden">
                        <VisualWorkflowDiagram states={tpl.states} transitions={tpl.transitions} />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1"
                          onClick={() => { setSelectedTemplateId(tpl.id); setMainTab('designer'); }}>
                          <Eye className="w-3 h-3" /> Open in Designer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============= DESIGNER TAB ============= */}
        <TabsContent value="designer" className="space-y-4 mt-4">
          {!selectedTemplate ? (
            <Card className="shadow-sm">
              <CardContent className="py-16 text-center">
                <GitBranch className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium">Select a Template to Design</h3>
                <p className="text-muted-foreground text-sm mt-1">Choose a workflow template from the Templates tab to view its visual state diagram.</p>
                <Button variant="outline" className="mt-4 gap-1" onClick={() => setMainTab('templates')}>
                  <LayoutTemplate className="w-4 h-4" /> Browse Templates
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Template header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-primary" />
                    {selectedTemplate.name}
                  </h3>
                  {selectedTemplate.description && <p className="text-sm text-muted-foreground mt-0.5">{selectedTemplate.description}</p>}
                </div>
                {perms.canEditSchema && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => openTemplateEditor('edit', selectedTemplate)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit Template
                    </Button>
                  </div>
                )}
              </div>

              {/* Metadata badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedTemplate.moduleScope && (
                  <Badge variant="outline" className="text-xs"><Package className="w-3 h-3 mr-1" /> {selectedTemplate.moduleScope}</Badge>
                )}
                <Badge variant="outline" className="text-xs"><CircleDot className="w-3 h-3 mr-1" /> {selectedTemplate.states.length} States</Badge>
                <Badge variant="outline" className="text-xs"><ArrowRight className="w-3 h-3 mr-1" /> {selectedTemplate.transitions.length} Transitions</Badge>
                {selectedTemplate.slaConfig && (
                  <Badge variant="outline" className="text-xs"><Timer className="w-3 h-3 mr-1" /> SLA: {parseSlaConfig(selectedTemplate.slaConfig)?.defaultDeadlineHours}h</Badge>
                )}
              </div>

              {/* Visual State Diagram */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitBranch className="w-5 h-5" /> Visual State Diagram
                  </CardTitle>
                  <CardDescription>States are shown as colored circles. Arrows represent transitions. Dashed arrows are backward paths. Purple arrows are auto-transitions.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-to-br from-muted/20 to-muted/40 rounded-xl p-4 border">
                    <VisualWorkflowDiagram
                      states={selectedTemplate.states}
                      transitions={selectedTemplate.transitions}
                      selectedStateId={stateDetailDialog?.id}
                      onStateClick={(s) => setStateDetailDialog(s)}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* States Configuration */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CircleDot className="w-5 h-5" /> States ({selectedTemplate.states.length})
                    </CardTitle>
                    <CardDescription>Workflow states with type and color coding</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                      {selectedTemplate.states.map((s) => (
                        <motion.div
                          key={s.id}
                          whileHover={{ scale: 1.01 }}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer',
                            stateDetailDialog?.id === s.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/30'
                          )}
                          onClick={() => setStateDetailDialog(s)}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: s.color }}>
                            {s.isInitial ? <Play className="w-3.5 h-3.5" /> : s.isFinal ? <Archive className="w-3.5 h-3.5" /> : s.stateName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{s.stateName}</span>
                              <Badge variant="outline" className="text-[9px] font-mono">{s.stateCode}</Badge>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge className="text-[9px] border" style={{ backgroundColor: s.color + '20', color: s.color, borderColor: s.color + '40' }}>
                                {s.stateType}
                              </Badge>
                              {s.isInitial && <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 border">Initial</Badge>}
                              {s.isFinal && <Badge className="text-[9px] bg-purple-50 text-purple-700 border-purple-200 border">Final</Badge>}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Transitions Configuration */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowLeftRight className="w-5 h-5" /> Transitions ({selectedTemplate.transitions.length})
                    </CardTitle>
                    <CardDescription>State transitions with conditions and roles</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                      {selectedTemplate.transitions.map((t) => (
                        <motion.div key={t.id} whileHover={{ scale: 1.01 }}
                          className="p-3 rounded-lg border hover:bg-muted/30 transition-all">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] shrink-0" style={{ backgroundColor: t.fromState.color }}>
                              {t.fromState.stateName[0]}
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] shrink-0" style={{ backgroundColor: t.toState.color }}>
                              {t.toState.stateName[0]}
                            </div>
                            <span className="font-medium text-sm">{t.transitionName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {t.requiredRole && (
                              <Badge variant="outline" className="text-[9px]"><Shield className="w-2.5 h-2.5 mr-0.5" /> {t.requiredRole}</Badge>
                            )}
                            {t.isAuto && (
                              <Badge className="text-[9px] bg-purple-50 text-purple-700 border-purple-200 border"><Zap className="w-2.5 h-2.5 mr-0.5" /> Auto</Badge>
                            )}
                            {t.condition && (
                              <Badge variant="outline" className="text-[9px] font-mono max-w-[200px] truncate"><Settings2 className="w-2.5 h-2.5 mr-0.5" /> {t.condition}</Badge>
                            )}
                            {t.notifyRoles && JSON.parse(t.notifyRoles).length > 0 && (
                              <Badge variant="outline" className="text-[9px]"><Bell className="w-2.5 h-2.5 mr-0.5" /> {JSON.parse(t.notifyRoles).join(', ')}</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {t.fromState.stateName} → {t.toState.stateName}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Auto-Approval Rules */}
              {selectedTemplate.autoApproveRules && (
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="w-5 h-5 text-purple-600" /> Auto-Approval Rules
                    </CardTitle>
                    <CardDescription>Conditions that automatically transition records</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {parseAutoApproveRules(selectedTemplate.autoApproveRules)?.map((rule, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                          <Zap className="w-4 h-4 text-purple-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium font-mono">{rule.condition}</p>
                            {rule.description && <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>}
                          </div>
                          <Badge variant="outline" className="text-[9px] shrink-0">→ {rule.targetState}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SLA Configuration */}
              {selectedTemplate.slaConfig && (() => {
                const sla = parseSlaConfig(selectedTemplate.slaConfig);
                if (!sla) return null;
                return (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Timer className="w-5 h-5 text-amber-600" /> SLA Configuration
                      </CardTitle>
                      <CardDescription>Service Level Agreement deadlines and escalation rules</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                          <Timer className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="text-sm font-medium">Default Deadline</span>
                          <Badge variant="outline" className="text-xs ml-auto">{sla.defaultDeadlineHours}h</Badge>
                        </div>
                        {sla.escalationRules?.map((rule, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm">After <span className="font-bold">{rule.afterHours}h</span> → Escalate to <span className="font-bold">{rule.assignToRole}</span></p>
                              {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </TabsContent>

        {/* ============= APPROVAL QUEUE TAB ============= */}
        <TabsContent value="queue" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs value={activeTicketTab} onValueChange={setActiveTicketTab}>
              <TabsList className="h-8">
                <TabsTrigger value="PENDING" className="text-xs gap-1"><Clock className="w-3 h-3" /> Pending</TabsTrigger>
                <TabsTrigger value="APPROVED" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</TabsTrigger>
                <TabsTrigger value="REJECTED" className="text-xs gap-1"><XCircle className="w-3 h-3" /> Rejected</TabsTrigger>
                <TabsTrigger value="ALL" className="text-xs">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search records..." className="pl-8 h-8 text-sm" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
            </div>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ticket list */}
          {ticketsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
            </div>
          ) : filteredTickets.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <ListChecks className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No tickets found</h3>
                <p className="text-muted-foreground text-sm mt-1">No approval tickets match your current filters.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Select all row */}
              {activeTicketTab === 'PENDING' && canApprove && filteredTickets.length > 0 && (
                <div className="flex items-center gap-2 px-1">
                  <Checkbox checked={selectedIds.size === filteredTickets.length && filteredTickets.length > 0} onCheckedChange={toggleSelectAll} />
                  <span className="text-xs text-muted-foreground">Select all ({filteredTickets.length})</span>
                </div>
              )}
              {filteredTickets.map((ticket) => {
                const title = extractRecordTitle(ticket);
                const diffs = getPayloadDiff(ticket);
                const dlInfo = getDeadlineInfo(ticket.deadline);
                return (
                  <motion.div key={ticket.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                    <Card className={cn('shadow-sm transition-all', dlInfo.isOverdue ? 'border-red-200 dark:border-red-800' : dlInfo.isUpcoming ? 'border-amber-200 dark:border-amber-800' : '')}>
                      <CardContent className="p-4">
                        <div className="flex flex-col lg:flex-row gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start gap-2">
                              {ticket.status === 'PENDING' && canApprove && (
                                <Checkbox checked={selectedIds.has(ticket.id)} onCheckedChange={() => toggleSelect(ticket.id)} className="mt-1" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm">{title}</span>
                                  <PriorityBadge priority={ticket.priority} />
                                  {ticket.status === 'PENDING' && <DeadlineDisplay deadline={ticket.deadline} />}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {ticket.record?.module?.moduleName}</span>
                                  {ticket.record?.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {ticket.record.company.companyName}</span>}
                                  <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ticket.requestedBy?.displayName || ticket.requestedBy?.username}</span>
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ticket.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            {/* Action buttons */}
                            {ticket.status === 'PENDING' && canApprove && (
                              <div className="flex items-center gap-2 flex-wrap pt-1">
                                <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => setActionDialog({ ticketId: ticket.id, action: 'approve', notes: '' })}>
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                </Button>
                                <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={() => setActionDialog({ ticketId: ticket.id, action: 'reject', notes: '' })}>
                                  <XCircle className="w-3.5 h-3.5" /> Reject
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setRequestChangesDialog({ ticketId: ticket.id, notes: '' })}>
                                  <RotateCcw className="w-3.5 h-3.5" /> Changes
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setDelegateDialog({ ticketId: ticket.id, userId: '', notes: '' })}>
                                  <ArrowUpRight className="w-3.5 h-3.5" /> Delegate
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setEscalateDialog({ ticketId: ticket.id, userId: '', notes: '' })}>
                                  <Zap className="w-3.5 h-3.5" /> Escalate
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Diff viewer */}
                          {diffs.length > 0 && (
                            <div className="lg:w-64 space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">Changes ({diffs.length})</p>
                              <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                {diffs.slice(0, 4).map(d => (
                                  <div key={d.key} className="rounded border p-1.5 text-xs">
                                    <p className="font-medium text-[10px] truncate">{d.key}</p>
                                    <div className="space-y-0.5">
                                      <div className="px-1 py-0.5 bg-red-50 text-red-800 rounded text-[10px] truncate border border-red-200 dark:bg-red-950/40 dark:text-red-300">- {d.oldVal || '(empty)'}</div>
                                      <div className="px-1 py-0.5 bg-green-50 text-green-800 rounded text-[10px] truncate border border-green-200 dark:bg-green-950/40 dark:text-green-300">+ {d.newVal || '(empty)'}</div>
                                    </div>
                                  </div>
                                ))}
                                {diffs.length > 4 && <p className="text-[10px] text-muted-foreground text-center">+{diffs.length - 4} more</p>}
                              </div>
                            </div>
                          )}

                          <Button variant="outline" size="sm" className="h-8 gap-1 shrink-0" onClick={() => setDetailTicket(ticket)}>
                            <FileSearch className="w-3.5 h-3.5" /> Details
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============= SLA TRACKING TAB ============= */}
        <TabsContent value="sla" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard title="Overdue" value={slaItems.filter(s => s.deadlineInfo.isOverdue).length} icon={AlertTriangle} color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
            <StatCard title="Upcoming (<24h)" value={slaItems.filter(s => s.deadlineInfo.isUpcoming).length} icon={Timer} color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
            <StatCard title="On Track" value={slaItems.filter(s => !s.deadlineInfo.isOverdue && !s.deadlineInfo.isUpcoming).length} icon={CheckCircle2} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" />
            <StatCard title="Total Pending" value={slaItems.length} icon={Clock} color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" />
          </div>

          {slaItems.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <Timer className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No SLA Items</h3>
                <p className="text-muted-foreground text-sm mt-1">No pending tickets with deadlines found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {slaItems.map((item) => (
                <Card key={item.id} className={cn('shadow-sm', item.deadlineInfo.isOverdue ? 'border-red-200 dark:border-red-800' : item.deadlineInfo.isUpcoming ? 'border-amber-200 dark:border-amber-800' : '')}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                        item.deadlineInfo.isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/40' :
                        item.deadlineInfo.isUpcoming ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40'
                      )}>
                        {item.deadlineInfo.isOverdue ? <AlertTriangle className="w-5 h-5 animate-pulse" /> : <Timer className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{item.recordTitle}</span>
                          <PriorityBadge priority={item.priority} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span>{item.record?.module?.moduleName}</span>
                          <span>·</span>
                          <DeadlineDisplay deadline={item.deadline} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('text-sm font-semibold', item.deadlineInfo.isOverdue ? 'text-red-600' : item.deadlineInfo.isUpcoming ? 'text-amber-600' : 'text-muted-foreground')}>
                          {item.deadlineInfo.display}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Due: {item.deadline ? new Date(item.deadline).toLocaleString() : 'N/A'}</p>
                      </div>
                      {item.status === 'PENDING' && canApprove && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActionDialog({ ticketId: item.id, action: 'approve', notes: '' })}>
                            <CheckCircle2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7" onClick={() => setActionDialog({ ticketId: item.id, action: 'reject', notes: '' })}>
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============= STATISTICS TAB ============= */}
        <TabsContent value="statistics" className="space-y-4 mt-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard title="Approval Rate" value={`${workflowStatistics.approvalRate}%`} icon={TrendingUp} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" subtitle="all time" />
            <StatCard title="Avg Time (7d)" value={workflowStatistics.avgTime7d > 0 ? `${workflowStatistics.avgTime7d}h` : '—'} icon={Timer} color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" subtitle="avg approval time" />
            <StatCard title="Rejected" value={workflowStatistics.rejected} icon={XCircle} color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
            <StatCard title="Total Tickets" value={workflowStatistics.total} icon={ListChecks} color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Approval Rate Gauge */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Target className="w-5 h-5" /> Approval Rate</CardTitle>
                <CardDescription>Percentage of tickets approved vs rejected</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-4">
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
                    <circle cx="60" cy="60" r="50" fill="none" className="text-emerald-500" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(workflowStatistics.approvalRate / 100) * 314} 314`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{workflowStatistics.approvalRate}%</span>
                    <span className="text-[10px] text-muted-foreground">approved</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span>Approved: {workflowStatistics.approved}</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><span>Rejected: {workflowStatistics.rejected}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Rejection Reasons */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><XCircle className="w-5 h-5" /> Rejection Reasons</CardTitle>
                <CardDescription>Breakdown from review notes</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(workflowStatistics.rejectionReasons).length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
                    <p className="text-sm text-muted-foreground">No rejections recorded yet</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-64">
                    <div className="space-y-2">
                      {Object.entries(workflowStatistics.rejectionReasons).sort(([, a], [, b]) => b - a).map(([reason, count]) => (
                        <div key={reason} className="flex items-center gap-3 p-2 rounded-lg border">
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs border shrink-0">{count}×</Badge>
                          <span className="text-sm truncate">{reason}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Bottleneck Detection */}
            <Card className="shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Activity className="w-5 h-5" /> Bottleneck Detection</CardTitle>
                <CardDescription>Average time at each workflow step — identifies the slowest stages</CardDescription>
              </CardHeader>
              <CardContent>
                {workflowStatistics.bottleneckSteps.length === 0 && workflowStatistics.avgTime7d === 0 ? (
                  <div className="py-4">
                    <p className="text-sm text-muted-foreground text-center mb-3">
                      Avg resolution time (7d): <span className="font-bold text-foreground">{workflowStatistics.avgTime7d > 0 ? `${workflowStatistics.avgTime7d}h` : 'N/A'}</span>
                    </p>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground text-center">No multi-step workflow data available yet.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workflowStatistics.avgTime7d > 0 && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <span className="text-sm font-medium">Average Resolution Time (7d)</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{workflowStatistics.avgTime7d}h</span>
                      </div>
                    )}
                    {workflowStatistics.bottleneckSteps.map(({ step, avgHours }) => (
                      <div key={step} className="flex items-center gap-4">
                        <span className="text-sm font-medium w-20 shrink-0">Step {step}</span>
                        <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden relative">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((avgHours / (workflowStatistics.bottleneckSteps[0]?.avgHours || 1)) * 100, 100)}%` }}
                            transition={{ duration: 0.5 }} className={cn('h-full rounded-full', avgHours > 48 ? 'bg-red-400' : avgHours > 24 ? 'bg-amber-400' : 'bg-emerald-400')} />
                        </div>
                        <span className={cn('text-sm font-bold w-20 text-right', avgHours > 48 ? 'text-red-600' : avgHours > 24 ? 'text-amber-600' : 'text-emerald-600')}>{avgHours}h avg</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Throughput Chart */}
            <Card className="shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Throughput (Last 7 Days)</CardTitle>
                <CardDescription>Tickets resolved per day — approved vs rejected</CardDescription>
              </CardHeader>
              <CardContent>
                {workflowStatistics.throughput.every(d => d.approved === 0 && d.rejected === 0) ? (
                  <div className="py-8 text-center">
                    <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No tickets resolved in the last 7 days</p>
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={workflowStatistics.throughput} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(value: number, name: string) => [value, name.charAt(0).toUpperCase() + name.slice(1)]} />
                        <Bar dataKey="approved" fill="#10b981" radius={[4, 4, 0, 0]} name="approved" />
                        <Bar dataKey="rejected" fill="#ef4444" radius={[4, 4, 0, 0]} name="rejected" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ DIALOGS ═══════════════════ */}

      {/* SoD Warning Dialog */}
      <Dialog open={!!sodWarning} onOpenChange={() => setSodWarning(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700"><Shield className="w-5 h-5" /> Segregation of Duties Violation</DialogTitle>
            <DialogDescription>The same user who submitted this record cannot approve it per SoD policy.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 p-4">
              <p className="text-sm text-orange-800 dark:text-orange-300">This action violates the Segregation of Duties policy. Only a Super Admin can override.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSodWarning(null)}>Cancel</Button>
            {isSuperAdmin && <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => sodWarning && handleSodOverride(sodWarning)} disabled={processing}><Shield className="w-4 h-4 mr-1" /> Override</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionDialog?.action === 'approve' ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Approve Ticket</> : <><XCircle className="w-5 h-5 text-red-600" /> Reject Ticket</>}
            </DialogTitle>
            <DialogDescription>{actionDialog?.action === 'approve' ? 'Add optional notes for this approval.' : 'A reason is required when rejecting.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{actionDialog?.action === 'approve' ? 'Notes (optional)' : 'Reason (required)'}</Label>
              <Textarea value={actionDialog?.notes || ''} onChange={(e) => setActionDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder={actionDialog?.action === 'approve' ? 'Optional notes...' : 'Required: explain rejection...'} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={processing}>Cancel</Button>
            <Button onClick={handleAction} disabled={processing || (actionDialog?.action === 'reject' && !actionDialog?.notes)}
              className={actionDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}>
              {processing ? 'Processing...' : actionDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Dialog */}
      <Dialog open={!!bulkDialog} onOpenChange={() => setBulkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkDialog?.action === 'approve' ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Bulk Approve</> : <><XCircle className="w-5 h-5 text-red-600" /> Bulk Reject</>}
            </DialogTitle>
            <DialogDescription>{selectedIds.size} ticket(s) will be {bulkDialog?.action === 'approve' ? 'approved' : 'rejected'}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={bulkDialog?.notes || ''} onChange={(e) => setBulkDialog(prev => prev ? { ...prev, notes: e.target.value } : null)} placeholder="Notes for all selected..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={processing}>Cancel</Button>
            <Button onClick={handleBulkAction} disabled={processing} className={bulkDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}>
              {processing ? 'Processing...' : `Bulk ${bulkDialog?.action === 'approve' ? 'Approve' : 'Reject'} (${selectedIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delegate Dialog */}
      <Dialog open={!!delegateDialog} onOpenChange={() => setDelegateDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowUpRight className="w-5 h-5 text-purple-600" /> Delegate Ticket</DialogTitle>
            <DialogDescription>Delegate this ticket to another user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Delegate To</Label>
              <Select value={delegateDialog?.userId || ''} onValueChange={(v) => setDelegateDialog(prev => prev ? { ...prev, userId: v } : null)}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.id !== user?.userId).map(u => <SelectItem key={u.id} value={u.id}>{u.displayName || u.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={delegateDialog?.notes || ''} onChange={(e) => setDelegateDialog(prev => prev ? { ...prev, notes: e.target.value } : null)} placeholder="Why delegating..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateDialog(null)} disabled={processing}>Cancel</Button>
            <Button onClick={handleDelegate} disabled={processing || !delegateDialog?.userId} className="bg-purple-600 hover:bg-purple-700 text-white">Delegate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={!!escalateDialog} onOpenChange={() => setEscalateDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-orange-600" /> Escalate Ticket</DialogTitle>
            <DialogDescription>Escalate to a higher authority.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Escalate To</Label>
              <Select value={escalateDialog?.userId || ''} onValueChange={(v) => setEscalateDialog(prev => prev ? { ...prev, userId: v } : null)}>
                <SelectTrigger><SelectValue placeholder="Select authority" /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.id !== user?.userId).map(u => <SelectItem key={u.id} value={u.id}>{u.displayName || u.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={escalateDialog?.notes || ''} onChange={(e) => setEscalateDialog(prev => prev ? { ...prev, notes: e.target.value } : null)} placeholder="Why escalating..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialog(null)} disabled={processing}>Cancel</Button>
            <Button onClick={handleEscalate} disabled={processing || !escalateDialog?.userId} className="bg-orange-600 hover:bg-orange-700 text-white">Escalate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes Dialog */}
      <Dialog open={!!requestChangesDialog} onOpenChange={() => setRequestChangesDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5 text-teal-600" /> Request Changes</DialogTitle>
            <DialogDescription>Send this record back with revision notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Revision Notes (required)</Label>
              <Textarea value={requestChangesDialog?.notes || ''} onChange={(e) => setRequestChangesDialog(prev => prev ? { ...prev, notes: e.target.value } : null)} placeholder="What changes are needed..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestChangesDialog(null)} disabled={processing}>Cancel</Button>
            <Button onClick={handleRequestChanges} disabled={processing || !requestChangesDialog?.notes} className="bg-teal-600 hover:bg-teal-700 text-white">Request Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailTicket} onOpenChange={() => setDetailTicket(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          {detailTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><FileSearch className="w-5 h-5" />{detailRecordTitle}</DialogTitle>
                <DialogDescription className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Package className="w-4 h-4" />{detailTicket.record?.module?.moduleName}</span>
                  {detailTicket.record?.company && <span className="inline-flex items-center gap-1"><Building2 className="w-4 h-4" />{detailTicket.record.company.companyName}</span>}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-6 pr-2">
                  {isSodViolation(detailTicket) && detailTicket.status === 'PENDING' && <SoDWarningBanner onOverride={() => handleSodOverride(detailTicket.id)} />}

                  {/* Deadline */}
                  {detailTicket.deadline && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Timer className="w-4 h-4" /> Deadline</h4>
                      <div className={cn('rounded-lg border p-3 flex items-center gap-3', getDeadlineInfo(detailTicket.deadline).isOverdue ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'border-border')}>
                        <DeadlineDisplay deadline={detailTicket.deadline} />
                        <span className="text-sm text-muted-foreground">Due: {new Date(detailTicket.deadline).toLocaleString()}</span>
                      </div>
                    </section>
                  )}

                  {/* Requester */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Requester</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><User className="w-4 h-4" /><span className="font-medium">Requested By</span></div>
                        <p className="text-sm font-medium">{detailTicket.requestedBy?.displayName || detailTicket.requestedBy?.username || 'Unknown'}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Clock className="w-4 h-4" /><span className="font-medium">Submitted At</span></div>
                        <p className="text-sm font-medium">{new Date(detailTicket.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {detailTicket.reviewedBy && (
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Reviewed By</span></div>
                        <p className="text-sm font-medium">{detailTicket.reviewedBy?.displayName || detailTicket.reviewedBy?.username}
                          {detailTicket.reviewedAt && <span className="text-xs text-muted-foreground ml-2">on {new Date(detailTicket.reviewedAt).toLocaleString()}</span>}
                        </p>
                        {detailTicket.reviewNotes && <p className="text-sm mt-2 whitespace-pre-wrap"><span className="font-medium">Notes:</span> {detailTicket.reviewNotes}</p>}
                      </div>
                    )}
                  </section>

                  <Separator />

                  {/* Workflow History */}
                  {detailHistory.length > 0 && (
                    <>
                      <section className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><GitBranch className="w-4 h-4" /> Workflow History</h4>
                        <WorkflowHistoryTimeline history={detailHistory} users={users} />
                      </section>
                      <Separator />
                    </>
                  )}

                  {/* Changes */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><GitBranch className="w-4 h-4" /> Change Summary</h4>
                    {detailDiffs.length === 0 ? (
                      <div className="rounded-lg border bg-muted/30 p-4 text-center"><p className="text-sm text-muted-foreground">No changes detected</p></div>
                    ) : (
                      <div className="space-y-2">
                        {detailDiffs.map(d => {
                          const isAdded = !d.oldVal && d.newVal;
                          const isRemoved = d.oldVal && !d.newVal;
                          return (
                            <div key={d.key} className={cn('rounded-md border border-l-4 bg-card p-3', isAdded ? 'border-l-emerald-400' : isRemoved ? 'border-l-red-400' : 'border-l-amber-400')}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-medium font-mono">{d.key}</span>
                                <Badge className={cn('text-[10px] border', isAdded ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isRemoved ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
                                  {isAdded ? 'added' : isRemoved ? 'removed' : 'modified'}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                <div className={cn('rounded px-2 py-1 text-xs font-mono border', isAdded ? 'bg-muted/30 text-muted-foreground border-muted' : 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-300')}>
                                  {isAdded ? <span className="italic">(not set)</span> : d.oldVal || <span className="italic">(empty)</span>}
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                <div className={cn('rounded px-2 py-1 text-xs font-mono border', isRemoved ? 'bg-muted/30 text-muted-foreground border-muted line-through' : 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300')}>
                                  {isRemoved ? <span className="italic">(removed)</span> : d.newVal || <span className="italic">(empty)</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <Separator />

                  {/* Record Data */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><FileText className="w-4 h-4" /> Record Data</h4>
                    <ScrollArea className="h-48 rounded-md border bg-muted/40">
                      <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">{prettyRecordJson(detailTicket.record?.currentPayload)}</pre>
                    </ScrollArea>
                  </section>
                </div>
              </ScrollArea>

              <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setDetailTicket(null)}>Close</Button>
                {detailTicket.status === 'PENDING' && canApprove && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="destructive" size="sm" className="gap-1" onClick={() => setActionDialog({ ticketId: detailTicket.id, action: 'reject', notes: '' })}>
                      <XCircle className="w-4 h-4" /> Reject
                    </Button>
                    <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActionDialog({ ticketId: detailTicket.id, action: 'approve', notes: '' })}>
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Template Create/Edit Dialog */}
      <Dialog open={!!templateEditDialog} onOpenChange={() => setTemplateEditDialog(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              {templateEditDialog?.mode === 'create' ? 'Create Workflow Template' : 'Edit Workflow Template'}
            </DialogTitle>
            <DialogDescription>Define states, transitions, SLA rules, and auto-approval conditions.</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-5 py-2">
              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input value={templateEditDialog?.name || ''} onChange={(e) => setTemplateEditDialog(prev => prev ? { ...prev, name: e.target.value } : null)} placeholder="e.g. Product Approval Workflow" />
                </div>
                <div className="space-y-2">
                  <Label>Module Scope (optional)</Label>
                  <Input value={templateEditDialog?.moduleScope || ''} onChange={(e) => setTemplateEditDialog(prev => prev ? { ...prev, moduleScope: e.target.value } : null)} placeholder="e.g. PRODUCT" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={templateEditDialog?.description || ''} onChange={(e) => setTemplateEditDialog(prev => prev ? { ...prev, description: e.target.value } : null)} placeholder="Describe the purpose..." rows={2} />
              </div>

              <Separator />

              {/* States Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2"><CircleDot className="w-4 h-4" /> States ({templateEditDialog?.states.length || 0})</Label>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setTemplateEditDialog(prev => prev ? {
                    ...prev,
                    states: [...prev.states, { stateCode: '', stateName: '', stateType: 'DRAFT', color: '#6b7280', isInitial: false, isFinal: false, sortOrder: prev.states.length }],
                  } : null)}>
                    <Plus className="w-3.5 h-3.5" /> Add State
                  </Button>
                </div>

                <div className="space-y-3">
                  {templateEditDialog?.states.map((s, idx) => (
                    <Card key={idx} className="shadow-none border">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            <Badge variant="outline" className="text-xs font-mono">State {idx + 1}</Badge>
                          </div>
                          {templateEditDialog.states.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setTemplateEditDialog(prev => prev ? { ...prev, states: prev.states.filter((_, i) => i !== idx) } : null)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">State Code</Label>
                            <Input value={s.stateCode} onChange={(e) => { const ns = [...templateEditDialog.states]; ns[idx] = { ...ns[idx], stateCode: e.target.value.toUpperCase() }; setTemplateEditDialog(prev => prev ? { ...prev, states: ns } : null); }} placeholder="DRAFT" className="h-8" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">State Name</Label>
                            <Input value={s.stateName} onChange={(e) => { const ns = [...templateEditDialog.states]; ns[idx] = { ...ns[idx], stateName: e.target.value }; setTemplateEditDialog(prev => prev ? { ...prev, states: ns } : null); }} placeholder="Draft" className="h-8" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">State Type</Label>
                            <Select value={s.stateType} onValueChange={(v) => { const ns = [...templateEditDialog.states]; ns[idx] = { ...ns[idx], stateType: v }; setTemplateEditDialog(prev => prev ? { ...prev, states: ns } : null); }}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs">Color</Label>
                            <ColorPickerInput value={s.color} onChange={(c) => { const ns = [...templateEditDialog.states]; ns[idx] = { ...ns[idx], color: c }; setTemplateEditDialog(prev => prev ? { ...prev, states: ns } : null); }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={s.isInitial} onCheckedChange={(v) => { const ns = [...templateEditDialog.states]; ns[idx] = { ...ns[idx], isInitial: !!v }; setTemplateEditDialog(prev => prev ? { ...prev, states: ns } : null); }} />
                            <span className="text-xs">Initial State (Start)</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={s.isFinal} onCheckedChange={(v) => { const ns = [...templateEditDialog.states]; ns[idx] = { ...ns[idx], isFinal: !!v }; setTemplateEditDialog(prev => prev ? { ...prev, states: ns } : null); }} />
                            <span className="text-xs">Final State (End)</span>
                          </label>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Transitions Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Transitions ({templateEditDialog?.transitions.length || 0})</Label>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setTemplateEditDialog(prev => prev ? {
                    ...prev,
                    transitions: [...prev.transitions, { fromStateCode: prev.states[0]?.stateCode || '', toStateCode: prev.states[1]?.stateCode || '', transitionName: '', condition: '', requiredRole: '', isAuto: false, notifyRoles: [], sortOrder: prev.transitions.length }],
                  } : null)}>
                    <Plus className="w-3.5 h-3.5" /> Add Transition
                  </Button>
                </div>

                <div className="space-y-3">
                  {templateEditDialog?.transitions.map((t, idx) => (
                    <Card key={idx} className="shadow-none border">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs font-mono">Transition {idx + 1}</Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setTemplateEditDialog(prev => prev ? { ...prev, transitions: prev.transitions.filter((_, i) => i !== idx) } : null)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">From State</Label>
                            <Select value={t.fromStateCode} onValueChange={(v) => { const nt = [...templateEditDialog.transitions]; nt[idx] = { ...nt[idx], fromStateCode: v }; setTemplateEditDialog(prev => prev ? { ...prev, transitions: nt } : null); }}>
                              <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {templateEditDialog.states.map(s => <SelectItem key={s.stateCode} value={s.stateCode}>{s.stateName} ({s.stateCode})</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">To State</Label>
                            <Select value={t.toStateCode} onValueChange={(v) => { const nt = [...templateEditDialog.transitions]; nt[idx] = { ...nt[idx], toStateCode: v }; setTemplateEditDialog(prev => prev ? { ...prev, transitions: nt } : null); }}>
                              <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {templateEditDialog.states.map(s => <SelectItem key={s.stateCode} value={s.stateCode}>{s.stateName} ({s.stateCode})</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Transition Name</Label>
                            <Input value={t.transitionName} onChange={(e) => { const nt = [...templateEditDialog.transitions]; nt[idx] = { ...nt[idx], transitionName: e.target.value }; setTemplateEditDialog(prev => prev ? { ...prev, transitions: nt } : null); }} placeholder="Approve" className="h-8" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Required Role</Label>
                            <Select value={t.requiredRole || '__none__'} onValueChange={(v) => { const nt = [...templateEditDialog.transitions]; nt[idx] = { ...nt[idx], requiredRole: v === '__none__' ? '' : v }; setTemplateEditDialog(prev => prev ? { ...prev, transitions: nt } : null); }}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Condition (optional)</Label>
                            <Input value={t.condition} onChange={(e) => { const nt = [...templateEditDialog.transitions]; nt[idx] = { ...nt[idx], condition: e.target.value }; setTemplateEditDialog(prev => prev ? { ...prev, transitions: nt } : null); }} placeholder="completeness >= 100" className="h-8 font-mono text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Notify Roles</Label>
                            <Select value={t.notifyRoles.length > 0 ? t.notifyRoles[0] : '__none__'} onValueChange={(v) => { const nt = [...templateEditDialog.transitions]; nt[idx] = { ...nt[idx], notifyRoles: v === '__none__' ? [] : [v] }; setTemplateEditDialog(prev => prev ? { ...prev, transitions: nt } : null); }}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={t.isAuto} onCheckedChange={(v) => { const nt = [...templateEditDialog.transitions]; nt[idx] = { ...nt[idx], isAuto: !!v }; setTemplateEditDialog(prev => prev ? { ...prev, transitions: nt } : null); }} />
                          <span className="text-xs">Auto-transition (fires when condition is met)</span>
                        </label>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator />

              {/* SLA Configuration */}
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2"><Timer className="w-4 h-4" /> SLA Configuration</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Default Deadline (hours)</Label>
                    <Input type="number" value={templateEditDialog?.slaDeadlineHours || '48'} onChange={(e) => setTemplateEditDialog(prev => prev ? { ...prev, slaDeadlineHours: e.target.value } : null)} className="h-8" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Escalation Rules</Label>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setTemplateEditDialog(prev => prev ? { ...prev, slaEscalations: [...prev.slaEscalations, { afterHours: '24', assignToRole: 'Manager' }] } : null)}>
                      <Plus className="w-3 h-3" /> Add Rule
                    </Button>
                  </div>
                  {templateEditDialog?.slaEscalations.map((esc, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">After</span>
                      <Input type="number" value={esc.afterHours} onChange={(e) => { const ne = [...templateEditDialog.slaEscalations]; ne[idx] = { ...ne[idx], afterHours: e.target.value }; setTemplateEditDialog(prev => prev ? { ...prev, slaEscalations: ne } : null); }} className="h-8 w-20" />
                      <span className="text-xs text-muted-foreground shrink-0">hours →</span>
                      <Select value={esc.assignToRole} onValueChange={(v) => { const ne = [...templateEditDialog.slaEscalations]; ne[idx] = { ...ne[idx], assignToRole: v }; setTemplateEditDialog(prev => prev ? { ...prev, slaEscalations: ne } : null); }}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setTemplateEditDialog(prev => prev ? { ...prev, slaEscalations: prev.slaEscalations.filter((_, i) => i !== idx) } : null)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Auto-Approval Rules */}
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2"><Zap className="w-4 h-4" /> Auto-Approval Rules (JSON)</Label>
                <p className="text-xs text-muted-foreground">Define conditions that auto-transition records. Format: Array of {'{condition, targetState, description}'} objects.</p>
                <Textarea
                  value={templateEditDialog?.autoApproveRules || ''}
                  onChange={(e) => setTemplateEditDialog(prev => prev ? { ...prev, autoApproveRules: e.target.value } : null)}
                  placeholder='[{"condition": "completeness >= 100", "targetState": "APPROVED", "description": "Auto-approve high quality data"}]'
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>

              {/* Preview diagram */}
              {templateEditDialog && templateEditDialog.states.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Preview</Label>
                    <div className="bg-muted/30 rounded-lg p-3 border">
                      <VisualWorkflowDiagram
                        states={templateEditDialog.states.map((s, i) => ({ id: `preview-${i}`, ...s, sortOrder: i }))}
                        transitions={templateEditDialog.transitions.map((t, i) => {
                          const fromIdx = templateEditDialog.states.findIndex(s => s.stateCode === t.fromStateCode);
                          const toIdx = templateEditDialog.states.findIndex(s => s.stateCode === t.toStateCode);
                          return {
                            id: `preview-t-${i}`,
                            fromStateId: `preview-${fromIdx}`,
                            toStateId: `preview-${toIdx}`,
                            transitionName: t.transitionName,
                            condition: t.condition || null,
                            requiredRole: t.requiredRole || null,
                            isAuto: t.isAuto,
                            notifyRoles: t.notifyRoles ? JSON.stringify(t.notifyRoles) : null,
                            sortOrder: i,
                            fromState: { id: `preview-${fromIdx}`, ...templateEditDialog.states[fromIdx], sortOrder: fromIdx } as WFState,
                            toState: { id: `preview-${toIdx}`, ...templateEditDialog.states[toIdx], sortOrder: toIdx } as WFState,
                          };
                        })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setTemplateEditDialog(null)}>Cancel</Button>
            <Button onClick={handleTemplateSave}
              disabled={templateProcessing || !templateEditDialog?.name || templateEditDialog?.states.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {templateProcessing ? 'Saving...' : templateEditDialog?.mode === 'create' ? 'Create Template' : 'Update Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* State Detail Dialog */}
      <Dialog open={!!stateDetailDialog} onOpenChange={() => setStateDetailDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {stateDetailDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: stateDetailDialog.color }} />
                  {stateDetailDialog.stateName}
                </DialogTitle>
                <DialogDescription>State details and configuration</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">State Code</p>
                    <p className="text-sm font-mono font-bold">{stateDetailDialog.stateCode}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">State Type</p>
                    <p className="text-sm font-bold">{stateDetailDialog.stateType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg border p-3 flex-1">
                    <p className="text-xs text-muted-foreground">Color</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-5 h-5 rounded-full" style={{ backgroundColor: stateDetailDialog.color }} />
                      <span className="text-sm font-mono">{stateDetailDialog.color}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 flex-1">
                    <p className="text-xs text-muted-foreground">Flags</p>
                    <div className="flex items-center gap-2 mt-1">
                      {stateDetailDialog.isInitial && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border text-[10px]">Initial</Badge>}
                      {stateDetailDialog.isFinal && <Badge className="bg-purple-50 text-purple-700 border-purple-200 border text-[10px]">Final</Badge>}
                      {!stateDetailDialog.isInitial && !stateDetailDialog.isFinal && <Badge variant="outline" className="text-[10px]">Intermediate</Badge>}
                    </div>
                  </div>
                </div>

                {/* Show transitions from/to this state */}
                {selectedTemplate && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Transitions from this state</p>
                      {selectedTemplate.transitions.filter(t => t.fromStateId === stateDetailDialog.id).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No outgoing transitions</p>
                      ) : (
                        selectedTemplate.transitions.filter(t => t.fromStateId === stateDetailDialog.id).map(t => (
                          <div key={t.id} className="flex items-center gap-2 p-2 rounded border">
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: t.toState.color }} />
                            <span className="text-sm">{t.transitionName}</span>
                            {t.requiredRole && <Badge variant="outline" className="text-[9px] ml-auto">{t.requiredRole}</Badge>}
                            {t.isAuto && <Zap className="w-3 h-3 text-purple-600 shrink-0" />}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Transitions to this state</p>
                      {selectedTemplate.transitions.filter(t => t.toStateId === stateDetailDialog.id).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No incoming transitions</p>
                      ) : (
                        selectedTemplate.transitions.filter(t => t.toStateId === stateDetailDialog.id).map(t => (
                          <div key={t.id} className="flex items-center gap-2 p-2 rounded border">
                            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: t.fromState.color }} />
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm">{t.transitionName}</span>
                            {t.requiredRole && <Badge variant="outline" className="text-[9px] ml-auto">{t.requiredRole}</Badge>}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStateDetailDialog(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
