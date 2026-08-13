# THE GATEHUB Learning Universe IDE 3.0 — Architecture

**Status:** Architecture (pre-implementation)  
**Date:** 2026-06-25  
**Supersedes:** Overleaf-centric mental model; extends LU 2.0/2.1 foundation  
**Principle:** LaTeX is the rendering engine. The product is an educational authoring IDE.

---

## Executive Summary

Learning Universe IDE 3.0 transforms the current Academic Authoring Studio from an Overleaf-style LaTeX editor with an educational sidebar into a **VS Code–class workspace** where instructors manipulate **educational objects** (tracks, lessons, topics, quizzes, projects) stored as independent files. `main.tex` is a **generated build artifact**, never user-editable.

This document defines the target architecture. **No implementation should begin until this document is reviewed.** Implementation proceeds incrementally by **refactoring** existing services under `backend/src/services/luProject/` and `frontend/src/components/lu-authoring/`, preserving backward compatibility and all working publish flows.

### What Already Exists (LU 2.0/2.1 — keep and extend)

| Capability | Location | IDE 3.0 action |
|------------|----------|----------------|
| `project.json` manifest | `luProjectSchema.ts` | Evolve to schema v3 |
| Generated `main.tex` | `luProjectMainTexBuilder.ts` | Keep; extend for scoped compiles |
| Include resolver | `luIncludeResolver.ts` | Extend for partial merge |
| Publish pipeline (10 stages) | `luPublishPipeline.ts` | Extend per Rule 8 |
| Structure mutations | `luProjectStructureService.ts` | Extend for granular lesson files |
| Explorer + health | `luAuthoringState.ts`, `LuAuthoringPanel.tsx` | Virtualize + lazy load |
| Migration single-file → v2 | `migrateSingleFileToProject.ts` | Chain to v3 splitter |
| Validation | `luProjectValidator.ts` | Per-node + incremental |
| Error mapping | `luErrorMapper.ts` | Keep |
| Search index / student package | `luSearchIndexService.ts` | Keep |
| Yjs per-file collab | `yjsServer.ts`, `LatexMonaco.tsx` | Extend manifest sync |
| Version history | `latexVersionService.ts` | Per-file + project snapshots |
| Developer Mode | `EditorLayout.tsx` | Keep as escape hatch |

---

## Absolute Rules (Architecture Enforcement)

| Rule | Enforcement mechanism |
|------|----------------------|
| R1: `main.tex` never edited | DB 403 on PUT; UI read-only; regen on every structure change |
| R2: One educational unit → own files | `project.json` lesson manifest; emitter creates file set |
| R3: Explorer is primary UI | Default panel = `LuExplorer`; FileTree only in Developer Mode |
| R4: Node opens only its file(s) | Explorer `openNode` → single file path; no merged editor |
| R5: Independent save per file | Per-file autosave, version, validation, collab |
| R6: Scoped compilation | `CompileScope` API + partial resolver |
| R7: Scoped PDF preview | Preview level selector tied to compile scope |
| R8: Project-based publish | `runLuPublishPipeline(projectId)` only; never raw `main.tex` upload |
| R9: Validation on every level | Node status + live health aggregation |
| R10: Enterprise scale | Lazy load, virtualize, index, cache — see §15 |
| R11: Educational object UX | Wizards, templates, no TeX terminology in default UI |
| R12: Backward compatibility | v1 single-file → v2 → v3 migration chain; published LUs unchanged |

---

## 1. Folder Hierarchy

### 1.1 Canonical on-disk layout (schema v3 target)

```
{project-root}/
├── project.json                 # Manifest — single source of truth
├── main.tex                     # GENERATED — build artifact (Rule 1)
├── metadata.tex                 # Universe-level metadata block
├── bibliography.bib             # Shared references
├── output/                      # Compile artifacts (gitignored from publish)
│   ├── preview/
│   └── publish/
├── assets/                      # Binary assets (refs in project.json.assets)
│   ├── images/
│   ├── videos/
│   ├── datasets/
│   ├── downloads/
│   └── thumbnails/
├── legacy-backup/               # Post-migration originals
│   └── original-main.tex
└── tracks/
    └── {track-slug}/            # e.g. track-01-machine-learning-foundations
        ├── track.tex            # GENERATED — \input modules
        ├── track.meta.json      # Track-level metadata (optional, v3)
        └── modules/
            └── {module-slug}/   # e.g. module-01-introduction-to-ai
                ├── module.tex   # GENERATED — \input lessons
                ├── module.meta.json
                └── lessons/
                    └── {lesson-slug}/   # e.g. lesson-01-what-is-ai
                        ├── lesson.tex           # GENERATED entry — \input components
                        ├── lesson.manifest.json # Component file registry (v3)
                        ├── overview.tex
                        ├── learning-objectives.tex
                        ├── prerequisites.tex
                        ├── introduction.tex
                        ├── topics/
                        │   ├── topic-01.tex
                        │   ├── topic-02.tex
                        │   └── topic-03.tex
                        ├── examples/
                        │   ├── example-01.tex
                        │   └── example-02.tex
                        ├── exercise.tex
                        ├── assignment.tex
                        ├── quiz.tex
                        ├── project.tex
                        ├── discussion.tex
                        ├── summary.tex
                        ├── resources.tex
                        └── references.bib       # Lesson-local bib (optional)
```

### 1.2 LU 2.0 layout (current — supported indefinitely)

```
/track-01/
  track.tex
  module-01/
    module.tex
    lesson-01.tex          # All blocks in one file (virtual explorer children)
```

IDE 3.0 **reads both layouts**. v2 lessons appear as collapsed explorer nodes (Overview, Quiz, etc. detected via DSL parsing). v3 lessons expose real file nodes.

### 1.3 Path conventions

- All DB paths are POSIX-style with leading `/`: `/tracks/track-01/modules/module-01/lessons/lesson-01/overview.tex`
- Slugs: `kebab-case`, stable IDs in `project.json` (`track-01`, `lesson-01-what-is-ai`)
- Generated files carry `generated: true` in manifest; user files carry `editable: true`

---

## 2. Project Manifest Schema (`project.json`)

### 2.1 Schema evolution

| Version | Status | Description |
|---------|--------|-------------|
| v1 | Legacy | Implicit — single `main.tex`, no manifest |
| v2 | **Current** | `LU_SCHEMA_VERSION = 2`; one `.tex` per lesson |
| v3 | **Target** | Lesson component manifests; scoped compile metadata; index pointers |

### 2.2 `project.json` v3 (target schema)

```typescript
interface LuProjectJsonV3 {
  version: 3;
  projectType: "learning-universe";
  metadata: {
    title: string;
    createdAt: string;
    updatedAt: string;
    migratedFrom?: "single-file" | "v2";
    migrationBackupPath?: string;
    layoutVersion: 2 | 3;           // disk layout generation
  };
  universe: {
    title: string;
    description?: string;
    difficulty?: string;
    estimatedHours?: number;
    skills?: string[];
    category?: string;
  };
  tracks: LuTrackRefV3[];
  assets: LuAssetRef[];
  compile: {
    mainFile: "/main.tex";
    entryPoint: "/main.tex";
    generatedMain: true;
    defaultScope: CompileScope;
    lastCompile?: CompileRecord;
  };
  publish: {
    lastPublishedAt?: string;
    lastPipelineVersion?: string;
    lastManifestHash?: string;
  };
  index: {
    // Pointers to background-built indexes (not inline — scale)
    nodeIndexPath: "/.lu/index/nodes.json";
    searchIndexPath: "/.lu/index/search.json";
    validationCachePath: "/.lu/index/validation.json";
    fileChecksumPath: "/.lu/index/checksums.json";
  };
  versionMeta: {
    schemaVersion: 3;
    lastMainTexHash?: string;
  };
}

interface LuTrackRefV3 {
  id: string;
  slug: string;
  folder: string;           // tracks/track-01-...
  title: string;
  description?: string;
  order: number;
  modules: LuModuleRefV3[];
}

interface LuModuleRefV3 {
  id: string;
  slug: string;
  folder: string;
  title: string;
  order: number;
  estimatedHours?: number;
  lessons: LuLessonRefV3[];
}

interface LuLessonRefV3 {
  id: string;
  slug: string;
  folder: string;
  title: string;
  order: number;
  layout: "monolithic" | "modular";  // monolithic = v2 compat (one .tex)
  entryFile: string;                 // lesson.tex or lesson-01.tex
  components?: LuLessonComponent[];  // only when layout === "modular"
}

interface LuLessonComponent {
  id: string;                        // "overview", "topic-01", "quiz"
  kind: LuComponentKind;
  title: string;                     // Display name in explorer
  file: string;                      // Relative to lesson folder
  required: boolean;
  order: number;
  status?: LuNodeStatus;             // Cached; authoritative in index
}

type LuComponentKind =
  | "overview" | "objectives" | "prerequisites" | "introduction"
  | "topic" | "example" | "exercise" | "assignment"
  | "quiz" | "project" | "discussion" | "summary"
  | "resources" | "references" | "custom";

type CompileScope =
  | { type: "file"; path: string }
  | { type: "lesson"; trackId: string; moduleId: string; lessonId: string }
  | { type: "module"; trackId: string; moduleId: string }
  | { type: "track"; trackId: string }
  | { type: "changed" }
  | { type: "universe" };
```

### 2.3 v2 → v3 compatibility

- `parseLuProjectJson()` accepts v2 and normalizes to internal `LuProjectModelV3` with `layout: "monolithic"` on lessons
- No forced migration; v2 projects work forever
- Optional **"Modularize lesson"** wizard splits `lesson-01.tex` into component files

---

## 3. Internal Data Model

### 3.1 Layered model (server-side)

```
┌─────────────────────────────────────────────────────────┐
│  LuProjectModel (normalized, in-memory)                 │
│  - project.json parsed                                  │
│  - index overlays (node status, checksums)              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  LuFileStore (Prisma latexFile rows)                    │
│  - path, content, isFolder, updatedAt, s3Url            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  LuIndexStore (generated JSON in /.lu/index/)           │
│  - node tree metadata without file contents             │
│  - validation cache                                     │
│  - search inverted index                                │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  LuPublishRecord (DB learningUniverse + structuredData) │
│  - contentBlocks, studentPackage, searchIndex           │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Core types (new package: `luIdeModel`)

| Type | Purpose |
|------|---------|
| `LuProjectModel` | Normalized manifest + resolved paths |
| `LuNodeRef` | Stable ID for any explorer node (track…component) |
| `LuFileRef` | `{ projectId, path, fileId, checksum, lastEdited, authorId }` |
| `LuNodeState` | `{ status, issues[], compileStatus, lastValidated }` |
| `LuCompileJob` | `{ scope, status, pdfPath, errors[], lineMap }` |
| `LuPublishManifest` | Output of publish pipeline for audit |

### 3.3 Explorer node identity

Every explorer row maps to:

```typescript
interface LuExplorerNodeV3 {
  id: string;              // "track:track-01" | "lesson:...:component:quiz"
  kind: LuNodeKind;
  title: string;
  parentId?: string;
  children?: LuExplorerNodeV3[];  // Populated lazily
  hasChildren: boolean;           // For expand-without-load
  filePath?: string;              // Single file to open in editor
  filePaths?: string[];           // Multi-file nodes (references)
  status: LuNodeStatus;
  issues: LuValidationIssue[];
  meta: {
    trackId?: string;
    moduleId?: string;
    lessonId?: string;
    componentId?: string;
    order: number;
    lastEdited?: string;
    authorId?: string;
  };
}
```

**v2 virtual nodes** (Quiz, Project inside monolithic lesson) remain virtual until user chooses "Split into files".

---

## 4. Explorer Architecture

### 4.1 Design principles

- **Educational hierarchy only** in default mode (Rule 3)
- **Lazy children**: expanding a track fetches modules; expanding a module fetches lessons; expanding a lesson fetches components
- **Virtualized rendering**: `@tanstack/react-virtual` or equivalent for 10k+ nodes
- **No raw paths in labels** — show "Topic 1: Neural Networks" not `topic-01.tex`

### 4.2 Frontend component tree

```
LuIdeShell (replaces Overleaf chrome for mode=learning-universe)
├── LuIdeToolbar (compile scope, preview level, publish, health)
├── LuExplorerPanel (primary — default visible)
│   ├── LuProjectDashboard (health, progress, stats)
│   ├── LuExplorerSearch (filter nodes)
│   └── LuVirtualizedTree
│       ├── LuTreeNode (recursive, lazy)
│       ├── LuContextMenu
│       └── LuWizardHost
├── LuEditorArea
│   ├── LuEditorTabs (one tab per open file)
│   ├── LuMonacoPane (cached models)
│   └── LuEditorStatusBar (validation, save, collab)
├── LuPreviewPanel (scoped PDF)
└── LuDiagnosticsPanel (errors, validation, compile log)
```

**Refactor path:** Evolve `LuAuthoringPanel` → `LuExplorerPanel`; slim `EditorLayout` LU branch → `LuIdeShell`.

### 4.3 Lazy loading protocol

```
GET /latex-projects/:id/lu/explorer?parent=track:track-01&depth=1
→ { nodes: LuExplorerNodeV3[], health: partial }

GET /latex-projects/:id/lu/node/:nodeId
→ { node, fileRefs, status, issues }
```

Initial page load fetches **universe + track list only** (~50 nodes max), not 10k files.

### 4.4 Node actions (wizards)

| Action | Creates |
|--------|---------|
| Add Track | `track.tex`, folder, manifest entry |
| Add Module | `module.tex`, `lesson-01/` with full component scaffold |
| Add Lesson | lesson folder + default component set |
| Add Topic | `topics/topic-NN.tex` + manifest entry |
| Add Quiz / Project / … | component file from `luAuthoringTemplates.ts` |

Existing `luProjectStructureService.ts` `StructureAction` union extended, not replaced.

---

## 5. File Ownership Model

### 5.1 Ownership classes

| Class | Editable | Examples | Regenerated when |
|-------|----------|----------|------------------|
| **Generated** | Never | `main.tex`, `track.tex`, `module.tex`, `lesson.tex` | Any manifest or child file change |
| **Authored** | Yes | `overview.tex`, `quiz.tex`, `topic-01.tex` | — |
| **Asset** | Upload/replace | `assets/images/*` | — |
| **Index** | System | `/.lu/index/*` | Background workers |
| **Backup** | Read-only | `legacy-backup/*` | Migration |

### 5.2 File record extensions (Prisma — future migration)

Extend `LatexFile` or add `LuFileMeta`:

```prisma
model LuFileMeta {
  id          String   @id @default(cuid())
  fileId      String   @unique
  nodeId      String?  // explorer node binding
  kind        String   // "authored" | "generated" | "asset" | "index"
  checksum    String?
  lastValidatedAt DateTime?
  validationStatus String?
  compileStatus    String?
  authorId    String?
  file        LatexFile @relation(...)
}
```

**Phase 1:** Store in `/.lu/index/file-meta.json` without Prisma migration. **Phase 2:** Promote to DB when scale requires.

### 5.3 Open-file contract

```
openNode(nodeId) → resolve filePath → Monaco loads single file
```

Never load entire lesson into one buffer unless `layout === "monolithic"` (v2 compat).

---

## 6. Compile Pipeline

### 6.1 Scoped compile flow

```
User selects scope
       ↓
LuCompilePlanner.plan(scope, projectModel)
  → minimal file set + synthetic wrapper .tex
       ↓
LuPartialResolver.resolve(scope)
  → merged TeX for scope only (not full universe)
       ↓
latexCompileService.compile(workspaceId, mergedTex)
       ↓
luErrorMapper.mapErrors(lineMap)
       ↓
Store PDF at output/preview/{scope-hash}.pdf
       ↓
Return { pdfUrl, errors, affectedNodes }
```

### 6.2 Wrapper generation (example: lesson scope)

```latex
% GENERATED compile wrapper — lesson:lesson-01
\documentclass{article}
% ... preamble from metadata ...
\begin{document}
\input{tracks/track-01/modules/module-01/lessons/lesson-01/lesson}
\end{document}
```

`lesson.tex` (generated) contains ordered `\input` of components per manifest.

### 6.3 Compile modes (Rule 6)

| Mode | Trigger | Implementation |
|------|---------|----------------|
| Current file | Editor focus | Wrap single file with minimal preamble |
| Lesson | Explorer lesson → Compile | `lesson.tex` wrapper |
| Module | Module context menu | `module.tex` wrapper |
| Track | Track context menu | `track.tex` wrapper |
| Changed files | Toolbar / auto | Diff against checksum index |
| Full universe | Publish preview | Existing full resolve (current behavior) |

### 6.4 Existing code reuse

- `luIncludeResolver.ts` → extract `resolveScope(scope, files)` 
- `latexCompileService.ts` → unchanged engine
- `luErrorMapper.ts` → unchanged mapping
- New: `luCompilePlanner.ts`, `luPartialResolver.ts`

---

## 7. Publish Pipeline

### 7.1 Target pipeline (Rule 8 — extends existing 10 stages)

```
1.  validate_project          ← validateLuProjectStructure + per-node index
2.  resolve_dependencies      ← luIncludeResolver (full merge)
3.  resolve_assets            ← NEW: verify asset refs, upload missing
4.  resolve_bibliography      ← NEW: merge .bib files
5.  generate_merged_source    ← merged DSL (transient, not stored as main.tex)
6.  generate_main_tex         ← buildMainTexFromProject → write temp
7.  compile_pdf               ← compileLatexLocally
8.  parse_dsl                 ← parseLearningUniverseLatex
9.  generate_content_blocks   ← toStructured()
10. validate_content_blocks   ← validateParsed + structured
11. generate_student_package  ← generateStudentPackage
12. generate_instructor_package ← NEW
13. generate_search_index     ← generateLuSearchIndex
14. generate_analytics_metadata
15. generate_certificate_metadata ← NEW (from DSL certificatecriteria)
16. generate_publish_manifest   ← NEW: audit JSON
17. publish                   ← publishLearningUniverse
18. write_back_manifest       ← NEW: publish.* on project.json
```

### 7.2 Existing implementation

`runLuPublishPipeline()` in `luPublishPipeline.ts` implements stages 1–10 (subset). **Extend in place** — do not duplicate.

### 7.3 Publish entry points

- **Only** `POST /learning-universes/publish` with `projectId`
- Frontend `publishLearningUniverse()` must always pass `projectId`; `dslSource` in body is ignored when `projectId` present (already partially true)

---

## 8. Validation Pipeline

### 8.1 Validation layers

| Layer | When | Scope | Blocking? |
|-------|------|-------|-----------|
| **Structural** | Save manifest / structure mutation | project.json refs | Publish |
| **File syntax** | Save file / debounced | Single .tex | Warning |
| **Component** | Save file | Required blocks per kind | Warning |
| **Lesson** | Lesson compile / manual | All lesson files | Publish |
| **Module** | Module compile | All lessons | Publish |
| **Project** | Publish | Full tree | Publish |

### 8.2 Node status (Rule 9)

```
empty    → file missing or zero content
draft    → content exists, warnings present
complete → required content satisfied, no warnings
warning  → non-blocking issues
error    → blocking issues (missing quiz answer, broken asset ref)
```

### 8.3 Health score (existing — extend)

Current: `computeHealth()` in `luAuthoringState.ts` (0–100, readyToPublish ≥ 80).

**v3:** Weight by node kind (quiz/project weighted higher); incremental recompute on changed subtree only.

### 8.4 Incremental validation

```
onFileSave(path) →
  validateFile(path) →
  updateNodeStatus(nodeId) →
  propagateHealth(parentIds) →
  PATCH /.lu/index/validation.json
```

Background: full revalidation nightly or on publish.

---

## 9. Asset Management Architecture

### 9.1 Asset registry

`project.json.assets[]` is authoritative. Each entry:

```typescript
interface LuAssetRef {
  id: string;
  path: string;           // /assets/images/diagram-01.png
  filename: string;
  mimeType: string;
  category: AssetCategory;
  checksum?: string;
  sizeBytes?: number;
  usedBy: string[];       // node IDs referencing this asset
  uploadedAt: string;
  uploadedBy: string;
}
```

### 9.2 Upload flow

```
Explorer → Add Image →
  POST /latex-projects/:id/files/upload (existing) →
  Register in project.json.assets + usedBy →
  Insert \image{...} or wizard snippet into active component file
```

### 9.3 Publish-time asset resolution (new stage)

- Walk all `.tex` for `\image`, `\video`, asset paths
- Verify file exists in DB / S3
- Copy to publish bundle
- Fail publish with `ASSET_NOT_FOUND` if blocking

### 9.4 Scale

- Assets never loaded into Monaco
- Thumbnails via `/latex-projects/:id/assets/:assetId/thumb`
- Large files (videos, datasets) — metadata only in explorer

---

## 10. Monaco Loading Strategy

### 10.1 Principles (Rule 10)

- **One model per open file** — never one model for whole project
- **LRU cache** — max N open models (default 20); dispose on tab close
- **Lazy fetch** — content loaded on tab open via `GET .../files/content?fileId=`
- **No full project fetch** — ban `loadProjectFiles` from frontend paths

### 10.2 Tab model

```typescript
interface LuEditorTab {
  fileId: string;
  path: string;
  title: string;          // Educational name
  modelUri: string;       // monaco.Uri for virtual doc
  dirty: boolean;
  validationStatus: LuNodeStatus;
  lastSaved?: string;
}
```

### 10.3 Refactor

- Extract from `LatexMonaco.tsx` → `LuMonacoEditor.tsx` with tab host
- Yjs: one provider per **open** file tab (existing pattern)
- Generated files: open read-only with banner "Auto-generated"

### 10.4 Virtual document URIs

```
lu://{projectId}/{path}
```

Enables Monaco model reuse across reopens without content flash.

---

## 11. Background Worker Strategy

### 11.1 Work types

| Worker | Trigger | Output |
|--------|---------|--------|
| **IndexBuilder** | File save, structure change | `/.lu/index/nodes.json`, checksums |
| **ValidationWorker** | Debounced save (2s) | Updated node statuses |
| **SearchIndexer** | Publish, manual rebuild | `/.lu/index/search.json` |
| **CompileWorker** | Scoped compile request | PDF in `output/preview/` |
| **MigrationWorker** | `lu/ensure`, user opt-in | v1→v2→v3 transforms |

### 11.2 Implementation phases

**Phase 1 (Node in-process):** `setImmediate` / `BullMQ` optional queues on same server — sufficient for 100s of files.

**Phase 2 (Scale):** Redis + BullMQ workers for compile and index; API returns job ID, frontend polls `GET /lu/jobs/:id`.

### 11.3 Non-blocking rule

No worker may block editor render. Migration runs async (already fixed in `useAcademicStudioProject`).

---

## 12. Search / Indexing Strategy

### 12.1 Authoring-time search (explorer filter)

- **Index:** `/.lu/index/search.json` — `{ nodeId, title, kind, path, tokens[] }`
- **Update:** incremental on rename/create/delete
- **Query:** client-side fuse.js for <10k nodes; server-side for larger

### 12.2 Publish-time search (student platform)

- Existing `generateLuSearchIndex()` → embedded in `structuredData`
- Extend to index component-level headings inside lessons

### 12.3 Background indexing

```
onStructureChange → queue IndexBuilder
IndexBuilder → walk manifest only (no file content)
onFileSave(text) → update tokens for that node
```

---

## 13. Caching Strategy

| Cache | Key | TTL | Invalidation |
|-------|-----|-----|--------------|
| Explorer subtree | `projectId:parentId:depth` | 30s | structure mutation |
| File content | `fileId:updatedAt` | Until save | PUT content |
| Validation status | `nodeId:checksum` | Until file change | save |
| Compile PDF | `scope:contentHash` | 1h | any file in scope changes |
| Authoring state | `projectId` | **Remove** — too heavy | — |
| Monaco model | `lu://project/path` | LRU 20 | tab close |

**Critical refactor:** `getLuAuthoringState()` today loads all files — **replace** with index-backed partial state for IDE 3.0.

---

## 14. Performance Strategy

### 14.1 Hot path budgets

| Operation | Target |
|-----------|--------|
| IDE shell mount | < 500ms |
| Explorer root load | < 200ms |
| Expand node (lazy) | < 150ms |
| Open file in Monaco | < 300ms |
| Save file | < 200ms |
| Scoped compile (lesson) | < 15s |
| Full publish | < 120s |

### 14.2 Anti-patterns to eliminate

- ❌ `loadProjectFiles()` on every `/lu/state` request
- ❌ Loading all file contents in `GET /latex-projects/:id`
- ❌ Full tree validation on every keystroke
- ❌ Blocking `lu/ensure` on editor mount

### 14.3 Patterns to adopt

- ✅ Manifest-only API for tree structure
- ✅ Content on demand per file
- ✅ Incremental validation
- ✅ Virtualized explorer
- ✅ Debounced background workers

---

## 15. Scalability Strategy

### 15.1 Target scale (Rule 10)

| Entity | Count |
|--------|-------|
| Tracks | 100+ |
| Modules | 500+ |
| Lessons | 3,000+ |
| TeX files | 10,000+ |
| Assets | 100,000+ |

### 15.2 Data partitioning

- **Manifest** (`project.json`): stays < 2MB via refs only, not inline content
- **Index files** sharded: `/.lu/index/tracks/{trackId}.json` when track count > 50
- **DB:** `latexFile` rows one per file (existing); index by `(projectId, path)`

### 15.3 API pagination

```
GET /lu/explorer?parent=X&cursor=abc&limit=50
GET /lu/files?paths=path1,path2   (batch content fetch for open tabs only)
```

---

## 16. Migration Strategy

### 16.1 Migration chain (Rule 12)

```
v1 single-file main.tex
    │  migrateSingleFileToProject() [EXISTS]
    ▼
v2 project.json + monolithic lessons
    │  modularizeLesson() [NEW]
    ▼
v3 component files per lesson
```

### 16.2 v1 → v2 (existing)

`ensureLuProjectV2()` / `POST /lu/ensure` — backup, parse, emit, generate main.tex.

### 16.3 v2 → v3 (new: optional per lesson)

`modularizeLesson(projectId, lessonId)`:

1. Parse monolithic `lesson-NN.tex` into AST blocks
2. Map `\overview`, `\quiz`, etc. → component files
3. Generate `lesson.manifest.json` + `lesson.tex` wrapper
4. Update `project.json` lesson entry `layout: "modular"`
5. Backup original as `lesson-NN.monolithic.bak.tex`

**No automatic v2→v3** — user or wizard opt-in.

### 16.4 Published Learning Universes

- Publish output (`structuredData`, DB records) unchanged
- Re-publish from migrated project regenerates contentBlocks from new layout
- `sourceProjectId` link preserved

---

## 17. Error Recovery Strategy

| Failure | Recovery |
|---------|----------|
| Save fails | Retry 3x; show dirty indicator; localStorage draft backup |
| Compile fails | Map errors to nodes; "Go to error" in explorer |
| Migration fails | Non-blocking; show banner; Developer Mode fallback |
| Index corrupt | `POST /lu/reindex` rebuilds from manifest + files |
| Yjs desync | Bootstrap from DB content (existing `yjsServer.ts`) |
| Publish partial fail | Stage-level rollback; `publishManifest` records completed stages |
| main.tex drift | `regenerateMainTexFromProjectJson()` on every structure save |

### 17.1 User-visible errors

Never infinite spinners. Every panel: loading → content | error + retry.

---

## 18. Version Control Strategy

### 18.1 Per-file history (Rule 5)

- Existing: `latexVersionService.ts` + Yjs updates
- **Extend:** version metadata tagged with `nodeId` and `authorId`
- UI: "History" on active tab, not project-global only

### 18.2 Project snapshots

- Manual snapshot before publish (exists: `POST /versions`)
- Auto-snapshot on publish with `pipelineVersion` + manifest hash

### 18.3 Diff

- File-level diff (Monaco diff editor)
- Structure diff (manifest JSON diff) — future

### 18.4 Generated files

- `main.tex`, `track.tex`, etc. **excluded** from user-facing history (regenerated)
- Stored in snapshot for audit only

---

## 19. Collaboration Architecture

### 19.1 Current state

- Yjs per open file (`/yjs/project/{id}/file/{fileId}`)
- No coordination on `project.json` mutations

### 19.2 Target

| Resource | Strategy |
|----------|----------|
| Authored .tex files | Yjs CRDT (keep) |
| project.json | Optimistic lock + version field; `If-Match: manifestETag` |
| Structure mutations | Server authoritative; broadcast via WebSocket event |
| Explorer state | Eventual consistency; refresh on `lu:structure-changed` |

### 19.3 WebSocket events (new channel)

```typescript
type LuIdeEvent =
  | { type: "structure-changed"; projectId: string; nodeId?: string }
  | { type: "file-saved"; projectId: string; path: string; authorId: string }
  | { type: "validation-updated"; projectId: string; nodeId: string; status: LuNodeStatus }
  | { type: "compile-complete"; projectId: string; jobId: string };
```

Separate from Yjs transport — `/lu/events` SSE or Socket.io room per project.

---

## 20. API Contract

### 20.1 Existing endpoints (retain)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/latex-projects/:id/lu/ensure` | Async migration |
| GET | `/latex-projects/:id/lu/meta` | `{ isV2, mainTexReadOnly, schemaVersion, layoutVersion }` |
| GET | `/latex-projects/:id/lu/state` | **Deprecate full load** → slim summary only |
| POST | `/latex-projects/:id/lu/structure` | Structure mutations |
| GET | `/latex-projects/:id/lu/resolve` | Full merged DSL preview |
| POST | `/latex-projects/:id/lu/regenerate-main` | Force main.tex regen |
| GET | `/latex-projects/:id/files/content?fileId=` | Single file content |
| PUT | `/latex-projects/:id/files/content` | Single file save |
| GET | `/latex-projects/:id/files/tree` | Metadata-only tree |
| POST | `/learning-universes/publish` | `projectId` required |

### 20.2 New endpoints (IDE 3.0)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/latex-projects/:id/lu/explorer` | Lazy subtree `?parent=&depth=&cursor=` |
| GET | `/latex-projects/:id/lu/node/:nodeId` | Node detail + status |
| GET | `/latex-projects/:id/lu/summary` | Dashboard stats without full tree |
| POST | `/latex-projects/:id/lu/compile` | `{ scope: CompileScope }` → job |
| GET | `/latex-projects/:id/lu/compile/:jobId` | Poll compile result |
| GET | `/latex-projects/:id/lu/preview` | `?scope=` → PDF URL |
| POST | `/latex-projects/:id/lu/validate` | `{ path?, nodeId?, scope? }` |
| POST | `/latex-projects/:id/lu/reindex` | Rebuild background indexes |
| POST | `/latex-projects/:id/lu/modularize-lesson` | v2→v3 lesson split |
| GET | `/latex-projects/:id/lu/index/search` | `?q=` explorer search |
| GET | `/latex-projects/:id/lu/events` | SSE collaboration events |

### 20.3 Response shapes

**Explorer lazy load:**
```json
{
  "success": true,
  "data": {
    "nodes": [ LuExplorerNodeV3 ],
    "parentId": "track:track-01",
    "hasMore": false,
    "cursor": null
  }
}
```

**Compile job:**
```json
{
  "success": true,
  "data": {
    "jobId": "compile_abc",
    "status": "queued",
    "scope": { "type": "lesson", "lessonId": "lesson-01" }
  }
}
```

**Slim summary (replaces heavy `/lu/state` for initial load):**
```json
{
  "success": true,
  "data": {
    "schemaVersion": 3,
    "title": "Artificial Intelligence",
    "health": { "score": 72, "readyToPublish": false },
    "progress": { "tracks": 3, "modules": 12, "lessons": 48 },
    "trackIds": ["track-01", "track-02", "track-03"]
  }
}
```

---

## Implementation Roadmap (Incremental)

### Phase 0 — Architecture sign-off
- Review this document
- No code changes

### Phase 1 — Foundation refactor (4–6 weeks)
- Schema v3 types + v2 normalizer (no breaking changes)
- `GET /lu/explorer` lazy API
- Slim `/lu/summary`; deprecate full `/lu/state` load
- Explorer virtualization + error states
- Tabbed Monaco + per-file load
- Non-blocking migration (done)
- main.tex read-only enforcement (done)

### Phase 2 — Modular lessons (4–6 weeks)
- Component file emitter + templates
- `modularizeLesson` migration
- Generated `lesson.tex` wrapper
- Explorer shows component nodes for v3 lessons

### Phase 3 — Scoped compile & preview (3–4 weeks)
- `luCompilePlanner`, `luPartialResolver`
- Compile/preview scope UI
- Incremental validation on save

### Phase 4 — Publish pipeline extension (2–3 weeks)
- Asset/bib resolution stages
- Instructor package + certificate metadata
- Publish manifest write-back

### Phase 5 — Scale & collaboration (4+ weeks)
- Index sharding, job queue
- SSE structure events
- Manifest optimistic locking
- Search at scale

---

## Appendix A: Mapping from Overleaf UI to IDE 3.0

| Overleaf concept | IDE 3.0 concept |
|------------------|-----------------|
| File tree | Developer Mode only |
| main.tex | Build artifact (hidden) |
| Compile | Scoped compile (lesson/module/track/universe) |
| PDF preview | Scoped preview |
| Share | Publish Learning Universe |
| History | Per-file + project snapshots |

---

## Appendix B: Key file refactor map

| Current | IDE 3.0 |
|---------|---------|
| `EditorLayout.tsx` (LU branch) | `LuIdeShell.tsx` |
| `LuAuthoringPanel.tsx` | `LuExplorerPanel.tsx` + virtualized tree |
| `useLuAuthoringState.ts` | `useLuExplorer.ts` + `useLuSummary.ts` |
| `luAuthoringState.ts` | `luIndexService.ts` + `luExplorerService.ts` |
| `getLuAuthoringState()` | Split: summary / lazy explorer / on-demand validation |
| `GateHubEditor` | Unchanged for non-LU modes |
| `AcademicAuthoringStudioPage` | Mounts `LuIdeShell` instead of `GateHubEditor` |

---

## Appendix C: Glossary

| Term | Meaning |
|------|---------|
| **Educational object** | Track, module, lesson, topic, quiz, etc. — what the instructor sees |
| **Component** | One authored `.tex` file within a lesson |
| **Manifest** | `project.json` — structure without content |
| **Generated file** | Auto-built from manifest; never edited |
| **Scope** | Unit of compile/preview (file → universe) |
| **Developer Mode** | Raw file tree escape hatch |

---

*End of architecture document. Implementation requires explicit approval of this document and phase selection.*
