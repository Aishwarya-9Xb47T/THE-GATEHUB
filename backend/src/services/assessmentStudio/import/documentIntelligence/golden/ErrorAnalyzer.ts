/**
 * Error Analyzer
 * Analyzes errors from benchmark runs to identify patterns and improvement areas
 */

import { BenchmarkResult, BenchmarkSummary } from './BenchmarkRunner.js';
import { QuestionObject } from '../types.js';

export interface ErrorAnalysis {
  documentId: string;
  documentName: string;
  totalErrors: number;
  errorTypes: Record<string, number>;
  missedQuestions: Array<{
    groundTruth: QuestionObject;
    reason: string;
  }>;
  hallucinatedQuestions: Array<{
    extracted: QuestionObject;
    reason: string;
  }>;
  misclassifiedQuestions: Array<{
    extracted: QuestionObject;
    groundTruth: QuestionObject;
    field: string;
    expected: string;
    actual: string;
  }>;
  lowConfidenceQuestions: Array<{
    question: QuestionObject;
    confidence: number;
  }>;
}

export interface ErrorSummary {
  totalDocuments: number;
  documentsWithErrors: number;
  totalErrors: number;
  errorTypeDistribution: Record<string, number>;
  commonErrorPatterns: Array<{
    pattern: string;
    frequency: number;
    examples: string[];
  }>;
  improvementSuggestions: string[];
}

export class ErrorAnalyzer {
  /**
   * Analyze errors in a single benchmark result
   */
  analyzeResult(result: BenchmarkResult): ErrorAnalysis {
    const errorTypes: Record<string, number> = {};
    const missedQuestions: Array<{ groundTruth: QuestionObject; reason: string }> = [];
    const hallucinatedQuestions: Array<{ extracted: QuestionObject; reason: string }> = [];
    const misclassifiedQuestions: Array<{
      extracted: QuestionObject;
      groundTruth: QuestionObject;
      field: string;
      expected: string;
      actual: string;
    }> = [];
    const lowConfidenceQuestions: Array<{ question: QuestionObject; confidence: number }> = [];

    // Identify missed questions (false negatives)
    const matchedExtractedIds = new Set<string>();
    for (const extracted of result.extractedQuestions) {
      for (const groundTruth of result.groundTruthQuestions) {
        if (this.calculateSimilarity(extracted.statement, groundTruth.statement) > 0.7) {
          matchedExtractedIds.add(groundTruth.id);
          
          // Check for misclassifications
          this.checkMisclassifications(extracted, groundTruth, misclassifiedQuestions);
          break;
        }
      }
    }

    for (const groundTruth of result.groundTruthQuestions) {
      if (!matchedExtractedIds.has(groundTruth.id)) {
        missedQuestions.push({
          groundTruth,
          reason: 'Question not extracted',
        });
        errorTypes['missed_question'] = (errorTypes['missed_question'] || 0) + 1;
      }
    }

    // Identify hallucinated questions (false positives)
    const matchedGroundTruthIds = new Set<string>();
    for (const groundTruth of result.groundTruthQuestions) {
      for (const extracted of result.extractedQuestions) {
        if (this.calculateSimilarity(extracted.statement, groundTruth.statement) > 0.7) {
          matchedGroundTruthIds.add(extracted.id);
          break;
        }
      }
    }

    for (const extracted of result.extractedQuestions) {
      if (!matchedGroundTruthIds.has(extracted.id)) {
        hallucinatedQuestions.push({
          extracted,
          reason: 'Question not in ground truth',
        });
        errorTypes['hallucinated_question'] = (errorTypes['hallucinated_question'] || 0) + 1;
      }
    }

    // Identify low confidence questions
    for (const question of result.extractedQuestions) {
      if (question.confidence.overall < 0.6) {
        lowConfidenceQuestions.push({
          question,
          confidence: question.confidence.overall,
        });
        errorTypes['low_confidence'] = (errorTypes['low_confidence'] || 0) + 1;
      }
    }

    // Count processing errors
    for (const error of result.errors) {
      errorTypes['processing_error'] = (errorTypes['processing_error'] || 0) + 1;
    }

    return {
      documentId: result.documentId,
      documentName: result.documentName,
      totalErrors: Object.values(errorTypes).reduce((sum, count) => sum + count, 0),
      errorTypes,
      missedQuestions,
      hallucinatedQuestions,
      misclassifiedQuestions,
      lowConfidenceQuestions,
    };
  }

  /**
   * Analyze errors across all benchmark results
   */
  analyzeSummary(summary: BenchmarkSummary): ErrorSummary {
    const documentsWithErrors: number[] = [];
    const totalErrors: number[] = [];
    const errorTypeDistribution: Record<string, number> = {};
    const commonErrorPatterns: Array<{
      pattern: string;
      frequency: number;
      examples: string[];
    }> = [];

    for (const result of summary.results) {
      const analysis = this.analyzeResult(result);

      if (analysis.totalErrors > 0) {
        documentsWithErrors.push(1);
        totalErrors.push(analysis.totalErrors);

        // Aggregate error types
        for (const [type, count] of Object.entries(analysis.errorTypes)) {
          errorTypeDistribution[type] = (errorTypeDistribution[type] || 0) + count;
        }
      }
    }

    // Identify common patterns
    const patterns = this.identifyCommonPatterns(summary.results);
    commonErrorPatterns.push(...patterns);

    // Generate improvement suggestions
    const suggestions = this.generateImprovementSuggestions(errorTypeDistribution, patterns);

    return {
      totalDocuments: summary.totalDocuments,
      documentsWithErrors: documentsWithErrors.length,
      totalErrors: totalErrors.reduce((sum, count) => sum + count, 0),
      errorTypeDistribution,
      commonErrorPatterns,
      improvementSuggestions: suggestions,
    };
  }

  /**
   * Check for misclassifications between extracted and ground truth
   */
  private checkMisclassifications(
    extracted: QuestionObject,
    groundTruth: QuestionObject,
    misclassifiedQuestions: Array<{
      extracted: QuestionObject;
      groundTruth: QuestionObject;
      field: string;
      expected: string;
      actual: string;
    }>
  ): void {
    // Check question type
    if (extracted.type !== groundTruth.type) {
      misclassifiedQuestions.push({
        extracted,
        groundTruth,
        field: 'type',
        expected: groundTruth.type,
        actual: extracted.type,
      });
    }

    // Check difficulty
    if (extracted.metadata.difficulty !== groundTruth.metadata.difficulty) {
      misclassifiedQuestions.push({
        extracted,
        groundTruth,
        field: 'difficulty',
        expected: groundTruth.metadata.difficulty,
        actual: extracted.metadata.difficulty,
      });
    }

    // Check Bloom's level
    if (extracted.metadata.bloomLevel !== groundTruth.metadata.bloomLevel) {
      misclassifiedQuestions.push({
        extracted,
        groundTruth,
        field: 'bloomLevel',
        expected: groundTruth.metadata.bloomLevel,
        actual: extracted.metadata.bloomLevel,
      });
    }

    // Check options count
    const extractedOptions = extracted.options?.length || 0;
    const groundTruthOptions = groundTruth.options?.length || 0;
    if (extractedOptions !== groundTruthOptions) {
      misclassifiedQuestions.push({
        extracted,
        groundTruth,
        field: 'options_count',
        expected: groundTruthOptions.toString(),
        actual: extractedOptions.toString(),
      });
    }
  }

  /**
   * Identify common error patterns
   */
  private identifyCommonPatterns(results: BenchmarkResult[]): Array<{
    pattern: string;
    frequency: number;
    examples: string[];
  }> {
    const patterns: Array<{
      pattern: string;
      frequency: number;
      examples: string[];
    }> = [];

    // Pattern: Questions with certain keywords are often missed
    const missedKeywords = new Map<string, number>();
    const missedExamples = new Map<string, string[]>();

    for (const result of results) {
      const analysis = this.analyzeResult(result);

      for (const missed of analysis.missedQuestions) {
        const keywords = this.extractKeywords(missed.groundTruth.statement);
        for (const keyword of keywords) {
          missedKeywords.set(keyword, (missedKeywords.get(keyword) || 0) + 1);
          if (!missedExamples.has(keyword)) {
            missedExamples.set(keyword, []);
          }
          missedExamples.get(keyword)!.push(missed.groundTruth.statement.substring(0, 50));
        }
      }
    }

    // Add top missed keyword patterns
    const sortedKeywords = Array.from(missedKeywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [keyword, frequency] of sortedKeywords) {
      if (frequency >= 2) {
        patterns.push({
          pattern: `Questions containing "${keyword}" are often missed`,
          frequency,
          examples: (missedExamples.get(keyword) || []).slice(0, 3),
        });
      }
    }

    return patterns;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
    const words = text.toLowerCase().split(/\s+/);
    return words.filter(word => word.length > 3 && !stopWords.has(word));
  }

  /**
   * Generate improvement suggestions based on error analysis
   */
  private generateImprovementSuggestions(
    errorTypeDistribution: Record<string, number>,
    patterns: Array<{ pattern: string; frequency: number; examples: string[] }>
  ): string[] {
    const suggestions: string[] = [];

    // Suggestions based on error types
    if (errorTypeDistribution['missed_question'] > 0) {
      suggestions.push('Improve question boundary detection to reduce missed questions');
    }

    if (errorTypeDistribution['hallucinated_question'] > 0) {
      suggestions.push('Add stricter validation to reduce hallucinated questions');
    }

    if (errorTypeDistribution['low_confidence'] > 0) {
      suggestions.push('Improve confidence calibration for low-confidence questions');
    }

    if (errorTypeDistribution['processing_error'] > 0) {
      suggestions.push('Improve error handling in document processing pipeline');
    }

    // Suggestions based on patterns
    for (const pattern of patterns) {
      if (pattern.frequency >= 3) {
        suggestions.push(`Address pattern: ${pattern.pattern}`);
      }
    }

    // General suggestions
    suggestions.push('Consider adding more training data for edge cases');
    suggestions.push('Review and improve regex patterns for question detection');
    suggestions.push('Enhance semantic classification for ambiguous questions');

    return suggestions;
  }

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Generate error analysis report
   */
  generateReport(analysis: ErrorSummary): string {
    const lines: string[] = [];
    lines.push('=== Error Analysis Report ===');
    lines.push('');
    lines.push(`Total Documents: ${analysis.totalDocuments}`);
    lines.push(`Documents with Errors: ${analysis.documentsWithErrors}`);
    lines.push(`Total Errors: ${analysis.totalErrors}`);
    lines.push('');
    lines.push('--- Error Type Distribution ---');
    for (const [type, count] of Object.entries(analysis.errorTypeDistribution)) {
      lines.push(`${type}: ${count}`);
    }
    lines.push('');
    lines.push('--- Common Error Patterns ---');
    for (const pattern of analysis.commonErrorPatterns) {
      lines.push(`${pattern.pattern} (frequency: ${pattern.frequency})`);
      lines.push('  Examples:');
      for (const example of pattern.examples) {
        lines.push(`    - ${example}...`);
      }
      lines.push('');
    }
    lines.push('--- Improvement Suggestions ---');
    for (const suggestion of analysis.improvementSuggestions) {
      lines.push(`- ${suggestion}`);
    }

    return lines.join('\n');
  }

  /**
   * Export error analysis as JSON
   */
  exportAnalysis(analysis: ErrorSummary): string {
    return JSON.stringify(analysis, null, 2);
  }
}
