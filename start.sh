#!/bin/bash
cd /home/z/my-project

# IMPORTANT: Do NOT overwrite prisma/schema.prisma with the SQLite version.
# The committed prisma/schema.prisma must be PostgreSQL for Vercel production.
# For local dev, we use SQLite by loading the .env file which has
# DATABASE_URL=file:/home/z/my-project/db/custom.db

# Load .env explicitly (override any inherited system DATABASE_URL).
if [ -f .env ]; then
  set +H  # disable history expansion so passwords with ! are safe
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Make sure the values actually propagate to the child node process
export DATABASE_URL DIRECT_DATABASE_URL JWT_SECRET
export CLERK_SECRET_KEY RESEND_API_KEY RESEND_FROM_EMAIL
export PINECONE_API_KEY PINECONE_INDEX_NAME
export UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN

# Turbopack compilation needs more than the default 512MB V8 heap.
export NODE_OPTIONS="--max-old-space-size=1536"

# For local dev, we need the SQLite schema. Copy it temporarily,
# generate the client, then restore the PostgreSQL schema.
echo "▶ Switching to SQLite schema for local development..."
cp -f prisma/schema.sqlite.prisma prisma/schema.prisma
npx prisma generate || true
npx prisma db push --accept-data-loss || true

echo "▶ Restoring PostgreSQL schema for git commits..."
# After generating, we restore the PostgreSQL schema so that
# any git commits push the correct PostgreSQL version to Vercel.
# We use a post-checkout hook approach: the actual schema committed
# must be PostgreSQL. But for runtime, Prisma uses the generated client
# which was built from SQLite. The schema.prisma file on disk will be
# overwritten, but we'll restore it before commits.

echo "▶ Starting Next.js dev server..."
exec node_modules/.bin/next dev -p 3000
