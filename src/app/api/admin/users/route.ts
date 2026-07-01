import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders, hashPassword } from '@/lib/auth';
import { hasPermission, isSuperAdmin, isCompanyAdmin, canManageTenantUsers } from '@/lib/rbac';
import { rateLimitByCategory } from '@/lib/rate-limit';
import { logAudit, AuditAction } from '@/lib/audit';

// GET /api/admin/users - List users with tenant-scoped filtering
// Super Admin sees all users (optionally filter by ?companyId=xxx)
// Company Admin sees only users from their own company
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write or tenant:users permission
    if (!hasPermission(tokenPayload.roles, 'admin:write') && !hasPermission(tokenPayload.roles, 'tenant:users')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write or tenant:users' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    // ── Tenant-scoped filtering ────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const requestedCompanyId = searchParams.get('companyId') || undefined;

    let filterCompanyId: string | undefined;

    if (isSuperAdmin(tokenPayload.roles)) {
      // Super Admin: can see all users, optionally filter by companyId
      filterCompanyId = requestedCompanyId;
    } else if (isCompanyAdmin(tokenPayload.roles)) {
      // Company Admin: can only see users from own company
      if (requestedCompanyId && requestedCompanyId !== tokenPayload.companyId) {
        return NextResponse.json({ error: 'You can only view users from your own company' }, { status: 403 });
      }
      filterCompanyId = tokenPayload.companyId;
    } else {
      return NextResponse.json({ error: 'Insufficient permissions to list users' }, { status: 403 });
    }

    const users = await db.sysUser.findMany({
      where: filterCompanyId ? { companyId: filterCompanyId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        userRoles: {
          include: { role: { select: { id: true, roleName: true, roleType: true, companyId: true, isGlobal: true } } },
        },
      },
    });

    const formattedUsers = users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      isActive: u.isActive,
      companyId: u.companyId,
      company: u.company,
      roles: u.userRoles.map((ur) => ur.role),
      assignedBrands: u.assignedBrands,
      assignedCountries: u.assignedCountries,
      assignedTeams: u.assignedTeams,
      dataScope: u.dataScope,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    console.error('Admin Users GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/users - Create user with tenant-scoped validation
// Super Admin can create users in any company
// Company Admin can only create users in their own company
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write or tenant:users permission
    if (!hasPermission(tokenPayload.roles, 'admin:write') && !hasPermission(tokenPayload.roles, 'tenant:users')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write or tenant:users' }, { status: 403 });
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
    const { username, email, password, companyId, roleIds, assignedBrands, assignedCountries, assignedTeams, dataScope } = body;

    if (!username || !email || !password || !companyId) {
      return NextResponse.json(
        { error: 'username, email, password, and companyId are required' },
        { status: 400 }
      );
    }

    // ── Tenant-scoped access: Company Admin can only create in own company ──
    if (!canManageTenantUsers(companyId, tokenPayload.companyId, tokenPayload.roles)) {
      return NextResponse.json(
        { error: 'You can only create users in your own company' },
        { status: 403 }
      );
    }

    // Check for duplicate username/email
    const existingUser = await db.sysUser.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username or email already exists' },
        { status: 409 }
      );
    }

    // Verify company exists
    const company = await db.tenantCompany.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // ── Validate role IDs belong to the user's company or are global ─────
    if (roleIds && roleIds.length > 0) {
      const roles = await db.sysRole.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, companyId: true, isGlobal: true, roleName: true },
      });

      for (const role of roles) {
        // Roles must belong to the target company or be global
        const isCompanyRole = role.companyId === companyId;
        const isGlobalRole = role.isGlobal && role.companyId === 'SYSTEM';

        if (!isCompanyRole && !isGlobalRole) {
          // Company Admin: cannot assign roles from other companies
          if (!isSuperAdmin(tokenPayload.roles)) {
            return NextResponse.json(
              { error: `Role "${role.roleName}" does not belong to your company and is not a global role` },
              { status: 403 }
            );
          }
        }
      }

      // Check that all roleIds were found
      const foundIds = roles.map(r => r.id);
      const missingIds = roleIds.filter((id: string) => !foundIds.includes(id));
      if (missingIds.length > 0) {
        return NextResponse.json(
          { error: `Role IDs not found: ${missingIds.join(', ')}` },
          { status: 404 }
        );
      }
    }

    const passwordHash = await hashPassword(password);

    const user = await db.sysUser.create({
      data: {
        username,
        email,
        passwordHash,
        companyId,
        assignedBrands: assignedBrands || null,
        assignedCountries: assignedCountries || null,
        assignedTeams: assignedTeams || null,
        dataScope: dataScope || null,
        userRoles: {
          create: (roleIds || []).map((roleId: string) => ({
            roleId,
            companyId,
          })),
        },
      },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        userRoles: { include: { role: true } },
      },
    });

    // ── Audit: user create ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.USER_CREATE,
      entityType: 'SysUser',
      entityId: user.id,
      description: `User "${username}" (${email}) created in company ${companyId}`,
      newValues: { username, email, companyId, roleIds: roleIds || [] },
      req: request,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        isActive: user.isActive,
        company: user.company,
        roles: user.userRoles.map((ur) => ur.role),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Admin Users POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/users - Update user with tenant-scoped validation
// Super Admin can update any user
// Company Admin can only update users in their own company
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write or tenant:users permission
    if (!hasPermission(tokenPayload.roles, 'admin:write') && !hasPermission(tokenPayload.roles, 'tenant:users')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write or tenant:users' }, { status: 403 });
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
    const { id, email, displayName, isActive, roleIds, assignedBrands, assignedCountries, assignedTeams, dataScope } = body;

    if (!id) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    const existing = await db.sysUser.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── Tenant-scoped access: Company Admin can only update users in own company ──
    if (!canManageTenantUsers(existing.companyId, tokenPayload.companyId, tokenPayload.roles)) {
      return NextResponse.json(
        { error: 'You can only update users in your own company' },
        { status: 403 }
      );
    }

    // If email is changing, check for duplicates
    if (email && email !== existing.email) {
      const duplicate = await db.sysUser.findUnique({ where: { email } });
      if (duplicate) {
        return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
      }
    }

    // ── Validate role IDs if being updated ─────────────────────────────
    if (roleIds !== undefined && roleIds.length > 0) {
      const roles = await db.sysRole.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, companyId: true, isGlobal: true, roleName: true },
      });

      for (const role of roles) {
        const isCompanyRole = role.companyId === existing.companyId;
        const isGlobalRole = role.isGlobal && role.companyId === 'SYSTEM';

        if (!isCompanyRole && !isGlobalRole) {
          if (!isSuperAdmin(tokenPayload.roles)) {
            return NextResponse.json(
              { error: `Role "${role.roleName}" does not belong to the user's company and is not a global role` },
              { status: 403 }
            );
          }
        }
      }

      // Check that all roleIds were found
      const foundIds = roles.map(r => r.id);
      const missingIds = roleIds.filter((rid: string) => !foundIds.includes(rid));
      if (missingIds.length > 0) {
        return NextResponse.json(
          { error: `Role IDs not found: ${missingIds.join(', ')}` },
          { status: 404 }
        );
      }
    }

    const oldValues = {
      email: existing.email,
      displayName: existing.displayName,
      isActive: existing.isActive,
      roleIds: existing.userRoles.map(ur => ur.roleId),
    };

    // Update user
    const user = await db.sysUser.update({
      where: { id },
      data: {
        ...(email !== undefined && { email }),
        ...(displayName !== undefined && { displayName }),
        ...(isActive !== undefined && { isActive }),
        ...(assignedBrands !== undefined && { assignedBrands: assignedBrands || null }),
        ...(assignedCountries !== undefined && { assignedCountries: assignedCountries || null }),
        ...(assignedTeams !== undefined && { assignedTeams: assignedTeams || null }),
        ...(dataScope !== undefined && { dataScope: dataScope || null }),
      },
    });

    // Update roles if provided
    if (roleIds !== undefined) {
      // Delete existing roles
      await db.userRole.deleteMany({ where: { userId: id } });

      // Create new roles
      if (roleIds.length > 0) {
        await db.userRole.createMany({
          data: roleIds.map((roleId: string) => ({ userId: id, roleId, companyId: existing.companyId })),
        });
      }
    }

    // Fetch updated user with relations
    const updatedUser = await db.sysUser.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        userRoles: { include: { role: true } },
      },
    });

    // ── Audit: user update ────────────────────────────────────────────
    await logAudit({
      action: AuditAction.USER_UPDATE,
      entityType: 'SysUser',
      entityId: id,
      description: `User "${existing.username}" updated`,
      oldValues,
      newValues: { email, displayName, isActive, roleIds },
      req: request,
    });

    return NextResponse.json({
      user: {
        id: updatedUser!.id,
        username: updatedUser!.username,
        email: updatedUser!.email,
        displayName: updatedUser!.displayName,
        isActive: updatedUser!.isActive,
        company: updatedUser!.company,
        roles: updatedUser!.userRoles.map((ur) => ur.role),
      },
    });
  } catch (error) {
    console.error('Admin Users PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/users - Deactivate user with tenant-scoped validation
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:write or tenant:users permission
    if (!hasPermission(tokenPayload.roles, 'admin:write') && !hasPermission(tokenPayload.roles, 'tenant:users')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: admin:write or tenant:users' }, { status: 403 });
    }

    // ── Rate limit: admin endpoints ────────────────────────────────────
    const rl = rateLimitByCategory('admin', tokenPayload.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    const existing = await db.sysUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── Tenant-scoped access: Company Admin can only deactivate users in own company ──
    if (!canManageTenantUsers(existing.companyId, tokenPayload.companyId, tokenPayload.roles)) {
      return NextResponse.json(
        { error: 'You can only deactivate users in your own company' },
        { status: 403 }
      );
    }

    // Don't allow deactivating yourself
    if (id === tokenPayload.userId) {
      return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 422 });
    }

    const user = await db.sysUser.update({
      where: { id },
      data: { isActive: false },
    });

    // ── Audit: user deactivate ────────────────────────────────────────
    await logAudit({
      action: AuditAction.USER_UPDATE,
      entityType: 'SysUser',
      entityId: id,
      description: `User "${existing.username}" deactivated`,
      oldValues: { isActive: true },
      newValues: { isActive: false },
      severity: 'warning',
      req: request,
    });

    return NextResponse.json({ user: { id: user.id, username: user.username, isActive: user.isActive } });
  } catch (error) {
    console.error('Admin Users DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
