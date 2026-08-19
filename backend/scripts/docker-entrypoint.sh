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

for bin in python3 node gcc g++ java javac; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "[entrypoint] FATAL: $bin is not on PATH in the runtime image"
    echo "[entrypoint] PATH=${PATH}"
    exit 1
  fi
  echo "[entrypoint] $bin=$(command -v $bin)"
done
python3 --version | head -n 1 | sed 's/^/[entrypoint] /'
node --version | sed 's/^/[entrypoint] node /'
gcc --version | head -n 1 | sed 's/^/[entrypoint] /'
g++ --version | head -n 1 | sed 's/^/[entrypoint] /'
java -version 2>&1 | head -n 1 | sed 's/^/[entrypoint] /'
javac -version 2>&1 | sed 's/^/[entrypoint] /'

if command -v soffice >/dev/null 2>&1 || test -x /usr/lib/libreoffice/program/soffice; then
  SOFFICE_BIN="$(command -v soffice 2>/dev/null || echo /usr/lib/libreoffice/program/soffice)"
  echo "[entrypoint] soffice=${SOFFICE_BIN}"
  "${SOFFICE_BIN}" --headless --version 2>&1 | head -n 2 | sed 's/^/[entrypoint] /' || echo "[entrypoint] WARN: soffice --version failed"
else
  echo "[entrypoint] WARN: LibreOffice soffice is not on PATH"
fi
if test -x /usr/lib/libreoffice/program/javaldx; then
  echo "[entrypoint] javaldx=/usr/lib/libreoffice/program/javaldx"
else
  echo "[entrypoint] WARN: javaldx not found (PPTX to PDF still proceeds with Java disabled in the job profile)"
fi
echo "[entrypoint] JAVA_HOME=${JAVA_HOME:-unset}"
echo "[entrypoint] HOME=${HOME:-unset}"
echo "[entrypoint] SAL_DISABLE_JAVA=${SAL_DISABLE_JAVA:-unset}"
echo "[entrypoint] SAL_USE_VCLPLUGIN=${SAL_USE_VCLPLUGIN:-unset}"

echo "[entrypoint] Applying Prisma migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "${RUN_STARTUP_VALIDATION:-true}" = "true" ]; then
  echo "[entrypoint] Running startup validation..."
  node dist/scripts/validate-startup.js
fi

echo "[entrypoint] Starting application: $*"
exec "$@"
