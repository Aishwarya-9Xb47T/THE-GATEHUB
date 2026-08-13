/**
 * Content Analysis Engine Types
 * Complete type definitions for the single content analysis pipeline
 */

// ============================================================================
// Source Types
// ============================================================================

export enum SourceType {
  PDF = 'pdf',
  DOCX = 'docx',
  PPTX = 'pptx',
  IMAGE = 'image',
  MARKDOWN = 'markdown',
  TXT = 'txt',
  HTML = 'html',
  CSV = 'csv',
  EXCEL = 'excel',
  MOODLE_XML = 'moodle_xml',
  GOOGLE_DOCS = 'google_docs',
  GOOGLE_FORMS = 'google_forms',
  YOUTUBE = 'youtube',
  WEBSITE = 'website',
}

export enum ContentSource {
  FILE = 'file',
  URL = 'url',
  GOOGLE_DOCS = 'google_docs',
  GOOGLE_FORMS = 'google_forms',
}

// ============================================================================
// Input Types
// ============================================================================

export interface ContentInput {
  source: ContentSource;
  file?: {
    name: string;
    mimeType: string;
    buffer: Buffer;
    size: number;
  };
  url?: string;
  googleAccessToken?: string;
}

// ============================================================================
// Stage 1: Source Detection Output
// ============================================================================

export interface SourceDetectionResult {
  sourceType: SourceType;
  confidence: number;
  metadata?: {
    extension?: string;
    mimeType?: string;
    urlPattern?: string;
  };
}

// ============================================================================
// Stage 2: Raw Content Extraction Output
// ============================================================================

export interface RawContent {
  text: string;
  images: ExtractedImage[];
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    title?: string;
    author?: string;
  };
}

export interface ExtractedImage {
  id: string;
  data: string; // base64
  mimeType: string;
  width?: number;
  height?: number;
  altText?: string;
  position?: {
    pageIndex?: number;
    x?: number;
    y?: number;
  };
}

// ============================================================================
// Stage 3: Text Normalization Output
// ============================================================================

export interface NormalizedText {
  content: string;
  images: ExtractedImage[];
  statistics: {
    originalLength: number;
    normalizedLength: number;
    removedHeaders: number;
    removedFooters: number;
    removedPageNumbers: number;
  };
}

// ============================================================================
// Stage 4: Document Segmentation Output
// ============================================================================

export interface SegmentedContent {
  blocks: ContentBlock[];
  images: ExtractedImage[];
}

export interface ContentBlock {
  id: string;
  type: 'question' | 'instruction' | 'header' | 'content' | 'unknown';
  text: string;
  order: number;
  metadata?: {
    questionNumber?: number;
    hasOptions?: boolean;
    hasAnswerKey?: boolean;
    hasExplanation?: boolean;
    imageIds?: string[];
  };
}

export type ExtendedQuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'long_answer'
  | 'table_question'
  | 'matching'
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
  | 'chart';

export interface EducationalTableData {
  headers: string[];
  rows: string[][];
  html?: string;
  borders?: boolean;
  alignment?: string[];
  mergedCells?: Array<{ row: number; col: number; rowspan: number; colspan: number }>;
}

export interface EducationalMatchingPair {
  left: string;
  right: string;
  pairId?: string;
}

export interface EducationalEquationData {
  latex?: string;
  mathml?: string;
  officeMath?: string;
  unicodeMath?: string;
  isBlock?: boolean;
}

export interface EducationalCodeData {
  code: string;
  language: string;
  indentation?: number;
}

export interface EducationalPassageData {
  id: string;
  title?: string;
  text: string;
  html?: string;
}

export interface EducationalRubricData {
  criteria: Array<{ name: string; maxMarks: number; description?: string }>;
  sampleAnswer?: string;
}

// ============================================================================
// Stage 5: AI Question Extraction Output
// ============================================================================

export interface ExtractedQuestionDraft {
  id: string;
  text: string;
  type: ExtendedQuestionType | string;
  options: ExtractedOption[];
  correctAnswer: string | string[];
  explanation?: string;
  hint?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  bloomLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
  topic?: string;
  subtopic?: string;
  tags: string[];
  confidence: number; // 0-100 overall confidence
  warnings: string[];
  metadata?: {
    originalBlockId?: string;
    imageIds?: string[];
    estimatedSeconds?: number;
    marks?: number;
    table?: EducationalTableData;
    matchingPairs?: EducationalMatchingPair[];
    equations?: EducationalEquationData[];
    code?: EducationalCodeData;
    passage?: EducationalPassageData;
    rubric?: EducationalRubricData;
    diagram?: any;
    chart?: any;
    orderingItems?: string[];
    dragDropData?: any;
    matrixData?: any;
    hotspotData?: any;
    timelineData?: any;
    // Enhanced confidence tracking
    confidenceBreakdown?: {
      question: number;
      options: number;
      answer: number;
      type: number;
      overall: number;
    };
    // Context understanding
    context?: {
      hasTable: boolean;
      hasImage: boolean;
      hasCode: boolean;
      hasFormula: boolean;
      relatedContent: string[];
    };
    [key: string]: any;
  };
}

export interface ExtractedOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

// ============================================================================
// Stage 6: Validation Output
// ============================================================================

export interface ValidatedQuestionDraft extends ExtractedQuestionDraft {
  validationStatus: 'valid' | 'flagged' | 'rejected';
  rejectionReason?: string;
  duplicateOf?: string; // ID of duplicate question
}

export interface ValidationResult {
  questions: ValidatedQuestionDraft[];
  statistics: {
    totalExtracted: number;
    validQuestions: number;
    flaggedQuestions: number;
    rejectedQuestions: number;
    duplicatesRemoved: number;
  };
}

// ============================================================================
// Stage 7: Quiz Schema Conversion Output
// ============================================================================

export interface GateHubQuiz {
  title: string;
  description?: string;
  subject?: string;
  visibility: string;
  metadata: {
    version: number;
    settings: QuizSettings;
    sections: QuizSection[];
    coverGradient?: string;
    bannerUrl?: string;
    thumbnailUrl?: string;
  };
  questions: GateHubQuestion[];
}

export interface QuizSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  randomSubset: number;
  timePerQuestion: number;
  showExplanations: boolean;
  passingScore: number;
  maxAttempts: number;
  negativeMarking: boolean;
}

export interface QuizSection {
  id: string;
  title: string;
  order: number;
}

export interface GateHubQuestion {
  id?: string;
  text: string;
  type: ExtendedQuestionType | string;
  marks: number;
  order: number;
  difficulty: 'easy' | 'medium' | 'hard';
  negativeMarks: number;
  hint?: string;
  bloomLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
  explanation?: string;
  metadata: {
    hints: string[];
    tags: string[];
    estimatedSeconds: number;
    sectionId?: string;
    media?: any;
    importConfidence?: number;
    importWarnings?: string[];
    table?: EducationalTableData;
    matchingPairs?: EducationalMatchingPair[];
    equations?: EducationalEquationData[];
    code?: EducationalCodeData;
    passage?: EducationalPassageData;
    rubric?: EducationalRubricData;
    diagram?: any;
    chart?: any;
    orderingItems?: string[];
    dragDropData?: any;
    matrixData?: any;
    hotspotData?: any;
    timelineData?: any;
    [key: string]: any;
  };
  options: GateHubOption[];
}

export interface GateHubOption {
  id?: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

// ============================================================================
// Stage 8: Quiz Creation Output
// ============================================================================

export interface QuizCreationResult {
  quizId: string;
  title: string;
  questionCount: number;
  totalMarks: number;
}

// ============================================================================
// Pipeline Result
// ============================================================================

export interface ContentAnalysisResult {
  success: boolean;
  quizId?: string;
  error?: AnalysisError;
  statistics?: AnalysisStatistics;
}

export interface AnalysisStatistics {
  sourceType: SourceType;
  processingTime: number; // milliseconds
  stagesCompleted: string[];
  questionsExtracted: number;
  questionsValidated: number;
  questionsFlagged: number;
  averageConfidence: number;
}

// ============================================================================
// Error Handling
// ============================================================================

export enum AnalysisErrorCode {
  SOURCE_DETECTION_FAILED = 'SOURCE_DETECTION_FAILED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  NORMALIZATION_FAILED = 'NORMALIZATION_FAILED',
  SEGMENTATION_FAILED = 'SEGMENTATION_FAILED',
  AI_EXTRACTION_FAILED = 'AI_EXTRACTION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  QUIZ_CREATION_FAILED = 'QUIZ_CREATION_FAILED',
  UNSUPPORTED_SOURCE = 'UNSUPPORTED_SOURCE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_URL = 'INVALID_URL',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
}

export interface AnalysisError {
  code: AnalysisErrorCode;
  stage: string;
  message: string;
  details?: string;
  recoverable: boolean;
}

// ============================================================================
// Progress Reporting
// ============================================================================

export enum AnalysisStage {
  SOURCE_DETECTION = 'SOURCE_DETECTION',
  RAW_CONTENT_EXTRACTION = 'RAW_CONTENT_EXTRACTION',
  TEXT_NORMALIZATION = 'TEXT_NORMALIZATION',
  DOCUMENT_SEGMENTATION = 'DOCUMENT_SEGMENTATION',
  AI_QUESTION_EXTRACTION = 'AI_QUESTION_EXTRACTION',
  VALIDATION = 'VALIDATION',
  QUIZ_SCHEMA_CONVERSION = 'QUIZ_SCHEMA_CONVERSION',
  QUIZ_CREATION = 'QUIZ_CREATION',
}

export interface ProgressUpdate {
  stage: AnalysisStage;
  progress: number; // 0-100
  message?: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

// ============================================================================
// Job Status
// ============================================================================

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface AnalysisJob {
  id: string;
  userId: string;
  status: JobStatus;
  currentStage: AnalysisStage;
  progress: number;
  result?: ContentAnalysisResult;
  error?: AnalysisError;
  input: ContentInput;
  createdAt: Date;
  updatedAt: Date;
}
