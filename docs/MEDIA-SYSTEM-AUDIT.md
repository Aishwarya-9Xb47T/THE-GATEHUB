# Media System Audit

**Date:** 2026-07-06  
**Scope:** Unified media for Quiz Builder, Live Player, Assessment Platform, Homework (future)  
**Goal:** ONE professional media system across all quiz surfaces — comparable to Quizizz, Kahoot, Google Forms.

---

## Executive Summary

Prior to this pass, media handling was fragmented:

- `QuizRichEditor` + `QuizMediaInsertDialog` + `quizMediaUpload.ts` (quiz-only)
- `MarkdownContent` + lesson `markdownComponents` (course content, incorrectly reused for quizzes)
- Plain `{text}` in assessment platform renderers
- Filenames and alt text leaked into previews (`nsaishwarya`, `Komala_signature`, `Media`)

**This pass introduces a shared media layer at `frontend/src/components/media/`** and wires it through editors, previews, live session, and assessment platform renderers.

| Task | Status |
|------|--------|
| 1 — Unified MediaUploader | ✅ `MediaUploader` + `uploadMedia()` |
| 2 — Toolbar actions work everywhere | ✅ `MediaToolbar` via `RichContentEditor` on all rich fields |
| 3 — Hide internal file info | ✅ Empty alt, generic labels, no figcaptions in preview |
| 4 — Consistent preview | ✅ `MediaRenderer` everywhere for display |
| 5 — Option media all types | ✅ Options, ordering, matching use `RichContentEditor` |
| 6 — Rendering audit | ⚠️ Builder/Live/Preview done; Reports/Projector pending |
| 7 — Component refactor | ✅ Shared components created |
| 8 — Professional UX | ⚠️ Progress, retry, preview-before-insert; WYSIWYG editor deferred |
| 9 — Question type audit | ⚠️ Documented per-type below |

---

## Screenshots — Issues Found (Before Fix)

### Internal filename shown as figcaption

![Filename visible under image](../assets/c__Users_texta_AppData_Roaming_Cursor_User_workspaceStorage_92a48974da152a3b47918a2158f865a0_images_Screenshot__9285_-ae31e024-2783-40c6-a9b2-7e86c1cd68d1.png)

**Root cause:** `buildImageMarkdown(url, file.name)` stored filename as alt; `markdownComponents` rendered `<figcaption>{alt}</figcaption>`.

---

### Toast and markdown expose internal names

![Toast shows Komala_signature; raw markdown in option editor](../assets/c__Users_texta_AppData_Roaming_Cursor_User_workspaceStorage_92a48974da152a3b47918a2158f865a0_images_Screenshot__9286_-3dfcf922-01b3-4b99-a59e-6851610f3a41.png)

**Root cause:** Upload flow used `file.name` for alt, link text, and toast description.

---

### Generic "Media" label from placeholder alt

![Media label under external image URL](../assets/c__Users_texta_AppData_Roaming_Cursor_User_workspaceStorage_92a48974da152a3b47918a2158f865a0_images_Screenshot__9284_-3c29f3f9-7161-42c5-8b8f-4851a3ac45dd.png)

**Root cause:** URL insert defaulted alt to `"Media"` which was rendered as visible caption text.

---

## Shared Components Created

| Component | Path | Role |
|-----------|------|------|
| **MediaUploader** | `components/media/MediaUploader.tsx` | Dialog: browse, drag-drop, URL, progress, retry, preview-before-insert |
| **MediaRenderer** | `components/media/MediaRenderer.tsx` | **Single display renderer** for all quiz/assessment surfaces |
| **MediaToolbar** | `components/media/MediaToolbar.tsx` | Image, video, audio, file, link, formula, code, table |
| **MediaPreview** | `components/media/MediaPreview.tsx` | Live preview panel wrapper |
| **MediaAttachment** | `components/media/MediaAttachment.tsx` | Attachment chip (no filename) |
| **RichContentEditor** | `components/media/RichContentEditor.tsx` | Editor composing toolbar + uploader + preview |
| **uploadMedia** | `components/media/mediaUpload.ts` | Single upload API with XHR progress |
| **mediaMarkdown** | `components/media/mediaMarkdown.ts` | Markdown builders with no internal metadata |
| **mediaComponents** | `components/media/mediaComponents.tsx` | React-markdown overrides for quiz surfaces |

**Public API:** `import { MediaRenderer, RichContentEditor, MediaUploader, uploadMedia } from "@/components/media"`

**Backward compat:** `QuizRichEditor` re-exports `RichContentEditor`; `quizMediaUpload.ts` / `quizMarkdown.ts` re-export from `components/media`.

---

## Inconsistencies Found & Resolution

### MS-001 — Duplicate upload implementations

| | |
|--|--|
| **Root cause** | `quizMediaUpload.ts`, `QuizMediaInsertDialog`, inline paste/drop in `QuizRichEditor` |
| **Files** | `quiz-builder/studio/*`, `lib/quizBuilder/*` |
| **Fix** | Consolidated into `uploadMedia()` + `MediaUploader` |
| **Priority** | P0 ✅ |

---

### MS-002 — Two renderers (lesson vs quiz)

| | |
|--|--|
| **Root cause** | Quiz surfaces used `MarkdownContent` with lesson `markdownComponents` (figcaptions, callout detection) |
| **Files** | `MarkdownContent.tsx`, `markdownComponents.tsx`, all quiz preview/live files |
| **Fix** | Quiz surfaces now use `MediaRenderer` with `mediaComponents` (no figcaptions, no filename labels) |
| **Priority** | P0 ✅ |

---

### MS-003 — Filenames in stored markdown

| | |
|--|--|
| **Root cause** | `![filename](/uploads/uuid.png)` pattern |
| **Fix** | New inserts use `![](/uploads/uuid.png)` — empty alt; attachments use `[Attachment](url)` |
| **Note** | Legacy content with filename alts still stored; `isInternalMetadataLabel()` hides them in preview |
| **Priority** | P0 ✅ (new content); P2 (migrate legacy) |

---

### MS-004 — Assessment platform plain text choices

| | |
|--|--|
| **Root cause** | `ChoiceListRenderer` rendered `{text}` and `{question.stem}` as strings |
| **Files** | `assessment-platform/renderers/ChoiceListRenderer.tsx`, `EssayRenderer.tsx` |
| **Fix** | Switched to `MediaRenderer` for stem, choices, feedback |
| **Priority** | P0 ✅ |

---

### MS-005 — Option editor stub buttons

| | |
|--|--|
| **Root cause** | Image/Mic icons in `OptionCardList` had no handlers |
| **Fix** | Full `RichContentEditor` on option text + explanation |
| **Priority** | P0 ✅ |

---

### MS-006 — Ordering / matching plain inputs

| | |
|--|--|
| **Root cause** | `OrderingEditor` / `MatchingEditor` used `<Input>` only |
| **Files** | `QuestionTypeEditor.tsx` |
| **Fix** | `QuizRichEditor` (→ `RichContentEditor`) on all option fields |
| **Priority** | P1 ✅ |

---

### MS-007 — Video/audio HTML not parsed by react-markdown

| | |
|--|--|
| **Root cause** | No `rehype-raw`; `<video>` / `<audio>` tags in markdown ignored |
| **Fix** | Video/audio stored as `![](url)`; `MediaImage` detects extension and renders `<video>` / `<audio>` |
| **Priority** | P1 ✅ |

---

### MS-008 — LaTeX / formula toolbar inserts `$...$` but does not render

| | |
|--|--|
| **Root cause** | No `remark-math` / `react-katex` in `MediaRenderer` |
| **Files** | `MediaRenderer.tsx`, `MediaToolbar.tsx` |
| **Recommended fix** | Add `remark-math` + `rehype-katex` to `MediaRenderer` only |
| **Priority** | P1 — Open |

---

### MS-009 — Editor still shows raw markdown (UUIDs visible while editing)

| | |
|--|--|
| **Root cause** | Textarea-based editor stores markdown source |
| **User impact** | Authors see `![](/uploads/uuid.png)` in textarea |
| **Recommended fix** | Block-based WYSIWYG editor (Phase 2); or collapse media blocks to chips |
| **Priority** | P2 — Open |

---

### MS-010 — Google Drive picker not integrated

| | |
|--|--|
| **Root cause** | No Picker API wiring for quiz media |
| **Priority** | P2 — Open |

---

### MS-011 — Reports / Projector / Homework players not wired

| | |
|--|--|
| **Root cause** | Features not built yet (A2/A4) |
| **Files** | N/A — use `MediaRenderer` when implemented |
| **Priority** | P2 — Blocked on feature |

---

### MS-012 — Media question type URL field only

| | |
|--|--|
| **Root cause** | `MediaFields` in `QuestionTypeEditor` is plain URL input |
| **Files** | `QuestionTypeEditor.tsx` `MediaFields` |
| **Recommended fix** | Replace with `MediaUploader` trigger + `MediaRenderer` preview |
| **Priority** | P1 — Open |

---

### MS-013 — Replace / delete media in editor

| | |
|--|--|
| **Root cause** | No block-level media management; authors edit markdown manually |
| **Recommended fix** | Media block chips with replace/delete in WYSIWYG phase |
| **Priority** | P2 — Open |

---

### MS-014 — Multiple uploads in one action

| | |
|--|--|
| **Root cause** | Uploader accepts one file per dialog session |
| **Recommended fix** | `multiple` on file input + sequential insert |
| **Priority** | P3 — Open |

---

## Surface Coverage Matrix

| Surface | Editor | Display | Status |
|---------|--------|---------|--------|
| Question stem | `RichContentEditor` | `MediaRenderer` | ✅ |
| Question explanation | `RichContentEditor` | `MediaRenderer` | ✅ |
| Option text | `RichContentEditor` | `MediaRenderer` | ✅ |
| Option explanation | `RichContentEditor` | `MediaRenderer` | ✅ |
| Context / scenario | `RichContentEditor` | `MediaRenderer` | ✅ |
| Ordering items | `RichContentEditor` | `MediaRenderer` | ✅ |
| Matching pairs | `RichContentEditor` | `MediaRenderer` | ✅ |
| Builder live preview | — | `MediaPreview` → `MediaRenderer` | ✅ |
| Student preview pane | — | `MediaRenderer` | ✅ |
| Student preview modal | — | `MediaRenderer` | ✅ |
| Live question display | — | `MediaRenderer` | ✅ |
| Live answer feedback | — | `MediaRenderer` | ✅ |
| Assessment player (MCQ) | — | `MediaRenderer` | ✅ |
| Assessment player (essay) | — | `MediaRenderer` | ✅ |
| Homework player | — | Not built | ⏳ Use `MediaRenderer` |
| Review mode | — | Via assessment player | ✅ |
| Reports | — | Not built | ⏳ |
| Projector view | — | Not built | ⏳ |

---

## Question Type Audit (Task 9)

| Type | Options use rich editor | Preview renders media | Notes |
|------|-------------------------|----------------------|-------|
| Single Choice (MCQ) | ✅ | ✅ | |
| Multiple Select | ✅ | ✅ | Via `ChoiceListRenderer` |
| True/False | ✅ | ✅ | Default True/False text preserved |
| Poll | ✅ | ✅ | |
| Image Choice / image_based | ✅ | ✅ | `MediaFields` URL still plain — MS-012 |
| Video / Audio based | ✅ | ✅ | Stem + `MediaFields` gap |
| Fill Blank | N/A (answer field) | ✅ stem | Answer is plain text by design |
| Short Answer | N/A | ✅ stem | |
| Essay | N/A | ✅ stem | |
| Numerical | N/A | ✅ stem | |
| Ordering / Sequence | ✅ | ✅ | Fixed this pass |
| Matching / Matrix | ✅ | ✅ | Fixed this pass |
| Hotspot | N/A | ✅ stem | Hotspot regions separate |
| Coding / SQL / Debug | N/A | ✅ stem | Monaco for code |
| Case Study / Scenario | ✅ context | ✅ | |
| Survey | ✅ | ✅ | Same as poll/MCQ |

---

## Toolbar Action Audit (Task 2)

| Action | Question | Option | Explanation | Renders in preview |
|--------|----------|--------|-------------|-------------------|
| Image | ✅ upload/paste/URL | ✅ | ✅ | ✅ |
| Video | ✅ | ✅ | ✅ | ✅ (extension / YouTube link) |
| Audio | ✅ | ✅ | ✅ | ✅ |
| Attachment | ✅ | ✅ | ✅ | ✅ (generic label) |
| Link | ✅ | ✅ | ✅ | ✅ |
| Formula | ✅ inserts `$…$` | ✅ | ✅ | ❌ MS-008 |
| Code block | ✅ | ✅ | ✅ | ✅ |
| Table | ✅ | ✅ | ✅ | ✅ |
| Bold/Italic/etc. | ✅ | ✅ | ✅ | ✅ |
| Underline `<u>` | ✅ inserts | ✅ | ✅ | ⚠️ needs raw HTML support |

All actions use the same `MediaToolbar` — none are stub buttons.

---

## Files Modified (This Pass)

### New
- `frontend/src/components/media/*` (10 files)

### Updated
- `frontend/src/components/quiz-builder/studio/QuizRichEditor.tsx` — re-export
- `frontend/src/components/quiz-builder/studio/QuizMediaInsertDialog.tsx` — re-export
- `frontend/src/lib/quizBuilder/quizMarkdown.ts` — re-export
- `frontend/src/lib/quizBuilder/quizMediaUpload.ts` — re-export
- `frontend/src/components/quiz-builder/QuestionTypeEditor.tsx`
- `frontend/src/components/quiz-builder/studio/StudentPreviewPane.tsx`
- `frontend/src/components/quiz-builder/studio/StudentPreviewStudio.tsx`
- `frontend/src/components/live-session/LiveQuestionDisplay.tsx`
- `frontend/src/components/live-session/LiveAnswerFeedback.tsx`
- `frontend/src/assessment-platform/renderers/ChoiceListRenderer.tsx`
- `frontend/src/assessment-platform/renderers/EssayRenderer.tsx`
- `frontend/src/components/learning/markdownComponents.tsx` — reverted quiz-specific img hack

---

## Remaining Work (Do Before Homework GA)

| Priority | Item |
|----------|------|
| **P1** | MS-008 — KaTeX rendering in `MediaRenderer` |
| **P1** | MS-012 — `MediaFields` → `MediaUploader` for image/video/audio question types |
| **P2** | MS-009 — WYSIWYG or media chips to hide UUIDs in editor |
| **P2** | MS-010 — Google Drive picker |
| **P2** | MS-011 — Wire `MediaRenderer` when Homework/Reports/Projector ship |
| **P2** | MS-003 — Optional migration script to strip filename alts from stored markdown |
| **P3** | MS-013, MS-014 — Replace/delete blocks, multi-upload |

---

## Usage Guide (For Developers)

```tsx
// Display rich content anywhere in quiz platform
import { MediaRenderer } from "@/components/media";
<MediaRenderer content={question.text} />

// Authoring
import { RichContentEditor } from "@/components/media";
<RichContentEditor value={text} onChange={setText} label="Question stem" />

// Upload only
import { uploadMedia, buildImageMarkdown } from "@/components/media";
const url = await uploadMedia(file, { onProgress: setPct });
insert(buildImageMarkdown(url)); // ![](url) — no filename
```

**Rule:** Never use `MarkdownContent` for quiz/assessment surfaces. Use `MediaRenderer`.

---

## Sign-off

- [x] Single `uploadMedia` entry point
- [x] Single `MediaRenderer` for all quiz display surfaces
- [x] No filenames in preview for new uploads
- [x] Options support full toolbar
- [ ] LaTeX renders in preview
- [ ] Media question types use uploader
- [ ] Homework player uses `MediaRenderer`

*Homework implementation remains blocked until P1 items are closed.*
