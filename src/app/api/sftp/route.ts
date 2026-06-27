import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';

// GET /api/sftp - List SFTP configs
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    const hasSftpRole = tokenPayload.roles.some(r => ['Super Admin', 'SFTP Manager'].includes(r));
    if (!hasSftpRole) {
      return NextResponse.json({ error: 'Access denied. SFTP Manager role required.' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};
    if (!isSuperAdmin) {
      where.companyId = tokenPayload.companyId;
    }

    const configs = await db.sftpConfig.findMany({
      where,
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
        _count: { select: { syncLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const configsWithStats = configs.map(config => ({
      id: config.id,
      configName: config.configName,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      remotePath: config.remotePath,
      schedule: config.schedule,
      syncDirection: config.syncDirection,
      filePattern: config.filePattern,
      moduleId: config.moduleId,
      module: config.module,
      companyId: config.companyId,
      company: config.company,
      isActive: config.isActive,
      lastSyncAt: config.lastSyncAt,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      totalSyncs: config._count.syncLogs,
    }));

    return NextResponse.json({ configs: configsWithStats });
  } catch (error) {
    console.error('SFTP GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/sftp - Create SFTP config
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasSftpRole = tokenPayload.roles.some(r => ['Super Admin', 'SFTP Manager'].includes(r));
    if (!hasSftpRole) {
      return NextResponse.json({ error: 'Access denied. SFTP Manager role required.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      configName, host, port, username, authType, authCredential,
      remotePath, schedule, syncDirection, filePattern, moduleId, companyId, isActive,
    } = body;

    if (!configName || !host || !username) {
      return NextResponse.json({ error: 'configName, host, and username are required' }, { status: 400 });
    }

    const config = await db.sftpConfig.create({
      data: {
        configName,
        host,
        port: port || 22,
        username,
        authType: authType || 'PASSWORD',
        authCredential: authCredential || '',
        remotePath: remotePath || '/',
        schedule: schedule || null,
        syncDirection: syncDirection || 'INBOUND',
        filePattern: filePattern || '*.*',
        moduleId: moduleId || null,
        companyId: companyId || tokenPayload.companyId,
        isActive: isActive !== undefined ? isActive : true,
      },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
      },
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    console.error('SFTP POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/sftp - Update SFTP config
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasSftpRole = tokenPayload.roles.some(r => ['Super Admin', 'SFTP Manager'].includes(r));
    if (!hasSftpRole) {
      return NextResponse.json({ error: 'Access denied. SFTP Manager role required.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.sftpConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'SFTP config not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && existing.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Build update data from provided fields
    const allowedFields = [
      'configName', 'host', 'port', 'username', 'authType', 'authCredential',
      'remotePath', 'schedule', 'syncDirection', 'filePattern', 'moduleId', 'companyId', 'isActive',
    ];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updateFields[field] !== undefined) {
        updateData[field] = updateFields[field];
      }
    }

    const config = await db.sftpConfig.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error('SFTP PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/sftp - Delete SFTP config
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    const hasSftpRole = tokenPayload.roles.some(r => ['Super Admin', 'SFTP Manager'].includes(r));
    if (!hasSftpRole) {
      return NextResponse.json({ error: 'Access denied. SFTP Manager role required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    const existing = await db.sftpConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'SFTP config not found' }, { status: 404 });
    }

    if (!isSuperAdmin && existing.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await db.sftpConfig.delete({ where: { id } });

    return NextResponse.json({ message: 'SFTP config deleted successfully' });
  } catch (error) {
    console.error('SFTP DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
