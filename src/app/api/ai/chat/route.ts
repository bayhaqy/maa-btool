import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isAIConfigured } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are MAA BTOOL AI Assistant, an intelligent helper for the MAA BTOOL Enterprise Master Data Management system. You help users with data management tasks, explain workflows, suggest best practices, and assist with MDM operations.

Key information about the system:
- MAA BTOOL manages master data for the MAPI Group (PT Mitra Adiperkasa Tbk) and its subsidiaries
- Companies: MAPI (retail), MAPA (sports/lifestyle), MBA (F&B), MAPD (digital), MAPP (property), MAPL (logistics)
- Modules: Article Master, Budget, Asset, Store Master, Supplier Master, Pricing Master, Promotion Master
- Record statuses: DRAFT → IN_REVIEW → ACTIVE/REJECTED → ARCHIVED
- Features: CRUD operations, approval workflow, bulk import/export, hierarchy management, image upload, API keys, SFTP sync, documentation

You can help with:
- Explaining how to use MDM features
- Suggesting data quality best practices
- Guiding users through workflows
- Answering questions about the system
- Providing recommendations for data management

Format your responses using Markdown when helpful: use **bold** for emphasis, bullet lists, numbered steps, and fenced code blocks (\`\`\`) for code or commands. Be concise but thorough.`;

// GET /api/ai/chat?userId=xxx                    → list conversations for user
// GET /api/ai/chat?conversationId=xxx            → full conversation with all messages
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiRole = tokenPayload.roles.some(r => ['Super Admin', 'AI User', 'Manager'].includes(r));
    if (!hasAiRole) {
      return NextResponse.json({ error: 'Access denied. AI User role required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    // ---- Full conversation with messages ----
    if (conversationId) {
      const conversation = await db.aiConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
      if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      return NextResponse.json({ conversation });
    }

    // ---- Conversation list ----
    const userId = searchParams.get('userId') || tokenPayload.userId;
    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && userId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const conversations = await db.aiConversation.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
      orderBy: [{ pinned: 'desc' }, { bookmarked: 'desc' }, { updatedAt: 'desc' }],
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('AI Chat GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/ai/chat — Send message to AI assistant (non-streaming)
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiRole = tokenPayload.roles.some(r => ['Super Admin', 'AI User', 'Manager'].includes(r));
    if (!hasAiRole) {
      return NextResponse.json({ error: 'Access denied. AI User role required.' }, { status: 403 });
    }

    const body = await request.json();
    const { message, conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    let conversation;
    let history: Array<{ role: string; content: string }> = [];

    if (conversationId) {
      conversation = await db.aiConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      if (conversation.userId !== tokenPayload.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      history = conversation.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));
    } else {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      conversation = await db.aiConversation.create({
        data: { userId: tokenPayload.userId, title },
      });
    }

    // Save user message
    await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        userId: tokenPayload.userId,
        role: 'user',
        content: message,
      },
    });

    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: message },
    ];

    let aiResponse: string;
    let tokensUsed = 0;
    const aiConfigured = isAIConfigured();

    if (aiConfigured) {
      try {
        const { getAIClient } = await import('@/lib/ai');
        const zai = await getAIClient();
        const response = await zai.chat.completions.create({
          model: 'glm-4-plus',
          messages: aiMessages,
          stream: false,
        });
        aiResponse = response?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';
        tokensUsed = response?.usage?.total_tokens || 0;
      } catch (aiError) {
        console.error('AI SDK error:', aiError);
        const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
        aiResponse = `_⚠️ AI Error: ${errMsg}_\n\n` + generateFallbackResponse(message, true);
      }
    } else {
      // AI not configured — use fallback (demo mode)
      aiResponse = generateFallbackResponse(message, false);
    }

    const assistantMessage = await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse,
        tokensUsed,
      },
    });

    await db.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      message: assistantMessage,
      aiConfigured,
    });
  } catch (error) {
    console.error('AI Chat POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/ai/chat — Update conversation (bookmark/unbookmark/pin/unpin/rename)
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiRole = tokenPayload.roles.some(r => ['Super Admin', 'AI User', 'Manager'].includes(r));
    if (!hasAiRole) {
      return NextResponse.json({ error: 'Access denied. AI User role required.' }, { status: 403 });
    }

    const body = await request.json();
    const { conversationId, action, title } = body;

    if (!conversationId || !action) {
      return NextResponse.json({ error: 'conversationId and action are required' }, { status: 400 });
    }

    const conversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let data: Record<string, unknown> = {};
    switch (action) {
      case 'bookmark':
        data = { bookmarked: true, bookmarkedAt: new Date() };
        break;
      case 'unbookmark':
        data = { bookmarked: false, bookmarkedAt: null };
        break;
      case 'pin':
        data = { pinned: true };
        break;
      case 'unpin':
        data = { pinned: false };
        break;
      case 'rename':
        if (!title || typeof title !== 'string') {
          return NextResponse.json({ error: 'title is required for rename' }, { status: 400 });
        }
        data = { title: title.trim().slice(0, 200) };
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updated = await db.aiConversation.update({ where: { id: conversationId }, data });
    return NextResponse.json({ conversation: updated });
  } catch (error) {
    console.error('AI Chat PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/ai/chat?conversationId=xxx — Delete conversation + all messages (cascade)
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAiRole = tokenPayload.roles.some(r => ['Super Admin', 'AI User', 'Manager'].includes(r));
    if (!hasAiRole) {
      return NextResponse.json({ error: 'Access denied. AI User role required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const conversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && conversation.userId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Cascade delete on AiMessage is configured in schema
    await db.aiConversation.delete({ where: { id: conversationId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI Chat DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Fallback response generator when AI SDK is unavailable or not configured
function generateFallbackResponse(userMessage: string, aiConfigured: boolean): string {
  const lower = userMessage.toLowerCase();
  const prefix = aiConfigured
    ? ''
    : '_Note: AI service is not configured (`ZAI_API_KEY` env var missing) — showing a demo response. Once the API key is set in Vercel, full AI responses will be available._\n\n';

  let body = '';

  if (lower.includes('create') && lower.includes('record')) {
    body = `To create a new record:

1. Navigate to **Data Records**
2. Select the target module (e.g. Article Master)
3. Click the **Create** button
4. Fill in the required fields (marked with \`\*\`)
5. Save as **Draft** or **Submit for Review**

\`\`\`text
DRAFT → IN_REVIEW → ACTIVE
\`\`\`

Required fields are marked with an asterisk. The approval workflow will depend on the module configuration.`;
  } else if (lower.includes('approve') || lower.includes('review') || lower.includes('workflow')) {
    body = `To approve records:

1. Navigate to the **Workflow** page
2. Find the pending approval ticket
3. Review the changes in the diff panel
4. Click **Approve** or **Reject**
5. Add review notes if needed

Only users with the **Manager** or **Super Admin** role can approve records. Use the **"Lihat Detail Perubahan"** button to see a full field-by-field breakdown of the proposed changes.`;
  } else if (lower.includes('import') || lower.includes('bulk') || lower.includes('export')) {
    body = `For bulk operations:

1. Navigate to **Bulk Import** page
2. Select the module
3. Choose **Paste Data** or **Upload File** tab
4. For upload: drag & drop \`.xlsx\`, \`.xls\`, or \`.csv\` files
5. For export: click **Export** to download data

\`\`\`bash
# Supported formats
.xlsx .xls .csv
\`\`\`

Download the template first to ensure correct column format.`;
  } else if (lower.includes('api') && (lower.includes('key') || lower.includes('token'))) {
    body = `To manage API keys:

1. Navigate to **API Keys** section
2. Click **Create New Key**
3. Set name, permissions, and rate limit
4. Save the raw key — it's shown only once!
5. Use the key in your \`Authorization\` header

\`\`\`http
Authorization: Bearer YOUR_API_KEY
\`\`\`

Production keys have **1000 req/min**, testing keys have **100 req/min**.`;
  } else if (lower.includes('sftp') || lower.includes('sync')) {
    body = `To set up SFTP sync:

1. Navigate to **SFTP Configuration**
2. Click **Add New Configuration**
3. Enter host, port, credentials
4. Set sync direction (\`INBOUND\` / \`OUTBOUND\` / \`BIDIRECTIONAL\`)
5. Configure schedule and file pattern
6. Test the connection before enabling

**SFTP Manager** role is required for this operation.`;
  } else if (lower.includes('image') || lower.includes('photo') || lower.includes('upload')) {
    body = `To upload images:

1. Open a record detail page
2. Find the **IMAGE** type field
3. Click the upload button
4. Select your image file
5. Set as primary if needed

Supported formats: **PNG, JPG, GIF, WebP**. Images are stored in \`/public/uploads/\`.`;
  } else if (lower.includes('status') || lower.includes('draft') || lower.includes('lifecycle')) {
    body = `Record status workflow:

\`\`\`text
DRAFT → IN_REVIEW → ACTIVE
                ↘ REJECTED
ACTIVE → ARCHIVED
\`\`\`

- **DRAFT** — Initial state, editable
- **IN_REVIEW** — Submitted for approval
- **ACTIVE** — Approved and live
- **REJECTED** — Declined, can be revised
- **ARCHIVED** — Soft-deleted

Only **Super Admins** can bypass the approval workflow.`;
  } else if (lower.includes('hello') || lower.includes('hi ') || lower.startsWith('hi') || lower.includes('hey')) {
    body = `Hello! I'm the **MAA BTOOL AI Assistant**. I can help you with:

- **Record Management** — Creating, editing, and approving records
- **Workflows** — Understanding status transitions and approval processes
- **Bulk Operations** — Importing and exporting data
- **Integrations** — API keys and SFTP configuration
- **Best Practices** — Data quality and governance

What would you like to know?`;
  } else {
    body = `I'm the **MAA BTOOL AI Assistant**. I can help you with master data management tasks including:

- **Record Management**: Creating, editing, and approving records
- **Workflows**: Understanding status transitions and approval processes
- **Bulk Operations**: Importing and exporting data
- **Integrations**: API keys and SFTP configuration
- **Best Practices**: Data quality and governance

Try asking me:
- "How do I create a new record?"
- "Explain the approval workflow"
- "How to manage API keys?"
- "Best practices for bulk import"`;
  }

  return prefix + body;
}
