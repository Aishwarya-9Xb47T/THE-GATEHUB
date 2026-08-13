/**
 * Stage 6: Validation Engine
 * Filters non-questions, removes duplicates, validates question structure, and applies confidence scoring
 */

import { ExtractedQuestionDraft, ValidatedQuestionDraft, ValidationResult } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';

export class ValidationEngine {
  private static readonly MIN_CONFIDENCE_THRESHOLD = 0.5;
  private static readonly FLAG_CONFIDENCE_THRESHOLD = 0.85;
  private static readonly SIMILARITY_THRESHOLD = 0.98;

  /**
   * Validate extracted questions
   */
  static validate(questions: ExtractedQuestionDraft[]): ValidationResult {
    console.log('=== ValidationEngine.validate ENTRY ===');
    console.log('INPUT:', {
      questionsCount: questions.length,
      firstQuestion: questions[0] ? {
        text: questions[0].text.substring(0, 100),
        type: questions[0].type,
        confidence: questions[0].confidence
      } : null
    });

    try {
      const startTime = Date.now();
      let validCount = 0;
      let flaggedCount = 0;
      let rejectedCount = 0;
      let duplicateCount = 0;

      console.log('[ValidationEngine] Step 1: Filtering invalid questions');
      const filterStartTime = Date.now();
      const filtered = questions.filter(q => this.isValidQuestion(q));
      const filterDuration = Date.now() - filterStartTime;
      console.log('[ValidationEngine] Filter completed', {
        duration: `${filterDuration}ms`,
        originalCount: questions.length,
        filteredCount: filtered.length,
        removedCount: questions.length - filtered.length
      });

      console.log('[ValidationEngine] Step 2: Removing duplicates');
      const dedupStartTime = Date.now();
      const deduplicated = this.removeDuplicates(filtered);
      const dedupDuration = Date.now() - dedupStartTime;
      duplicateCount = filtered.length - deduplicated.length;
      console.log('[ValidationEngine] Deduplication completed', {
        duration: `${dedupDuration}ms`,
        duplicatesRemoved: duplicateCount,
        remainingCount: deduplicated.length
      });

      console.log('[ValidationEngine] Step 3: Validating and classifying questions');
      const validationStartTime = Date.now();
      const validated: ValidatedQuestionDraft[] = deduplicated.map(q => {
        const status = this.determineValidationStatus(q);
        
        if (status === 'valid') validCount++;
        else if (status === 'flagged') flaggedCount++;
        else rejectedCount++;

        return {
          ...q,
          validationStatus: status,
          rejectionReason: status === 'rejected' ? this.getRejectionReason(q) : undefined,
        };
      });
      const validationDuration = Date.now() - validationStartTime;
      console.log('[ValidationEngine] Validation completed', {
        duration: `${validationDuration}ms`,
        validCount,
        flaggedCount,
        rejectedCount
      });

      const totalDuration = Date.now() - startTime;
      console.log('=== ValidationEngine.validate EXIT ===');
      console.log('OUTPUT:', {
        validQuestions: validCount,
        flaggedQuestions: flaggedCount,
        rejectedQuestions: rejectedCount,
        duplicatesRemoved: duplicateCount,
        duration: `${totalDuration}ms`
      });

      return {
        questions: validated,
        statistics: {
          totalExtracted: questions.length,
          validQuestions: validCount,
          flaggedQuestions: flaggedCount,
          rejectedQuestions: rejectedCount,
          duplicatesRemoved: duplicateCount,
        },
      };
    } catch (error) {
      console.error('=== ValidationEngine.validate ERROR ===');
      console.error('ERROR DETAILS:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new AppError(500, `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if question meets minimum validity criteria
   */
  private static isValidQuestion(q: ExtractedQuestionDraft): boolean {
    const textTrimmed = (q.text || '').trim();
    if (
      /^\d{1,4}$/.test(textTrimmed) ||
      /^(?:page|pg|p\.?)\s*\d+(?:\s*(?:to|-|of|\/|—)\s*\d+)?$/i.test(textTrimmed) ||
      /^\d+\s+(?:of|to)\s+\d+$/i.test(textTrimmed) ||
      /^\d+\s*(?:to|-|—)\s*\d+$/i.test(textTrimmed) ||
      /^\d+\s*[\/\-—]\s*\d+$/.test(textTrimmed) ||
      /^--?\s*\d+\s*(?:to|-|of|\/|—)?\s*\d*--?$/i.test(textTrimmed)
    ) {
      return false;
    }

    // Must have text or structured element (table, equation, code, diagram, image)
    const hasText = textTrimmed.length >= 2;
    const hasStructuredObject = Boolean(
      (q.metadata as any)?.table ||
      (q.metadata as any)?.equations?.length ||
      (q.metadata as any)?.code ||
      (q.metadata as any)?.diagram ||
      (q.metadata as any)?.passage ||
      (q.metadata as any)?.matchingPairs?.length
    );

    if (!hasText && !hasStructuredObject) {
      return false;
    }

    // Accept all 20 question types
    const validTypes = [
      'multiple_choice',
      'multiple_select',
      'true_false',
      'fill_blank',
      'short_answer',
      'long_answer',
      'table_question',
      'matching',
      'match_following',
      'image_question',
      'diagram_question',
      'equation_question',
      'code_question',
      'case_study',
      'reading_comprehension',
      'ordering',
      'drag_drop',
      'matrix',
      'hotspot',
      'timeline',
      'chart',
      'essay',
      'coding',
    ];

    if (!validTypes.includes(q.type as string)) {
      return true; // Allow custom/inferred type
    }

    // Multiple choice/select must have at least 2 options if options are specified
    if (['multiple_choice', 'multiple_select'].includes(q.type)) {
      if (q.options && q.options.length === 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Remove duplicate questions based on text similarity
   */
  private static removeDuplicates(questions: ExtractedQuestionDraft[]): ExtractedQuestionDraft[] {
    const unique: ExtractedQuestionDraft[] = [];
    const seen = new Set<string>();

    for (const question of questions) {
      const normalizedText = this.normalizeText(question.text);
      
      // Check for exact duplicates
      if (seen.has(normalizedText)) {
        continue;
      }

      // Check for similar questions
      let isDuplicate = false;
      for (const existing of unique) {
        if (this.calculateSimilarity(normalizedText, this.normalizeText(existing.text)) > this.SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(question);
        seen.add(normalizedText);
      }
    }

    return unique;
  }

  /**
   * Determine validation status based on confidence and quality
   */
  private static determineValidationStatus(q: ExtractedQuestionDraft): ValidatedQuestionDraft['validationStatus'] {
    // Reject if below minimum confidence
    if (q.confidence < this.MIN_CONFIDENCE_THRESHOLD) {
      return 'rejected';
    }

    // Flag if below flag threshold or has warnings
    if (q.confidence < this.FLAG_CONFIDENCE_THRESHOLD || q.warnings.length > 0) {
      return 'flagged';
    }

    // Valid if meets all criteria
    return 'valid';
  }

  /**
   * Get rejection reason for a question
   */
  private static getRejectionReason(q: ExtractedQuestionDraft): string {
    if (q.confidence < this.MIN_CONFIDENCE_THRESHOLD) {
      return 'Low confidence score';
    }
    if (!q.text || q.text.trim().length < 5) {
      return 'Missing or insufficient question text';
    }
    const needsOptions = ['multiple_choice', 'multiple_select', 'true_false'].includes(q.type);
    if (needsOptions && (!q.options || q.options.length < 2)) {
      return 'Insufficient options';
    }
    return 'Validation failed';
  }

  /**
   * Normalize text for comparison
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate similarity between two text strings (Jaccard similarity)
   */
  private static calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(' '));
    const words2 = new Set(text2.split(' '));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}
