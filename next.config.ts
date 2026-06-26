import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ── Performance optimizations ──────────────────────────────────────────
  // Compress responses (gzip/brotli) — Vercel already does this at the edge,
  // but enabling here helps self-hosted / preview environments too.
  compress: true,
  // Inline small stylesheets and scripts to reduce round-trips on first paint.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      'date-fns',
      'react-markdown',
      'remark-gfm',
      'rehype-highlight',
    ],
  },
  // Image optimization — allow remote patterns for the documentation hub
  // and brand logo. We use next/image where possible.
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'maa-btool.vercel.app' },
      { protocol: 'https', hostname: 'maa-btool.bayhaqy.my.id' },
    ],
  },
  // Static-page regeneration: revalidate the marketing/login shell every
  // 5 minutes so deploys don't require a cache flush.
  // (Note: API routes stay dynamic; this only affects cached pages.)
  async headers() {
    return [
      {
        source: '/:path*{(png|svg|ico|woff2|css|js)}',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
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
