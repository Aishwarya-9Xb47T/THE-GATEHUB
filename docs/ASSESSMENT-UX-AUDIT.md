# Assessment Platform — Production UX & Data Audit

> **Status:** Complete audit — **no fixes implemented**  
> **Date:** July 6, 2026  
> **Gate:** A2 Homework and all new assessment features **blocked** until P0/P1 items are resolved and re-reviewed.

---

## Purpose

Full production-quality review of the assessment lifecycle—from instructor creation through student completion—against the bar set by Quizizz, Kahoot, Google Forms, Canvas, and Moodle.

This document is the **implementation checklist**. Do not ship new features until P0/P1 items are closed and manually re-tested.

---

## Severity legend

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Data shown to users is wrong, misleading, or exposes internal IDs; blocks trust | Fix before any classroom use |
| **P1** | Major workflow broken, placeholder shipped as production, or core interaction fails | Fix before feature development resumes |
| **P2** | Degraded UX, missing states, inconsistent calculations (non-blocking) | Fix in polish sprint |
| **P3** | Cosmetic, copy, minor a11y, design drift | Backlog |

**Effort:** S = hours, M = 1–2 days, L = 3+ days

---

## Screenshot references

| Ref | Description | Path |
|-----|-------------|------|
| **Screenshot A** | Live player — incorrect answer feedback shows Prisma option ID as “Correct answer”, AI offline placeholder in explanation, instructor-paced copy in self-paced session | `assets/c__Users_texta_AppData_Roaming_Cursor_User_workspaceStorage_92a48974da152a3b47918a2158f865a0_images_image-a5128f42-3444-47fd-a423-c1119ae0bab7.png` |

---

## Executive summary

| Phase | P0 | P1 | P2 | P3 | Total |
|-------|:--:|:--:|:--:|:--:|:-----:|
| 1 — Lifecycle UX | 0 | 8 | 42 | 12 | 62 |
| 2 — Data correctness | 3 | 2 | 4 | 1 | 10 |
| 3 — Score engine | 0 | 4 | 8 | 4 | 16 |
| 4 — Live player polish | 0 | 2 | 9 | 2 | 13 |
| 5 — Instructor review | 0 | 6 | 28 | 8 | 42 |
| 6 — Student review | 0 | 4 | 18 | 5 | 27 |
| 7 — Design consistency | 0 | 1 | 8 | 6 | 15 |
| **Total unique issues** | **3** | **27** | **117** | **38** | **185** |

### Top 10 blockers (fix first)

1. **AUDIT-DATA-001** — Correct answer shows database ID (Screenshot A)
2. **AUDIT-DATA-002** — Self-paced feedback binds to wrong question snapshot after submit
3. **AUDIT-DATA-003** — AI offline/demo content published and shown to students without guardrails
4. **AUDIT-SCORE-002** — Wrong-answer feedback shows cumulative score instead of points delta
5. **AUDIT-SCORE-007** — `multipleAttempts` double-counts score and accuracy
6. **AUDIT-STU-004** — Retake button on quiz results is non-functional
7. **AUDIT-INSTR-012** — Room password toggle sets literal `"room"`
8. **AUDIT-INSTR-017** — Quiz builder AI panel buttons have no handlers
9. **AUDIT-INSTR-039** — AI offline/demo mode easy to commit as real content
10. **AUDIT-DATA-004** — `paceMode` fallback always resolves to `self_paced` (legacy instructor-paced broken)

---

## Phase 1 — Complete UX & Data Audit (lifecycle map)

### Instructor workflow coverage

| Step | Primary surface | Audit status | Critical gaps |
|------|-----------------|:------------:|-----------------|
| Create Assessment | Assessment Hub → Create wizard | ⚠️ | AI path exits wizard; bank reuse hidden; password stub |
| Question Bank | Hub → Bank tab | ⚠️ | Phase B placeholders; collections non-functional |
| Import | Import wizard | ⚠️ | Duplicate badges; stale cache keys |
| AI Generation | Hub AI tab + wizard + `AiAssessmentStudio` | ❌ | Hub tab is stub; offline demo; 4 sources disabled |
| Quiz Builder | `/instructor/quiz-room/quizzes/:id/edit` | ⚠️ | Dead AI buttons; no Host Live validation gate |
| Preview | `StudentPreviewPane` | ✅ | Minor parity gaps vs live player |
| Validation | `LiveValidationPanel` | ⚠️ | Not enforced on Host Live navigation |
| Publish / Launch | Wizard launch, room edit | ⚠️ | No client-side pre-launch validation |
| Host Live | `LiveSessionHostPage` | ⚠️ | Fake health metrics; self-paced host copy missing |
| Reports | Hub → Reports tab | ⚠️ | Raw ms timestamps; no drill-down |

### Student workflow coverage

| Step | Primary surface | Audit status | Critical gaps |
|------|-----------------|:------------:|-----------------|
| Join | `LiveSessionJoinPage` | ⚠️ | No status pre-check; UUID in URL |
| Waiting Room | `LiveStudentLobby` | ⚠️ | Instructor-only copy |
| Question Flow | `LiveQuestionDisplay` | ⚠️ | Timer expiry strands selection |
| Feedback | `LiveAnswerFeedback` | ❌ | ID leak, wrong copy, missing “Your answer” |
| Leaderboard | `LiveLeaderboardReveal` | ⚠️ | No a11y dialog semantics |
| Completion | `LiveStudentResults` | ⚠️ | Static “Great job!”; fake “Best streak” |
| Results | `QuizResultsPage` | ❌ | Broken Retake; no live sessions |
| Review | — | ❌ | Not built |

---

## Phase 2 — Data correctness

> **Rule:** Never expose database IDs, UUIDs, Prisma IDs, foreign keys, or raw internal enums to students.

| ID | Sev | Screenshot | Issue | Root cause | Recommended fix | Files | Effort |
|----|:---:|------------|-------|------------|-----------------|-------|:------:|
| **AUDIT-DATA-001** | P0 | A | “Correct answer” shows `cmr4zt5su002xjqi67iww1uwc` instead of option text | `resolveCorrectLabels()` falls back to raw ID when `question.options` lookup fails (`?? id`). Triggered when feedback uses wrong question snapshot (see DATA-002) or option `text` is empty in DB | Backend: add `correctAnswerLabels: string[]` to `answer_result`. Frontend: render labels from result; never fall back to ID; hide block if unresolved | `LiveAnswerFeedback.tsx`, `selfPacedProgression.ts`, `liveSessionService.ts`, `liveAssessmentRouter.ts` | M |
| **AUDIT-DATA-002** | P0 | A | Feedback card resolves options against **next** question after self-paced submit | `participant_state` advances `currentQuestionIndex` immediately; `LiveSessionPlayerPage` passes `sessionState.currentQuestion` to feedback. `feedbackQuestionId` is tracked in hook but **not exported or used** | Snapshot answered question in `answer_result` (`answeredQuestion: QuestionForClient`) or keep `feedbackQuestion` state from submit time; pass snapshot to `LiveAnswerFeedback` | `LiveSessionPlayerPage.tsx`, `useLivePlayerFlow.ts`, `useLiveSessionSocket.ts`, `liveSessionServer.ts` | M |
| **AUDIT-DATA-003** | P0 | A | Students see AI offline placeholder: *“This is a locally generated sample…”* | `aiOfflineGenerator.ts` writes fixed explanation; instructors commit demo quizzes via “Continue Offline”; no publish-time guard | Block publish/launch if `tags` includes `demo-mode`/`offline-sample`; strip demo explanations at materialize; banner in AI studio before commit | `aiOfflineGenerator.ts`, `AiErrorDialog.tsx`, `useAiGeneration.ts`, `quizBuilderService.ts`, `validateQuizForLive` | M |
| **AUDIT-DATA-004** | P1 | — | `paceMode` fallback always returns `self_paced` even when `autoNextQuestion` is false | Copy-paste bug: both branches return `"self_paced"` | `return settings.autoNextQuestion ? "self_paced" : "instructor_paced"` | `frontend/src/lib/liveSession/paceMode.ts`, `backend/src/services/liveSession/paceMode.ts` | S |
| **AUDIT-DATA-005** | P1 | — | Course player debug overlay exposes **Course ID**, **Lecture ID**, video URL to students | `showDebug` toggle in student `CoursePlayerPage` | Remove debug overlay from production student routes or gate behind `import.meta.env.DEV` | `CoursePlayerPage.tsx` | S |
| **AUDIT-DATA-006** | P2 | — | Question Bank editor shows raw status enum `pending_review` | No label map | Map to human labels (`Pending review`, etc.) | `QuestionEditorPage.tsx` | S |
| **AUDIT-DATA-007** | P2 | — | AI validation panel lists internal check keys (`stem_length`, etc.) | Keys rendered directly | Map to instructor-friendly labels | `QuestionEditorPage.tsx` | S |
| **AUDIT-DATA-008** | P2 | — | Import error surfaces **Support ID** (internal correlation ID) | Error UX design | Rename to “Reference code” with support-only tooltip; optional copy | `ImportWizard.tsx` | S |
| **AUDIT-DATA-009** | P2 | — | Join navigates to `/live/play/{sessionUUID}` — internal ID in URL | REST lookup returns UUID used as route param | Use room code in URL (`/live/play/code/:code`) with server resolve | `LiveSessionJoinPage.tsx`, `App.tsx`, backend lookup | M |
| **AUDIT-DATA-010** | P3 | — | Reports tab shows raw `sessionId` in API payloads (not rendered today) | — | Ensure drill-down views never render raw IDs | `QuizRoomDashboardPage.tsx` | S |

---

## Phase 3 — Score engine audit

| ID | Sev | Metric | Issue | Expected vs actual | Root cause | Files | Effort |
|----|:---:|--------|-------|-------------------|------------|-------|:------:|
| **AUDIT-SCORE-001** | P1 | Accuracy | Feedback card accuracy lags one answer behind | After Q4 wrong, may still show 33% from 3 answers until leaderboard WS arrives | `accuracy={myEntry?.accuracy}` from async leaderboard, not submit payload | `LiveSessionPlayerPage.tsx`, `LiveAnswerFeedback.tsx`, `useLiveSessionSocket.ts` | S |
| **AUDIT-SCORE-002** | P1 | Points | Wrong answers show label **“Score”** with cumulative total, not delta | Should show `0` or `−250` (negative marking) | Conditional StatPill in `LiveAnswerFeedback` | `LiveAnswerFeedback.tsx` | S |
| **AUDIT-SCORE-003** | P1 | All header stats | REST submit fallback updates `lastAnswerResult` but not `leaderboard` | Header stale after WS timeout path | `submitAnswerViaRest` omits leaderboard merge | `useLiveSessionSocket.ts` | S |
| **AUDIT-SCORE-004** | P1 | Rank, score | Transient mismatch between feedback `result.rank` and header `myEntry.rank` | Same numbers everywhere | Leaderboard updates async after `answer_result` | `LivePlayerHeader.tsx`, `useLiveSessionSocket.ts` | S |
| **AUDIT-SCORE-005** | P2 | Streak | Results label **“Best streak”** but only `streak` (current) stored | Peak consecutive correct count | No `bestStreak` field in schema | `LiveStudentResults.tsx`, `schema.prisma`, `liveSessionService.ts` | M |
| **AUDIT-SCORE-006** | P2 | Score | `perfectBonus` in settings never applied | Bonus at 100% session accuracy | Setting unused in submit/finish | `types.ts`, `liveSessionService.ts`, `selfPacedProgression.ts` | M |
| **AUDIT-SCORE-007** | P1 | Score, XP, accuracy | `multipleAttempts: true` double-counts on resubmit | Net delta = new − old | Old answer deleted but prior score/counts not reversed | `liveSessionService.ts`, `selfPacedProgression.ts` | M |
| **AUDIT-SCORE-008** | P2 | Rank | Tie-breakers incomplete (no response time, join order) | Per product spec | Sort only `score`, `correctCount` | `buildLeaderboard()` in `liveSessionService.ts` | M |
| **AUDIT-SCORE-009** | P2 | Response time | Instructor-paced uses `session.questionStartedAt` for all participants | Per-participant fair timer | Late joiners penalized on speed bonus | `liveSessionService.ts` | M |
| **AUDIT-SCORE-010** | P2 | Speed bonus | Timer is visual-only; no auto-submit at 0 | Enforce or decouple speed curve | `LiveQuestionDisplay.tsx`, `selfPacedProgression.ts` | M |
| **AUDIT-SCORE-011** | P2 | Score | Per-question `marks` ignored in live mode | Variable question weight | Flat `correctnessWeight` only | `quizGradingService.ts`, live submit paths | M |
| **AUDIT-SCORE-012** | P2 | XP | Restored/replayed answers return `xpEarned: 0` | Show earned XP or omit pill | Hardcoded in `buildLiveAnswerResultPayload` / idempotent paths | `liveSessionService.ts`, `selfPacedProgression.ts` | S |
| **AUDIT-SCORE-013** | P3 | Rank | Rank fallback `?? 0` displays **#0** | Hide or show “—” | Nullish fallback | `LiveAnswerFeedback.tsx`, `LivePlayerHeader.tsx`, backend rank lookup | S |
| **AUDIT-SCORE-014** | P3 | Streak | No cap on streak bonus multiplier | Capped per spec | Unbounded `(streak − 1) × streakBonus` | `quizGradingService.ts` | S |
| **AUDIT-SCORE-015** | P2 | Accuracy | Unanswered questions excluded from denominator until submit | Skips affect accuracy timing | No server timeout for timer expiry | `LiveQuestionDisplay.tsx`, `liveSessionService.ts` | L |
| **AUDIT-SCORE-016** | P2 | Accuracy | Screenshot A: 33% at “Question 4” — mathematically valid only if 1/3 answered (index may have advanced) | Consistent question count in header vs accuracy | Self-paced index advance during feedback (see DATA-002) | `LivePlayerHeader.tsx`, `buildLeaderboard()` | S |

### Score formulas (verified)

| Metric | Formula (as implemented) | Consistent? |
|--------|--------------------------|:-----------:|
| Correct points | `correctnessWeight + speedComponent + streakBonus×(streak−1)` | ✅ |
| Wrong points | `0`, or `−round(correctnessWeight×0.25)` if negative marking | ✅ |
| XP | `round(pointsEarned/10)` on correct only | ✅ |
| Accuracy | `round(correct/(correct+wrong)×100)` | ✅ (when counts correct) |
| Rank | Sort by score DESC, correctCount DESC | ⚠️ ties |

---

## Phase 4 — Live player polish

### Current vs target (feedback card)

| Element | Current | Target | Status |
|---------|---------|--------|:------:|
| Correct / Incorrect | ✅ Large icon + headline | Keep | ✅ |
| Your answer | ❌ Missing | Show selected option text | ❌ |
| Correct answer | ⚠️ Shows ID when lookup fails | Resolved text or highlighted option | ❌ |
| Points earned | ⚠️ Wrong semantics on incorrect | `+N` or `−N` this question | ⚠️ |
| Current score | ⚠️ Only on wrong path, mislabeled | Always available, labeled “Score” | ⚠️ |
| Current streak | ✅ When > 0 | Always show (0 = dim) | ⚠️ |
| Accuracy | ⚠️ Stale / header only | From submit payload | ⚠️ |
| Response time | ✅ | Keep | ✅ |
| Question number | ⚠️ Shows **next** Q# during self-paced feedback | Answered question # | ❌ |
| Animations | ✅ Spring motion | Keep, add reduce-motion | ✅ |
| Progress to next | ⚠️ “Instructor advances” copy | Pace-aware auto-advance copy | ❌ |

| ID | Sev | Screenshot | Issue | Root cause | Recommended fix | Files | Effort |
|----|:---:|------------|-------|------------|-----------------|-------|:------:|
| **AUDIT-LIVE-001** | P1 | A | Hardcoded *“Next question loading when instructor advances…”* in self-paced mode | No `selfPaced` prop on `LiveAnswerFeedback` | Pace-aware copy: *“Loading next question…”* + optional countdown | `LiveAnswerFeedback.tsx`, `LiveSessionPlayerPage.tsx` | S |
| **AUDIT-LIVE-002** | P1 | — | Missing **“Your answer”** section on feedback card | Not implemented | Add `userAnswerLabels` from backend or client selection snapshot | `LiveAnswerFeedback.tsx`, submit payload | M |
| **AUDIT-LIVE-003** | P0 | A | See **AUDIT-DATA-001**, **AUDIT-DATA-002** | — | — | — | — |
| **AUDIT-LIVE-004** | P2 | — | `showExplanations` setting ignored in feedback | Setting not passed to component | Pass `showExplanations`; hide explanation block when false | `LiveSessionPlayerPage.tsx`, `LiveAnswerFeedback.tsx` | S |
| **AUDIT-LIVE-005** | P2 | — | Explanations plain text; stems use `MarkdownContent` | `<p>{result.explanation}</p>` | Use `MarkdownContent` for explanations | `LiveAnswerFeedback.tsx` | S |
| **AUDIT-LIVE-006** | P2 | — | No `aria-live` / `role="status"` on feedback | Visual-only | Add polite live region for screen readers | `LiveAnswerFeedback.tsx` | S |
| **AUDIT-LIVE-007** | P2 | — | `LiveReadyStatusBar` still says *“Waiting for next question…”* (instructor-paced only) | Correct for instructor mode; ensure never shown self-paced | Already gated; verify after DATA-004 fix | `LiveSessionPlayerPage.tsx`, `LiveReadyStatusBar.tsx` | S |
| **AUDIT-LIVE-008** | P2 | — | Timer hits 0 → submit disabled, no auto-submit or feedback | Known issue KI-010 | Server timeout or auto-submit with “Time’s up” feedback | `LiveQuestionDisplay.tsx`, backend | L |
| **AUDIT-LIVE-009** | P2 | — | Leaderboard overlay lacks dialog a11y (focus trap, Escape) | Custom overlay | Use dialog pattern or Radix Dialog | `LiveLeaderboardReveal.tsx` | M |
| **AUDIT-LIVE-010** | P2 | — | `multiple_select` uses `aria-pressed` buttons in `radiogroup` | Confusing for AT | Native checkbox group or corrected roles | `LiveQuestionDisplay.tsx` | M |
| **AUDIT-LIVE-011** | P2 | — | Self-paced refresh skips player-view restore | `if (selfPaced) return` in restore effects | Restore from `getPlayerSessionView` using participant index | `useLivePlayerFlow.ts`, `getPlayerSessionView` backend | M |
| **AUDIT-LIVE-012** | P3 | — | Compact feedback variant during `READY_FOR_NEXT` drops progress bar | By design | Document or unify full card through transition | `LiveAnswerFeedback.tsx`, `playerStateMachine.ts` | S |
| **AUDIT-LIVE-013** | P2 | — | `getPlayerSessionView` restore looks up answer for `state.currentQuestion.id` after self-paced advance — wrong question | Same race as DATA-002 | Lookup by last answered question id | `liveSessionService.ts` (`getPlayerSessionView`) | M |

---

## Phase 5 — Instructor review

| ID | Sev | Screen | Issue | Root cause | Recommended fix | Files | Effort |
|----|:---:|--------|-------|------------|-----------------|-------|:------:|
| **AUDIT-INSTR-001** | P2 | Hub → Homework | Entire tab placeholder | A2 not built | Hide tab until A2 or show “Coming soon” without nav entry | `QuizRoomDashboardPage.tsx` | S |
| **AUDIT-INSTR-002** | P2 | Hub | Inconsistent naming: Assessment Hub / Quiz Room / Create Quiz | Rebrand incomplete | Single glossary; update all CTAs to “Assessment” | Multiple hub files | S |
| **AUDIT-INSTR-003** | P2 | Hub → AI Studio | Tab is minimal form; full studio only in wizard | Stub panel | Link to full `AiAssessmentStudio` or embed it | `AiStudioPanel.tsx` | M |
| **AUDIT-INSTR-004** | P2 | Hub → Reports | **Avg Time (ms)** raw; no drill-down/export | Scaffold only | Format as seconds; link to session detail | `QuizRoomDashboardPage.tsx` | M |
| **AUDIT-INSTR-005** | P2 | Hub → Live | Empty state **Create Quiz** instead of launch/host CTA | Copy reuse | Fix empty state copy and action | `QuizRoomDashboardPage.tsx` | S |
| **AUDIT-INSTR-006** | P2 | Hub → Bank | Shared/Department **Phase B** placeholders | Not implemented | Hide or gate behind feature flag | `QuestionBankPanel.tsx` | S |
| **AUDIT-INSTR-007** | P2 | Hub → Collections | Create only — no open/edit/populate | No detail flow | Defer or implement collection detail | `CollectionsPanel.tsx` | M |
| **AUDIT-INSTR-008** | P1 | Wizard → AI | **Generate with AI** exits to builder; never launches room | `AiAssessmentStudio` commits to quiz entity only | Continue wizard after AI or rename method | `QuizRoomWizard.tsx`, `AiAssessmentStudio.tsx` | M |
| **AUDIT-INSTR-009** | P1 | Wizard → Duplicate | Lists past **live rooms** not **My Assessments** | Wrong API (`listQuizRooms`) | Use `listMyQuizzes` | `DuplicateQuizStep.tsx` | S |
| **AUDIT-INSTR-010** | P2 | Wizard → Templates | Marketing promises exam templates; shows room templates | Copy mismatch | Align copy or implement content templates | `CreateMethodStep.tsx` | S |
| **AUDIT-INSTR-011** | P2 | Wizard | `question_bank` path wired but not in method picker | Dead code path | Expose or remove | `QuizRoomWizard.tsx`, `CreateMethodStep.tsx` | S |
| **AUDIT-INSTR-012** | P1 | Wizard → Settings | Password toggle sets literal **`"room"`** | Placeholder handler | Password input modal | `RoomSettingsStep.tsx` | S |
| **AUDIT-INSTR-013** | P2 | Wizard → Settings | Many disabled toggles labeled Phase 5/6/9… | Roadmap in UI | Collapse “Advanced (coming soon)” | `RoomSettingsStep.tsx` | M |
| **AUDIT-INSTR-014** | P2 | Wizard → Templates | Template creates empty quiz → builder, skips launch | Template = settings only | Clarify flow or auto-continue wizard | `QuizRoomWizard.tsx` | M |
| **AUDIT-INSTR-015** | P2 | Edit room | `sourceType` not shown | Partial form | Display read-only source | `QuizRoomEditPage.tsx` | S |
| **AUDIT-INSTR-016** | P2 | Edit room | Launch with no client validation | API-only errors | Reuse `validateQuizForLive` | `QuizRoomEditPage.tsx` | S |
| **AUDIT-INSTR-017** | P1 | Quiz builder | 12 AI action buttons with **empty onClick** | Scaffold | Wire or remove | `quiz-builder/studio/AiStudioPanel.tsx` | S |
| **AUDIT-INSTR-018** | P2 | Quiz builder | AI assist toasts **“Phase 6”** / inserts `_AI draft:_` | Stubs | Wire APIs or hide | `QuestionAiAssist.tsx` | M |
| **AUDIT-INSTR-019** | P2 | Quiz builder | **Host Live** ignores validation badge | Nav only | Block with validation summary | `QuizStudioHeader.tsx` | S |
| **AUDIT-INSTR-020** | P2 | Quiz builder | Import forces full-page wizard context switch | Shared import flow | Modal/slide-over import | `QuizBuilderPage.tsx` | M |
| **AUDIT-INSTR-021** | P2 | Assessment Studio routes | `/instructor/assessment-studio` redirects; page is dead code | Migration complete | Delete orphan page or repurpose | `App.tsx`, `AssessmentStudioPage.tsx` | M |
| **AUDIT-INSTR-022** | P2 | Legacy redirects | `?tab=templates` maps to room templates not content templates | `migrationLog.ts` mapping | Redirect doc or fix mapping | `migrationLog.ts` | S |
| **AUDIT-INSTR-023** | P2 | Legacy redirects | `?tab=dashboard` → Question Bank | Dashboard dropped | Update bookmarks doc | `migrationLog.ts` | S |
| **AUDIT-INSTR-024** | P3 | Orphan studio page | Link still says Quiz Room | Stale copy | Remove with INSTR-021 | `AssessmentStudioPage.tsx` | S |
| **AUDIT-INSTR-025** | P2 | Orphan studio settings | “coming soon” settings | Never built | Remove with INSTR-021 | `AssessmentStudioPage.tsx` | S |
| **AUDIT-INSTR-026** | P2 | Bank editor | Raw `pending_review` status | No label map | Human labels | `QuestionEditorPage.tsx` | S |
| **AUDIT-INSTR-027** | P2 | Bank editor | MCQ-only editor for all types | MVP scope | Type-specific editors or restrict types | `QuestionEditorPage.tsx` | L |
| **AUDIT-INSTR-028** | P2 | Bank editor | Review buttons always visible | No role gating | Permission-aware UI | `QuestionEditorPage.tsx` | S |
| **AUDIT-INSTR-029** | P1 | Host → Waiting room | **Room health: Excellent**, **Network: Good** hardcoded | Placeholder widgets | Remove or wire real metrics | `WaitingRoomPanel.tsx` | S |
| **AUDIT-INSTR-030** | P2 | Host → Waiting room | Ready = joined; Waiting always 0 | Ready state not implemented | Implement ready toggle or remove metrics | `WaitingRoomPanel.tsx` | M |
| **AUDIT-INSTR-031** | P3 | Host → Waiting room | Announcements / lobby chat “Phase 2” | Future features | Hide until built | `WaitingRoomPanel.tsx` | S |
| **AUDIT-INSTR-032** | P2 | Host → Complete | Homework / Export / Duplicate are toast stubs | A2/A4 not built | Hide or implement | `LiveHostSessionComplete.tsx` | M |
| **AUDIT-INSTR-033** | P3 | Host | No copy explaining self-paced vs instructor-paced | Missing host education | Pace badge + short help text | `LiveSessionHostPage.tsx` | S |
| **AUDIT-INSTR-034** | P2 | Live Classroom | `LiveClassroomPage` exported but **no route** | Rename leftover | Add route alias or delete export | `LiveClassroomPage.tsx`, `App.tsx` | S |
| **AUDIT-INSTR-035** | P3 | Import preview | Duplicate question type badges | Layout duplication | Remove duplicate row | `ImportWizard.tsx` | S |
| **AUDIT-INSTR-036** | P2 | Import → Bank | Stale `studio-dashboard` cache keys | Assessment Studio era | Update invalidation keys | `ImportPanel.tsx` | S |
| **AUDIT-INSTR-037** | P2 | Bank reuse | Only **`published`** questions loaded | Over-filter | Include draft/review states | `BankReuseStep.tsx` | S |
| **AUDIT-INSTR-038** | P1 | AI Studio | Offline/demo generates sample questions indistinguishable from AI | `generateOfflineDemoQuestions` | See AUDIT-DATA-003 | `aiOfflineGenerator.ts`, `AiReviewStep.tsx` | M |
| **AUDIT-INSTR-039** | P2 | AI Studio | Four sources disabled (“Coming soon”) | `AI_SOURCES` flags | Enable or remove from picker | `AiSourceStep.tsx` | M |
| **AUDIT-INSTR-040** | P3 | AI Studio | Voice input disabled | Not implemented | Hide mic button | `AiCopilotPanel.tsx` | S |
| **AUDIT-INSTR-041** | P3 | AI Studio | `AiCopilotSidebar` orphan stub | Dead code | Delete | `AiCopilotSidebar.tsx` | S |

---

## Phase 6 — Student review

| ID | Sev | Screenshot | Screen | Issue | Root cause | Recommended fix | Files | Effort |
|----|:---:|------------|--------|-------|------------|-----------------|-------|:------:|
| **AUDIT-STU-001** | P1 | A | Feedback | Instructor-paced copy in self-paced | See AUDIT-LIVE-001 | — | — | — |
| **AUDIT-STU-002** | P1 | — | Lobby | *“Waiting for your instructor to start”* wrong for self-paced | No pace branching | Pace-aware lobby copy | `LiveStudentLobby.tsx` | S |
| **AUDIT-STU-003** | P1 | — | Player | `paceMode` fallback bug | See AUDIT-DATA-004 | — | — | — |
| **AUDIT-STU-004** | P1 | — | Quiz results | **Retake** button has no handler | Decorative `Button` | Wire retake navigation + API | `QuizResultsPage.tsx` | S |
| **AUDIT-STU-005** | P2 | — | Join | No confirmation; redirects to UUID URL | Immediate navigate | Pre-join summary card (title, host, status) | `LiveSessionJoinPage.tsx` | M |
| **AUDIT-STU-006** | P2 | — | Join | Can join finished/draft rooms | No status check on lookup | Block with message per status | `LiveSessionJoinPage.tsx` | S |
| **AUDIT-STU-007** | P2 | — | Player | `paused` status unhandled | Missing branch | Paused overlay | `LiveSessionPlayerPage.tsx` | M |
| **AUDIT-STU-008** | P2 | — | Lobby | Connection failures invisible in lobby | Lobby bypasses banner | Show `LiveConnectionBanner` in lobby | `LiveSessionPlayerPage.tsx` | S |
| **AUDIT-STU-009** | P2 | — | Player | Invalid session → infinite loading | No terminal error state | Full-page error with retry | `LiveSessionPlayerPage.tsx` | M |
| **AUDIT-STU-010** | P2 | — | Player | Self-paced refresh restore skipped | See AUDIT-LIVE-011 | — | — | — |
| **AUDIT-STU-011** | P2 | — | Question | Timer expiry strands selection | See AUDIT-LIVE-008 | — | — | — |
| **AUDIT-STU-012** | P1 | A | Feedback | Raw ID as correct answer | See AUDIT-DATA-001 | — | — | — |
| **AUDIT-STU-013** | P2 | — | Results | “View quiz history” excludes live sessions | Wrong API scope | Include `/live-sessions/history` or dedicated tab | `LiveStudentResults.tsx` | M |
| **AUDIT-STU-014** | P2 | — | Results | *“Answer review coming soon”* | Feature not built | Hide until A4 or implement | `LiveStudentResults.tsx` | S |
| **AUDIT-STU-015** | P2 | — | Results | Fabricated `myEntry` fallback (rank 0, score 0) | Defensive fallback masks sync failure | Error state instead of fake data | `LiveSessionPlayerPage.tsx` | S |
| **AUDIT-STU-016** | P2 | — | Results | Always *“Great job!”* | Static copy | Performance-based headline | `LiveStudentResults.tsx` | S |
| **AUDIT-STU-017** | P2 | — | Leaderboard | Overlay a11y gaps | See AUDIT-LIVE-009 | — | — | — |
| **AUDIT-STU-018** | P2 | — | Question | Option group a11y | See AUDIT-LIVE-010 | — | — | — |
| **AUDIT-STU-019** | P2 | — | Feedback | No screen reader announcement | See AUDIT-LIVE-006 | — | — | — |
| **AUDIT-STU-020** | P2 | — | Feedback | Explanations ignore `showExplanations` | See AUDIT-LIVE-004 | — | — | — |
| **AUDIT-STU-021** | P2 | — | Feedback | Explanation not markdown | See AUDIT-LIVE-005 | — | — | — |
| **AUDIT-STU-022** | P2 | — | Feedback | Points vs Score label asymmetry | See AUDIT-SCORE-002 | — | — | — |
| **AUDIT-STU-023** | P2 | — | Course quiz | Submit with unanswered questions allowed | No validation | Warn or block submit | `CoursePlayerPage.tsx` | M |
| **AUDIT-STU-024** | P2 | — | Course quiz | No post-submit explanations | Missing renderer | Port from `CourseLectureQuizBlock` | `CoursePlayerPage.tsx` | M |
| **AUDIT-STU-025** | P2 | — | Course quiz | Plain text questions (no LaTeX/markdown) | No `MarkdownContent` | Align with live player | `CoursePlayerPage.tsx` | M |
| **AUDIT-STU-026** | P3 | — | Quiz results | API error not friendly | No `isError` UI | Error card + retry | `QuizResultsPage.tsx` | S |
| **AUDIT-STU-027** | P3 | — | Quiz results | Pass/fail color at hardcoded **70%** | Fixed in `QuizCard` | Use per-quiz threshold | `QuizCard.tsx` | S |
| **AUDIT-STU-028** | P2 | — | Join | Guest mode blocked by `ProtectedRoute` | Auth mismatch | Public join/play routes when `guestMode` | `App.tsx` | M |
| **AUDIT-STU-029** | P3 | — | Player | `actionError` from socket never shown | Unused return value | Toast or inline error | `LiveSessionPlayerPage.tsx` | S |
| **AUDIT-STU-030** | P2 | — | Course quiz | Debug IDs exposed | See AUDIT-DATA-005 | — | — | — |
| **AUDIT-STU-031** | P2 | — | Course quiz | No retake after submit | Local `quizSubmitted` latch | Retake flow if allowed | `CoursePlayerPage.tsx` | M |
| **AUDIT-STU-032** | P2 | — | Architecture | `AssessmentPlayer` (v2) not on any route | KI-020 | Mount or remove | `assessment-platform/` | L |
| **AUDIT-STU-033** | P2 | — | Architecture | No unified student assessment dashboard | KI-021 | A4/A6 scope | — | L |
| **AUDIT-STU-034** | P3 | — | Join API | `joinLiveSession()` REST never called from UI | WS-only join | Use for guest name entry if needed | `api.ts` | M |

---

## Phase 7 — Design consistency

### Theme fragmentation

| Surface | Visual language | Issue |
|---------|-----------------|-------|
| Assessment Hub | Light cards, standard shadcn | Baseline |
| Quiz Room wizard | Dark glass (`border-white/10`, `text-white`) | **Major drift** from hub |
| AI Assessment Studio | Dark slate (`slate-950`, white/10 borders) | Matches wizard, not hub |
| Quiz builder studio | Light editor + side panels | Close to hub |
| Live player | Gradient `muted/30`, emerald/red feedback | Acceptable immersive mode |
| Host waiting room | Light cards + fake metric colors | Mixed with wizard room invite cards |

| ID | Sev | Issue | Root cause | Recommended fix | Files | Effort |
|----|:---:|-------|------------|-----------------|-------|:------:|
| **AUDIT-DESIGN-001** | P1 | Two parallel dark vs light instructor themes | Wizard/AI built as separate “premium” shell | Adopt hub light theme OR promote dark as unified “Studio chrome” with shared tokens | Wizard steps, `AiAssessmentStudio`, hub | L |
| **AUDIT-DESIGN-002** | P2 | Inconsistent primary CTA labels (Create Assessment / Create Quiz / Launch) | Copy drift | Shared `ASSESSMENT_COPY` constants | Hub, wizard, builder headers | S |
| **AUDIT-DESIGN-003** | P2 | Status colors: live player uses emerald/red; course quiz uses green-500; results use amber primary | No shared semantic tokens | `assessment-status` CSS vars: correct, incorrect, warning | Live + course components | M |
| **AUDIT-DESIGN-004** | P2 | Card radius mix: `rounded-xl` vs `rounded-2xl` without semantic reason | Organic growth | Document: `2xl` = hero cards, `xl` = nested | All assessment components | M |
| **AUDIT-DESIGN-005** | P2 | Loading patterns differ: pulse skeleton, `Loader2`, bounce dots, plain text | No shared loading component | `AssessmentLoadingState` with size variants | Player, hub, host | M |
| **AUDIT-DESIGN-006** | P2 | Empty states: some dashed border cards, some plain text | Inconsistent | Shared `AssessmentEmptyState` | Hub tabs, bank, reports | S |
| **AUDIT-DESIGN-007** | P2 | Button variants: purple Retake (`QuizResultsPage`) vs primary elsewhere | One-off styling | Use `Button variant="default"` | `QuizResultsPage.tsx` | S |
| **AUDIT-DESIGN-008** | P3 | Icon set consistent (lucide) but sizes vary `h-3.5`–`h-6` without scale system | — | Standardize sm/md/lg icon classes | Live header, feedback, hub | S |
| **AUDIT-DESIGN-009** | P3 | Framer Motion on live player only; hub/wizard mostly static | — | Subtle shared transitions on tab switch | Hub, wizard | M |
| **AUDIT-DESIGN-010** | P2 | Duplicate components: `AiStudioPanel` in hub AND quiz-builder; two `AiAssessmentStudio` entry points | Parallel implementations | Single `AiStudioPanel` export | `assessment-hub/`, `quiz-builder/studio/` | M |
| **AUDIT-DESIGN-011** | P2 | `PremiumQuizCard` vs hub `Card` list — different quiz list visuals | — | One card component | `PremiumQuizCard.tsx`, hub | M |
| **AUDIT-DESIGN-012** | P3 | Wizard `ToggleCard` custom vs shadcn `Switch` in settings tab | — | Unify on shadcn Switch | `RoomSettingsStep.tsx`, `QuizRoomSettingsForm.tsx` | S |
| **AUDIT-DESIGN-013** | P2 | Feedback `StatPill` vs results `ResultStat` — same data, different layouts | — | Shared `AssessmentStatTile` | `LiveAnswerFeedback.tsx`, `LiveStudentResults.tsx` | M |
| **AUDIT-DESIGN-014** | P3 | Typography: `font-black` headlines in live/results vs `font-bold` in hub | Intentional energy for player? | Document type scale | Platform-wide | S |
| **AUDIT-DESIGN-015** | P2 | Error patterns: toast-only vs inline banner vs dialog — unpredictable | — | Severity matrix: inline for recoverable, dialog for blocking | All assessment flows | M |

### Shared component targets (post-audit implementation)

```
components/assessment-ui/
  AssessmentCard.tsx
  AssessmentEmptyState.tsx
  AssessmentLoadingState.tsx
  AssessmentStatTile.tsx
  AssessmentStatusBanner.tsx
  assessmentTokens.css
```

---

## Implementation waves (recommended)

### Wave 0 — Trust (P0) — ~3 days

- [ ] AUDIT-DATA-001, DATA-002, DATA-003
- [ ] Manual PAT: 8-question live session, verify no IDs/placeholders on feedback

### Wave 1 — Live player correctness (P1) — ~4 days

- [ ] AUDIT-DATA-004, LIVE-001, LIVE-002, LIVE-004, LIVE-013
- [ ] AUDIT-SCORE-001, SCORE-002, SCORE-003, SCORE-004
- [ ] AUDIT-STU-002, STU-004
- [ ] Redesign feedback card per Phase 4 target table

### Wave 2 — Instructor trust (P1) — ~3 days

- [ ] AUDIT-INSTR-012, 017, 029, 038
- [ ] AUDIT-INSTR-008, 009

### Wave 3 — Score integrity (P1) — ~2 days

- [ ] AUDIT-SCORE-007
- [ ] Unit tests for `calculateLivePoints`, `buildLeaderboard`, resubmit accounting

### Wave 4 — Polish & consistency (P2) — ongoing

- [ ] Design tokens (AUDIT-DESIGN-001–007)
- [ ] Course quiz parity (AUDIT-STU-023–025)
- [ ] Hide unfinished surfaces (Homework tab, Phase B bank, host stubs)

### Wave 5 — Architecture (deferred)

- [ ] AUDIT-STU-032, STU-033
- [ ] A1.7 Phase 3+ per roadmap
- [ ] A2 Homework (only after Waves 0–3 sign-off)

---

## Test plan (sign-off checklist)

### Instructor PAT

- [ ] Create assessment via manual, import, AI (online), duplicate from My Assessments
- [ ] Builder validation blocks host when invalid
- [ ] Launch self-paced live → host sees accurate participant count (no fake health)
- [ ] Complete session → export/homework stubs hidden or functional
- [ ] Reports show human-readable durations

### Student PAT

- [ ] Join via code → lobby copy matches pace mode
- [ ] Answer correct + incorrect → feedback shows **Your answer**, **Correct answer** (text), points delta, score, streak, accuracy, time, question #
- [ ] No database IDs, enums, or placeholder explanations visible
- [ ] Self-paced auto-advance within 3s; no “instructor advances” copy
- [ ] Refresh mid-quiz → restore to correct question and feedback state
- [ ] Results screen accurate; history link includes live sessions
- [ ] Course quiz: markdown stems, explanations, validation on submit

### Score PAT

- [ ] 10-question session: hand-verify score, XP, accuracy, rank after each answer
- [ ] Negative marking session: wrong answer shows penalty
- [ ] Tie scenario: rank behavior documented
- [ ] `multipleAttempts` resubmit: net score unchanged if same result

---

## Related documents

| Doc | Role |
|-----|------|
| [ASSESSMENT-ROADMAP.md](./ASSESSMENT-ROADMAP.md) | Feature sequencing; A2 blocked |
| [LIVE-MODE-REDESIGN.md](./LIVE-MODE-REDESIGN.md) | Pace strategy canonical spec |
| [A1.7-PHASE2-SELFPACED.md](./A1.7-PHASE2-SELFPACED.md) | Self-paced implementation notes |
| [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) | Living issue tracker — sync P0/P1 from this audit |

---

## Audit methodology

- Static code review across `frontend/src/{live-session,quiz-room,quiz-builder,assessment-hub,ai-assessment-studio}`, `backend/src/{services/liveSession,services/quizGradingService,ws,liveSession}`
- Cross-reference with [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) and A1.7 Phase 2 docs
- Screenshot A validation against live player render path
- **No code changes** made during this audit

---

*End of audit. Awaiting product sign-off on Wave 0 scope before implementation.*
