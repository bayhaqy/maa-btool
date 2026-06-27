#!/bin/bash
# Watchdog that keeps the Next.js dev server running.
# Restarts if the process dies (e.g. due to memory pressure during compile).
cd /home/z/my-project

# Load .env explicitly (override any inherited system DATABASE_URL).
if [ -f .env ]; then
  set +H
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
export DATABASE_URL DIRECT_DATABASE_URL JWT_SECRET
export CLERK_SECRET_KEY RESEND_API_KEY RESEND_FROM_EMAIL
export PINECONE_API_KEY PINECONE_INDEX_NAME
export UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN
export NODE_OPTIONS="--max-old-space-size=4096"

MAX_RESTARTS=20
RESTART_COUNT=0

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "[watchdog] Starting dev server (attempt $RESTART_COUNT) at $(date '+%H:%M:%S')"
  node_modules/.bin/next dev -p 3000
  EXIT_CODE=$?
  echo "[watchdog] Dev server exited with code $EXIT_CODE at $(date '+%H:%M:%S')"
  if [ $EXIT_CODE -eq 0 ]; then
    break
  fi
  sleep 3
done
