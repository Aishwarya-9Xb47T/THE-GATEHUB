# Operations Guide — THE GATEHUB

Day-2 operations for production and staging environments.

## Service inventory

| Service | Image | Port (internal) | Health |
|---------|-------|-----------------|--------|
| nginx | `nginx:alpine` | 80 | `GET /api/health` via proxy |
| frontend | built `frontend/Dockerfile` | 80 | Container `wget` on `/` |
| backend | built `backend/Dockerfile` | 5000 | `GET /api/health` |
| postgres | `postgres:15-alpine` | 5432 | `pg_isready` |
| latex_engine | `blang/latex:ctanbasic` | — | process running |

## Health checks

### Public (through nginx)

```bash
curl -fsS http://localhost/api/health | jq .
```

| Field | Healthy | Degraded |
|-------|---------|----------|
| `status` | `ok` | `degraded` |
| `database` | `connected` | `unreachable` |

HTTP 503 when database is unreachable.

### Container-level

```bash
docker compose -f docker-compose.production.yml ps
docker inspect --format='{{.State.Health.Status}}' <backend-container>
```

Backend startup validation logs:

```bash
docker compose -f docker-compose.production.yml logs backend | grep startup
```

## Logging

### Docker json-file driver

Compose configures log rotation: 10 MB × 5 files per service.

```bash
# Tail all services
docker compose -f docker-compose.production.yml logs -f

# Backend only
docker compose -f docker-compose.production.yml logs -f backend --tail=200
```

### Application logs

Winston logs to stdout in production. Search patterns:

| Pattern | Meaning |
|---------|---------|
| `[FATAL ERROR]` | Startup failure |
| `[startup:error]` | Validation failure |
| `[PRISMA]` | Database connectivity |
| `[PROCESS] Unhandled` | Non-fatal process errors (server kept alive) |

### Nginx access logs

```bash
docker compose -f docker-compose.production.yml logs nginx
```

## Monitoring recommendations

| Signal | Source | Alert threshold |
|--------|--------|-----------------|
| API availability | `/api/health` | 2 consecutive failures |
| DB connections | Postgres `pg_stat_activity` | > 80% of max |
| Disk usage | `uploads_data`, `pg_data` volumes | > 85% |
| LaTeX compile failures | Backend logs `compile` errors | Spike vs baseline |
| 5xx rate | nginx / LB logs | > 1% over 5 min |

Admin UI health (authenticated):

- `GET /api/admin/settings/health`
- `GET /api/admin/ai/health`

## Routine maintenance

### Daily

- Verify `/api/health`
- Review error logs for `[FATAL ERROR]` / 5xx spikes
- Confirm backup jobs completed (`BACKUP_AND_RECOVERY.md`)

### Weekly

- `npm run backup:validate` on latest artifacts
- Review disk usage on uploads and database volumes
- `npx prisma migrate status` (should be up to date)

### Monthly

- Restore drill on staging (database + uploads)
- Rotate `JWT_SECRET` only with planned session invalidation
- Review `docs/KNOWN-ISSUES.md` and `docs/TECHNICAL-DEBT.md`

## Database operations

```bash
# Migration status (from host)
cd backend && DATABASE_URL=... npx prisma migrate status

# Manual migration apply (normally automatic on backend start)
docker compose -f docker-compose.production.yml exec backend npx prisma migrate deploy
```

**Never** run `prisma db push` or `prisma migrate dev` against production.

## Storage operations

Upload root: `/app/uploads` in backend container.

Key paths:

- `uploads/` — course videos, attachments
- `uploads/latex/pdfs/` — compiled PDFs
- `uploads/public/` — anonymous-readable assets
- `/app/data/` — AI provider config

```bash
# Shell into backend
docker compose -f docker-compose.production.yml exec backend sh

# Disk usage
du -sh /app/uploads/*
```

## Scaling limitations (current release)

| Area | Limitation | Mitigation |
|------|------------|------------|
| Live WebSocket sessions | In-memory, single backend node | Sticky sessions; scale-out needs Redis adapter (deferred) |
| LaTeX compile | Docker socket to single `latex_engine` | Dedicated compile host; queue worker (deferred) |
| Uploads | Local volume | Plan migration to object storage |
| Auth tokens | localStorage JWT | HttpOnly cookie migration (deferred) |

## Incident response

### Backend won't start

1. `docker compose logs backend`
2. Check migration errors: `prisma migrate deploy`
3. Verify `JWT_SECRET` length ≥ 32
4. Verify Postgres health: `docker compose ps postgres`

### Database unreachable

1. `docker compose ps postgres`
2. Check volume `pg_data` disk space
3. Restore from backup if corrupted (`BACKUP_AND_RECOVERY.md`)

### Upload failures

1. Verify `uploads_data` volume mounted
2. Check backend logs for permission errors
3. Confirm `UPLOAD_DIR=/app/uploads`

### LaTeX compile failures

1. Verify `latex_engine` container running
2. Check Docker socket mount on backend
3. Inspect `./latex-temp` disk space

## Security operations

- Rotate `POSTGRES_PASSWORD`, `JWT_SECRET`, payment keys on compromise
- Set `LU_REQUIRE_PDF_ON_PUBLISH=true` in production
- Ensure `/uploads/public/**` only for intentionally public assets
- Keep `.env.production` out of version control

## Release regression

Before promoting a release:

```bash
npm run regression
```

Runs `pipeline:guard` (backend) and `vitest run` (frontend).

## Related documents

- `DEPLOYMENT.md` — initial deploy and rollback
- `BACKUP_AND_RECOVERY.md` — backup and restore procedures
