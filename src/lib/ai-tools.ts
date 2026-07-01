/**
 * AI Tool Execution Engine
 *
 * Shared between /api/ai/chat and /api/ai/chat/stream routes.
 * Provides tool definitions, RBAC checks, execution logic, and audit logging.
 */

import { db } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import { jsonVal, jsonParse } from '@/lib/db-json';
import { logAudit } from '@/lib/audit';

// ─── Types ──────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  /** Permission required to execute this tool */
  requiredPermission: string;
  /** Whether this tool requires user confirmation before execution */
  requiresConfirmation: boolean;
  /** Whether this is a write (destructive) operation */
  isWrite: boolean;
  /** Category for display in the tools panel */
  category: 'read' | 'write' | 'workflow' | 'ai' | 'asset';
}

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** For destructive ops that require confirmation: preview of what will happen */
  preview?: {
    action: string;
    target: string;
    details: Record<string, unknown>;
  };
}

// ─── Tool Definitions ──────────────────────────────────────────

export const AI_TOOLS: ToolDef[] = [
  // ─── READ tools ───────────────────────────────────
  {
    name: 'search_records',
    description: 'Search for data records in the MDM system. Returns matching records with their data.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code (e.g., ARTICLE_MASTER, STORE_MASTER, SUPPLIER_MASTER)' },
        search: { type: 'string', description: 'Search query to filter records by content' },
        status: { type: 'string', description: 'Filter by status', enum: ['DRAFT', 'IN_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED'] },
        limit: { type: 'number', description: 'Max results (default 10, max 50)' },
      },
      required: ['moduleCode'],
    },
    requiredPermission: 'data:read',
    requiresConfirmation: false,
    isWrite: false,
    category: 'read',
  },
  {
    name: 'get_record',
    description: 'Get detailed information about a specific data record by ID, including all payload fields, status, version, and audit trail.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID' },
      },
      required: ['recordId'],
    },
    requiredPermission: 'data:read',
    requiresConfirmation: false,
    isWrite: false,
    category: 'read',
  },
  {
    name: 'list_modules',
    description: 'List all available modules in the MDM system with their codes, names, and entity types.',
    parameters: { type: 'object', properties: {} },
    requiredPermission: 'data:read',
    requiresConfirmation: false,
    isWrite: false,
    category: 'read',
  },
  {
    name: 'get_data_quality',
    description: 'Get data quality scores and issues for records. Can filter by module or specific record.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code to filter quality scores' },
        recordId: { type: 'string', description: 'Specific record ID to check quality' },
      },
    },
    requiredPermission: 'data:read',
    requiresConfirmation: false,
    isWrite: false,
    category: 'read',
  },
  {
    name: 'get_hierarchy',
    description: 'Get hierarchy structure for a module. Returns hierarchy tree with nodes and their relationships.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code to get hierarchy for' },
        hierarchyId: { type: 'string', description: 'Specific hierarchy ID (optional)' },
      },
      required: ['moduleCode'],
    },
    requiredPermission: 'hierarchy:read',
    requiresConfirmation: false,
    isWrite: false,
    category: 'read',
  },
  {
    name: 'search_digital_assets',
    description: 'Search digital assets in the DAM (Digital Asset Management) system. Filter by type, name, or associated record.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search query for asset name' },
        assetType: { type: 'string', description: 'Asset type filter', enum: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'SPREADSHEET', 'PRESENTATION', 'OTHER'] },
        recordId: { type: 'string', description: 'Filter assets linked to a specific record' },
        limit: { type: 'number', description: 'Max results (default 10, max 50)' },
      },
    },
    requiredPermission: 'dam:read',
    requiresConfirmation: false,
    isWrite: false,
    category: 'asset',
  },

  // ─── WRITE tools ──────────────────────────────────
  {
    name: 'create_record',
    description: 'Create a new data record in the MDM system. The record will be created in DRAFT status. Requires data:create permission.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code (e.g., ARTICLE_MASTER)' },
        data: { type: 'object', description: 'Record data as key-value pairs. Include name/code for identification.' },
      },
      required: ['moduleCode', 'data'],
    },
    requiredPermission: 'data:create',
    requiresConfirmation: false,
    isWrite: true,
    category: 'write',
  },
  {
    name: 'update_record',
    description: 'Update an existing data record. For ACTIVE records, this triggers the amendment workflow (status changes to REVISION_PENDING). Requires data:edit permission.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID to update' },
        data: { type: 'object', description: 'Fields to update as key-value pairs' },
      },
      required: ['recordId', 'data'],
    },
    requiredPermission: 'data:edit',
    requiresConfirmation: false,
    isWrite: true,
    category: 'write',
  },
  {
    name: 'delete_record',
    description: 'Delete a data record. Only DRAFT records can be deleted directly. ⚠️ DESTRUCTIVE — requires confirmation. Requires data:delete permission.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID to delete' },
      },
      required: ['recordId'],
    },
    requiredPermission: 'data:delete',
    requiresConfirmation: true,
    isWrite: true,
    category: 'write',
  },
  {
    name: 'bulk_update',
    description: 'Update multiple records at once with the same field changes. ⚠️ DESTRUCTIVE — requires confirmation. Requires data:bulk permission.',
    parameters: {
      type: 'object',
      properties: {
        recordIds: { type: 'object', description: 'Array of record IDs to update' },
        data: { type: 'object', description: 'Fields to update on all specified records' },
        moduleCode: { type: 'string', description: 'Module code for the records' },
      },
      required: ['recordIds', 'data'],
    },
    requiredPermission: 'data:bulk',
    requiresConfirmation: true,
    isWrite: true,
    category: 'write',
  },

  // ─── WORKFLOW tools ───────────────────────────────
  {
    name: 'submit_for_approval',
    description: 'Submit a DRAFT record for approval. Changes status to IN_REVIEW. Requires data:edit permission.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID to submit' },
      },
      required: ['recordId'],
    },
    requiredPermission: 'data:edit',
    requiresConfirmation: false,
    isWrite: true,
    category: 'workflow',
  },
  {
    name: 'approve_record',
    description: 'Approve a record that is IN_REVIEW or REVISION_PENDING. Changes status to ACTIVE. ⚠️ Requires confirmation. Requires data:approve permission.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID to approve' },
        comment: { type: 'string', description: 'Optional approval comment' },
      },
      required: ['recordId'],
    },
    requiredPermission: 'data:approve',
    requiresConfirmation: true,
    isWrite: true,
    category: 'workflow',
  },
  {
    name: 'reject_record',
    description: 'Reject a record that is IN_REVIEW. Changes status to REJECTED. ⚠️ Requires confirmation. Requires data:approve permission.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID to reject' },
        reason: { type: 'string', description: 'Reason for rejection (required)' },
      },
      required: ['recordId', 'reason'],
    },
    requiredPermission: 'data:approve',
    requiresConfirmation: true,
    isWrite: true,
    category: 'workflow',
  },

  // ─── AI tools ─────────────────────────────────────
  {
    name: 'enrich_record',
    description: 'Run AI enrichment on a record to suggest missing field values. Returns suggestions without applying them. Requires ai:write permission.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID to enrich' },
        fields: { type: 'object', description: 'Specific fields to enrich (optional — if empty, enriches all missing fields)' },
      },
      required: ['recordId'],
    },
    requiredPermission: 'ai:write',
    requiresConfirmation: false,
    isWrite: false,
    category: 'ai',
  },
  {
    name: 'classify_record',
    description: 'Run AI classification on a record to suggest categories, tags, and attributes. Returns suggestions without applying them. Requires ai:write permission.',
    parameters: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record ID to classify' },
      },
      required: ['recordId'],
    },
    requiredPermission: 'ai:write',
    requiresConfirmation: false,
    isWrite: false,
    category: 'ai',
  },
  {
    name: 'check_quality',
    description: 'Run a data quality check on records. Identifies issues with completeness, consistency, and accuracy. Requires data:read permission.',
    parameters: {
      type: 'object',
      properties: {
        moduleCode: { type: 'string', description: 'Module code to check' },
        recordId: { type: 'string', description: 'Specific record ID to check' },
        checkType: { type: 'string', description: 'Type of quality check', enum: ['completeness', 'consistency', 'accuracy', 'all'] },
      },
    },
    requiredPermission: 'data:read',
    requiresConfirmation: false,
    isWrite: false,
    category: 'ai',
  },

  // ─── ASSET tools ──────────────────────────────────
  {
    name: 'create_digital_asset',
    description: 'Create a new digital asset in the DAM system. Requires dam:upload permission.',
    parameters: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'Name for the digital asset' },
        assetType: { type: 'string', description: 'Asset type', enum: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'SPREADSHEET', 'PRESENTATION', 'OTHER'] },
        recordId: { type: 'string', description: 'Optional record ID to link the asset to' },
        metadata: { type: 'object', description: 'Optional metadata key-value pairs' },
      },
      required: ['fileName', 'assetType'],
    },
    requiredPermission: 'dam:upload',
    requiresConfirmation: false,
    isWrite: true,
    category: 'asset',
  },
];

// ─── Destructive tools list (require confirmation) ─────────────

export const DESTRUCTIVE_TOOLS = AI_TOOLS
  .filter(t => t.requiresConfirmation)
  .map(t => t.name);

/** Get a tool definition by name */
export function getToolDef(name: string): ToolDef | undefined {
  return AI_TOOLS.find(t => t.name === name);
}

/** Check if a tool requires confirmation before execution */
export function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOLS.includes(name);
}

// ─── System Prompt ──────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are MAA BTOOL AI Assistant, an intelligent helper for the MAA BTOOL Enterprise Master Data Management system. You are NOT read-only — you can directly interact with and modify MDM data using the tools available to you.

Key information about the system:
- MAA BTOOL manages master data for the MAPI Group (PT Mitra Adiperkasa Tbk) and its subsidiaries
- Companies: MAPI (retail), MAPA (sports/lifestyle), MBA (F&B), MAPD (digital), MAPP (property), MAPL (logistics)
- Modules: Article Master, Budget, Asset, Store Master, Supplier Master, Pricing Master, Promotion Master, Inventory, Customer Master
- Record statuses: DRAFT → IN_REVIEW → ACTIVE/REJECTED → ARCHIVED
- Features: CRUD operations, approval workflow, bulk import/export, hierarchy management, image upload, API keys, SFTP sync, digital asset management, AI enrichment

## Available Tools

You have access to the following tools that allow you to interact with the MDM system:

### Read Tools (no confirmation needed)
- **search_records**: Search for records by module, keyword, or status
  \`\`\`
  [TOOL_CALL:search_records({"moduleCode": "ARTICLE_MASTER", "search": "Nike", "status": "ACTIVE", "limit": 10})]
  \`\`\`
- **get_record**: Get detailed record information by ID
  \`\`\`
  [TOOL_CALL:get_record({"recordId": "clxxx123"})]
  \`\`\`
- **list_modules**: List all available modules
  \`\`\`
  [TOOL_CALL:list_modules({})]
  \`\`\`
- **get_data_quality**: Get data quality scores for records
  \`\`\`
  [TOOL_CALL:get_data_quality({"moduleCode": "ARTICLE_MASTER"})]
  \`\`\`
- **get_hierarchy**: Get hierarchy structure for a module
  \`\`\`
  [TOOL_CALL:get_hierarchy({"moduleCode": "ARTICLE_MASTER"})]
  \`\`\`
- **search_digital_assets**: Search digital assets in DAM
  \`\`\`
  [TOOL_CALL:search_digital_assets({"search": "product image", "assetType": "IMAGE"})]
  \`\`\`

### Write Tools (confirmation may be required for destructive ops)
- **create_record**: Create new records (DRAFT status)
  \`\`\`
  [TOOL_CALL:create_record({"moduleCode": "ARTICLE_MASTER", "data": {"name": "New Product", "code": "ART-001", "brand": "Nike", "category": "Footwear"}})]
  \`\`\`
- **update_record**: Update existing records (triggers amendment for ACTIVE records)
  \`\`\`
  [TOOL_CALL:update_record({"recordId": "clxxx123", "data": {"selling_price": "599000"}})]
  \`\`\`
- **delete_record**: Delete DRAFT records ⚠️ REQUIRES CONFIRMATION
  \`\`\`
  [TOOL_CALL:delete_record({"recordId": "clxxx123"})]
  \`\`\`
- **bulk_update**: Update multiple records at once ⚠️ REQUIRES CONFIRMATION
  \`\`\`
  [TOOL_CALL:bulk_update({"recordIds": ["id1", "id2"], "data": {"status_note": "Updated by AI"}, "moduleCode": "ARTICLE_MASTER"})]
  \`\`\`

### Workflow Tools
- **submit_for_approval**: Submit DRAFT records for review
  \`\`\`
  [TOOL_CALL:submit_for_approval({"recordId": "clxxx123"})]
  \`\`\`
- **approve_record**: Approve records in review ⚠️ REQUIRES CONFIRMATION
  \`\`\`
  [TOOL_CALL:approve_record({"recordId": "clxxx123", "comment": "Looks good"})]
  \`\`\`
- **reject_record**: Reject records in review ⚠️ REQUIRES CONFIRMATION
  \`\`\`
  [TOOL_CALL:reject_record({"recordId": "clxxx123", "reason": "Missing required fields"})]
  \`\`\`

### AI-Powered Tools
- **enrich_record**: Suggest AI-powered field values for a record
  \`\`\`
  [TOOL_CALL:enrich_record({"recordId": "clxxx123"})]
  \`\`\`
- **classify_record**: Suggest categories and tags for a record
  \`\`\`
  [TOOL_CALL:classify_record({"recordId": "clxxx123"})]
  \`\`\`
- **check_quality**: Run data quality checks (completeness, consistency, accuracy)
  \`\`\`
  [TOOL_CALL:check_quality({"moduleCode": "ARTICLE_MASTER", "checkType": "all"})]
  \`\`\`

### Asset Tools
- **create_digital_asset**: Create a digital asset in DAM
  \`\`\`
  [TOOL_CALL:create_digital_asset({"fileName": "product-photo.jpg", "assetType": "IMAGE", "recordId": "clxxx123"})]
  \`\`\`

## Tool Usage Rules

1. When users ask you to perform actions, use the appropriate tool by outputting \`[TOOL_CALL:tool_name(JSON arguments)]\` on its own line.
2. You can call multiple tools in a single response if needed.
3. For destructive operations (delete, bulk_update, approve, reject), the system will ask the user for confirmation before executing. You should inform the user what will happen and that confirmation is needed.
4. After tool results are returned, summarize the results for the user in a clear and helpful way.
5. If a tool fails due to permissions, inform the user that they don't have the required permission and suggest they contact their administrator.
6. Always verify a record exists before trying to update or delete it — use get_record or search_records first.
7. For update_record on ACTIVE records, explain that this will trigger the amendment workflow.

## Important Guidelines

- Be proactive: If a user asks about data, search for it rather than just explaining how to search.
- Be safe: Always confirm destructive operations. Never delete or approve without user awareness.
- Be helpful: When suggesting changes, show the before/after values clearly.
- Be transparent: Explain what each tool does before calling it.
- Respect permissions: You can only perform actions the user is authorized for.

Format your responses using Markdown when helpful: use **bold** for emphasis, bullet lists, numbered steps, and fenced code blocks for code or commands. Be concise but thorough.`;

// ─── Tool Execution Engine ──────────────────────────────────────

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  companyId: string,
  userId: string,
  userRoles: string[],
  skipConfirmation: boolean = false,
): Promise<ToolCallResult> {
  const toolDef = getToolDef(toolName);

  if (!toolDef) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  // ── RBAC check ─────────────────────────────────────
  if (!hasPermission(userRoles, toolDef.requiredPermission)) {
    return {
      success: false,
      error: `Insufficient permissions. Required: ${toolDef.requiredPermission}. Contact your administrator to request access.`,
    };
  }

  // ── Confirmation check for destructive ops ─────────
  if (toolDef.requiresConfirmation && !skipConfirmation) {
    return await generateConfirmationPreview(toolName, args, companyId);
  }

  // ── Execute tool ───────────────────────────────────
  try {
    const result = await performToolExecution(toolName, args, companyId, userId);

    // ── Audit logging for write operations ─────────────
    if (toolDef.isWrite && result.success) {
      await logAudit({
        action: getAuditAction(toolName),
        entityType: 'DataRecord',
        entityId: (args.recordId as string) || undefined,
        description: `AI Assistant executed ${toolName}`,
        userId,
        companyId,
        newValues: { tool: toolName, args, result: result.data },
        severity: toolDef.requiresConfirmation ? 'warning' : 'info',
      });
    }

    return result;
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Generate a confirmation preview for destructive operations */
async function generateConfirmationPreview(
  toolName: string,
  args: Record<string, unknown>,
  companyId: string,
): Promise<ToolCallResult> {
  try {
    switch (toolName) {
      case 'delete_record': {
        const record = await db.dataRecord.findUnique({
          where: { id: String(args.recordId) },
          include: { module: { select: { moduleCode: true, moduleName: true } } },
        });
        if (!record) return { success: false, error: 'Record not found' };
        if (record.status !== 'DRAFT') return { success: false, error: 'Only DRAFT records can be deleted' };
        const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
        return {
          success: true,
          preview: {
            action: 'DELETE_RECORD',
            target: `${payload.name || payload.recordName || record.id}`,
            details: {
              recordId: record.id,
              moduleName: record.module?.moduleName,
              moduleCode: record.module?.moduleCode,
              status: record.status,
              recordName: payload.name || payload.recordName || 'Unknown',
              fields: Object.keys(payload),
            },
          },
        };
      }

      case 'bulk_update': {
        const recordIds = args.recordIds as string[] || [];
        if (recordIds.length === 0) return { success: false, error: 'No record IDs provided' };

        const records = await db.dataRecord.findMany({
          where: { id: { in: recordIds }, companyId },
          include: { module: { select: { moduleCode: true, moduleName: true } } },
          take: 10,
        });
        const updates = args.data as Record<string, unknown> || {};
        return {
          success: true,
          preview: {
            action: 'BULK_UPDATE',
            target: `${records.length} record(s)`,
            details: {
              affectedCount: records.length,
              requestedCount: recordIds.length,
              updates,
              records: records.map(r => {
                const p = jsonParse<Record<string, unknown>>(r.currentPayload) || {};
                return { id: r.id, name: p.name || p.recordName || 'Unknown', status: r.status };
              }),
            },
          },
        };
      }

      case 'approve_record': {
        const record = await db.dataRecord.findUnique({
          where: { id: String(args.recordId) },
          include: { module: { select: { moduleCode: true, moduleName: true } } },
        });
        if (!record) return { success: false, error: 'Record not found' };
        if (record.status !== 'IN_REVIEW' && record.status !== 'REVISION_PENDING') {
          return { success: false, error: `Record is not in review (status: ${record.status})` };
        }
        const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
        return {
          success: true,
          preview: {
            action: 'APPROVE_RECORD',
            target: `${payload.name || payload.recordName || record.id}`,
            details: {
              recordId: record.id,
              moduleName: record.module?.moduleName,
              currentStatus: record.status,
              newStatus: 'ACTIVE',
              comment: args.comment || '',
            },
          },
        };
      }

      case 'reject_record': {
        const record = await db.dataRecord.findUnique({
          where: { id: String(args.recordId) },
          include: { module: { select: { moduleCode: true, moduleName: true } } },
        });
        if (!record) return { success: false, error: 'Record not found' };
        if (record.status !== 'IN_REVIEW') {
          return { success: false, error: `Record is not in review (status: ${record.status})` };
        }
        const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
        return {
          success: true,
          preview: {
            action: 'REJECT_RECORD',
            target: `${payload.name || payload.recordName || record.id}`,
            details: {
              recordId: record.id,
              moduleName: record.module?.moduleName,
              currentStatus: record.status,
              newStatus: 'REJECTED',
              reason: args.reason || '',
            },
          },
        };
      }

      default:
        return { success: false, error: `No preview available for ${toolName}` };
    }
  } catch (error) {
    console.error(`Preview generation error (${toolName}):`, error);
    return { success: false, error: 'Failed to generate preview' };
  }
}

/** Perform the actual tool execution (no confirmation checks) */
async function performToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  companyId: string,
  userId: string,
): Promise<ToolCallResult> {
  switch (toolName) {
    // ─── READ tools ─────────────────────────────
    case 'search_records': {
      const { moduleCode, search, status, limit = 10 } = args;
      const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
      if (!mod) return { success: false, error: `Module ${moduleCode} not found` };

      const where: Record<string, unknown> = { moduleId: mod.id, companyId };
      if (status) where.status = String(status);

      let records = await db.dataRecord.findMany({
        where,
        take: Math.min(Number(limit) * 3, 150),
        orderBy: { updatedAt: 'desc' },
        include: { module: { select: { moduleCode: true, moduleName: true } } },
      });

      if (search) {
        const term = String(search).toLowerCase();
        records = records.filter(r => {
          const payload = jsonParse<Record<string, unknown>>(r.currentPayload) || {};
          return Object.values(payload).some(v =>
            String(v).toLowerCase().includes(term),
          );
        });
      }

      return { success: true, data: records.slice(0, Math.min(Number(limit), 50)) };
    }

    case 'get_record': {
      const record = await db.dataRecord.findUnique({
        where: { id: String(args.recordId) },
        include: {
          module: { select: { moduleCode: true, moduleName: true } },
          images: { select: { id: true, fileName: true, isPrimary: true, mimeType: true }, take: 5 },
          qualityScores: { take: 10, orderBy: { calculatedAt: 'desc' } },
        },
      });
      if (!record) return { success: false, error: 'Record not found' };
      return { success: true, data: record };
    }

    case 'list_modules': {
      const modules = await db.metaModule.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
      return { success: true, data: modules.map(m => ({ code: m.moduleCode, name: m.moduleName, entityType: m.entityType })) };
    }

    case 'get_data_quality': {
      const { moduleCode, recordId } = args;
      if (recordId) {
        const scores = await db.dataQualityScore.findMany({
          where: { recordId: String(recordId) },
          orderBy: { calculatedAt: 'desc' },
          take: 20,
        });
        return { success: true, data: scores };
      }
      const where: Record<string, unknown> = {};
      if (moduleCode) {
        const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
        if (mod) where.moduleId = mod.id;
      }
      const scores = await db.dataQualityScore.findMany({ where, take: 20, orderBy: { score: 'asc' } });
      return { success: true, data: scores };
    }

    case 'get_hierarchy': {
      const { moduleCode, hierarchyId } = args;
      const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
      if (!mod) return { success: false, error: `Module ${moduleCode} not found` };

      const hierarchyWhere: Record<string, unknown> = { moduleId: mod.id };
      if (hierarchyId) hierarchyWhere.id = String(hierarchyId);

      const hierarchies = await db.hierarchyModel.findMany({
        where: hierarchyWhere,
        include: {
          nodes: {
            include: { record: { select: { id: true, currentPayload: true, status: true } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      return { success: true, data: hierarchies };
    }

    case 'search_digital_assets': {
      const { search, assetType, recordId, limit = 10 } = args;
      const where: Record<string, unknown> = { companyId };
      if (assetType) where.assetType = String(assetType);
      if (recordId) where.recordId = String(recordId);

      let assets = await db.digitalAsset.findMany({
        where,
        take: Math.min(Number(limit), 50),
        orderBy: { createdAt: 'desc' },
        include: {
          variants: { select: { id: true, variant: true, filePath: true, width: true, height: true } },
        },
      });

      if (search) {
        const term = String(search).toLowerCase();
        assets = assets.filter(a =>
          a.fileName.toLowerCase().includes(term) ||
          a.originalFileName.toLowerCase().includes(term)
        );
      }

      return { success: true, data: assets };
    }

    // ─── WRITE tools ────────────────────────────
    case 'create_record': {
      const { moduleCode, data } = args;
      const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
      if (!mod) return { success: false, error: `Module ${moduleCode} not found` };

      const recordData = (data as Record<string, unknown>) || {};
      const record = await db.dataRecord.create({
        data: {
          moduleId: mod.id,
          companyId,
          currentPayload: jsonVal({
            ...recordData,
            name: recordData.name || recordData.recordName || 'New Record',
            code: recordData.code || recordData.recordCode || `REC-${Date.now()}`,
          }),
          status: 'DRAFT',
          createdById: userId,
        },
      });
      return { success: true, data: { id: record.id, status: 'DRAFT', moduleCode: String(moduleCode) } };
    }

    case 'update_record': {
      const { recordId, data } = args;
      const record = await db.dataRecord.findUnique({ where: { id: String(recordId) } });
      if (!record) return { success: false, error: 'Record not found' };

      const existingPayload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      const updateData = (data as Record<string, unknown>) || {};
      const updatedPayload = { ...existingPayload, ...updateData };

      if (record.status === 'ACTIVE') {
        // Amendment workflow
        const versionCount = await db.dataVersion.count({ where: { recordId: record.id } });
        await db.dataVersion.create({
          data: {
            recordId: record.id,
            payloadSnapshot: jsonVal(updatedPayload),
            versionNumber: versionCount + 1,
            changeReason: 'AI Assistant update',
            status: 'REVISION_PENDING',
            changedById: userId,
          },
        });
        await db.dataRecord.update({
          where: { id: String(recordId) },
          data: { status: 'REVISION_PENDING', currentPayload: jsonVal(updatedPayload) },
        });
      } else {
        await db.dataRecord.update({
          where: { id: String(recordId) },
          data: { currentPayload: jsonVal(updatedPayload) },
        });
      }

      return {
        success: true,
        data: {
          recordId,
          updatedFields: Object.keys(updateData),
          previousValues: Object.fromEntries(Object.keys(updateData).map(k => [k, existingPayload[k]])),
          newValues: updateData,
          statusChanged: record.status === 'ACTIVE' ? 'REVISION_PENDING' : record.status,
        },
      };
    }

    case 'delete_record': {
      const record = await db.dataRecord.findUnique({
        where: { id: String(args.recordId) },
        include: { module: { select: { moduleName: true } } },
      });
      if (!record) return { success: false, error: 'Record not found' };
      if (record.status !== 'DRAFT') return { success: false, error: 'Only DRAFT records can be deleted' };

      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      await db.dataRecord.delete({ where: { id: String(args.recordId) } });
      return {
        success: true,
        data: {
          deleted: true,
          recordId: args.recordId,
          recordName: payload.name || payload.recordName || 'Unknown',
          moduleName: record.module?.moduleName,
        },
      };
    }

    case 'bulk_update': {
      const recordIds = (args.recordIds as string[]) || [];
      const updateData = (args.data as Record<string, unknown>) || {};

      if (recordIds.length === 0) return { success: false, error: 'No record IDs provided' };
      if (recordIds.length > 100) return { success: false, error: 'Cannot update more than 100 records at once' };

      const records = await db.dataRecord.findMany({
        where: { id: { in: recordIds }, companyId },
      });

      let updatedCount = 0;
      let amendmentCount = 0;

      for (const record of records) {
        const existingPayload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
        const updatedPayload = { ...existingPayload, ...updateData };

        if (record.status === 'ACTIVE') {
          const versionCount = await db.dataVersion.count({ where: { recordId: record.id } });
          await db.dataVersion.create({
            data: {
              recordId: record.id,
              payloadSnapshot: jsonVal(updatedPayload),
              versionNumber: versionCount + 1,
              changeReason: 'AI Assistant bulk update',
              status: 'REVISION_PENDING',
              changedById: userId,
            },
          });
          await db.dataRecord.update({
            where: { id: record.id },
            data: { status: 'REVISION_PENDING', currentPayload: jsonVal(updatedPayload) },
          });
          amendmentCount++;
        } else {
          await db.dataRecord.update({
            where: { id: record.id },
            data: { currentPayload: jsonVal(updatedPayload) },
          });
        }
        updatedCount++;
      }

      return {
        success: true,
        data: {
          totalRequested: recordIds.length,
          updatedCount,
          amendmentCount,
          updatedFields: Object.keys(updateData),
          newValues: updateData,
        },
      };
    }

    // ─── WORKFLOW tools ─────────────────────────
    case 'submit_for_approval': {
      const record = await db.dataRecord.findUnique({
        where: { id: String(args.recordId) },
        include: { module: { select: { moduleName: true } } },
      });
      if (!record) return { success: false, error: 'Record not found' };
      if (record.status !== 'DRAFT') return { success: false, error: 'Only DRAFT records can be submitted for approval' };

      await db.dataRecord.update({
        where: { id: String(args.recordId) },
        data: { status: 'IN_REVIEW' },
      });
      return {
        success: true,
        data: {
          recordId: args.recordId,
          previousStatus: 'DRAFT',
          newStatus: 'IN_REVIEW',
          moduleName: record.module?.moduleName,
        },
      };
    }

    case 'approve_record': {
      const record = await db.dataRecord.findUnique({
        where: { id: String(args.recordId) },
        include: { module: { select: { moduleName: true } } },
      });
      if (!record) return { success: false, error: 'Record not found' };
      if (record.status !== 'IN_REVIEW' && record.status !== 'REVISION_PENDING') {
        return { success: false, error: 'Record is not in review (status: ' + record.status + ')' };
      }

      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      await db.dataRecord.update({
        where: { id: String(args.recordId) },
        data: { status: 'ACTIVE' },
      });
      return {
        success: true,
        data: {
          recordId: args.recordId,
          previousStatus: record.status,
          newStatus: 'ACTIVE',
          recordName: payload.name || payload.recordName || 'Unknown',
          moduleName: record.module?.moduleName,
          comment: args.comment || '',
        },
      };
    }

    case 'reject_record': {
      const record = await db.dataRecord.findUnique({
        where: { id: String(args.recordId) },
        include: { module: { select: { moduleName: true } } },
      });
      if (!record) return { success: false, error: 'Record not found' };
      if (record.status !== 'IN_REVIEW') {
        return { success: false, error: 'Record is not in review (status: ' + record.status + ')' };
      }

      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      await db.dataRecord.update({
        where: { id: String(args.recordId) },
        data: { status: 'REJECTED' },
      });
      return {
        success: true,
        data: {
          recordId: args.recordId,
          previousStatus: 'IN_REVIEW',
          newStatus: 'REJECTED',
          recordName: payload.name || payload.recordName || 'Unknown',
          moduleName: record.module?.moduleName,
          reason: args.reason || '',
        },
      };
    }

    // ─── AI tools ───────────────────────────────
    case 'enrich_record': {
      const record = await db.dataRecord.findUnique({
        where: { id: String(args.recordId) },
        include: { module: { select: { moduleCode: true, moduleName: true } } },
      });
      if (!record) return { success: false, error: 'Record not found' };

      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      const suggestions: Record<string, { current: unknown; suggested: string; confidence: string }> = {};

      // Smart enrichment based on existing data patterns
      if (!payload.description || String(payload.description).trim() === '') {
        suggestions.description = {
          current: payload.description || '',
          suggested: `${payload.name || 'Product'} - ${payload.brand || 'Brand'} ${payload.category || 'Category'} product in the ${record.module?.moduleName || ''} catalog`,
          confidence: 'medium',
        };
      }
      if (!payload.tags || String(payload.tags).trim() === '') {
        const brand = String(payload.brand || '').toLowerCase();
        const category = String(payload.category || '').toLowerCase();
        suggestions.tags = {
          current: payload.tags || '',
          suggested: [brand, category, 'mdm-managed'].filter(Boolean).join(', '),
          confidence: 'medium',
        };
      }
      if (!payload.search_keywords || String(payload.search_keywords).trim() === '') {
        const name = String(payload.name || '');
        const brand = String(payload.brand || '');
        suggestions.search_keywords = {
          current: payload.search_keywords || '',
          suggested: [name, brand].filter(Boolean).join(' '),
          confidence: 'high',
        };
      }

      // If specific fields requested, only return those
      if (args.fields) {
        const requestedFields = args.fields as string[];
        for (const f of requestedFields) {
          if (!payload[f] || String(payload[f]).trim() === '') {
            suggestions[f] = {
              current: payload[f] || '',
              suggested: `AI suggested value for ${f}`,
              confidence: 'low',
            };
          }
        }
      }

      return {
        success: true,
        data: {
          recordId: args.recordId,
          recordName: payload.name || payload.recordName || 'Unknown',
          moduleName: record.module?.moduleName,
          suggestions,
          totalFields: Object.keys(payload).length,
          enrichedFields: Object.keys(suggestions).length,
        },
      };
    }

    case 'classify_record': {
      const record = await db.dataRecord.findUnique({
        where: { id: String(args.recordId) },
        include: { module: { select: { moduleCode: true, moduleName: true } } },
      });
      if (!record) return { success: false, error: 'Record not found' };

      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      const name = String(payload.name || '').toLowerCase();
      const brand = String(payload.brand || '').toLowerCase();
      const category = String(payload.category || '').toLowerCase();

      // Generate classification suggestions based on content
      const suggestedCategories: string[] = [];
      const suggestedTags: string[] = [];

      if (category.includes('footwear') || name.includes('shoe') || name.includes('sneaker')) {
        suggestedCategories.push('Footwear', 'Sports Footwear', 'Casual Footwear');
        suggestedTags.push('shoes', 'footwear', 'sports');
      } else if (category.includes('apparel') || name.includes('shirt') || name.includes('jacket')) {
        suggestedCategories.push('Apparel', 'Sports Apparel', 'Casual Wear');
        suggestedTags.push('clothing', 'apparel', 'fashion');
      } else if (category.includes('accessories') || name.includes('bag') || name.includes('watch')) {
        suggestedCategories.push('Accessories', 'Sports Accessories');
        suggestedTags.push('accessories', 'gear');
      } else {
        suggestedCategories.push(category || 'Uncategorized');
        suggestedTags.push('mdm-managed');
      }

      if (brand) suggestedTags.push(brand);

      return {
        success: true,
        data: {
          recordId: args.recordId,
          recordName: payload.name || payload.recordName || 'Unknown',
          moduleName: record.module?.moduleName,
          currentCategory: payload.category || '',
          suggestedCategories,
          suggestedTags,
          confidence: suggestedCategories.length > 1 ? 'medium' : 'high',
        },
      };
    }

    case 'check_quality': {
      const { moduleCode, recordId, checkType = 'all' } = args;

      if (recordId) {
        // Check specific record
        const record = await db.dataRecord.findUnique({
          where: { id: String(recordId) },
          include: { qualityScores: { orderBy: { calculatedAt: 'desc' }, take: 10 } },
        });
        if (!record) return { success: false, error: 'Record not found' };

        const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
        const issues: Array<{ type: string; field: string; severity: string; message: string }> = [];

        // Completeness check
        if (checkType === 'all' || checkType === 'completeness') {
          const requiredFields = ['name', 'code'];
          for (const field of requiredFields) {
            if (!payload[field] || String(payload[field]).trim() === '') {
              issues.push({ type: 'completeness', field, severity: 'high', message: `Required field "${field}" is empty` });
            }
          }
          const optionalFields = ['brand', 'category', 'description', 'tags'];
          for (const field of optionalFields) {
            if (!payload[field] || String(payload[field]).trim() === '') {
              issues.push({ type: 'completeness', field, severity: 'low', message: `Optional field "${field}" is empty` });
            }
          }
        }

        // Consistency check
        if (checkType === 'all' || checkType === 'consistency') {
          if (payload.selling_price && Number(payload.selling_price) < 0) {
            issues.push({ type: 'consistency', field: 'selling_price', severity: 'high', message: 'Selling price cannot be negative' });
          }
        }

        const overallScore = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.filter(i => i.severity === 'high').length * 20) - (issues.filter(i => i.severity === 'low').length * 5));

        return {
          success: true,
          data: {
            recordId,
            recordName: payload.name || payload.recordName || 'Unknown',
            overallScore,
            totalFields: Object.keys(payload).length,
            filledFields: Object.values(payload).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length,
            issues,
            existingScores: record.qualityScores,
          },
        };
      }

      // Module-level quality check
      if (moduleCode) {
        const mod = await db.metaModule.findFirst({ where: { moduleCode: String(moduleCode) } });
        if (!mod) return { success: false, error: `Module ${moduleCode} not found` };

        const scores = await db.dataQualityScore.findMany({
          where: { moduleId: mod.id },
          orderBy: { score: 'asc' },
          take: 20,
        });

        const avgScore = scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
          : null;

        return {
          success: true,
          data: {
            moduleCode: String(moduleCode),
            moduleName: mod.moduleName,
            averageScore: avgScore,
            totalScores: scores.length,
            lowScoringRecords: scores.filter(s => s.score < 60).length,
            topIssues: scores.slice(0, 5).map(s => ({
              recordId: s.recordId,
              metricType: s.metricType,
              score: s.score,
              message: s.message,
            })),
          },
        };
      }

      return { success: false, error: 'Either recordId or moduleCode is required' };
    }

    // ─── ASSET tools ────────────────────────────
    case 'create_digital_asset': {
      const { fileName, assetType = 'IMAGE', recordId, metadata } = args;

      const asset = await db.digitalAsset.create({
        data: {
          companyId,
          recordId: recordId ? String(recordId) : null,
          assetType: String(assetType),
          fileName: String(fileName),
          originalFileName: String(fileName),
          filePath: `/ai-upload/${Date.now()}-${String(fileName)}`,
          fileSize: 0,
          mimeType: String(assetType) === 'IMAGE' ? 'image/png' : 'application/octet-stream',
          status: 'DRAFT',
        },
      });

      // Create metadata if provided
      if (metadata && typeof metadata === 'object') {
        const metaEntries = metadata as Record<string, string>;
        for (const [key, value] of Object.entries(metaEntries)) {
          await db.digitalAssetMeta.create({
            data: { assetId: asset.id, metaKey: key, metaValue: String(value) },
          });
        }
      }

      return {
        success: true,
        data: {
          id: asset.id,
          fileName: asset.fileName,
          assetType: asset.assetType,
          status: asset.status,
          recordId: asset.recordId,
        },
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function getAuditAction(toolName: string): string {
  const mapping: Record<string, string> = {
    create_record: 'RECORD_CREATE',
    update_record: 'RECORD_UPDATE',
    delete_record: 'RECORD_DELETE',
    bulk_update: 'BULK_UPDATE',
    submit_for_approval: 'RECORD_STATUS_CHANGE',
    approve_record: 'WORKFLOW_APPROVE',
    reject_record: 'WORKFLOW_REJECT',
    create_digital_asset: 'RECORD_CREATE',
    enrich_record: 'AI_CONFIG_CHANGE',
    classify_record: 'AI_CONFIG_CHANGE',
  };
  return mapping[toolName] || 'RECORD_UPDATE';
}

/** Parse [TOOL_CALL:name(args)] patterns from AI response text */
export function parseToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const toolCallRegex = /\[TOOL_CALL:(\w+)\((.+?\))\]/g;
  const results: Array<{ name: string; args: Record<string, unknown> }> = [];
  let match: RegExpExecArray | null;

  while ((match = toolCallRegex.exec(text)) !== null) {
    try {
      const toolName = match[1];
      const argsStr = match[2];
      const args = JSON.parse(argsStr);
      results.push({ name: toolName, args });
    } catch {
      // Invalid tool call format, skip
    }
  }

  return results;
}

/** Strip tool call patterns from display text */
export function stripToolCalls(text: string): string {
  return text.replace(/\[TOOL_CALL:\w+\(.+?\)\]/g, '').trim();
}

/** Generate a human-readable summary for tool results (fallback when AI is unavailable) */
export function generateToolResultSummary(
  toolResults: Array<{ name: string; result: unknown }>,
): string {
  const lines: string[] = [];

  for (const tr of toolResults) {
    const result = tr.result as { success?: boolean; data?: unknown; error?: string; preview?: { action: string; target: string; details: Record<string, unknown> } } | undefined;
    if (!result) {
      lines.push(`**${tr.name}**: No result returned.`);
      continue;
    }

    // Confirmation preview case
    if (result.preview) {
      lines.push(`⚠️ **${tr.name}** — Confirmation Required`);
      lines.push(`- **Action**: ${result.preview.action}`);
      lines.push(`- **Target**: ${result.preview.target}`);
      lines.push(`- **Details**: ${JSON.stringify(result.preview.details, null, 2)}`);
      lines.push(`\n_Please confirm or reject this action._`);
      continue;
    }

    if (result.error) {
      lines.push(`**${tr.name}**: ❌ ${result.error}`);
      continue;
    }

    if (!result.success) {
      lines.push(`**${tr.name}**: ❌ Operation failed`);
      continue;
    }

    switch (tr.name) {
      case 'search_records': {
        const records = result.data as Array<Record<string, unknown>> | undefined;
        if (!records || records.length === 0) {
          lines.push('**Search Results**: No records found matching your criteria.');
        } else {
          lines.push(`**Search Results**: Found **${records.length}** record(s):`);
          for (const r of records.slice(0, 10)) {
            const payload = (r.currentPayload as Record<string, unknown>) || r;
            const name = String(payload.name || payload.recordName || r.id || 'Unknown');
            const status = String(r.status || '');
            lines.push(`- **${name}** (${status}) — ID: \`${r.id}\``);
          }
          if (records.length > 10) lines.push(`  ... and ${records.length - 10} more`);
        }
        break;
      }
      case 'get_record': {
        const record = result.data as Record<string, unknown> | undefined;
        if (record) {
          const payload = (record.currentPayload as Record<string, unknown>) || {};
          lines.push('**Record Details**:');
          lines.push(`- **ID**: ${record.id}`);
          lines.push(`- **Status**: ${record.status}`);
          lines.push(`- **Version**: ${record.version}`);
          for (const [k, v] of Object.entries(payload)) {
            lines.push(`- **${k}**: ${v}`);
          }
        }
        break;
      }
      case 'create_record': {
        const data = result.data as Record<string, unknown> | undefined;
        lines.push(`**Record Created** ✅`);
        if (data) {
          lines.push(`- **ID**: \`${data.id}\``);
          lines.push(`- **Status**: DRAFT`);
        }
        break;
      }
      case 'update_record': {
        const data = result.data as { recordId?: string; updatedFields?: string[]; previousValues?: Record<string, unknown>; newValues?: Record<string, unknown>; statusChanged?: string } | undefined;
        lines.push(`**Record Updated** ✅`);
        if (data) {
          lines.push(`- **ID**: \`${data.recordId}\``);
          lines.push(`- **Updated fields**: ${data.updatedFields?.join(', ')}`);
          if (data.previousValues && data.newValues) {
            lines.push(`- **Changes**:`);
            for (const field of (data.updatedFields || [])) {
              lines.push(`  - ${field}: \`${data.previousValues[field]}\` → \`${data.newValues[field]}\``);
            }
          }
          if (data.statusChanged) {
            lines.push(`- ⚠️ **Status changed to**: ${data.statusChanged} (amendment workflow triggered)`);
          }
        }
        break;
      }
      case 'delete_record': {
        const data = result.data as { recordName?: string; moduleName?: string } | undefined;
        lines.push('**Record Deleted** ✅');
        if (data) {
          lines.push(`- **Name**: ${data.recordName}`);
          lines.push(`- **Module**: ${data.moduleName}`);
        }
        break;
      }
      case 'bulk_update': {
        const data = result.data as { updatedCount?: number; amendmentCount?: number; updatedFields?: string[]; newValues?: Record<string, unknown> } | undefined;
        lines.push(`**Bulk Update Complete** ✅`);
        if (data) {
          lines.push(`- **Updated**: ${data.updatedCount} record(s)`);
          if (data.amendmentCount) lines.push(`- **Amendments triggered**: ${data.amendmentCount} ACTIVE record(s)`);
          lines.push(`- **Fields**: ${data.updatedFields?.join(', ')}`);
        }
        break;
      }
      case 'submit_for_approval': {
        const data = result.data as { previousStatus?: string; newStatus?: string; moduleName?: string } | undefined;
        lines.push(`**Record Submitted for Approval** ✅`);
        if (data) lines.push(`- **New Status**: ${data.newStatus} (from ${data.previousStatus})`);
        break;
      }
      case 'approve_record': {
        const data = result.data as { newStatus?: string; recordName?: string; moduleName?: string } | undefined;
        lines.push(`**Record Approved** ✅`);
        if (data) lines.push(`- **New Status**: ${data.newStatus} — ${data.recordName}`);
        break;
      }
      case 'reject_record': {
        const data = result.data as { newStatus?: string; recordName?: string; reason?: string } | undefined;
        lines.push(`**Record Rejected** ✅`);
        if (data) {
          lines.push(`- **New Status**: ${data.newStatus} — ${data.recordName}`);
          if (data.reason) lines.push(`- **Reason**: ${data.reason}`);
        }
        break;
      }
      case 'get_data_quality': {
        const data = result.data as unknown;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            lines.push('**Data Quality**: No quality scores found.');
          } else {
            lines.push('**Data Quality Scores**:');
            for (const s of data) {
              const item = s as Record<string, unknown>;
              lines.push(`- ${item.metricType}: **${item.score}**${item.message ? ` — ${item.message}` : ''}`);
            }
          }
        } else if (data && typeof data === 'object') {
          const d = data as Record<string, unknown>;
          lines.push(`**Quality Check Results**:`);
          lines.push(`- **Overall Score**: ${d.overallScore}`);
          lines.push(`- **Filled Fields**: ${d.filledFields}/${d.totalFields}`);
          if (d.issues) {
            const issues = d.issues as Array<{ type: string; field: string; severity: string; message: string }>;
            if (issues.length > 0) {
              lines.push(`- **Issues**:`);
              for (const issue of issues) {
                lines.push(`  - [${issue.severity.toUpperCase()}] ${issue.field}: ${issue.message}`);
              }
            } else {
              lines.push(`- No quality issues found ✅`);
            }
          }
        }
        break;
      }
      case 'list_modules': {
        const modules = result.data as Array<{ code: string; name: string; entityType: string }> | undefined;
        if (!modules || modules.length === 0) {
          lines.push('**Modules**: No modules found.');
        } else {
          lines.push(`**Available Modules** (${modules.length}):`);
          for (const m of modules) {
            lines.push(`- **${m.name}** (\`${m.code}\`) — ${m.entityType}`);
          }
        }
        break;
      }
      case 'get_hierarchy': {
        const hierarchies = result.data as Array<Record<string, unknown>> | undefined;
        if (!hierarchies || hierarchies.length === 0) {
          lines.push('**Hierarchy**: No hierarchies found.');
        } else {
          for (const h of hierarchies) {
            lines.push(`**${h.hierarchyName}** (${h.hierarchyType})`);
            const nodes = h.nodes as Array<Record<string, unknown>> | undefined;
            if (nodes) {
              for (const n of nodes.slice(0, 15)) {
                lines.push(`  - ${n.nodeLabel} (depth: ${n.depthLevel})`);
              }
              if (nodes.length > 15) lines.push(`  ... and ${nodes.length - 15} more nodes`);
            }
          }
        }
        break;
      }
      case 'search_digital_assets': {
        const assets = result.data as Array<Record<string, unknown>> | undefined;
        if (!assets || assets.length === 0) {
          lines.push('**Digital Assets**: No assets found.');
        } else {
          lines.push(`**Digital Assets** (${assets.length}):`);
          for (const a of assets.slice(0, 10)) {
            lines.push(`- **${a.fileName}** (${a.assetType}) — ${a.mimeType}`);
          }
        }
        break;
      }
      case 'enrich_record': {
        const data = result.data as { recordName?: string; suggestions?: Record<string, { current: unknown; suggested: string; confidence: string }>; enrichedFields?: number } | undefined;
        lines.push(`**AI Enrichment Suggestions** ✨`);
        if (data) {
          lines.push(`- **Record**: ${data.recordName}`);
          lines.push(`- **Fields to enrich**: ${data.enrichedFields}`);
          if (data.suggestions) {
            for (const [field, suggestion] of Object.entries(data.suggestions)) {
              lines.push(`  - **${field}**: \`${suggestion.current}\` → \`${suggestion.suggested}\` (confidence: ${suggestion.confidence})`);
            }
          }
        }
        break;
      }
      case 'classify_record': {
        const data = result.data as { recordName?: string; suggestedCategories?: string[]; suggestedTags?: string[]; confidence?: string } | undefined;
        lines.push(`**AI Classification** 🏷️`);
        if (data) {
          lines.push(`- **Record**: ${data.recordName}`);
          if (data.suggestedCategories) lines.push(`- **Suggested categories**: ${data.suggestedCategories.join(', ')}`);
          if (data.suggestedTags) lines.push(`- **Suggested tags**: ${data.suggestedTags.join(', ')}`);
          lines.push(`- **Confidence**: ${data.confidence}`);
        }
        break;
      }
      case 'check_quality': {
        const data = result.data as Record<string, unknown> | undefined;
        lines.push(`**Quality Check** 🛡️`);
        if (data) {
          if (data.overallScore !== undefined) lines.push(`- **Overall Score**: ${data.overallScore}/100`);
          if (data.averageScore !== undefined) lines.push(`- **Average Score**: ${data.averageScore}/100`);
          if (data.filledFields) lines.push(`- **Field Completeness**: ${data.filledFields}/${data.totalFields}`);
        }
        break;
      }
      case 'create_digital_asset': {
        const data = result.data as { id?: string; fileName?: string; assetType?: string; status?: string } | undefined;
        lines.push(`**Digital Asset Created** ✅`);
        if (data) {
          lines.push(`- **ID**: \`${data.id}\``);
          lines.push(`- **File**: ${data.fileName} (${data.assetType})`);
          lines.push(`- **Status**: ${data.status}`);
        }
        break;
      }
      default:
        lines.push(`**${tr.name}**: ${JSON.stringify(result.data, null, 2)}`);
    }
  }

  return lines.join('\n');
}
