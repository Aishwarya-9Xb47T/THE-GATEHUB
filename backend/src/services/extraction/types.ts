/**
 * Unified Extraction Engine Types
 * Represents the complete AST, formatted runs, tables, code blocks, math formulas, media, and question models.
 */

export interface TextRunFormatting {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  highlight?: string;
  color?: string;
  superscript?: boolean;
  subscript?: boolean;
}

export interface TextRunNode {
  type: 'run';
  text: string;
  formatting: TextRunFormatting;
}

export interface ParagraphNode {
  type: 'paragraph';
  id: string;
  headingLevel?: number; // 1-6 for H1-H6
  alignment?: 'left' | 'center' | 'right' | 'justify';
  bullet?: boolean;
  numbering?: {
    level: number;
    numId?: string;
    text?: string;
  };
  runs: TextRunNode[];
  plainText: string;
}

export interface TableCellNode {
  id: string;
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  backgroundColor?: string;
  borderColor?: string;
  alignment?: 'left' | 'center' | 'right';
  children: (ParagraphNode | CodeBlockNode | MathNode)[];
  plainText: string;
}

export interface TableRowNode {
  id: string;
  rowIndex: number;
  isHeader?: boolean;
  cells: TableCellNode[];
}

export interface TableNode {
  type: 'table';
  id: string;
  rowCount: number;
  colCount: number;
  rows: TableRowNode[];
  plainText: string;
}

export interface CodeBlockNode {
  type: 'code';
  id: string;
  language: string; // python, java, cpp, javascript, sql, html, css, etc.
  content: string; // Exact raw code preserving indentation, tabs, blank lines, spaces
  fontFamily?: string;
  backgroundColor?: string;
}

export interface MathNode {
  type: 'math';
  id: string;
  displayType: 'inline' | 'block';
  latex: string;
  mathML?: string;
  ommlXml?: string;
  equationNumber?: string;
}

export interface ExtractedMedia {
  id: string;
  relationshipId?: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  buffer: Buffer;
  byteSize: number;
  width?: number;
  height?: number;
  caption?: string;
  anchorType?: 'inline' | 'floating' | 'anchored' | 'background';
}

export interface ExtractedOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
  explanation?: string;
  media?: ExtractedMedia;
}

export interface ExtractedQuestion {
  id: string;
  rawText: string;
  stem: string;
  type: 
    | 'multiple_choice'
    | 'multiple_select'
    | 'true_false'
    | 'match_following'
    | 'fill_blank'
    | 'coding_question'
    | 'essay'
    | 'short_answer'
    | 'numerical'
    | 'assertion_reason'
    | 'case_study'
    | 'image_based'
    | 'table_based'
    | 'diagram_based'
    | 'math_question';
  marks: number;
  negativeMarks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  bloomLevel?: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
  options: ExtractedOption[];
  codeBlock?: CodeBlockNode;
  table?: TableNode;
  mathNode?: MathNode;
  media?: ExtractedMedia[];
  hyperlinks?: Array<{ text: string; url: string }>;
  lists?: Array<{ style: 'ordered' | 'unordered'; items: string[] }>;
  metadata?: Record<string, any>;
  explanation?: string;
  hint?: string;
  confidence: number;
}

export interface UnifiedDocumentAST {
  title: string;
  metadata: {
    author?: string;
    createdAt?: string;
    pageCount?: number;
    wordCount: number;
    hasCode: boolean;
    hasTables: boolean;
    hasMath: boolean;
    hasImages: boolean;
  };
  nodes: (ParagraphNode | TableNode | CodeBlockNode | MathNode)[];
  footnotes: { id: string; text: string }[];
  endnotes: { id: string; text: string }[];
  comments: { id: string; author: string; text: string }[];
  headers: string[];
  footers: string[];
}

export interface UnifiedExtractionResult {
  sourceType: string;
  rawContent: {
    text: string;
    html: string;
  };
  ast: UnifiedDocumentAST;
  questions: ExtractedQuestion[];
  media: ExtractedMedia[];
  confidenceScore: number;
}
