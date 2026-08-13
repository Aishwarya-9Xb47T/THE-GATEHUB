#!/usr/bin/env bash
# Backup PostgreSQL database to a timestamped custom-format dump.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUTPUT_DIR="$BACKUP_ROOT/database"
mkdir -p "$OUTPUT_DIR"

POSTGRES_USER="${POSTGRES_USER:-gatehub}"
POSTGRES_DB="${POSTGRES_DB:-gatehub}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.production.yml}"

OUTPUT_FILE="$OUTPUT_DIR/gatehub-db-${TIMESTAMP}.dump"
LATEST_LINK="$OUTPUT_DIR/latest.dump"

echo "[backup-db] Writing $OUTPUT_FILE"

if docker compose -f "$COMPOSE_FILE" ps postgres --status running >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl \
    > "$OUTPUT_FILE"
else
  : "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD for direct pg_dump}"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -Fc --no-owner --no-acl -f "$OUTPUT_FILE"
fi

ln -sfn "$(basename "$OUTPUT_FILE")" "$LATEST_LINK"
sha256sum "$OUTPUT_FILE" > "${OUTPUT_FILE}.sha256"
echo "[backup-db] OK size=$(wc -c < "$OUTPUT_FILE") bytes sha256=$(cut -d' ' -f1 "${OUTPUT_FILE}.sha256")"
