# Structure Preservation Extraction - Architecture

**Date**: 2025-01-31
**Priority**: CRITICAL
**Goal**: Transform extraction from semantic understanding to structure preservation

---

## Problem Statement

The current extraction engine is **semantically correct** but **structurally poor**:
- Content belongs to the document
- But hierarchy, ordering, and parent-child relationships are incorrect
- Components are reorganized, merged, or split based on semantic reasoning
- The extracted quiz does NOT look visually identical to the source document

## The Root Issue

The extraction engine was designed with **semantic understanding** as the primary goal:
- It infers relationships based on meaning
- It reorganizes content for "better" structure
- It merges similar components
- It splits long content
- It attaches components based on semantic similarity

This approach violates the fundamental principle of document import:
**The document is the source of truth.**

## The Solution: Structure Preservation

### Primary Goal

**STRUCTURE PRESERVATION** (not content understanding)

The importer should behave like:
- Microsoft Word Import
- Google Docs Import
- Canvas LMS Import

These tools preserve the document exactly as-is.

### Core Principles

#### RULE 1: Document is Source of Truth
- Do NOT reorganize anything
- Do NOT optimize anything
- Do NOT infer a better structure
- Replicate the document exactly

#### RULE 2: Every Question is a Root Node
Everything after the question belongs ONLY to that question until the next question starts:
```
Question
  ↓
Image
  ↓
Formula
  ↓
Table
  ↓
Code
  ↓
Options
  ↓
Explanation
  ↓
Hint
  ↓
Question Ends
  ↓
Next Question
```

Never attach components across question boundaries.

#### RULE 3: Preserve Component Order Exactly
If the document contains:
```
Question
  ↓
Paragraph
  ↓
Image
  ↓
Paragraph
  ↓
Formula
  ↓
Paragraph
  ↓
Code
  ↓
Table
  ↓
List
  ↓
Options
  ↓
Explanation
  ↓
Hint
```

The extracted JSON must preserve EXACTLY this order. Never reorder components.

#### RULE 4: Treat Every Component as a Sequential Block

Supported blocks:
- Text
- Paragraph
- Heading
- Image
- Video
- Audio
- Formula
- Code
- Table
- List
- Options
- Explanation
- Hint
- Accepted Answers
- Feedback
- Metadata

Each block keeps:
- Its position
- Its parent
- Its order
- Its formatting

#### RULE 5: Never Modify Components

Never:
- Move formulas above images
- Move code below options
- Move tables before formulas
- Merge paragraphs
- Split paragraphs
- Merge multiple formulas
- Split code blocks

#### RULE 6: Follow Document Flow

Read:
- Top → Bottom → Left → Right

Exactly as humans read the document.

#### RULE 7: Every Component Has Position Info

Each extracted object includes:
- `id`
- `type`
- `parentQuestionId`
- `orderIndex`
- `sourcePage`
- `boundingBox`
- `startOffset`
- `endOffset`

This allows the frontend to reconstruct the exact document order.

#### RULE 8: Output is Component-Based

Example structure:
```json
{
  "Question": {
    "id": "q1",
    "components": [
      { "type": "Paragraph", "orderIndex": 0 },
      { "type": "Image", "orderIndex": 1 },
      { "type": "Formula", "orderIndex": 2 },
      { "type": "Paragraph", "orderIndex": 3 },
      { "type": "Code", "orderIndex": 4 },
      { "type": "Table", "orderIndex": 5 },
      { "type": "List", "orderIndex": 6 },
      { "type": "Options", "orderIndex": 7 },
      { "type": "Explanation", "orderIndex": 8 },
      { "type": "Hint", "orderIndex": 9 }
    ]
  }
}
```

Never flatten components.

#### RULE 9: Frontend Does NOT Decide Ordering

Ordering must come entirely from extraction.

Every component has an `orderIndex`.

The frontend simply renders:
```javascript
components.sort(c => c.position.orderIndex)
```

#### RULE 10: Attach by Physical Position Only

Never attach components using semantic similarity.

Attach components ONLY by physical document position.

If an image is physically between Question 3 and Question 4, it belongs to Question 3.

#### RULE 11: Don't Confuse Component Types

- Lists are not formulas
- Tables are not lists
- Code is not text
- Formula is not code
- Image captions are not explanations

Do not confuse component types.

#### RULE 12: Preserve Formatting Exactly

When extracting DOCX or PDF, preserve:
- Paragraph spacing
- Indentation
- Numbering
- Bullet hierarchy
- Nested lists
- Table positions
- Image positions
- Inline formulas
- Display formulas
- Code indentation
- Line breaks
- Rich text formatting

#### RULE 13: Output Ordered Tree

The extraction should produce an ordered tree:
```
Question
├── Paragraph
├── Image
├── Formula
├── Paragraph
├── Code
├── Table
├── List
├── Options
├── Explanation
└── Hint
```

NOT a flat JSON.

---

## Architecture Changes

### New Type System

Created `structurePreservationTypes.ts` with:

1. **Component Types**: All supported component types (Question, Paragraph, Image, Formula, Code, Table, List, Options, Explanation, Hint, etc.)

2. **Component Position**: Position information (orderIndex, parentQuestionId, sourcePage, boundingBox, startOffset, endOffset, readingOrder)

3. **Component Data**: Type-specific data for each component type

4. **Structured Question**: Question with components array (preserves hierarchy)

5. **Structured Document**: Complete document with questions and root components

### New Extractor

Created `StructurePreservationExtractor.ts` with:

1. **Source-Specific Parsers**: 
   - `parseDOCX()` - DOCX structure preservation
   - `parsePDF()` - PDF structure preservation
   - `parseHTML()` - HTML structure preservation
   - `parseMarkdown()` - Markdown structure preservation
   - `parseTXT()` - Plain text structure preservation

2. **Order Index Assignment**: Assigns order indices based on document flow (top→bottom→left→right)

3. **Question Boundary Grouping**: Groups components by physical position relative to questions

4. **Metadata Extraction**: Extracts metadata from Metadata components without reorganization

### Extraction Rules

All 13 rules are codified in the extractor:
- `preserveOriginalOrder: true`
- `questionAsRootNode: true`
- `preserveComponentOrder: true`
- `sequentialBlocks: true`
- `noReordering: true`
- `noMerging: true`
- `noSplitting: true`
- `followDocumentFlow: true`
- `includePositionInfo: true`
- `componentBasedOutput: true`
- `extractionProvidedOrdering: true`
- `physicalPositionAttachment: true`
- `strictComponentTyping: true`
- `preserveFormatting: true`
- `orderedTreeOutput: true`

---

## Integration Strategy

### Phase 1: Foundation (Current)
- ✅ Created structure preservation types
- ✅ Created StructurePreservationExtractor with basic parsers
- ✅ Implemented 13 extraction rules

### Phase 2: Source-Specific Parsers
Implement proper source-specific parsers:
- DOCX: Use mammoth library for accurate structure preservation
- PDF: Use pdf-parse with layout analysis
- HTML: Use proper HTML parser (cheerio, jsdom)
- Markdown: Use marked library with AST preservation

### Phase 3: Component Type Detection
Implement accurate component type detection:
- Image detection in DOCX/PDF
- Formula detection in DOCX (Office Math, LaTeX)
- Code block detection (syntax highlighting libraries)
- Table detection with merged cells
- List detection with nesting levels

### Phase 4: Formatting Preservation
Implement formatting preservation:
- Rich text formatting (bold, italic, underline, color, font)
- Paragraph spacing and indentation
- Nested list structures
- Table borders and alignment
- Code syntax highlighting

### Phase 5: Position Tracking
Implement accurate position tracking:
- Bounding box calculation from source
- Page break detection
- Reading order determination
- Component offset calculation

### Phase 6: Adapter Integration
Create adapter to convert StructuredDocument to ExtractedQuestionDraft:
- Convert components array to flat QuestionObject
- Preserve order indices in metadata
- Maintain parent-child relationships

### Phase 7: Frontend Integration
Update frontend to render components in order:
- Use `orderIndex` for component ordering
- Render component tree structure
- Preserve visual hierarchy

---

## Comparison: Before vs After

### Before (Semantic Understanding)

**Approach**:
- Infer relationships based on meaning
- Reorganize for "better" structure
- Merge similar components
- Attach by semantic similarity

**Result**:
- Content is correct
- Structure is wrong
- Visual appearance doesn't match source
- Components moved/reordered

### After (Structure Preservation)

**Approach**:
- Document is source of truth
- Preserve exact order
- Never merge/split/reorder
- Attach by physical position only

**Result**:
- Content is correct
- Structure is correct
- Visual appearance matches source
- Components in exact document order

---

## Example: Document Reconstruction

### Source Document
```
Question 1: What is 2 + 2?

[Image: Diagram showing 2 + 2 = 4]

Use the formula: 2 + 2 = 4

A) 3
B) 4
C) 5
D) 6

Explanation: 2 + 2 equals 4.
```

### Before (Semantic Extraction)
```json
{
  "text": "What is 2 + 2?",
  "type": "multiple_choice",
  "options": [
    { "text": "3", "isCorrect": false },
    { "text": "4", "isCorrect": true },
    { "text": "5", "isCorrect": false },
    { "text": "6", "isCorrect": false }
  ],
  "explanation": "2 + 2 equals 4.",
  "diagram": { "url": "..." }
}
```
- Image moved to diagram field
- Formula lost
- Paragraph lost
- Options flattened

### After (Structure Preservation)
```json
{
  "id": "q1",
  "components": [
    {
      "type": "Question",
      "content": "Question 1: What is 2 + 2?",
      "position": { "orderIndex": 0, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Image",
      "content": "[Image: Diagram showing 2 + 2 = 4]",
      "position": { "orderIndex": 1, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Paragraph",
      "content": "Use the formula: 2 + 2 = 4",
      "position": { "orderIndex": 2, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Formula",
      "content": "2 + 2 = 4",
      "data": { "latex": "2 + 2 = 4" },
      "position": { "orderIndex": 3, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Options",
      "content": "",
      "data": { "markerStyle": "letter" },
      "position": { "orderIndex": 4, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Option",
      "content": "A) 3",
      "data": { "marker": "A", "isCorrect": false },
      "position": { "orderIndex": 5, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Option",
      "content": "B) 4",
      "data": { "marker": "B", "isCorrect": true },
      "position": { "orderIndex": 6, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Option",
      "content": "C) 5",
      "data": { "marker": "C", "isCorrect": false },
      "position": { "orderIndex": 7, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Option",
      "content": "D) 6",
      "data": { "marker": "D", "isCorrect": false },
      "position": { "orderIndex": 8, "parentQuestionId": "q1", ... }
    },
    {
      "type": "Explanation",
      "content": "Explanation: 2 + 2 equals 4.",
      "position": { "orderIndex": 9, "parentQuestionId": "q1", ... }
    }
  ]
}
```
- All components preserved in exact order
- Formula preserved as separate component
- Paragraph preserved
- Image preserved with position
- Options preserved with markers
- Explanation preserved at end

---

## Final Goal

**The imported quiz should look visually identical to the source document.**

The extraction engine is a **DOCUMENT RECONSTRUCTION ENGINE**.

Its responsibility is to preserve:
- Layout
- Hierarchy
- Order
- Parent-child relationships

Exactly as they appear in the original document.

---

## Next Steps

1. Implement proper source-specific parsers (mammoth, pdf-parse, cheerio, marked)
2. Implement accurate component type detection
3. Implement formatting preservation
4. Implement position tracking
5. Create adapter to convert StructuredDocument to ExtractedQuestionDraft
6. Update frontend to render components in order
7. Test with real documents to verify visual identity