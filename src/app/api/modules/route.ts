import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission, isSuperAdmin } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// GET /api/modules - List all modules (with field counts)
// GET /api/modules?action=detail&id=xxx - Get module with fields, validations, and lookup data
// GET /api/modules?action=stats - Get statistics for all modules
// GET /api/modules?action=export&id=xxx - Export module as JSON
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'schema:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    // ── Rate limit: read endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('read', tokenPayload!.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    // Module detail with fields
    if (action === 'detail' && id) {
      const metaModule = await db.metaModule.findUnique({
        where: { id },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              validations: true,
              lookupMaster: {
                include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
              },
            },
          },
        },
      });

      if (!metaModule) {
        return NextResponse.json({ error: 'Module not found' }, { status: 404 });
      }

      return NextResponse.json({ module: metaModule });
    }

    // Module statistics
    if (action === 'stats') {
      const modules = await db.metaModule.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              fields: { where: { isActive: true } },
              dataRecords: true,
            },
          },
          dataRecords: {
            select: {
              status: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      const stats = modules.map((m) => ({
        id: m.id,
        moduleCode: m.moduleCode,
        moduleName: m.moduleName,
        moduleIcon: m.moduleIcon,
        description: m.description,
        requireApproval: m.requireApproval,
        sortOrder: m.sortOrder,
        fieldCount: m._count.fields,
        recordCount: m._count.dataRecords,
        lastModified: m.dataRecords.length > 0 ? m.dataRecords[0].updatedAt : null,
        activeCount: 0,
        draftCount: 0,
      }));

      // Get active/draft counts per module
      for (const stat of stats) {
        const statusCounts = await db.dataRecord.groupBy({
          by: ['status'],
          where: { moduleId: stat.id },
          _count: { status: true },
        });
        for (const sc of statusCounts) {
          if (sc.status === 'ACTIVE') stat.activeCount = sc._count.status;
          if (sc.status === 'DRAFT') stat.draftCount = sc._count.status;
        }
      }

      return NextResponse.json({ stats });
    }

    // Export module as JSON
    if (action === 'export' && id) {
      const metaModule = await db.metaModule.findUnique({
        where: { id },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              validations: true,
              lookupMaster: {
                include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
              },
            },
          },
          businessRules: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      });

      if (!metaModule) {
        return NextResponse.json({ error: 'Module not found' }, { status: 404 });
      }

      // Build clean export JSON (strip internal IDs)
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        module: {
          moduleCode: metaModule.moduleCode,
          moduleName: metaModule.moduleName,
          moduleIcon: metaModule.moduleIcon,
          description: metaModule.description,
          requireApproval: metaModule.requireApproval,
          sortOrder: metaModule.sortOrder,
        },
        fields: metaModule.fields.map((f) => ({
          fieldCode: f.fieldCode,
          fieldName: f.fieldName,
          dataType: f.dataType,
          isRequired: f.isRequired,
          isUnique: f.isUnique,
          defaultValue: f.defaultValue,
          placeholder: f.placeholder,
          description: f.description,
          sortOrder: f.sortOrder,
          lookupCode: f.lookupMaster?.lookupCode || null,
          cascadesFromFieldCode: f.cascadesFromFieldCode,
          validations: f.validations.map((v) => ({
            ruleType: v.ruleType,
            ruleValue: v.ruleValue,
            errorMessage: v.errorMessage,
          })),
        })),
        businessRules: metaModule.businessRules.map((r) => ({
          name: r.name,
          description: r.description,
          conditionType: r.conditionType,
          conditionJson: r.conditionJson,
          actionType: r.actionType,
          actionJson: r.actionJson,
          errorMessage: r.errorMessage,
          trigger: r.trigger,
          sortOrder: r.sortOrder,
        })),
      };

      // ── Audit: export ─────────────────────────────────────────────────
      await logAudit({
        action: AuditAction.BULK_EXPORT,
        entityType: 'MetaModule',
        entityId: id,
        description: `Module "${metaModule.moduleName}" exported as JSON`,
        req: request,
      });

      return NextResponse.json(exportData);
    }

    // List all active modules with field counts and record counts
    const modules = await db.metaModule.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            fields: { where: { isActive: true } },
            dataRecords: true,
          },
        },
      },
    });

    return NextResponse.json({
      modules: modules.map((m) => ({
        id: m.id,
        moduleCode: m.moduleCode,
        moduleName: m.moduleName,
        moduleIcon: m.moduleIcon,
        description: m.description,
        requireApproval: m.requireApproval,
        sortOrder: m.sortOrder,
        isActive: m.isActive,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        fieldCount: m._count.fields,
        recordCount: m._count.dataRecords,
        _count: undefined,
      })),
    });
  } catch (error) {
    console.error('Modules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/modules - Create module (Super Admin only)
// POST /api/modules?action=clone&sourceId=xxx - Clone a module
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can create modules' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const sourceId = searchParams.get('sourceId');

    // Clone / duplicate a module
    if (action === 'clone' && sourceId) {
      const sourceModule = await db.metaModule.findUnique({
        where: { id: sourceId },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: { validations: true },
          },
          businessRules: { where: { isActive: true } },
        },
      });

      if (!sourceModule) {
        return NextResponse.json({ error: 'Source module not found' }, { status: 404 });
      }

      const body = await request.json();
      const newCode = body.moduleCode || `${sourceModule.moduleCode}_COPY`;
      const newName = body.moduleName || `${sourceModule.moduleName} (Copy)`;

      // Check for code uniqueness
      const existing = await db.metaModule.findUnique({ where: { moduleCode: newCode } });
      if (existing) {
        return NextResponse.json({ error: 'Module code already exists' }, { status: 409 });
      }

      // Create the cloned module with fields, validations, and business rules
      const clonedModule = await db.metaModule.create({
        data: {
          moduleCode: newCode,
          moduleName: newName,
          moduleIcon: body.moduleIcon || sourceModule.moduleIcon,
          description: body.description || sourceModule.description,
          requireApproval: body.requireApproval ?? sourceModule.requireApproval,
          sortOrder: body.sortOrder ?? sourceModule.sortOrder + 1,
          fields: {
            create: sourceModule.fields.map((f) => ({
              fieldCode: f.fieldCode,
              fieldName: f.fieldName,
              dataType: f.dataType,
              isRequired: f.isRequired,
              isUnique: f.isUnique,
              defaultValue: f.defaultValue,
              placeholder: f.placeholder,
              description: f.description,
              sortOrder: f.sortOrder,
              lookupId: f.lookupId,
              cascadesFromFieldCode: f.cascadesFromFieldCode,
              validations: {
                create: f.validations.map((v) => ({
                  ruleType: v.ruleType,
                  ruleValue: v.ruleValue,
                  errorMessage: v.errorMessage,
                })),
              },
            })),
          },
          businessRules: {
            create: sourceModule.businessRules.map((r) => ({
              name: r.name,
              description: r.description,
              conditionType: r.conditionType,
              conditionJson: r.conditionJson,
              actionType: r.actionType,
              actionJson: r.actionJson,
              errorMessage: r.errorMessage,
              trigger: r.trigger,
              sortOrder: r.sortOrder,
            })),
          },
        },
        include: {
          fields: { include: { validations: true } },
          businessRules: true,
        },
      });

      // ── Audit: module clone ────────────────────────────────────────────
      await logAudit({
        action: AuditAction.MODULE_CREATE,
        entityType: 'MetaModule',
        entityId: clonedModule.id,
        description: `Module "${newName}" cloned from "${sourceModule.moduleName}"`,
        newValues: { moduleCode: newCode, moduleName: newName, sourceModuleId: sourceId },
        req: request,
      });

      return NextResponse.json({ module: clonedModule }, { status: 201 });
    }

    // Regular create
    const body = await request.json();
    const { moduleCode, moduleName, moduleIcon, description, requireApproval, sortOrder, isActive } = body;

    if (!moduleCode || !moduleName) {
      return NextResponse.json({ error: 'moduleCode and moduleName are required' }, { status: 400 });
    }

    const existing = await db.metaModule.findUnique({ where: { moduleCode } });
    if (existing) {
      return NextResponse.json({ error: 'Module code already exists' }, { status: 409 });
    }

    const metaModule = await db.metaModule.create({
      data: {
        moduleCode,
        moduleName,
        moduleIcon: moduleIcon || 'Database',
        description,
        requireApproval: requireApproval ?? true,
        sortOrder: sortOrder ?? 0,
        isActive: isActive ?? true,
      },
    });

    // ── Audit: module create ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.MODULE_CREATE,
      entityType: 'MetaModule',
      entityId: metaModule.id,
      description: `Module "${moduleName}" (${moduleCode}) created`,
      newValues: { moduleCode, moduleName, moduleIcon, description, requireApproval, sortOrder, isActive },
      req: request,
    });

    return NextResponse.json({ module: metaModule }, { status: 201 });
  } catch (error) {
    console.error('Modules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/modules - Update module (Super Admin only)
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can update modules' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { id, moduleCode, moduleName, moduleIcon, description, requireApproval, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: 'Module id is required' }, { status: 400 });
    }

    const existing = await db.metaModule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    if (moduleCode && moduleCode !== existing.moduleCode) {
      const duplicate = await db.metaModule.findUnique({ where: { moduleCode } });
      if (duplicate) {
        return NextResponse.json({ error: 'Module code already exists' }, { status: 409 });
      }
    }

    const metaModule = await db.metaModule.update({
      where: { id },
      data: {
        ...(moduleCode !== undefined && { moduleCode }),
        ...(moduleName !== undefined && { moduleName }),
        ...(moduleIcon !== undefined && { moduleIcon }),
        ...(description !== undefined && { description }),
        ...(requireApproval !== undefined && { requireApproval }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // ── Audit: module update ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.MODULE_UPDATE,
      entityType: 'MetaModule',
      entityId: id,
      description: `Module "${existing.moduleName}" updated`,
      oldValues: {
        moduleCode: existing.moduleCode,
        moduleName: existing.moduleName,
        moduleIcon: existing.moduleIcon,
        description: existing.description,
        requireApproval: existing.requireApproval,
        sortOrder: existing.sortOrder,
        isActive: existing.isActive,
      },
      newValues: { moduleCode, moduleName, moduleIcon, description, requireApproval, sortOrder, isActive },
      req: request,
    });

    return NextResponse.json({ module: metaModule });
  } catch (error) {
    console.error('Modules PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/modules - Soft delete (Super Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Only Super Admin can delete modules' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Module id is required' }, { status: 400 });
    }

    const existing = await db.metaModule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    const metaModule = await db.metaModule.update({
      where: { id },
      data: { isActive: false },
    });

    // ── Audit: module delete ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.MODULE_DELETE,
      entityType: 'MetaModule',
      entityId: id,
      description: `Module "${existing.moduleName}" (${existing.moduleCode}) soft-deleted`,
      severity: 'critical',
      oldValues: { moduleCode: existing.moduleCode, moduleName: existing.moduleName, isActive: true },
      newValues: { isActive: false },
      req: request,
    });

    return NextResponse.json({ module: metaModule });
  } catch (error) {
    console.error('Modules DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
