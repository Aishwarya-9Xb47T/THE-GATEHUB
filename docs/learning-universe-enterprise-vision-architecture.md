# THE GATEHUB — Learning Universe Enterprise Vision Architecture

**Status:** Architecture & planning document only — no implementation in this deliverable.  
**Integrates with:** LU 2.x (`project.json`, Academic Authoring Studio, LaTeX compile/publish pipeline).  
**Date:** 2025-06-25

---

## 1. Updated Learning Universe Domain Model

### Hierarchy (unchanged shell)

```
Learning Universe
└── Track
    └── Module
        └── Lesson (container)
            └── LessonComponent[] (ordered, independently addressable)
                └── children[] (optional: quiz questions, resource items, milestones)
```

### Lesson as experience container

A **Lesson** is not “a quiz” or “a PDF.” It is a **container** for zero or more **Lesson Components**. Each component has:

| Field | Purpose |
|-------|---------|
| `id` | Globally unique within lesson (`quiz-01`, `coding-lab-02`) |
| `kind` | Component type (see registry below) |
| `title` | Instructor-facing label in explorer |
| `order` | Display + tex marker order |
| `config` | Typed JSON payload (no raw file editing in Learning Mode) |
| `texAnchor` | `% LU:component:{id}` marker in lesson `.tex` (compile/publish bridge) |
| `children` | Nested items (questions, milestones, notebook cells metadata) |
| `permissions` | inherit / override |
| `version` | Optimistic concurrency for autosave |

### Component registry (target)

| Kind | Learning Mode label | Learner runtime | Tex bridge |
|------|---------------------|-----------------|------------|
| `overview` | Overview | Rich text | `\overviewmarkdown{}` |
| `objectives` | Learning Objectives | Bullets | `\theory{title=Objectives}` |
| `topics` | Topics | Rich text | `\theory{title=Topics}` |
| `examples` | Interactive Examples | Embeds | `\theory{title=Examples}` |
| `practice` | Practice | Form / activity | `\practice{}` |
| `coding-lab` | Coding Lab | In-platform IDE + runner | `\codinglab{}` + JSON sidecar |
| `notebook` | Notebook | Cell UI + execution | `\notebook{}` + cell store |
| `project` | Project | Project builder + submission | `\project{}` + `project.json` fragment |
| `research-paper` | Research Paper | Collaborative editor | `\researchpaper{}` + `.tex` section refs |
| `assignment` | Assignment | Upload + rubric | `\assignment{}` |
| `discussion` | Discussion | Thread | `\discussion{}` |
| `resources` | Resources | Links / downloads | `\resource{}`, `\download{}` |
| `quiz` | Quiz | Assessment UI | `\quiz{}` per question block |
| `checkpoint` | Checkpoint | Progress gate | `\checkpoint{}` |
| `reflection` | Reflection | Journal prompt | `\reflection{}` |
| `references` | References | Bibliography | `\references{}` |

**Principle:** Learning Mode edits `config` + explorer metadata. Developer Mode exposes generated artifacts (`lesson.tex`, sidecars, assets). Both stay synchronized via `texAnchor` + regeneration rules.

---

## 2. Component Architecture

### Shared component contract

```typescript
interface LuLessonComponentRef {
  id: string;
  kind: LuLessonComponentKind;
  title: string;
  order: number;
  config: Record<string, unknown>; // Zod-validated per kind
  children?: LuLessonComponentRef[];
  createdAt: string;
  updatedAt: string;
}
```

### Project component (`kind: "project"`)

**Config schema (high level):**

```typescript
interface ProjectComponentConfig {
  introduction: string;
  objectives: string[];
  prerequisites: string[];
  requiredSoftware: { name: string; version?: string; url?: string }[];
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedHours: number;
  instructions: string; // rich text / markdown
  deliverables: { id: string; title: string; description: string; required: boolean }[];
  starterFiles: { path: string; fileId: string }[]; // refs to project assets
  datasets: { name: string; assetId: string }[];
  externalResources: { title: string; url: string }[];
  rubric: { criterion: string; points: number; description: string }[];
  submission: {
    type: "file" | "zip" | "link" | "multi";
    maxFiles: number;
    allowedMime: string[];
    deadline?: string;
    allowLate: boolean;
    resubmissions: number;
  };
  milestones?: { id: string; title: string; dueDate?: string; weight?: number }[];
  completionRule: "all-deliverables" | "instructor-approval" | "auto-tests";
}
```

**Storage:** `config` in `project.json`; starter files in `/assets/projects/{lessonId}/{componentId}/`; tex block for compile summary.

### Coding Lab component (`kind: "coding-lab"`)

```typescript
interface CodingLabConfig {
  language: "python" | "javascript" | "java" | "cpp" | string;
  starterCode: string;
  solutionHidden: string;
  solutionPublic?: string;
  tests: { input: string; expectedOutput: string; hidden: boolean }[];
  timeLimitMs: number;
  memoryLimitMb: number;
  hints: string[];
  sampleIo: { input: string; output: string }[];
}
```

**Runtime:** `CodeExecutionService` (existing) extended with language adapters, sandbox limits, test harness. Learner edits in Monaco; runs via `/api/learning/code/run`.

### Notebook component (`kind: "notebook"`)

```typescript
interface NotebookConfig {
  kernel: "python" | "r" | string;
  cells: {
    id: string;
    type: "markdown" | "code";
    source: string;
    outputs?: unknown[]; // persisted snapshots
  }[];
  executionBackend: "internal" | "colab" | "jupyterhub";
  externalNotebookId?: string;
}
```

**Architecture:** Cell state in DB JSON; execution delegated to backend strategy pattern. OAuth for external providers (see §7).

### Research Paper component (`kind: "research-paper"`)

```typescript
interface ResearchPaperConfig {
  paperType: "literature-review" | "research" | "survey" | "technical-report" | "case-study" | "capstone";
  title: string;
  authors: { name: string; affiliation?: string }[];
  abstract: string;
  keywords: string[];
  sections: { id: string; title: string; content: string; order: number }[];
  figures: { id: string; assetId: string; caption: string }[];
  tables: { id: string; caption: string; data: unknown }[];
  references: { id: string; citation: string; doi?: string }[];
  appendices: { id: string; title: string; content: string }[];
  collaborationEnabled: boolean;
}
```

**Editing:** Yjs CRDT on section documents (reuse existing `yjsServer`); PDF via existing LaTeX pipeline; comments via notification service.

---

## 3. Database / Schema Changes

### Extend `project.json` (LU 2.x — no breaking migration)

- `LuProjectLessonRef.components[].config` — typed per kind
- `LuProjectLessonRef.components[].order` — explicit ordering
- `versionMeta.schemaVersion: 3` when config payloads ship

### New Prisma models (learner runtime — phased)

```
LuComponentSubmission
  id, enrollmentId, lessonId, componentId, kind
  draftPayload Json, submittedPayload Json
  status: draft | submitted | graded | returned
  score, feedback, submittedAt, gradedAt

LuCodingRun
  id, submissionId, language, code, stdout, stderr, passed, runtimeMs

LuNotebookCellState
  id, enrollmentId, componentId, cellId, source, outputs Json

LuOAuthConnection
  userId, provider, scopes, encryptedRefreshToken, expiresAt

LuProjectAsset
  projectId, componentId, path, storageKey, mimeType, size
```

### Indexes

- `(enrollmentId, lessonId, componentId)` unique for submissions
- `(projectId, path)` for assets (existing pattern)

---

## 4. API Design

### Authoring (extends existing)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/latex-projects/:id/lu/state` | Explorer + health (existing) |
| POST | `/latex-projects/:id/lu/structure` | CRUD mutations (existing, extend actions) |
| PATCH | `/latex-projects/:id/lu/components/:componentId` | Update `config` with validation |
| POST | `/latex-projects/:id/lu/components/:componentId/duplicate` | Duplicate component + assets |
| POST | `/latex-projects/:id/lu/components/reorder` | `{ lessonId, orderedIds[] }` |
| POST | `/latex-projects/:id/lu/components/:componentId/assets` | Upload starter file / dataset |

### Learner runtime (new namespace)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/learning/universes/:luId/lessons/:lessonId` | Resolved lesson + components |
| PUT | `/learning/.../components/:id/draft` | Autosave learner work |
| POST | `/learning/.../components/:id/submit` | Final submission |
| POST | `/learning/code/run` | Sandbox execution |
| POST | `/learning/notebook/:id/execute` | Run cell |
| GET | `/learning/submissions/:id/feedback` | Grade + rubric |

### OAuth

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/oauth/:provider/start` | Redirect to provider |
| GET | `/oauth/:provider/callback` | Token exchange, store connection |
| DELETE | `/oauth/:provider` | Revoke + unlink |

---

## 5. UI/UX Flows

### Instructor — create lesson journey

1. Learning Mode → Module → **New Lesson** wizard (title, description)
2. Lesson node → **+ Add** menu → pick component type
3. Component opens **builder panel** (not raw tex):
   - Project → stepped form (Introduction → Deliverables → Rubric → Submission)
   - Coding Lab → language picker + starter code editor + test cases table
   - Notebook → cell list with + Markdown / + Code
   - Research Paper → section outline + collaborative editor
4. Explorer shows each component as **independent node** with rename / duplicate / delete / reorder
5. **Compile** regenerates lesson tex from configs
6. **Publish to LU** runs existing pipeline + structured learner manifest

### Learner — single guided workflow

Lesson page = vertical **progress stepper** driven by `components[]` order:

Theory → Examples → Practice → Coding Lab → Notebook → Project → Quiz → Checkpoint

- Each step autosaves
- Checkpoint gates next section until criteria met
- Submission components show rubric + deadline + draft/submit states

### Developer Mode (unchanged role)

- Raw files, `project.json`, `main.tex`, assets, logs
- Edits trigger **reconciliation job** (tex → config or config → tex per policy)

---

## 6. Permission Model

| Role | Learning Mode | Developer Mode | Learner runtime |
|------|---------------|----------------|-----------------|
| Instructor (owner) | Full CRUD | Full | Preview as learner |
| Co-instructor | CRUD on assigned tracks | Optional | Preview |
| TA | Review submissions, grade | Read-only | Grade |
| Learner | — | — | Draft/submit own work |
| Admin | Platform settings | Audit | — |

- Component-level: inherit lesson permissions unless `config.permissions` overrides
- Submissions: learner read/write own; instructors read all in course
- OAuth tokens: per-user, never shared across accounts

---

## 7. Integration Strategy

### LaTeX compile/publish (existing)

- Each component kind registers **emitter** + **parser** in `learningCommandRegistry`
- `texAnchor` markers preserve round-trip identity
- Publish pipeline merges configs into `structuredData` for LU course runtime

### Code execution

- Phase 1: Python/JS via existing `codeExecutionService`
- Phase 2: containerized runners per language (resource limits, no network by default)

### Notebooks

- Phase 1: Internal cell store + single-kernel runner
- Phase 2: OAuth to Colab/JupyterHub; iframe or API proxy; session tokens short-lived

### Research writing

- Reuse Yjs + LaTeX PDF renderer
- Bibliography: BibTeX asset or structured references → `\bibliography{}` on publish

### OAuth

- Google: Drive import for datasets; optional Colab
- Store refresh tokens encrypted (platform secret); rotate on reconnect

---

## 8. Testing Strategy

| Layer | Approach |
|-------|----------|
| Unit | Zod schemas per component config; ID utils; tex marker round-trip |
| Integration | Structure API mutations; repair pipeline; compile with multi-component lessons |
| E2E | Playwright: create lesson → add each component type → compile → publish → learner submit |
| Security | Sandbox escape tests; OAuth scope minimization; upload MIME validation |
| Regression | Golden `project.json` fixtures; snapshot tex output |

**Gate:** No phase ships without explorer + health + compile + publish green on fixture projects.

---

## 9. Migration Strategy

### Phase 0 (current LU 2.x)

- `components[]` without `config` — tex is source for simple kinds
- Repair on load: dedupe headers, stamp markers, sync components

### Phase 1 — Config introduction

- Add optional `config: {}` per component
- Emitters read config first, fall back to tex parse
- `schemaVersion: 3` bump; backward compatible reads

### Phase 2 — New kinds

- Ship `coding-lab`, `notebook`, `research-paper` behind feature flags
- Migration script: none required for old projects (opt-in per lesson)

### Phase 3 — Learner runtime

- Publish generates `learnerManifest.json` alongside LU publish
- Enrollment progress tracks per `componentId`

---

## 10. Phased Implementation Plan

| Phase | Scope | Duration (est.) | Exit criteria |
|-------|--------|-----------------|---------------|
| **0 — Stabilize** | Fix explorer, markers, multi-component, repair | Now | Explorer loads; quiz focus correct; no runtime errors |
| **1 — Component config** | `config` field + Zod + PATCH API + reorder | 2–3 wks | Project builder UI for basic fields |
| **2 — Coding Lab** | Config + runner UI + learner run | 2 wks | Python lab E2E in platform |
| **3 — Submissions** | `LuComponentSubmission` + drafts + grade | 2 wks | Project submit + instructor feedback |
| **4 — Notebook** | Cell model + internal execution | 3 wks | Notebook lesson E2E |
| **5 — Research Paper** | Sections + Yjs + PDF | 3 wks | Collaborative paper + export |
| **6 — OAuth** | Google linking + Drive import | 1–2 wks | Secure token lifecycle |
| **7 — Polish** | Accessibility, analytics, search | Ongoing | Enterprise QA checklist 100% |

**Explicitly deferred until Phase 1 complete:** new component kinds in production, OAuth, learner submission tables.

---

## Immediate fix applied (Phase 0)

**Bug:** Explorer failed with `repairLuProject is not defined`.  
**Cause:** Missing import in `luAuthoringState.ts` after repair module was added.  
**Fix:** `import { repairLuProject } from "./luProjectRepair.js";`

Restart the backend and hard-refresh the browser to load the explorer.

---

## Document control

| Version | Author | Notes |
|---------|--------|-------|
| 1.0 | THE GATEHUB architecture | Vision + integration with LU 2.x; implementation gated by phase plan |
