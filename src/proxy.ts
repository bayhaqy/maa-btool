import { NextResponse, type NextRequest } from 'next/server';

/**
 * Global security middleware.
 *
 * Adds standard browser-facing security headers to every response, and
 * `Cache-Control: no-store` to API responses (so tokens / user data are
 * never cached by proxies or the browser).
 *
 * Skipped paths: Next.js internals (`/_next/static`, `/_next/image`),
 * favicons, and other static asset files. We still process API and page
 * routes.
 */

const STATIC_PATH_PATTERNS = [
  /^\/_next\/static\//,
  /^\/_next\/image\//,
  /^\/favicon\.ico$/,
  /^\/map-logo\.png$/,
  // Common static asset extensions served from /public
  /^\/.*\.(?:png|jpe?g|gif|webp|avif|bmp|ico|svg|css|js|woff2?|ttf|otf|eot|map)$/i,
];

function isStaticPath(pathname: string): boolean {
  return STATIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

export function proxy(request: NextRequest) {
  // Always pass through — we only mutate response headers.
  const response = NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith('/api/');

  // ── Security headers (applied to every response) ────────────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // ── Cache-Control for API routes ───────────────────────────────────────
  // API responses may contain user-specific or sensitive data, so they must
  // never be cached by browsers or intermediary proxies.
  if (isApi) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  // Run on every route except the static asset patterns above.
  // `matcher` is evaluated before the middleware function runs, so we
  // configure it here to also exclude Next internals for performance.
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next internals)
     * - favicon.ico, map-logo.png (static)
     * - public assets with common static extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|map-logo.png|map-active-logo.png).*)',
  ],
};
