import { NextRequest, NextResponse } from 'next/server';
import { isR2Configured, getSignedReadUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';

// GET /api/r2-image?key=xxx - Proxy for R2-stored images
// Generates a signed URL and redirects the client
export async function GET(request: NextRequest) {
  try {
    if (!isR2Configured()) {
      return NextResponse.json({ error: 'R2 storage is not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const download = searchParams.get('download') === 'true';

    if (!key) {
      return NextResponse.json({ error: 'key query parameter is required' }, { status: 400 });
    }

    const signedUrl = await getSignedReadUrl(key, 3600); // 1 hour expiry

    if (download) {
      // For downloads, fetch the content and return with Content-Disposition
      const response = await fetch(signedUrl);
      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to fetch from R2' }, { status: 502 });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = key.split('/').pop() || 'download';
      const headers = new Headers();
      headers.set('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
      headers.set('Cache-Control', 'private, max-age=3600');
      return new NextResponse(buffer, { headers });
    }

    // Redirect to signed URL for streaming
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error('R2 image proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
