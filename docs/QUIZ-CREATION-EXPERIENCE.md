# Quiz Creation Experience

Workflow-specific branding — method selection first, then branding inside each workflow.

## Core Principle

**Branding never appears before the instructor chooses a creation method.**

```
Create Quiz  →  Choose Method  →  [Workflow] Branding  →  Details  →  Workflow steps…
```

## Flows

### Manual
```
Create Quiz → Create Manually → Quiz Branding → Quiz Details → Visual Builder
```

### AI Quiz Designer
```
Create Quiz → AI Quiz Designer → Quiz Branding → Quiz Details → AI Wizard → Generate → Review → Builder
```

### Template Library
```
Create Quiz → Template Library → Quiz Branding → Quiz Details → Browse Templates → Preview → Use → Builder
```
- Default: **Keep my branding** (template contributes questions/settings only)
- Optional: **Replace branding**

### Import Questions
```
Create Quiz → Import Questions → Quiz Branding → Quiz Details → Import Source → Review → Builder
```
- Imported questions never overwrite banner/theme

### Duplicate Quiz
```
Create Quiz → Duplicate → Quiz Branding → Quiz Details → Choose Quiz → [Keep branding?] → Builder
```

## Architecture

```
QuizRoomWizard (hub)
├── CreateMethodStep          ← always first
└── [per workflow]
    ├── QuizBrandingWizard    ← shared Step 1
    ├── QuizDetailsStep       ← shared Step 2
    └── Workflow controller   (AI / Import / Template / Duplicate / Manual)
```

### Shared Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `QuizBrandingWizard` | `components/quiz-branding/` | Banner, theme, accent, icon, preview |
| `QuizDetailsStep` | `components/quiz-branding/` | Name, description, metadata |
| `BannerStudio` | `components/course-branding/` | Reused from Course Creation |
| `TemplateMergeDialog` | `components/quiz-branding/` | Merge vs replace branding |
| `DuplicateBrandingDialog` | `components/quiz-branding/` | Keep original vs new branding |

### State

- Workflow state in `QuizRoomWizard` React state
- Persisted to `sessionStorage` (`gatehub-quiz-workflow`) after details step
- Identity stored in `Quiz.metadata` via `/api/quiz-builder`

## Navigation / Back Button

| Current step | Back goes to |
|--------------|--------------|
| Quiz Branding | Create Quiz (method picker) |
| Quiz Details | Quiz Branding |
| AI Wizard | Quiz Details |
| Import Source | Quiz Details |
| Browse Templates | Quiz Details |
| Choose Quiz (duplicate) | Quiz Details |

## APIs

- `POST /api/quiz-builder` — create with identity metadata
- `PATCH /api/quiz-builder/:id/identity` — apply branding to existing quiz
- `POST /api/quiz-builder/:id/duplicate` — `{ keepOriginalBranding, identity }`
- `POST /api/template-library/:id/use` — `{ mergeMode: "merge" \| "replace", identity }`

## Deep Links (skip branding)

- `?returnQuizId=` — add questions to existing quiz (import only)
- `?quizId=` — host live session (settings flow)

## Success Criteria

- [ ] Create Quiz shows method picker first
- [ ] Each method starts with Quiz Branding then Details
- [ ] Same `QuizBrandingWizard` used in all workflows
- [ ] Back from branding returns to method picker
- [ ] Back from AI wizard returns to details (not dashboard)
- [ ] Template merge preserves instructor banner by default
- [ ] Import does not overwrite branding
- [ ] Duplicate asks keep branding yes/no
