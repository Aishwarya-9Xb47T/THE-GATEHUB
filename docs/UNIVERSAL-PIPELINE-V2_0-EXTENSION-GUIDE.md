# Universal Pipeline v2.0 Extension Guide

This guide defines the required process for adding a new document node type.

## Non-Negotiable Rule

A node type is complete only when it is integrated end-to-end:

1. Compiler emits node
2. AST contract accepts node
3. Publish persists node in document blocks
4. Runtime DocumentRenderer renders node
5. PDF renderer renders node (or approved fallback)
6. Validation suite includes coverage

## Step-by-Step: Add a New Node Type

## 1) Define/extend node contract

- Update shared node type definitions under `shared/lesson-body`.
- Add strict shape and required/optional fields.
- Keep backward compatibility only via explicit migration wrappers; not runtime guesswork.

## 2) Emit from compiler

- Extend compiler/parser mapping in LU compile path so source commands produce the new node.
- Ensure the node is emitted into `course.compiled.json`.
- Validate node counts/fingerprints stay deterministic.

## 3) Publish compatibility

- Ensure compiled package application writes node into persisted `document` content blocks unchanged.
- Do not add post-publish runtime mutation for the new node.

## 4) Runtime renderer support

- Extend HTML/DocumentRenderer rendering path to display the node.
- Add safe fallback behavior for unknown/malformed node data.

## 5) PDF renderer support

- Extend AST-to-PDF projection for the node.
- If full rendering is not feasible immediately, render an explicit standardized fallback card.

## 6) Experience engine integration

- If node influences lesson step structure (navigation/progression), update experience engine mapping.
- Preserve existing step contracts and required completion rules.

## 7) Validation and regression updates

- Add/extend tests and audits:
  - golden pipeline regression coverage
  - compiled pipeline verification expectations
  - macro/pipeline fragment checks if relevant
- Run required suite before merge:
  - `npm run pipeline:guard`
  - `npm run test:golden-pipeline`
  - `npm run verify:compiled-pipeline`
  - `npm run audit:compiler-macros`

## Merge Checklist

- [ ] Node contract updated in shared AST types
- [ ] Compiler emits node in `course.compiled.json`
- [ ] Publish persists node without reconstruction
- [ ] Runtime renderer supports node
- [ ] PDF renderer supports node/fallback
- [ ] Regression suite updated and passing
- [ ] No parallel pipeline introduced
