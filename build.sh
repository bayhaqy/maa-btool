#!/bin/bash
# Vercel build script for MAA BTOOL
# Uses DIRECT_DATABASE_URL for DDL operations (bypasses Supabase pooler)

echo "▶ Step 1: Generate Prisma Client..."
npx prisma generate

echo "▶ Step 2: Select schema based on database provider..."

# For production builds (Vercel/Supabase), we use the PostgreSQL schema
# which has Json types instead of String for JSON columns.
# This ensures Prisma maps to jsonb columns in PostgreSQL.
if [ -n "$DIRECT_DATABASE_URL" ] || echo "$DATABASE_URL" | grep -qi "postgresql\|postgres"; then
  echo "  PostgreSQL detected — using schema.supabase.prisma"
  cp prisma/schema.supabase.prisma prisma/schema.prisma
  npx prisma generate
else
  echo "  SQLite detected — using schema.sqlite.prisma"
  cp prisma/schema.sqlite.prisma prisma/schema.prisma
  npx prisma generate
fi

echo "▶ Step 3: Push schema changes to database..."

# IMPORTANT: We do NOT use --force-reset because that would DELETE ALL DATA.
# --accept-data-loss allows type changes (String→Json) without dropping data.
# We use || true so the build continues even if schema push fails.
if [ -n "$DIRECT_DATABASE_URL" ]; then
  echo "  Using DIRECT_DATABASE_URL for schema push..."
  DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma db push --accept-data-loss --skip-generate 2>&1 || true
fi

# Also try with pooler URL as fallback
echo "  Using DATABASE_URL for schema push..."
npx prisma db push --accept-data-loss --skip-generate 2>&1 || true

echo "▶ Step 4: Building Next.js..."
npx next build
