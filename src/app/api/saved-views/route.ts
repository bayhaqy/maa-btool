import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';

// ============================================================================
// SAVED VIEWS API — STIBO User Configurable Views + Sharing Saved Searches
// ============================================================================
//
// Persistence for per-user grid configurations (column set + sort + group-by)
// and the advanced multi-column filter (Task 23-D AdvancedFilter[] shape).
//
// Sharing model:
//   sharedWith = null        → private (owner only)
//   sharedWith = "*"         → everyone in the owner's company
//   sharedWith = "uid1,uid2" → specific users (by SysUser.id)
//
// Ordering: lastUsedAt desc, then createdAt desc (most-recently-used first).

const VALID_SCOPES = new Set(['SEARCH', 'COLUMNS', 'COMBINED']);

interface SavedViewBody {
  id?: string;
  moduleId?: string;
  name?: string;
  scope?: string;
  columnConfig?: string | null;
  filterConfig?: string | null;
  sharedWith?: string | null;
  isDefault?: boolean;
}

/** Parse the request body as JSON, returning {} on any error. */
async function parseBody(request: NextRequest): Promise<SavedViewBody> {
  try {
    return (await request.json()) as SavedViewBody;
  } catch {
    return {};
  }
}

/** Validate that a string is non-empty and not too long (defensive). */
function isValidName(name: string | undefined): name is string {
  return !!name && name.trim().length > 0 && name.length <= 200;
}

/**
 * GET /api/saved-views?moduleId=xxx
 *
 * Returns saved views accessible to the current user:
 *   - Views owned by the user (userId === current)
 *   - Views shared with everyone in the user's company (sharedWith === '*')
 *     NOTE: company-scoping is enforced by joining through the owner's
 *     company. We don't filter by company at the SQL level here — instead
 *     we fetch a superset (user's own + all '*' shared) and the client
 *     displays them. For multi-tenant isolation we additionally filter
 *     '*' shared views to those whose owner is in the same company.
 *
 * Order: lastUsedAt desc nulls last, then createdAt desc.
 */
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    if (!moduleId) {
      return NextResponse.json(
        { error: 'moduleId query parameter is required' },
        { status: 400 }
      );
    }

    // Fetch candidate views: owned OR shared with '*' OR shared with a list
    // containing the user id. SQLite doesn't support array-includes natively,
    // so we use a broad OR + post-filter for the contains case.
    const views = await db.savedView.findMany({
      where: {
        moduleId,
        OR: [
          { userId: tokenPayload.userId },
          { sharedWith: '*' },
          { sharedWith: { contains: tokenPayload.userId } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            companyId: true,
          },
        },
      },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });

    // Post-filter: drop views shared with "*" whose owner is in a different
    // company (multi-tenant isolation). Views shared with a specific user id
    // list are always allowed (explicit grant by id).
    const filtered = views.filter((v) => {
      if (v.userId === tokenPayload.userId) return true;
      if (v.sharedWith === '*') {
        return v.user.companyId === tokenPayload.companyId;
      }
      // Specific user-id list — verify the user id is actually present
      // (the `contains` query can false-positive on substring matches of
      // cuid prefixes).
      const ids = (v.sharedWith || '').split(',').map((s) => s.trim());
      return ids.includes(tokenPayload.userId);
    });

    return NextResponse.json({ views: filtered });
  } catch (error) {
    console.error('Saved views GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/saved-views
 * Create a new saved view. Body: { moduleId, name, scope, columnConfig?,
 * filterConfig?, sharedWith?, isDefault? }.
 *
 * When isDefault=true, all other defaults for the same user+module+scope
 * are cleared first (only one default per scope).
 */
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await parseBody(request);
    const { moduleId, name, scope, columnConfig, filterConfig, sharedWith, isDefault } = body;

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    }
    if (!isValidName(name)) {
      return NextResponse.json({ error: 'name is required (max 200 chars)' }, { status: 400 });
    }
    const finalScope = scope && VALID_SCOPES.has(scope) ? scope : 'COMBINED';

    // Verify the module exists (defensive — also prevents arbitrary moduleId)
    const moduleRec = await db.metaModule.findUnique({ where: { id: moduleId } });
    if (!moduleRec) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // If isDefault, clear other defaults for this user+module+scope first
    if (isDefault) {
      await db.savedView.updateMany({
        where: {
          userId: tokenPayload.userId,
          moduleId,
          scope: finalScope,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const view = await db.savedView.create({
      data: {
        userId: tokenPayload.userId,
        moduleId,
        name: name.trim(),
        scope: finalScope,
        columnConfig: columnConfig || null,
        filterConfig: filterConfig || null,
        sharedWith: sharedWith || null,
        isDefault: Boolean(isDefault),
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({ view }, { status: 201 });
  } catch (error) {
    console.error('Saved views POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/saved-views
 * Update an existing saved view. Body: { id, ...fields }.
 * Only the owner (or Super Admin) can update.
 */
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await parseBody(request);
    const { id, name, scope, columnConfig, filterConfig, sharedWith, isDefault } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.savedView.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Saved view not found' }, { status: 404 });
    }

    // Authorization: owner or Super Admin
    const isOwner = existing.userId === tokenPayload.userId;
    const isSA = isSuperAdmin(tokenPayload.roles);
    if (!isOwner && !isSA) {
      return NextResponse.json(
        { error: 'Only the owner can update this saved view' },
        { status: 403 }
      );
    }

    const finalScope = scope && VALID_SCOPES.has(scope) ? scope : existing.scope;

    // If setting as default, clear other defaults for this user+module+scope
    if (isDefault) {
      await db.savedView.updateMany({
        where: {
          userId: existing.userId,
          moduleId: existing.moduleId,
          scope: finalScope,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updated = await db.savedView.update({
      where: { id },
      data: {
        ...(isValidName(name) ? { name: name.trim() } : {}),
        ...(scope ? { scope: finalScope } : {}),
        ...(columnConfig !== undefined ? { columnConfig: columnConfig || null } : {}),
        ...(filterConfig !== undefined ? { filterConfig: filterConfig || null } : {}),
        ...(sharedWith !== undefined ? { sharedWith: sharedWith || null } : {}),
        ...(isDefault !== undefined ? { isDefault: Boolean(isDefault) } : {}),
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({ view: updated });
  } catch (error) {
    console.error('Saved views PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/saved-views
 * Delete a saved view. Body: { id }.
 * Only the owner (or Super Admin) can delete.
 */
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await parseBody(request);
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.savedView.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Saved view not found' }, { status: 404 });
    }

    const isOwner = existing.userId === tokenPayload.userId;
    const isSA = isSuperAdmin(tokenPayload.roles);
    if (!isOwner && !isSA) {
      return NextResponse.json(
        { error: 'Only the owner can delete this saved view' },
        { status: 403 }
      );
    }

    await db.savedView.delete({ where: { id } });

    return NextResponse.json({ message: 'Saved view deleted', id });
  } catch (error) {
    console.error('Saved views DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
