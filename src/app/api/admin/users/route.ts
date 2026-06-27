import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders, hashPassword } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';

// GET /api/admin/users - List all users with roles and company info
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can manage users
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can manage users.' }, { status: 403 });
    }

    const users = await db.sysUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        userRoles: {
          include: { role: { select: { id: true, roleName: true } } },
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
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    console.error('Admin Users GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/users - Create user
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can create users
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can create users.' }, { status: 403 });
    }

    const body = await request.json();
    const { username, email, password, companyId, roleIds } = body;

    if (!username || !email || !password || !companyId) {
      return NextResponse.json(
        { error: 'username, email, password, and companyId are required' },
        { status: 400 }
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

    const passwordHash = await hashPassword(password);

    const user = await db.sysUser.create({
      data: {
        username,
        email,
        passwordHash,
        companyId,
        userRoles: {
          create: (roleIds || []).map((roleId: string) => ({
            roleId,
          })),
        },
      },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        userRoles: { include: { role: true } },
      },
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

// PUT /api/admin/users - Update user
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can update users
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can update users.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, email, displayName, isActive, roleIds } = body;

    if (!id) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    const existing = await db.sysUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If email is changing, check for duplicates
    if (email && email !== existing.email) {
      const duplicate = await db.sysUser.findUnique({ where: { email } });
      if (duplicate) {
        return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
      }
    }

    // Update user
    const user = await db.sysUser.update({
      where: { id },
      data: {
        ...(email !== undefined && { email }),
        ...(displayName !== undefined && { displayName }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // Update roles if provided
    if (roleIds !== undefined) {
      // Delete existing roles
      await db.userRole.deleteMany({ where: { userId: id } });

      // Create new roles
      if (roleIds.length > 0) {
        await db.userRole.createMany({
          data: roleIds.map((roleId: string) => ({ userId: id, roleId })),
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

// DELETE /api/admin/users - Deactivate user
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Super Admin can delete users
    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Only Super Admin can delete users.' }, { status: 403 });
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

    // Don't allow deactivating yourself
    if (id === tokenPayload.userId) {
      return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 422 });
    }

    const user = await db.sysUser.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ user: { id: user.id, username: user.username, isActive: user.isActive } });
  } catch (error) {
    console.error('Admin Users DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
