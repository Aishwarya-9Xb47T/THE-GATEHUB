/**
 * GoogleDocsAdapter
 * 
 * Content source adapter for Google Docs.
 * Downloads Google Docs content and converts it to AssessmentDocument.
 */

import { ContentSourceAdapter, SourceData, AssessmentDocument, Question, Section, Image, Table, ValidationIssue } from './ContentSourceAdapter.js';
import { providerRegistry } from '../providers/ProviderRegistry.js';
import { v4 as uuidv4 } from 'uuid';

export class GoogleDocsAdapter implements ContentSourceAdapter {
  readonly adapterId = 'google-docs';
  readonly adapterName = 'Google Docs Adapter';
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
   * Process Google Docs content
   */
  async process(sourceData: SourceData, userId?: string): Promise<AssessmentDocument> {
    const data = sourceData.data as { providerId: string; fileId: string };
    
    // Get the Google provider plugin
    const provider = providerRegistry.get('google');
    if (!provider) {
      throw new Error('Google provider not registered');
    }
    
    // Download file content using authenticated userId
    const fileContent = await provider.downloadFile(userId || 'default-user', data.fileId);
    
    // Parse the content into questions
    const questions = this.parseContentToQuestions(fileContent.content);
    
    // Build the assessment document
    const section: Section = {
      id: uuidv4(),
      title: fileContent.metadata.name || 'Untitled',
      questionIds: questions.map(q => q.id),
      order: 0,
    };
    
    const confidence = this.calculateConfidence(questions);
    
    return {
      metadata: {
        provider: 'google',
        sourceType: 'docs',
        sourceId: data.fileId,
        title: fileContent.metadata.name || 'Untitled',
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
   * Parse text content into questions
   * This is a simplified implementation - in production, use NLP/AI for better extraction
   */
  private parseContentToQuestions(content: string): Question[] {
    const questions: Question[] = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    let currentQuestion: Partial<Question> | null = null;
    let questionOrder = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect questions (lines ending with ?)
      if (trimmed.endsWith('?')) {
        if (currentQuestion) {
          questions.push(this.finalizeQuestion(currentQuestion, questionOrder));
          questionOrder++;
        }
        
        currentQuestion = {
          id: uuidv4(),
          type: 'multiple-choice',
          text: trimmed,
          options: [],
          correctAnswer: '',
          sectionId: 'default',
          order: questionOrder,
          confidence: 75, // Default confidence for parsed questions
        };
      }
      // Detect options (lines starting with - or •)
      else if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
        if (currentQuestion) {
          const optionText = trimmed.replace(/^[-•*]\s*/, '').trim();
          currentQuestion.options = currentQuestion.options || [];
          currentQuestion.options.push(optionText);
        }
      }
      // Detect answers (lines starting with "Answer:" or similar)
      else if (trimmed.toLowerCase().startsWith('answer:') || trimmed.toLowerCase().startsWith('ans:')) {
        if (currentQuestion) {
          currentQuestion.correctAnswer = trimmed.replace(/^(answer|ans):\s*/i, '').trim();
        }
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
        text: 'No questions could be automatically extracted from this document. Please review manually.',
        correctAnswer: '',
        sectionId: 'default',
        order: 0,
        confidence: 0,
      });
    }
    
    return questions;
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
      confidence: partial.confidence || 75,
    };
  }
  
  /**
   * Calculate confidence scores for questions
   */
  private calculateConfidence(questions: Question[]): { overall: number; byQuestion: number[] } {
    const byQuestion = questions.map(q => {
      // Higher confidence if question has options and answer
      if (q.options && q.options.length > 0 && q.correctAnswer) {
        return 85;
      }
      if (q.options && q.options.length > 0) {
        return 70;
      }
      if (q.correctAnswer) {
        return 60;
      }
      return 50;
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
      
      if (!question.correctAnswer) {
        issues.push({
          type: 'missing-answer',
          questionId: question.id,
          message: 'Question has no correct answer',
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
