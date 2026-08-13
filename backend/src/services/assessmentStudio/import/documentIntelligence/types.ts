/**
 * Document Intelligence Engine - Core Types
 * Defines all core types for the Document Intelligence Engine
 */

// ============================================================================
// Basic Types
// ============================================================================

export type ObjectType =
  | 'Document'
  | 'Section'
  | 'Subsection'
  | 'Heading'
  | 'Paragraph'
  | 'Question'
  | 'Answer'
  | 'Option'
  | 'CorrectAnswer'
  | 'Explanation'
  | 'Hint'
  | 'Instruction'
  | 'Table'
  | 'MergedTable'
  | 'TableRow'
  | 'TableCell'
  | 'Image'
  | 'Caption'
  | 'Diagram'
  | 'Chart'
  | 'SVG'
  | 'Shape'
  | 'Flowchart'
  | 'Equation'
  | 'Formula'
  | 'InlineFormula'
  | 'Matrix'
  | 'CodeBlock'
  | 'InlineCode'
  | 'Hyperlink'
  | 'Bookmark'
  | 'List'
  | 'OrderedList'
  | 'BulletList'
  | 'Checklist'
  | 'ListItem'
  | 'Header'
  | 'Footer'
  | 'PageBreak'
  | 'Textbox'
  | 'Footnote'
  | 'Comment'
  | 'Callout'
  | 'Figure'
  | 'FigureCaption'
  | 'MatchingPair'
  | 'OrderingItem'
  | 'DragDropItem'
  | 'ReadingPassage'
  | 'CaseStudy'
  | 'ProgrammingBlock'
  | 'SQLBlock'
  | 'ReferenceMaterial'
  | 'Rubric'
  | 'BloomMetadata'
  | 'Difficulty'
  | 'Marks'
  | 'Time'
  | 'LearningObjective'
  | 'AnswerKey';

export type RelationshipType =
  | 'contains'
  | 'precedes'
  | 'follows'
  | 'references'
  | 'answers'
  | 'illustrates'
  | 'context_for'
  | 'attached_to'
  | 'child_question_of'
  | 'references_table'
  | 'references_image'
  | 'references_passage'
  | 'references_equation'
  | 'anchored_to'
  | 'caption_of';

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'long_answer'
  | 'table_question'
  | 'matching'
  | 'match_following'
  | 'image_question'
  | 'diagram_question'
  | 'equation_question'
  | 'code_question'
  | 'case_study'
  | 'reading_comprehension'
  | 'ordering'
  | 'drag_drop'
  | 'matrix'
  | 'hotspot'
  | 'timeline'
  | 'chart'
  | 'assertion_reason'
  | 'coding'
  | 'essay'
  | 'mixed'
  | 'nested';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type BloomLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

// ============================================================================
// Spatial & Formatting Types
// ============================================================================

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface Point {
  x: number;
  y: number;
  page: number;
}

export interface DocumentObjectStyle {
  fontFamily?: string;
  fontSize?: number; // pt
  fontWeight?: 'normal' | 'bold' | 'bolder' | 'lighter' | number;
  fontStyle?: 'normal' | 'italic' | 'oblique';
  isMonospace?: boolean;
  color?: string; // hex / rgb
  backgroundColor?: string;
  spacingBefore?: number;
  spacingAfter?: number;
  lineSpacing?: number;
  indentation?: {
    left?: number;
    right?: number;
    firstLine?: number;
    hanging?: number;
  };
  alignment?: 'left' | 'center' | 'right' | 'justify';
  rotation?: number; // degrees
  border?: {
    top?: boolean;
    bottom?: boolean;
    left?: boolean;
    right?: boolean;
    color?: string;
  };
}

// ============================================================================
// Document Object Types
// ============================================================================

export interface DocumentObject {
  id: string;
  type: ObjectType;
  bbox: BBox;
  page: number;
  confidence: number;
  readingOrder: number;
  children: string[]; // child IDs
  parent?: string; // parent ID
  relationships: Relationship[];
  style?: DocumentObjectStyle;
  metadata: Record<string, any>;
  content?: string;
}

export interface Relationship {
  type: RelationshipType;
  targetId: string;
  confidence: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Document Graph Types
// ============================================================================

export interface DocumentGraph {
  id: string;
  root: DocumentObject;
  nodes: Map<string, DocumentObject>;
  edges: Map<string, Relationship[]>;
  metadata: {
    totalPages: number;
    totalNodes: number;
    totalEdges: number;
    createdAt: Date;
  };
}

// ============================================================================
// Vision Understanding Types
// ============================================================================

export interface VisionRegion {
  id: string;
  type: 'text' | 'table' | 'image' | 'header' | 'footer' | 'diagram' | 'equation' | 'code';
  bbox: BBox;
  confidence: number;
  content?: string;
}

export interface LayoutAnalysis {
  columns: number;
  orientation: 'portrait' | 'landscape';
  readingOrder: string[]; // region IDs in reading order
  regions: VisionRegion[];
  confidence: number;
}

export interface VisionUnderstandingOutput {
  regions: VisionRegion[];
  layout: LayoutAnalysis;
  ocrText: string;
  ocrConfidence: number;
  confidence: number;
}

// ============================================================================
// Question Object Types
// ============================================================================

export interface OptionObject {
  id: string;
  marker: string;
  text: string;
  isCorrect: boolean;
  image?: ImageReference;
  confidence: number;
  bbox?: BBox;
}

export interface ImageReference {
  id: string;
  bbox: BBox;
  data?: Buffer;
  caption?: string;
  confidence: number;
}

export interface TableReference {
  id: string;
  bbox: BBox;
  rows: number;
  cols: number;
  headers: string[];
  cells: string[][];
  confidence: number;
}

export interface EquationReference {
  id: string;
  content: string;
  format: 'latex' | 'mathml' | 'unicode';
  type: 'inline' | 'block';
  bbox?: BBox;
  confidence: number;
}

export interface CodeBlockReference {
  id: string;
  content: string;
  language: string;
  bbox?: BBox;
  indentation: number;
  confidence: number;
}

export interface DiagramReference {
  id: string;
  bbox: BBox;
  type: 'diagram' | 'chart' | 'photo' | 'screenshot' | 'other';
  caption?: string;
  confidence: number;
}

export interface QuestionContext {
  paragraphs: string[];
  diagrams: DiagramReference[];
  tables: TableReference[];
}

export interface QuestionMetadata {
  difficulty: Difficulty;
  topic: string;
  subtopic?: string;
  marks?: number;
  bloomLevel: BloomLevel;
  skills: string[];
  sourcePage: number;
  bbox: BBox;
  table?: any;
  tables?: any[];
  code?: any;
  codeBlocks?: any[];
  starterCode?: string;
  equations?: any[];
  formulas?: any[];
  images?: any[];
  diagram?: any;
  mediaUrl?: string;
  media?: any;
  passage?: any;
  explanation?: string;
}

export interface ConfidenceBreakdown {
  ocr: number;
  layout: number;
  questionBoundary: number;
  options: number;
  answer: number;
  semantic: number;
  overall: number;
}

export interface QuestionValidation {
  isValid: boolean;
  issues: string[];
  warnings: string[];
}

export interface RepairOperation {
  timestamp: Date;
  type: string;
  description: string;
  before?: any;
  after?: any;
  agent: string;
}

export interface Evidence {
  type: 'heading' | 'instruction' | 'numbering' | 'semantic_intent' | 'option_pattern' | 'diagram' | 'context';
  value: any;
  confidence: number;
}

export interface Alternative {
  decision: string;
  confidence: number;
  reason: string;
}

export interface ReasoningNode {
  decision: string;
  confidence: number;
  evidence: Evidence[];
  alternatives: Alternative[];
}

export interface QuestionObject {
  // Identification
  id: string;
  sourcePage: number;
  bbox: BBox;

  // Content
  statement: string;
  context: QuestionContext;

  // Components
  options?: OptionObject[];
  diagram?: DiagramReference;
  table?: TableReference;
  tables?: TableReference[];
  equations?: EquationReference[];
  formulas?: any[];
  code?: any;
  codeBlocks?: any[];
  images?: DiagramReference[];
  mediaUrl?: string;
  media?: any;
  passage?: any;
  explanation?: string;
  hint?: string;
  section?: string;

  // Answer
  correctAnswer: string | string[];
  answerLocation: 'inline' | 'answer_key' | 'inferred';

  // Metadata
  type: QuestionType;
  metadata: QuestionMetadata;

  // Confidence
  confidence: ConfidenceBreakdown;

  // Validation
  validation: QuestionValidation;

  // Repair History
  repairHistory: RepairOperation[];

  // Reasoning Tree
  reasoning: ReasoningNode;
}

// ============================================================================
// Working Memory Types
// ============================================================================

export interface PageContext {
  questionsStarted: string[];
  questionsEnded: string[];
  diagrams: DiagramReference[];
  tables: TableReference[];
}

export interface WorkingMemoryContext {
  currentSection: string;
  currentTopic: string;
  previousQuestions: string[];
}

export interface ActiveQuestion {
  id: string;
  startedPage: number;
  components: {
    statement?: string;
    options?: OptionObject[];
    diagram?: DiagramReference;
    table?: TableReference;
    answer?: string;
  };
}

export interface WorkingMemory {
  activeQuestion?: ActiveQuestion;
  context: WorkingMemoryContext;
  pageContext: Map<number, PageContext>;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentInput {
  documentGraph: DocumentGraph;
  workingMemory: WorkingMemory;
  config?: Record<string, any>;
}

export interface AgentOutput {
  success: boolean;
  result?: any;
  confidence: number;
  metadata?: Record<string, any>;
  errors?: string[];
}

export interface AgentConfig {
  name: string;
  version: string;
  capabilities: string[];
  maxRetries: number;
  timeout: number;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface BoundaryIssue {
  questionId: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
}

export interface StructureIssue {
  questionId: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ValidationResult {
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
    issues: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      description: string;
      questionId?: string;
    }>;
  };
}

// ============================================================================
// Export Types
// ============================================================================

export interface ExportMetadata {
  sourceType: string;
  extractionDate: string;
  overallConfidence: number;
  statistics: {
    totalQuestions: number;
    coverage: number;
    averageConfidence: number;
    lowConfidenceCount: number;
  };
}

export interface ExportOutput {
  questions: QuestionObject[];
  metadata: ExportMetadata;
}
