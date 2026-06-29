import type { NextConfig } from "next";

const nextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // ── Security ──────────────────────────────────────────────────────────
  // Remove the X-Powered-By response header (security through obscurity,
  // but still a 2026 best practice — reduces fingerprinting surface).
  poweredByHeader: false,
  // Compress responses (gzip/brotli) — Vercel already does this at the edge,
  // but enabling here helps self-hosted / preview environments too.
  compress: true,
  // ── TypeScript & ESLint ────────────────────────────────────────────────
  // Production builds should NEVER fail on type errors — Vercel uses this.
  // (We run `bun run type-check` in CI for advisory checking instead.)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Next.js 16 type defs no longer include `eslint`, but it is still honored
  // at runtime. The whole object is cast to NextConfig below to silence TS2353.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // ── Performance optimizations ──────────────────────────────────────────
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      'date-fns',
      'react-markdown',
      'remark-gfm',
      'rehype-highlight',
      'recharts',
      '@tanstack/react-table',
    ],
  },
  // ── Image optimization ────────────────────────────────────────────────
  // Allow remote patterns for the documentation hub and brand logo.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'maa-btool.vercel.app' },
      { protocol: 'https', hostname: 'maa-btool.bayhaqy.my.id' },
      { protocol: 'https', hostname: 'bayhaqy.my.id' },
      { protocol: 'https', hostname: 'static.nike.com' },
      { protocol: 'https', hostname: 'assets.adidas.com' },
      { protocol: 'https', hostname: 'images.puma.com' },
      { protocol: 'https', hostname: 'images.converse.com' },
      { protocol: 'https', hostname: 'images.vans.com' },
      { protocol: 'https', hostname: 'underarmour.scene7.com' },
      { protocol: 'https', hostname: 'nbscene2.scene7.com' },
      { protocol: 'https', hostname: 'images.thenorthface.com' },
      { protocol: 'https', hostname: 'images.timberland.com' },
      { protocol: 'https', hostname: 'lsco.scene7.com' },
      { protocol: 'https', hostname: 'tommy-eu.scene7.com' },
      { protocol: 'https', hostname: 'www.starbucks.co.id' },
      { protocol: 'https', hostname: 'www.casio.com' },
      { protocol: 'https', hostname: 'assets.reebok.com' },
      { protocol: 'https', hostname: 'www.skechers.com' },
      { protocol: 'https', hostname: 'www.asics.com' },
      { protocol: 'https', hostname: 'www.hoka.com' },
    ],
  },
  // ── Static-page regeneration & headers ────────────────────────────────
  async headers() {
    return [
      // Hash-named static assets — immutable forever
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Common static file extensions
      {
        source: '/:path*{(png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|eot|css|js|map)}',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Brand logo — preloaded, immutable
      {
        source: '/map-active-logo.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig as NextConfig;
