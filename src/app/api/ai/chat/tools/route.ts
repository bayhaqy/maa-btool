import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { AI_TOOLS, type ToolDef } from '@/lib/ai-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/chat/tools
 *
 * Returns available AI tools, filtered by the user's permissions.
 * Used by the frontend to display the "Tools" panel.
 */
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiPerm = hasPermission(tokenPayload.roles, 'ai:read');
    if (!hasAiPerm) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Filter tools by user permissions
    const availableTools: ToolDef[] = AI_TOOLS.filter(tool => {
      return hasPermission(tokenPayload.roles, tool.requiredPermission);
    });

    // Group by category
    const grouped = {
      read: availableTools.filter(t => t.category === 'read'),
      write: availableTools.filter(t => t.category === 'write'),
      workflow: availableTools.filter(t => t.category === 'workflow'),
      ai: availableTools.filter(t => t.category === 'ai'),
      asset: availableTools.filter(t => t.category === 'asset'),
    };

    return NextResponse.json({
      tools: availableTools.map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        isWrite: t.isWrite,
        requiresConfirmation: t.requiresConfirmation,
        requiredPermission: t.requiredPermission,
        parameters: t.parameters,
      })),
      grouped,
      totalAvailable: availableTools.length,
      totalTools: AI_TOOLS.length,
    });
  } catch (error) {
    console.error('AI Tools GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
