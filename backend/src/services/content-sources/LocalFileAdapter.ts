/**
 * LocalFileAdapter
 * 
 * Adapter for processing local file uploads (PDF, DOCX, PPTX, TXT, CSV, Images).
 * This adapter uses the existing ContentAnalysisEngine pipeline from contentBuilderController.
 */

import { ContentSourceAdapter, SourceData, AssessmentDocument } from './ContentSourceAdapter.js';
import { RawContentExtractor } from '../assessmentStudio/import/extractors/RawContentExtractor.js';
import { TextNormalizer } from '../assessmentStudio/import/extractors/TextNormalizer.js';
import { DocumentSegmenter } from '../assessmentStudio/import/extractors/DocumentSegmenter.js';
import { AIQuestionExtractor } from '../assessmentStudio/import/extractors/AIQuestionExtractor.js';
import { ValidationEngine } from '../assessmentStudio/import/extractors/ValidationEngine.js';
import { SourceDetector } from '../assessmentStudio/import/extractors/SourceDetector.js';
import { ContentInput, ContentSource } from '../assessmentStudio/import/unifiedTypes.js';

export class LocalFileAdapter implements ContentSourceAdapter {
  readonly adapterId = 'local-file';
  readonly adapterName = 'Local File Adapter';
  readonly supportedSourceTypes = ['pdf', 'docx', 'pptx', 'txt', 'markdown', 'csv', 'excel', 'image'];

  /**
   * Check if this adapter can handle the source data
   */
  canHandle(sourceData: SourceData): boolean {
    return sourceData.type === 'file';
  }

  /**
   * Process a local file and return an AssessmentDocument
   */
  async process(sourceData: SourceData): Promise<AssessmentDocument> {
    if (sourceData.type !== 'file' || !(sourceData.data instanceof File)) {
      throw new Error('Invalid source data for LocalFileAdapter');
    }

    const file = sourceData.data;
    
    // Convert File to ContentInput format
    const buffer = await file.arrayBuffer();
    const contentInput: ContentInput = {
      source: ContentSource.FILE,
      file: {
        name: file.name,
        mimeType: file.type,
        buffer: Buffer.from(buffer),
        size: file.size,
      },
    };

    // Run the same pipeline as contentBuilderController
    const detectionResult = SourceDetector.detect(contentInput);
    const sourceType = detectionResult.sourceType;

    const rawContent = await RawContentExtractor.extract(contentInput, sourceType);
    const normalizedText = TextNormalizer.normalize(rawContent);
    const segmentedContent = DocumentSegmenter.segment(normalizedText);
    const extractedQuestions = await AIQuestionExtractor.extract(segmentedContent);
    const validationResult = ValidationEngine.validate(extractedQuestions);
    
    // Convert to AssessmentDocument format
    return this.convertToAssessmentDocument(validationResult.questions, file.name, sourceType);
  }

  /**
   * Convert ContentAnalysisEngine output to AssessmentDocument
   */
  private convertToAssessmentDocument(questions: any[], filename: string, sourceType: any): AssessmentDocument {
    return {
      metadata: {
        provider: 'local',
        sourceType: this.inferSourceType(filename),
        sourceId: undefined,
        title: filename,
        author: undefined,
        createdAt: new Date(),
        processedAt: new Date(),
      },
      sections: [
        {
          id: 'default-section',
          title: 'Default Section',
          questionIds: questions.map((q: any) => q.id),
          order: 0,
        },
      ],
      questions: questions.map((q: any) => ({
        id: q.id,
        type: this.mapQuestionType(q.type),
        text: q.text,
        options: q.options?.map((o: any) => o.text) || [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        tags: [],
        sectionId: 'default-section',
        order: 0,
        confidence: Math.round((q.confidence || 0) * 100),
      })),
      images: [],
      tables: [],
      confidence: {
        overall: this.calculateOverallConfidence(questions),
        byQuestion: questions.map((q: any) => Math.round((q.confidence || 0) * 100)),
      },
      validation: {
        valid: true,
        issues: [],
      },
    };
  }

  /**
   * Infer source type from filename
   */
  private inferSourceType(filename: string): AssessmentDocument['metadata']['sourceType'] {
    const ext = filename.toLowerCase().split('.').pop();
    const typeMap: Record<string, AssessmentDocument['metadata']['sourceType']> = {
      pdf: 'pdf',
      docx: 'docx',
      doc: 'docx',
      pptx: 'pptx',
      ppt: 'pptx',
      txt: 'txt',
      md: 'markdown',
      markdown: 'markdown',
      csv: 'csv',
      xls: 'excel',
      xlsx: 'excel',
      png: 'image',
      jpg: 'image',
      jpeg: 'image',
      gif: 'image',
      bmp: 'image',
      tiff: 'image',
    };
    return typeMap[ext || ''] || 'txt';
  }

  /**
   * Map question type from ContentAnalysisEngine to AssessmentDocument
   */
  private mapQuestionType(type: string): AssessmentDocument['questions'][0]['type'] {
    const typeMap: Record<string, AssessmentDocument['questions'][0]['type']> = {
      'multiple_choice': 'multiple-choice',
      'multiple_select': 'multiple-choice',
      'true_false': 'true-false',
      'short_answer': 'short-answer',
      'fill_blank': 'fill-blank',
      'matching': 'matching',
      'essay': 'essay',
    };
    return typeMap[type] || 'multiple-choice';
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(questions: any[]): number {
    if (!questions.length) return 0;
    const sum = questions.reduce((acc, q) => acc + (q.confidence || 0), 0);
    return Math.round((sum / questions.length) * 100);
  }
}
