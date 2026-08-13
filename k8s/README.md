# Kubernetes (optional)

THE GATEHUB's **reference production topology is Docker Compose** (`docker-compose.production.yml`). Use Kubernetes only when your platform requires it.

## Compose-first recommendation

Compose already provides:

- nginx edge proxy
- frontend + backend services
- PostgreSQL with health checks
- persistent volumes for DB and uploads
- automatic `prisma migrate deploy` on backend start

## Translating to Kubernetes

| Compose | Kubernetes equivalent |
|---------|----------------------|
| `nginx` service | Ingress + IngressController |
| `frontend` | Deployment + Service (ClusterIP) |
| `backend` | Deployment + Service; mount uploads PVC |
| `postgres` | Managed RDS/Cloud SQL **or** StatefulSet + PVC |
| `uploads_data` volume | PersistentVolumeClaim |
| `latex_engine` | Sidecar or dedicated Deployment; backend needs Docker socket **or** remote compile service |

### Required backend environment

Same variables as `.env.production.example`. Inject via Secrets + ConfigMaps.

### Migrations

Run as an init Job before backend Deployment rolls out:

```yaml
command: ["npx", "prisma", "migrate", "deploy"]
```

Or rely on backend entrypoint (current Docker image behavior).

### Health probes

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 5000
  initialDelaySeconds: 60
readinessProbe:
  httpGet:
    path: /api/health
    port: 5000
  initialDelaySeconds: 30
```

## Deferred for K8s GA

- Helm chart (not included in RC1)
- HPA for backend (WebSocket sticky sessions required first)
- Redis-backed session store
- Object storage for uploads (S3/MinIO integration)

For RC1, deploy with Compose or manually map the table above.
