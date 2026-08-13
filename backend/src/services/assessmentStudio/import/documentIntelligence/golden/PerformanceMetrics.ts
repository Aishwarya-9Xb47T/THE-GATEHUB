/**
 * Performance Metrics
 * Defines and tracks key performance indicators for the Document Intelligence Engine
 */

import { BenchmarkSummary } from './BenchmarkRunner.js';
import { ErrorSummary } from './ErrorAnalyzer.js';

export interface PerformanceMetric {
  name: string;
  description: string;
  value: number;
  unit: string;
  target: number;
  status: 'pass' | 'fail' | 'warning';
  trend: 'improving' | 'stable' | 'degrading';
}

export interface MetricsReport {
  timestamp: Date;
  overallScore: number;
  metrics: PerformanceMetric[];
  summary: string;
  recommendations: string[];
}

export class PerformanceMetrics {
  private historicalData: Array<{
    timestamp: Date;
    metrics: Record<string, number>;
  }>;

  constructor() {
    this.historicalData = [];
  }

  /**
   * Calculate performance metrics from benchmark summary
   */
  calculateMetrics(benchmark: BenchmarkSummary, errorAnalysis: ErrorSummary): MetricsReport {
    const metrics: PerformanceMetric[] = [];

    // Precision metric
    const precision = this.createMetric(
      'precision',
      'Percentage of extracted questions that are correct',
      benchmark.averagePrecision,
      '%',
      0.9,
      this.getTrend('precision', benchmark.averagePrecision)
    );
    metrics.push(precision);

    // Recall metric
    const recall = this.createMetric(
      'recall',
      'Percentage of ground truth questions that were extracted',
      benchmark.averageRecall,
      '%',
      0.85,
      this.getTrend('recall', benchmark.averageRecall)
    );
    metrics.push(recall);

    // F1 Score metric
    const f1Score = this.createMetric(
      'f1_score',
      'Harmonic mean of precision and recall',
      benchmark.averageF1Score,
      '%',
      0.87,
      this.getTrend('f1_score', benchmark.averageF1Score)
    );
    metrics.push(f1Score);

    // Accuracy metric
    const accuracy = this.createMetric(
      'accuracy',
      'Overall accuracy of question extraction',
      benchmark.averageAccuracy,
      '%',
      0.85,
      this.getTrend('accuracy', benchmark.averageAccuracy)
    );
    metrics.push(accuracy);

    // Coverage metric
    const coverage = this.createMetric(
      'coverage',
      'Percentage of document content extracted',
      benchmark.averageCoverage,
      '%',
      0.8,
      this.getTrend('coverage', benchmark.averageCoverage)
    );
    metrics.push(coverage);

    // Error rate metric
    const errorRate = this.createMetric(
      'error_rate',
      'Percentage of documents with errors',
      (errorAnalysis.documentsWithErrors / errorAnalysis.totalDocuments) * 100,
      '%',
      10,
      this.getTrend('error_rate', (errorAnalysis.documentsWithErrors / errorAnalysis.totalDocuments) * 100),
      true // Lower is better
    );
    metrics.push(errorRate);

    // Processing speed metric
    const processingSpeed = this.createMetric(
      'processing_speed',
      'Average time to process a document',
      benchmark.averageDuration,
      'ms',
      5000,
      this.getTrend('processing_speed', benchmark.averageDuration),
      true // Lower is better
    );
    metrics.push(processingSpeed);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(metrics);

    // Generate summary
    const summary = this.generateSummary(metrics, overallScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics);

    // Store historical data
    this.storeHistoricalData(metrics);

    return {
      timestamp: new Date(),
      overallScore,
      metrics,
      summary,
      recommendations,
    };
  }

  /**
   * Create a performance metric
   */
  private createMetric(
    name: string,
    description: string,
    value: number,
    unit: string,
    target: number,
    trend: 'improving' | 'stable' | 'degrading',
    lowerIsBetter: boolean = false
  ): PerformanceMetric {
    let status: 'pass' | 'fail' | 'warning';

    if (lowerIsBetter) {
      if (value <= target) {
        status = 'pass';
      } else if (value <= target * 1.2) {
        status = 'warning';
      } else {
        status = 'fail';
      }
    } else {
      if (value >= target) {
        status = 'pass';
      } else if (value >= target * 0.8) {
        status = 'warning';
      } else {
        status = 'fail';
      }
    }

    return {
      name,
      description,
      value,
      unit,
      target,
      status,
      trend,
    };
  }

  /**
   * Get trend for a metric based on historical data
   */
  private getTrend(metricName: string, currentValue: number): 'improving' | 'stable' | 'degrading' {
    if (this.historicalData.length < 2) {
      return 'stable';
    }

    const recentData = this.historicalData.slice(-3);
    const previousValue = recentData[0].metrics[metricName];

    if (!previousValue) {
      return 'stable';
    }

    const change = currentValue - previousValue;
    const percentChange = Math.abs(change / previousValue);

    if (percentChange < 0.05) {
      return 'stable';
    }

    // For most metrics, higher is better
    if (metricName !== 'error_rate' && metricName !== 'processing_speed') {
      return change > 0 ? 'improving' : 'degrading';
    } else {
      return change < 0 ? 'improving' : 'degrading';
    }
  }

  /**
   * Calculate overall score from metrics
   */
  private calculateOverallScore(metrics: PerformanceMetric[]): number {
    let totalScore = 0;
    let weightSum = 0;

    const weights: Record<string, number> = {
      precision: 0.25,
      recall: 0.25,
      f1_score: 0.2,
      accuracy: 0.15,
      coverage: 0.1,
      error_rate: 0.05,
    };

    for (const metric of metrics) {
      const weight = weights[metric.name] || 0.1;
      const normalizedValue = metric.value / metric.target;
      totalScore += normalizedValue * weight;
      weightSum += weight;
    }

    return weightSum > 0 ? (totalScore / weightSum) * 100 : 0;
  }

  /**
   * Generate summary of metrics
   */
  private generateSummary(metrics: PerformanceMetric[], overallScore: number): string {
    const passCount = metrics.filter(m => m.status === 'pass').length;
    const warningCount = metrics.filter(m => m.status === 'warning').length;
    const failCount = metrics.filter(m => m.status === 'fail').length;

    let summary = `Overall Score: ${overallScore.toFixed(1)}%. `;
    summary += `Pass: ${passCount}, Warning: ${warningCount}, Fail: ${failCount}. `;

    if (overallScore >= 90) {
      summary += 'Performance is excellent.';
    } else if (overallScore >= 75) {
      summary += 'Performance is good.';
    } else if (overallScore >= 60) {
      summary += 'Performance needs improvement.';
    } else {
      summary += 'Performance is poor.';
    }

    return summary;
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(metrics: PerformanceMetric[]): string[] {
    const recommendations: string[] = [];

    for (const metric of metrics) {
      if (metric.status === 'fail') {
        if (metric.trend === 'degrading') {
          recommendations.push(`URGENT: ${metric.name} is failing and degrading. Immediate action required.`);
        } else {
          recommendations.push(`${metric.name} is failing. Consider addressing this issue.`);
        }
      } else if (metric.status === 'warning') {
        if (metric.trend === 'degrading') {
          recommendations.push(`${metric.name} is warning and degrading. Monitor closely.`);
        } else {
          recommendations.push(`${metric.name} is below target. Consider improvement.`);
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('All metrics are within acceptable ranges. Continue monitoring.');
    }

    return recommendations;
  }

  /**
   * Store historical data point
   */
  private storeHistoricalData(metrics: PerformanceMetric[]): void {
    const metricsRecord: Record<string, number> = {};
    for (const metric of metrics) {
      metricsRecord[metric.name] = metric.value;
    }

    this.historicalData.push({
      timestamp: new Date(),
      metrics: metricsRecord,
    });

    // Keep only last 100 data points
    if (this.historicalData.length > 100) {
      this.historicalData.shift();
    }
  }

  /**
   * Get historical data
   */
  getHistoricalData(): Array<{
    timestamp: Date;
    metrics: Record<string, number>;
  }> {
    return [...this.historicalData];
  }

  /**
   * Get metric history for a specific metric
   */
  getMetricHistory(metricName: string): Array<{
    timestamp: Date;
    value: number;
  }> {
    return this.historicalData
      .filter(data => data.metrics[metricName] !== undefined)
      .map(data => ({
        timestamp: data.timestamp,
        value: data.metrics[metricName],
      }));
  }

  /**
   * Clear historical data
   */
  clearHistory(): void {
    this.historicalData = [];
    console.log('[PerformanceMetrics] Historical data cleared');
  }

  /**
   * Export metrics report as JSON
   */
  exportReport(report: MetricsReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate metrics dashboard (text-based)
   */
  generateDashboard(report: MetricsReport): string {
    const lines: string[] = [];
    lines.push('=== Performance Metrics Dashboard ===');
    lines.push('');
    lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
    lines.push(`Overall Score: ${report.overallScore.toFixed(1)}%`);
    lines.push('');
    lines.push('--- Metrics ---');
    lines.push('');

    for (const metric of report.metrics) {
      const statusIcon = metric.status === 'pass' ? '✓' : metric.status === 'warning' ? '⚠' : '✗';
      const trendIcon = metric.trend === 'improving' ? '↑' : metric.trend === 'degrading' ? '↓' : '→';
      
      lines.push(`${statusIcon} ${metric.name}: ${metric.value.toFixed(2)}${metric.unit} ${trendIcon}`);
      lines.push(`   ${metric.description}`);
      lines.push(`   Target: ${metric.target}${metric.unit}`);
      lines.push('');
    }

    lines.push('--- Summary ---');
    lines.push(report.summary);
    lines.push('');
    lines.push('--- Recommendations ---');
    for (const recommendation of report.recommendations) {
      lines.push(`- ${recommendation}`);
    }

    return lines.join('\n');
  }

  /**
   * Set custom target for a metric
   */
  setCustomTarget(metricName: string, target: number): void {
    // This would be used to override default targets
    console.log(`[PerformanceMetrics] Custom target set for ${metricName}: ${target}`);
  }

  /**
   * Get metric thresholds
   */
  getThresholds(): Record<string, { pass: number; warning: number }> {
    return {
      precision: { pass: 0.9, warning: 0.72 },
      recall: { pass: 0.85, warning: 0.68 },
      f1_score: { pass: 0.87, warning: 0.696 },
      accuracy: { pass: 0.85, warning: 0.68 },
      coverage: { pass: 0.8, warning: 0.64 },
      error_rate: { pass: 10, warning: 12 },
      processing_speed: { pass: 5000, warning: 6000 },
    };
  }
}
