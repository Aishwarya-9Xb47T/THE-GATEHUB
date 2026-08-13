# Document Intelligence Engine - Architecture Redesign

## Executive Summary

This document presents a complete redesign of the extraction system as a **Document Intelligence Engine** that first understands documents generically (notes, textbooks, assignments, question papers, answer keys) and only then extracts assessments. This approach makes the system extensible without redesigning the core.

---

## Core Philosophy

### Current Flawed Approach
```
PDF → Text → LLM → Questions
```

### New Approach
```
Document → Vision Understanding → Document Graph → Question Graph → Question Objects → Validation → Repair → Export JSON
```

### Key Difference
- **Old:** LLM reads raw OCR text
- **New:** LLM reads structured document objects with spatial relationships

### Human-Like Understanding
When a teacher reads:
```
Choose the correct answer.
1. Which of the following...
```

The teacher thinks: "This is a question" (semantic understanding)

NOT: "Regex detected 1." (pattern matching)

The system should model this semantic understanding.

---

## Architecture Overview

```
Document Input
    ↓
[Vision Understanding]
    ↓
[Document Graph Construction]
    ↓
[Semantic Classification]
    ↓
[Question Graph Construction]
    ↓
[Question Object Assembly]
    ↓
[Validation]
    ↓
[Repair]
    ↓
[Export JSON]
```

---

## Phase 1: Vision Understanding

### Purpose
Convert document into visual understanding, not just text.

### Process
1. **Document Analysis**
   - Detect pages, rotation, skew
   - Detect columns, reading order
   - Detect tables, images, diagrams
   - Detect text regions, their bounding boxes

2. **Vision AI Processing**
   - Use vision models (LayoutLM, DocAI, etc.)
   - Understand document layout
   - Detect visual hierarchy
   - Identify regions (headers, footers, body, sidebars)

3. **Spatial Relationship Extraction**
   - Distance between elements
   - Alignment relationships
   - Containment relationships
   - Sequential relationships

### Output
- Visual regions with bounding boxes
- Spatial relationships
- Layout structure
- Reading order

### Key Insight
Vision AI understands layout better than OCR text. Use vision to guide text extraction.

---

## Phase 2: Document Graph Construction

### Purpose
Represent document as a knowledge graph of objects, not as text.

### Object Types

Every element becomes an object:

```typescript
interface DocumentObject {
  id: string;
  type: ObjectType;
  bbox: { x: number; y: number; width: number; height: number };
  page: number;
  confidence: number;
  children: DocumentObject[];
  parent?: DocumentObject;
  relationships: Relationship[];
  metadata: Record<string, any>;
}

type ObjectType =
  | 'Document'
  | 'Section'
  | 'Heading'
  | 'Paragraph'
  | 'Question'
  | 'Option'
  | 'Image'
  | 'Diagram'
  | 'Equation'
  | 'Table'
  | 'CodeBlock'
  | 'Footer'
  | 'Header'
  | 'Instruction'
  | 'AnswerKey'
  | 'List'
  | 'ListItem';
```

### Graph Structure

```
Document
├── Section
│   ├── Heading
│   ├── Instruction
│   ├── Question
│   │   ├── Option
│   │   ├── Option
│   │   ├── Diagram
│   │   ├── Table
│   │   └── Answer
│   └── Question
│       ├── Option
│       └── Option
└── Appendix
    ├── Heading
    └── Table
```

### Relationship Types

```typescript
interface Relationship {
  type: 'contains' | 'precedes' | 'follows' | 'references' | 'answers' | 'illustrates';
  targetId: string;
  confidence: number;
}
```

### Construction Process

1. **Object Detection**
   - Detect all document objects
   - Assign types with confidence
   - Extract bounding boxes

2. **Relationship Extraction**
   - Identify parent-child relationships
   - Identify sequential relationships
   - Identify reference relationships
   - Identify answer relationships

3. **Graph Assembly**
   - Build hierarchical structure
   - Link related objects
   - Validate graph consistency

### Output
- Complete document knowledge graph
- All objects with relationships
- Spatial and semantic relationships

### Key Insight
Graph representation enables reasoning about document structure, not just text processing.

---

## Phase 3: Semantic Classification

### Purpose
Classify each node in the graph semantically.

### Process

1. **Node Classification** (AI Agent)
   - Classify each object type semantically
   - Distinguish between similar types
   - Handle ambiguous cases

2. **Context-Aware Classification**
   - Use surrounding context for classification
   - Use position in document
   - Use relationships to other nodes

3. **Confidence Assignment**
   - Assign classification confidence
   - Flag uncertain classifications
   - Request human review if needed

### Classification Rules

- **Heading vs Question**: Headings are short, questions are longer
- **Instruction vs Question**: Instructions don't have answers
- **Paragraph vs Option**: Options are typically short, paragraphs are longer
- **AnswerKey vs Section**: Answer keys come after questions

### Output
- Semantically classified graph
- Classification confidence per node
- Flagged uncertain nodes

### Key Insight
Semantic classification uses context, not just patterns.

---

## Phase 4: Question Graph Construction

### Purpose
Extract question-specific subgraph from document graph.

### Process

1. **Question Node Identification**
   - Find all Question nodes in document graph
   - Identify related nodes (options, diagrams, answers)
   - Build question-specific subgraphs

2. **Question Boundary Determination**
   - Determine question start and end
   - Include all related content
   - Handle page-spanning questions

3. **Question Graph Assembly**
   - Build subgraph for each question
   - Include all related nodes
   - Preserve relationships

### Question Graph Structure

```
Question
├── Statement (text)
├── Context (paragraphs, diagrams)
├── Options
│   ├── Option A
│   ├── Option B
│   └── Option C
├── Diagram
├── Table
├── Equation
├── CodeBlock
└── Answer
```

### Output
- Question-specific subgraphs
- Question boundaries
- Related content associations

### Key Insight
Question graphs preserve relationships between question and its components.

---

## Phase 5: Question Object Assembly

### Purpose
Build rich Question Objects from question graphs.

### Question Object Schema

```typescript
interface QuestionObject {
  // Identification
  id: string;
  sourcePage: number;
  bbox: { x: number; y: number; width: number; height: number };
  
  // Content
  statement: string;
  context: {
    paragraphs: string[];
    diagrams: DiagramReference[];
    tables: TableReference[];
  };
  
  // Components
  options?: OptionObject[];
  diagram?: DiagramReference;
  table?: TableReference;
  equations?: EquationReference[];
  code?: CodeBlockReference[];
  
  // Answer
  correctAnswer: string | string[];
  answerLocation: 'inline' | 'answer_key' | 'inferred';
  
  // Metadata
  type: QuestionType;
  marks?: number;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  subtopic?: string;
  skills: string[];
  blooms: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
  
  // Confidence
  confidence: {
    ocr: number;
    layout: number;
    questionBoundary: number;
    options: number;
    answer: number;
    semantic: number;
    overall: number;
  };
  
  // Validation
  validation: {
    isValid: boolean;
    issues: string[];
    warnings: string[];
  };
  
  // Repair History
  repairHistory: RepairOperation[];
  
  // Reasoning Tree
  reasoning: ReasoningNode;
}

interface OptionObject {
  id: string;
  marker: string;
  text: string;
  isCorrect: boolean;
  image?: ImageReference;
  confidence: number;
}

interface RepairOperation {
  timestamp: Date;
  type: string;
  description: string;
  before?: any;
  after?: any;
  agent: string;
}

interface ReasoningNode {
  decision: string;
  confidence: number;
  evidence: Evidence[];
  alternatives: Alternative[];
}

interface Evidence {
  type: 'heading' | 'instruction' | 'numbering' | 'semantic_intent' | 'option_pattern' | 'diagram' | 'context';
  value: any;
  confidence: number;
}

interface Alternative {
  decision: string;
  confidence: number;
  reason: string;
}
```

### Assembly Process

1. **Extract Content**
   - Extract question statement
   - Extract context (paragraphs, diagrams)
   - Extract options, diagrams, tables

2. **Determine Type**
   - Classify question type
   - Validate type matches content

3. **Extract Metadata**
   - Extract difficulty, topic, marks
   - Infer if not explicit
   - Classify Bloom's level

4. **Build Confidence**
   - Calculate per-field confidence
   - Calculate overall confidence
   - Identify low-confidence fields

5. **Build Reasoning Tree**
   - Record why decisions were made
   - Store evidence for each decision
   - Record alternatives considered

### Output
- Complete Question Objects
- Rich metadata
- Confidence breakdown
- Reasoning trees

### Key Insight
Question Objects are rich, self-describing entities with full provenance.

---

## Phase 6: Validation

### Purpose
Validate extracted questions against source document.

### Validation Agent

Pretend to be a professor reviewing the extraction.

### Validation Checks

1. **Coverage Check**
   - Are all questions extracted?
   - Is any content missing?
   - Is any content extra?

2. **Boundary Check**
   - Are question boundaries correct?
   - Is content split incorrectly?
   - Is content merged incorrectly?

3. **Content Check**
   - Is text accurate?
   - Are options complete?
   - Is answer correct?
   - Is metadata accurate?

4. **Structure Check**
   - Is question structure valid?
   - Does type match content?
   - Is formatting preserved?

### Validation Output

```typescript
interface ValidationResult {
  coverage: {
    totalQuestions: number;
    extractedQuestions: number;
    missingQuestions: number;
    extraQuestions: number;
    coveragePercentage: number;
  };
  boundaries: {
    correct: number;
    incorrect: number;
    issues: BoundaryIssue[];
  };
  content: {
    textAccuracy: number;
    optionCompleteness: number;
    answerAccuracy: number;
    metadataAccuracy: number;
  };
  structure: {
    validQuestions: number;
    invalidQuestions: number;
    issues: StructureIssue[];
  };
  overall: {
    isValid: boolean;
    confidence: number;
    issues: Issue[];
  };
}
```

### Key Insight
Validation compares extraction with source, not just internal consistency.

---

## Phase 7: Repair

### Purpose
Repair issues found during validation.

### Repair Agent

If Question 15 has missing option C, the Repair Agent searches the graph, finds it, and adds it.

### Repair Operations

1. **Missing Question Repair**
   - Search graph for missed questions
   - Extract and add to question list

2. **Merged Question Repair**
   - Split merged questions
   - Re-detect boundaries

3. **Split Question Repair**
   - Merge split questions
   - Reconstruct context

4. **Missing Option Repair**
   - Search graph for missing options
   - Add to question

5. **Wrong Answer Repair**
   - Re-detect answer
   - Verify with AI

6. **Metadata Repair**
   - Re-extract metadata
   - Infer from context

### Repair Process

1. **Identify Issue**
   - Understand what's wrong
   - Locate source in graph

2. **Search Graph**
   - Use relationships to find related content
   - Use spatial proximity
   - Use semantic similarity

3. **Apply Repair**
   - Fix the issue
   - Update question object
   - Record repair in history

4. **Validate Repair**
   - Verify repair is correct
   - Check for new issues

### Output
- Repaired Question Objects
- Repair history
- Updated confidence scores

### Key Insight
Repair uses graph relationships to find and fix issues.

---

## Phase 8: Export JSON

### Purpose
Export Question Objects as final JSON.

### Export Process

1. **Schema Validation**
   - Validate against JSON schema
   - Ensure all required fields present
   - Ensure data types correct

2. **Formatting Preservation**
   - Preserve math (LaTeX)
   - Preserve code (indentation)
   - Preserve tables (structure)
   - Preserve images (data)

3. **Statistics Generation**
   - Generate extraction statistics
   - Calculate coverage metrics
   - Calculate accuracy metrics

### Output Schema

```typescript
interface ExportOutput {
  questions: QuestionObject[];
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
}
```

### Key Insight
Export preserves all richness of Question Objects.

---

## Specialist Agents

### Agent 1: Layout Expert

**Responsibilities**
- Pages
- Columns
- Rotation
- Reading order
- Tables
- Images

**Output**
- Document Graph with layout information

**Capabilities**
- Understand document layout
- Detect visual hierarchy
- Identify reading order
- Handle complex layouts

### Agent 2: Semantic Reader

**Responsibilities**
- Read every node
- Decide: Instruction, Heading, Question, Option, Paragraph, Answer

**Output**
- Semantically classified graph

**Capabilities**
- Classify nodes semantically
- Use context for classification
- Handle ambiguous cases
- Distinguish similar types

### Agent 3: Question Builder

**Responsibilities**
- Receives small nodes
- Builds complete Question
- Options, Diagram, Context

**Output**
- Question Objects with components

**Capabilities**
- Assemble question from nodes
- Include related content
- Handle page-spanning questions
- Preserve context

### Agent 4: Question Reasoner

**Responsibilities**
- Determines Question Type
- Difficulty
- Bloom Level
- Skills
- Topics
- Subtopics

**Output**
- Question metadata

**Capabilities**
- Classify question type
- Estimate difficulty
- Classify Bloom's level
- Extract topics and skills

### Agent 5: Validator

**Responsibilities**
- Checks Document vs Question Objects
- Nothing missing
- Nothing duplicated
- Nothing hallucinated

**Output**
- Validation results

**Capabilities**
- Compare extraction with source
- Detect omissions
- Detect hallucinations
- Measure coverage

### Agent 6: Repair

**Responsibilities**
- If Question 15 has missing option C
- Searches the graph
- Finds it
- Adds it

**Output**
- Repaired Question Objects

**Capabilities**
- Search graph for missing content
- Fix missing questions
- Fix merged/split questions
- Fix incorrect answers

### Agent 7: Reviewer

**Responsibilities**
- Pretend to be a professor
- Ask: "If I were giving this exam, would I accept these extracted questions?"
- If not, repair again

**Output**
- Final approval or repair request

**Capabilities**
- Professor-level review
- Detect subtle issues
- Ensure quality
- Request repairs if needed

---

## Working Memory System

### Purpose
Enable context reconstruction across pages.

### Memory Structure

```typescript
interface WorkingMemory {
  activeQuestion?: {
    id: string;
    startedPage: number;
    components: {
      statement?: string;
      options?: OptionObject[];
      diagram?: DiagramReference;
      table?: TableReference;
      answer?: string;
    };
  };
  context: {
    currentSection: string;
    currentTopic: string;
    previousQuestions: string[];
  };
  pageContext: Map<number, PageContext>;
}

interface PageContext {
  questionsStarted: string[];
  questionsEnded: string[];
  diagrams: DiagramReference[];
  tables: TableReference[];
}
```

### Memory Usage

**Example:**
- Question 18 starts on page 5
- Continues on page 6
- Diagram on page 7
- Answer on page 18

Without memory, the system cannot reconstruct.

### Memory Operations

1. **Start Question**
   - Record question start
   - Initialize question components
   - Set active question

2. **Add Component**
   - Add option, diagram, table
   - Update question components
   - Track page context

3. **End Question**
   - Finalize question
   - Clear active question
   - Store in memory

4. **Retrieve Context**
   - Get question components
   - Get related content
   - Reconstruct complete question

### Key Insight
Working memory enables reconstruction of page-spanning questions.

---

## Confidence System

### Purpose
Provide detailed confidence breakdown for debugging.

### Confidence Structure

Instead of:
```typescript
confidence: 0.93
```

Store:
```typescript
confidence: {
  ocr: 0.91,
  layout: 0.98,
  questionBoundary: 0.94,
  options: 0.99,
  answer: 0.87,
  semantic: 0.96,
  overall: 0.94
}
```

### Confidence Calculation

```typescript
overall = weighted_average([
  { ocr: 0.91, weight: 0.2 },
  { layout: 0.98, weight: 0.15 },
  { questionBoundary: 0.94, weight: 0.2 },
  { options: 0.99, weight: 0.15 },
  { answer: 0.87, weight: 0.2 },
  { semantic: 0.96, weight: 0.1 }
])
```

### Confidence Interpretation

- **OCR low**: Document quality issue
- **Layout low**: Complex layout
- **Question Boundary low**: Ambiguous boundaries
- **Options low**: Option detection issue
- **Answer low**: Answer detection issue
- **Semantic low**: Classification uncertainty

### Key Insight
Detailed confidence breakdown explains WHY confidence is low.

---

## Reasoning Tree

### Purpose
Store why decisions were made for debugging.

### Reasoning Structure

```typescript
interface ReasoningNode {
  decision: string;
  confidence: number;
  evidence: Evidence[];
  alternatives: Alternative[];
}

interface Evidence {
  type: 'heading' | 'instruction' | 'numbering' | 'semantic_intent' | 'option_pattern' | 'diagram' | 'context';
  value: any;
  confidence: number;
}

interface Alternative {
  decision: string;
  confidence: number;
  reason: string;
}
```

### Example

**Why did we decide this is Question 5?**

```
Decision: "This is Question 5"
Confidence: 0.94

Evidence:
- Heading: "Section 1: Multiple Choice" (confidence: 0.98)
- Instruction: "Choose the correct answer" (confidence: 0.95)
- Numbering: "5." (confidence: 0.99)
- Semantic Intent: "Which planet..." (confidence: 0.92)
- Option Pattern: "A. B. C. D." (confidence: 0.97)
- Diagram: None (confidence: 1.0)
- Context: Previous question was Question 4 (confidence: 0.99)

Alternatives:
- Could be "Instruction" (confidence: 0.1, reason: "Has options")
- Could be "Heading" (confidence: 0.05, reason: "Too long")
```

### Key Insight
Reasoning tree makes debugging easy by showing decision provenance.

---

## Regex as Hint

### Purpose
Use regex as hints, not as truth.

### Old Approach (Wrong)
```
Regex → Question Found
```

### New Approach (Correct)
```
Regex → Possible Question Start → AI Verifies → Accepted/Rejected
```

### Hint Types

1. **Numbering Hints**
   - "1.", "2.", "3."
   - "Question 1:", "Question 2:"
   - "Q1:", "Q2:"

2. **Option Hints**
   - "A.", "B.", "C.", "D."
   - "a)", "b)", "c)", "d)"
   - "1.", "2.", "3.", "4."

3. **Answer Hints**
   - "Correct Answer:"
   - "Answer:"
   - "Key:"

4. **Structure Hints**
   - "Section X:"
   - "Difficulty:"
   - "Marks:"

### Verification Process

1. **Detect Hint**
   - Use regex to detect pattern
   - Record as hint with confidence

2. **AI Verification**
   - AI verifies if hint is correct
   - Uses context, semantics, relationships
   - Accepts or rejects hint

3. **Decision**
   - If accepted: Use hint
   - If rejected: Ignore hint
   - If uncertain: Flag for review

### Key Insight
Regex provides suggestions, AI makes decisions.

---

## Document Intelligence Platform

### Extensibility

The system is designed as a **Document Intelligence Platform**, not just an assessment extraction pipeline.

This makes it extensible to:
- Notes extraction
- Textbook extraction
- Assignment extraction
- Question paper extraction
- Answer key extraction
- Syllabus extraction
- Curriculum extraction

### Core Components

1. **Vision Understanding** - Generic for all document types
2. **Document Graph Construction** - Generic for all document types
3. **Semantic Classification** - Generic for all document types
4. **Specialized Extractors** - Specific to extraction type

### Specialized Extractors

- **Assessment Extractor** - Extracts questions, options, answers
- **Notes Extractor** - Extracts headings, paragraphs, summaries
- **Textbook Extractor** - Extracts chapters, sections, concepts
- **Assignment Extractor** - Extracts instructions, requirements
- **Answer Key Extractor** - Extracts answers, explanations

### Key Insight
Generic core + specialized extractors = extensible platform.

---

## Golden Corpus

### Purpose
Benchmark for measuring accuracy over time.

### Corpus Size
200-500 real documents covering every format expected.

### Document Types

1. **File Types**
   - PDF (scanned, digital, mixed)
   - DOCX
   - PPTX
   - TXT
   - HTML
   - Markdown

2. **Layout Types**
   - Single column
   - Double column
   - Triple column
   - Newspaper layout
   - Table-based
   - Mixed

3. **Question Types**
   - All 30+ question types
   - Mixed question types
   - Nested questions
   - Question sets

4. **Numbering Systems**
   - All numbering variations
   - No numbering
   - Broken numbering

5. **Edge Cases**
   - Poor OCR
   - Complex layouts
   - Page-spanning questions
   - Handwritten corrections
   - Watermarks
   - Multiple languages

### Annotation

Each document is manually annotated with:
- Ground truth questions
- Ground truth options
- Ground truth answers
- Ground truth metadata
- Ground truth boundaries

### Metrics

Measure against golden corpus:
- Precision
- Recall
- F1 Score
- Question Coverage
- Option Accuracy
- Answer Accuracy
- Ordering Accuracy
- Image Association
- Table Accuracy
- Math Accuracy

### Continuous Improvement

Every change to extraction engine is measured against golden corpus to ensure accuracy improves over time instead of regressing.

### Key Insight
Golden corpus provides objective measure of accuracy over time.

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-6)
- Set up Document Intelligence Engine framework
- Implement Vision Understanding pipeline
- Implement Document Graph Construction
- Set up object schema and relationships

### Phase 2: Semantic Understanding (Weeks 7-12)
- Implement Semantic Classification
- Implement Semantic Reader Agent
- Implement Layout Expert Agent
- Set up working memory system

### Phase 3: Question Extraction (Weeks 13-18)
- Implement Question Graph Construction
- Implement Question Builder Agent
- Implement Question Reasoner Agent
- Build Question Object schema

### Phase 4: Validation & Repair (Weeks 19-24)
- Implement Validator Agent
- Implement Repair Agent
- Implement Reviewer Agent
- Set up confidence system

### Phase 5: Reasoning & Debugging (Weeks 25-30)
- Implement Reasoning Tree
- Implement regex-as-hint system
- Set up debugging tools
- Implement visualization

### Phase 6: Golden Corpus (Weeks 31-36)
- Create golden corpus (200-500 documents)
- Annotate documents
- Set up benchmarking
- Measure baseline accuracy

### Phase 7: Refinement (Weeks 37-48)
- Test on golden corpus
- Refine based on results
- Improve agent accuracy
- Optimize performance

### Phase 8: Production (Weeks 49-52)
- Deploy to production
- Set up monitoring
- Collect feedback
- Continuous improvement

---

## Risk Analysis

### High Risks
1. **Vision AI Accuracy:** Vision models may not be accurate enough
   - Mitigation: Multiple vision models, ensemble, human-in-the-loop

2. **Graph Complexity:** Document graphs may be very complex
   - Mitigation: Simplification, pruning, hierarchical organization

3. **Agent Coordination:** 7 agents may be difficult to coordinate
   - Mitigation: Clear interfaces, shared state, orchestration layer

### Medium Risks
1. **Memory Management:** Working memory may be complex
   - Mitigation: Clear memory model, garbage collection, limits

2. **Performance:** Vision AI + graph processing may be slow
   - Mitigation: Parallel processing, caching, optimization

3. **Cost:** Multiple AI agents may be expensive
   - Mitigation: Efficient design, caching, batching

### Low Risks
1. **Maintenance:** Complex system requires maintenance
   - Mitigation: Good documentation, monitoring, automated testing

2. **Scalability:** System may not scale well
   - Mitigation: Distributed architecture, load balancing

---

## Conclusion

This Document Intelligence Engine represents a fundamental shift from text-based extraction to vision-based, graph-based, semantic understanding. Key advantages:

1. **Vision Understanding** - Understands layout, not just text
2. **Document Graph** - Represents structure, not just strings
3. **Semantic Classification** - Uses context, not just patterns
4. **Question Objects** - Rich entities with full provenance
5. **Working Memory** - Enables context reconstruction
6. **Detailed Confidence** - Explains WHY confidence is low
7. **Reasoning Trees** - Shows decision provenance
8. **Regex as Hint** - AI makes decisions, not patterns
9. **Extensible Platform** - Generic core + specialized extractors
10. **Golden Corpus** - Objective accuracy measurement

This architecture is designed for maximum accuracy, extensibility, and maintainability.
