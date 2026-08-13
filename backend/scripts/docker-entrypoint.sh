#!/bin/sh
set -eu

echo "[entrypoint] THE GATEHUB backend starting (NODE_ENV=${NODE_ENV:-development})"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is required"
  exit 1
fi

if [ -z "${JWT_SECRET:-}" ]; then
  echo "[entrypoint] FATAL: JWT_SECRET is required"
  exit 1
fi

UPLOAD_ROOT="${UPLOAD_DIR:-/app/uploads}"
mkdir -p "$UPLOAD_ROOT" "$UPLOAD_ROOT/latex" "$UPLOAD_ROOT/latex/pdfs" /app/data

echo "[entrypoint] Applying Prisma migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "${RUN_STARTUP_VALIDATION:-true}" = "true" ]; then
  echo "[entrypoint] Running startup validation..."
  node dist/scripts/validate-startup.js
fi

echo "[entrypoint] Starting application: $*"
exec "$@"
