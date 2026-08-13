# THE GATEHUB — Production Migration & Implementation Plan

> **Status:** Approved — Phase A in progress (A1.3 complete)  
> **Last updated:** July 6, 2026  
> **Based on:** [ASSESSMENT-GAP-ANALYSIS.md](./ASSESSMENT-GAP-ANALYSIS.md)

---

## 1. Strategy

Build a **production-ready Assessment Platform** — every change improves what instructors and students use today. v2 architecture connects **incrementally behind feature flags** after Phase A product completion.

| Principle | Rule |
|-----------|------|
| Never break existing functionality | Regression tests per feature |
| Never remove working features | Deprecate with flags |
| Migrate incrementally | Legacy → Adapter → Dual Read → Dual Write → Canonical → Legacy Removal |
| Immediately usable | No backend-only drops without UI |
| One instructor workspace | Quiz Room becomes **Assessment Hub** |

---

## 2. Assessment Hub Navigation (Target)

```
Assessment Hub  (/instructor/quiz-room)

├── My Assessments      (tab: quizzes — rename in UX pass)
├── Question Bank       (tab: bank — merged Assessment Studio)
├── Live Sessions       (tab: live)
├── Homework            (tab: homework)
├── Reports             (tab: reports)
├── Templates           (tab: templates)
├── AI Studio           (tab: ai — or sub-section of bank)
├── Settings            (tab: settings)
```

Legacy redirect: `/instructor/assessment-studio` → `/instructor/quiz-room?tab=bank`

---

## 3. Assessment Studio — Option B Approved

Merge Question Bank into Quiz Room. One workspace; no "Quiz Room vs Assessment Studio" confusion.

---

## 4. Deployment Mode UX (Homework + Live)

Every assessment answers three questions immediately:

1. **Can I host this live?**
2. **Can I assign this as homework?**
3. **Can I see how students performed?**

Same assessment, different deployment:

| Action | Mode |
|--------|------|
| Host Live | `live_quiz` deployment |
| Assign Homework | `homework` deployment |
| Practice | `practice` deployment |
| Preview | read-only player |

Phase A2 (Homework) UI reflects deployment concept even if backend initially uses legacy `Quiz` + `HomeworkAssignment`.

---

## 5. Phase A — Execution Order (Approved)

| # | Feature | Focus |
|---|---------|-------|
| **A0** | Critical Stability | Auth, shuffle, WS sync, short_answer grading |
| **A1** | Question Bank | Merge Studio into Assessment Hub |
| **A2** | Homework | Deployment mode — assign, link, due, attempts |
| **A3** | Session History | Full instructor session list + actions |
| **A4** | Reports + AI Insights | Drill-down, export, AI placeholders |
| **A5** | Question Compatibility | Builder ↔ player matrix |
| **A6** | Student Review | Attempt detail, retake, bookmarks |
| **A7** | Assessment Dashboard | Per-assessment hub page |

**After each feature:** docs, tests, migration notes, BC verification, **stop for review**.

---

## 6. Phase A Feature Specifications

### A0 — Critical Stability

- Legacy quiz PUT/addQuestion ownership checks
- Live session question order frozen at start (shuffle bug)
- REST host start/next/finish broadcasts to WebSocket clients
- `short_answer` / `fill_blank` text grading via shared `gradeAnswer`

### A1 — Question Bank

- Tab `bank` on Assessment Hub embedding `AssessmentStudioPanel`
- Routes: `/instructor/quiz-room/bank/questions/:id`
- Redirects from `/instructor/assessment-studio/*`

### A2 — Homework

- Homework as deployment mode (UI from day one)
- Assign, share link, due date, max attempts
- MVP on legacy `HomeworkAssignment` + quiz submit
- Enhanced: late policy, reopen, close, analytics

### A3 — Session History

Per session: Session ID, Date, Duration, Participants, Avg Accuracy, Avg Score, Completion Rate, Join Code, Host, Created From (assessment version).

Actions: View Report, View Participants, View Questions, Replay, Export, Duplicate, Host Again, Assign as Homework, Archive, Delete.

### A4 — Reports

Overall, per-student, per-question, answer distribution, time, difficulty, Bloom, weak/strong concepts, leaderboard history, attendance.

Exports: PDF, Excel, CSV.

**AI Insights panel** (placeholders OK initially): Hardest Question, Easiest Question, Students Needing Attention, Weak/Strong Concepts, Recommended Follow-up, Suggested Remediation.

### A5 — Question Compatibility

Capability matrix per type × mode. Builder validation warns before live host. Unsupported types blocked or flagged.

### A6 — Student Review

Attempt detail, explanations, correct answers, mistakes, improvement chart, retake, bookmark.

### A7 — Assessment Dashboard (Before Phase B)

Central page per assessment, e.g. `/instructor/quiz-room/assessments/:quizId`

**Header stats:** Status, Live Sessions count, Homework count, Students, Attempts, Avg Score, Avg Accuracy, Question Health, Difficulty, Last Used, Created By.

**Tabs:** Overview | Live Sessions | Homework | Reports | Question Analysis | Student Attempts | Versions | Settings

Primary actions always visible: **Host Live** | **Assign Homework** | **Preview**

---

## 7. Phase B — Connect v2 Platform (After Phase A)

```
Question Service (UI sync)
  ↓
Assessment Service (+ item API)
  ↓
Universal Player (feature flag: assessmentPlatform.enabled)
  ↓
Attempt Engine (dual-write)
  ↓
Analytics
  ↓
Gamification
  ↓
AI
```

**Live player:** `AssessmentPlayer` + Renderer Registry — legacy `LiveQuestionDisplay` maintenance only.

---

## 8. Question Store Migration (No Forced Merge in Phase A)

```
Legacy (Question / BankQuestion)
  ↓ Adapter
  ↓ Dual Read
  ↓ Dual Write
  ↓ Canonical (AssessQuestion)
  ↓ Legacy Removal
```

---

## 9. Feature Documentation Structure

```
docs/
  ASSESSMENT-GAP-ANALYSIS.md
  ASSESSMENT-PRODUCTION-MIGRATION-PLAN.md  (this file)
  features/
    A0-critical-stability.md
    A1-question-bank.md
    ...
  migration/
    question-store-migration.md
    live-player-flag.md
```

---

## 10. Progress Tracker

| Feature | Status |
|---------|--------|
| A0 Critical Stability | ✅ Approved |
| A1 Question Bank | ✅ Approved |
| A1.1 Live Player Fixes | ✅ Approved |
| A1.2 Live Experience | ✅ Approved |
| A1.3 Live PAT | ✅ Approved |
| A2 Homework | **Spec draft** — [HOMEWORK-PRODUCT-SPEC.md](./HOMEWORK-PRODUCT-SPEC.md) — awaiting approval |
| A3 Session History | Pending |
| A4 Reports | Pending |
| A5 Question Compatibility | Pending |
| A6 Student Review | Pending |
| A7 Assessment Dashboard | Pending |
| Phase B | Blocked until A0–A7 complete |

---

## 11. Approval Record

- ✅ Option B — Question Bank merged into Assessment Hub  
- ✅ Reordered Phase A (Homework before History/Reports)  
- ✅ Homework as deployment mode (UI reflects concept early)  
- ✅ Session History expanded fields + actions  
- ✅ Reports + AI Insights placeholders  
- ✅ Live player → AssessmentPlayer behind flag (Phase B)  
- ✅ Question stores — incremental migration, no big-bang  
- ✅ A7 Assessment Dashboard before Phase B  
- ✅ Stop-after-each-feature review process  
