/**
 * Feedback Collector & Learning System
 * Captures anonymized correction feedback when instructors adjust boundaries,
 * option correctness, attachment assignments, or question classifications in Quiz Builder.
 */

import fs from 'fs';
import path from 'path';

export interface CorrectionFeedback {
  id: string;
  timestamp: string;
  originalBlockId: string;
  correctionType: 'boundary_adjustment' | 'option_edit' | 'attachment_reassignment' | 'classification_fix';
  originalValue: any;
  correctedValue: any;
  confidenceScore: number;
  sourceType: string;
}

export class FeedbackCollector {
  private static feedbackLogPath = path.resolve(process.cwd(), 'logs/import_corrections.jsonl');

  /**
   * Log correction feedback entry
   */
  static logCorrection(feedback: Omit<CorrectionFeedback, 'id' | 'timestamp'>): void {
    try {
      const entry: CorrectionFeedback = {
        id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        ...feedback,
      };

      const dir = path.dirname(this.feedbackLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.appendFileSync(this.feedbackLogPath, JSON.stringify(entry) + '\n', 'utf-8');
      console.log('[FeedbackCollector] Logged correction entry:', entry.id);
    } catch (error) {
      console.error('[FeedbackCollector] Failed to log correction:', error);
    }
  }

  /**
   * Read recent correction feedback
   */
  static getRecentFeedback(limit: number = 50): CorrectionFeedback[] {
    try {
      if (!fs.existsSync(this.feedbackLogPath)) return [];
      const lines = fs.readFileSync(this.feedbackLogPath, 'utf-8').split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => JSON.parse(l));
    } catch (error) {
      console.error('[FeedbackCollector] Failed to read feedback:', error);
      return [];
    }
  }
}
