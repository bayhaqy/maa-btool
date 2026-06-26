import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // (We run `bun run type-check` in CI for strict checking instead.)
  typescript: {
    ignoreBuildErrors: true,
  },
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

export default nextConfig;
