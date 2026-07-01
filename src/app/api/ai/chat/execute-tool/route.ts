import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { executeToolCall, getToolDef } from '@/lib/ai-tools';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/chat/execute-tool
 *
 * Execute a confirmed tool call after the user approves it.
 * This is used for destructive operations that require user confirmation.
 *
 * Body: {
 *   toolName: string;
 *   args: Record<string, unknown>;
 *   conversationId?: string;
 *   confirmed: boolean;  // Must be true to execute
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiPerm = hasPermission(tokenPayload.roles, 'ai:read');
    if (!hasAiPerm) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: ai:read' }, { status: 403 });
    }

    const rl = rateLimitByCategory('ai', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { toolName, args, confirmed } = body;

    if (!toolName || !args) {
      return NextResponse.json({ error: 'toolName and args are required' }, { status: 400 });
    }

    const toolDef = getToolDef(String(toolName));
    if (!toolDef) {
      return NextResponse.json({ error: `Unknown tool: ${toolName}` }, { status: 400 });
    }

    if (!toolDef.requiresConfirmation) {
      return NextResponse.json({ error: `Tool ${toolName} does not require confirmation. Use regular chat instead.` }, { status: 400 });
    }

    if (!confirmed) {
      // User rejected the action
      await logAudit({
        action: 'AI_CONFIG_CHANGE',
        entityType: 'AI_TOOL_CALL',
        description: `User rejected AI tool call: ${toolName}`,
        userId: tokenPayload.userId,
        companyId: tokenPayload.companyId,
        newValues: { tool: toolName, args, confirmed: false },
        severity: 'info',
      });

      return NextResponse.json({
        success: false,
        rejected: true,
        message: `Operation ${toolName} was rejected by the user.`,
      });
    }

    // Execute the confirmed tool call with skipConfirmation=true
    const result = await executeToolCall(
      String(toolName),
      args as Record<string, unknown>,
      tokenPayload.companyId,
      tokenPayload.userId,
      tokenPayload.roles,
      true, // skipConfirmation — user already confirmed
    );

    // Log the confirmation in audit trail
    await logAudit({
      action: 'AI_CONFIG_CHANGE',
      entityType: 'AI_TOOL_CALL',
      description: `User confirmed AI tool call: ${toolName}`,
      userId: tokenPayload.userId,
      companyId: tokenPayload.companyId,
      newValues: { tool: toolName, args, confirmed: true, result: result.success ? 'success' : 'failed' },
      severity: 'warning',
    });

    return NextResponse.json({
      success: result.success,
      data: result.data,
      error: result.error,
      toolName: String(toolName),
    });
  } catch (error) {
    console.error('Execute-tool error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
