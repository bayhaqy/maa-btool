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

echo "▶ Step 2: Push schema to database FIRST (before generate, so DB has all columns)..."
if [ -n "$DIRECT_DATABASE_URL" ] || echo "$DATABASE_URL" | grep -qi "postgresql\|postgres"; then
  npx prisma db push --accept-data-loss || echo "  Schema push had issues (continuing anyway)"
else
  echo "  Skipping schema push for SQLite (local dev only)"
fi

echo "▶ Step 3: Generate Prisma Client..."
npx prisma generate

echo "▶ Step 4: Building Next.js..."
npx next build
