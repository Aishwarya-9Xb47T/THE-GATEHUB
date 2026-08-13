/**
 * Structure Preservation Types
 * 
 * The PRIMARY GOAL is STRUCTURE PRESERVATION.
 * The document is the source of truth. Do NOT reorganize anything.
 * Replicate the document exactly.
 * 
 * Every question acts as a ROOT NODE.
 * Everything after the question belongs ONLY to that question until the next question starts.
 * Never attach components across question boundaries.
 */

// ============================================================================
// Component Types
// ============================================================================

export type ComponentType =
  | 'Question'                    // Root node for a question
  | 'Paragraph'                  // Text paragraph
  | 'Heading'                     // Section/section header
  | 'Image'                       // Image/diagram
  | 'Video'                       // Video content
  | 'Audio'                       // Audio content
  | 'Formula'                     // Mathematical formula
  | 'Code'                        // Code block
  | 'Table'                       // Table
  | 'List'                        // Ordered/unordered list
  | 'Options'                     // Answer options container
  | 'Option'                      // Individual option
  | 'Explanation'                 // Explanation for answer
  | 'Hint'                        // Hint/clue
  | 'AcceptedAnswer'              // Correct answer
  | 'Feedback'                    // Feedback for answer
  | 'Metadata'                    // Question metadata (difficulty, marks, etc)
  | 'Break'                       // Line break/page break
  | 'Reference'                   // Reference/citation
  | 'Footnote'                    // Footnote
  | 'Header'                      // Document header
  | 'Footer'                      // Document footer
  | 'PageNumber'                  // Page number
  | 'SectionBreak'                // Section divider
  | 'Whitespace'                 // Whitespace/padding
  | 'Unknown';                    // Unrecognized content

// ============================================================================
// Position Information
// ============================================================================

export interface ComponentPosition {
  /**
   * Order index in the document (0-based)
   * The frontend should render: sort(orderIndex)
   */
  orderIndex: number;
  
  /**
   * Parent question ID (if this component belongs to a question)
   * null if this is a root-level component (like a section header)
   */
  parentQuestionId: string | null;
  
  /**
   * Source page number (1-based)
   */
  sourcePage: number;
  
  /**
   * Bounding box in the document
   */
  boundingBox: {
    x: number;      // Left edge (in points or pixels)
    y: number;      // Top edge (in points or pixels)
    width: number;  // Width (in points or pixels)
    height: number; // Height (in points or pixels)
  };
  
  /**
   * Character offset in the full document text
   */
  startOffset: number;
  
  /**
   * Character offset in the full document text
   */
  endOffset: number;
  
  /**
   * Reading order position (left-to-right, top-to-bottom)
   */
  readingOrder: number;
}

// ============================================================================
// Base Component Interface
// ============================================================================

export interface DocumentComponent {
  /**
   * Unique identifier for this component
   */
  id: string;
  
  /**
   * Type of component
   */
  type: ComponentType;
  
  /**
   * Position and hierarchy information
   */
  position: ComponentPosition;
  
  /**
   * Text content (if applicable)
   */
  content?: string;
  
  /**
   * Rich text formatting (bold, italic, underline, color, etc.)
   */
  formatting?: Formatting;
  
  /**
   * Component-specific data
   */
  data?: ComponentData;
  
  /**
   * Confidence score for this extraction (0-1)
   */
  confidence: number;
  
  /**
   * Warnings about this component
   */
  warnings?: string[];
}

// ============================================================================
// Formatting Types
// ============================================================================

export interface Formatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  lineSpacing?: number;
  paragraphSpacing?: number;
  indentation?: number;
  hyperlink?: {
    url: string;
    text: string;
  };
}

// ============================================================================
// Component-Specific Data Types
// ============================================================================

export type ComponentData =
  | QuestionData
  | ParagraphData
  | HeadingData
  | ImageData
  | VideoData
  | AudioData
  | FormulaData
  | CodeData
  | TableData
  | ListData
  | OptionsData
  | OptionData
  | ExplanationData
  | HintData
  | AcceptedAnswerData
  | FeedbackData
  | MetadataData
  | BreakData
  | ReferenceData
  | FootnoteData
  | HeaderData
  | FooterData
  | PageNumberData
  | SectionBreakData
  | WhitespaceData;

// ============================================================================
// Question Data
// ============================================================================

export interface QuestionData {
  /**
   * Question number/label if present (e.g., "Question 1", "Q1", "1.")
   */
  label?: string;
  
  /**
   * Question type (multiple_choice, true_false, etc.)
   */
  questionType?: string;
  
  /**
   * Difficulty level
   */
  difficulty?: 'easy' | 'medium' | 'hard';
  
  /**
   * Bloom's taxonomy level
   */
  bloomLevel?: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
  
  /**
   * Marks/points for this question
   */
  marks?: number;
  
  /**
   * Estimated time in seconds
   */
  estimatedSeconds?: number;
  
  /**
   * Topic/subject
   */
  topic?: string;
  
  /**
   * Subtopic
   */
  subtopic?: string;
  
  /**
   * Skills/tags
   */
  skills?: string[];
}

// ============================================================================
// Paragraph Data
// ============================================================================

export interface ParagraphData {
  /**
   * Is this a continuation of previous paragraph?
   */
  isContinuation?: boolean;
  
  /**
   * Is this a quote/blockquote?
   */
  isQuote?: boolean;
  
  /**
   * Paragraph style (if applicable)
   */
  style?: string;
}

// ============================================================================
// Heading Data
// ============================================================================

export interface HeadingData {
  /**
   * Heading level (1-6)
   */
  level: number;
  
  /**
   * Is this a section heading?
   */
  isSection?: boolean;
  
  /**
   * Section number if present (e.g., "1.1", "2.3")
   */
  sectionNumber?: string;
}

// ============================================================================
// Image Data
// ============================================================================

export interface ImageData {
  /**
   * Image data (base64 or URL)
   */
  data?: string;
  
  /**
   * Image MIME type
   */
  mimeType?: string;
  
  /**
   * Image width (pixels)
   */
  width?: number;
  
  /**
   * Image height (pixels)
   */
  height?: number;
  
  /**
   * Alt text for accessibility
   */
  altText?: string;
  
  /**
   * Image caption
   */
  caption?: string;
  
  /**
   * Is this inline (in text) or block?
   */
  displayMode?: 'inline' | 'block';
}

// ============================================================================
// Video Data
// ============================================================================

export interface VideoData {
  /**
   * Video URL
   */
  url?: string;
  
  /**
   * Video MIME type
   */
  mimeType?: string;
  
  /**
   * Video duration in seconds
   */
  duration?: number;
  
  /**
   * Video thumbnail URL
   */
  thumbnailUrl?: string;
  
  /**
   * Video caption
   */
  caption?: string;
}

// ============================================================================
// Audio Data
// ============================================================================

export interface AudioData {
  /**
   * Audio URL
   */
  url?: string;
  
  /**
   * Audio MIME type
   */
  mimeType?: string;
  
  /**
   * Audio duration in seconds
   */
  duration?: number;
  
  /**
   * Audio transcript
   */
  transcript?: string;
}

// ============================================================================
// Formula Data
// ============================================================================

export interface FormulaData {
  /**
   * Formula content in LaTeX format
   */
  latex?: string;
  
  /**
   * Formula content in MathML format
   */
  mathml?: string;
  
  /**
   * Formula content in Unicode format
   */
  unicode?: string;
  
  /**
   * Formula content in Office Math format
   */
  officeMath?: string;
  
  /**
   * Is this inline (in text) or block?
   */
  displayMode?: 'inline' | 'block';
}

// ============================================================================
// Code Data
// ============================================================================

export interface CodeData {
  /**
   * Code content
   */
  code: string;
  
  /**
   * Programming language
   */
  language: string;
  
  /**
   * Code indentation (number of spaces)
   */
  indentation?: number;
  
  /**
   * Line numbers to show
   */
  lineNumbers?: boolean;
  
  /**
   * Starter code (for programming questions)
   */
  starterCode?: string;
  
  /**
   * Expected output
   */
  expectedOutput?: string;
}

// ============================================================================
// Table Data
// ============================================================================

export interface TableData {
  /**
   * Number of rows
   */
  rows: number;
  
  /**
   * Number of columns
   */
  cols: number;
  
  /**
   * Table headers
   */
  headers: string[];
  
  /**
   * Table cells (2D array: rows x cols)
   */
  cells: string[][];
  
  /**
   * Merged cells information
   */
  mergedCells?: Array<{
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
  }>;
  
  /**
   * Table caption
   */
  caption?: string;
  
  /**
   * Table HTML (preserved from source)
   */
  html?: string;
  
  /**
   * Borders visible?
   */
  borders?: boolean;
  
  /**
   * Column alignments
   */
  alignments?: ('left' | 'center' | 'right')[];
}

// ============================================================================
// List Data
// ============================================================================

export interface ListData {
  /**
   * List type
   */
  listType: 'ordered' | 'unordered' | 'custom';
  
  /**
   * List items
   */
  items: ListItem[];
  
  /**
   * Nesting level (0 = top level)
   */
  level: number;
  
  /**
   * Custom marker (if not default)
   */
  marker?: string;
}

export interface ListItem {
  id: string;
  text: string;
  orderIndex: number;
  isContinuation?: boolean;
}

// ============================================================================
// Options Data
// ============================================================================

export interface OptionsData {
  /**
   * Option marker style (A, B, C, D or 1, 2, 3, 4 or bullets)
   */
  markerStyle?: 'letter' | 'number' | 'bullet' | 'checkbox';
  
  /**
   * Is this multiple select (more than one correct)?
   */
  multipleSelect?: boolean;
}

// ============================================================================
// Option Data
// ============================================================================

export interface OptionData {
  /**
   * Option marker (A, B, C, D or 1, 2, 3, 4)
   */
  marker?: string;
  
  /**
   * Is this the correct answer?
   */
  isCorrect: boolean;
  
  /**
   * Option image (if option has an image)
   */
  image?: ImageData;
}

// ============================================================================
// Explanation Data
// ============================================================================

export interface ExplanationData {
  /**
   * Is this inline (after options) or separate?
   */
  displayMode?: 'inline' | 'separate';
}

// ============================================================================
// Hint Data
// ============================================================================

export interface HintData {
  /**
   * Hint type (clue, tip, note, etc.)
   */
  hintType?: 'clue' | 'tip' | 'note' | 'warning';
}

// ============================================================================
// Accepted Answer Data
// ============================================================================

export interface AcceptedAnswerData {
  /**
   * Answer format (text, numeric, code, etc.)
   */
  format?: 'text' | 'numeric' | 'code' | 'formula';
  
  /**
   * Alternative correct answers
   */
  alternatives?: string[];
}

// ============================================================================
// Feedback Data
// ============================================================================

export interface FeedbackData {
  /**
   * Feedback type (correct, incorrect, partial)
   */
  feedbackType?: 'correct' | 'incorrect' | 'partial';
}

// ============================================================================
// Metadata Data
// ============================================================================

export interface MetadataData {
  /**
   * Metadata key-value pairs
   */
  key: string;
  value: string;
}

// ============================================================================
// Break Data
// ============================================================================

export interface BreakData {
  /**
   * Break type
   */
  breakType: 'line' | 'page' | 'section';
  
  /**
   * Number of line breaks
   */
  count?: number;
}

// ============================================================================
// Reference Data
// ============================================================================

export interface ReferenceData {
  /**
   * Reference ID or citation key
   */
  referenceId: string;
  
  /**
   * Reference text
   */
  text: string;
}

// ============================================================================
// Footnote Data
// ============================================================================

export interface FootnoteData {
  /**
   * Footnote number/marker
   */
  marker: string;
  
  /**
   * Footnote text
   */
  text: string;
}

// ============================================================================
// Header Data
// ============================================================================

export interface HeaderData {
  /**
   * Header type (document header, section header, etc.)
   */
  headerType: 'document' | 'section' | 'subsection';
  
  /**
   * Header text
   */
  text: string;
}

// ============================================================================
// Footer Data
// ============================================================================

export interface FooterData {
  /**
   * Footer type (document footer, page footer, etc.)
   */
  footerType: 'document' | 'page';
  
  /**
   * Footer text
   */
  text: string;
}

// ============================================================================
// Page Number Data
// ============================================================================

export interface PageNumberData {
  /**
   * Page number
   */
  pageNumber: number;
  
  /**
   * Total pages
   */
  totalPages?: number;
}

// ============================================================================
// Section Break Data
// ============================================================================

export interface SectionBreakData {
  /**
   * Section type
   */
  sectionType: 'chapter' | 'section' | 'subsection';
  
  /**
   * Section number
   */
  sectionNumber?: string;
}

// ============================================================================
// Whitespace Data
// ============================================================================

export interface WhitespaceData {
  /**
   * Whitespace type
   */
  whitespaceType: 'space' | 'tab' | 'newline' | 'indentation';
  
  /**
   * Amount (for indentation, number of spaces/tabs)
   */
  amount?: number;
}

// ============================================================================
// Structured Question (Root Node with Components)
// ============================================================================

export interface StructuredQuestion {
  /**
   * Question ID
   */
  id: string;
  
  /**
   * All components in this question, in exact document order
   * The frontend renders: components.sort(c => c.position.orderIndex)
   */
  components: DocumentComponent[];
  
  /**
   * Overall question metadata (extracted from Metadata components)
   */
  metadata?: {
    questionType?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    bloomLevel?: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
    marks?: number;
    estimatedSeconds?: number;
    topic?: string;
    subtopic?: string;
    skills?: string[];
  };
  
  /**
   * Overall confidence for this question
   */
  confidence: number;
  
  /**
   * Warnings for this question
   */
  warnings?: string[];
}

// ============================================================================
// Structured Document (Complete Extraction)
// ============================================================================

export interface StructuredDocument {
  /**
   * Document title
   */
  title?: string;
  
  /**
   * Document author
   */
  author?: string;
  
  /**
   * Total pages
   */
  totalPages: number;
  
  /**
   * All questions in the document, in document order
   */
  questions: StructuredQuestion[];
  
  /**
   * Root-level components (headers, footers, section breaks, etc.)
   * These are not attached to any question
   */
  rootComponents: DocumentComponent[];
  
  /**
   * Overall extraction confidence
   */
  confidence: number;
  
  /**
   * Overall extraction warnings
   */
  warnings?: string[];
}

// ============================================================================
// Extraction Rules
// ============================================================================

export interface ExtractionRules {
  /**
   * RULE 1: Document is source of truth
   * Do NOT reorganize anything
   */
  preserveOriginalOrder: true;
  
  /**
   * RULE 2: Every question is a root node
   * Everything after question belongs to that question until next question
   */
  questionAsRootNode: true;
  
  /**
   * RULE 3: Preserve component order exactly
   */
  preserveComponentOrder: true;
  
  /**
   * RULE 4: Treat every component as sequential block
   */
  sequentialBlocks: true;
  
  /**
   * RULE 5: Never move/reorder/merge/split components
   */
  noReordering: true;
  noMerging: true;
  noSplitting: true;
  
  /**
   * RULE 6: Follow document flow (top→bottom→left→right)
   */
  followDocumentFlow: true;
  
  /**
   * RULE 7: Every component has position info
   */
  includePositionInfo: true;
  
  /**
   * RULE 8: Output is component-based, not flat
   */
  componentBasedOutput: true;
  
  /**
   * RULE 9: Frontend does NOT decide ordering
   */
  extractionProvidedOrdering: true;
  
  /**
   * RULE 10: Attach by physical position only
   */
  physicalPositionAttachment: true;
  
  /**
   * RULE 11: Don't confuse component types
   */
  strictComponentTyping: true;
  
  /**
   * RULE 12: Preserve formatting exactly
   */
  preserveFormatting: true;
  
  /**
   * RULE 13: Output ordered tree, not flat JSON
   */
  orderedTreeOutput: true;
}
