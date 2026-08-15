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

if ! command -v pdflatex >/dev/null 2>&1; then
  echo "[entrypoint] FATAL: pdflatex is not on PATH in the runtime image"
  echo "[entrypoint] PATH=${PATH}"
  exit 1
fi
echo "[entrypoint] $(pdflatex --version | head -n 1)"
echo "[entrypoint] pdflatex=$(command -v pdflatex)"

echo "[entrypoint] Applying Prisma migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "${RUN_STARTUP_VALIDATION:-true}" = "true" ]; then
  echo "[entrypoint] Running startup validation..."
  node dist/scripts/validate-startup.js
fi

echo "[entrypoint] Starting application: $*"
exec "$@"
