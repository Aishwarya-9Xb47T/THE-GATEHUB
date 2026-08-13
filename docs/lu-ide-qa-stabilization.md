# Learning Universe IDE — QA Audit & Stabilization Report

**Date:** 2025-06-25  
**Scope:** LU 2.x Academic Authoring Studio (Learning Mode + Developer Mode)  
**Status:** Stabilization pass in progress — critical interaction bugs fixed; legacy project cleanup may still be required per-project.

---

## 1. Audit Checklist

### Learning Universe lifecycle
| Workflow | Status | Notes |
|----------|--------|-------|
| Create new LU | ✅ Verified (schema) | Empty `tracks: []` on create |
| Create Track | ✅ | Wizard + context menu |
| Create Module | ✅ | No auto-lesson scaffold |
| Create Lesson | ✅ | Minimal `\lesson{}` only |
| Add Overview/Objectives/Topics/etc. | ✅ Fixed | Add vs Open split |
| Add Quiz + questions | ✅ Fixed | No duplicate quiz blocks |
| Add Resources + items | ✅ Fixed | Single-item scaffold |
| Rename Track/Module/Lesson | ✅ Fixed | Lesson title syncs to `.tex` |
| Duplicate / Move / Delete | ✅ | Backend mutations exist |
| Compile | ✅ (prior pass) | PDF pipeline fixed earlier |
| Preview | ✅ (prior pass) | Section focus navigation |
| Publish | ⚠️ Needs live retest | Backend pipeline unchanged |
| Project Health | ✅ Fixed | Per-module duplicate lesson IDs |

### Explorer interactions
| Action | Status |
|--------|--------|
| Click lesson → open file | ✅ |
| Click quiz/component → open + scroll | ✅ Fixed |
| Expand/collapse ancestors | ✅ Fixed (composite node IDs) |
| Context menu per node kind | ✅ |
| Add (+) menu context-aware | ✅ |
| Selection persistence | ✅ |
| Error toast on failed mutation | ✅ Fixed |

### Developer Mode
| Action | Status |
|--------|--------|
| Mode toggle | ✅ |
| File tree CRUD | ✅ (prior pass) |
| Cross-mode sync | ⚠️ Needs live retest |

---

## 2. Bugs Found & Fixes

### BUG-001: False "Duplicate lesson id" warnings
- **Symptom:** Project Health showed `Duplicate lesson id: lesson-01` across unrelated modules.
- **Root cause:** `validateLuProjectStructure` used a global `lessonIds` set across the entire project.
- **Fix:** Scope duplicate check per `trackId:moduleId`.
- **Files:** `backend/src/services/luProject/luProjectValidator.ts`
- **Regression:** `backend/test-lu-validator-fix.ts` — PASS

### BUG-002: Quiz/component click does not open or focus editor
- **Symptom:** Clicking Quiz in explorer selected node but editor did not scroll to `\quiz{}`.
- **Root cause:** `ExplorerBranch` only called `onOpenFile`; no `lu-focus-section` dispatch for component kinds.
- **Fix:** Added `componentNavigation.ts` with `kindToSection` + `dispatchFocusSection`; `handleOpenComponent` opens file and focuses section; explorer click routes educational leaves through `onOpenComponent`.
- **Files:** `frontend/src/lib/luAuthoring/componentNavigation.ts`, `LuAuthoringPanel.tsx`

### BUG-003: "Open" component re-added content (Add vs Open not split)
- **Symptom:** Opening existing Quiz could append duplicate blocks.
- **Root cause:** `handleFocusSection` always called `appendLessonBlock`.
- **Fix:** Split `onOpenComponent` (focus only) vs `onAddComponent` (mutate + focus). Menu handlers updated in `luExplorerMenu.ts`.
- **Files:** `LuAuthoringPanel.tsx`, `luExplorerMenu.ts`

### BUG-004: Assignment/Discussion mapped to quiz section
- **Symptom:** Focus navigation landed on wrong editor region.
- **Root cause:** `LESSON_COMPONENTS` used `section: "quiz"` for assignment/discussion.
- **Fix:** Correct section mappings; added `assignment`/`discussion` patterns and labels in `lessonSections.ts`.
- **Files:** `luExplorerMenu.ts`, `lessonSections.ts`

### BUG-005: Rename lesson did not update `.tex`
- **Symptom:** Explorer title changed but `\lesson{title={...}}` stayed stale.
- **Root cause:** `renameLesson` only updated `project.json`.
- **Fix:** Replace `\lesson{...}` title in lesson file on rename.
- **Files:** `luProjectStructureService.ts`

### BUG-006: Adding quiz questions duplicated full quiz scaffold
- **Symptom:** Each question appended another full `\quiz{title=...}` block.
- **Root cause:** `appendQuizQuestion` always appended `scaffoldQuizContent`.
- **Fix:** Add `scaffoldQuizQuestionContent`; only scaffold quiz container once; append question blocks thereafter.
- **Files:** `luAuthoringTemplates.ts`, `luProjectStructureService.ts`

### BUG-007: Adding resource items duplicated full resource scaffold
- **Symptom:** Each resource item appended full `scaffoldResourceContent`.
- **Fix:** Add `scaffoldResourceItemContent` for individual items.
- **Files:** `luAuthoringTemplates.ts`, `luProjectStructureService.ts`

### BUG-008: Explorer did not expand parent nodes on component open
- **Symptom:** Component visible only after manual expand or page refresh.
- **Root cause:** `expandNodes` used raw `lessonId` instead of composite explorer id `${trackId}-${moduleId}-${lessonId}`.
- **Fix:** `ancestorExpandIds()` helper.
- **Files:** `LuAuthoringPanel.tsx`

### BUG-009: Silent mutation failures
- **Symptom:** Structure API errors swallowed with no user feedback.
- **Fix:** Toast on `runMutate` catch via `useToastStore`.
- **Files:** `LuAuthoringPanel.tsx`

### BUG-010: `emitModuleTex` wrong `\input{}` paths
- **Symptom:** Module tex could reference lesson id instead of file basename.
- **Fix:** Use `lesson.file` basename in `\input{}`.
- **Files:** `luProjectStructureService.ts`

### BUG-011: Aggressive component migration re-save
- **Symptom:** Unnecessary `project.json` writes on every state load.
- **Fix:** Only migrate lessons where `components === undefined` (not empty array).
- **Files:** `luAuthoringState.ts`

### BUG-013: Clicking lower Quiz selects/highlights upper Quiz (duplicate explorer IDs)
- **Symptom:** Clicking a Quiz deep in the tree highlighted or focused a different Quiz higher up.
- **Root cause:** Component node IDs used `${lesson.id}-${comp.id}` (e.g. `lesson-01-quiz`) which collides across modules/tracks. React duplicate keys + `selectedId` collision caused wrong node to activate. Editor focus also raced before the correct file loaded and always matched the first `\quiz{` block.
- **Fix:** Globally unique IDs `${trackId}-${moduleId}-${lessonId}-${comp.id}`; await file open before focus; pass `filePath` + `occurrence` to `lu-focus-section` with retry until correct file is active; nth-pattern match for quiz questions.
- **Files:** `luAuthoringState.ts`, `componentNavigation.ts`, `LuAuthoringPanel.tsx`, `EditorLayout.tsx`

---
- **Symptom:** Single-letter tracks (`h`, `v`, `u`), duplicate `\lesson{}` lines, 55% health.
- **Root cause:** Prior auto-scaffold behavior and unfixed add/open paths created invalid data.
- **Status:** **Data cleanup required** — delete junk tracks via explorer or manual `project.json` edit. Fixes above prevent recurrence; no automatic repair migration added.

---

## 3. Files Modified (this pass)

| File | Change |
|------|--------|
| `backend/src/services/luProject/luProjectValidator.ts` | Per-module duplicate lesson ID check |
| `backend/src/services/luProject/luProjectStructureService.ts` | Rename lesson tex sync, emitModuleTex, quiz/resource append, child delete |
| `backend/src/services/luProject/luAuthoringState.ts` | Migration guard |
| `backend/src/services/luProject/luAuthoringTemplates.ts` | Question + resource item scaffolds |
| `frontend/src/lib/luAuthoring/componentNavigation.ts` | **NEW** — kind→section, focus dispatch |
| `frontend/src/lib/luAuthoring/luExplorerMenu.ts` | Add/Open handlers, section mappings |
| `frontend/src/lib/luAuthoring/lessonSections.ts` | Assignment/discussion patterns + labels |
| `frontend/src/components/lu-authoring/LuAuthoringPanel.tsx` | Open/add split, explorer clicks, toasts, expand fix |
| `backend/test-lu-validator-fix.ts` | **NEW** — validator regression |
| `docs/lu-ide-qa-stabilization.md` | **NEW** — this report |

---

## 4. Regression Tests Performed

| Test | Result |
|------|--------|
| `npx tsx test-lu-validator-fix.ts` | ✅ PASS |
| Frontend lint on `LuAuthoringPanel.tsx` | ✅ No errors |
| Full `tsc` backend/frontend | ⚠️ Pre-existing unrelated errors elsewhere |
| Live browser E2E (all workflows) | ⚠️ Pending — backend was not running during this pass |

---

## 5. Recommended Manual Retest (instructor path)

1. **Fresh LU:** Create track → module → lesson → add each component type once.
2. **Open each component** from explorer — verify editor opens and scrolls to correct block.
3. **Add quiz question** twice — verify single quiz container + two question blocks in tex.
4. **Rename lesson** — verify `\lesson{title={...}}` updates.
5. **Project Health** — verify no false duplicate-lesson warnings across modules.
6. **Mode switch** Learning ↔ Developer ↔ Learning — selection, tabs, unsaved state.
7. **Compile + Preview + Publish** on clean project.

---

## 6. Known Remaining Items

- Legacy projects with junk tracks require manual cleanup.
- Question/resource child delete removes JSON child but may not remove matching tex block (partial).
- Full live E2E with auth + running backend not completed in this session.
- Publish flow regression not re-run after structure fixes.

---

## 7. Completion Statement

**Not yet "implementation complete"** for the full enterprise bar requested: automated and live browser verification of every workflow is still required. The highest-impact interaction bugs identified in audit (quiz open, add/open split, false health warnings, duplicate scaffolds, rename sync, silent errors, explorer expand) have been fixed in code and partially regression-tested.

