# Deployment Guide — THE GATEHUB

Production deployment uses **Docker Compose** as the reference topology. Kubernetes manifests are optional (`k8s/README.md`).

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Docker Engine | 24+ |
| Docker Compose | v2+ |
| Host disk | ≥ 50 GB (DB + uploads + LaTeX workspace) |
| TLS termination | External load balancer or reverse proxy (compose ships HTTP on port 80) |

## Quick start (production compose)

```bash
# 1. Configure secrets
cp .env.production.example .env.production
# Edit .env.production — JWT_SECRET (≥32 chars), POSTGRES_PASSWORD, API keys

# 2. Build and start
npm run docker:prod:build
npm run docker:prod:up

# 3. Verify health
curl -fsS http://localhost/api/health
```

Expected health response:

```json
{"status":"ok","database":"connected","timestamp":"..."}
```

## Architecture

```
Internet → nginx:80
            ├─ /        → frontend (static SPA)
            ├─ /api/    → backend:5000
            ├─ /uploads/→ backend:5000
            └─ /yjs/    → backend:5000 (WebSocket)
backend → postgres:5432
backend → latex_engine (via Docker socket + latex-temp volume)
```

### Persistent volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `pg_data` | Postgres | Database |
| `uploads_data` | `/app/uploads` | Course media, PDFs, certificates |
| `backend_data` | `/app/data` | AI provider config, runtime metrics |

Host bind mount: `./latex-temp` (LaTeX compile workspace).

## Environment variables

Copy `.env.production.example` → `.env.production`. **Never commit** `.env.production`.

### Required

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | ≥ 32 characters; no default in production |
| `CLIENT_URL` | Public frontend origin (CORS) |
| `API_URL` | Public API origin |

### Recommended production

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `LU_REQUIRE_PDF_ON_PUBLISH` | `true` |
| `AI_ARCHITECT_FAST_MODE` | `false` |
| `AI_ARCHITECT_STRICT_QA` | `true` |

### Integrations (feature-dependent)

Payments: `RAZORPAY_*`, `STRIPE_*`  
Email (password reset on Render Free): `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` (Resend HTTPS — SMTP ports are blocked on Render Free)  
AI: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`  
Banner cloud: `FIREBASE_*`, `PEXELS_API_KEY`, etc.

See also `backend/.env.example` for development-only tuning variables.

## Database migrations

**Production uses `prisma migrate deploy` only.** The backend entrypoint runs migrations automatically on container start.

### Development

```bash
cd backend
npx prisma migrate dev          # create + apply new migrations
npx prisma db seed              # optional bootstrap
```

### CI / production deploy

```bash
cd backend
npx prisma migrate deploy
```

### Baseline existing `db push` databases

If the database was created before migration history existed:

```bash
cd backend
npx prisma migrate resolve --applied 20260709000000_init
```

Migration history: `backend/prisma/migrations/`.

## Build images manually

Build context **must be the repository root** (includes `shared/lesson-body`):

```bash
docker build -f backend/Dockerfile -t gatehub-backend .
docker build -f frontend/Dockerfile -t gatehub-frontend .
```

Frontend build args (only if API is not same-origin):

```bash
docker build -f frontend/Dockerfile \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  -t gatehub-frontend .
```

## Startup validation

The backend entrypoint runs `dist/scripts/validate-startup.js` after migrations. It verifies:

- `DATABASE_URL` and `JWT_SECRET` (≥ 32 chars)
- Upload directory writable
- Database `SELECT 1`

Disable for debugging only: `RUN_STARTUP_VALIDATION=false`.

Local check:

```bash
cd backend
npm run validate:startup
```

## First-time bootstrap

1. Deploy stack with `docker:prod:up`.
2. Confirm `/api/health` returns `ok`.
3. Seed development/staging data (from host with DB access):

```bash
cd backend
DATABASE_URL="postgresql://..." npm run db:seed
```

Super admin is also bootstrapped from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` on first backend start.

## Rollback

### Application rollback

```bash
# Pin to previous image tag (after building/tagging releases)
docker compose -f docker-compose.production.yml up -d --no-deps backend frontend

# Or rebuild from a known git tag
git checkout v1.0.0-rc1
npm run docker:prod:build
npm run docker:prod:up
```

Database schema rollback is **forward-only** via Prisma. To revert schema, restore a database backup (see `BACKUP_AND_RECOVERY.md`).

### Compose rollback checklist

1. Stop traffic at load balancer.
2. Deploy previous image tags.
3. If migration was applied, restore DB from pre-deploy backup or keep forward-compatible schema.
4. Verify `/api/health` and smoke tests.
5. Re-enable traffic.

## TLS / HTTPS

The bundled `nginx.conf` listens on port 80. Terminate TLS at:

- Cloud load balancer (recommended), or
- Host nginx/Caddy with certificates, forwarding to `HTTP_PORT`

## Intentionally removed from production compose

| Service | Reason |
|---------|--------|
| `worker` | No worker implementation in codebase (`Dockerfile.worker` deferred) |
| `redis` / `minio` | Not used by application runtime today |

Re-add when background job queue and object storage are implemented.

## Smoke test checklist

- [ ] `GET /api/health` → 200, `database: connected`
- [ ] Login / JWT auth
- [ ] Course player loads video and notes PDF
- [ ] LaTeX compile produces PDF
- [ ] Learning Universe student view renders
- [ ] Upload requires auth (non-public paths)

## Related documents

- `OPERATIONS.md` — monitoring, logging, maintenance
- `BACKUP_AND_RECOVERY.md` — backup schedules and restore drills
- `docs/MILESTONE-5-PRODUCTION-READINESS-REPORT.md` — product release gate
