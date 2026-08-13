# A0 — Critical Stability

> **Status:** Complete — ready for review  
> **Phase:** A0 of [Production Migration Plan](../ASSESSMENT-PRODUCTION-MIGRATION-PLAN.md)

---

## Summary

Four production bugs fixed before any Assessment Hub feature work. All changes are backward compatible; no schema migration required.

---

## A0.1 — Legacy Quiz Ownership Checks

**Problem:** `PUT /api/quizzes/:id` (`bulkUpdate`) and `POST /api/quizzes/:id/questions` (`addQuestion`) had no ownership verification. Any authenticated user could modify any quiz.

**Fix:** Shared access helper `assertLegacyQuizAccess` in `backend/src/services/quiz/quizAccess.ts`, reused by:

- `quizzesController.bulkUpdate`
- `quizzesController.addQuestion`
- `quizBuilderService` (deduplicated from inline copy)

**Access rules:** Admin, quiz author, course instructor (via lecture link), or host of a live session using the quiz.

---

## A0.2 — Live Session Shuffle Seed Bug

**Problem:** `buildSessionState` re-shuffled questions and options on every call. Refreshing the page or reconnecting WebSocket could show a different question at the same index, breaking answer submission.

**Fix:** Question and option order is **frozen at session start** in `LiveSession.settings`:

```json
{
  "questionOrder": ["q-id-1", "q-id-2"],
  "optionOrders": { "q-id-1": ["opt-b", "opt-a"] }
}
```

- `startSession` calls `freezeSessionQuestionOrders`
- `buildSessionState`, `advanceQuestion`, `submitLiveAnswer`, analytics, and question stats all use the frozen order

**Types extended:** `LiveSessionSettings.questionOrder`, `LiveSessionSettings.optionOrders`

---

## A0.3 — REST Host Actions → WebSocket Broadcast

**Problem:** Host actions via HTTP (`POST .../start`, `.../next`, `.../finish`) updated the database but did not notify WebSocket clients. Only WS-initiated host commands broadcast state.

**Fix:** After each REST host action in `liveSessionController`:

1. `refreshLiveSessionState(sessionId)` — pushes full state to connected clients
2. `broadcastToLiveSession(sessionId, { type: ... })` — event hint for UI

Events: `session_started`, `question_advanced`, `session_finished`

---

## A0.4 — Short Answer Grading

**Problem:** `gradeAnswer` returned `false` for unknown types. Course quiz `submitAttempt` duplicated grading inline and skipped `short_answer`.

**Fix:**

- `gradeAnswer` handles `short_answer` and `fill_blank` via normalized text comparison (trim, lowercase, collapse whitespace)
- `submitAttempt` delegates to shared `gradeQuizAnswers`

Accepted answers come from options marked `isCorrect: true` (matches Premium Quiz Builder storage).

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/services/quiz/quizAccess.ts` | New shared access helper |
| `backend/src/controllers/quizzesController.ts` | Auth + shared grading |
| `backend/src/services/quizGradingService.ts` | Text answer grading |
| `backend/src/services/liveSession/types.ts` | Frozen order fields |
| `backend/src/services/liveSession/liveSessionService.ts` | Order freeze + consistent index |
| `backend/src/controllers/liveSessionController.ts` | WS broadcast after REST |
| `backend/src/services/quizBuilder/quizBuilderService.ts` | Use shared access |

---

## Validation

```bash
cd backend
npx tsx scripts/validate-a0-critical.ts
```

---

## Manual Regression Checklist

- [ ] Instructor can bulk-update own quiz; 403 on another instructor's quiz
- [ ] Live session with randomize ON: refresh mid-question shows same question/options
- [ ] Host starts session via REST; student WS client receives `session_state`
- [ ] Course quiz with short_answer question grades correctly on submit
- [ ] Existing live sessions (started before deploy) fall back to sorted question order

---

## Backward Compatibility

- Sessions **already active** without `questionOrder` in settings use canonical sort-by-`order` fallback
- New sessions get frozen order on start
- No API contract changes; response shapes unchanged

---

## Next: A1 — Question Bank

Merge Assessment Studio into Assessment Hub (`/instructor/quiz-room?tab=bank`).
