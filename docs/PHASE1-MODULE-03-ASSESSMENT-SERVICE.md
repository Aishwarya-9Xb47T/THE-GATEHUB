# Phase 1 — Module 03: Assessment Service

> **Status:** ✅ Complete  
> **Prerequisite:** Module 01 Core Domain Models, Module 02 Database Migration  
> **Next module:** [Module 04 — Question Service](./PHASE1-MODULE-04-QUESTION-SERVICE.md)

---

## Summary

CRUD, lifecycle transitions, immutable publish with version snapshots, domain event emission, and REST API at `/api/v2/assessments`.

## Deliverables

| Artifact | Path |
|----------|------|
| Event bus | `backend/src/assessment-platform/infra/eventBus.ts` |
| Snapshot builder | `backend/src/assessment-platform/services/snapshotBuilder.ts` |
| Access control | `backend/src/assessment-platform/services/assessmentAccess.ts` |
| Assessment service | `backend/src/assessment-platform/services/assessmentService.ts` |
| Controller | `backend/src/assessment-platform/controllers/assessmentController.ts` |
| Routes | `backend/src/assessment-platform/routes/assessments.ts` |
| Question type seed | `backend/src/assessment-platform/scripts/seed-question-types.ts` |
| Validation script | `backend/src/assessment-platform/scripts/validate-assessment-service.ts` |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/assessments` | Create assessment (draft + default section) |
| GET | `/api/v2/assessments` | List author's assessments |
| GET | `/api/v2/assessments/:id` | Get with sections/items |
| PATCH | `/api/v2/assessments/:id` | Update metadata (not when frozen) |
| POST | `/api/v2/assessments/:id/lifecycle` | `{ action: "submit_for_review" \| ... }` |
| POST | `/api/v2/assessments/:id/publish` | Create immutable version |
| POST | `/api/v2/assessments/:id/archive` | Archive assessment |
| GET | `/api/v2/assessments/:id/versions` | Version history |
| GET | `/api/v2/assessments/:id/versions/:versionId` | Immutable snapshot |

## Lifecycle Flow

```
draft → submit_for_review → review → approve → approved → publish → published
```

Publish creates `AssessmentVersion` + pins `AssessQuestionVersion` per question. Events `AssessmentCreated` and `AssessmentPublished` persist to `PlatformAnalyticsEvent`.

## Validation

```bash
cd backend
npx tsx src/assessment-platform/scripts/seed-question-types.ts
npx tsx src/assessment-platform/scripts/validate-assessment-service.ts
```

## Backward Compatibility

- Legacy `/api/quiz-builder/*` and `/api/live-sessions/*` unchanged
- New tables only; no modifications to `Quiz` or `LiveSession`
- v2 API is additive; frontend adoption via feature flag later

## Approval Gate

- [x] CRUD + lifecycle + publish
- [x] Immutable snapshots with question version pins
- [x] Domain events persisted
- [x] Integration validation script passes
- [x] Routes registered without breaking existing APIs

**Approved to proceed → Module 04: Question Service**
