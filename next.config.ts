import type { NextConfig } from "next";

const nextConfig = {
  output: "standalone", // for local dev — enable only for Vercel deployment
  reactStrictMode: false,
  // ── Security ──────────────────────────────────────────────────────────
  poweredByHeader: false,
  compress: true,
  // ── TypeScript ────────────────────────────────────────────────────────
  typescript: {
    ignoreBuildErrors: true,
  },
  // ── Server External Packages ──────────────────────────────────────────
  // Heavy native modules that should NOT be bundled by Turbopack/Webpack.
  // Instead they are loaded at runtime from node_modules, which avoids
  // high memory usage during bundling and prevents OOM in constrained envs.
  serverExternalPackages: ['sharp', '@aws-sdk/client-s3', '@pinecone-database/pinecone'],
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
      { protocol: 'https', hostname: 'www.mapclub.com' },
      { protocol: 'https', hostname: 'mapclub.com' },
      { protocol: 'https', hostname: 'cdn.mapclub.com' },
      { protocol: 'https', hostname: 'img.mapclub.com' },
    ],
  },

};

export default nextConfig as NextConfig;
