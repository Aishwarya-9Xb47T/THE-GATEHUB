import { KnowledgeExtractionResult } from './types.js';

export interface ExpectedMetrics {
  minPages?: number;
  minParagraphs?: number;
  minTables?: number;
  minCodeBlocks?: number;
  minEquations?: number;
  minDiagrams?: number;
  minCharts?: number;
  minQuestions?: number;
  minImages?: number;
  minFlashcards?: number;
  requireSpeakerNotes?: boolean;
}

export interface ValidationReport {
  passed: boolean;
  accuracyScore: number; // 0 to 100
  placeholderFound: boolean;
  placeholderMatches: string[];
  discrepancies: string[];
  metrics: {
    expected: ExpectedMetrics;
    actual: {
      pages: number;
      blocks: number;
      tables: number;
      codeBlocks: number;
      equations: number;
      diagrams: number;
      charts: number;
      questions: number;
      images: number;
      flashcards: number;
    };
  };
}

export class ExtractionValidator {
  /**
   * Validate extraction output against expected metrics and check zero-placeholder compliance
   */
  public static validate(
    result: KnowledgeExtractionResult,
    expected: ExpectedMetrics
  ): ValidationReport {
    const discrepancies: string[] = [];
    const placeholderMatches: string[] = [];

    // 1. Check Zero-Placeholder Compliance
    const rawOutputString = JSON.stringify(result);
    const forbiddenPlaceholders = [
      'placeholder',
      'lorem ipsum',
      'dummy data',
      'sample question stem',
      'mock_question',
      'fake_answer',
      'todo_implement',
    ];

    forbiddenPlaceholders.forEach(ph => {
      if (rawOutputString.toLowerCase().includes(ph)) {
        placeholderMatches.push(ph);
        discrepancies.push(`CRITICAL: Placeholder string "${ph}" found in extracted output!`);
      }
    });

    // 2. Metric Verification
    const actual = {
      pages: result.document.pageCount,
      blocks: result.blocks.length,
      tables: result.tables.length,
      codeBlocks: result.codeBlocks.length,
      equations: result.equations.length,
      diagrams: result.diagrams.length,
      charts: result.charts.length,
      questions: result.questions.length,
      images: result.images.length,
      flashcards: result.aiEnrichment.flashcards.length,
    };

    let totalChecks = 0;
    let passedChecks = 0;

    const checkMetric = (name: string, exp?: number, act?: number) => {
      if (exp !== undefined) {
        totalChecks++;
        if ((act || 0) >= exp) {
          passedChecks++;
        } else {
          discrepancies.push(`Missing ${name}: Expected at least ${exp}, but extracted ${act || 0}`);
        }
      }
    };

    checkMetric('Pages', expected.minPages, actual.pages);
    checkMetric('Paragraphs/Blocks', expected.minParagraphs, actual.blocks);
    checkMetric('Tables', expected.minTables, actual.tables);
    checkMetric('Code Blocks', expected.minCodeBlocks, actual.codeBlocks);
    checkMetric('Equations', expected.minEquations, actual.equations);
    checkMetric('Diagrams', expected.minDiagrams, actual.diagrams);
    checkMetric('Charts', expected.minCharts, actual.charts);
    checkMetric('Questions', expected.minQuestions, actual.questions);
    checkMetric('Images', expected.minImages, actual.images);
    checkMetric('Flashcards', expected.minFlashcards, actual.flashcards);

    if (expected.requireSpeakerNotes) {
      totalChecks++;
      const hasNotes = result.document.pages.some(p => (p.speakerNotes || '').trim().length > 0);
      if (hasNotes) {
        passedChecks++;
      } else {
        discrepancies.push('Missing Speaker Notes: Document was expected to contain presenter notes.');
      }
    }

    const accuracyScore = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;
    const passed = accuracyScore === 100 && placeholderMatches.length === 0;

    return {
      passed,
      accuracyScore,
      placeholderFound: placeholderMatches.length > 0,
      placeholderMatches,
      discrepancies,
      metrics: {
        expected,
        actual,
      },
    };
  }
}
