/**
 * AntiGravity V2 Multimodal Document Intelligence Engine - Comprehensive Type Definitions
 */

export type V2DocumentFormat =
  | 'pdf'
  | 'scanned_pdf'
  | 'native_pdf'
  | 'doc'
  | 'docx'
  | 'ppt'
  | 'pptx'
  | 'xls'
  | 'xlsx'
  | 'csv'
  | 'txt'
  | 'rtf'
  | 'html'
  | 'markdown'
  | 'epub'
  | 'odt'
  | 'ods'
  | 'odp'
  | 'zip'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'tiff'
  | 'bmp'
  | 'webp'
  | 'svg'
  | 'heic'
  | 'screenshot'
  | 'camera_image'
  | 'whiteboard'
  | 'handwritten_notes'
  | 'google_docs'
  | 'google_slides'
  | 'google_drive';

export interface V2RunFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
  hyperlinkUrl?: string;
  commentId?: string;
}

export interface V2TextRunNode {
  id: string;
  type: 'run';
  text: string;
  formatting: V2RunFormatting;
}

export interface V2ParagraphNode {
  id: string;
  type: 'paragraph' | 'heading';
  headingLevel?: number;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  runs: V2TextRunNode[];
  plainText: string;
  hyperlinkUrl?: string;
  commentId?: string;
}

export interface V2TableCellNode {
  rowIndex: number;
  colIndex: number;
  rowSpan?: number;
  colSpan?: number;
  paragraphs: V2ParagraphNode[];
  shadingColor?: string;
  isHeader?: boolean;
}

export interface V2TableNode {
  id: string;
  type: 'table';
  rowCount: number;
  columnCount: number;
  headers: string[];
  grid: V2TableCellNode[][];
  caption?: string;
  html?: string;
}

export interface V2ImageNode {
  id: string;
  type: 'image';
  relationshipId?: string;
  mimeType?: string;
  url?: string;
  base64?: string;
  altText?: string;
  caption?: string;
  ocrText?: string;
}

export interface V2MathNode {
  id: string;
  type: 'math';
  latex: string;
  mathml?: string;
  rawXml?: string;
  isDisplayMode: boolean;
}

export interface V2CodeNode {
  id: string;
  type: 'code';
  language: string;
  code: string;
  indentationPreserved: boolean;
  lineNumbers?: number[];
  comments?: string[];
}

export interface V2DiagramNode {
  id: string;
  type: 'diagram';
  diagramType: 'flowchart' | 'mindmap' | 'uml' | 'er' | 'network' | 'circuit' | 'state_machine' | 'sequence' | 'smartart';
  title?: string;
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ fromId: string; toId: string; label?: string }>;
  rawCode?: string;
}

export interface V2ChartNode {
  id: string;
  type: 'chart';
  chartType: 'bar' | 'pie' | 'scatter' | 'histogram' | 'timeline' | 'line' | 'area';
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  categories?: string[];
  series: Array<{ name: string; values: (number | string)[] }>;
}

export interface V2CommentNode {
  id: string;
  type: 'comment';
  author: string;
  date?: string;
  text: string;
}

export interface V2SpeakerNoteNode {
  id: string;
  type: 'speaker_note';
  slideIndex: number;
  text: string;
  runs: V2TextRunNode[];
}

export type V2ASTNode =
  | V2ParagraphNode
  | V2TableNode
  | V2ImageNode
  | V2MathNode
  | V2CodeNode
  | V2DiagramNode
  | V2ChartNode
  | V2CommentNode
  | V2SpeakerNoteNode;

export interface V2SectionNode {
  id: string;
  title: string;
  level: number;
  children: V2ASTNode[];
}

export interface V2PageNode {
  index: number;
  title?: string;
  type: 'page' | 'slide';
  children: V2ASTNode[];
  speakerNotes?: V2SpeakerNoteNode;
}

export interface V2QuestionOption {
  id: string;
  label: string; // "A", "B", "1", "i", checkbox
  text: string;
  isCorrect?: boolean;
  explanation?: string;
  tableContent?: V2TableNode;
  imageContent?: V2ImageNode;
}

export type V2OrderedChildBlock =
  | { id: string; type: 'text'; order: number; content: string; runs?: V2TextRunNode[] }
  | { id: string; type: 'image'; order: number; imageUrl: string; caption?: string; alt?: string }
  | { id: string; type: 'table'; order: number; headers: string[]; rows: string[][]; html?: string }
  | { id: string; type: 'code'; order: number; language: string; code: string; lineNumbers?: number[] }
  | { id: string; type: 'formula'; order: number; latex: string; mathml?: string }
  | { id: string; type: 'diagram'; order: number; diagramType: string; nodes: any[]; edges: any[] }
  | { id: string; type: 'hyperlink'; order: number; url: string; displayText?: string }
  | { id: string; type: 'list'; order: number; ordered: boolean; items: string[] }
  | { id: string; type: 'options'; order: number; options: V2QuestionOption[] }
  | { id: string; type: 'explanation'; order: number; content: string };

export interface V2QuestionBlock {
  id: string;
  type: string;
  stem: string;
  promptRuns: V2TextRunNode[];
  children: V2OrderedChildBlock[];
  options: V2QuestionOption[];
  correctAnswer?: string | string[];
  /** Original question number from document (Q7, Question 12, etc.) */
  sourceQuestionNumber?: number;
  /** Section/chapter heading active when question was detected */
  currentSection?: string;
  /** Line from detached answer key when reconciled */
  answerKeySource?: string;
  explanation?: string;
  hints?: string[];
  points?: number;
  difficulty?: string;
  bloomsLevel?: string;
  associatedParagraphs: V2ParagraphNode[];
  associatedTables: V2TableNode[];
  associatedImages: V2ImageNode[];
  associatedMath: V2MathNode[];
  associatedCode: V2CodeNode[];
  associatedDiagrams: V2DiagramNode[];
  associatedCharts: V2ChartNode[];
  associatedComments: V2CommentNode[];
  associatedSpeakerNote?: V2SpeakerNoteNode;
  hyperlinks: string[];
}

export interface V2KnowledgeGraphNode {
  id: string;
  type: 'topic' | 'subtopic' | 'concept' | 'question' | 'answer' | 'table' | 'image' | 'code' | 'math' | 'diagram';
  label: string;
  content?: any;
}

export interface V2KnowledgeGraphEdge {
  sourceId: string;
  targetId: string;
  relation: string;
}

export interface V2KnowledgeGraph {
  nodes: V2KnowledgeGraphNode[];
  edges: V2KnowledgeGraphEdge[];
}

export interface V2ValidationResult {
  passed: boolean;
  accuracyScore: number;
  isStructurallyEquivalent: boolean;
  placeholderFound: boolean;
  placeholderMatches: string[];
  discrepancies: string[];
  metrics: {
    expected: Record<string, number>;
    actual: Record<string, number>;
  };
}

export interface AntiGravityV2Result {
  success: boolean;
  format: V2DocumentFormat;
  fileName?: string;
  document: {
    title: string;
    pageCount: number;
    pages: V2PageNode[];
    sections: V2SectionNode[];
  };
  blocks: V2ASTNode[];
  tables: V2TableNode[];
  images: V2ImageNode[];
  codeBlocks: V2CodeNode[];
  equations: V2MathNode[];
  diagrams: V2DiagramNode[];
  charts: V2ChartNode[];
  questions: V2QuestionBlock[];
  knowledgeGraph: V2KnowledgeGraph;
  validation: V2ValidationResult;
  processingTimeMs: number;
  error?: string;
}
