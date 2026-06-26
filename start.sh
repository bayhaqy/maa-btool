#!/bin/bash
cd /home/z/my-project

# Load .env explicitly (override any inherited system DATABASE_URL).
# The sandbox sets a global DATABASE_URL=file:... which would otherwise
# shadow our Supabase PostgreSQL URL inside the Prisma datasource.
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
# 1.5GB is enough for dev compilation while staying well below sandbox limits.
export NODE_OPTIONS="--max-old-space-size=1536"

exec node_modules/.bin/next dev -p 3000
