# Release Candidate RC1 — Final Release Engineering Report

**Date:** 2026-07-09  
**Scope:** DevOps / release blockers only — no UCE v2.0 architecture changes, no new product features  
**Baseline:** Milestone 5 product gate PASS ([MILESTONE-5-PRODUCTION-READINESS-REPORT.md](docs/MILESTONE-5-PRODUCTION-READINESS-REPORT.md))

---

## Executive summary

| Assessment | Result |
|------------|--------|
| **Overall production readiness** | **Staging-ready RC1** — infrastructure blockers resolved; production go-live requires staging validation |
| **Go / No-Go** | **GO for staging deployment** · **CONDITIONAL GO for production** (complete staging smoke, backup restore drill, TLS) |

---

## Release criteria matrix

| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| R1 | Production Docker deployment (backend + frontend + compose + nginx) | **PASS** | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.production.yml`, `nginx.conf`; images built: `gatehub-backend:rc1`, `gatehub-frontend:rc1` |
| R2 | Prisma migration workflow (`migrate dev` + `migrate deploy`) | **PASS** | `backend/prisma/migrations/20260709000000_init/`, `migration_lock.toml`; `npm run db:migrate:deploy`; entrypoint runs `prisma migrate deploy` |
| R3 | Replace `db push` production workflow | **PASS** | `README.md`, `DEPLOYMENT.md`, `backend/.env.example`; CI `.github/workflows/pipeline-guard.yml` uses `migrate deploy` |
| R4 | Backup & disaster recovery scripts | **PASS** | `scripts/ops/backup-database.sh`, `backup-uploads.sh`, `restore-*.sh`, `validate-backup.sh`; `BACKUP_AND_RECOVERY.md` |
| R5 | Operations documentation | **PASS** | `DEPLOYMENT.md`, `OPERATIONS.md`, `BACKUP_AND_RECOVERY.md` |
| R6 | Startup validation | **PASS** | `backend/scripts/validate-startup.ts`; `npm run validate:startup` → PASS |
| R7 | Environment documentation | **PASS** | `.env.production.example`, `backend/.env.example`, `frontend/.env.example` |
| R8 | Health checks wired | **PASS** | `/api/health`; Docker HEALTHCHECK in Dockerfiles; compose `depends_on: condition: service_healthy` |
| R9 | Persistent uploads volume | **PASS** | `uploads_data` volume in `docker-compose.production.yml` |
| R10 | Monorepo shared code in Docker builds | **PASS** | Repo-root build context; `shared/lesson-body` compiled + copied to `/shared/lesson-body` in backend image |
| R11 | Full regression suite | **PASS** | See §Test results below |
| R12 | End-to-end production compose smoke (full stack) | **WARNING** | Images build; full `docker:prod:up` smoke not executed in this session (requires `.env.production` secrets) |
| R13 | TLS / HTTPS in repo | **WARNING** | HTTP-only nginx; TLS at load balancer required |
| R14 | Kubernetes manifests | **WARNING** | Optional guidance only (`k8s/README.md`); no Helm chart |
| R15 | `package-lock.json` in backend image | **WARNING** | Backend Dockerfile uses `npm install` (no backend lockfile); frontend uses root `package-lock.json` |
| R16 | Background worker service | **WARNING** | Intentionally removed from compose — no worker implementation |
| R17 | Backup restore drill executed | **WARNING** | Scripts provided; live restore drill deferred to staging ops |
| R18 | Product security medium items (M5) | **WARNING** | localStorage JWT, `/uploads/public/**` migration — unchanged per scope |

---

## Test results (objective)

### Startup validation

```
Command: cd backend && npm run validate:startup
Result:  PASS — environment, storage, and database checks OK
```

### Prisma migrations

```
Command: npx prisma migrate resolve --applied 20260709000000_init
Result:  Migration marked applied (baseline for existing db push DB)

Command: npx prisma migrate status
Result:  Database schema is up to date! (1 migration)

Command: npx prisma migrate deploy
Result:  No pending migrations to apply.
```

### Backend regression (`pipeline:guard`)

```
Command: cd backend && npm run pipeline:guard
Results:
  audit:pipeline-fragments  PASS
  audit:compiler-macros     PASS (44 macros, 240 docs)
  test:golden-pipeline      PASS (all parity checks)
  verify:compiled-pipeline  PASS (240 docs, 2 images)
```

### Frontend regression

```
Command: cd frontend && npm run test
Result:  9 files, 29 tests PASS
```

### Combined regression

```
Command: npm run regression (root)
Result:  PASS (pipeline:guard + frontend vitest)
```

### Docker image builds

```
Command: docker build -f backend/Dockerfile -t gatehub-backend:rc1 .
Result:  SUCCESS

Command: docker build -f frontend/Dockerfile -t gatehub-frontend:rc1 .
Result:  SUCCESS
```

---

## Files created or modified

### Created

| Path | Purpose |
|------|---------|
| `backend/prisma/migrations/20260709000000_init/migration.sql` | Initial schema migration (3122 lines) |
| `backend/prisma/migrations/migration_lock.toml` | Prisma migration lock |
| `backend/scripts/docker-entrypoint.sh` | Migrate + validate + start |
| `backend/scripts/validate-startup.ts` | Startup gate |
| `backend/tsconfig.build.json` | Production TypeScript build |
| `shared/lesson-body/tsconfig.json` | Shared package build |
| `frontend/nginx-spa.conf` | SPA static serving |
| `frontend/.env.example` | Frontend env template |
| `.env.production.example` | Production secrets template |
| `.dockerignore` | Build context exclusions |
| `scripts/ops/*.sh` | Backup / restore / validate |
| `DEPLOYMENT.md` | Deploy guide |
| `OPERATIONS.md` | Ops runbook |
| `BACKUP_AND_RECOVERY.md` | DR procedures |
| `k8s/README.md` | Optional K8s notes |
| `docs/RELEASE-CANDIDATE-RC1-REPORT.md` | This report |

### Modified

| Path | Change |
|------|--------|
| `backend/Dockerfile` | Repo-root context, migrations, healthcheck, shared runtime |
| `frontend/Dockerfile` | Workspace install, vite docker build |
| `docker-compose.production.yml` | Volumes, healthchecks, secrets via env_file, port 5000 |
| `nginx.conf` | backend:5000, `/uploads/` proxy |
| `backend/package.json` | `db:migrate:deploy`, `validate:startup`, prisma seed, `tsc -b` build |
| `frontend/package.json` | `build:docker`, `zod`, `date-fns`, `react-markdown` |
| `package.json` | `docker:prod:*`, `backup:*`, `regression` |
| `README.md` | Migration workflow |
| `backend/.env.example` | Payments, email, migration notes |
| `.github/workflows/pipeline-guard.yml` | `prisma migrate deploy` in CI |
| `backend/src/utils/migrationLog.ts` | Winston logger signature (build fix) |
| `backend/src/utils/videoSourceUtils.ts` | Nullability (build fix) |
| `backend/src/ws/yjsServer.ts` | Local `getYDoc` (build fix) |
| `backend/src/services/templateLibrary/templateLibraryService.ts` | Prisma JSON cast (build fix) |

---

## Remaining operational risks

1. **No full-stack compose smoke in CI** — run `docker:prod:up` on staging with real secrets before production.
2. **HTTP only** — terminate TLS externally; do not expose plain HTTP to the public internet.
3. **Single-node WebSockets** — live sessions require sticky sessions or future Redis adapter.
4. **LaTeX via Docker socket** — security-sensitive; restrict host access.
5. **No automated backup cron in repo** — ops must schedule `scripts/ops/*.sh` on backup host.
6. **Backend `npm install` in Docker** — non-reproducible vs lockfile; add `backend/package-lock.json` in a follow-up.
7. **Frontend `build:docker` skips `tsc`** — type errors not gated in container build; local/CI `npm run build` still recommended.

---

## Items intentionally deferred

| Item | Reason |
|------|--------|
| `Dockerfile.worker` / BullMQ worker | No worker source in codebase |
| Redis / MinIO in production compose | Not used by application runtime |
| Helm / full Kubernetes manifests | Compose is reference topology for RC1 |
| HttpOnly cookie auth | Product security hardening (M5 medium) |
| `/uploads/public/**` asset migration | Product content migration |
| `package-lock.json` for backend workspace | Follow-up reproducibility task |
| Automated WCAG / performance matrix | Manual QA backlog |

---

## Recommended next steps (standard RC progression)

1. **Freeze** feature development on `rc1` tag.
2. **Deploy to staging** with `docker:prod:up` and `.env.production`.
3. **Smoke test** — health, auth, player, LU publish, LaTeX PDF.
4. **Backup restore drill** — run `backup-database.sh` + `restore-database.sh --yes` on staging.
5. **Rollback test** — redeploy previous image tag.
6. **Monitor** staging 48–72 hours.
7. **Promote** to production with TLS and secrets manager.

---

## Go / No-Go recommendation

| Environment | Recommendation |
|-------------|----------------|
| **Staging** | **GO** — RC1 infrastructure complete, regression green |
| **Production** | **CONDITIONAL GO** — proceed after staging validation checklist in §Recommended next steps |

---

*Generated as part of Final Release Engineering Phase. UCE v2.0 architecture unchanged.*
