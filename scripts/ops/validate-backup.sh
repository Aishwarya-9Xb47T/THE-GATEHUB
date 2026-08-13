#!/usr/bin/env bash
# Validate backup integrity and optionally perform a dry-run restore check.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"

DB_DUMP="${1:-$BACKUP_ROOT/database/latest.dump}"
UPLOADS_ARCHIVE="${2:-$BACKUP_ROOT/uploads/latest.tar.gz}"

failures=0

check_file() {
  local file="$1"
  local label="$2"
  if [ ! -f "$file" ]; then
    echo "[validate] FAIL $label missing: $file"
    failures=$((failures + 1))
    return
  fi
  local size
  size=$(wc -c < "$file")
  if [ "$size" -lt 64 ]; then
    echo "[validate] FAIL $label too small ($size bytes): $file"
    failures=$((failures + 1))
    return
  fi
  if [ -f "${file}.sha256" ]; then
    if sha256sum -c "${file}.sha256" >/dev/null 2>&1; then
      echo "[validate] PASS $label checksum OK ($size bytes)"
    else
      echo "[validate] FAIL $label checksum mismatch"
      failures=$((failures + 1))
    fi
  else
    echo "[validate] WARN $label no checksum sidecar (${file}.sha256)"
    echo "[validate] PASS $label exists ($size bytes)"
  fi
}

check_file "$DB_DUMP" "database dump"
check_file "$UPLOADS_ARCHIVE" "uploads archive"

if command -v pg_restore >/dev/null 2>&1 && [ -f "$DB_DUMP" ]; then
  if pg_restore --list "$DB_DUMP" >/dev/null 2>&1; then
    echo "[validate] PASS pg_restore --list succeeded for database dump"
  else
    echo "[validate] FAIL pg_restore --list failed for database dump"
    failures=$((failures + 1))
  fi
fi

if [ -f "$UPLOADS_ARCHIVE" ]; then
  if tar -tzf "$UPLOADS_ARCHIVE" | head -n 5 >/dev/null 2>&1; then
    echo "[validate] PASS tar listing succeeded for uploads archive"
  else
    echo "[validate] FAIL tar listing failed for uploads archive"
    failures=$((failures + 1))
  fi
fi

if [ "$failures" -gt 0 ]; then
  echo "[validate] FAILED ($failures issue(s))"
  exit 1
fi

echo "[validate] ALL CHECKS PASSED"
