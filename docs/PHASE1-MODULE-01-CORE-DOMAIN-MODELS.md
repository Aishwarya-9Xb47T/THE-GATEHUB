# Phase 1 — Module 01: Core Domain Models

> **Status:** ✅ Complete  
> **Canonical reference:** `docs/ASSESSMENT-PLATFORM-ARCHITECTURE.md`  
> **Next module:** [Module 02 — Database Migration](./PHASE1-MODULE-02-DATABASE-MIGRATION.md)

---

## Purpose

Establish shared vocabulary, enums, immutable snapshot types, lifecycle rules, domain events, plugin contracts, and dual-track metrics — before any database or service code.

## Deliverables

| Artifact | Path |
|----------|------|
| Constants & enums | `backend/src/assessment-platform/domain/constants.ts` |
| Entity & snapshot types | `backend/src/assessment-platform/domain/types.ts` |
| Lifecycle state machine | `backend/src/assessment-platform/domain/lifecycle.ts` |
| Domain events | `backend/src/assessment-platform/domain/events.ts` |
| Plugin contracts | `backend/src/assessment-platform/domain/plugins.ts` |
| Rules engine types | `backend/src/assessment-platform/domain/rules.ts` |
| Offline sync types | `backend/src/assessment-platform/domain/offline.ts` |
| Barrel export | `backend/src/assessment-platform/domain/index.ts` |
| Frontend types | `frontend/src/assessment-platform/types/` |
| Renderer registry (frontend) | `frontend/src/assessment-platform/types/rendererRegistry.ts` |
| Validation script | `backend/src/assessment-platform/scripts/validate-domain.ts` |

## Key Design Decisions

### Dual-track metrics

- `LearningMetrics` — accuracy, mastery, concepts (LMS / pedagogy)
- `EngagementMetrics` — XP, rank, streak (gamification only)
- Never merged in storage or API responses without explicit separation

### Immutable versioning

- `QuestionVersionSnapshot` and `AssessmentVersionSnapshot` are the only structures used for grading and player bootstrap
- Attempts pin `assessmentVersionId` + per-question `questionVersionId`

### Lifecycle vs deployment status

| Concept | Entity | States |
|---------|--------|--------|
| Content lifecycle | `Assessment` | draft → review → approved → published → … → archived |
| Runtime status | `AssessmentDeployment` / `LiveRoom` | draft, lobby, active, paused, completed |

### Plugin categories

`questionType`, `grader`, `renderer`, `assessmentMode`, `gamification`, `leaderboard`, `analytics`, `aiTool`, `notification`, `cheatDetection`

## Validation

```bash
cd backend
npx tsx src/assessment-platform/scripts/validate-domain.ts
```

Expected: `All domain model checks passed.`

## Backward Compatibility

- No changes to existing `Quiz`, `LiveSession`, or course player code
- New code lives under `assessment-platform/` namespace only
- Legacy types in `lib/quizBuilder/types.ts` remain until Module 12 (Migration Adapters)

## Approval Gate

- [x] All enums align with architecture doc Section 5 & 19
- [x] Lifecycle transitions match Section 19 diagram
- [x] Domain events match Section 21 catalog
- [x] Frontend types mirror backend snapshots
- [x] Validation script passes

**Approved to proceed → Module 02: Database Migration**
