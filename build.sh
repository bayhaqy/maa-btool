#!/bin/bash
# Vercel build script with schema push
set -e

echo "▶ Generating Prisma Client..."
npx prisma generate

echo "▶ Pushing schema to database..."
npx prisma db push --accept-data-loss 2>&1 || {
  echo "⚠️  prisma db push failed — trying with DIRECT_DATABASE_URL..."
  DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma db push --accept-data-loss 2>&1 || {
    echo "⚠️  prisma db push failed again — continuing with build"
    echo "   The app may need manual schema sync via /api/seed-data"
  }
}

echo "▶ Building Next.js..."
npx next build
