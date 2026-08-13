# Universal Content Engine v2.0 Architecture Baseline

Status: Platform Freeze (Milestone 2 P0 complete)  
Version baseline: `Universal Content Engine v2.0`  
Scope: production publish + experience + renderer + PDF + validation

## Freeze Policy

The following are stable infrastructure and should not be changed unless there is a production bug or explicit architecture RFC:

- Universal Compiler
- Document AST
- `course.compiled.json` contract
- LU Publish Pipeline
- Experience Engine
- `DocumentRenderer` surfaces
- PDF renderer path
- Pipeline Guard + Golden Regression suite

Parallel content pipelines are prohibited.

## Overall Architecture

1. Authoring/project files are compiled by the Universal Compiler.
2. Compiler emits canonical Document AST in `course.compiled.json`.
3. Publish pipeline consumes compiled package and persists AST-backed content blocks.
4. Experience engine reads persisted AST blocks and builds learner steps.
5. Student/instructor preview reads experience payload and renders via `DocumentRenderer`.
6. PDF/download renderers consume the same AST (or AST-derived content) with no runtime TeX parsing.
7. CI guard rails verify no bypasses/regressions can merge.

## Compiler Pipeline

- Input: LU project source files (`.tex`, metadata, project graph).
- Processing: command validation, macro audit, lesson compilation, node generation.
- Output:
  - per-lesson document nodes
  - `course.compiled.json` (canonical compiled package)
  - compile diagnostics
- Invariants:
  - document counts remain stable across compile/publish/experience/PDF
  - image node counts remain stable across the same path

## AST Specification (Document Nodes)

Canonical prose/content is represented as `document` block with `content.nodes[]`.

- Container block:
  - `type: "document"`
  - `content.title?: string`
  - `content.nodes: DocumentNode[]`
  - `content.sourceTex?: string` (compatibility and migration metadata, non-authoritative for runtime rendering)
- Node families (current production): markdown, image, equation, code, table, list, quote, callout, video, link, download.
- Runtime renderers and PDF path consume nodes, not legacy `overviewMarkdown`/`overviewHtml`.

## Publish Pipeline

- Publish requires pre-parsed compiled payload (runtime parse fallback disabled).
- LU v2 publish requires compiled package for document content materialization.
- Runtime media injection during publish is disabled in the canonical path.
- Published DB lessons persist AST-backed `contentBlocks` used by experience and renderers.

## Rendering Pipeline

- Student and instructor preview:
  - Experience engine emits reading steps backed by document nodes.
  - Frontend document reader renders AST through shared renderer components.
- PDF:
  - PDF pipeline renders AST nodes and supported interactive cards.
  - No production runtime TeX reparsing for canonical lesson rendering.

## Asset Lifecycle

### Images

1. Image references resolved during compile to image nodes.
2. Persisted via published content blocks.
3. Consumed by experience and PDF via AST, not markdown scanning in canonical render path.

### Videos

1. Structured as video nodes/blocks in compiled output.
2. Bound to learner steps by experience engine.
3. Rendered by shared UI/PDF card contracts.

### Downloads

1. Download/resource nodes captured in compiled/published blocks.
2. Experience and download center map from structured blocks, not reconstructed markdown bodies.

### Interactive Content

- Quiz, practice, assignment, project, coding-lab, notebook, research remain structured blocks integrated with AST-first lesson sequencing.

## PDF Behavior

- Document nodes are rendered deterministically.
- Unsupported/interactive content uses standardized card fallbacks.
- Validation compares compile snapshot and PDF output fingerprints.

## Validation Flow

Required guard suite:

- `npm run pipeline:guard`
- `npm run test:golden-pipeline`
- `npm run verify:compiled-pipeline`
- `npm run audit:compiler-macros`

Supporting audits:

- `npm run audit:pipeline-fragments`
- `npx tsx scripts/audit-integration-readonly.ts`
- A0/A1 validators as release confidence checks

## Future Development Policy

Any new learning content feature must integrate with all of:

1. Universal Compiler
2. Document AST
3. Publish Pipeline
4. DocumentRenderer
5. PDF renderer path

Do not introduce a parallel parser, parallel renderer, or alternate publish body path.
