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

echo "▶ Step 2: Push schema to database (with timeout)..."
if [ -n "$DIRECT_DATABASE_URL" ] || echo "$DATABASE_URL" | grep -qi "postgresql\|postgres"; then
  # Run prisma db push with a 120-second timeout to prevent hanging
  timeout 120 npx prisma db push --accept-data-loss 2>&1 || echo "  Schema push had issues or timed out (continuing anyway)"
else
  echo "  Skipping schema push for SQLite (local dev only)"
fi

echo "▶ Step 3: Generate Prisma Client..."
npx prisma generate

echo "▶ Step 4: Building Next.js..."
NODE_OPTIONS="--max-old-space-size=3072" npx next build
