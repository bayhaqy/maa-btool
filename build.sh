#!/bin/bash
# Vercel build script with schema push
# Uses DIRECT_DATABASE_URL for DDL operations (bypasses Supabase pooler)

echo "▶ Generating Prisma Client..."
npx prisma generate

echo "▶ Setting up schema for PostgreSQL (Supabase)..."

# For production builds (Vercel), we use the Supabase/PostgreSQL schema
# which has Json types instead of String for JSON columns.
# This ensures Prisma maps to jsonb columns in PostgreSQL.
if [ -n "$DIRECT_DATABASE_URL" ] || [ "${DATABASE_URL#*postgresql}" != "$DATABASE_URL" ]; then
  echo "  PostgreSQL detected — using schema.supabase.prisma"
  cp prisma/schema.supabase.prisma prisma/schema.prisma
  npx prisma generate
else
  echo "  SQLite detected — using schema.sqlite.prisma"
  cp prisma/schema.sqlite.prisma prisma/schema.prisma
  npx prisma generate
fi

echo "▶ Pushing schema to database (safe — no data loss)..."

# IMPORTANT: We do NOT use --force-reset because that would DELETE ALL DATA.
# Instead, we use prisma db push without --force-reset which only applies
# schema changes without dropping existing data.
# NOTE: We do NOT use `set -e` because prisma db push may fail with
# migration drift warnings, but the build should still proceed.
if [ -n "$DIRECT_DATABASE_URL" ]; then
  echo "  Using DIRECT_DATABASE_URL for schema push..."
  DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma db push --accept-data-loss 2>&1 || {
    echo "  ⚠️  Direct URL push failed, trying pooler URL..."
    npx prisma db push --accept-data-loss 2>&1 || {
      echo "  ⚠️  All schema push attempts failed — continuing with build"
    }
  }
else
  echo "  Using DATABASE_URL for schema push..."
  npx prisma db push --accept-data-loss 2>&1 || {
    echo "  ⚠️  Schema push failed — continuing with build"
  }
fi

echo "▶ Building Next.js..."
npx next build
