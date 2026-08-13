/**
 * SlideAnalysis - Rich semantic structure for slide understanding
 * 
 * This is the output of the Presentation Understanding Engine.
 * Contains extracted text, layout, semantic structure, and detected interactions.
 */

export interface TextBlock {
  id: string;
  text: string;
  type: 'heading' | 'paragraph' | 'bullet' | 'numbered' | 'caption' | 'footer';
  level?: number; // For headings (h1, h2, h3)
  position: { x: number; y: number; width: number; height: number };
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
}

export interface ImageBlock {
  id: string;
  src: string;
  alt?: string;
  position: { x: number; y: number; width: number; height: number };
  type: 'photo' | 'diagram' | 'chart' | 'icon' | 'screenshot';
}

export interface TableBlock {
  id: string;
  rows: string[][];
  headers: string[];
  position: { x: number; y: number; width: number; height: number };
}

export interface DetectedOption {
  label: // A, B, C, D or 1, 2, 3, 4
  string;
  text: string;
  isCorrect?: boolean;
  position?: { x: number; y: number };
}

export interface InteractionDetection {
  type: 'mcq' | 'true_false' | 'rating' | 'open_answer' | 'reflection' | 'discussion' | 'word_cloud' | 'none';
  confidence: number; // 0-1
  reason: string; // Human-readable explanation
  signals: {
    questionDetected: boolean;
    optionsDetected: boolean;
    optionCount: number;
    layoutMatches: boolean;
    keywordMatches: string[];
    structuralMatches: string[];
  };
  question?: string;
  options?: DetectedOption[];
  correctAnswer?: string;
}

export interface SlideAnalysis {
  slideId: string;
  title: string;
  
  // Raw content
  textBlocks: TextBlock[];
  images: ImageBlock[];
  tables: TableBlock[];
  speakerNotes?: string;
  
  // Semantic structure
  headings: TextBlock[];
  bullets: TextBlock[];
  paragraphs: TextBlock[];
  numberedLists: TextBlock[];
  
  // Layout analysis
  hasMultipleColumns: boolean;
  hasHeader: boolean;
  hasFooter: boolean;
  hasSidebar: boolean;
  layoutType: 'title' | 'content' | 'two-column' | 'comparison' | 'image-heavy' | 'unknown';
  
  // Interaction detection
  interaction: InteractionDetection;
  
  // Metadata
  wordCount: number;
  hasImages: boolean;
  hasTables: boolean;
  hasDiagrams: boolean;
  analyzedAt: string;
}
