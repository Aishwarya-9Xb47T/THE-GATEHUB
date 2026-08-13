/**
 * ContentSourceAdapter Interface
 * 
 * Defines the contract for all content source adapters.
 * Every adapter (PDF, DOCX, Google Docs, Google Forms, etc.) must implement this interface.
 * All adapters output a unified AssessmentDocument.
 */

export interface SourceData {
  type: 'file' | 'text' | 'provider-file';
  data: File | string | { providerId: string; fileId: string };
  metadata?: Record<string, any>;
}

export interface AssessmentDocument {
  metadata: {
    provider: 'local' | 'google' | 'onedrive' | 'dropbox' | 'paste-text';
    sourceType: 'pdf' | 'docx' | 'pptx' | 'txt' | 'markdown' | 'csv' | 'excel' | 'image' | 'docs' | 'forms';
    sourceId?: string;
    title: string;
    author?: string;
    createdAt: Date;
    processedAt: Date;
  };
  sections: Section[];
  questions: Question[];
  images: Image[];
  tables: Table[];
  confidence: {
    overall: number;
    byQuestion: number[];
  };
  validation: {
    valid: boolean;
    issues: ValidationIssue[];
  };
}

export interface Section {
  id: string;
  title: string;
  questionIds: string[];
  order: number;
}

export interface Question {
  id: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer' | 'fill-blank' | 'matching' | 'essay';
  text: string;
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  sectionId: string;
  order: number;
  confidence: number;
}

export interface Image {
  id: string;
  url: string;
  caption?: string;
  questionId?: string;
}

export interface Table {
  id: string;
  headers: string[];
  rows: string[][];
  caption?: string;
  questionId?: string;
}

export interface ValidationIssue {
  type: 'missing-answer' | 'ambiguous-question' | 'too-long' | 'format-error';
  questionId?: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * ContentSourceAdapter Interface
 * 
 * All content source adapters must implement this interface.
 */
export interface ContentSourceAdapter {
  readonly adapterId: string;
  readonly adapterName: string;
  readonly supportedSourceTypes: string[];
  
  /**
   * Process content from a source and return an AssessmentDocument
   */
  process(sourceData: SourceData, userId?: string): Promise<AssessmentDocument>;
  
  /**
   * Check if this adapter can handle the given source data
   */
  canHandle(sourceData: SourceData): boolean;
}
