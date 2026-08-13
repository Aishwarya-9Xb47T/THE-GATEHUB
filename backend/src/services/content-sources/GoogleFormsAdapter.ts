/**
 * GoogleFormsAdapter
 * 
 * Content source adapter for Google Forms.
 * Downloads Google Forms content and converts it to AssessmentDocument.
 */

import { ContentSourceAdapter, SourceData, AssessmentDocument, Question, Section, Image, Table, ValidationIssue } from './ContentSourceAdapter.js';
import { providerRegistry } from '../providers/ProviderRegistry.js';
import { v4 as uuidv4 } from 'uuid';

export class GoogleFormsAdapter implements ContentSourceAdapter {
  readonly adapterId = 'google-forms';
  readonly adapterName = 'Google Forms Adapter';
  readonly supportedSourceTypes = ['provider-file'];
  
  /**
   * Check if this adapter can handle the source data
   */
  canHandle(sourceData: SourceData): boolean {
    if (sourceData.type !== 'provider-file') return false;
    const data = sourceData.data as { providerId: string; fileId: string };
    return data.providerId === 'google';
  }
  
  /**
   * Process Google Forms content
   */
  async process(sourceData: SourceData): Promise<AssessmentDocument> {
    const data = sourceData.data as { providerId: string; fileId: string };
    
    // Get the Google provider plugin
    const provider = providerRegistry.get('google');
    if (!provider) {
      throw new Error('Google provider not registered');
    }
    
    // Download file content
    const fileContent = await provider.downloadFile('user-id-placeholder', data.fileId);
    
    // Parse the content into questions
    const questions = this.parseContentToQuestions(fileContent.content);
    
    // Build the assessment document
    const section: Section = {
      id: uuidv4(),
      title: fileContent.metadata.name || 'Untitled Form',
      questionIds: questions.map(q => q.id),
      order: 0,
    };
    
    const confidence = this.calculateConfidence(questions);
    
    return {
      metadata: {
        provider: 'google',
        sourceType: 'forms',
        sourceId: data.fileId,
        title: fileContent.metadata.name || 'Untitled Form',
        author: fileContent.metadata.owners?.[0]?.displayName,
        createdAt: new Date(fileContent.metadata.modifiedTime),
        processedAt: new Date(),
      },
      sections: [section],
      questions,
      images: [],
      tables: [],
      confidence: {
        overall: confidence.overall,
        byQuestion: confidence.byQuestion,
      },
      validation: this.validateDocument(questions),
    };
  }
  
  /**
   * Parse Google Forms text content into questions
   * Google Forms export format is structured, so we can parse it more reliably
   */
  private parseContentToQuestions(content: string): Question[] {
    const questions: Question[] = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    let currentQuestion: Partial<Question> | null = null;
    let questionOrder = 0;
    let inOptions = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect form title
      if (trimmed.startsWith('Form:')) {
        continue; // Skip title, it's used for section title
      }
      
      // Detect questions (lines starting with "Q:")
      if (trimmed.startsWith('Q:')) {
        if (currentQuestion) {
          questions.push(this.finalizeQuestion(currentQuestion, questionOrder));
          questionOrder++;
        }
        
        const questionText = trimmed.replace(/^Q:\s*/, '').trim();
        currentQuestion = {
          id: uuidv4(),
          type: this.detectQuestionType(questionText),
          text: questionText,
          options: [],
          correctAnswer: '',
          sectionId: 'default',
          order: questionOrder,
          confidence: 95, // Higher confidence for Google Forms (explicit structure)
        };
        inOptions = true;
      }
      // Detect options (lines starting with -)
      else if (trimmed.startsWith('-') && inOptions) {
        if (currentQuestion) {
          const optionText = trimmed.replace(/^-\s*/, '').trim();
          currentQuestion.options = currentQuestion.options || [];
          currentQuestion.options.push(optionText);
        }
      }
      // Empty line ends options for current question
      else if (trimmed === '') {
        inOptions = false;
      }
    }
    
    // Don't forget the last question
    if (currentQuestion) {
      questions.push(this.finalizeQuestion(currentQuestion, questionOrder));
    }
    
    // If no questions were found, create a placeholder
    if (questions.length === 0) {
      questions.push({
        id: uuidv4(),
        type: 'essay',
        text: 'No questions could be extracted from this form. Please review manually.',
        correctAnswer: '',
        sectionId: 'default',
        order: 0,
        confidence: 0,
      });
    }
    
    return questions;
  }
  
  /**
   * Detect question type based on text
   */
  private detectQuestionType(text: string): Question['type'] {
    const lower = text.toLowerCase();
    
    if (lower.includes('true') || lower.includes('false')) {
      return 'true-false';
    }
    
    if (lower.includes('short answer') || lower.includes('fill in')) {
      return 'short-answer';
    }
    
    if (lower.includes('essay') || lower.includes('explain')) {
      return 'essay';
    }
    
    return 'multiple-choice';
  }
  
  /**
   * Finalize a question with defaults
   */
  private finalizeQuestion(partial: Partial<Question>, order: number): Question {
    return {
      id: partial.id || uuidv4(),
      type: partial.type || 'multiple-choice',
      text: partial.text || 'Untitled Question',
      options: partial.options || [],
      correctAnswer: partial.correctAnswer || '',
      explanation: partial.explanation,
      difficulty: partial.difficulty,
      tags: partial.tags,
      sectionId: partial.sectionId || 'default',
      order,
      confidence: partial.confidence || 95,
    };
  }
  
  /**
   * Calculate confidence scores for questions
   */
  private calculateConfidence(questions: Question[]): { overall: number; byQuestion: number[] } {
    const byQuestion = questions.map(q => {
      // Google Forms have explicit structure, so higher confidence
      if (q.options && q.options.length > 0) {
        return 95;
      }
      if (q.text && q.text.length > 10) {
        return 90;
      }
      return 80;
    });
    
    const overall = byQuestion.length > 0
      ? byQuestion.reduce((sum, score) => sum + score, 0) / byQuestion.length
      : 0;
    
    return { overall, byQuestion };
  }
  
  /**
   * Validate the document
   */
  private validateDocument(questions: Question[]): { valid: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    
    for (const question of questions) {
      if (!question.text || question.text.trim() === '') {
        issues.push({
          type: 'missing-answer',
          questionId: question.id,
          message: 'Question text is missing',
          severity: 'error',
        });
      }
      
      if (question.type === 'multiple-choice' && (!question.options || question.options.length === 0)) {
        issues.push({
          type: 'format-error',
          questionId: question.id,
          message: 'Multiple choice question has no options',
          severity: 'warning',
        });
      }
    }
    
    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  }
}
