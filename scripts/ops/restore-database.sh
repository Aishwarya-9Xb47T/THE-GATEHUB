#!/usr/bin/env bash
# Restore PostgreSQL from a custom-format dump produced by backup-database.sh.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to.dump> [--yes]"
  exit 1
fi

DUMP_FILE="$1"
CONFIRM="${2:-}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "[restore-db] File not found: $DUMP_FILE"
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "[restore-db] This will REPLACE the target database. Re-run with --yes to proceed."
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.production.yml}"
POSTGRES_USER="${POSTGRES_USER:-gatehub}"
POSTGRES_DB="${POSTGRES_DB:-gatehub}"

echo "[restore-db] Restoring from $DUMP_FILE"

if docker compose -f "$COMPOSE_FILE" ps postgres --status running >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" || true
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
  cat "$DUMP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl
else
  : "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD for direct pg_restore}"
  PGPASSWORD="$POSTGRES_PASSWORD" dropdb -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
  PGPASSWORD="$POSTGRES_PASSWORD" createdb -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" "$POSTGRES_DB"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl "$DUMP_FILE"
fi

echo "[restore-db] OK"
