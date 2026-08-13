# Backup and Disaster Recovery — THE GATEHUB

## Scope

| Asset | Method | RPO target | RTO target |
|-------|--------|------------|------------|
| PostgreSQL | `pg_dump` custom format | 24 h (daily) | < 1 h |
| Uploads + runtime data | `tar.gz` of `uploads/` + `data/` | 24 h | < 2 h |
| LaTeX workspace (`latex-temp/`) | Not backed up | — | Rebuild on compile |
| Application code | Git tags | 0 | Redeploy |

Adjust RPO/RTO to your SLA. Scripts live in `scripts/ops/`.

## Backup scripts

### Database

```bash
npm run backup:db
# or
bash scripts/ops/backup-database.sh
```

Output: `backups/database/gatehub-db-<UTC-timestamp>.dump`  
Sidecar: `.sha256` checksum  
Symlink: `backups/database/latest.dump`

Uses `docker compose exec postgres pg_dump` when production compose is running; falls back to direct `pg_dump` with `POSTGRES_PASSWORD`.

### Uploads and runtime data

```bash
npm run backup:uploads
# or
bash scripts/ops/backup-uploads.sh
```

Archives `/app/uploads` and `/app/data` from the backend container (or local `backend/uploads` + `backend/data` in dev).

Output: `backups/uploads/gatehub-uploads-<timestamp>.tar.gz`

### Validate backups

```bash
npm run backup:validate
# or with explicit paths:
bash scripts/ops/validate-backup.sh backups/database/latest.dump backups/uploads/latest.tar.gz
```

Checks:

- File exists and size > 64 bytes
- SHA-256 sidecar (if present)
- `pg_restore --list` on database dump
- `tar -tzf` on uploads archive

## Recommended schedule

| Job | Cron (UTC) | Command |
|-----|------------|---------|
| Database backup | `0 2 * * *` | `npm run backup:db` |
| Uploads backup | `30 2 * * *` | `npm run backup:uploads` |
| Validation | `0 3 * * *` | `npm run backup:validate` |

Copy artifacts off-host (S3, GCS, NFS) daily. Keep at least 7 daily + 4 weekly retention.

Example cron on backup host:

```cron
0 2 * * * cd /opt/gatehub && npm run backup:db >> /var/log/gatehub-backup.log 2>&1
30 2 * * * cd /opt/gatehub && npm run backup:uploads >> /var/log/gatehub-backup.log 2>&1
0 3 * * * cd /opt/gatehub && npm run backup:validate >> /var/log/gatehub-backup.log 2>&1
```

## Restore procedures

> **Warning:** Restore replaces live data. Stop application traffic first.

### 1. Stop application

```bash
docker compose -f docker-compose.production.yml stop backend frontend nginx
```

### 2. Restore database

```bash
bash scripts/ops/restore-database.sh backups/database/latest.dump --yes
```

This terminates connections, recreates the database, and runs `pg_restore`.

### 3. Restore uploads

```bash
bash scripts/ops/restore-uploads.sh backups/uploads/latest.tar.gz --yes
```

### 4. Apply pending migrations (if any)

```bash
docker compose -f docker-compose.production.yml run --rm backend npx prisma migrate deploy
```

### 5. Start and verify

```bash
docker compose -f docker-compose.production.yml up -d
curl -fsS http://localhost/api/health
npm run backup:validate
```

### 6. Functional smoke test

- Login with known user
- Open course with uploaded video
- Open notes PDF
- Publish or compile a Learning Universe lesson

## Disaster recovery scenarios

### Scenario A — Database corruption

1. Stop backend
2. Restore latest `gatehub-db-*.dump`
3. `prisma migrate deploy` if backup predates a migration
4. Start backend, verify health

### Scenario B — Upload volume loss

1. Database intact; restore `gatehub-uploads-*.tar.gz`
2. No migration needed
3. Verify media URLs and PDF paths

### Scenario C — Full host loss

1. Provision new host with Docker
2. Clone repository at release tag
3. Restore `.env.production` from secrets manager
4. `npm run docker:prod:build && npm run docker:prod:up` (empty DB)
5. Restore database + uploads
6. Run smoke tests

### Scenario D — Bad deployment

Prefer **application rollback** (previous image) over restore. Use DB restore only if a migration caused irreversible data issues.

## Restore validation drill (staging)

Monthly on staging:

```bash
# Create fresh backups
npm run backup:db && npm run backup:uploads
npm run backup:validate

# Restore to isolated compose project or stopped stack
bash scripts/ops/restore-database.sh backups/database/latest.dump --yes
bash scripts/ops/restore-uploads.sh backups/uploads/latest.tar.gz --yes

# Verify
curl -fsS http://staging.example/api/health
```

Document drill date and results in your ops log.

## What is not backed up

| Item | Reason | Recovery |
|------|--------|----------|
| `latex-temp/` | Ephemeral compile workspace | Recompile |
| Redis | Not used in production compose | N/A |
| Container images | Rebuilt from Git | `docker:prod:build` |
| Firebase / Google Drive | External provider | Provider consoles |

## Encryption and access

- Store backups encrypted at rest (S3 SSE, disk encryption)
- Restrict backup host IAM to least privilege
- Test checksum validation after every transfer

## Related documents

- `DEPLOYMENT.md` — deploy and rollback
- `OPERATIONS.md` — monitoring and maintenance
