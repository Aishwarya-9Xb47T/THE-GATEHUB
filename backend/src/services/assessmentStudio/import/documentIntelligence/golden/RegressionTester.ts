/**
 * Regression Tester
 * Ensures changes don't degrade performance by comparing against baseline
 */

import { BenchmarkRunner, BenchmarkSummary } from './BenchmarkRunner.js';
import { PerformanceMetrics, MetricsReport } from './PerformanceMetrics.js';
import { ErrorAnalyzer, ErrorSummary } from './ErrorAnalyzer.js';

export interface RegressionTestResult {
  timestamp: Date;
  baselineMetrics: MetricsReport;
  currentMetrics: MetricsReport;
  regressionDetected: boolean;
  regressions: Array<{
    metric: string;
    baselineValue: number;
    currentValue: number;
    change: number;
    changePercent: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  improvements: Array<{
    metric: string;
    baselineValue: number;
    currentValue: number;
    change: number;
    changePercent: number;
  }>;
  summary: string;
}

export interface BaselineData {
  timestamp: Date;
  metrics: MetricsReport;
  benchmarkSummary: BenchmarkSummary;
  errorAnalysis: ErrorSummary;
}

export class RegressionTester {
  private baseline: BaselineData | null;
  private regressionThreshold: number; // Percentage change considered regression

  constructor(regressionThreshold: number = 0.05) {
    this.baseline = null;
    this.regressionThreshold = regressionThreshold;
  }

  /**
   * Set baseline from benchmark results
   */
  setBaseline(
    metrics: MetricsReport,
    benchmarkSummary: BenchmarkSummary,
    errorAnalysis: ErrorSummary
  ): void {
    this.baseline = {
      timestamp: new Date(),
      metrics,
      benchmarkSummary,
      errorAnalysis,
    };
    console.log('[RegressionTester] Baseline set');
  }

  /**
   * Run regression test against current performance
   */
  async runRegressionTest(
    currentMetrics: MetricsReport,
    currentBenchmark: BenchmarkSummary,
    currentErrorAnalysis: ErrorSummary
  ): Promise<RegressionTestResult> {
    if (!this.baseline) {
      throw new Error('No baseline set. Call setBaseline() first.');
    }

    console.log('[RegressionTester] Running regression test');

    const regressions: Array<{
      metric: string;
      baselineValue: number;
      currentValue: number;
      change: number;
      changePercent: number;
      severity: 'low' | 'medium' | 'high';
    }> = [];
    const improvements: Array<{
      metric: string;
      baselineValue: number;
      currentValue: number;
      change: number;
      changePercent: number;
    }> = [];

    // Compare each metric
    for (const currentMetric of currentMetrics.metrics) {
      const baselineMetric = this.baseline.metrics.metrics.find(m => m.name === currentMetric.name);
      
      if (!baselineMetric) {
        continue;
      }

      const change = currentMetric.value - baselineMetric.value;
      const changePercent = (change / baselineMetric.value) * 100;

      // For most metrics, higher is better (except error_rate and processing_speed)
      const lowerIsBetter = currentMetric.name === 'error_rate' || currentMetric.name === 'processing_speed';

      if (lowerIsBetter) {
        if (change > this.regressionThreshold * baselineMetric.value) {
          // Regression (value increased when it should decrease)
          regressions.push({
            metric: currentMetric.name,
            baselineValue: baselineMetric.value,
            currentValue: currentMetric.value,
            change,
            changePercent,
            severity: this.calculateSeverity(changePercent, lowerIsBetter),
          });
        } else if (change < -this.regressionThreshold * baselineMetric.value) {
          // Improvement (value decreased when it should)
          improvements.push({
            metric: currentMetric.name,
            baselineValue: baselineMetric.value,
            currentValue: currentMetric.value,
            change,
            changePercent,
          });
        }
      } else {
        if (change < -this.regressionThreshold * baselineMetric.value) {
          // Regression (value decreased when it should increase)
          regressions.push({
            metric: currentMetric.name,
            baselineValue: baselineMetric.value,
            currentValue: currentMetric.value,
            change,
            changePercent,
            severity: this.calculateSeverity(changePercent, lowerIsBetter),
          });
        } else if (change > this.regressionThreshold * baselineMetric.value) {
          // Improvement (value increased when it should)
          improvements.push({
            metric: currentMetric.name,
            baselineValue: baselineMetric.value,
            currentValue: currentMetric.value,
            change,
            changePercent,
          });
        }
      }
    }

    const regressionDetected = regressions.some(r => r.severity === 'high' || r.severity === 'medium');

    const summary = this.generateSummary(regressions, improvements, regressionDetected);

    console.log('[RegressionTester] Regression test complete');

    return {
      timestamp: new Date(),
      baselineMetrics: this.baseline.metrics,
      currentMetrics,
      regressionDetected,
      regressions,
      improvements,
      summary,
    };
  }

  /**
   * Calculate severity of regression
   */
  private calculateSeverity(changePercent: number, lowerIsBetter: boolean): 'low' | 'medium' | 'high' {
    const absChange = Math.abs(changePercent);

    if (absChange < 5) {
      return 'low';
    } else if (absChange < 15) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  /**
   * Generate summary of regression test
   */
  private generateSummary(
    regressions: Array<{
      metric: string;
      baselineValue: number;
      currentValue: number;
      change: number;
      changePercent: number;
      severity: 'low' | 'medium' | 'high';
    }>,
    improvements: Array<{
      metric: string;
      baselineValue: number;
      currentValue: number;
      change: number;
      changePercent: number;
    }>,
    regressionDetected: boolean
  ): string {
    let summary = '';

    if (regressionDetected) {
      summary += `REGRESSION DETECTED. ${regressions.length} metric(s) degraded. `;
    } else {
      summary += 'No significant regression detected. ';
    }

    if (improvements.length > 0) {
      summary += `${improvements.length} metric(s) improved. `;
    }

    const highSeverityRegressions = regressions.filter(r => r.severity === 'high').length;
    if (highSeverityRegressions > 0) {
      summary += `${highSeverityRegressions} high-severity regression(s) require immediate attention.`;
    }

    return summary;
  }

  /**
   * Get baseline
   */
  getBaseline(): BaselineData | null {
    return this.baseline;
  }

  /**
   * Clear baseline
   */
  clearBaseline(): void {
    this.baseline = null;
    console.log('[RegressionTester] Baseline cleared');
  }

  /**
   * Set regression threshold
   */
  setRegressionThreshold(threshold: number): void {
    this.regressionThreshold = threshold;
    console.log(`[RegressionTester] Regression threshold set to ${threshold * 100}%`);
  }

  /**
   * Export regression test result as JSON
   */
  exportResult(result: RegressionTestResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generate regression test report
   */
  generateReport(result: RegressionTestResult): string {
    const lines: string[] = [];
    lines.push('=== Regression Test Report ===');
    lines.push('');
    lines.push(`Test Timestamp: ${result.timestamp.toISOString()}`);
    lines.push(`Baseline Timestamp: ${result.baselineMetrics.timestamp.toISOString()}`);
    lines.push('');
    lines.push('--- Baseline Metrics ---');
    lines.push(`Overall Score: ${result.baselineMetrics.overallScore.toFixed(1)}%`);
    lines.push('');
    lines.push('--- Current Metrics ---');
    lines.push(`Overall Score: ${result.currentMetrics.overallScore.toFixed(1)}%`);
    lines.push('');
    lines.push('--- Score Change ---');
    const scoreChange = result.currentMetrics.overallScore - result.baselineMetrics.overallScore;
    lines.push(`${scoreChange >= 0 ? '+' : ''}${scoreChange.toFixed(1)}%`);
    lines.push('');
    lines.push('--- Regressions ---');
    if (result.regressions.length === 0) {
      lines.push('No regressions detected');
    } else {
      for (const regression of result.regressions) {
        const severityIcon = regression.severity === 'high' ? '🔴' : regression.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`${severityIcon} ${regression.metric}`);
        lines.push(`   Baseline: ${regression.baselineValue.toFixed(2)}`);
        lines.push(`   Current: ${regression.currentValue.toFixed(2)}`);
        lines.push(`   Change: ${regression.changePercent.toFixed(1)}%`);
      }
    }
    lines.push('');
    lines.push('--- Improvements ---');
    if (result.improvements.length === 0) {
      lines.push('No improvements detected');
    } else {
      for (const improvement of result.improvements) {
        lines.push(`✓ ${improvement.metric}`);
        lines.push(`   Baseline: ${improvement.baselineValue.toFixed(2)}`);
        lines.push(`   Current: ${improvement.currentValue.toFixed(2)}`);
        lines.push(`   Change: ${improvement.changePercent.toFixed(1)}%`);
      }
    }
    lines.push('');
    lines.push('--- Summary ---');
    lines.push(result.summary);
    lines.push('');
    lines.push('--- Recommendation ---');
    if (result.regressionDetected) {
      lines.push('⚠️ Regression detected. Review changes before merging.');
      lines.push('Consider reverting or fixing the regressions.');
    } else {
      lines.push('✓ No significant regression. Changes can proceed.');
    }

    return lines.join('\n');
  }

  /**
   * Export baseline as JSON
   */
  exportBaseline(): string {
    if (!this.baseline) {
      throw new Error('No baseline set');
    }
    return JSON.stringify(this.baseline, null, 2);
  }

  /**
   * Import baseline from JSON
   */
  importBaseline(json: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(json);
      
      this.baseline = {
        timestamp: new Date(data.timestamp),
        metrics: data.metrics,
        benchmarkSummary: data.benchmarkSummary,
        errorAnalysis: data.errorAnalysis,
      };

      console.log('[RegressionTester] Baseline imported');

      return {
        success: true,
        message: 'Baseline imported successfully',
      };
    } catch (error) {
      console.error('[RegressionTester] Failed to import baseline:', error);
      return {
        success: false,
        message: 'Failed to parse JSON data',
      };
    }
  }

  /**
   * Get regression threshold
   */
  getRegressionThreshold(): number {
    return this.regressionThreshold;
  }

  /**
   * Check if regression test should fail based on result
   */
  shouldFail(result: RegressionTestResult): boolean {
    return result.regressionDetected;
  }
}
