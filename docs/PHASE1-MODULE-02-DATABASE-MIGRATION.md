# Phase 1 — Module 02: Database Migration

> **Status:** ✅ Schema added — migration applied to dev DB  
> **Prerequisite:** Module 01 Core Domain Models  
> **Next module:** Module 03 Assessment Service

---

## Summary

Added **40+ new Prisma models** alongside existing `Quiz` / `LiveSession` tables. No legacy tables were modified or removed.

## Naming Convention

Prisma models prefixed with `Assess*` where they conflict with legacy names:

| Domain term | Prisma model | Legacy bridge |
|-------------|--------------|---------------|
| Question | `AssessQuestion` | `legacyQuizQId`, `legacyBankId` |
| QuestionVersion | `AssessQuestionVersion` | — |
| Choice | `AssessChoice` | — |
| LiveRoom | `AssessLiveRoom` | via `AssessmentDeployment.legacySessionId` |
| Assessment | `Assessment` | `legacyQuizId` |

API/domain layer continues to use canonical names (`Question`, `LiveRoom`).

## Tables Added

### Core
- `Organization`, `Department`, `OrganizationMember`, `TenantConfig`
- `Assessment`, `AssessmentVersion`, `AssessmentSection`, `AssessmentItem`
- `AssessQuestionType`, `AssessQuestion`, `AssessQuestionVersion`, `AssessChoice`
- `MediaAsset`, `MediaVariant`, `MediaUsage`

### Runtime
- `AssessmentDeployment`, `AssessmentAttempt`, `AssessmentAttemptQuestion`, `AssessmentResponse`
- `LearningRecord`, `EngagementRecord` (dual-track, 1:1 with attempt)
- `AssessLiveRoom`, `AssessParticipant`, `AssessTeam`, `AssessLeaderboardSnapshot`, `AssessLiveRoomAnalytics`
- `HomeworkAssignment`, `CourseAssignment`

### Platform
- `UserGamificationProfile`, `XPTransaction`, `CoinTransaction`
- `BadgeDefinition`, `BadgeAward`, `AchievementDefinition`, `Achievement`
- `PlatformAnalyticsEvent`, `AIHistory`, `PlatformAuditLog`
- `AssessQuestionAnalytics`

## Apply Migration

```bash
cd backend
npx prisma migrate dev --name assessment_platform_phase1
# or for dev sync without migration history:
# npx prisma db push
```

## Post-Migration Seed (Module 03)

Seed `AssessQuestionType` rows for all builder types (MCQ, coding, etc.) and default `Organization`.

## Backward Compatibility

| Legacy | Status |
|--------|--------|
| `Quiz`, `Question`, `Option` | Unchanged — still used by course player & quiz builder |
| `LiveSession`, `LiveParticipant` | Unchanged — quiz room still works |
| `BankQuestion` | Unchanged — migrates to `AssessQuestion` via adapter (Module 12) |

New code reads/writes new tables only. Legacy adapters bridge until frontend migration completes.

## Validation

```bash
npx prisma validate   # ✅ passed
npx prisma generate   # ✅ client updated
```

## Approval Gate

- [x] Schema validates
- [x] No legacy table alterations
- [x] Legacy bridge columns present
- [x] Dual-track `LearningRecord` / `EngagementRecord`
- [x] Version pins on `AssessmentAttempt` + `AssessmentAttemptQuestion`
- [x] Migration applied to dev database (`prisma db push`)
