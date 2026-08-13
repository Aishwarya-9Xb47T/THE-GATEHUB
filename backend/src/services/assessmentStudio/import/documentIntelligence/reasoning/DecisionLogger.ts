/**
 * Decision Logger
 * Detailed logging of all decisions made during extraction
 * Provides audit trail for debugging and analysis
 */

export interface DecisionLogEntry {
  id: string;
  timestamp: Date;
  agent: string;
  phase: string;
  decisionType: string;
  decision: string;
  confidence: number;
  evidence: Array<{
    type: string;
    value: any;
    confidence: number;
  }>;
  alternatives: Array<{
    decision: string;
    confidence: number;
    reason: string;
  }>;
  context: {
    questionId?: string;
    documentPage?: number;
    nodeId?: string;
    additionalInfo?: Record<string, any>;
  };
  outcome?: {
    success: boolean;
    finalDecision?: string;
    reason?: string;
  };
}

export class DecisionLogger {
  private logs: DecisionLogEntry[];
  private logIndex: number;
  private enabled: boolean;

  constructor() {
    this.logs = [];
    this.logIndex = 0;
    this.enabled = true;
  }

  /**
   * Log a decision
   */
  logDecision(entry: Omit<DecisionLogEntry, 'id' | 'timestamp'>): DecisionLogEntry {
    if (!this.enabled) {
      const entryWithId: DecisionLogEntry = {
        ...entry,
        id: `decision_${this.logIndex++}`,
        timestamp: new Date(),
      };
      return entryWithId;
    }

    const logEntry: DecisionLogEntry = {
      ...entry,
      id: `decision_${this.logIndex++}`,
      timestamp: new Date(),
    };

    this.logs.push(logEntry);
    console.log(`[DecisionLogger] [${entry.agent}] ${entry.phase}: ${entry.decision} (${entry.confidence.toFixed(2)})`);

    return logEntry;
  }

  /**
   * Log a question classification decision
   */
  logQuestionClassification(
    agent: string,
    questionId: string,
    decision: string,
    confidence: number,
    evidence: Array<{ type: string; value: any; confidence: number }>
  ): DecisionLogEntry {
    return this.logDecision({
      agent,
      phase: 'classification',
      decisionType: 'question_type',
      decision,
      confidence,
      evidence,
      alternatives: [],
      context: { questionId },
    });
  }

  /**
   * Log a boundary detection decision
   */
  logBoundaryDetection(
    agent: string,
    nodeId: string,
    documentPage: number,
    decision: string,
    confidence: number,
    evidence: Array<{ type: string; value: any; confidence: number }>
  ): DecisionLogEntry {
    return this.logDecision({
      agent,
      phase: 'boundary_detection',
      decisionType: 'question_boundary',
      decision,
      confidence,
      evidence,
      alternatives: [],
      context: { nodeId, documentPage },
    });
  }

  /**
   * Log an option collection decision
   */
  logOptionCollection(
    agent: string,
    questionId: string,
    decision: string,
    confidence: number,
    evidence: Array<{ type: string; value: any; confidence: number }>
  ): DecisionLogEntry {
    return this.logDecision({
      agent,
      phase: 'option_collection',
      decisionType: 'option_association',
      decision,
      confidence,
      evidence,
      alternatives: [],
      context: { questionId },
    });
  }

  /**
   * Log a validation decision
   */
  logValidation(
    agent: string,
    questionId: string,
    decision: string,
    confidence: number,
    outcome: { success: boolean; reason?: string }
  ): DecisionLogEntry {
    return this.logDecision({
      agent,
      phase: 'validation',
      decisionType: 'validation_check',
      decision,
      confidence,
      evidence: [],
      alternatives: [],
      context: { questionId },
      outcome,
    });
  }

  /**
   * Log a repair decision
   */
  logRepair(
    agent: string,
    questionId: string,
    decision: string,
    confidence: number,
    outcome: { success: boolean; finalDecision?: string; reason?: string }
  ): DecisionLogEntry {
    return this.logDecision({
      agent,
      phase: 'repair',
      decisionType: 'repair_operation',
      decision,
      confidence,
      evidence: [],
      alternatives: [],
      context: { questionId },
      outcome,
    });
  }

  /**
   * Get all logs
   */
  getLogs(): DecisionLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by agent
   */
  getLogsByAgent(agent: string): DecisionLogEntry[] {
    return this.logs.filter(log => log.agent === agent);
  }

  /**
   * Get logs by phase
   */
  getLogsByPhase(phase: string): DecisionLogEntry[] {
    return this.logs.filter(log => log.phase === phase);
  }

  /**
   * Get logs by question
   */
  getLogsByQuestion(questionId: string): DecisionLogEntry[] {
    return this.logs.filter(log => log.context.questionId === questionId);
  }

  /**
   * Get logs by decision type
   */
  getLogsByDecisionType(decisionType: string): DecisionLogEntry[] {
    return this.logs.filter(log => log.decisionType === decisionType);
  }

  /**
   * Get logs in time range
   */
  getLogsInTimeRange(start: Date, end: Date): DecisionLogEntry[] {
    return this.logs.filter(log => log.timestamp >= start && log.timestamp <= end);
  }

  /**
   * Get low confidence decisions
   */
  getLowConfidenceDecisions(threshold: number = 0.6): DecisionLogEntry[] {
    return this.logs.filter(log => log.confidence < threshold);
  }

  /**
   * Get failed decisions
   */
  getFailedDecisions(): DecisionLogEntry[] {
    return this.logs.filter(log => log.outcome && !log.outcome.success);
  }

  /**
   * Get decision statistics
   */
  getStatistics(): {
    totalDecisions: number;
    decisionsByAgent: Record<string, number>;
    decisionsByPhase: Record<string, number>;
    decisionsByType: Record<string, number>;
    averageConfidence: number;
    lowConfidenceCount: number;
    failedDecisionCount: number;
  } {
    const decisionsByAgent: Record<string, number> = {};
    const decisionsByPhase: Record<string, number> = {};
    const decisionsByType: Record<string, number> = {};
    let totalConfidence = 0;
    let lowConfidenceCount = 0;
    let failedDecisionCount = 0;

    for (const log of this.logs) {
      decisionsByAgent[log.agent] = (decisionsByAgent[log.agent] || 0) + 1;
      decisionsByPhase[log.phase] = (decisionsByPhase[log.phase] || 0) + 1;
      decisionsByType[log.decisionType] = (decisionsByType[log.decisionType] || 0) + 1;
      totalConfidence += log.confidence;

      if (log.confidence < 0.6) {
        lowConfidenceCount++;
      }

      if (log.outcome && !log.outcome.success) {
        failedDecisionCount++;
      }
    }

    return {
      totalDecisions: this.logs.length,
      decisionsByAgent,
      decisionsByPhase,
      decisionsByType,
      averageConfidence: this.logs.length > 0 ? totalConfidence / this.logs.length : 0,
      lowConfidenceCount,
      failedDecisionCount,
    };
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Import logs from JSON
   */
  importLogs(json: string): { success: boolean; message: string } {
    try {
      const logs = JSON.parse(json) as DecisionLogEntry[];
      this.logs = logs;
      this.logIndex = logs.length;
      console.log(`[DecisionLogger] Imported ${logs.length} log entries`);
      return {
        success: true,
        message: `Imported ${logs.length} log entries`,
      };
    } catch (error) {
      console.error('[DecisionLogger] Failed to import logs:', error);
      return {
        success: false,
        message: 'Failed to parse JSON data',
      };
    }
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
    this.logIndex = 0;
    console.log('[DecisionLogger] Logs cleared');
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[DecisionLogger] Logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Generate decision timeline
   */
  generateTimeline(): string {
    const lines: string[] = [];
    lines.push('=== Decision Timeline ===');
    lines.push('');

    for (const log of this.logs) {
      const time = log.timestamp.toISOString();
      const status = log.outcome ? (log.outcome.success ? '✓' : '✗') : '-';
      lines.push(`[${time}] ${status} [${log.agent}] ${log.phase}: ${log.decision} (${log.confidence.toFixed(2)})`);
    }

    return lines.join('\n');
  }

  /**
   * Generate decision summary
   */
  generateSummary(): string {
    const stats = this.getStatistics();
    const lines: string[] = [];
    lines.push('=== Decision Summary ===');
    lines.push('');
    lines.push(`Total Decisions: ${stats.totalDecisions}`);
    lines.push(`Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
    lines.push(`Low Confidence Decisions: ${stats.lowConfidenceCount}`);
    lines.push(`Failed Decisions: ${stats.failedDecisionCount}`);
    lines.push('');
    lines.push('--- By Agent ---');
    for (const [agent, count] of Object.entries(stats.decisionsByAgent)) {
      lines.push(`${agent}: ${count}`);
    }
    lines.push('');
    lines.push('--- By Phase ---');
    for (const [phase, count] of Object.entries(stats.decisionsByPhase)) {
      lines.push(`${phase}: ${count}`);
    }
    lines.push('');
    lines.push('--- By Decision Type ---');
    for (const [type, count] of Object.entries(stats.decisionsByType)) {
      lines.push(`${type}: ${count}`);
    }

    return lines.join('\n');
  }

  /**
   * Trace question decisions
   */
  traceQuestion(questionId: string): string {
    const questionLogs = this.getLogsByQuestion(questionId);
    const lines: string[] = [];
    lines.push(`=== Decision Trace for Question ${questionId} ===`);
    lines.push('');

    if (questionLogs.length === 0) {
      lines.push('No decisions logged for this question');
      return lines.join('\n');
    }

    for (const log of questionLogs) {
      lines.push(`[${log.phase}] ${log.agent}: ${log.decision} (${log.confidence.toFixed(2)})`);
      if (log.evidence.length > 0) {
        lines.push('  Evidence:');
        for (const evidence of log.evidence) {
          lines.push(`    - ${evidence.type}: ${JSON.stringify(evidence.value)} (${evidence.confidence.toFixed(2)})`);
        }
      }
      if (log.outcome) {
        lines.push(`  Outcome: ${log.outcome.success ? 'Success' : 'Failed'}`);
        if (log.outcome.reason) {
          lines.push(`  Reason: ${log.outcome.reason}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
