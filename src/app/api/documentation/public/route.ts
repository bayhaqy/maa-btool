import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/documentation/public - Public documentation endpoint (no auth required)
// Returns only published documentation articles
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const slug = searchParams.get('slug');

    const where: Record<string, unknown> = { isPublished: true };
    if (category) where.category = category;

    // Get single published doc by slug
    if (slug) {
      const doc = await db.documentation.findUnique({
        where: { slug },
        include: {
          author: { select: { username: true, displayName: true } },
        },
      });
      if (!doc || !doc.isPublished) {
        return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
      }
      // Increment view count
      await db.documentation.update({
        where: { id: doc.id },
        data: { viewCount: { increment: 1 } },
      });
      return NextResponse.json({ doc });
    }

    // List published docs
    const docs = await db.documentation.findMany({
      where,
      include: {
        author: { select: { username: true, displayName: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ docs });
  } catch (error) {
    console.error('Public documentation GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve documentation' }, { status: 500 });
  }
}
