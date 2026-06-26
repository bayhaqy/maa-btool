import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';

// GET /api/documentation - List docs (PUBLIC access for published docs)
// Supports: ?category=xxx, ?published=true, ?slug=xxx, ?public=true
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const published = searchParams.get('published');
    const slug = searchParams.get('slug');
    const isPublic = searchParams.get('public') === 'true';

    const tokenPayload = getTokenFromHeaders(request.headers);

    // Get single doc by slug
    if (slug) {
      const doc = await db.documentation.findUnique({
        where: { slug },
        include: {
          author: { select: { id: true, username: true, displayName: true } },
        },
      });

      if (!doc) {
        return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
      }

      // Public access: only published docs
      if (isPublic && !doc.isPublished) {
        return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
      }

      // Unauthenticated access: only published docs
      if (!tokenPayload && !doc.isPublished) {
        return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
      }

      // Increment view count
      await db.documentation.update({
        where: { id: doc.id },
        data: { viewCount: { increment: 1 } },
      });

      return NextResponse.json({ doc });
    }

    // Build where clause
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (published === 'true') where.isPublished = true;
    if (published === 'false') where.isPublished = false;

    // Public/unauthenticated access: only see published docs
    if (isPublic || !tokenPayload) {
      where.isPublished = true;
    } else {
      // Authenticated: Doc Writers and Super Admins can see unpublished
      const isDocRole = tokenPayload.roles.some(r => ['Super Admin', 'Doc Writer'].includes(r));
      if (!isDocRole && published !== 'false') {
        where.isPublished = true;
      }
    }

    const docs = await db.documentation.findMany({
      where,
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ docs });
  } catch (error) {
    console.error('Documentation GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/documentation - Create doc
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasDocRole = tokenPayload.roles.some(r => ['Super Admin', 'Doc Writer'].includes(r));
    if (!hasDocRole) {
      return NextResponse.json({ error: 'Access denied. Doc Writer role required.' }, { status: 403 });
    }

    const body = await request.json();
    const { title, slug, content, category, tags, isPublished, sortOrder, attachments } = body;

    if (!title || !slug || !content || !category) {
      return NextResponse.json({ error: 'title, slug, content, and category are required' }, { status: 400 });
    }

    // Check slug uniqueness
    const existing = await db.documentation.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: 'A document with this slug already exists' }, { status: 409 });
    }

    const doc = await db.documentation.create({
      data: {
        title,
        slug,
        content,
        category,
        tags: tags || null,
        authorId: tokenPayload.userId,
        isPublished: isPublished || false,
        sortOrder: sortOrder || 0,
      },
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
    });

    return NextResponse.json({ doc }, { status: 201 });
  } catch (error) {
    console.error('Documentation POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/documentation - Update doc
export async function PATCH(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasDocRole = tokenPayload.roles.some(r => ['Super Admin', 'Doc Writer'].includes(r));
    if (!hasDocRole) {
      return NextResponse.json({ error: 'Access denied. Doc Writer role required.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.documentation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
    }

    // If slug is being changed, check uniqueness
    if (updateFields.slug && updateFields.slug !== existing.slug) {
      const slugConflict = await db.documentation.findUnique({ where: { slug: updateFields.slug } });
      if (slugConflict) {
        return NextResponse.json({ error: 'A document with this slug already exists' }, { status: 409 });
      }
    }

    // Build update data
    const allowedFields = ['title', 'slug', 'content', 'category', 'tags', 'isPublished', 'sortOrder'];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updateFields[field] !== undefined) {
        updateData[field] = updateFields[field];
      }
    }

    // Auto-increment version on content change
    if (updateFields.content !== undefined) {
      updateData.version = existing.version + 1;
    }

    const doc = await db.documentation.update({
      where: { id },
      data: updateData,
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
    });

    return NextResponse.json({ doc });
  } catch (error) {
    console.error('Documentation PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/documentation - Delete doc
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasDocRole = tokenPayload.roles.some(r => ['Super Admin', 'Doc Writer'].includes(r));
    if (!hasDocRole) {
      return NextResponse.json({ error: 'Access denied. Doc Writer role required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    const existing = await db.documentation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
    }

    await db.documentation.delete({ where: { id } });

    return NextResponse.json({ message: 'Documentation deleted successfully' });
  } catch (error) {
    console.error('Documentation DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
