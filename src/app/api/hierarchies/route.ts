import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

// GET /api/hierarchies?moduleId=xxx - List hierarchies
// GET /api/hierarchies?action=nodes&hierarchyId=xxx - Get all nodes for a hierarchy
// GET /api/hierarchies?action=detail&id=xxx - Get hierarchy detail
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authCheck = checkAuthAndPermission(tokenPayload, 'hierarchy:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const hierarchyId = searchParams.get('hierarchyId');
    const moduleId = searchParams.get('moduleId');
    const id = searchParams.get('id');

    // Get nodes for a hierarchy (tree structure)
    if (action === 'nodes' && hierarchyId) {
      const nodes = await db.hierarchyNode.findMany({
        where: { hierarchyId, isActive: true },
        orderBy: [{ depthLevel: 'asc' }, { sortOrder: 'asc' }],
        include: {
          record: {
            select: { id: true, status: true, currentPayload: true },
          },
        },
      });

      // Build tree structure
      const nodeMap = new Map<string, typeof nodes[0] & { children: typeof nodes }>();
      const rootNodes: (typeof nodes[0] & { children: typeof nodes })[] = [];

      for (const node of nodes) {
        nodeMap.set(node.id, { ...node, children: [] });
      }

      for (const node of nodes) {
        const nodeWithChildren = nodeMap.get(node.id)!;
        if (node.parentNodeId && nodeMap.has(node.parentNodeId)) {
          nodeMap.get(node.parentNodeId)!.children.push(nodeWithChildren);
        } else {
          rootNodes.push(nodeWithChildren);
        }
      }

      return NextResponse.json({ nodes: rootNodes, flatNodes: nodes });
    }

    // Get hierarchy detail
    if (action === 'detail' && id) {
      const hierarchy = await db.hierarchyModel.findUnique({
        where: { id },
        include: {
          module: true,
          nodes: {
            where: { isActive: true },
            orderBy: [{ depthLevel: 'asc' }, { sortOrder: 'asc' }],
          },
        },
      });

      if (!hierarchy) {
        return NextResponse.json({ error: 'Hierarchy not found' }, { status: 404 });
      }

      return NextResponse.json({ hierarchy });
    }

    // List hierarchies
    const where: Record<string, unknown> = {};
    if (moduleId) {
      where.moduleId = moduleId;
    }

    const hierarchies = await db.hierarchyModel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        module: { select: { id: true, moduleCode: true, moduleName: true } },
        _count: { select: { nodes: { where: { isActive: true } } } },
      },
    });

    return NextResponse.json({
      hierarchies: hierarchies.map((h) => ({
        ...h,
        nodeCount: h._count.nodes,
        _count: undefined,
      })),
    });
  } catch (error) {
    console.error('Hierarchies GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/hierarchies - Create hierarchy
// POST /api/hierarchies?action=nodes - Create node
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authCheck = checkAuthAndPermission(tokenPayload, 'hierarchy:write');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Create node
    if (action === 'nodes') {
      const { hierarchyId, parentNodeId, nodeLabel, recordId, sortOrder, status, description } = body;

      if (!hierarchyId || !nodeLabel) {
        return NextResponse.json({ error: 'hierarchyId and nodeLabel are required' }, { status: 400 });
      }

      // Calculate materializedPath and depthLevel
      let materializedPath = '';
      let depthLevel = 0;

      if (parentNodeId) {
        const parent = await db.hierarchyNode.findUnique({ where: { id: parentNodeId } });
        if (!parent) {
          return NextResponse.json({ error: 'Parent node not found' }, { status: 404 });
        }
        materializedPath = parent.materializedPath
          ? `${parent.materializedPath}.${parent.id}`
          : parent.id;
        depthLevel = parent.depthLevel + 1;
      }

      // Compute next sortOrder among siblings if not provided
      let nextSortOrder = sortOrder;
      if (nextSortOrder === undefined || nextSortOrder === null) {
        const siblingAgg = await db.hierarchyNode.aggregate({
          where: { hierarchyId, parentNodeId: parentNodeId || null },
          _max: { sortOrder: true },
        });
        nextSortOrder = (siblingAgg._max.sortOrder ?? -1) + 1;
      }

      const node = await db.hierarchyNode.create({
        data: {
          hierarchyId,
          parentNodeId: parentNodeId || null,
          nodeLabel,
          recordId: recordId || null,
          materializedPath,
          depthLevel,
          sortOrder: nextSortOrder,
          ...(status && { status }),
          ...(description !== undefined && { description }),
        },
      });

      await logAudit({
        userId: tokenPayload.userId,
        action: 'HIERARCHY_NODE_CREATE',
        entityType: 'HierarchyNode',
        entityId: node.id,
        moduleName: 'Hierarchy',
        description: `Created node "${nodeLabel}" in hierarchy ${hierarchyId}`,
        newValues: {
          id: node.id,
          hierarchyId,
          parentNodeId: parentNodeId || null,
          nodeLabel,
          materializedPath,
          depthLevel,
          sortOrder: nextSortOrder,
          status: node.status,
        },
        companyId: tokenPayload.companyId,
      });

      return NextResponse.json({ node }, { status: 201 });
    }

    // Create hierarchy
    const { moduleId, hierarchyName, description } = body;

    if (!moduleId || !hierarchyName) {
      return NextResponse.json({ error: 'moduleId and hierarchyName are required' }, { status: 400 });
    }

    const metaModule = await db.metaModule.findUnique({ where: { id: moduleId } });
    if (!metaModule) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    const hierarchy = await db.hierarchyModel.create({
      data: {
        moduleId,
        hierarchyName,
        description,
      },
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'HIERARCHY_CREATE',
      entityType: 'HierarchyModel',
      entityId: hierarchy.id,
      moduleName: metaModule.moduleName,
      description: `Created hierarchy "${hierarchyName}" in module ${metaModule.moduleName}`,
      newValues: {
        id: hierarchy.id,
        moduleId,
        hierarchyName,
        description: description || null,
      },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ hierarchy }, { status: 201 });
  } catch (error) {
    console.error('Hierarchies POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/hierarchies - Update hierarchy
// PUT /api/hierarchies?action=nodes - Update node
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authCheck = checkAuthAndPermission(tokenPayload, 'hierarchy:write');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Update node
    if (action === 'nodes') {
      const { id, nodeLabel, parentNodeId, sortOrder, isActive, status, description } = body;

      if (!id) {
        return NextResponse.json({ error: 'Node id is required' }, { status: 400 });
      }

      const existing = await db.hierarchyNode.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Node not found' }, { status: 404 });
      }

      let materializedPath = existing.materializedPath;
      let depthLevel = existing.depthLevel;

      // Recalculate materializedPath if parent changes
      if (parentNodeId !== undefined && parentNodeId !== existing.parentNodeId) {
        if (parentNodeId === null) {
          materializedPath = '';
          depthLevel = 0;
        } else {
          const parent = await db.hierarchyNode.findUnique({ where: { id: parentNodeId } });
          if (!parent) {
            return NextResponse.json({ error: 'Parent node not found' }, { status: 404 });
          }
          // Prevent circular reference
          if (parent.materializedPath.includes(id) || parent.id === id) {
            return NextResponse.json({ error: 'Circular reference detected' }, { status: 422 });
          }
          materializedPath = parent.materializedPath
            ? `${parent.materializedPath}.${parent.id}`
            : parent.id;
          depthLevel = parent.depthLevel + 1;
        }

        // Update all children's materializedPath
        const oldPathPrefix = existing.materializedPath
          ? `${existing.materializedPath}.${existing.id}`
          : existing.id;
        const newPathPrefix = materializedPath
          ? `${materializedPath}.${existing.id}`
          : existing.id;

        const children = await db.hierarchyNode.findMany({
          where: { materializedPath: { startsWith: oldPathPrefix } },
        });

        for (const child of children) {
          const newChildPath = child.materializedPath.replace(oldPathPrefix, newPathPrefix);
          const pathParts = newChildPath.split('.');
          await db.hierarchyNode.update({
            where: { id: child.id },
            data: {
              materializedPath: newChildPath,
              depthLevel: pathParts.length - 1,
            },
          });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (nodeLabel !== undefined) updateData.nodeLabel = nodeLabel;
      if (parentNodeId !== undefined) {
        updateData.parentNodeId = parentNodeId || null;
        updateData.materializedPath = materializedPath;
        updateData.depthLevel = depthLevel;
      }
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (status !== undefined) updateData.status = status;
      if (description !== undefined) updateData.description = description;

      const node = await db.hierarchyNode.update({
        where: { id },
        data: updateData,
      });

      await logAudit({
        userId: tokenPayload.userId,
        action: 'HIERARCHY_NODE_UPDATE',
        entityType: 'HierarchyNode',
        entityId: id,
        moduleName: 'Hierarchy',
        description: `Updated node "${existing.nodeLabel}"${nodeLabel && nodeLabel !== existing.nodeLabel ? ` → "${nodeLabel}"` : ''}`,
        oldValues: {
          id: existing.id,
          nodeLabel: existing.nodeLabel,
          parentNodeId: existing.parentNodeId,
          materializedPath: existing.materializedPath,
          depthLevel: existing.depthLevel,
          sortOrder: existing.sortOrder,
          isActive: existing.isActive,
          status: existing.status,
          description: existing.description,
        },
        newValues: updateData,
        companyId: tokenPayload.companyId,
      });

      return NextResponse.json({ node });
    }

    // Update hierarchy
    const { id, hierarchyName, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Hierarchy id is required' }, { status: 400 });
    }

    const existing = await db.hierarchyModel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Hierarchy not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (hierarchyName !== undefined) updateData.hierarchyName = hierarchyName;
    if (description !== undefined) updateData.description = description;

    const hierarchy = await db.hierarchyModel.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'HIERARCHY_UPDATE',
      entityType: 'HierarchyModel',
      entityId: id,
      moduleName: 'Hierarchy',
      description: `Updated hierarchy "${existing.hierarchyName}"`,
      oldValues: {
        id: existing.id,
        hierarchyName: existing.hierarchyName,
        description: existing.description,
      },
      newValues: updateData,
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ hierarchy });
  } catch (error) {
    console.error('Hierarchies PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/hierarchies - Delete hierarchy
// DELETE /api/hierarchies?action=nodes - Delete node
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authCheck = checkAuthAndPermission(tokenPayload, 'hierarchy:write');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    // Delete node
    if (action === 'nodes') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: 'Node id is required' }, { status: 400 });
      }

      const existing = await db.hierarchyNode.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Node not found' }, { status: 404 });
      }

      await db.hierarchyNode.delete({ where: { id } });

      await logAudit({
        userId: tokenPayload.userId,
        action: 'HIERARCHY_NODE_DELETE',
        entityType: 'HierarchyNode',
        entityId: id,
        moduleName: 'Hierarchy',
        description: `Deleted node "${existing.nodeLabel}" (hierarchyId=${existing.hierarchyId})`,
        oldValues: {
          id: existing.id,
          hierarchyId: existing.hierarchyId,
          nodeLabel: existing.nodeLabel,
          parentNodeId: existing.parentNodeId,
          materializedPath: existing.materializedPath,
          depthLevel: existing.depthLevel,
          sortOrder: existing.sortOrder,
          status: existing.status,
        },
        companyId: tokenPayload.companyId,
      });

      return NextResponse.json({ message: 'Node deleted' });
    }

    // Delete hierarchy
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Hierarchy id is required' }, { status: 400 });
    }

    const existing = await db.hierarchyModel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Hierarchy not found' }, { status: 404 });
    }

    await db.hierarchyModel.delete({ where: { id } });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'HIERARCHY_DELETE',
      entityType: 'HierarchyModel',
      entityId: id,
      moduleName: 'Hierarchy',
      description: `Deleted hierarchy "${existing.hierarchyName}"`,
      oldValues: {
        id: existing.id,
        moduleId: existing.moduleId,
        hierarchyName: existing.hierarchyName,
        description: existing.description,
      },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ message: 'Hierarchy deleted' });
  } catch (error) {
    console.error('Hierarchies DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
