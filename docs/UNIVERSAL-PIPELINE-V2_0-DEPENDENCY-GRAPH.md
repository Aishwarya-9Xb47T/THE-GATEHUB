# Universal Pipeline v2.0 Dependency Graph

## System Graph

```mermaid
flowchart TD
  A[Authoring Project Files] --> B[Universal Compiler]
  B --> C[course.compiled.json]
  C --> D[LU Publish Pipeline]
  D --> E[(Published DB contentBlocks)]
  E --> F[Experience Engine]
  F --> G[Student/Instructor Preview]
  G --> H[DocumentRenderer]
  E --> I[PDF Renderer]
  H --> J[Rendered Lesson UI]
  I --> K[Compiled PDF Output]

  L[Pipeline Guard CI] --> M[Audit Pipeline Fragments]
  L --> N[Macro Validation]
  L --> O[Golden Pipeline Regression]
  L --> P[Compiled Pipeline Verification]

  M --> Q[Merge Gate]
  N --> Q
  O --> Q
  P --> Q
```

## Responsibility Boundaries

- Universal Compiler: source normalization + AST generation.
- `course.compiled.json`: canonical compile artifact contract.
- Publish Pipeline: persistence of compiled AST-backed blocks.
- Experience Engine: lesson-step composition from persisted blocks.
- DocumentRenderer: canonical runtime renderer for AST nodes.
- PDF Renderer: canonical document/PDF projection from AST content.
- CI Guard: merge blocker for pipeline regressions.

## Allowed Extension Points

- Add new AST node type (compiler + renderer + PDF + tests together).
- Add new interactive block type through structured block path.
- Add validation rules to pipeline guard scripts.

## Forbidden Patterns

- Runtime TeX parse in production render path.
- Runtime AST reconstruction from legacy markdown/html.
- Runtime media reinjection to patch published lesson bodies.
- Introducing parallel preview/PDF pipelines with different source-of-truth.
