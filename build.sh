#!/bin/bash
# Vercel build script with schema push
# Uses DIRECT_DATABASE_URL for DDL operations (bypasses Supabase pooler)

echo "▶ Generating Prisma Client..."
npx prisma generate

echo "▶ Pushing schema to database (force-reset for clean state)..."

# Always force-reset to ensure clean state (data will be re-seeded automatically)
if [ -n "$DIRECT_DATABASE_URL" ]; then
  echo "  Using DIRECT_DATABASE_URL for schema push..."
  DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma db push --force-reset 2>&1 || {
    echo "  ⚠️  Direct URL force-reset failed, trying pooler URL..."
    npx prisma db push --force-reset 2>&1 || {
      echo "  ⚠️  All schema push attempts failed — continuing with build"
    }
  }
else
  echo "  Using DATABASE_URL for schema push..."
  npx prisma db push --force-reset 2>&1 || {
    echo "  ⚠️  Schema push failed — continuing with build"
  }
fi

echo "▶ Building Next.js..."
npx next build
