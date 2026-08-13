# THE GATEHUB — Assessment Platform Gap Analysis

> **Audit date:** July 4, 2026  
> **Scope:** Complete inventory of the existing Quiz ecosystem vs Phase 0–5 architecture  
> **Status:** Audit complete — **no implementation code written**  
> **Next step:** Await approval before resuming development

---

## Executive Summary

THE GATEHUB has **three parallel assessment stacks** operating simultaneously:

| Stack | Maturity | Production traffic |
|-------|----------|-------------------|
| **Legacy course quiz** (`Quiz`, `/api/quizzes`) | Functional, narrow | Course player, lecture quizzes |
| **Quiz Room + Premium Builder** (`Quiz` + `LiveSession`, `/api/quiz-builder`, `/api/live-sessions`) | **Most mature product surface** | Instructor quiz-room, live play |
| **Assessment Studio bank** (`BankQuestion`, `/api/assessment-studio`) | Strong authoring/import | Wizard flows only (standalone page redirected) |
| **Assessment Platform v2** (`AssessQuestion`, `/api/v2`) | **Authoring APIs only** | None — no player, attempts, or deployments |

**Architecture (Modules 01–05) is ahead of the product.** The v2 Universal Player (`AssessmentPlayer`) is built but **not mounted on any route** and has **no backend attempt API**. The operational product is still the legacy + Quiz Room stack.

**Recommendation:** Fix existing product gaps and wire migration adapters **before** continuing Phase 1 modules 06–14. Otherwise new engine work will not reach users.

---

## Step 1 — Complete Inventory

### 1.1 Frontend Pages & Routes

| Route | File | Status | Notes |
|-------|------|--------|-------|
| `/instructor/quiz-room` | `QuizRoomDashboardPage.tsx` | ✓ Implemented | Tabs: Quizzes, Live, Reports, Templates, Settings |
| `/instructor/quiz-room/create` | `QuizRoomWizard.tsx` | ✓ Implemented | Manual, import, AI, duplicate, templates |
| `/instructor/quiz-room/quizzes/:quizId/edit` | `QuizRoomQuizBuilderPage.tsx` | ◐ Partial | 22-type editor; AI assist stubbed; players support subset |
| `/instructor/quiz-room/:sessionId/edit` | `QuizRoomEditPage.tsx` | ✓ Implemented | Schedule, settings, launch |
| `/instructor/quiz-room/:sessionId/host` | `LiveSessionHostPage.tsx` | ◐ Partial | Start/next/finish; no pause; lobby chat placeholder |
| `/instructor/course/.../lectures/.../quiz` | `QuizBuilderPage.tsx` (legacy) | ✓ Implemented | 4 types only; separate from premium studio |
| `/instructor/assessment-studio` | Redirect → quiz-room | ✗ Broken | Full UI exists but unreachable |
| `/instructor/assessment-studio/*` | Redirect | ✗ Broken | `QuestionEditorPage` orphaned |
| `/student/quiz-results` | `QuizResultsPage.tsx` | ◐ Partial | List only; Retake button dead |
| `/student/live/join` | `LiveSessionJoinPage.tsx` | ✓ Implemented | PIN/code lookup |
| `/live/play/:sessionId` | `LiveSessionPlayerPage.tsx` | ◐ Partial | MCQ/multi-select only |
| `/live/display/:sessionId` | `LiveLeaderboardDisplayPage.tsx` | ✓ Implemented | Projector leaderboard |
| `/student/course/:id/learn` | `CoursePlayerPage.tsx` | ◐ Partial | Inline quiz; duplicates shared block |
| `/student/learning-universe/.../learn` | LU player | ◐ Partial | Client-side MCQ only |
| **v2 Assessment Player** | `AssessmentPlayer.tsx` | ◌ Placeholder | Bootstrapped; **no route** |
| **Homework tab** | Dashboard tab | ◌ Placeholder | "Coming in the next update" |
| **Instructor dashboard quiz widgets** | — | ✗ Missing | Nav-only entry points |
| **Student dashboard quiz widgets** | — | ✗ Missing | Nav-only |

### 1.2 Frontend Component Areas

| Area | Key path | Status |
|------|----------|--------|
| Quiz Room wizard | `components/quiz-room/wizard/` | ✓ Implemented (5 orphan steps unused) |
| Quiz Builder studio | `components/quiz-builder/studio/` | ◐ Partial |
| Live session UI | `components/live-session/` | ◐ Partial |
| Waiting room | `WaitingRoomPanel.tsx` | ◐ Partial — copy link/PIN/QR ✓; chat/announcements placeholder |
| Assessment Studio UI | `pages/instructor/assessment-studio/` | ✗ Broken (redirected) |
| AI Assessment Studio | `components/ai-assessment-studio/` | ✓ Implemented (via wizard) |
| Import wizard | `components/assessment-studio/ImportWizard.tsx` | ✓ Implemented |
| Course quiz block | `CourseLectureQuizBlock.tsx` | ✓ Implemented (not used in CoursePlayerPage) |
| v2 Renderer framework | `frontend/src/assessment-platform/` | ◐ Framework only |

### 1.3 Backend API Stacks

#### Legacy `/api/quizzes`

| Endpoint | Status |
|----------|--------|
| CRUD + submit | ◐ Partial — **no ownership check on PUT**; short_answer ungraded |
| `/my/attempts` | ✓ Implemented |

#### `/api/quiz-builder`

| Endpoint | Status |
|----------|--------|
| Full CRUD, validate, duplicate, archive, versions | ✓ Implemented |

#### `/api/live-sessions`

| Endpoint | Status |
|----------|--------|
| Room CRUD, launch, duplicate, templates, preferences | ✓ Implemented |
| Host controls (start/next/finish) | ✓ Implemented |
| Analytics, reports | ◐ Partial — summary only |
| `/history` (participant) | ✓ API exists; **FE never calls it** |
| Pause / resume / kick | ✗ Missing |
| REST host + WS sync | ✗ Broken — HTTP host actions don't WS broadcast |

#### `/api/assessment-studio`

| Endpoint | Status |
|----------|--------|
| Bank CRUD, collections, import, AI jobs | ✓ Implemented |
| `/ai/generate` (simple) | ◌ Stub (template strings) |
| `/ai/generate-assessment` | ✓ Real async pipeline |

#### `/api/v2/assessments` + `/api/v2/questions`

| Area | Status |
|------|--------|
| Question platform CRUD, collections, import | ✓ Implemented |
| Assessment metadata + lifecycle + publish | ◐ Partial — **no API to add items to assessment** |
| Deployments, attempts, live, homework | ✗ Missing |
| Player bootstrap API | ✗ Missing |

### 1.4 Database Models (Quiz-related)

| Model group | Wired to product? |
|-------------|-------------------|
| `Quiz`, `Question`, `Option`, `QuizAttempt`, `QuizVersion` | ✓ Yes |
| `LiveSession`, `LiveParticipant`, `LiveAnswer`, `SessionAnalytics` | ✓ Yes |
| `BankQuestion*` (studio bank) | ✓ Yes (wizard/import) |
| `AssessQuestion*`, `Assessment*`, `AssessmentVersion` | ◐ Authoring only |
| `AssessmentDeployment`, `AssessmentAttempt`, `AssessLiveRoom` | ✗ Schema only |
| `UserGamificationProfile`, XP/coins/badges | ✗ Schema only |
| `HomeworkAssignment`, `CourseAssignment` | ✗ Schema only |

### 1.5 WebSocket Events (`/live-sessions/ws/:sessionId`)

| Direction | Events | Status |
|-----------|--------|--------|
| Server → client | connected, session_state, leaderboard, answer_result, session_started/finished | ✓ |
| Client → server | answer, host:start, host:next, host:finish, ping | ✓ |
| Missing | pause, resume, kick, team mode, reconnect token | ✗ |

---

## Step 2 — Instructor End-to-End Workflow Audit

```
Create Quiz → Edit → Publish → Host Live → Student Join → Play → End → Reports → Reuse → Homework → Analytics → History → Archive
```

| Step | Status | Finding |
|------|--------|---------|
| **Create quiz** | ✓ | Wizard: manual, import, AI, duplicate, template |
| **Edit quiz** | ◐ | Premium studio (22 types in editor); legacy course editor separate |
| **Publish** | ◐ | Quiz-builder save = published to DB; no formal review gate for live |
| **Host live** | ✓ | "Host Live" → create room from quiz → launch → host page |
| **Host same quiz again** | ✓ | New room per session via create wizard + `quizId` |
| **Student join** | ✓ | PIN/code, QR, join URL copy in waiting room |
| **Play session** | ◐ | MCQ/multi-select in live player only |
| **End session** | ✓ | Host finish → analytics + QuizAttempt per participant |
| **Reports** | ◐ | Summary cards only — no drill-down, no export |
| **Reuse quiz** | ✓ | Duplicate quiz, duplicate room, templates |
| **Homework** | ✗ | Tab placeholder; no assign/share/resubmit |
| **Analytics** | ◐ | Live analytics panel during session; post-hoc summary |
| **Session history** | ◐ | Live tab lists all rooms; no dedicated timeline view |
| **Archive** | ✓ | Quiz archive via quiz-builder; room delete |

### Instructor capability checklist

| Capability | Status |
|------------|--------|
| Host same quiz multiple times | ✓ New room each time |
| Copy live link | ✓ WaitingRoomPanel |
| Copy PIN / room code | ✓ |
| Generate fresh join code | ◐ New launch only; **no regenerate on active room** |
| View previous sessions | ◐ Live tab + Reports tab (finished only) |
| Reopen homework | ✗ Not built |
| Share homework link | ✗ Not built |
| Duplicate live session | ✓ `duplicateQuizRoom` |
| Schedule quiz | ✓ `scheduledAt` on room edit |
| Export reports | ✗ |
| Compare two sessions | ✗ |
| Replay student answers | ✗ |
| See each student's answers | ✗ |
| Question-wise analytics | ◐ Backend stores `questionStats`; **no FE drill-down** |
| Filter by section | ✗ |
| Search participants | ✗ |
| Remove participant | ✗ |
| Manually award marks | ✗ |
| Manually end session | ✓ Host finish |
| Pause session | ✗ Status exists in types; no API/UI |
| Resume session | ✗ |
| Restart session | ✗ |
| Archive session | ◐ Delete room; no archive state |
| Delete session | ✓ |
| Clone assessment | ✓ Quiz duplicate + room duplicate |

---

## Step 3 — Student Workflow Audit

```
Join → Waiting Room → Quiz → Feedback → Leaderboard → Results → History → Review → Achievements → Dashboard
```

| Step | Status | Finding |
|------|--------|---------|
| **Join** | ✓ | `/student/live/join` + direct link |
| **Waiting room** | ✓ | Lobby state in live player |
| **Quiz / answer** | ◐ | MCQ/multi-select; timer; immediate feedback |
| **Feedback** | ✓ | Per-answer result via WS |
| **Leaderboard** | ✓ | Live + finish screen + projector |
| **Results** | ◐ | Finish screen; link to quiz history |
| **History** | ◐ | `/student/quiz-results` — course-grouped list |
| **Review answers** | ✗ | No post-session answer review UI |
| **Retake** | ✗ | Button shown; **no handler** |
| **Achievements / XP** | ◐ | XP shown on live finish; **not synced to platform gamification** |
| **Badges** | ◐ | Live streak badges in leaderboard only |
| **Dashboard widgets** | ✗ | No quiz summary on student dashboard |
| **Certificates** | ✗ | Course certificates only; not quiz-specific |
| **Resume unfinished assessment** | ✗ | No in-progress attempt persistence for live or course |
| **Homework submit** | ✗ | Not built |

### Student API usage

| API | Used? |
|-----|-------|
| `POST /live-sessions/:id/join` | ✗ FE uses WS connect only |
| `GET /live-sessions/history` | ✗ Defined in API client; never called |
| `POST /quizzes/:id/submit` | ✓ Course player |
| `GET /quizzes/my/attempts` | ✓ Quiz results page |

---

## Step 4 — Reports Audit

| Report type | Status | Notes |
|-------------|--------|-------|
| Overall session report | ◐ | Reports tab: accuracy, avg time, participant count |
| Per-student report | ✗ | No UI |
| Per-question report | ◐ | `SessionAnalytics.questionStats` stored; no FE |
| Accuracy | ◐ | Session-level only |
| Time spent | ◐ | avg ms only |
| Weak topics | ✗ | |
| Bloom analysis | ✗ | Bloom in builder metadata; not in reports |
| Difficulty analysis | ✗ | |
| XP earned | ◐ | Live participant only |
| Leaderboard history | ◐ | Snapshots in DB; no history UI |
| Attendance | ✗ | Participant count only |
| Attempt history | ◐ | Quiz results list; no live-session detail |
| Export PDF | ✗ | |
| Export Excel | ✗ | |
| Export CSV | ✗ | |
| Quiz builder JSON export | ✓ | Bulk export in studio only |

---

## Step 5 — UI Audit

| Issue | Location | Severity |
|-------|----------|----------|
| Assessment Studio redirect breaks internal links | `App.tsx`, studio pages | **Critical** |
| Retake button dead | `QuizResultsPage.tsx` | High |
| Homework tab placeholder | `QuizRoomDashboardPage.tsx` | High |
| AI assist stubs (Phase 6) | `QuestionAiAssist`, `AiStudioPanel` | Medium |
| Lobby chat/announcements placeholder | `WaitingRoomPanel.tsx` | Medium |
| Orphan wizard steps never shown | `WelcomeStep`, `CoursePickerStep`, etc. | Low |
| `RoomInvitePanel`, `StudentPreviewStudio` unused | quiz-room components | Low |
| Course player duplicates quiz block | `CoursePlayerPage.tsx` | Medium |
| 22 builder types vs ~2 live player types | Type mismatch | **Critical** |
| v2 player invisible to users | No route | High |
| Assessment Studio templates/settings tabs | Static "coming soon" | Medium |
| No loading skeleton on reports tab | Minor | Low |
| Empty states | Generally present on dashboard tabs | OK |

### Accessibility & responsive

| Area | Status |
|------|--------|
| Live player keyboard/ARIA | ◐ Basic buttons; not full WCAG audit |
| v2 player a11y contract | ✓ Designed; not in production path |
| Mobile live host/player | ◐ Responsive layouts present; not verified E2E |
| High contrast / font scaling | ✗ Not in legacy players |

---

## Step 6 — Legacy vs New Platform

### Duplicate functionality

| Capability | Legacy | Studio bank | v2 platform |
|------------|--------|-------------|-------------|
| Question authoring | ✓ | ✓ | ✓ |
| Collections | quiz sections | bank collections | v2 collections |
| Versioning | QuizVersion | BankQuestionVersion | AssessQuestionVersion |
| Import | — | ✓ full pipeline | batch JSON only |
| Self-paced player | course player | materialize → legacy | **none** |
| Live player | LiveSession + WS | uses legacy Quiz | **none** |

### Migration bridges (schema exists, code does not)

- `Assessment.legacyQuizId` — unused  
- `AssessQuestion.legacyBankId` / `legacyQuizQId` — unused  
- `AssessmentDeployment.legacySessionId` — unused  

### Pages on legacy APIs

- Course player, legacy lecture quiz editor, live sessions, quiz-builder, quiz results

### Pages on v2 APIs

- **None in production UI** (validation scripts only)

### Unused / orphaned

- `AssessmentStudioPage`, `QuestionEditorPage`
- `AssessmentPlayer` (v2)
- `listLiveSessionHistory`, `joinLiveSession` (FE)
- `createLiveSession` legacy controller method
- Platform gamification models

### Migration blockers

1. No v2 attempt engine or player API  
2. No adapter: `Quiz` → `Assessment`  
3. No adapter: `LiveSession` → `AssessmentDeployment`  
4. Premium builder types not in live/course renderers  
5. Three question stores with no sync  

---

## Step 7 — Gap Report Table

| # | Feature | Current Status | Problem | Impact | Priority | Dependencies | Effort | Recommendation |
|---|---------|----------------|---------|--------|----------|--------------|--------|----------------|
| G01 | v2 player in production | Framework only | No route, no attempt API | New architecture invisible to users | **Critical** | Module 06–07 | L | Pause v2 feature modules; wire player after attempt API |
| G02 | Assessment item API | Missing | Cannot add questions to v2 assessments | Publish broken without DB hacks | **Critical** | Module 03 extension | M | Add section/item CRUD before more v2 work |
| G03 | Live player type coverage | Partial (2/22) | Builder promises 22 types; live supports MCQ/MS | Broken quizzes in live mode | **Critical** | Renderer registry OR legacy adapter | L | Map live player to renderer registry or restrict builder types per mode |
| G04 | Assessment Studio routes | Broken | Redirect kills standalone bank UI | Bank management only via wizard | **Critical** | Routing fix | S | Restore routes or merge bank tab into quiz-room |
| G05 | REST/WS host sync | Broken | HTTP start/next/finish no WS broadcast | Host on REST breaks live players | **Critical** | liveSessionService | S | Unify host actions through WS or broadcast after REST |
| G06 | Legacy quiz authorization | Missing | Any user can PUT any quiz | Security | **Critical** | quizzesController | S | Add ownership checks |
| G07 | Homework mode | Placeholder | Tab empty; no backend | Major product promise unfulfilled | **High** | Deployment + assignment models | L | Implement after attempt engine |
| G08 | Student answer review | Missing | No post-quiz review UI | Poor learning value | **High** | Attempt detail API | M | Add review mode to results |
| G09 | Retake quiz | Broken UI | Button with no handler | User frustration | **High** | Attempt limits policy | S | Wire retake or remove button |
| G10 | Report drill-down & export | Missing | Summary cards only | Instructors can't act on data | **High** | Analytics queries | L | Per-student, per-question views + CSV |
| G11 | Question-wise analytics UI | Partial | Data in DB, no FE | Can't improve questions | **High** | Reports UI | M | Surface `questionStats` |
| G12 | Session comparison | Missing | — | No institutional insights | Medium | Reports | M | Compare sessions API + UI |
| G13 | Pause / resume live | Missing | Status in schema only | Host control gap | Medium | WS + service | M | Implement or remove from schema |
| G14 | Participant management | Missing | No kick/search | Classroom control gap | Medium | liveSessionService | M | Kick, search, filter |
| G15 | Regenerate join code | Missing | New room only | Security/convenience | Medium | quizRoomService | S | Regenerate PIN on relaunch |
| G16 | Student live history API | Unused | FE never calls `/history` | Missed feature | Medium | QuizResultsPage | S | Wire participant history |
| G17 | Course quiz → progress | Missing | Submit doesn't update lecture progress | Completion broken | **High** | enrollments/progress | M | Integrate submit with progress |
| G18 | short_answer grading | Missing | Accepted but never graded | Wrong scores | **High** | quizGradingService | M | Grade or reject type |
| G19 | randomizeQuestions stability | Bug | Reshuffle on every state build | Wrong question index | **High** | liveSessionService | S | Seed shuffle per session |
| G20 | Platform gamification sync | Missing | XP on LiveParticipant only | No cross-mode XP/badges | Medium | Module 08 + schema | L | Sync to UserGamificationProfile |
| G21 | AI per-question assist | Stub | Phase 6 placeholder | Builder expectation gap | Medium | AI service | M | Implement or hide UI |
| G22 | Lobby chat / announcements | Placeholder | Phase 2 stub | Engagement feature | Low | WS messages | M | Implement or remove UI |
| G23 | Duplicate course vs premium builder | Partial | Two editors, two UX paths | Confusion | Medium | Migration | L | Consolidate on premium studio |
| G24 | CoursePlayer uses shared block | Partial | Inline duplicate | Maintenance burden | Medium | Refactor | S | Use `CourseLectureQuizBlock` |
| G25 | v2 ↔ legacy migration adapters | Missing | Module 12 not started | Dual maintenance forever | **High** | Module 12 | L | Prioritize after attempt engine |
| G26 | `/live-sessions/question-bank` | Misnamed | Returns course quizzes not bank | Wrong data for bank source | Medium | quizRoomService | S | Fix or rename endpoint |
| G27 | Manual marks / replay | Missing | — | Instructor tooling | Low | Attempt admin API | L | Post-MVP |
| G28 | Bloom/difficulty reports | Missing | Metadata exists | Placement/mock test gap | Low | Analytics pipeline | L | Reporting phase |
| G29 | Accessibility (legacy players) | Partial | No WCAG contract | Compliance risk | Medium | Module 05 integration | M | Adopt v2 shell for live |
| G30 | Certificates for quiz mastery | Missing | Course-only certs | — | Low | Certificates service | L | Future |

**Effort key:** S = days, M = 1–2 weeks, L = multi-week

---

## Step 8 — Implementation Backlog (Reordered)

Development should **fix production gaps before building new v2 modules**. Proposed order:

### Critical (do first)

| ID | Task |
|----|------|
| C1 | Fix legacy quiz PUT authorization (G06) |
| C2 | Fix live session question shuffle seed bug (G19) |
| C3 | Fix REST host actions → WS broadcast (G05) |
| C4 | Restore Assessment Studio routes OR integrate bank into quiz-room (G04) |
| C5 | Align live/course player with builder question types — minimum viable matrix (G03) |
| C6 | Add v2 assessment section/item APIs so publish works (G02) |

### High (production readiness)

| ID | Task |
|----|------|
| H1 | Module 06 Attempt Engine — **required before v2 player goes live** (G01) |
| H2 | Wire retake or remove dead button (G09) |
| H3 | Quiz submit → course progress integration (G17) |
| H4 | Grade short_answer or block in UI (G18) |
| H5 | Report drill-down: per-student, per-question (G08, G10, G11) |
| H6 | Homework deployment mode — minimal MVP (G07) |
| H7 | Student answer review page (G08) |
| H8 | Migration adapters sketch: Quiz → Assessment (G25) |

### Medium (polish & parity)

| ID | Task |
|----|------|
| M1 | Participant kick/search (G14) |
| M2 | Pause/resume live or remove from schema (G13) |
| M3 | Wire student live history API (G16) |
| M4 | Session comparison reports (G12) |
| M5 | Regenerate join code (G15) |
| M6 | Consolidate course player on shared quiz block (G24) |
| M7 | Platform gamification sync from live (G20) |
| M8 | Mount v2 AssessmentPlayer on feature-flagged route (G01) |

### Low (defer)

| ID | Task |
|----|------|
| L1 | Lobby chat / announcements (G22) |
| L2 | AI per-question assist (G21) |
| L3 | Bloom/difficulty report suite (G28) |
| L4 | Quiz-specific certificates (G30) |
| L5 | Manual marks / replay (G27) |
| L6 | Orphan wizard cleanup (G04 related) |

### Phase 1 module sequence (revised)

| Original # | Module | Revised priority |
|------------|--------|------------------|
| — | **Gap fixes C1–C6** | **Before Module 06** |
| 6 | Attempt Engine | Next (after critical fixes) |
| 7 | (was Assessment Player) | Merge with v2 player wiring |
| 8 | Scoring Engine | After attempts |
| 9–11 | Practice/Homework/Assignment | After deployments exist |
| 12 | Migration Adapters | Elevated — start parallel after Module 06 |
| 13 | Regression testing | Continuous |
| 5 | Universal Renderer | **Integrate into live/course players** before new modes |

---

## Step 9 — Architecture vs Product Maturity

| Layer | Architecture doc | Product reality |
|-------|------------------|-----------------|
| Domain models (M01) | ✓ Complete | ✓ Reflected in v2 code |
| Database (M02) | ✓ Complete | ✓ Migrated; runtime uses subset |
| Assessment service (M03) | ✓ API | ◐ No item editing |
| Question service (M04) | ✓ API | ✓ Not used by UI |
| Renderer framework (M05) | ✓ Framework | ✗ Not integrated |
| Live quiz product | Not in Phase 1 modules | ✓ **Most complete user-facing feature** |
| Quiz Room dashboard | Not documented as module | ✓ **Primary instructor hub** |

---

## Success Criteria for "Production Ready"

Before declaring the Assessment Platform production-ready:

- [ ] One question store strategy with migration path (not three silos)
- [ ] All builder question types render in target mode (live, course, homework)
- [ ] Instructor can host → report → export → reuse without dead ends
- [ ] Student can join → play → review → retake (where allowed)
- [ ] Homework assign + share + submit works
- [ ] No broken routes or dead buttons
- [ ] v2 player connected to attempt API OR legacy clearly maintained with adapters scheduled
- [ ] Security: ownership checks on all write paths
- [ ] Live host controls reliable over WS

---

## Approval Gate

**Audit complete.** No code was written during this audit.

**Awaiting your approval** on:

1. Backlog priority (Critical fixes before Module 06?)  
2. Assessment Studio route restoration vs merge into Quiz Room  
3. Live player strategy: extend legacy `LiveQuestionDisplay` vs migrate to v2 `AssessmentPlayer`  
4. Whether to pause v2 module progression until Critical items C1–C6 are done  

Once approved, development can resume on the agreed backlog order.
