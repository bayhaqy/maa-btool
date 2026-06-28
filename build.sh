#!/bin/bash
# Vercel build script with schema push and timeout
set -e

echo "▶ Generating Prisma Client..."
npx prisma generate

echo "▶ Pushing schema to database (with 120s timeout)..."
timeout 120 npx prisma db push --accept-data-loss 2>&1 || {
  echo "⚠️  prisma db push failed or timed out — continuing with build"
  echo "   The app may need manual schema sync via /api/admin/sync-schema"
}

echo "▶ Building Next.js..."
npx next build
