import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';

const SYSTEM_PROMPT = `You are MAA BTOOL AI Assistant, an intelligent helper for the MAA BTOOL Enterprise Master Data Management system. You help users with data management tasks, explain workflows, suggest best practices, and assist with MDM operations. Be concise and helpful.

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
- Providing recommendations for data management`;

// GET /api/ai/chat?userId=xxx - List conversations
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
    const userId = searchParams.get('userId') || tokenPayload.userId;

    // Non-super-admins can only see their own conversations
    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && userId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const conversations = await db.aiConversation.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1, // Just get the last message for preview
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('AI Chat GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/ai/chat - Send message to AI assistant
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

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    let conversation;
    let messages: Array<{ role: string; content: string }> = [];

    if (conversationId) {
      // Continue existing conversation
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

      // Build message history
      messages = conversation.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));
    } else {
      // Create new conversation
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      conversation = await db.aiConversation.create({
        data: {
          userId: tokenPayload.userId,
          title,
        },
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

    // Build the messages array for the AI
    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
      { role: 'user', content: message },
    ];

    // Call AI using z-ai-web-dev-sdk
    let aiResponse: string;
    let tokensUsed = 0;

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();
      const response = await zai.chat.completions.create({
        messages: aiMessages,
        stream: false,
      });

      aiResponse = response?.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';
      tokensUsed = response?.usage?.total_tokens || 0;
    } catch (aiError) {
      console.error('AI SDK error:', aiError);
      // Fallback response when AI is unavailable
      aiResponse = generateFallbackResponse(message);
    }

    // Save assistant message
    const assistantMessage = await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse,
        tokensUsed,
      },
    });

    // Update conversation timestamp
    await db.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      message: assistantMessage,
    });
  } catch (error) {
    console.error('AI Chat POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Fallback response generator when AI SDK is unavailable
function generateFallbackResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('create') && lower.includes('record')) {
    return 'To create a new record:\n1. Navigate to **Data Records**\n2. Select the target module\n3. Click **Create** button\n4. Fill in the required fields\n5. Save as Draft or Submit for Review\n\nRequired fields are marked with an asterisk (*). The approval workflow will depend on the module configuration.';
  }

  if (lower.includes('approve') || lower.includes('review')) {
    return 'To approve records:\n1. Navigate to the **Workflow** page\n2. Find the pending approval ticket\n3. Review the changes in the delta\n4. Click **Approve** or **Reject**\n5. Add review notes if needed\n\nOnly users with the Manager or Super Admin role can approve records.';
  }

  if (lower.includes('import') || lower.includes('bulk') || lower.includes('export')) {
    return 'For bulk operations:\n1. Navigate to **Bulk Import** page\n2. Select the module\n3. Choose "Paste Data" or "Upload File" tab\n4. For upload: drag & drop .xlsx, .xls, or .csv files\n5. For export: click Export to download data\n\nDownload the template first to ensure correct format.';
  }

  if (lower.includes('api') && (lower.includes('key') || lower.includes('token'))) {
    return 'To manage API keys:\n1. Navigate to **API Keys** section\n2. Click **Create New Key**\n3. Set name, permissions, and rate limit\n4. Save the raw key - it\'s shown only once!\n5. Use the key in your Authorization header\n\nProduction keys have 1000 req/min, testing keys have 100 req/min.';
  }

  if (lower.includes('sftp') || lower.includes('sync')) {
    return 'To set up SFTP sync:\n1. Navigate to **SFTP Configuration**\n2. Click **Add New Configuration**\n3. Enter host, port, credentials\n4. Set sync direction (INBOUND/OUTBOUND/BIDIRECTIONAL)\n5. Configure schedule and file pattern\n6. Test the connection before enabling\n\nSFTP Manager role is required for this operation.';
  }

  if (lower.includes('image') || lower.includes('photo') || lower.includes('upload')) {
    return 'To upload images:\n1. Open a record detail\n2. Find the IMAGE type field\n3. Click the upload button\n4. Select your image file\n5. Set as primary if needed\n\nSupported formats: PNG, JPG, GIF, WebP. Images are stored in /public/uploads/.';
  }

  if (lower.includes('status') || lower.includes('workflow') || lower.includes('draft')) {
    return 'Record status workflow:\n- **DRAFT** → Initial state, editable\n- **IN_REVIEW** → Submitted for approval\n- **ACTIVE** → Approved and live\n- **REJECTED** → Declined, can be revised\n- **ARCHIVED** → Soft-deleted\n\nOnly Super Admins can bypass the approval workflow.';
  }

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return 'Hello! I\'m the MAA BTOOL AI Assistant. I can help you with:\n- Creating and managing master data\n- Understanding workflows and approvals\n- Bulk import/export operations\n- API key and SFTP configuration\n- Best practices for data quality\n\nWhat would you like to know?';
  }

  return 'I\'m the MAA BTOOL AI Assistant. I can help you with master data management tasks including:\n\n- **Record Management**: Creating, editing, and approving records\n- **Workflows**: Understanding status transitions and approval processes\n- **Bulk Operations**: Importing and exporting data\n- **Integrations**: API keys and SFTP configuration\n- **Best Practices**: Data quality and governance\n\nPlease ask a specific question and I\'ll do my best to help!';
}
