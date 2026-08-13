# Quiz Builder — Production Audit

**Date:** 2026-07-06  
**Scope:** Instructor Quiz Room & Quiz Builder (`/instructor/quiz-room`, `/instructor/quiz-room/quizzes/:id/edit`)  
**Goal:** Reach production quality comparable to Quizizz before Homework (A2) or new platform modules.

---

## Executive Summary

This audit covers the instructor Quiz Room hub and immersive Quiz Builder. Six workstreams were executed in this pass:

| Task | Status | Notes |
|------|--------|-------|
| 1 — Rebrand Assessment Hub → Quiz Room | ✅ Done | User-facing strings updated |
| 2 — Immersive builder (hide sidebar) | ✅ Done | Sidebar auto-hides; restores on exit |
| 3 — Image / media upload | ✅ Done | Upload, drag-drop, paste, URL; shared uploader |
| 4 — Image rendering pipeline | ✅ Done | URL resolution + placeholder suppression |
| 5 — Editor UX (media toolbar) | ✅ Done | Grouped Media actions with labels |
| 6 — Full audit (this document) | ✅ Done | Issues catalogued with priorities |

**Recommendation:** Address all **P0** and **P1** items before shipping Homework. **P2** polish can ship in parallel with Homework beta.

---

## Screenshots (baseline before fixes)

### Hub — inconsistent branding (URL vs UI)

![Quiz Room hub showing Assessment Hub title](../assets/c__Users_texta_AppData_Roaming_Cursor_User_workspaceStorage_92a48974da152a3b47918a2158f865a0_images_image-8363fbf6-9852-4383-ad2d-43949b583f2d.png)

**Issue:** Route is `/instructor/quiz-room` but UI said "Assessment Hub", "My Assessments", "Create Assessment".

---

### Builder — sidebar visible in immersive mode

![Quiz builder with dashboard sidebar visible](../assets/c__Users_texta_AppData_Roaming_Cursor_User_workspaceStorage_92a48974da152a3b47918a2158f865a0_images_image-09c917b0-0e19-460b-a3b2-c8e0bd152775.png)

**Issue:** Edit route should be distraction-free (Figma / Quizizz pattern).

---

### Broken image preview (`![alt](text)`)

![Live preview showing broken image alt text](../assets/c__Users_texta_AppData_Roaming_Cursor_User_workspaceStorage_92a48974da152a3b47918a2158f865a0_images_image-550790af-2408-421c-8063-5f67d10755e3.png)

**Issue:** Toolbar inserted placeholder markdown; renderer showed literal `alt` and broken icon.

---

## Issues Catalog

### QB-001 — Inconsistent product naming (Assessment Hub vs Quiz Room)

| Field | Value |
|-------|-------|
| **Priority** | P0 — Fixed |
| **Area** | Hub branding |
| **Root cause** | Partial rebrand during A1 merge; URL already `quiz-room` |
| **Affected files** | `DashboardLayout.tsx`, `QuizRoomDashboardPage.tsx`, `LiveHostSessionComplete.tsx`, wizard steps |
| **Fix applied** | Renamed sidebar, H1, tabs ("My Quizzes"), CTA ("Create Quiz"), tagline, toasts, page titles |
| **Remaining** | Internal code paths (`assessment-hub/`, `migrationLog.ts`) intentionally unchanged per scope |

---

### QB-002 — Dashboard sidebar visible in Quiz Builder

| Field | Value |
|-------|-------|
| **Priority** | P0 — Fixed |
| **Area** | Immersive layout |
| **Root cause** | `isQuizAuthoringStudio` flag existed but sidebar state was not saved/restored; top bar still competed for space |
| **Affected files** | `DashboardLayout.tsx` |
| **Fix applied** | Hide sidebar + top bar on `/quiz-room/quizzes/:id/edit`; save prior open state; restore on navigate away; full-width `h-dvh` shell |
| **Verify** | Enter builder → no sidebar; back to hub → sidebar restores prior preference |

---

### QB-003 — Markdown-only image workflow

| Field | Value |
|-------|-------|
| **Priority** | P0 — Fixed |
| **Area** | Question editor |
| **Root cause** | Toolbar only inserted `![alt](text)` snippet; no upload API integration |
| **Affected files** | `QuizRichEditor.tsx` (was), new `quizMediaUpload.ts`, `QuizMediaInsertDialog.tsx` |
| **Fix applied** | Upload via `/api/upload/image`, drag-drop on textarea, Ctrl+V image paste, URL tab, shared dialog for image/video/audio/attachment |
| **Remaining** | Google Drive picker stubbed (no OAuth picker wired for quiz media yet) |

---

### QB-004 — Images render as broken `alt` text

| Field | Value |
|-------|-------|
| **Priority** | P0 — Fixed |
| **Area** | Markdown rendering |
| **Root cause** | (1) Placeholder src `text` is invalid URL; (2) `/uploads/...` paths not resolved to origin; (3) option text rendered as plain string in student preview |
| **Affected files** | `markdownComponents.tsx`, `quizMarkdown.ts`, `StudentPreviewPane.tsx`, `StudentPreviewStudio.tsx` |
| **Fix applied** | `resolveMarkdownMediaUrl()` in img component; suppress placeholder src; `MarkdownContent` for option text in previews |
| **Surfaces covered** | Builder live preview, split student preview, fullscreen preview modal, live quiz (already used `MarkdownContent`) |

---

### QB-005 — Option / explanation media buttons non-functional

| Field | Value |
|-------|-------|
| **Priority** | P1 — Fixed |
| **Area** | Option cards |
| **Root cause** | Image/Mic/AI icon buttons had no handlers |
| **Affected files** | `OptionCardList.tsx` |
| **Fix applied** | Options and explanations use `QuizRichEditor` (compact) with full media toolbar |

---

### QB-006 — Media toolbar not discoverable

| Field | Value |
|-------|-------|
| **Priority** | P1 — Fixed |
| **Area** | Editor UX |
| **Root cause** | Single icon row without labels; image buried among formatting icons |
| **Affected files** | `QuizRichEditor.tsx` |
| **Fix applied** | Separate **Media** group: Image, Video, Audio, File, Link, Formula, Code block, Table — with text labels on sm+ breakpoints |

---

### QB-007 — Google Drive picker for quiz images

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open |
| **Area** | Media upload |
| **Root cause** | Google OAuth exists for notebooks/Colab but no Drive file picker integrated into quiz editor |
| **Affected files** | `QuizMediaInsertDialog.tsx` (placeholder copy), future `googleDrivePicker.ts` |
| **Recommended fix** | Reuse Google OAuth from `GoogleConnectPanel`; add Picker API for images/PDF; insert returned public or proxied URL into markdown |
| **Blocked by** | Product decision on Drive file proxy vs direct hotlink |

---

### QB-008 — Homework tab visible but not implemented

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open (by design) |
| **Area** | Hub navigation |
| **Root cause** | A2 Homework spec ships after Quiz Room polish |
| **Affected files** | `QuizRoomDashboardPage.tsx` |
| **Recommended fix** | Keep placeholder until audit sign-off; then implement per `HOMEWORK-PRODUCT-SPEC.md` |

---

### QB-009 — Autosave has no conflict detection

| Field | Value |
|-------|-------|
| **Priority** | P1 — Open |
| **Area** | Autosave |
| **Root cause** | `useQuizAutoSave` debounces PATCH every 2s with no version vector or ETag |
| **Affected files** | `useQuizAutoSave.ts`, `quizBuilderService.ts` |
| **Recommended fix** | Return `version` from PATCH; on 409 show merge dialog; optional optimistic locking |
| **Risk** | Two tabs editing same quiz can overwrite |

---

### QB-010 — Validation panel disconnected from publish gate

| Field | Value |
|-------|-------|
| **Priority** | P1 — Open |
| **Area** | Validation |
| **Root cause** | Header shows error count; Host Live does not block on `validation.valid === false` |
| **Affected files** | `QuizStudioHeader.tsx`, `QuizBuilderPage.tsx`, live launch flow |
| **Recommended fix** | Disable Host Live when validation fails; link badge to first error question |

---

### QB-011 — Import returns to wizard, not in-builder import

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open |
| **Area** | Import |
| **Root cause** | Header Import navigates to `/quiz-room/create?method=import&returnQuizId=` |
| **Affected files** | `QuizBuilderPage.tsx`, `QuizRoomWizard.tsx` |
| **Recommended fix** | Inline import drawer inside builder (reuse `ImportWizard` with `targetQuizId`) |

---

### QB-012 — AI panel duplicates hub AI Studio

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open |
| **Area** | AI |
| **Root cause** | Per-question `AiStudioPanel` + hub `AiStudioPanel` share patterns but not unified entry |
| **Affected files** | `quiz-builder/studio/AiStudioPanel.tsx`, `assessment-hub/AiStudioPanel.tsx` |
| **Recommended fix** | Single AI copilot service; builder opens scoped to current question/quiz |

---

### QB-013 — Keyboard shortcuts undocumented

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open |
| **Area** | Accessibility / power users |
| **Root cause** | Shortcuts exist (⌘Z, ⌘⇧Z, ⌘K, ⌘S) but Commands dialog does not list them |
| **Affected files** | `QuizBuilderPage.tsx`, command palette dialog |
| **Recommended fix** | Add shortcuts section to Commands modal; `aria-keyshortcuts` on header actions |

**Known shortcuts:**

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z / Ctrl+Y | Redo |
| Ctrl/Cmd+K | Command palette |
| Ctrl/Cmd+S | Force save |

---

### QB-014 — Question navigator lacks keyboard focus order

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open |
| **Area** | Accessibility |
| **Root cause** | Left navigator + canvas + properties panel; no skip links or roving tabindex |
| **Affected files** | `QuestionNavigator.tsx`, `QuizBuilderPage.tsx` |
| **Recommended fix** | Landmark regions (`nav`, `main`, `aside`); focus trap in modals; visible focus rings audit |

---

### QB-015 — Properties panel tabs overflow on mobile

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open |
| **Area** | Responsive layout |
| **Root cause** | Six tabs (General, Scoring, Metadata, AI, A11y, Valid) in fixed header |
| **Affected files** | `PropertiesPanelTabs.tsx` |
| **Recommended fix** | Scrollable tab list; collapse to dropdown under `md` breakpoint |

---

### QB-016 — Media question type uses raw URL field only

| Field | Value |
|-------|-------|
| **Priority** | P1 — Open |
| **Area** | Media question types |
| **Root cause** | `MediaFields` in `QuestionTypeEditor.tsx` is a plain URL input |
| **Affected files** | `QuestionTypeEditor.tsx` |
| **Recommended fix** | Replace with `QuizMediaInsertDialog` + preview player |

---

### QB-017 — Reports do not render question images

| Field | Value |
|-------|-------|
| **Priority** | P2 — Open |
| **Area** | Reports |
| **Root cause** | Reports tab lists sessions; per-question review UI not built (A4) |
| **Affected files** | `QuizRoomDashboardPage.tsx` Reports tab |
| **Recommended fix** | When reports ship, reuse `MarkdownContent` for stems/options |

---

### QB-018 — Version history restore lacks diff preview

| Field | Value |
|-------|-------|
| **Priority** | P3 — Open |
| **Area** | History |
| **Root cause** | `listQuizVersions` + restore with no visual diff |
| **Affected files** | `QuizBuilderPage.tsx` versions dialog |
| **Recommended fix** | Side-by-side question diff before restore |

---

### QB-019 — Bulk export is JSON only

| Field | Value |
|-------|-------|
| **Priority** | P3 — Open |
| **Area** | Bulk actions |
| **Root cause** | `bulkExport` downloads raw JSON |
| **Affected files** | `QuizBuilderPage.tsx` |
| **Recommended fix** | Add QTI, CSV, and printable PDF export |

---

### QB-020 — Live preview option text ignored markdown before fix

| Field | Value |
|-------|-------|
| **Priority** | P0 — Fixed |
| **Area** | Student preview |
| **Root cause** | `StudentPreviewPane` rendered `o.text` as string |
| **Affected files** | `StudentPreviewPane.tsx`, `StudentPreviewStudio.tsx` |
| **Fix applied** | Wrap option text in `MarkdownContent` |

---

## Feature Area Checklist

| Area | Status | Notes |
|------|--------|-------|
| **Autosave** | ⚠️ Works | 2s debounce; no multi-tab safety (QB-009) |
| **Preview** | ✅ Improved | Split + modal; markdown images resolve |
| **History** | ⚠️ Basic | Restore works; no diff (QB-018) |
| **Validation** | ⚠️ Partial | Live + server validate; not gated on Host Live (QB-010) |
| **Import** | ⚠️ Redirect | Leaves builder (QB-011) |
| **AI** | ⚠️ Functional | Per-question + hub duplication (QB-012) |
| **Question navigation** | ✅ Good | DnD reorder, collapse, multi-select |
| **Properties panel** | ⚠️ Dense | Mobile overflow (QB-015) |
| **Keyboard shortcuts** | ⚠️ Hidden | Work but undocumented (QB-013) |
| **Image rendering** | ✅ Fixed | Central `markdownComponents` img resolver |
| **Media uploads** | ✅ Fixed | Shared uploader; Drive pending (QB-007) |
| **Responsive layout** | ⚠️ Good desktop | Properties/nav need mobile pass |
| **Accessibility** | ⚠️ Partial | Toolbar `aria-label`s added; focus order TBD |

---

## Implementation Priority Matrix

| Priority | Issue IDs | Action |
|----------|-----------|--------|
| **P0** | QB-001–005, QB-020 | ✅ Addressed in this pass |
| **P1** | QB-009, QB-010, QB-016 | Before Homework GA |
| **P2** | QB-007, QB-008, QB-011–015, QB-017 | Homework beta or fast-follow |
| **P3** | QB-018, QB-019 | Post-GA polish |

---

## Files Changed (this pass)

| File | Change |
|------|--------|
| `frontend/src/layouts/DashboardLayout.tsx` | Quiz Room nav label; immersive sidebar save/restore |
| `frontend/src/pages/instructor/quiz-room/QuizRoomDashboardPage.tsx` | Rebrand; page title |
| `frontend/src/pages/instructor/quiz-room/QuizBuilderPage.tsx` | Dynamic document title |
| `frontend/src/components/live-session/LiveHostSessionComplete.tsx` | Quiz Room copy |
| `frontend/src/components/quiz-room/wizard/WelcomeStep.tsx` | Tagline |
| `frontend/src/components/quiz-room/wizard/CreateMethodStep.tsx` | AI Studio label |
| `frontend/src/components/quiz-builder/studio/QuizRichEditor.tsx` | Media toolbar, upload, paste, drop |
| `frontend/src/components/quiz-builder/studio/QuizMediaInsertDialog.tsx` | **New** shared media dialog |
| `frontend/src/components/quiz-builder/studio/OptionCardList.tsx` | Rich editors for options |
| `frontend/src/components/quiz-builder/studio/StudentPreviewPane.tsx` | Markdown options |
| `frontend/src/components/quiz-builder/studio/StudentPreviewStudio.tsx` | Markdown options |
| `frontend/src/components/learning/markdownComponents.tsx` | Image URL resolution |
| `frontend/src/lib/quizBuilder/quizMediaUpload.ts` | **New** upload helper |
| `frontend/src/lib/quizBuilder/quizMarkdown.ts` | **New** markdown helpers |

---

## Sign-off Criteria (before Homework)

- [x] All user-facing "Assessment Hub" → "Quiz Room"
- [x] Builder is full-width without dashboard chrome
- [x] Upload image → visible in builder preview and student preview
- [x] Live quiz renders uploaded images (via shared `MarkdownContent`)
- [ ] Validation blocks Host Live when quiz invalid
- [ ] Google Drive picker OR explicit "not in v1" product sign-off
- [ ] Mobile layout pass on builder (navigator + properties)
- [ ] Keyboard shortcuts documented in Commands palette

---

## Related Docs

- `docs/ASSESSMENT-UX-AUDIT.md` — prior hub UX audit
- `docs/HOMEWORK-PRODUCT-SPEC.md` — **blocked** until this audit sign-off
- `docs/ASSESSMENT-ROADMAP.md` — phase A status

---

*Do not start Homework implementation until P1 items are triaged and owners assigned.*
