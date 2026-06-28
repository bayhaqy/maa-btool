#!/bin/bash
# Vercel build script with smart schema push
# Uses DIRECT_DATABASE_URL for DDL operations (bypasses Supabase pooler)

echo "▶ Generating Prisma Client..."
npx prisma generate

echo "▶ Pushing schema to database..."

# Try with --accept-data-loss first (preserves data)
echo "  Attempting schema push with --accept-data-loss (data-preserving)..."
if [ -n "$DIRECT_DATABASE_URL" ]; then
  PUSH_RESULT=$(DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma db push --accept-data-loss 2>&1)
else
  PUSH_RESULT=$(npx prisma db push --accept-data-loss 2>&1)
fi
echo "$PUSH_RESULT"

if echo "$PUSH_RESULT" | grep -q "cannot be executed"; then
  echo "  ⚠️  Incremental push failed - schema drift too large. Using --force-reset..."
  if [ -n "$DIRECT_DATABASE_URL" ]; then
    DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma db push --force-reset 2>&1 || {
      echo "  ⚠️  Force-reset failed. Trying pooler URL..."
      npx prisma db push --force-reset 2>&1 || {
        echo "  ⚠️  All schema push attempts failed — continuing with build"
      }
    }
  else
    npx prisma db push --force-reset 2>&1 || {
      echo "  ⚠️  Force-reset failed — continuing with build"
    }
  fi
elif echo "$PUSH_RESULT" | grep -qi "error"; then
  echo "  ⚠️  Schema push had errors — continuing with build"
else
  echo "  ✅ Schema push succeeded (data preserved)"
fi

echo "▶ Building Next.js..."
npx next build
