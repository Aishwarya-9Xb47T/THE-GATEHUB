#!/usr/bin/env bash
# Backup uploaded assets (UPLOAD_DIR) to a timestamped tar archive.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUTPUT_DIR="$BACKUP_ROOT/uploads"
mkdir -p "$OUTPUT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.production.yml}"
OUTPUT_FILE="$OUTPUT_DIR/gatehub-uploads-${TIMESTAMP}.tar.gz"
LATEST_LINK="$OUTPUT_DIR/latest.tar.gz"

echo "[backup-uploads] Creating archive $OUTPUT_FILE"

if docker compose -f "$COMPOSE_FILE" ps backend --status running >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" exec -T backend \
    sh -c 'cd /app && tar -czf - uploads data' > "$OUTPUT_FILE"
else
  UPLOAD_SRC="${UPLOAD_SRC:-$ROOT_DIR/backend/uploads}"
  DATA_SRC="${DATA_SRC:-$ROOT_DIR/backend/data}"
  tar -czf "$OUTPUT_FILE" -C "$ROOT_DIR/backend" uploads 2>/dev/null || true
  if [ -d "$DATA_SRC" ]; then
    tar -rzf "$OUTPUT_FILE" -C "$ROOT_DIR/backend" data
  fi
fi

ln -sfn "$(basename "$OUTPUT_FILE")" "$LATEST_LINK"
sha256sum "$OUTPUT_FILE" > "${OUTPUT_FILE}.sha256"
echo "[backup-uploads] OK size=$(wc -c < "$OUTPUT_FILE") bytes sha256=$(cut -d' ' -f1 "${OUTPUT_FILE}.sha256")"
