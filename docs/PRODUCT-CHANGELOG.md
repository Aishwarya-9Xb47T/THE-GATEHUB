# Product Changelog — THE GATEHUB Assessment Platform

> **Audience:** Product, engineering, instructors  
> **Last updated:** July 6, 2026

---

## 2026-07-06 — A1.5 Live player polish (Quizizz-inspired)

- Removed full-page waiting screen after submit
- Flow: feedback (2.6s) → optional leaderboard overlay → compact ready pill
- Premium option cards, header progress bar, animated feedback
- Docs: [A1.5-live-player-polish.md](./features/A1.5-live-player-polish.md)

## 2026-07-06 — A1.4 Live player selection fix (P0)

- Root cause: `disabled={!canSubmitNow}` disabled option buttons before any selection (circular dependency)
- Fix: separate `optionsDisabled` vs `submitDisabled`
- Docs: [A1.4-selection-fix.md](./features/A1.4-selection-fix.md)

## 2026-07-06 — A1.3 Live Experience production approved

- Production Acceptance Test completed for live quiz flow
- Fixed: timer sync from server, idempotent submit, participant status on advance/reconnect
- Docs: [A1.3-production-acceptance.md](./features/A1.3-production-acceptance.md)
- **A2 Homework product spec drafted** — implementation not started

## 2026-07-06 — A1.2 Live Experience (Quizizz-style)

- Student state machine: waiting → question → feedback → leaderboard moment → waiting → next
- REST submit fallback + `GET /player-view` for refresh restore
- WS reconnect UX: exponential backoff, no toast spam
- Docs: [A1.2-live-experience.md](./features/A1.2-live-experience.md)

## 2026-07-04 — A1.1 Live player production fixes

- Submit pipeline, blank content, timer at 0, leaderboard sync
- Docs: [A1.1-live-player-production-fixes.md](./features/A1.1-live-player-production-fixes.md)

## 2026-07-04 — A1 Question Bank merge

- Assessment Studio merged into Assessment Hub (`/instructor/quiz-room`)
- Tabs: My Assessments, Question Bank, Live, Homework (placeholder), Reports, Templates, AI, Settings
- Legacy redirects from `/instructor/assessment-studio`
- Docs: [A1-question-bank.md](./features/A1-question-bank.md)

## 2026-07-04 — A0 Critical stability

- Quiz access control unified (`assertLegacyQuizAccess`)
- Live question order frozen at session start
- REST host actions broadcast to WebSocket clients
- `short_answer` / `fill_blank` grading in live + course submit
- Docs: [A0-critical-stability.md](./features/A0-critical-stability.md)

## Pre-Phase A (foundation)

- Universal Assessment Platform architecture frozen ([ASSESSMENT-PLATFORM-ARCHITECTURE.md](./ASSESSMENT-PLATFORM-ARCHITECTURE.md))
- Prisma v2 models: `Assessment`, `AssessmentDeployment`, `HomeworkAssignment`, `AssessmentAttempt`
- Assessment platform modules 01–05 (domain, DB, services, question service, renderer framework)
- Gap analysis + production migration plan approved

---

## Upcoming (not shipped)

| Feature | Spec status |
|---------|-------------|
| A2 Homework | [HOMEWORK-PRODUCT-SPEC.md](./HOMEWORK-PRODUCT-SPEC.md) — awaiting approval |
| A3 Session History | Not started |
| A4 Reports | Not started |
