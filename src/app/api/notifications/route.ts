import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission, isSuperAdmin as checkSuperAdmin } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface NotificationItem {
  id: string;
  type: 'approval' | 'audit' | 'system';
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  severity: 'info' | 'warning' | 'success' | 'error';
  actionLabel?: string;
  actionPage?: string;
  actionParams?: Record<string, string>;
}

/**
 * GET /api/notifications
 * Aggregates notifications from multiple sources:
 * - Pending approval tickets (for managers/admins)
 * - Recent audit log entries (for admins)
 * - System health alerts
 *
 * Returns notifications sorted by timestamp (most recent first).
 */
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notifications: NotificationItem[] = [];
    const isManager = hasPermission(tokenPayload.roles, 'data:approve');
    const isSuperAdmin = checkSuperAdmin(tokenPayload.roles);
    const canViewAudit = hasPermission(tokenPayload.roles, 'audit:read') || isSuperAdmin;

    // 1. Pending approval tickets (managers + admins)
    if (isManager) {
      try {
        const pendingTickets = await db.approvalTicket.findMany({
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            record: {
              include: {
                module: { select: { moduleCode: true, moduleName: true } },
                company: { select: { companyCode: true, companyName: true } },
              },
            },
            requestedBy: { select: { username: true, displayName: true } },
          },
        });

        for (const ticket of pendingTickets) {
          const moduleName = ticket.record?.module?.moduleName || 'Record';
          const companyName = ticket.record?.company?.companyName || '';
          const requesterName = ticket.requestedBy?.displayName || ticket.requestedBy?.username || 'Unknown';
          notifications.push({
            id: `approval-${ticket.id}`,
            type: 'approval',
            title: `Approval needed: ${moduleName}`,
            description: `${requesterName} requested a change${companyName ? ` · ${companyName}` : ''}`,
            timestamp: ticket.createdAt.toISOString(),
            read: false,
            severity: 'warning',
            actionLabel: 'Review',
            actionPage: 'workflow',
          });
        }
      } catch (dbError) {
        console.error('Notifications: approval query failed:', dbError);
      }
    }

    // 2. Recently approved/rejected tickets (feedback for submitters)
    try {
      const recentReviewed = await db.approvalTicket.findMany({
        where: {
          status: { in: ['APPROVED', 'REJECTED'] },
          requestedById: tokenPayload.userId,
        },
        orderBy: { reviewedAt: 'desc' },
        take: 3,
        include: {
          record: {
            include: {
              module: { select: { moduleName: true } },
            },
          },
          reviewedBy: { select: { username: true, displayName: true } },
        },
      });

      for (const ticket of recentReviewed) {
        const moduleName = ticket.record?.module?.moduleName || 'Record';
        const reviewerName = ticket.reviewedBy?.displayName || ticket.reviewedBy?.username || 'System';
        const isApproved = ticket.status === 'APPROVED';
        notifications.push({
          id: `reviewed-${ticket.id}`,
          type: 'approval',
          title: `${isApproved ? '✓ Approved' : '✗ Rejected'}: ${moduleName}`,
          description: `${reviewerName} ${isApproved ? 'approved' : 'rejected'} your request${ticket.reviewNotes ? ` · ${ticket.reviewNotes.substring(0, 60)}` : ''}`,
          timestamp: (ticket.reviewedAt || ticket.createdAt).toISOString(),
          read: false,
          severity: isApproved ? 'success' : 'error',
          actionLabel: 'View',
          actionPage: 'workflow',
        });
      }
    } catch (dbError) {
      console.error('Notifications: reviewed tickets query failed:', dbError);
    }

    // 3. Recent audit log entries (admins only)
    if (canViewAudit) {
      try {
        const recentAudit = await db.auditLog.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            user: { select: { username: true, displayName: true } },
          },
        });

        for (const log of recentAudit) {
          const userName = log.user?.displayName || log.user?.username || 'System';
          notifications.push({
            id: `audit-${log.id}`,
            type: 'audit',
            title: `${log.action}: ${log.entityType}`,
            description: `${userName}${log.moduleName ? ` · ${log.moduleName}` : ''}${log.description ? ` · ${log.description.substring(0, 50)}` : ''}`,
            timestamp: log.createdAt.toISOString(),
            read: true,
            severity: 'info',
            actionLabel: 'View Audit',
            actionPage: 'audit-log',
          });
        }
      } catch (dbError) {
        console.error('Notifications: audit query failed:', dbError);
      }
    }

    // 4. System health check (super admins)
    if (isSuperAdmin) {
      try {
        const pendingTicketsCount = await db.approvalTicket.count({
          where: { status: 'PENDING' },
        });
        if (pendingTicketsCount > 10) {
          notifications.push({
            id: 'system-pending-backlog',
            type: 'system',
            title: '⚠️ Approval backlog detected',
            description: `${pendingTicketsCount} pending approvals awaiting review`,
            timestamp: new Date().toISOString(),
            read: false,
            severity: 'warning',
            actionLabel: 'Review All',
            actionPage: 'workflow',
          });
        }
      } catch (dbError) {
        console.error('Notifications: system health query failed:', dbError);
      }
    }

    // Sort by timestamp (most recent first)
    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      notifications: notifications.slice(0, 15), // Cap at 15 items
      unreadCount,
      total: notifications.length,
    });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error', notifications: [], unreadCount: 0 },
      { status: 500 },
    );
  }
}
