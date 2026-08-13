# Known Issues — THE GATEHUB Assessment Platform

> **Status:** Living document — never hide issues  
> **Last updated:** July 6, 2026  
> **Rule:** When an issue is fixed, move it to [PRODUCT-CHANGELOG.md](./PRODUCT-CHANGELOG.md) and strike through here.

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **P0** | Blocks production / data loss |
| **P1** | Major feature broken |
| **P2** | Degraded UX or edge case |
| **P3** | Cosmetic / minor |

---

## Active issues

### Assessment Hub

| ID | Sev | Issue | Workaround | Target |
|----|:---:|-------|------------|--------|
| KI-001 | P1 | Homework tab is placeholder only | Use course quiz or live session | A2 |
| KI-002 | P2 | Reports tab limited / placeholder content | — | A4 |
| KI-003 | P2 | Session history not in Hub UI | Live tab shows recent only | A3 |

### Live sessions

| ID | Sev | Issue | Workaround | Target |
|----|:---:|-------|------------|--------|
| KI-010 | P2 | Timer expiry does not auto-submit answer | Instructor advances manually | A2+ or live polish |
| KI-011 | P2 | Projector view (`/live/display`) is leaderboard-only | Use host dashboard for control | Future |
| KI-012 | P3 | No 500-user load test completed | Cap ~100 students/room | C5 |
| KI-013 | P2 | WS rooms in-memory (single node) | Single backend instance | C4 |

### Student / player

| ID | Sev | Issue | Workaround | Target |
|----|:---:|-------|------------|--------|
| KI-020 | P1 | `AssessmentPlayer` (v2) not mounted on any route | Legacy live player works | B3 |
| KI-021 | P2 | Student unified assessments dashboard not built | Course pages + live link | A2 + A6 |

### Question stores

| ID | Sev | Issue | Workaround | Target |
|----|:---:|-------|------------|--------|
| KI-030 | P2 | Three parallel question stores (Quiz, Bank, AssessQuestion) | Adapters; avoid cross-store edits | Phase B migration |
| KI-031 | P2 | Not all builder types validated for live mode | `validateQuizForLive` on start | A5 |

### Permissions

| ID | Sev | Issue | Workaround | Target |
|----|:---:|-------|------------|--------|
| KI-040 | P2 | Department admin role not implemented | Owner / instructor only | Phase B |

---

## Resolved (recent)

| ID | Fixed in | Issue |
|----|----------|-------|
| — | A1.3 | Live submit pipeline broken |
| — | A1.3 | WS error toast spam on host |
| — | A1.3 | Timer reset on student refresh |
| — | A1.3 | Duplicate submit race |
| — | A1.3 | Host participant status stuck on "answered" |
| — | A1.4 | Student option selection deadlock (`disabled={!canSubmitNow}`) |
| — | A0 | Live shuffle order not frozen |
| — | A0 | REST host actions not broadcasting WS |

---

## Reporting new issues

1. Add row to **Active issues** with next `KI-` ID  
2. If deferring fix, add corresponding row in [TECHNICAL-DEBT.md](./TECHNICAL-DEBT.md)  
3. Link feature doc in `docs/features/` when fixed
