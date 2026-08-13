# Next-Generation Assessment Extraction Pipeline - Architecture Design

## Executive Summary

This document presents a complete redesign of the assessment extraction pipeline based on multi-agent architecture, semantic understanding, and independent verification stages. The new architecture prioritizes maximum accuracy over speed, with each stage having dedicated inputs, outputs, confidence scoring, validation, and repair logic.

---

## PART 2: New Multi-Stage Architecture

### Architecture Overview

```
Document Input
    ↓
[Stage 1] OCR & Preprocessing
    ↓
[Stage 2] Layout Detection & Analysis
    ↓
[Stage 3] Structural Parsing
    ↓
[Stage 4] Heading & Section Detection
    ↓
[Stage 5] Section Classification
    ↓
[Stage 6] Question Candidate Detection
    ↓
[Stage 7] Question Boundary Detection
    ↓
[Stage 8] Question Type Classification
    ↓
[Stage 9] Option Extraction
    ↓
[Stage 10] Table Reconstruction
    ↓
[Stage 11] Image Association
    ↓
[Stage 12] Equation Detection
    ↓
[Stage 13] Code Block Detection
    ↓
[Stage 14] Context Reconstruction
    ↓
[Stage 15] Answer Detection
    ↓
[Stage 16] Metadata Extraction
    ↓
[Stage 17] Validation
    ↓
[Stage 18] Repair
    ↓
[Stage 19] Confidence Scoring
    ↓
[Stage 20] Final JSON Generation
```

---

## STAGE 1: OCR & Preprocessing

### Purpose
Convert input documents to high-quality text with OCR repair, noise removal, and quality assessment.

### Inputs
- Raw file (PDF, DOCX, PPTX, Image, etc.)
- File metadata (type, size, name)

### Outputs
- Preprocessed text with OCR confidence
- Layout information (bounding boxes, regions)
- Image regions
- Table regions
- OCR quality score
- Repaired text
- Noise mask

### Process
1. **Document Type Detection**
   - Identify file format
   - Select appropriate parser

2. **OCR Processing** (for scanned documents)
   - Apply OCR with multiple engines (Tesseract, Google Vision, Azure OCR)
   - Get confidence scores per character/word
   - Detect rotation/skew
   - Auto-rotate and deskew

3. **OCR Quality Assessment**
   - Calculate overall OCR confidence
   - Identify low-confidence regions
   - Flag regions needing manual review

4. **OCR Repair**
   - Fix common OCR errors using context
   - Spell-check with domain-specific dictionaries
   - Correct character misrecognition
   - Fix word merging/splitting
   - Restore line breaks

5. **Noise Detection & Removal**
   - Detect watermarks
   - Detect stamps
   - Detect handwritten marks
   - Detect scan artifacts
   - Create noise mask

6. **Layout Preservation**
   - Extract bounding boxes for all text
   - Preserve column information
   - Preserve table structure
   - Preserve image placement
   - Preserve spatial relationships

### Validation
- Verify OCR confidence > threshold
- Verify text extraction completeness
- Verify layout preservation
- Verify noise removal didn't remove content

### Repair Logic
- If OCR confidence low: Re-run OCR with different settings
- If layout corrupted: Re-parse with different parser
- If noise removal aggressive: Re-run with conservative settings

### Confidence Scoring
- OCR confidence: 0-1 (per character, word, line, page, document)
- Layout confidence: 0-1 (based on parser reliability)
- Overall stage confidence: Weighted average

### Stage Output Schema
```typescript
interface OCRStageOutput {
  text: string;
  layout: {
    regions: Array<{
      type: 'text' | 'table' | 'image' | 'header' | 'footer';
      bbox: { x: number; y: number; width: number; height: number };
      confidence: number;
      content: string;
    }>;
    columns: number;
    orientation: 'portrait' | 'landscape';
  };
  images: Array<{
    bbox: { x: number; y: number; width: number; height: number };
    data: Buffer;
    caption?: string;
  }>;
  tables: Array<{
    bbox: { x: number; y: number; width: number; height: number };
    rows: number;
    cols: number;
    cells: string[][];
  }>;
  ocrConfidence: {
    overall: number;
    perPage: number[];
    lowConfidenceRegions: Array<{ bbox: BBox; confidence: number }>;
  };
  noiseMask: Array<{ bbox: BBox; type: 'watermark' | 'stamp' | 'artifact' }>;
  stageConfidence: number;
}
```

---

## STAGE 2: Layout Detection & Analysis

### Purpose
Understand document layout to guide subsequent parsing stages.

### Inputs
- OCR stage output (text, layout regions, images, tables)

### Outputs
- Document layout classification
- Column detection
- Region classification
- Visual grouping
- Spatial relationships

### Process
1. **Layout Classification**
   - Single column vs multi-column
   - Newspaper layout
   - Table-based layout
   - Mixed layout

2. **Column Detection**
   - Detect column boundaries
   - Assign content to columns
   - Handle column spanning

3. **Region Classification**
   - Header regions
   - Footer regions
   - Body regions
   - Sidebar regions
   - Margin note regions
   - Callout regions

4. **Visual Grouping**
   - Group spatially related elements
   - Detect question blocks
   - Detect instruction blocks
   - Detect answer key blocks

5. **Spatial Relationship Analysis**
   - Distance between elements
   - Alignment relationships
   - Containment relationships
   - Sequential relationships

### Validation
- Verify layout classification matches visual inspection
- Verify column boundaries are correct
- Verify regions don't overlap incorrectly

### Repair Logic
- If layout ambiguous: Try multiple interpretations, score each
- If columns misdetected: Re-run with different parameters
- If regions overlap: Adjust boundaries based on content

### Confidence Scoring
- Layout classification confidence: 0-1
- Column detection confidence: 0-1
- Region classification confidence: 0-1
- Overall stage confidence: Weighted average

### Stage Output Schema
```typescript
interface LayoutStageOutput {
  layoutType: 'single_column' | 'double_column' | 'triple_column' | 'newspaper' | 'table_based' | 'mixed';
  columns: Array<{
    index: number;
    bbox: BBox;
    content: string[];
  }>;
  regions: Array<{
    type: 'header' | 'footer' | 'body' | 'sidebar' | 'margin_note' | 'callout';
    bbox: BBox;
    content: string[];
    confidence: number;
  }>;
  visualGroups: Array<{
    elements: Array<{ type: string; bbox: BBox }>;
    confidence: number;
  }>;
  spatialRelationships: Array<{
    from: BBox;
    to: BBox;
    relationship: 'above' | 'below' | 'left' | 'right' | 'contains' | 'overlaps';
    distance: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 3: Structural Parsing

### Purpose
Parse document structure (headings, paragraphs, lists, tables) preserving hierarchy.

### Inputs
- OCR stage output (text, layout)
- Layout stage output (regions, columns)

### Outputs
- Document structure tree
- Heading hierarchy
- Paragraph boundaries
- List structures
- Table structures
- Section boundaries

### Process
1. **Heading Detection**
   - Detect headings by font size, weight, position
   - Build heading hierarchy (H1, H2, H3, etc.)
   - Detect section numbers

2. **Paragraph Detection**
   - Identify paragraph boundaries
   - Handle wrapped text
   - Preserve paragraph breaks

3. **List Detection**
   - Detect ordered lists
   - Detect unordered lists
   - Detect nested lists
   - Preserve list structure

4. **Table Parsing**
   - Parse table structure
   - Identify header rows
   - Handle merged cells
   - Preserve cell content

5. **Section Boundary Detection**
   - Detect section breaks
   - Identify major sections
   - Preserve section hierarchy

### Validation
- Verify heading hierarchy is logical
- Verify list nesting is correct
- Verify table structure is valid
- Verify section boundaries make sense

### Repair Logic
- If heading hierarchy broken: Re-detect with different criteria
- If list nesting wrong: Re-parse with different rules
- If table structure invalid: Re-parse with different algorithm

### Confidence Scoring
- Heading detection confidence: 0-1
- Paragraph detection confidence: 0-1
- List detection confidence: 0-1
- Table parsing confidence: 0-1
- Overall stage confidence: Weighted average

### Stage Output Schema
```typescript
interface StructuralStageOutput {
  structure: {
    headings: Array<{
      level: number;
      text: string;
      bbox: BBox;
      children: string[];
    }>;
    paragraphs: Array<{
      text: string;
      bbox: BBox;
      headingId?: string;
    }>;
    lists: Array<{
      type: 'ordered' | 'unordered';
      items: Array<{ text: string; bbox: BBox; level: number }>;
      bbox: BBox;
    }>;
    tables: Array<{
      rows: number;
      cols: number;
      headers: string[];
      cells: string[][];
      bbox: BBox;
    }>;
    sections: Array<{
      title: string;
      headingId: string;
      content: string[];
      bbox: BBox;
    }>;
  };
  stageConfidence: number;
}
```

---

## STAGE 4: Heading & Section Detection

### Purpose
Identify all headings and sections to understand document organization.

### Inputs
- Structural stage output (headings, sections)

### Outputs
- Complete heading hierarchy
- Section tree
- Section types (instruction, question, answer, etc.)
- Section metadata

### Process
1. **Heading Hierarchy Construction**
   - Build tree from headings
   - Assign parent-child relationships
   - Handle missing levels

2. **Section Type Classification**
   - Classify sections as:
     - Instructions
     - Question sections
     - Answer key sections
     - Reference sections
     - Content sections

3. **Section Metadata Extraction**
   - Extract section numbers
   - Extract section titles
   - Extract difficulty labels
   - Extract time limits
   - Extract topic labels

4. **Section Boundary Refinement**
   - Refine section boundaries based on content
   - Handle orphaned content
   - Merge related sections

### Validation
- Verify heading hierarchy is consistent
- Verify section types are correct
- Verify section boundaries are accurate

### Repair Logic
- If hierarchy inconsistent: Re-construct with different rules
- If section type wrong: Re-classify with more context
- If boundaries wrong: Adjust based on content analysis

### Confidence Scoring
- Hierarchy confidence: 0-1
- Classification confidence: 0-1
- Boundary confidence: 0-1
- Overall stage confidence: Weighted average

### Stage Output Schema
```typescript
interface HeadingStageOutput {
  headingTree: {
    root: HeadingNode;
  };
  sections: Array<{
    id: string;
    title: string;
    type: 'instruction' | 'question' | 'answer_key' | 'reference' | 'content';
    level: number;
    parentId?: string;
    children: string[];
    bbox: BBox;
    metadata: {
      number?: string;
      difficulty?: 'easy' | 'medium' | 'hard';
      timeLimit?: string;
      topic?: string;
    };
  }>;
  stageConfidence: number;
}

interface HeadingNode {
  id: string;
  level: number;
  text: string;
  bbox: BBox;
  children: HeadingNode[];
  sectionId?: string;
}
```

---

## STAGE 5: Section Classification

### Purpose
Classify each section to determine how to process its content.

### Inputs
- Heading stage output (sections, heading tree)
- Structural stage output (paragraphs, lists, tables)

### Outputs
- Section classifications
- Processing strategy per section
- Section confidence scores

### Process
1. **Section Type Classification** (AI Agent)
   - Use AI to classify section type:
     - Question paper section
     - Study notes section
     - Mixed content section
     - Answer key section
     - Reference section
     - Instruction section

2. **Content Type Analysis**
   - Analyze content within section
   - Identify question density
   - Identify instruction density
   - Identify explanation density

3. **Processing Strategy Selection**
   - Select appropriate processing strategy:
     - Question extraction mode
     - Question generation mode
     - Mixed mode
     - Skip mode

### Validation
- Verify section classifications make sense
- Verify processing strategies are appropriate

### Repair Logic
- If classification ambiguous: Use multiple models, aggregate
- If strategy wrong: Re-select based on content analysis

### Confidence Scoring
- Classification confidence: 0-1
- Strategy confidence: 0-1
- Overall stage confidence: Weighted average

### Stage Output Schema
```typescript
interface SectionClassificationOutput {
  sections: Array<{
    id: string;
    classification: 'question_paper' | 'study_notes' | 'mixed' | 'answer_key' | 'reference' | 'instruction';
    contentAnalysis: {
      questionDensity: number;
      instructionDensity: number;
      explanationDensity: number;
    };
    processingStrategy: 'extract' | 'generate' | 'mixed' | 'skip';
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 6: Question Candidate Detection

### Purpose
Identify all potential question regions in the document.

### Inputs
- Section classification output
- Structural stage output
- Layout stage output

### Outputs
- Question candidate regions
- Candidate confidence scores
- Candidate features

### Process
1. **Pattern-Based Detection**
   - Detect numbered questions
   - Detect "Question X" patterns
   - Detect "Q X" patterns
   - Detect question words (What, Which, Who, etc.)

2. **Semantic Detection** (AI Agent)
   - Use AI to detect question intent
   - Identify questions without explicit markers
   - Distinguish questions from statements

3. **Layout-Based Detection**
   - Detect question regions based on layout
   - Use visual grouping
   - Identify question blocks

4. **Feature Extraction**
   - Extract features for each candidate:
     - Text features
     - Layout features
     - Position features
     - Context features

### Validation
- Verify candidates are actually questions
- Verify no questions were missed

### Repair Logic
- If false positives: Re-run with stricter criteria
- If false negatives: Re-run with looser criteria

### Confidence Scoring
- Pattern confidence: 0-1
- Semantic confidence: 0-1
- Layout confidence: 0-1
- Overall candidate confidence: Weighted average

### Stage Output Schema
```typescript
interface QuestionCandidateOutput {
  candidates: Array<{
    id: string;
    bbox: BBox;
    text: string;
    features: {
      hasNumbering: boolean;
      hasQuestionWord: boolean;
      hasOptions: boolean;
      position: 'start' | 'middle' | 'end';
      sectionType: string;
    };
    confidence: {
      pattern: number;
      semantic: number;
      layout: number;
      overall: number;
    };
  }>;
  stageConfidence: number;
}
```

---

## STAGE 7: Question Boundary Detection

### Purpose
Determine exact boundaries of each question (start and end).

### Inputs
- Question candidate output
- Structural stage output
- Layout stage output

### Outputs
- Question boundaries
- Question content
- Boundary confidence

### Process
1. **Start Boundary Detection**
   - Identify where question begins
   - Handle implicit starts
   - Handle shared context

2. **End Boundary Detection**
   - Identify where question ends
   - Detect next question start
   - Detect section boundaries
   - Detect instruction blocks

3. **Content Inclusion**
   - Include options
   - Include explanation
   - Include images
   - Include tables
   - Include code blocks

4. **Semantic Boundary Detection** (AI Agent)
   - Use AI to understand semantic boundaries
   - Handle wrapped text
   - Handle page breaks
   - Handle multi-page questions

### Validation
- Verify boundaries don't split content incorrectly
- Verify no content is orphaned
- Verify boundaries align with visual inspection

### Repair Logic
- If boundaries wrong: Re-detect with different algorithm
- If content orphaned: Adjust boundaries
- If content split: Merge boundaries

### Confidence Scoring
- Start boundary confidence: 0-1
- End boundary confidence: 0-1
- Overall boundary confidence: Weighted average

### Stage Output Schema
```typescript
interface QuestionBoundaryOutput {
  questions: Array<{
    id: string;
    startBoundary: {
      position: { page: number; x: number; y: number };
      confidence: number;
    };
    endBoundary: {
      position: { page: number; x: number; y: number };
      confidence: number;
    };
    content: {
      text: string;
      images: ImageReference[];
      tables: TableReference[];
      codeBlocks: CodeBlockReference[];
    };
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 8: Question Type Classification

### Purpose
Classify each question into its correct type.

### Inputs
- Question boundary output
- Section classification output

### Outputs
- Question types
- Type confidence scores
- Type-specific features

### Process
1. **Type Detection** (AI Agent)
   - Classify question type:
     - Multiple Choice (single correct)
     - Multiple Select (multiple correct)
     - True/False
     - Fill-in-the-Blank
     - Short Answer
     - Long Answer
     - Match the Following
     - Ordering/Sequence
     - Assertion-Reason
     - Case Study
     - Reading Comprehension
     - Coding/Programming
     - Diagram-based
     - Mathematical
     - Practical/Lab
     - Essay
     - Mixed/Nested

2. **Feature Extraction**
   - Extract type-specific features:
     - Option count
     - Option format
     - Answer format
     - Question length
     - Presence of code/math/tables

3. **Type Validation**
   - Validate type matches content
   - Check for type conflicts
   - Handle mixed types

### Validation
- Verify type matches question structure
- Verify type is supported
- Verify type-specific features are present

### Repair Logic
- If type wrong: Re-classify with different model
- If type ambiguous: Flag for manual review
- If type unsupported: Convert to closest supported type

### Confidence Scoring
- Type classification confidence: 0-1
- Feature confidence: 0-1
- Overall type confidence: Weighted average

### Stage Output Schema
```typescript
interface QuestionTypeOutput {
  questions: Array<{
    id: string;
    type: QuestionType;
    confidence: number;
    features: {
      optionCount: number;
      hasCode: boolean;
      hasMath: boolean;
      hasTable: boolean;
      hasImage: boolean;
      questionLength: number;
    };
  }>;
  stageConfidence: number;
}

type QuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'long_answer'
  | 'match_following'
  | 'ordering'
  | 'assertion_reason'
  | 'case_study'
  | 'reading_comprehension'
  | 'coding'
  | 'diagram_based'
  | 'mathematical'
  | 'practical'
  | 'essay'
  | 'mixed'
  | 'nested';
```

---

## STAGE 9: Option Extraction

### Purpose
Extract all options for multiple-choice and multiple-select questions.

### Inputs
- Question boundary output
- Question type output
- Structural stage output

### Outputs
- Extracted options
- Option confidence scores
- Option formatting

### Process
1. **Option Detection**
   - Detect option markers (A, B, C, D, a, b, c, d, 1, 2, 3, 4)
   - Detect checkboxes
   - Detect radio buttons
   - Detect inline options

2. **Option Content Extraction**
   - Extract option text
   - Handle wrapped options
   - Handle multi-line options
   - Preserve formatting

3. **Option Structure Preservation**
   - Preserve option order
   - Preserve option markers
   - Preserve option formatting (bold, italic, etc.)

4. **Special Option Handling**
   - Handle images as options
   - Handle tables as options
   - Handle code as options
   - Handle math as options

### Validation
- Verify all options are extracted
- Verify option order is correct
- Verify option formatting is preserved

### Repair Logic
- If options missing: Re-detect with different patterns
- If options wrong: Re-extract with different algorithm
- If order wrong: Re-order based on markers

### Confidence Scoring
- Detection confidence: 0-1
- Content confidence: 0-1
- Structure confidence: 0-1
- Overall option confidence: Weighted average

### Stage Output Schema
```typescript
interface OptionExtractionOutput {
  questions: Array<{
    id: string;
    options: Array<{
      id: string;
      marker: string;
      text: string;
      isCorrect?: boolean;
      image?: ImageReference;
      table?: TableReference;
      code?: CodeBlockReference;
      confidence: number;
    }>;
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 10: Table Reconstruction

### Purpose
Reconstruct tables with full structure, preserving merged cells, headers, and alignment.

### Inputs
- OCR stage output (table regions)
- Structural stage output (table structures)

### Outputs
- Reconstructed tables
- Table structure
- Table confidence

### Process
1. **Table Structure Detection**
   - Detect row boundaries
   - Detect column boundaries
   - Detect merged cells
   - Detect header rows

2. **Cell Content Extraction**
   - Extract content from each cell
   - Handle multi-line cells
   - Handle cells with images
   - Handle cells with tables (nested tables)

3. **Table Reconstruction**
   - Reconstruct table structure
   - Preserve cell merging
   - Preserve alignment
   - Preserve units

4. **Table Question Detection**
   - Detect if table contains questions
   - Detect if table is question data
   - Detect if table is reference material

### Validation
- Verify table structure is valid
- Verify all cells are extracted
- Verify merged cells are preserved

### Repair Logic
- If structure wrong: Re-detect with different algorithm
- If cells missing: Re-extract with different method
- If merging wrong: Re-analyze cell boundaries

### Confidence Scoring
- Structure confidence: 0-1
- Cell confidence: 0-1
- Overall table confidence: Weighted average

### Stage Output Schema
```typescript
interface TableReconstructionOutput {
  tables: Array<{
    id: string;
    bbox: BBox;
    structure: {
      rows: number;
      cols: number;
      mergedCells: Array<{ row: number; col: number; rowSpan: number; colSpan: number }>;
      headerRows: number[];
    };
    cells: Array<{
      row: number;
      col: number;
      content: string;
      image?: ImageReference;
      table?: TableReference; // nested
    }>;
    containsQuestions: boolean;
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 11: Image Association

### Purpose
Associate images with nearby questions and preserve captions.

### Inputs
- OCR stage output (image regions)
- Question boundary output
- Layout stage output

### Outputs
- Image-question associations
- Image captions
- Image confidence

### Process
1. **Image Detection**
   - Detect all images in document
   - Extract image data
   - Detect image boundaries

2. **Caption Extraction**
   - Extract image captions
   - Extract figure labels
   - Extract image references

3. **Image-Question Association**
   - Associate images with nearby questions
   - Use spatial proximity
   - Use textual references
   - Use figure numbers

4. **Image Content Analysis** (AI Agent)
   - Classify image type (diagram, chart, photo, etc.)
   - Extract text from image (OCR)
   - Detect if image is essential to question

### Validation
- Verify images are associated correctly
- Verify captions are extracted
- Verify no images are orphaned

### Repair Logic
- If association wrong: Re-associate with different algorithm
- If caption missing: Re-extract with different method
- If image orphaned: Search for nearby questions

### Confidence Scoring
- Association confidence: 0-1
- Caption confidence: 0-1
- Overall image confidence: Weighted average

### Stage Output Schema
```typescript
interface ImageAssociationOutput {
  images: Array<{
    id: string;
    bbox: BBox;
    data: Buffer;
    caption?: string;
    associatedQuestionId?: string;
    associationConfidence: number;
    type: 'diagram' | 'chart' | 'photo' | 'screenshot' | 'other';
    containsText: boolean;
    extractedText?: string;
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 12: Equation Detection

### Purpose
Detect and preserve mathematical equations in LaTeX, MathML, or Unicode.

### Inputs
- Question boundary output
- OCR stage output

### Outputs
- Detected equations
- Equation format
- Equation confidence

### Process
1. **Equation Detection**
   - Detect LaTeX delimiters ($, $$, \[, \])
   - Detect MathML tags
   - Detect Unicode math symbols
   - Detect inline equations
   - Detect block equations

2. **Equation Extraction**
   - Extract equation content
   - Preserve equation format
   - Handle nested equations

3. **Equation Conversion** (if needed)
   - Convert to standard format (LaTeX)
   - Preserve mathematical meaning
   - Handle special symbols

### Validation
- Verify equations are detected
- Verify format is preserved
- Verify meaning is preserved

### Repair Logic
- If detection fails: Re-detect with different patterns
- If conversion fails: Keep original format
- If meaning lost: Flag for manual review

### Confidence Scoring
- Detection confidence: 0-1
- Format confidence: 0-1
- Overall equation confidence: Weighted average

### Stage Output Schema
```typescript
interface EquationDetectionOutput {
  equations: Array<{
    id: string;
    content: string;
    format: 'latex' | 'mathml' | 'unicode';
    type: 'inline' | 'block';
    bbox: BBox;
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 13: Code Block Detection

### Purpose
Detect and preserve code blocks with proper indentation and syntax highlighting.

### Inputs
- Question boundary output
- Structural stage output

### Outputs
- Detected code blocks
- Code language
- Code formatting

### Process
1. **Code Block Detection**
   - Detect code fences (```)
   - Detect indentation patterns
   - Detect syntax keywords
   - Detect function/class definitions

2. **Language Detection**
   - Detect programming language
   - Use syntax analysis
   - Use file extensions (if present)

3. **Code Extraction**
   - Extract code content
   - Preserve indentation
   - Preserve syntax
   - Preserve comments

### Validation
- Verify code blocks are detected
- Verify language is correct
- Verify formatting is preserved

### Repair Logic
- If detection fails: Re-detect with different patterns
- If language wrong: Re-detect with syntax analysis
- If formatting lost: Re-extract with different method

### Confidence Scoring
- Detection confidence: 0-1
- Language confidence: 0-1
- Overall code confidence: Weighted average

### Stage Output Schema
```typescript
interface CodeBlockDetectionOutput {
  codeBlocks: Array<{
    id: string;
    content: string;
    language: string;
    bbox: BBox;
    indentation: number;
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 14: Context Reconstruction

### Purpose
Reconstruct complete questions by combining split content across pages/columns.

### Inputs
- Question boundary output
- Layout stage output
- OCR stage output

### Outputs
- Reconstructed questions
- Reconstruction confidence
- Reconstruction operations

### Process
1. **Page-Span Detection**
   - Detect questions spanning pages
   - Detect options on different pages
   - Detect images on different pages

2. **Content Reassembly**
   - Reassemble split questions
   - Reassemble split options
   - Reassemble split explanations

3. **Context Association**
   - Associate related content
   - Associate footnotes
   - Associate references

4. **Logical Reconstruction** (AI Agent)
   - Use AI to understand logical structure
   - Reconstruct question meaning
   - Handle implicit connections

### Validation
- Verify questions are complete
- Verify no content is orphaned
- Verify logical structure is preserved

### Repair Logic
- If reconstruction wrong: Re-assemble with different algorithm
- If content orphaned: Search for related content
- If logic broken: Re-analyze with AI

### Confidence Scoring
- Reassembly confidence: 0-1
- Association confidence: 0-1
- Overall reconstruction confidence: Weighted average

### Stage Output Schema
```typescript
interface ContextReconstructionOutput {
  questions: Array<{
    id: string;
    reconstructedContent: {
      text: string;
      options: Option[];
      explanation?: string;
      images: ImageReference[];
      tables: TableReference[];
      codeBlocks: CodeBlockReference[];
      equations: EquationReference[];
    };
    reconstructionOperations: Array<{
      type: 'merge' | 'associate' | 'reorder';
      sourceIds: string[];
      confidence: number;
    }>;
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 15: Answer Detection

### Purpose
Detect correct answers for all question types.

### Inputs
- Context reconstruction output
- Section classification output
- Question type output

### Outputs
- Correct answers
- Answer confidence
- Answer location

### Process
1. **Answer Key Detection**
   - Detect answer key sections
   - Parse answer key format
   - Match answers to questions

2. **Inline Answer Detection**
   - Detect inline correct markers (✅, checkmarks)
   - Detect "Correct Answer:" labels
   - Detect bold/underlined answers

3. **Answer Extraction** (AI Agent)
   - Use AI to identify correct answers
   - Handle multiple correct answers
   - Handle partial credit
   - Handle explanation-based answers

4. **Answer Validation**
   - Verify answer matches question type
   - Verify answer is among options (for MCQ)
   - Verify answer format is correct

### Validation
- Verify answers are detected
- Verify answers are correct
- Verify answer format matches type

### Repair Logic
- If answer missing: Re-detect with different method
- If answer wrong: Re-extract with AI
- If format wrong: Re-format based on type

### Confidence Scoring
- Detection confidence: 0-1
- Validation confidence: 0-1
- Overall answer confidence: Weighted average

### Stage Output Schema
```typescript
interface AnswerDetectionOutput {
  questions: Array<{
    id: string;
    answer: {
      value: string | string[];
      type: 'single' | 'multiple' | 'text';
      location: 'inline' | 'answer_key' | 'inferred';
      confidence: number;
    };
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 16: Metadata Extraction

### Purpose
Extract question metadata (difficulty, topic, marks, Bloom's level, etc.).

### Inputs
- Context reconstruction output
- Section classification output
- Heading stage output

### Outputs
- Question metadata
- Metadata confidence
- Metadata sources

### Process
1. **Difficulty Extraction**
   - Detect difficulty labels (Easy, Medium, Hard)
   - Infer difficulty from question complexity
   - Use AI to estimate difficulty

2. **Topic Extraction**
   - Extract topic from section headers
   - Extract topic from question content
   - Use AI to classify topic

3. **Marks Extraction**
   - Detect marks/points labels
   - Infer marks from question type
   - Handle partial credit

4. **Bloom's Level Extraction**
   - Detect Bloom's level labels
   - Infer Bloom's level from question
   - Use AI to classify Bloom's level

5. **Other Metadata**
   - Time limits
   - Reference materials
   - Instructions
   - Tags

### Validation
- Verify metadata is consistent
- Verify metadata is reasonable
- Verify metadata sources are reliable

### Repair Logic
- If metadata missing: Infer from context
- If metadata inconsistent: Re-extract with different method
- If metadata unreasonable: Use default values

### Confidence Scoring
- Extraction confidence: 0-1
- Inference confidence: 0-1
- Overall metadata confidence: Weighted average

### Stage Output Schema
```typescript
interface MetadataExtractionOutput {
  questions: Array<{
    id: string;
    metadata: {
      difficulty: 'easy' | 'medium' | 'hard';
      topic: string;
      subtopic?: string;
      marks?: number;
      bloomLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
      timeLimit?: string;
      tags?: string[];
      source: 'explicit' | 'inferred' | 'default';
    };
    confidence: number;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 17: Validation

### Purpose
Validate extracted questions against source document to detect omissions and mistakes.

### Inputs
- All previous stage outputs
- Original document

### Outputs
- Validation results
- Detected issues
- Coverage metrics

### Process
1. **Coverage Analysis**
   - Calculate percentage of document extracted
   - Identify missing content
   - Identify extra content

2. **Boundary Validation**
   - Verify question boundaries are correct
   - Verify no content is split incorrectly
   - Verify no content is merged incorrectly

3. **Content Validation**
   - Verify extracted text matches source
   - Verify options are complete
   - Verify answers are correct
   - Verify metadata is accurate

4. **Structure Validation**
   - Verify question structure is valid
   - Verify type matches content
   - Verify formatting is preserved

5. **Independent Review** (AI Agent)
   - Use independent AI to review extraction
   - Compare extraction with source
   - Flag discrepancies

### Validation
- Verify validation is comprehensive
- Verify issues are detected
- Verify coverage is measured

### Repair Logic
- If validation incomplete: Re-run with different checks
- If issues missed: Add new validation rules
- If coverage low: Investigate missing content

### Confidence Scoring
- Coverage confidence: 0-1
- Boundary confidence: 0-1
- Content confidence: 0-1
- Overall validation confidence: Weighted average

### Stage Output Schema
```typescript
interface ValidationOutput {
  results: {
    coverage: {
      percentage: number;
      missingContent: Array<{ bbox: BBox; text: string }>;
      extraContent: Array<{ id: string; text: string }>;
    };
    boundaries: {
      correct: number;
      incorrect: Array<{ questionId: string; issue: string }>;
    };
    content: {
      textMatch: number;
      optionCompleteness: number;
      answerAccuracy: number;
      metadataAccuracy: number;
    };
    structure: {
      validQuestions: number;
      invalidQuestions: Array<{ questionId: string; issue: string }>;
    };
  };
  issues: Array<{
    type: 'missing' | 'extra' | 'incorrect' | 'incomplete';
    severity: 'low' | 'medium' | 'high';
    description: string;
    questionId?: string;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 18: Repair

### Purpose
Repair issues detected during validation.

### Inputs
- Validation output
- All previous stage outputs

### Outputs
- Repaired questions
- Repair operations
- Repair confidence

### Process
1. **Missing Question Repair**
   - Re-run question detection on missing regions
   - Extract missed questions
   - Add to question list

2. **Merged Question Repair**
   - Split merged questions
   - Re-detect boundaries
   - Re-extract content

3. **Split Question Repair**
   - Merge split questions
   - Reconstruct context
   - Re-assemble content

4. **Missing Option Repair**
   - Re-detect options
   - Extract missing options
   - Add to question

5. **Wrong Answer Repair**
   - Re-detect answer
   - Verify with AI
   - Update answer

6. **Metadata Repair**
   - Re-extract metadata
   - Infer from context
   - Update metadata

### Validation
- Verify repairs are correct
- Verify no new issues introduced
- Verify repairs improve quality

### Repair Logic
- If repair fails: Try alternative repair method
- If repair introduces issues: Rollback and try different approach
- If repair uncertain: Flag for manual review

### Confidence Scoring
- Repair success confidence: 0-1
- Repair quality confidence: 0-1
- Overall repair confidence: Weighted average

### Stage Output Schema
```typescript
interface RepairOutput {
  repairs: Array<{
    type: 'add_question' | 'split_question' | 'merge_question' | 'add_option' | 'fix_answer' | 'fix_metadata';
    questionId?: string;
    operation: any;
    success: boolean;
    confidence: number;
  }>;
  repairedQuestions: Question[];
  stageConfidence: number;
}
```

---

## STAGE 19: Confidence Scoring

### Purpose
Calculate comprehensive confidence scores for each question and overall extraction.

### Inputs
- All previous stage outputs
- Repair output

### Outputs
- Per-question confidence scores
- Per-field confidence scores
- Overall extraction confidence

### Process
1. **Per-Stage Confidence Aggregation**
   - Aggregate confidence from all stages
   - Weight stages by importance
   - Calculate overall confidence

2. **Per-Question Confidence**
   - Calculate confidence per question
   - Aggregate stage confidences for question
   - Identify low-confidence questions

3. **Per-Field Confidence**
   - Calculate confidence for each field:
     - Text confidence
     - Options confidence
     - Answer confidence
     - Metadata confidence
     - Image confidence
     - Table confidence

4. **Confidence Calibration**
   - Calibrate confidence scores
   - Adjust based on historical accuracy
   - Flag uncertain extractions

### Validation
- Verify confidence scores are accurate
- Verify low-confidence items are flagged
- Verify calibration is correct

### Repair Logic
- If confidence inaccurate: Re-calibrate with historical data
- If calibration off: Adjust weighting

### Confidence Scoring
- Overall confidence: 0-1
- Per-question confidence: 0-1
- Per-field confidence: 0-1

### Stage Output Schema
```typescript
interface ConfidenceScoringOutput {
  overall: {
    confidence: number;
    stageConfidences: Record<string, number>;
  };
  questions: Array<{
    id: string;
    confidence: {
      overall: number;
      text: number;
      options: number;
      answer: number;
      metadata: number;
      images: number;
      tables: number;
    };
    stageConfidences: Record<string, number>;
    flagForReview: boolean;
    reason?: string;
  }>;
  stageConfidence: number;
}
```

---

## STAGE 20: Final JSON Generation

### Purpose
Generate final JSON output with all extracted questions and metadata.

### Inputs
- Confidence scoring output
- All previous stage outputs

### Outputs
- Final JSON
- Generation confidence
- Generation statistics

### Process
1. **JSON Structure Assembly**
   - Assemble question objects
   - Include all fields
   - Preserve formatting

2. **Schema Validation**
   - Validate against JSON schema
   - Ensure all required fields present
   - Ensure data types correct

3. **Final Quality Check**
   - Verify JSON is valid
   - Verify no data loss
   - Verify formatting preserved

4. **Statistics Generation**
   - Generate extraction statistics
   - Calculate coverage metrics
   - Calculate accuracy metrics

### Validation
- Verify JSON is valid
- Verify schema compliance
- Verify no data loss

### Repair Logic
- If JSON invalid: Fix schema violations
- If data loss: Re-extract missing data
- If formatting lost: Re-apply formatting

### Confidence Scoring
- JSON validity confidence: 0-1
- Schema compliance confidence: 0-1
- Overall generation confidence: Weighted average

### Stage Output Schema
```typescript
interface FinalJSONOutput {
  json: {
    questions: Question[];
    metadata: {
      sourceType: string;
      extractionDate: string;
      overallConfidence: number;
      statistics: {
        totalQuestions: number;
        coverage: number;
        averageConfidence: number;
        lowConfidenceCount: number;
      };
    };
  };
  stageConfidence: number;
}

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    image?: ImageReference;
  }>;
  correctAnswer: string | string[];
  explanation?: string;
  images?: ImageReference[];
  tables?: TableReference[];
  codeBlocks?: CodeBlockReference[];
  equations?: EquationReference[];
  metadata: {
    difficulty: 'easy' | 'medium' | 'hard';
    topic: string;
    subtopic?: string;
    marks?: number;
    bloomLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
    confidence: number;
  };
}
```

---

## PART 3: Multi-Agent Architecture

### Agent Design

The pipeline uses multiple specialized AI agents, each with a specific role:

#### Agent 1: Document Understanding Agent
**Role:** Analyze layout and document structure
**Input:** OCR output, layout regions
**Output:** Document structure, layout analysis
**Capabilities:**
- Understand document layout
- Identify sections
- Classify regions
- Detect visual hierarchy

#### Agent 2: Question Detection Agent
**Role:** Identify all potential question regions
**Input:** Document structure, text content
**Output:** Question candidates
**Capabilities:**
- Detect question intent
- Identify question boundaries
- Handle various numbering systems
- Detect implicit questions

#### Agent 3: Question Reconstruction Agent
**Role:** Combine split content into complete questions
**Input:** Question candidates, layout, context
**Output:** Reconstructed questions
**Capabilities:**
- Reassemble split questions
- Associate related content
- Handle page-spanning questions
- Preserve context

#### Agent 4: Question Classification Agent
**Role:** Identify question type
**Input:** Reconstructed questions
**Output:** Question types
**Capabilities:**
- Classify question type
- Detect special formats
- Handle mixed types
- Identify nested questions

#### Agent 5: Validation Agent
**Role:** Compare extraction with source document
**Input:** Extracted questions, source document
**Output:** Validation results
**Capabilities:**
- Detect omissions
- Detect mistakes
- Measure coverage
- Flag discrepancies

#### Agent 6: Repair Agent
**Role:** Fix issues found during validation
**Input:** Validation results, extracted questions
**Output:** Repaired questions
**Capabilities:**
- Fix missing questions
- Split merged questions
- Merge split questions
- Fix incorrect answers

#### Agent 7: Quality Scoring Agent
**Role:** Assign confidence scores
**Input:** All stage outputs, validation results
**Output:** Confidence scores
**Capabilities:**
- Calculate confidence
- Calibrate scores
- Flag uncertain extractions
- Aggregate signals

### Agent Orchestration

```
Document Input
    ↓
[Document Understanding Agent] → Layout & Structure
    ↓
[Question Detection Agent] → Question Candidates
    ↓
[Question Reconstruction Agent] → Complete Questions
    ↓
[Question Classification Agent] → Question Types
    ↓
[Validation Agent] → Issues Detected
    ↓
[Repair Agent] → Repaired Questions
    ↓
[Quality Scoring Agent] → Confidence Scores
    ↓
Final JSON
```

### Agent Communication

Agents communicate through shared state and can:
- Request re-processing from previous stages
- Provide feedback to improve accuracy
- Debate decisions when uncertain
- Aggregate multiple opinions

### Agent Specialization

Each agent is specialized for its task:
- **Document Understanding Agent:** Trained on layout analysis
- **Question Detection Agent:** Trained on question patterns
- **Question Reconstruction Agent:** Trained on context understanding
- **Question Classification Agent:** Trained on question types
- **Validation Agent:** Trained on document comparison
- **Repair Agent:** Trained on error correction
- **Quality Scoring Agent:** Trained on quality assessment

---

## PART 4: Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- Set up multi-stage pipeline framework
- Implement Stage 1 (OCR & Preprocessing)
- Implement Stage 2 (Layout Detection)
- Implement Stage 3 (Structural Parsing)
- Set up agent framework

### Phase 2: Core Extraction (Weeks 5-8)
- Implement Stage 4 (Heading Detection)
- Implement Stage 5 (Section Classification)
- Implement Stage 6 (Question Candidate Detection)
- Implement Document Understanding Agent
- Implement Question Detection Agent

### Phase 3: Question Processing (Weeks 9-12)
- Implement Stage 7 (Question Boundary Detection)
- Implement Stage 8 (Question Type Classification)
- Implement Stage 9 (Option Extraction)
- Implement Question Reconstruction Agent
- Implement Question Classification Agent

### Phase 4: Specialized Content (Weeks 13-16)
- Implement Stage 10 (Table Reconstruction)
- Implement Stage 11 (Image Association)
- Implement Stage 12 (Equation Detection)
- Implement Stage 13 (Code Block Detection)
- Implement Stage 14 (Context Reconstruction)

### Phase 5: Answer & Metadata (Weeks 17-20)
- Implement Stage 15 (Answer Detection)
- Implement Stage 16 (Metadata Extraction)
- Improve agent accuracy with training

### Phase 6: Validation & Repair (Weeks 21-24)
- Implement Stage 17 (Validation)
- Implement Stage 18 (Repair)
- Implement Validation Agent
- Implement Repair Agent

### Phase 7: Quality & Output (Weeks 25-28)
- Implement Stage 19 (Confidence Scoring)
- Implement Stage 20 (Final JSON Generation)
- Implement Quality Scoring Agent
- Optimize performance

### Phase 8: Testing & Refinement (Weeks 29-32)
- Create golden dataset
- Test on diverse documents
- Measure accuracy metrics
- Refine based on results

### Phase 9: Production Deployment (Weeks 33-36)
- Optimize for production
- Set up monitoring
- Deploy to production
- Monitor and improve

---

## PART 5: Risk Analysis

### High Risks
1. **AI Agent Accuracy:** Agents may not be accurate enough
   - Mitigation: Extensive training, validation, human-in-the-loop

2. **Performance:** 20 stages may be slow
   - Mitigation: Parallel processing, caching, optimization

3. **Complexity:** System is very complex
   - Mitigation: Modular design, clear documentation, testing

### Medium Risks
1. **OCR Quality:** Poor OCR affects all downstream stages
   - Mitigation: Multiple OCR engines, repair pipeline

2. **Layout Complexity:** Complex layouts may be misinterpreted
   - Mitigation: Multiple layout analysis methods, fallback strategies

3. **Cost:** Multiple AI agents may be expensive
   - Mitigation: Efficient agent design, caching, batching

### Low Risks
1. **Maintenance:** Complex system requires maintenance
   - Mitigation: Good documentation, monitoring, automated testing

2. **Scalability:** System may not scale well
   - Mitigation: Distributed architecture, load balancing

---

## PART 6: Testing Strategy

### Golden Dataset
Create a dataset of 100+ documents covering:
- All file types (PDF, DOCX, PPTX, etc.)
- All layouts (single column, multi-column, etc.)
- All question types (MCQ, essay, coding, etc.)
- All numbering systems
- Edge cases (poor OCR, complex layouts, etc.)

### Metrics
Measure:
- **Precision:** Percentage of extracted questions that are correct
- **Recall:** Percentage of actual questions that were extracted
- **F1 Score:** Harmonic mean of precision and recall
- **Question Coverage:** Percentage of document content extracted
- **Option Accuracy:** Percentage of options extracted correctly
- **Answer Accuracy:** Percentage of answers extracted correctly
- **Ordering Accuracy:** Percentage of questions in correct order
- **Image Association:** Percentage of images associated correctly
- **Table Accuracy:** Percentage of tables reconstructed correctly
- **Math Accuracy:** Percentage of equations preserved correctly

### Testing Process
1. **Unit Testing:** Test each stage independently
2. **Integration Testing:** Test stage interactions
3. **Agent Testing:** Test each agent independently
4. **End-to-End Testing:** Test complete pipeline
5. **Regression Testing:** Test after changes
6. **User Testing:** Test with real users

### Continuous Improvement
- Collect feedback from users
- Monitor accuracy metrics
- Retrain agents with new data
- Refine stages based on results

---

## CONCLUSION

This new architecture represents a complete redesign of the extraction pipeline, prioritizing maximum accuracy through:
- 20 independent stages with validation and repair
- Multi-agent architecture with specialization
- Semantic understanding instead of regex
- Context reconstruction instead of linear processing
- Comprehensive validation and repair
- Confidence scoring at every level
- Support for all question types and edge cases

The implementation roadmap provides a clear path to building this system over 36 weeks, with testing and refinement throughout.
