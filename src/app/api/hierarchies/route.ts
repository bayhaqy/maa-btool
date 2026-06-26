import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';

// GET /api/hierarchies?moduleId=xxx - List hierarchies
// GET /api/hierarchies?action=nodes&hierarchyId=xxx - Get all nodes for a hierarchy
// GET /api/hierarchies?action=detail&id=xxx - Get hierarchy detail
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Create node
    if (action === 'nodes') {
      const { hierarchyId, parentNodeId, nodeLabel, recordId, sortOrder } = body;

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

      const node = await db.hierarchyNode.create({
        data: {
          hierarchyId,
          parentNodeId: parentNodeId || null,
          nodeLabel,
          recordId: recordId || null,
          materializedPath,
          depthLevel,
          sortOrder: sortOrder ?? 0,
        },
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // Update node
    if (action === 'nodes') {
      const { id, nodeLabel, parentNodeId, sortOrder, isActive } = body;

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

      const node = await db.hierarchyNode.update({
        where: { id },
        data: {
          ...(nodeLabel !== undefined && { nodeLabel }),
          ...(parentNodeId !== undefined && { parentNodeId: parentNodeId || null, materializedPath, depthLevel }),
          ...(sortOrder !== undefined && { sortOrder }),
          ...(isActive !== undefined && { isActive }),
        },
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

    const hierarchy = await db.hierarchyModel.update({
      where: { id },
      data: {
        ...(hierarchyName !== undefined && { hierarchyName }),
        ...(description !== undefined && { description }),
      },
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
    return NextResponse.json({ message: 'Hierarchy deleted' });
  } catch (error) {
    console.error('Hierarchies DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
