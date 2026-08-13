# Universal Pipeline v2.0 Migration Backlog (P2/P3)

Purpose: track remaining compatibility/migration utilities after P0/P1 closure.  
Policy: do not remove immediately; remove via controlled milestones.

## Backlog Items

| Item | Why it still exists | Product dependency | Runtime vs compatibility | Target removal milestone | Migration strategy |
|---|---|---|---|---|---|
| `learning-universe-parser` legacy `overviewMarkdown` / `overviewHtml` fields | Parser shape compatibility for legacy and tooling contracts | LU authoring/parser utilities and legacy content ingest | Compatibility-only | M2.2 | Remove fields from parser output contract after downstream script/export consumers migrate to document nodes |
| `luLessonCompiler` writes `overviewMarkdown` from `sourceTex` | Transitional traceability and round-trip support during compile migration | Compiler migration scripts and debug tooling | Compatibility-only | M2.2 | Replace with explicit migration metadata field not consumed by runtime renderers |
| `luIncludeGraphicsInjector` legacy overview string manipulation | Migration-era TeX media handling for non-canonical authoring states | Compile/migration flows for older project content | Compatibility-only | M2.3 | Move media handling fully into compile node generation and retire string patching branches |
| `learningUniverseDslEmitter` emits `overviewMarkdown` segment | Backward-compatible export of older lesson DSL representations | Export and project regeneration tooling | Compatibility-only | M2.3 | Emit document-node-aware sections only; provide one-time converter for legacy export users |
| `luProjectFileEmitter` uses `overviewMarkdown` in lesson file output | Legacy scaffold/file emission path still supports old lesson shape | Project bootstrap/migration emitters | Compatibility-only | M2.3 | Switch file emitter to document block source extraction and deprecate overview-only template |
| Visual preview path reported by integration audit as parallel (`StudentPreviewPane`) | Existing non-canonical preview surface retained for builder UX continuity | Visual authoring preview workflow | Runtime (non-canonical preview surface), not canonical student pipeline | M2.4 | Align preview to shared document renderer contract and remove parallel markdown renderer |

## Removal Guard Rails

- Removal must not break existing courses authored in previous pipeline versions.
- Each removal PR must include:
  - dependency impact note
  - migration fallback (if needed)
  - updated audits/tests
  - rollback plan

## Completion Condition

Backlog item can close only when:

1. No production runtime path depends on it.
2. Compatibility users are migrated.
3. Pipeline regression suite passes with the branch removed.
