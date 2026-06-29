import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { jsonVal } from '@/lib/db-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/data-exchange/[id] — Get single endpoint with run logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const includeLogs = searchParams.get('logs') === 'true';

    const endpoint = await db.dataExchangeEndpoint.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
        ...(includeLogs ? { runLogs: { orderBy: { startedAt: 'desc' }, take: 50 } } : {}),
        _count: { select: { runLogs: true } },
      },
    });

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && endpoint.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ endpoint });
  } catch (error) {
    console.error('Data Exchange [id] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/data-exchange/[id] — Update endpoint
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'integration:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: integration:write' }, { status: 403 });
    }

    const { id } = await params;
    const endpoint = await db.dataExchangeEndpoint.findUnique({ where: { id } });
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && endpoint.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      endpointName, description, endpointType, direction,
      connectionConfig, mappingConfig, scheduleConfig, transformRules,
      errorHandling, moduleId, isActive,
    } = body;

    const data: Record<string, unknown> = {};
    if (endpointName !== undefined) data.endpointName = endpointName;
    if (description !== undefined) data.description = description;
    if (endpointType !== undefined) data.endpointType = endpointType;
    if (direction !== undefined) data.direction = direction;
    if (connectionConfig !== undefined) data.connectionConfig = typeof connectionConfig === 'string' ? jsonVal(JSON.parse(connectionConfig)) : jsonVal(connectionConfig);
    if (mappingConfig !== undefined) data.mappingConfig = typeof mappingConfig === 'string' ? jsonVal(JSON.parse(mappingConfig)) : jsonVal(mappingConfig);
    if (scheduleConfig !== undefined) data.scheduleConfig = typeof scheduleConfig === 'string' ? jsonVal(JSON.parse(scheduleConfig)) : jsonVal(scheduleConfig);
    if (transformRules !== undefined) data.transformRules = typeof transformRules === 'string' ? jsonVal(JSON.parse(transformRules)) : jsonVal(transformRules);
    if (errorHandling !== undefined) data.errorHandling = typeof errorHandling === 'string' ? jsonVal(JSON.parse(errorHandling)) : jsonVal(errorHandling);
    if (moduleId !== undefined) data.moduleId = moduleId || null;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await db.dataExchangeEndpoint.update({
      where: { id },
      data,
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
      },
    });

    return NextResponse.json({ endpoint: updated });
  } catch (error) {
    console.error('Data Exchange [id] PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/data-exchange/[id] — Delete endpoint and all logs
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'integration:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: integration:write' }, { status: 403 });
    }

    const { id } = await params;
    const endpoint = await db.dataExchangeEndpoint.findUnique({ where: { id } });
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');
    if (!isSuperAdmin && endpoint.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await db.dataExchangeEndpoint.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Data Exchange [id] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
