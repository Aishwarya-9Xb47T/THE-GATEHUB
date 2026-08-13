/**
 * Performance monitor — tracks renderer load and transition times.
 */

import { RENDERER_PERFORMANCE_TARGETS } from "../types/renderer";

export interface PerformanceMetric {
  name: string;
  durationMs: number;
  timestamp: number;
  withinTarget: boolean;
}

const TARGETS: Record<string, number> = {
  initial_render: RENDERER_PERFORMANCE_TARGETS.initialRenderMs,
  question_transition: RENDERER_PERFORMANCE_TARGETS.questionTransitionMs,
  renderer_load: RENDERER_PERFORMANCE_TARGETS.rendererLoadMs,
};

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private marks = new Map<string, number>();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string): PerformanceMetric {
    const start = this.marks.get(startMark) ?? performance.now();
    const durationMs = performance.now() - start;
    const target = TARGETS[name] ?? Infinity;
    const metric: PerformanceMetric = {
      name,
      durationMs,
      timestamp: performance.now(),
      withinTarget: durationMs <= target,
    };
    this.metrics.push(metric);
    if (this.metrics.length > 100) this.metrics.shift();
    return metric;
  }

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getSummary(): Record<string, { avg: number; p95: number; withinTarget: boolean }> {
    const grouped = new Map<string, number[]>();
    for (const m of this.metrics) {
      if (!grouped.has(m.name)) grouped.set(m.name, []);
      grouped.get(m.name)!.push(m.durationMs);
    }
    const summary: Record<string, { avg: number; p95: number; withinTarget: boolean }> = {};
    for (const [name, values] of grouped) {
      const sorted = [...values].sort((a, b) => a - b);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
      const target = TARGETS[name] ?? Infinity;
      summary[name] = { avg, p95, withinTarget: p95 <= target };
    }
    return summary;
  }
}

export function createPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitor();
}
