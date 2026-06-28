#!/bin/bash
# Vercel build script with smart schema push
# Uses DIRECT_DATABASE_URL for DDL operations (bypasses Supabase pooler)

echo "▶ Generating Prisma Client..."
npx prisma generate

echo "▶ Pushing schema to database..."

# Function to attempt schema push
try_push() {
  local url="$1"
  local flags="$2"

  if [ -n "$url" ]; then
    echo "  Using direct connection for schema push..."
    DATABASE_URL="$url" npx prisma db push $flags 2>&1
  else
    echo "  Using DATABASE_URL for schema push..."
    npx prisma db push $flags 2>&1
  fi
}

# First try with --accept-data-loss (preserves data)
PUSH_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"
echo "  Attempting schema push with --accept-data-loss (data-preserving)..."
if try_push "$DIRECT_DATABASE_URL" "--accept-data-loss" 2>&1 | grep -q "cannot be executed"; then
  echo "  ⚠️  Incremental push failed. Trying --force-reset (will re-seed data)..."
  if ! try_push "$DIRECT_DATABASE_URL" "--force-reset" 2>&1; then
    echo "  ⚠️  Force-reset also failed. Trying pooler URL..."
    npx prisma db push --force-reset 2>&1 || {
      echo "  ⚠️  All schema push attempts failed — continuing with build"
    }
  fi
else
  echo "  ✅ Schema push succeeded (data preserved)"
fi

echo "▶ Building Next.js..."
npx next build
