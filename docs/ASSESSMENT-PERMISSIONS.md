# Assessment Permissions Matrix

> **Status:** Living document — canonical permission reference  
> **Last updated:** July 4, 2026 (A0/A1)  
> **Goal:** One permission model for all assessment entities (legacy Quiz, BankQuestion, v2 Assessment)

---

## Roles

| Role | Scope |
|------|-------|
| **Owner** | User who created the assessment/quiz (`authorId`) |
| **Course Instructor** | Instructor of a course linked via lecture |
| **Live Host** | User hosting a live session with this quiz |
| **Department Admin** | Organization/department admin *(Phase B)* |
| **Super Admin** | Platform super administrator |

---

## Legacy Quiz (`Quiz` + `Question`)

Implemented in `assertLegacyQuizAccess` (`backend/src/services/quiz/quizAccess.ts`).

| Action | Owner | Course Instructor | Live Host | Admin |
|--------|:-----:|:-------------------:|:---------:|:-----:|
| **Read** | ✅ | ✅ | ✅ | ✅ |
| **Edit** | ✅ | ✅ | ✅ | ✅ |
| **Delete** | ✅ | ✅ | — | ✅ |
| **Host Live** | ✅ | ✅ | ✅ | ✅ |
| **Archive** | ✅ | ✅ | — | ✅ |
| **Duplicate** | ✅ | ✅ | ✅ | ✅ |

Notes:
- Live Host access applies only while the user has hosted a session with that quiz.
- Premium Quiz Builder uses the same helper (deduplicated from inline copy).
- Legacy `PUT /api/quizzes/:id` and `POST .../questions` enforce this (A0.1).

---

## Question Bank (`BankQuestion`)

Implemented in `assertAuthorOrAdmin` (`assessmentStudioService`).

| Action | Author | Admin |
|--------|:------:|:-----:|
| **Read** | ✅ | ✅ |
| **Edit** | ✅ | ✅ |
| **Delete** | ✅ | ✅ |
| **Submit Review** | ✅ | ✅ |
| **Approve / Publish** | ✅ | ✅ |
| **Import** | ✅ | ✅ |
| **Add to Collection** | ✅ | ✅ |

Shared / department bank permissions — **Phase B** (organization model).

---

## Live Session (`LiveSession`)

| Action | Host | Participant | Admin |
|--------|:----:|:-----------:|:-----:|
| **Create** | ✅ (with quiz access) | — | ✅ |
| **Start / Next / Finish** | ✅ | — | ✅ |
| **Join** | — | ✅ | ✅ |
| **View Analytics** | ✅ | — | ✅ |
| **Submit Answer** | — | ✅ | — |

---

## v2 Assessment (`Assessment` — Phase B)

Target: extend `assertLegacyQuizAccess` pattern to v2 entities via adapter layer.

| Action | Owner | Org Admin | Super Admin |
|--------|:-----:|:---------:|:-----------:|
| **Read** | ✅ | ✅ | ✅ |
| **Edit (draft)** | ✅ | ✅ | ✅ |
| **Publish** | ✅ | ✅ | ✅ |
| **Host Live** | ✅ | ✅ | ✅ |
| **Assign Homework** | ✅ | ✅ | ✅ |
| **Archive** | ✅ | ✅ | ✅ |
| **Delete** | ✅ | — | ✅ |

---

## API Endpoints (unchanged in A1)

| Store | API Prefix | Auth |
|-------|------------|------|
| Question Bank | `/api/assessment-studio/*` | Author + admin |
| Legacy Quiz | `/api/quizzes`, `/api/quiz-builder` | `assertLegacyQuizAccess` |
| Live Sessions | `/api/live-sessions/*` | Host/participant rules |
| v2 Platform | `/api/v2/assessments`, `/api/v2/questions` | Feature-flagged (Phase B) |

---

## Migration Principle

All new assessment features must **extend this matrix** — not introduce parallel permission checks.

When v2 goes live, permissions flow:

```
Legacy Quiz permissions
  ↓ Adapter
  ↓ v2 Assessment permissions (same actions, same roles)
```
