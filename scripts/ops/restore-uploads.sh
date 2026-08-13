#!/usr/bin/env bash
# Restore uploaded assets from backup-uploads.sh archive.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to.tar.gz> [--yes]"
  exit 1
fi

ARCHIVE="$1"
CONFIRM="${2:-}"

if [ ! -f "$ARCHIVE" ]; then
  echo "[restore-uploads] File not found: $ARCHIVE"
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "[restore-uploads] This will overwrite uploads/data. Re-run with --yes to proceed."
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.production.yml}"

echo "[restore-uploads] Restoring from $ARCHIVE"

if docker compose -f "$COMPOSE_FILE" ps backend --status running >/dev/null 2>&1; then
  cat "$ARCHIVE" | docker compose -f "$COMPOSE_FILE" exec -T backend \
    sh -c 'cd /app && rm -rf uploads data && tar -xzf -'
else
  tar -xzf "$ARCHIVE" -C "$ROOT_DIR/backend"
fi

echo "[restore-uploads] OK"
