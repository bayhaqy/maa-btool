import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  STATUS_ACTIVE,
  STATUS_REVISION_PENDING,
} from '@/lib/auth';
import { jsonVal, jsonParse } from '@/lib/db-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// Types
// ============================================================

interface ReviewBody {
  outputId: string;
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
}

// ============================================================
// GET /api/ai-prompts/review           → list PENDING_REVIEW outputs
// GET /api/ai-prompts/review?status=X  → filter by status (default PENDING_REVIEW)
// GET /api/ai-prompts/review?id=xxx    → single output (any status)
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed =
      tokenPayload.roles.includes('Super Admin') ||
      tokenPayload.roles.includes('Manager');
    if (!allowed) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin or Manager role required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status') || 'PENDING_REVIEW';

    if (id) {
      const output = await db.aiOutput.findUnique({
        where: { id },
        include: {
          prompt: true,
        },
      });
      if (!output) {
        return NextResponse.json({ error: 'Output not found' }, { status: 404 });
      }
      // Attach the record payload for the UI diff view.
      const record = await db.dataRecord.findUnique({
        where: { id: output.recordId },
        select: { id: true, status: true, currentPayload: true, moduleId: true },
      });
      return NextResponse.json({ output, record });
    }

    const outputs = await db.aiOutput.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: { prompt: true },
      take: 200,
    });

    return NextResponse.json({ outputs });
  } catch (error) {
    console.error('AI review GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// POST /api/ai-prompts/review — approve or reject an AiOutput
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed =
      tokenPayload.roles.includes('Super Admin') ||
      tokenPayload.roles.includes('Manager');
    if (!allowed) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin or Manager role required.' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as ReviewBody;
    const { outputId, action, rejectionReason } = body;

    if (!outputId || !['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { error: 'outputId and action (APPROVE|REJECT) are required' },
        { status: 400 }
      );
    }

    const aiOutput = await db.aiOutput.findUnique({
      where: { id: outputId },
      include: { prompt: true },
    });
    if (!aiOutput) {
      return NextResponse.json({ error: 'AI output not found' }, { status: 404 });
    }

    if (aiOutput.status !== 'PENDING_REVIEW') {
      return NextResponse.json(
        {
          error: `Output already reviewed (status=${aiOutput.status})`,
        },
        { status: 422 }
      );
    }

    // ── REJECT branch ──
    if (action === 'REJECT') {
      const updated = await db.aiOutput.update({
        where: { id: outputId },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason || null,
          reviewedById: tokenPayload.userId,
          reviewedAt: new Date(),
        },
      });

      await logAudit({
        userId: tokenPayload.userId,
        action: 'AI_REVIEW_REJECT',
        entityType: 'AiOutput',
        entityId: outputId,
        description: `Rejected AI output for prompt ${aiOutput.promptId} (reason: ${rejectionReason || 'n/a'})`,
        newValues: { status: 'REJECTED', rejectionReason },
        companyId: tokenPayload.companyId,
      });

      return NextResponse.json({ output: updated });
    }

    // ── APPROVE branch ──
    // If prompt.outputAttribute is set, copy the output into the record's
    // currentPayload, following the amendment workflow for ACTIVE records.
    let amendmentCreated = false;
    if (aiOutput.prompt?.outputAttribute) {
      const record = await db.dataRecord.findUnique({
        where: { id: aiOutput.recordId },
      });
      if (record) {
        let payload: Record<string, unknown> = {};
        try {
          payload = record.currentPayload ? jsonParse<Record<string, unknown>>(record.currentPayload) : {};
        } catch {
          payload = {};
        }
        payload[aiOutput.prompt.outputAttribute] = aiOutput.output;

        if (record.status === STATUS_ACTIVE) {
          // Amendment workflow — snapshot, flip to REVISION_PENDING, open ticket.
          const maxVersion = await db.dataVersion.findFirst({
            where: { recordId: record.id },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          const newVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;

          await db.dataVersion.create({
            data: {
              recordId: record.id,
              payloadSnapshot: jsonVal(payload),
              versionNumber: newVersionNumber,
              changedById: tokenPayload.userId,
              changeReason: `AI enrichment approved (prompt: ${aiOutput.prompt.name})`,
              status: STATUS_REVISION_PENDING,
            },
          });

          await db.dataRecord.update({
            where: { id: record.id },
            data: {
              currentPayload: jsonVal(payload),
              status: STATUS_REVISION_PENDING,
              updatedById: tokenPayload.userId,
            },
          });

          await db.approvalTicket.create({
            data: {
              recordId: record.id,
              requestedById: tokenPayload.userId,
              status: 'PENDING',
              deltaPayload: record.currentPayload,
            },
          });

          amendmentCreated = true;
        } else {
          // DRAFT or REVISION_PENDING → direct update.
          await db.dataRecord.update({
            where: { id: record.id },
            data: {
              currentPayload: jsonVal(payload),
              updatedById: tokenPayload.userId,
            },
          });
        }
      }
    }

    const updated = await db.aiOutput.update({
      where: { id: outputId },
      data: {
        status: 'APPROVED',
        reviewedById: tokenPayload.userId,
        reviewedAt: new Date(),
      },
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'AI_REVIEW_APPROVE',
      entityType: 'AiOutput',
      entityId: outputId,
      description: `Approved AI output for prompt ${aiOutput.promptId}${
        aiOutput.prompt?.outputAttribute
          ? ` → copied to "${aiOutput.prompt.outputAttribute}"`
          : ''
      }${amendmentCreated ? ' (amendment workflow triggered)' : ''}`,
      newValues: {
        status: 'APPROVED',
        targetAttribute: aiOutput.prompt?.outputAttribute,
        amendment: amendmentCreated,
      },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ output: updated, amendmentCreated });
  } catch (error) {
    console.error('AI review POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
