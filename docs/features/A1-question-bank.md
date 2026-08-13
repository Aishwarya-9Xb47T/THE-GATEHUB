# A1 — Question Bank Merge (Assessment Hub)

> **Status:** Complete — ready for review  
> **Phase:** A1 of [Production Migration Plan](../ASSESSMENT-PRODUCTION-MIGRATION-PLAN.md)

---

## Summary

Assessment Studio Question Bank merged into **Assessment Hub** (`/instructor/quiz-room`). One instructor workspace; legacy routes redirect with audit logging. All `/api/assessment-studio/*` APIs unchanged.

---

## What Changed

### Assessment Hub Navigation

| Tab | Route param | Content |
|-----|-------------|---------|
| My Assessments | `?tab=quizzes` | Premium quiz library (unchanged) |
| **Question Bank** | `?tab=bank` | Merged studio bank + sections/filters |
| Live Sessions | `?tab=live` | Existing live rooms |
| Homework | `?tab=homework` | Placeholder (A2) |
| Reports | `?tab=reports` | Existing summaries |
| Templates | `?tab=templates` | Room templates |
| AI Studio | `?tab=ai` | AI question generator |
| Settings | `?tab=settings` | Room defaults |

### Question Bank Sections

```
Question Bank (?tab=bank&section=…)
├── all            (default)
├── mine
├── shared         (Coming Soon — Phase B)
├── department     (Coming Soon — Phase B)
├── collections
├── ai_generated
├── draft
├── review
├── published
├── archived
└── imports
```

### Filters (API-backed where supported)

Subject/Topic, Difficulty, Bloom Level, Question Type, Tags, Language, Status.

Creator / Organization filters — UI reserved, Phase B.

---

## Legacy Redirects

| Legacy | New |
|--------|-----|
| `/instructor/assessment-studio` | `/instructor/quiz-room?tab=bank` |
| `/instructor/assessment-studio?tab=import` | `?tab=bank&section=imports` |
| `/instructor/assessment-studio?tab=ai` | `?tab=ai` |
| `/instructor/assessment-studio/questions/:id` | `/instructor/quiz-room/bank/questions/:id` |

Every redirect logs:

```
Legacy Route → Redirect → New Route → Feature Flag → Fallback → Analytics Event
```

Via `logAssessmentMigration()` (`frontend/src/lib/assessment/migrationLog.ts`).

---

## Feature Flag Registry

Central registry introduced before migration work:

| Flag | Default | Phase |
|------|---------|-------|
| `assessmentPlatform` | off | B |
| `questionBankV2` | off | B |
| `assessmentPlayer` | off | B |
| `reportsV2` | off | A |
| `homeworkV2` | off | A |
| `analyticsV2` | off | B |
| `gamificationV2` | off | B |
| `aiInsights` | off | A |
| `assessmentDashboard` | off | A |

- Backend: `backend/src/config/assessmentFeatureFlags.ts`
- API: `GET /api/assessment-platform/feature-flags`
- Frontend: `frontend/src/lib/assessment/featureFlags.ts`

Override: `platformSettings.featureFlags` JSON or `ASSESSMENT_FLAG_<KEY>=true` env.

**Note:** A1 merge is always available — flags gate future v2/API migrations, not the hub UI itself.

---

## Files Added / Changed

| Area | Files |
|------|-------|
| Hub UI | `QuestionBankPanel`, `CollectionsPanel`, `ImportPanel`, `AiStudioPanel` |
| Redirects | `AssessmentStudioMigrationRedirect.tsx` |
| Routes | `App.tsx` — bank editor route + legacy redirects |
| Dashboard | `QuizRoomDashboardPage.tsx` — Assessment Hub tabs |
| Editor | `QuestionEditorPage.tsx` — new paths |
| Nav | `DashboardLayout.tsx` — "Assessment Hub" |
| Flags | Backend + frontend registry, API route |
| Permissions | `docs/ASSESSMENT-PERMISSIONS.md` |
| Backend | `language` filter on bank question list |

---

## Backward Compatibility

- ✅ `/api/assessment-studio/*` — unchanged
- ✅ Deep links — redirected with param mapping
- ✅ Quiz Room URLs — unchanged (`/instructor/quiz-room/...`)
- ✅ Import wizard — reused from assessment-studio components
- ✅ Question editor — same UI, new URL

---

## Manual Regression Checklist

- [ ] `/instructor/assessment-studio` → lands on Question Bank tab
- [ ] `/instructor/assessment-studio/questions/:id` → opens editor at new URL
- [ ] Question Bank sections filter correctly (draft, AI, imports, etc.)
- [ ] Filters (type, difficulty, bloom, topic, tag, language) work
- [ ] New Question → save → stays in hub editor path
- [ ] Collections and Import sub-views work
- [ ] AI Studio tab generates questions
- [ ] Sidebar shows "Assessment Hub"
- [ ] Dev console shows migration log on legacy URL visit

---

## Next: A2 — Homework

Homework as deployment mode: **Host Live | Assign Homework | Preview** on every assessment.
