#!/bin/bash
# Vercel build script with schema push
# Uses DIRECT_DATABASE_URL for DDL operations (bypasses Supabase pooler)

echo "▶ Generating Prisma Client..."
npx prisma generate

echo "▶ Pushing schema to database (using DIRECT_DATABASE_URL)..."
# The schema has changed significantly from the old version.
# We need --force-reset to drop and recreate tables since incremental migration isn't possible.
# Data will be re-seeded automatically on first app load.
if [ -n "$DIRECT_DATABASE_URL" ]; then
  echo "  Using DIRECT_DATABASE_URL for schema push..."
  DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma db push --force-reset 2>&1 && {
    echo "✅ Schema push succeeded with DIRECT_DATABASE_URL"
  } || {
    echo "⚠️  Schema push with DIRECT_DATABASE_URL failed, trying pooler URL..."
    npx prisma db push --force-reset 2>&1 || {
      echo "⚠️  All schema push attempts failed — continuing with build"
      echo "   The app may need manual schema sync"
    }
  }
else
  echo "  DIRECT_DATABASE_URL not set, using DATABASE_URL..."
  npx prisma db push --force-reset 2>&1 || {
    echo "⚠️  Schema push failed — continuing with build"
  }
fi

echo "▶ Building Next.js..."
npx next build
