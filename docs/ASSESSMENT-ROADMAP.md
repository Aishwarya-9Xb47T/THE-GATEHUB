# THE GATEHUB — Assessment Platform Roadmap

> **Status:** Living document  
> **Last updated:** July 6, 2026  
> **Owner:** Product / Principal Engineering

---

## Engineering workflow (mandatory)

Every feature follows this order — **no skips**:

```
1.  Product Specification
2.  UX Flow
3.  Database Design
4.  API Design
5.  Architecture Review
6.  Implementation
7.  Automated Tests
8.  Production Acceptance Test (PAT)
9.  Manual Instructor Test
10. Manual Student Test
11. Documentation
12. Regression Testing
13. Approval
14. Next Feature
```

**Architecture milestones** (e.g. A1.7) complete steps 1–5 and define phased implementation with **STOP → Review** between each implementation phase. They are **not** UI features.

---

## Phase A — Production Assessment Hub (current)

| ID | Milestone | Type | Spec | Impl | PAT | Status |
|----|-----------|------|:----:|:----:|:---:|:------:|
| A0 | Critical Stability | Feature | ✅ | ✅ | ✅ | **Approved** |
| A1 | Assessment Hub + Question Bank | Feature | ✅ | ✅ | ✅ | **Approved** |
| A1.2–A1.6 | Live Experience & Production Readiness | Feature bundle | ✅ | ✅ | ✅ | **Approved** |
| **A1.7** | **Live Assessment Engine Redesign** | **Architecture** | ✅ | — | — | **✅ Approved** |
| A2 | Homework | Feature | ✅ | — | — | **Blocked** (depends on A1.7 impl) |
| A3 | Reports & Analytics | Feature | — | — | — | Pending |
| A4 | Student Assessment Dashboard | Feature | — | — | — | Pending |
| A5 | Question Compatibility | Feature | — | — | — | Pending |
| A6 | Instructor Assessment Dashboard | Feature | — | — | — | Pending |

### A1.2–A1.6 bundle (reference)

| Doc | Scope |
|-----|-------|
| A1.2 | Live experience rebuild |
| A1.3 | Production acceptance test |
| A1.4 | Selection fix (P0) |
| A1.5 | Live player polish |
| A1.6 | Live product review |

Visual polish from A1.5/A1.6 is retained; **pace model** is superseded by A1.7.

### A1.7 — Live Assessment Engine Redesign (Architecture)

| | |
|--|--|
| **Type** | Architectural evolution of the Live Assessment Engine — **not a UI feature** |
| **Status** | ✅ **Approved** (Product Owner, July 6, 2026) |
| **Canonical spec** | [LIVE-MODE-REDESIGN.md](./LIVE-MODE-REDESIGN.md) |
| **Implementation** | Phase 2 complete — awaiting review before Phase 3 |

Introduces **Pace Strategy** + **Configuration Matrix** so self-paced live, instructor-paced live, and future modes share one progression engine.

**Current gate:** No A1.7 implementation code until Phase 1 is explicitly approved. A2 Homework blocked until A1.7 implementation completes.

---

## A1.7 — Shared progression engine (dependencies)

A1.7 becomes the **single shared progression engine** for all assessment modes that advance question-by-question:

| Mode | Uses A1.7 engine |
|------|:----------------:|
| Self-Paced Live | ✅ |
| Instructor-Paced Live | ✅ |
| Homework (A2) | ✅ |
| Practice | ✅ |
| Mock Tests | ✅ |
| Assignments | ✅ |

```
Assessment Deployment
        ↓
Configuration Matrix (pace, timer, leaderboard, feedback, …)
        ↓
PaceStrategy (self_paced | instructor_paced | async | timed | …)
        ↓
Common Assessment Engine
        ↓
Scoring · Leaderboard · Analytics · Reports · Gamification
```

**Rule:** Future assessment modes must reuse this engine. **No duplicate progression logic** may be introduced anywhere in the codebase.

---

## A1.7 — Implementation phases (mandatory STOP → Review)

Do **not** implement everything in one pass. Each phase ends with **STOP → Review** before the next phase begins.

| Phase | Deliverable | Exit criteria | Review |
|:-----:|-------------|---------------|:------:|
| **1** | `PaceStrategy` interface + factory | Interface documented; no behavior change yet; unit tests for contract | ✅ STOP — review |
| **2** | `SelfPacedStrategy` | Participant-owned index; auto-advance after feedback; default for new sessions | ✅ STOP — review |
| **3** | `InstructorPacedStrategy` | Existing Kahoot-style behavior preserved via strategy; `host:next` gated | ☐ STOP |
| **4** | Configuration Matrix | `LiveSessionConfig` schema, resolver, legacy migration map | ☐ STOP |
| **5** | Migration | Prisma columns, dual-read, settings UI presets, WS/API split (`room_state` / `participant_state`) | ☐ STOP |
| **6** | Production Acceptance Test | PAT covers **both** pace modes; `validate:self-paced-live` script | ☐ STOP |

UI work (Control Center, early finisher lobby, config editor) ships **inside** the relevant phases — driven by config, not as a separate “UI milestone.”

---

## A1.7 — Success criteria

After A1.7 is complete, adding a new assessment mode must require only:

1. **Configuration** — entries in the Configuration Matrix (or mode-specific extension of it)
2. **Strategy selection** — register a handler in `PaceStrategy` / `AssessmentModeHandler`

It must **not** require rewriting the assessment engine, duplicating submit/advance logic, or forking the player state machine.

**Acceptance test:** A engineer can add a stub `TimedExamStrategy` by implementing the interface + config keys, without touching `SelfPacedStrategy` or scoring code.

---

## Phase B — v2 Platform connection

| ID | Feature | Depends on |
|----|---------|------------|
| B1 | Question Service UI sync | A6 |
| B2 | Assessment Service + item API | B1 |
| B3 | Universal Player (`assessmentPlatform.enabled`) | A2, A1.7, B2 |
| B4 | Attempt Engine dual-write | B3 |
| B5 | Analytics pipeline | B4, A3 |
| B6 | Gamification overlay | B5 |
| B7 | AI grading + insights | B4 |

---

## Phase C — University scale

| ID | Feature |
|----|---------|
| C1 | Department / batch assignment |
| C2 | LTI / LMS grade passback |
| C3 | Proctoring integration |
| C4 | Multi-tenant org isolation |
| C5 | 500+ concurrent live soak test infra |

---

## Unified product surfaces

All features integrate into:

| Surface | Route (target) |
|---------|----------------|
| Assessment Hub | `/instructor/quiz-room` |
| Question Bank | `?tab=bank` |
| Live Sessions | `?tab=live` |
| Homework | `?tab=homework` |
| Reports | `?tab=reports` |
| AI Studio | `?tab=ai` |
| Instructor Assessment Dashboard | `/instructor/quiz-room/assessments/:id` (A6) |
| Student Assessments | `/student/assessments` (A4) |
| Student Homework Player | `/student/homework/:deploymentId` |

---

## Deployment modes (one assessment)

| Mode | Phase | Status |
|------|-------|--------|
| Preview | A1 | ✅ |
| Host Live (instructor-paced) | A1.3 | ✅ Shipped — migrates to A1.7 Phase 3 |
| Host Live (self-paced) | A1.7 | Architecture ✅ — impl pending |
| Practice | A1.7 + B3 | Blocked on A1.7 |
| Assign Homework | A2 | Spec ✅ — blocked on A1.7 |
| Mock Test | A1.7 + B3 | Blocked on A1.7 |
| Course Assignment | B4 | Schema only |

---

## Documentation index

| Document | Purpose |
|----------|---------|
| [LIVE-MODE-REDESIGN.md](./LIVE-MODE-REDESIGN.md) | **A1.7 architecture** (approved) |
| [A1.7-PHASE1-ARCHITECTURE.md](./A1.7-PHASE1-ARCHITECTURE.md) | Phase 1 runtime contracts |
| [ASSESSMENT-PLATFORM-ARCHITECTURE.md](./ASSESSMENT-PLATFORM-ARCHITECTURE.md) | Frozen v2 architecture |
| [ASSESSMENT-PRODUCTION-MIGRATION-PLAN.md](./ASSESSMENT-PRODUCTION-MIGRATION-PLAN.md) | Phase A plan |
| [HOMEWORK-PRODUCT-SPEC.md](./HOMEWORK-PRODUCT-SPEC.md) | A2 product spec |
| [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) | Active issues |
| [TECHNICAL-DEBT.md](./TECHNICAL-DEBT.md) | Deferred work |
| [PRODUCT-CHANGELOG.md](./PRODUCT-CHANGELOG.md) | Shipped changes |
| [ASSESSMENT-PERMISSIONS.md](./ASSESSMENT-PERMISSIONS.md) | Permissions |
| `docs/features/A*.md` | Feature completion records |

---

## Milestones

| Date | Milestone |
|------|-----------|
| 2026-07-04 | A0 + A1 shipped |
| 2026-07-06 | A1.2–A1.6 Live experience & production review complete |
| 2026-07-06 | A1.7 Live Assessment Engine Redesign — **architecture approved** |
| 2026-07-06 | A2 Homework product spec drafted |
| TBD | A1.7 Phase 1 complete — PaceStrategy contracts |
| TBD | A1.7 Phase 2 start (after Phase 1 review) |
| TBD | A1.7 implementation complete (Phase 6 PAT) |
| TBD | A2 implementation start |
| TBD | Phase A complete (A0–A6) |
| TBD | Phase B v2 player GA |

---

## What is blocked right now

| Item | Blocked until |
|------|----------------|
| A1.7 implementation code | Phase 1 ✅ — Phase 2 blocked until review |
| A2 Homework implementation | A1.7 Phase 6 complete |
| Live pace model production sign-off | A1.7 Phase 6 complete |
| New progression logic outside `PaceStrategy` | Never (engineering rule) |
