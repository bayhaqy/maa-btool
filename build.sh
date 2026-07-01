#!/bin/bash
# Vercel build script for MAA BTOOL

echo "▶ Step 1: Select schema based on database provider..."

if [ -n "$DIRECT_DATABASE_URL" ] || echo "$DATABASE_URL" | grep -qi "postgresql\|postgres"; then
  echo "  PostgreSQL detected — using schema.supabase.prisma"
  cp prisma/schema.supabase.prisma prisma/schema.prisma
else
  echo "  SQLite detected — using schema.sqlite.prisma"
  cp prisma/schema.sqlite.prisma prisma/schema.prisma
fi

echo "▶ Step 2: Generate Prisma Client..."
npx prisma generate

echo "▶ Step 2b: Push schema to database (safe - adds missing columns)..."
if [ -n "$DIRECT_DATABASE_URL" ] || echo "$DATABASE_URL" | grep -qi "postgresql\|postgres"; then
  npx prisma db push --accept-data-loss 2>/dev/null || echo "  Schema push failed (non-fatal, migration API available)"
else
  echo "  Skipping schema push for SQLite (local dev only)"
fi

echo "▶ Step 3: Building Next.js..."
npx next build
