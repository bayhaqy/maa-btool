import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { jsonVal, jsonParse } from '@/lib/db-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/data-exchange — List all endpoints for the user's company
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'integration:read')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: integration:read' }, { status: 403 });
    }

    const isSuperAdmin = tokenPayload.roles.includes('Super Admin');

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    let where: Record<string, unknown> = {};
    if (!isSuperAdmin) {
      where = { companyId: tokenPayload.companyId };
    } else if (companyId) {
      where = { companyId };
    }

    const endpoints = await db.dataExchangeEndpoint.findMany({
      where,
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
        runLogs: { orderBy: { startedAt: 'desc' }, take: 10 },
        _count: { select: { runLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ endpoints });
  } catch (error) {
    console.error('Data Exchange GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/data-exchange — Create a new endpoint
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'integration:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: integration:write' }, { status: 403 });
    }

    const body = await request.json();
    const {
      endpointName, endpointCode, description, endpointType, direction,
      connectionConfig, mappingConfig, scheduleConfig, transformRules,
      errorHandling, moduleId, isActive,
    } = body;

    if (!endpointName || !endpointCode) {
      return NextResponse.json({ error: 'endpointName and endpointCode are required' }, { status: 400 });
    }

    // Check unique code
    const existing = await db.dataExchangeEndpoint.findUnique({ where: { endpointCode } });
    if (existing) {
      return NextResponse.json({ error: 'endpointCode must be unique' }, { status: 409 });
    }

    const endpoint = await db.dataExchangeEndpoint.create({
      data: {
        companyId: tokenPayload.companyId,
        endpointName,
        endpointCode,
        description: description || null,
        endpointType: endpointType || 'REST_API',
        direction: direction || 'INBOUND',
        connectionConfig: typeof connectionConfig === 'string' ? jsonVal(JSON.parse(connectionConfig)) : jsonVal(connectionConfig || {}),
        mappingConfig: mappingConfig ? (typeof mappingConfig === 'string' ? jsonVal(JSON.parse(mappingConfig)) : jsonVal(mappingConfig)) : null,
        scheduleConfig: scheduleConfig ? (typeof scheduleConfig === 'string' ? jsonVal(JSON.parse(scheduleConfig)) : jsonVal(scheduleConfig)) : null,
        transformRules: transformRules ? (typeof transformRules === 'string' ? jsonVal(JSON.parse(transformRules)) : jsonVal(transformRules)) : null,
        errorHandling: errorHandling ? (typeof errorHandling === 'string' ? jsonVal(JSON.parse(errorHandling)) : jsonVal(errorHandling)) : null,
        moduleId: moduleId || null,
        isActive: isActive !== undefined ? isActive : true,
      },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        module: { select: { id: true, moduleCode: true, moduleName: true } },
      },
    });

    return NextResponse.json({ endpoint }, { status: 201 });
  } catch (error) {
    console.error('Data Exchange POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/data-exchange — Bulk update (e.g. toggle active)
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(tokenPayload.roles, 'integration:write')) {
      return NextResponse.json({ error: 'Insufficient permissions. Required: integration:write' }, { status: 403 });
    }

    const body = await request.json();
    const { endpointId, action } = body;

    if (!endpointId || !action) {
      return NextResponse.json({ error: 'endpointId and action are required' }, { status: 400 });
    }

    const endpoint = await db.dataExchangeEndpoint.findUnique({ where: { id: endpointId } });
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const isSA = tokenPayload.roles.includes('Super Admin');
    if (!isSA && endpoint.companyId !== tokenPayload.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (action === 'toggleActive') {
      const updated = await db.dataExchangeEndpoint.update({
        where: { id: endpointId },
        data: { isActive: !endpoint.isActive },
      });
      return NextResponse.json({ endpoint: updated });
    }

    if (action === 'testConnection') {
      // Simulate connection test — in production this would actually test the endpoint
      const config = jsonParse<Record<string, unknown>>(endpoint.connectionConfig || '{}');
      const success = Math.random() > 0.2; // 80% success simulation
      const result = {
        success,
        message: success
          ? `Connection to ${config.url || config.host || 'endpoint'} successful`
          : `Connection failed: Timeout after 5000ms`,
        testedAt: new Date().toISOString(),
      };
      return NextResponse.json({ result });
    }

    if (action === 'triggerRun') {
      // Create a new run log entry
      const log = await db.dataExchangeLog.create({
        data: {
          endpointId,
          runStatus: 'RUNNING',
          recordsProcessed: 0,
          recordsSuccess: 0,
          recordsFailed: 0,
        },
      });

      // Update endpoint lastRunAt
      await db.dataExchangeEndpoint.update({
        where: { id: endpointId },
        data: { lastRunAt: new Date(), lastRunStatus: 'RUNNING' },
      });

      // Simulate async completion
      setTimeout(async () => {
        const totalRecords = Math.floor(Math.random() * 500) + 50;
        const failedRecords = Math.floor(Math.random() * 10);
        try {
          await db.dataExchangeLog.update({
            where: { id: log.id },
            data: {
              runStatus: failedRecords > 5 ? 'PARTIAL' : 'COMPLETED',
              recordsProcessed: totalRecords,
              recordsSuccess: totalRecords - failedRecords,
              recordsFailed: failedRecords,
              completedAt: new Date(),
              errorDetail: failedRecords > 0 ? `${failedRecords} records failed validation` : null,
            },
          });
          await db.dataExchangeEndpoint.update({
            where: { id: endpointId },
            data: { lastRunStatus: failedRecords > 5 ? 'PARTIAL' : 'COMPLETED' },
          });
        } catch {
          // silently fail
        }
      }, 2000);

      return NextResponse.json({ log, message: 'Sync triggered successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Data Exchange PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
