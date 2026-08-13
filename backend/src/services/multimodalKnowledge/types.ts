/**
 * Multimodal Knowledge Extraction Engine - Unified Type Definitions
 * Single source of truth for knowledge objects, multimodal blocks, educational graphs, and extraction outputs across GateHub.
 */

export type DocumentSourceType =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'ppt'
  | 'pptx'
  | 'txt'
  | 'rtf'
  | 'odt'
  | 'odp'
  | 'ods'
  | 'csv'
  | 'excel'
  | 'markdown'
  | 'html'
  | 'epub'
  | 'google_docs'
  | 'google_slides'
  | 'google_drive'
  | 'image'
  | 'screenshot'
  | 'whiteboard'
  | 'handwritten'
  | 'zip'
  | 'url';

export type BlockType =
  | 'paragraph'
  | 'title'
  | 'subtitle'
  | 'heading'
  | 'list'
  | 'table'
  | 'image'
  | 'code'
  | 'equation'
  | 'diagram'
  | 'chart'
  | 'quote'
  | 'definition'
  | 'example'
  | 'note'
  | 'speaker_note'
  | 'hidden_note'
  | 'header'
  | 'footer'
  | 'reference'
  | 'question';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

export interface TableCell {
  rowIndex: number;
  colIndex: number;
  rowSpan?: number;
  colSpan?: number;
  content: string;
  isHeader?: boolean;
  formatting?: {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    align?: string;
  };
}

export interface StructuredTable {
  id: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: TableCell[][];
  html?: string;
  markdown?: string;
  hasMergedCells?: boolean;
  caption?: string;
  nestedTables?: StructuredTable[];
}

export interface ExtractedImage {
  id: string;
  url?: string;
  base64?: string;
  position?: BoundingBox;
  caption?: string;
  altText?: string;
  detectedObjects?: string[];
  educationalRelevance?: 'high' | 'medium' | 'low';
  ocrText?: string;
  diagramLabels?: string[];
  embeddedText?: string;
}

export interface CodeBlock {
  id: string;
  language: string;
  code: string;
  indentationPreserved: boolean;
  lineNumbers?: number[];
  comments?: string[];
  formatting?: string;
}

export interface MathFormula {
  id: string;
  latex: string;
  mathml?: string;
  rawText?: string;
  type: 'equation' | 'inline' | 'matrix' | 'fraction' | 'integral' | 'derivative' | 'limit' | 'vector' | 'chemical' | 'physics';
  symbols?: string[];
}

export interface DiagramNode {
  id: string;
  label: string;
  type?: string;
  position?: { x: number; y: number };
}

export interface DiagramConnection {
  fromId: string;
  toId: string;
  label?: string;
  relationshipType?: string;
}

export interface ExtractedDiagram {
  id: string;
  type: 'flowchart' | 'mindmap' | 'architecture' | 'er' | 'network' | 'decision_tree' | 'block' | 'circuit' | 'state_machine' | 'sequence' | 'uml' | 'generic';
  title?: string;
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  rawText?: string;
}

export interface DataSeries {
  name: string;
  values: (number | string)[];
  color?: string;
}

export interface ExtractedChart {
  id: string;
  type: 'bar' | 'pie' | 'scatter' | 'histogram' | 'timeline' | 'line' | 'area' | 'radar' | 'heatmap';
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  categories?: string[];
  series: DataSeries[];
  rawValuesSummary?: string;
}

export type QuestionType =
  | 'mcq'
  | 'poll'
  | 'true_false'
  | 'short_answer'
  | 'long_answer'
  | 'reflection'
  | 'discussion'
  | 'coding'
  | 'math'
  | 'case_study'
  | 'fill_blank'
  | 'matching'
  | 'ordering'
  | 'image_question'
  | 'diagram_question'
  | 'table_question';

export interface QuestionOption {
  id: string;
  label: string; // e.g. "A", "B", "1", "i", or custom text
  text: string;
  isCorrect?: boolean;
  explanation?: string;
  tableContent?: StructuredTable;
  imageContent?: ExtractedImage;
}

export interface ExtractedQuestion {
  id: string;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  correctAnswer?: string | string[];
  explanation?: string;
  hints?: string[];
  points?: number;
  difficulty?: 'beginner' | 'easy' | 'medium' | 'hard' | 'advanced';
  bloomsLevel?: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  topic?: string;
  subtopic?: string;
  concept?: string;
  codeSnippet?: CodeBlock;
  mathFormula?: MathFormula;
  table?: StructuredTable;
  image?: ExtractedImage;
  diagram?: ExtractedDiagram;
  chart?: ExtractedChart;
  sourceSignal?: 'speaker_notes' | 'bold_text' | 'underline' | 'green_text' | 'metadata' | 'comment' | 'explicit_key';
  sourcePageOrSlide?: number;
}

export interface MultimodalBlock {
  id: string;
  type: BlockType;
  text?: string;
  position?: BoundingBox;
  table?: StructuredTable;
  image?: ExtractedImage;
  code?: CodeBlock;
  math?: MathFormula;
  diagram?: ExtractedDiagram;
  chart?: ExtractedChart;
  question?: ExtractedQuestion;
  speakerNotes?: string;
  hiddenNotes?: string;
  children?: MultimodalBlock[];
}

export interface SectionNode {
  id: string;
  title: string;
  level: number;
  blocks: MultimodalBlock[];
  subsections?: SectionNode[];
}

export interface PageOrSlide {
  index: number;
  title?: string;
  type: 'page' | 'slide';
  blocks: MultimodalBlock[];
  speakerNotes?: string;
  hiddenNotes?: string;
}

export interface KnowledgeGraphNode {
  id: string;
  type: 'topic' | 'subtopic' | 'concept' | 'definition' | 'example' | 'question' | 'table' | 'image' | 'code' | 'equation';
  label: string;
  content?: any;
  metadata?: Record<string, any>;
}

export interface KnowledgeGraphEdge {
  sourceId: string;
  targetId: string;
  relation: 'contains' | 'defines' | 'illustrates' | 'tests' | 'answers' | 'references' | 'prerequisite_of';
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface AiEnrichmentData {
  summary: string;
  keywords: string[];
  flashcards: Array<{ front: string; back: string; topic?: string }>;
  quizSuggestions: Array<{ prompt: string; type: QuestionType }>;
  learningObjectives: string[];
  prerequisites: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  studyNotes: string;
  revisionNotes: string;
}

export interface KnowledgeExtractionResult {
  success: boolean;
  sourceType: DocumentSourceType;
  fileName?: string;
  document: {
    title: string;
    pageCount: number;
    pages: PageOrSlide[];
    sections: SectionNode[];
  };
  blocks: MultimodalBlock[];
  tables: StructuredTable[];
  images: ExtractedImage[];
  codeBlocks: CodeBlock[];
  equations: MathFormula[];
  diagrams: ExtractedDiagram[];
  charts: ExtractedChart[];
  questions: ExtractedQuestion[];
  knowledgeGraph: KnowledgeGraph;
  aiEnrichment: AiEnrichmentData;
  ocrApplied: boolean;
  processingTimeMs: number;
  error?: string;
}
