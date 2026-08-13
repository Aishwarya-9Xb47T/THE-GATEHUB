/**
 * Content Analysis Engine
 * Orchestrates all pipeline stages to convert various input sources into GateHub Quizzes
 */

import { ContentInput, ContentAnalysisResult, AnalysisStage, ProgressCallback, AnalysisStatistics, SourceType, AnalysisErrorCode, GateHubQuiz } from './unifiedTypes.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { createEmptyQuiz } from '../../quizBuilder/quizBuilderService.js';
import { SourceDetector } from './extractors/SourceDetector.js';
import { RawContentExtractor } from './extractors/RawContentExtractor.js';
import { TextNormalizer } from './extractors/TextNormalizer.js';
import { DocumentSegmenter } from './extractors/DocumentSegmenter.js';
import { AIQuestionExtractor } from './extractors/AIQuestionExtractor.js';
import { ValidationEngine } from './extractors/ValidationEngine.js';
import { QuizConverter } from './extractors/QuizConverter.js';
import { DocumentIntelligenceAdapter } from './extractors/DocumentIntelligenceAdapter.js';

export class ContentAnalysisEngine {
  private static readonly STAGES: AnalysisStage[] = [
    AnalysisStage.SOURCE_DETECTION,
    AnalysisStage.RAW_CONTENT_EXTRACTION,
    AnalysisStage.TEXT_NORMALIZATION,
    AnalysisStage.DOCUMENT_SEGMENTATION,
    AnalysisStage.AI_QUESTION_EXTRACTION,
    AnalysisStage.VALIDATION,
    AnalysisStage.QUIZ_SCHEMA_CONVERSION,
  ];

  /**
   * Run the complete content analysis pipeline
   */
  static async analyze(
    input: ContentInput,
    options: {
      title?: string;
      description?: string;
      onProgress?: ProgressCallback;
    } = {}
  ): Promise<ContentAnalysisResult> {
    const startTime = Date.now();
    const stagesCompleted: string[] = [];
    let sourceType: SourceType | null = null;

    const reportProgress = (stage: AnalysisStage, progress: number, message: string) => {
      if (options.onProgress) {
        options.onProgress({ stage, progress, message });
      }
    };

    try {
      // Stage 1: Source Type Detection
      reportProgress(AnalysisStage.SOURCE_DETECTION, 0, 'Reading content...');
      const detectionResult = SourceDetector.detect(input);
      sourceType = detectionResult.sourceType;
      stagesCompleted.push(AnalysisStage.SOURCE_DETECTION);
      reportProgress(AnalysisStage.SOURCE_DETECTION, 100, `Reading content`);

      // Stage 2: Raw Content Extraction
      reportProgress(AnalysisStage.RAW_CONTENT_EXTRACTION, 0, 'Understanding document...');
      const rawContent = await RawContentExtractor.extract(input, sourceType);
      stagesCompleted.push(AnalysisStage.RAW_CONTENT_EXTRACTION);
      reportProgress(AnalysisStage.RAW_CONTENT_EXTRACTION, 100, `Understanding document`);

      // Continue with original pipeline (segmentation + AI extraction)
      // Stage 3: Text Normalization
      reportProgress(AnalysisStage.TEXT_NORMALIZATION, 0, 'Finding assessment questions...');
      const normalizedText = TextNormalizer.normalize(rawContent);
      stagesCompleted.push(AnalysisStage.TEXT_NORMALIZATION);
      reportProgress(AnalysisStage.TEXT_NORMALIZATION, 100, `Finding assessment questions`);

      // Stage 4: Document Segmentation
      reportProgress(AnalysisStage.DOCUMENT_SEGMENTATION, 0, 'Matching answers...');
      const segmentedContent = DocumentSegmenter.segment(normalizedText);
      stagesCompleted.push(AnalysisStage.DOCUMENT_SEGMENTATION);
      reportProgress(AnalysisStage.DOCUMENT_SEGMENTATION, 100, `Matching answers`);

      // Stage 5: AI Question Extraction
      reportProgress(AnalysisStage.AI_QUESTION_EXTRACTION, 0, 'Organising explanations...');
      const extractedQuestions = await AIQuestionExtractor.extract(segmentedContent);
      stagesCompleted.push(AnalysisStage.AI_QUESTION_EXTRACTION);
      reportProgress(AnalysisStage.AI_QUESTION_EXTRACTION, 100, `Organising explanations`);

      // Stage 6: Validation
      reportProgress(AnalysisStage.VALIDATION, 0, 'Preparing Quiz Builder...');
      const validationResult = ValidationEngine.validate(extractedQuestions);
      stagesCompleted.push(AnalysisStage.VALIDATION);
      reportProgress(AnalysisStage.VALIDATION, 100, `Preparing Quiz Builder`);

      // Stage 7: Quiz Conversion
      reportProgress(AnalysisStage.QUIZ_SCHEMA_CONVERSION, 0, 'Opening Quiz Builder...');
      const quiz = QuizConverter.convert(validationResult.questions, {
        title: options.title,
        description: options.description,
      });
      stagesCompleted.push(AnalysisStage.QUIZ_SCHEMA_CONVERSION);
      reportProgress(AnalysisStage.QUIZ_SCHEMA_CONVERSION, 100, `Opening Quiz Builder`);

      // Stage 8: Quiz Creation in Database
      reportProgress(AnalysisStage.QUIZ_CREATION, 0, 'Creating quiz in database...');
      const quizId = await this.createQuizInDatabase(quiz);
      stagesCompleted.push(AnalysisStage.QUIZ_CREATION);
      reportProgress(AnalysisStage.QUIZ_CREATION, 100, `Quiz created with ID: ${quizId}`);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        quizId,
        statistics: {
          sourceType,
          processingTime,
          stagesCompleted,
          questionsExtracted: extractedQuestions.length,
          questionsValidated: validationResult.statistics.validQuestions,
          questionsFlagged: validationResult.statistics.flaggedQuestions,
          averageConfidence: this.calculateAverageConfidence(validationResult.questions),
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        // Convert AppError to AnalysisError
        const appErr = error as AppError;
        return {
          success: false,
          error: {
            code: this.mapAppErrorToAnalysisCode(appErr.statusCode),
            stage: stagesCompleted[stagesCompleted.length - 1] || AnalysisStage.SOURCE_DETECTION,
            message: appErr.message,
            details: appErr.message,
            recoverable: appErr.statusCode < 500,
          },
        };
      }
      
      const err = error as Error;
      return {
        success: false,
        error: {
          code: AnalysisErrorCode.EXTRACTION_FAILED,
          message: err.message || 'Unknown error occurred during analysis',
          stage: stagesCompleted[stagesCompleted.length - 1] || AnalysisStage.SOURCE_DETECTION,
          details: err.stack,
          recoverable: false,
        },
      };
    }
  }

  /**
   * Map AppError status codes to AnalysisErrorCode
   */
  private static mapAppErrorToAnalysisCode(statusCode: number): AnalysisErrorCode {
    switch (statusCode) {
      case 400:
        return AnalysisErrorCode.INVALID_URL;
      case 401:
        return AnalysisErrorCode.AUTHENTICATION_FAILED;
      case 413:
        return AnalysisErrorCode.FILE_TOO_LARGE;
      case 415:
        return AnalysisErrorCode.UNSUPPORTED_SOURCE;
      default:
        return AnalysisErrorCode.EXTRACTION_FAILED;
    }
  }

  /**
   * Create quiz in database using Prisma transaction
   */
  private static async createQuizInDatabase(quiz: GateHubQuiz): Promise<string> {
    const { prisma } = await import('../../../utils/prisma.js');
    
    // Resolve authorId to first available user if not specified
    const firstUser = await prisma.user.findFirst({ select: { id: true } });
    const authorId = firstUser?.id || 'admin';

    const created = await prisma.$transaction(async (tx) => {
      const qRecord = await tx.quiz.create({
        data: {
          title: quiz.title || 'Imported Quiz',
          description: quiz.description || 'Imported assessment',
          totalMarks: quiz.questions.length,
          authorId,
          visibility: quiz.visibility || 'private',
          metadata: (quiz.metadata || {}) as any,
        },
      });

      for (let i = 0; i < quiz.questions.length; i++) {
        const q = quiz.questions[i];
        const qMeta = (q.metadata && typeof q.metadata === 'object' ? q.metadata : {}) as Record<string, unknown>;

        await tx.question.create({
          data: {
            quizId: qRecord.id,
            text: q.text,
            type: q.type || 'multiple_choice',
            difficulty: q.difficulty || 'medium',
            marks: q.marks || 1,
            order: i,
            explanation: q.explanation || null,
            hint: q.hint || null,
            bloomLevel: q.bloomLevel || null,
            metadata: qMeta as any,
            options: {
              create: (q.options || []).map((opt, optIdx) => ({
                text: opt.text || `Option ${optIdx + 1}`,
                isCorrect: Boolean(opt.isCorrect),
                order: optIdx,
              })),
            },
          },
        });
      }

      return qRecord;
    });

    console.log('[ContentAnalysisEngine] Quiz successfully persisted in Prisma DB:', created.id, `(${quiz.questions.length} questions)`);
    return created.id;
  }

  /**
   * Calculate average confidence score
   */
  private static calculateAverageConfidence(questions: any[]): number {
    if (questions.length === 0) return 0;
    const total = questions.reduce((sum, q) => sum + (q.confidence || 0), 0);
    return total / questions.length;
  }

  /**
   * Get supported source types
   */
  static getSupportedSourceTypes(): SourceType[] {
    return [
      SourceType.PDF,
      SourceType.DOCX,
      SourceType.PPTX,
      SourceType.IMAGE,
      SourceType.MARKDOWN,
      SourceType.TXT,
      SourceType.HTML,
      SourceType.CSV,
      SourceType.EXCEL,
      SourceType.MOODLE_XML,
      SourceType.GOOGLE_DOCS,
      SourceType.GOOGLE_FORMS,
      SourceType.YOUTUBE,
      SourceType.WEBSITE,
    ];
  }

  /**
   * Validate input before processing
   */
  static validateInput(input: ContentInput): void {
    if (input.source === 'file' && !input.file) {
      throw new AppError(400, 'File input requires a file');
    }

    if (input.source === 'url' && !input.url) {
      throw new AppError(400, 'URL input requires a URL');
    }

    if ((input.source === 'google_docs' || input.source === 'google_forms') && !input.googleAccessToken) {
      throw new AppError(401, 'Google source requires access token');
    }

    if (input.file && !SourceDetector.validateFileSize(input.file.size)) {
      throw new AppError(400, 'File size exceeds 50MB limit');
    }
  }
}
