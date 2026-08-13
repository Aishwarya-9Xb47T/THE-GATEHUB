# Technical Debt — THE GATEHUB Assessment Platform

> **Status:** Living document  
> **Last updated:** July 6, 2026  
> **Rule:** Every postponed decision or shortcut is recorded here.

---

## Debt register

| ID | Area | Description | Impact | Effort | Target |
|----|------|-------------|--------|--------|--------|
| TD-001 | Live WS | In-memory room state in `liveSessionServer.ts` — no Redis pub/sub | Cannot horizontally scale live without sticky sessions | L | C4 |
| TD-002 | Question data | Three stores: `Quiz`/`Question`, `BankQuestion`, `AssessQuestion` | Sync risk, adapter complexity | XL | Phase B |
| TD-003 | Player | `AssessmentPlayer` built but not routed | v2 features unused in production | M | A2/B3 |
| TD-004 | v2 API | Deployment/attempt services exist but no UI | Homework must bridge legacy | M | A2 |
| TD-005 | Live player | `LiveQuestionDisplay` separate from renderer registry | Duplicate rendering logic | M | B3 |
| TD-006 | Homework schema | `HomeworkAssignment` minimal (due, late, attempts only) | Full spec needs column migration | S | A2.1 |
| TD-007 | Notifications | No scheduled job infra for due reminders | Email reminders deferred | M | A2+ |
| TD-008 | Reports | Analytics pipeline not connected to Hub reports tab | Manual export only in live | L | A4 |
| TD-009 | Auth | Department / org-scoped permissions not implemented | University batch assign blocked | L | Phase B |
| TD-010 | Testing | No Playwright E2E for assessment flows | Manual PAT only | M | A2 PAT |
| TD-011 | Live | `sessionType: homework` on live session conflates concepts | Use deployment mode instead | S | A2 |
| TD-012 | Gradebook | `CourseAssignment.syncToGradebook` not wired | Homework scores stay in assessment silo | M | B4 |
| TD-013 | AI | AI grading service stubs only | Essay manual grading MVP | L | B7 |
| TD-014 | Media | File-upload question type incomplete in player | Defer file homework | M | A5 |
| TD-015 | i18n | Assessment strings English-only | — | L | C |

---

## Intentional MVP cuts (A2)

Documented in [HOMEWORK-PRODUCT-SPEC.md §16](./HOMEWORK-PRODUCT-SPEC.md) — not forgotten:

- Batch / department assignment → Phase B  
- Excel/PDF export → post-MVP  
- Email scheduled reminders → flag-gated  
- LTI / LMS → Phase C  
- Attendance integration → Phase C  
- Team / group submissions → deferred  

---

## Paydown policy

1. **No new debt without a TD- row**  
2. Each Phase A feature may pay down ≤2 debt items  
3. Architecture doc changes require explicit review  
4. Before Phase B: TD-002 must have written migration plan in `docs/migration/`

---

## Paid down

| ID | When | How |
|----|------|-----|
| — | A0 | Centralized `assertLegacyQuizAccess` |
| — | A0 | Shared `gradeAnswer` for short_answer |
| — | A1.3 | Idempotent live submit |
| — | A1.3 | WS reconnect with backoff |
