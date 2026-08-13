# Document Intelligence Engine - Phase 3 Complete

## Overview

Phase 3 implements question extraction capabilities, building complete Question Objects from the document graph.

**Phase 3: Question Extraction (Weeks 13-18)** - ✅ COMPLETE

---

## What Was Built in Phase 3

### 1. Question Builder Agent (`QuestionBuilderAgent.ts`)
Specializes in assembling complete questions from document nodes:
- **Question Assembly**: Builds questions from question nodes with all components
- **Option Collection**: Collects options following each question
- **Diagram Association**: Associates nearby diagrams with questions
- **Table Association**: Associates nearby tables with questions
- **Equation Collection**: Collects equations within question context
- **Code Block Collection**: Collects code blocks within question context
- **Context Collection**: Collects preceding paragraphs as context
- **Answer Detection**: Detects answers from working memory or graph
- **Question Type Determination**: Determines basic question type
- **Completeness Checking**: Checks if questions have all required components
- **Confidence Calculation**: Calculates per-question confidence

### 2. Question Reasoner Agent (`QuestionReasonerAgent.ts`)
Specializes in determining question metadata:
- **Question Type Refinement**: Refines question type with 17+ types supported
- **Difficulty Estimation**: Estimates difficulty (easy/medium/hard) based on complexity
- **Bloom's Level Classification**: Classifies Bloom's taxonomy level (L1-L6)
- **Skill Extraction**: Extracts skills required to answer question
- **Topic Classification**: Refines topic from question content
- **Subtopic Extraction**: Extracts subtopic from question content
- **Statistics Tracking**: Tracks type, difficulty, and Bloom's distributions
- **Reasoning Tree Updates**: Updates reasoning tree with classification decisions

### 3. Question Graph Constructor (`QuestionGraphConstructor.ts`)
Builds question-specific subgraphs from the document graph:
- **Subgraph Construction**: Builds subgraph for each question with components
- **Component Collection**: Collects options, diagrams, tables, equations, code blocks, context
- **Relationship Building**: Builds relationships between question and components
- **Spatial Search**: Collects nearby nodes using spatial proximity
- **Sequential Search**: Collects following/preceding nodes
- **Answer Finding**: Finds answer nodes in the graph
- **Subgraph Confidence**: Calculates confidence for each subgraph
- **Question Object Conversion**: Converts subgraphs to Question Objects
- **Statistics**: Provides statistics on subgraph construction

### 4. Question Object Assembler (`QuestionObjectAssembler.ts`)
High-level coordinator for question extraction:
- **Agent Orchestration**: Coordinates Question Builder and Question Reasoner agents
- **Graph Integration**: Integrates Question Graph Constructor for additional context
- **Sequential Execution**: Runs agents in sequence (Builder → Reasoner)
- **Graph Enhancement**: Enhances questions with graph information
- **Page-Spanning Handling**: Handles page-spanning questions
- **Statistics Calculation**: Calculates comprehensive extraction statistics
- **Result Assembly**: Assembles final Question Objects

### 5. Context Reconstructor (`ContextReconstructor.ts`)
Enhances context reconstruction for page-spanning questions:
- **Page-Span Detection**: Detects questions spanning multiple pages
- **Multi-Page Option Collection**: Collects options across all pages
- **Multi-Page Diagram Collection**: Collects diagrams across all pages
- **Multi-Page Table Collection**: Collects tables across all pages
- **Multi-Page Context Collection**: Collects context paragraphs across all pages
- **Question Reconstruction**: Reconstructs complete questions from multiple pages
- **Deduplication**: Removes duplicate components
- **Confidence Adjustment**: Adjusts confidence for page-spanning questions
- **Metadata Updates**: Updates metadata to indicate page spanning

---

## Architecture

```
Document Graph + Working Memory
    ↓
[Question Object Assembler]
    ↓
[Agent Orchestrator]
    ↓
├── [Question Builder Agent]
│   └── Assembles questions from nodes
└── [Question Reasoner Agent]
    └── Refines question metadata
    ↓
[Question Graph Constructor]
    └── Builds question subgraphs
    ↓
[Context Reconstructor]
    └── Handles page-spanning questions
    ↓
Complete Question Objects
```

---

## Question Object Structure

Each Question Object contains:

```typescript
{
  id: string;
  sourcePage: number;
  bbox: BBox;
  statement: string;
  context: {
    paragraphs: string[];
    diagrams: DiagramReference[];
    tables: TableReference[];
  };
  options?: OptionObject[];
  diagram?: DiagramReference;
  table?: TableReference;
  equations?: EquationReference[];
  code?: CodeBlockReference[];
  correctAnswer: string;
  answerLocation: 'inline' | 'answer_key' | 'inferred';
  type: QuestionType;
  metadata: {
    difficulty: 'easy' | 'medium' | 'hard';
    topic: string;
    subtopic?: string;
    marks?: number;
    bloomLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
    skills: string[];
    sourcePage: number;
    bbox: BBox;
  };
  confidence: {
    ocr: number;
    layout: number;
    questionBoundary: number;
    options: number;
    answer: number;
    semantic: number;
    overall: number;
  };
  validation: {
    isValid: boolean;
    issues: string[];
    warnings: string[];
  };
  repairHistory: RepairOperation[];
  reasoning: ReasoningNode;
}
```

---

## Question Types Supported

- multiple_choice
- multiple_select
- true_false
- fill_blank
- short_answer
- long_answer
- match_following
- ordering
- assertion_reason
- case_study
- reading_comprehension
- coding
- diagram_based
- mathematical
- practical
- essay

---

## Key Design Decisions

1. **Agent Specialization**: Question Builder assembles, Question Reasoner refines metadata
2. **Graph-Based Construction**: Question subgraphs preserve relationships
3. **Page-Spanning Support**: Context reconstruction handles multi-page questions
4. **Confidence Breakdown**: Detailed confidence per component (OCR, layout, options, answer, semantic)
5. **Reasoning Trees**: Each question stores why decisions were made
6. **Completeness Checking**: Questions checked for required components
7. **Metadata Enrichment**: Difficulty, Bloom's level, skills, topics extracted
8. **Spatial Relationships**: Components collected using spatial proximity
9. **Sequential Relationships**: Components collected using document order
10. **Deduplication**: Duplicate components removed during reconstruction

---

## Usage Example

```typescript
import { DocumentIntelligenceEngine } from '../index.js';
import { QuestionObjectAssembler } from './agents/QuestionObjectAssembler.js';
import { ContextReconstructor } from './agents/ContextReconstructor.js';

const engine = new DocumentIntelligenceEngine();

// Process document (Phase 1)
const result = await engine.processDocument(file);

if (result.success) {
  // Get document graph and working memory
  const graph = engine.getDocumentGraph();
  const memory = engine.getWorkingMemory();

  // Create question assembler
  const assembler = new QuestionObjectAssembler(graph, memory);

  // Assemble questions (Phase 3)
  const assemblyResult = await assembler.assembleQuestions();

  if (assemblyResult.success) {
    let questions = assemblyResult.questions;

    // Handle page-spanning questions
    const reconstructor = new ContextReconstructor(graph, memory);
    const reconstructionResult = reconstructor.reconstruct(questions);

    if (reconstructionResult.pageSpanningQuestions.length > 0) {
      console.log(`Reconstructed ${reconstructionResult.pageSpanningQuestions.length} page-spanning questions`);
      questions = reconstructionResult.reconstructedQuestions;
    }

    console.log('Final questions:', questions);
    console.log('Statistics:', assemblyResult.statistics);
  }
}
```

---

## File Structure

```
documentIntelligence/
├── agents/
│   ├── QuestionBuilderAgent.ts          # Question assembly agent
│   ├── QuestionReasonerAgent.ts        # Question metadata agent
│   ├── QuestionGraphConstructor.ts     # Question subgraph builder
│   ├── QuestionObjectAssembler.ts      # High-level coordinator
│   ├── ContextReconstructor.ts         # Page-spanning handler
│   └── Phase3_README.md                # This file
```

---

## Agent Capabilities

### Question Builder Agent
- question_assembly
- option_collection
- context_association
- diagram_association
- table_association
- page_span_handling

### Question Reasoner Agent
- question_type_classification
- difficulty_estimation
- bloom_level_classification
- skill_extraction
- topic_classification
- metadata_inference

---

## Statistics Tracked

- Total questions extracted
- Type distribution (by question type)
- Difficulty distribution (easy/medium/hard)
- Bloom's level distribution (L1-L6)
- Average confidence
- Questions with diagrams
- Questions with tables
- Questions with equations
- Questions with code
- Page-spanning questions

---

## What's Next (Phase 4: Validation & Repair)

Phase 4 will implement:
- **Validator Agent**: Compares extraction with source document
- **Repair Agent**: Fixes issues found during validation
- **Reviewer Agent**: Professor-level review of extraction quality
- **Coverage Analysis**: Measures what percentage of document was extracted
- **Boundary Validation**: Verifies question boundaries are correct
- **Content Validation**: Verifies extracted content matches source
- **Repair Pipeline**: Automated repair of detected issues

---

## Testing

To test Phase 3:

```typescript
import { DocumentIntelligenceEngine } from '../index.js';
import { QuestionObjectAssembler } from './agents/QuestionObjectAssembler.js';
import { ContextReconstructor } from './agents/ContextReconstructor.js';

const engine = new DocumentIntelligenceEngine();

// Process document
const result = await engine.processDocument(testFile);

if (result.success) {
  const assembler = new QuestionObjectAssembler(
    engine.getDocumentGraph()!,
    engine.getWorkingMemory()
  );

  const assemblyResult = await assembler.assembleQuestions();

  if (assemblyResult.success) {
    const reconstructor = new ContextReconstructor(
      engine.getDocumentGraph()!,
      engine.getWorkingMemory()
    );

    const reconstructionResult = reconstructor.reconstruct(assemblyResult.questions);

    console.log('Questions:', reconstructionResult.reconstructedQuestions);
    console.log('Statistics:', assemblyResult.statistics);
    console.log('Page-spanning:', reconstructionResult.pageSpanningQuestions);
  }
}
```

---

## Notes

- Question types are determined heuristically - will use AI models in production
- Difficulty estimation uses simple heuristics - will use AI models in production
- Bloom's level classification uses keyword matching - will use AI models in production
- Page-spanning reconstruction uses working memory - requires accurate memory tracking
- Confidence scores are currently heuristic-based - will be from actual AI models
- Question subgraphs preserve relationships for future reasoning
- Context reconstruction handles most page-spanning scenarios
- Deduplication prevents duplicate components from multiple pages

---

## Status

✅ Phase 1: Foundation - COMPLETE
✅ Phase 2: Semantic Understanding - COMPLETE
✅ Phase 3: Question Extraction - COMPLETE
⏳ Phase 4: Validation & Repair - NEXT
⏳ Phase 5: Reasoning & Debugging - PENDING
⏳ Phase 6: Golden Corpus - PENDING
