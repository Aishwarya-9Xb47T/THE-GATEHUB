/**
 * Assessment Types (Frontend)
 * 
 * Types for the unified AssessmentDocument model.
 * These types match the backend AssessmentDocument structure.
 */

export interface AssessmentDocument {
  metadata: AssessmentMetadata;
  sections: Section[];
  questions: Question[];
  images: Image[];
  tables: Table[];
  confidence: Confidence;
  validation: Validation;
}

export interface AssessmentMetadata {
  provider: 'local' | 'google' | 'onedrive' | 'dropbox' | 'paste-text';
  sourceType: 'pdf' | 'docx' | 'pptx' | 'txt' | 'markdown' | 'csv' | 'excel' | 'image' | 'docs' | 'forms';
  sourceId?: string;
  title: string;
  author?: string;
  createdAt: Date;
  processedAt: Date;
}

export interface Section {
  id: string;
  title: string;
  questionIds: string[];
  order: number;
}

export interface Question {
  id: string;
  type: 'multiple-choice' | 'multiple-select' | 'true-false' | 'short-answer' | 'fill-blank' | 'matching' | 'essay';
  text: string;
  /** Option texts (legacy) or structured options used by review/editor UIs */
  options?: string[] | Array<{ id: string; text: string; isCorrect?: boolean; order?: number }>;
  correctAnswer: string | string[];
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  sectionId: string;
  order: number;
  confidence: number;
  metadata?: Record<string, any>;
  children?: any;
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

export interface Confidence {
  overall: number;
  byQuestion: number[];
}

export interface Validation {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  type: 'missing-answer' | 'ambiguous-question' | 'too-long' | 'format-error';
  questionId?: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}
