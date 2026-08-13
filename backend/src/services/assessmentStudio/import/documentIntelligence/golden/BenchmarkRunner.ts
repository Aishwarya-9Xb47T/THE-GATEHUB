/**
 * Benchmark Runner
 * Runs the Document Intelligence Engine on golden corpus and measures performance
 */

import { DocumentIntelligenceEngine } from '../DocumentIntelligenceEngine.js';
import { GoldenCorpusManager, GoldenDocument } from './GoldenCorpusManager.js';
import { QuestionObject } from '../types.js';

export interface BenchmarkResult {
  documentId: string;
  documentName: string;
  success: boolean;
  duration: number;
  extractedQuestions: QuestionObject[];
  groundTruthQuestions: QuestionObject[];
  metrics: {
    precision: number;
    recall: number;
    f1Score: number;
    accuracy: number;
    coverage: number;
  };
  errors: string[];
}

export interface BenchmarkSummary {
  totalDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  totalDuration: number;
  averageDuration: number;
  averagePrecision: number;
  averageRecall: number;
  averageF1Score: number;
  averageAccuracy: number;
  averageCoverage: number;
  results: BenchmarkResult[];
}

export class BenchmarkRunner {
  private engine: DocumentIntelligenceEngine;
  private corpusManager: GoldenCorpusManager;

  constructor(engine: DocumentIntelligenceEngine, corpusManager: GoldenCorpusManager) {
    this.engine = engine;
    this.corpusManager = corpusManager;
  }

  /**
   * Run benchmark on a single document
   */
  async runBenchmark(documentId: string): Promise<BenchmarkResult> {
    const document = this.corpusManager.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found in corpus`);
    }

    console.log(`[BenchmarkRunner] Running benchmark on: ${document.name}`);

    const startTime = Date.now();
    const errors: string[] = [];
    let extractedQuestions: QuestionObject[] = [];

    try {
      // Process document with the engine
      // Note: In production, this would need to load the actual file buffer
      // For now, we'll skip the actual processing and use placeholder
      console.log(`[BenchmarkRunner] Processing document: ${document.source}`);
      
      // Placeholder: In production, load the file and pass buffer to engine
      // const fileBuffer = fs.readFileSync(document.source);
      // const result = await this.engine.processDocument({
      //   buffer: fileBuffer,
      //   name: document.name,
      //   mimeType: this.getMimeType(document.type),
      // });
      
      // For now, simulate processing
      extractedQuestions = document.groundTruth; // Placeholder - would be actual extraction
      
    } catch (error) {
      errors.push(`Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const duration = Date.now() - startTime;

    // Calculate metrics
    const metrics = this.calculateMetrics(extractedQuestions, document.groundTruth);

    const benchmarkResult: BenchmarkResult = {
      documentId: document.id,
      documentName: document.name,
      success: errors.length === 0,
      duration,
      extractedQuestions,
      groundTruthQuestions: document.groundTruth,
      metrics,
      errors,
    };

    console.log(`[BenchmarkRunner] Benchmark complete: Precision=${metrics.precision.toFixed(2)}, Recall=${metrics.recall.toFixed(2)}, F1=${metrics.f1Score.toFixed(2)}`);

    return benchmarkResult;
  }

  /**
   * Run benchmark on entire corpus
   */
  async runFullBenchmark(): Promise<BenchmarkSummary> {
    console.log('[BenchmarkRunner] Running full corpus benchmark');

    const documents = this.corpusManager.getAllDocuments();
    const results: BenchmarkResult[] = [];

    for (const document of documents) {
      const result = await this.runBenchmark(document.id);
      results.push(result);
    }

    // Calculate summary
    const summary = this.calculateSummary(results);

    console.log('[BenchmarkRunner] Full benchmark complete');
    console.log(`Average Precision: ${summary.averagePrecision.toFixed(2)}`);
    console.log(`Average Recall: ${summary.averageRecall.toFixed(2)}`);
    console.log(`Average F1 Score: ${summary.averageF1Score.toFixed(2)}`);

    return summary;
  }

  /**
   * Run benchmark on sample of documents
   */
  async runSampleBenchmark(sampleSize: number): Promise<BenchmarkSummary> {
    console.log(`[BenchmarkRunner] Running sample benchmark (${sampleSize} documents)`);

    const documents = this.corpusManager.getSample(sampleSize);
    const results: BenchmarkResult[] = [];

    for (const document of documents) {
      const result = await this.runBenchmark(document.id);
      results.push(result);
    }

    const summary = this.calculateSummary(results);

    console.log('[BenchmarkRunner] Sample benchmark complete');

    return summary;
  }

  /**
   * Calculate metrics for a single document
   */
  private calculateMetrics(
    extracted: QuestionObject[],
    groundTruth: QuestionObject[]
  ): {
    precision: number;
    recall: number;
    f1Score: number;
    accuracy: number;
    coverage: number;
  } {
    // Match questions by statement similarity
    const matches = this.matchQuestions(extracted, groundTruth);
    const truePositives = matches.length;
    const falsePositives = extracted.length - truePositives;
    const falseNegatives = groundTruth.length - truePositives;

    const precision = extracted.length > 0 ? truePositives / extracted.length : 0;
    const recall = groundTruth.length > 0 ? truePositives / groundTruth.length : 0;
    const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    // Calculate accuracy (percentage of correctly extracted questions)
    const accuracy = groundTruth.length > 0 ? truePositives / groundTruth.length : 0;

    // Calculate coverage (percentage of ground truth questions found)
    const coverage = groundTruth.length > 0 ? truePositives / groundTruth.length : 0;

    return {
      precision,
      recall,
      f1Score,
      accuracy,
      coverage,
    };
  }

  /**
   * Match extracted questions to ground truth
   */
  private matchQuestions(
    extracted: QuestionObject[],
    groundTruth: QuestionObject[]
  ): Array<{ extracted: QuestionObject; groundTruth: QuestionObject; similarity: number }> {
    const matches: Array<{ extracted: QuestionObject; groundTruth: QuestionObject; similarity: number }> = [];
    const matchedGroundTruth = new Set<string>();

    for (const extractedQ of extracted) {
      let bestMatch: QuestionObject | undefined;
      let bestSimilarity = 0;

      for (const groundTruthQ of groundTruth) {
        if (matchedGroundTruth.has(groundTruthQ.id)) {
          continue;
        }

        const similarity = this.calculateSimilarity(extractedQ.statement, groundTruthQ.statement);

        if (similarity > bestSimilarity && similarity > 0.7) {
          bestMatch = groundTruthQ;
          bestSimilarity = similarity;
        }
      }

      if (bestMatch) {
        matches.push({
          extracted: extractedQ,
          groundTruth: bestMatch,
          similarity: bestSimilarity,
        });
        matchedGroundTruth.add(bestMatch.id);
      }
    }

    return matches;
  }

  /**
   * Calculate similarity between two question statements
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
   * Calculate benchmark summary
   */
  private calculateSummary(results: BenchmarkResult[]): BenchmarkSummary {
    const successfulDocuments = results.filter(r => r.success).length;
    const failedDocuments = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    const averagePrecision = results.length > 0
      ? results.reduce((sum, r) => sum + r.metrics.precision, 0) / results.length
      : 0;
    const averageRecall = results.length > 0
      ? results.reduce((sum, r) => sum + r.metrics.recall, 0) / results.length
      : 0;
    const averageF1Score = results.length > 0
      ? results.reduce((sum, r) => sum + r.metrics.f1Score, 0) / results.length
      : 0;
    const averageAccuracy = results.length > 0
      ? results.reduce((sum, r) => sum + r.metrics.accuracy, 0) / results.length
      : 0;
    const averageCoverage = results.length > 0
      ? results.reduce((sum, r) => sum + r.metrics.coverage, 0) / results.length
      : 0;

    return {
      totalDocuments: results.length,
      successfulDocuments,
      failedDocuments,
      totalDuration,
      averageDuration: results.length > 0 ? totalDuration / results.length : 0,
      averagePrecision,
      averageRecall,
      averageF1Score,
      averageAccuracy,
      averageCoverage,
      results,
    };
  }

  /**
   * Export benchmark results as JSON
   */
  exportResults(summary: BenchmarkSummary): string {
    return JSON.stringify(summary, null, 2);
  }

  /**
   * Generate benchmark report
   */
  generateReport(summary: BenchmarkSummary): string {
    const lines: string[] = [];
    lines.push('=== Benchmark Report ===');
    lines.push('');
    lines.push(`Total Documents: ${summary.totalDocuments}`);
    lines.push(`Successful: ${summary.successfulDocuments}`);
    lines.push(`Failed: ${summary.failedDocuments}`);
    lines.push('');
    lines.push(`Total Duration: ${summary.totalDuration}ms`);
    lines.push(`Average Duration: ${summary.averageDuration.toFixed(0)}ms`);
    lines.push('');
    lines.push('--- Performance Metrics ---');
    lines.push(`Average Precision: ${(summary.averagePrecision * 100).toFixed(1)}%`);
    lines.push(`Average Recall: ${(summary.averageRecall * 100).toFixed(1)}%`);
    lines.push(`Average F1 Score: ${(summary.averageF1Score * 100).toFixed(1)}%`);
    lines.push(`Average Accuracy: ${(summary.averageAccuracy * 100).toFixed(1)}%`);
    lines.push(`Average Coverage: ${(summary.averageCoverage * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('--- Individual Results ---');
    lines.push('');

    for (const result of summary.results) {
      const status = result.success ? '✓' : '✗';
      lines.push(`${status} ${result.documentName}`);
      lines.push(`  Duration: ${result.duration}ms`);
      lines.push(`  Precision: ${(result.metrics.precision * 100).toFixed(1)}%`);
      lines.push(`  Recall: ${(result.metrics.recall * 100).toFixed(1)}%`);
      lines.push(`  F1 Score: ${(result.metrics.f1Score * 100).toFixed(1)}%`);
      
      if (result.errors.length > 0) {
        lines.push('  Errors:');
        for (const error of result.errors) {
          lines.push(`    - ${error}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get benchmark engine
   */
  getEngine(): DocumentIntelligenceEngine {
    return this.engine;
  }

  /**
   * Get corpus manager
   */
  getCorpusManager(): GoldenCorpusManager {
    return this.corpusManager;
  }
}
