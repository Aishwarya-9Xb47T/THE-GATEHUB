/**
 * Debugging Tools
 * Visualization and debugging utilities for the Document Intelligence Engine
 */

import { DocumentGraph } from '../DocumentGraph.js';
import { QuestionObject, DocumentObject } from '../types.js';

export interface DebugVisualization {
  type: 'graph' | 'question' | 'reasoning' | 'timeline';
  format: 'text' | 'json' | 'html';
  data: any;
}

export class DebuggingTools {
  /**
   * Visualize document graph as text
   */
  visualizeGraph(graph: DocumentGraph): string {
    const lines: string[] = [];
    lines.push('=== Document Graph Visualization ===');
    lines.push('');

    const nodes = graph.getAllNodes();
    lines.push(`Total Nodes: ${nodes.length}`);
    lines.push('');

    // Group by type
    const nodesByType = new Map<string, DocumentObject[]>();
    for (const node of nodes) {
      if (!nodesByType.has(node.type)) {
        nodesByType.set(node.type, []);
      }
      nodesByType.get(node.type)!.push(node);
    }

    for (const [type, typeNodes] of Array.from(nodesByType.entries()).sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`${type}: ${typeNodes.length} nodes`);
      for (const node of typeNodes.slice(0, 5)) {
        lines.push(`  - ${node.id}: ${node.content?.substring(0, 40) || 'no content'}...`);
      }
      if (typeNodes.length > 5) {
        lines.push(`  ... and ${typeNodes.length - 5} more`);
      }
      lines.push('');
    }

    // Show relationships
    lines.push('=== Relationships ===');
    const relationships = graph.getAllRelationships();
    lines.push(`Total Relationships: ${relationships.length}`);
    lines.push('');

    const relsByType = new Map<string, typeof relationships>();
    for (const rel of relationships) {
      if (!relsByType.has(rel.type)) {
        relsByType.set(rel.type, []);
      }
      relsByType.get(rel.type)!.push(rel);
    }

    for (const [type, typeRels] of relsByType.entries()) {
      lines.push(`${type}: ${typeRels.length} relationships`);
      for (const rel of typeRels.slice(0, 3)) {
        lines.push(`  - ${rel.from} → ${rel.to} (${rel.confidence.toFixed(2)})`);
      }
      if (typeRels.length > 3) {
        lines.push(`  ... and ${typeRels.length - 3} more`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Visualize question details
   */
  visualizeQuestion(question: QuestionObject): string {
    const lines: string[] = [];
    lines.push('=== Question Details ===');
    lines.push('');
    lines.push(`ID: ${question.id}`);
    lines.push(`Type: ${question.type}`);
    lines.push(`Page: ${question.sourcePage}`);
    lines.push('');
    lines.push('--- Statement ---');
    lines.push(question.statement);
    lines.push('');
    lines.push('--- Context ---');
    lines.push(`Paragraphs: ${question.context.paragraphs.length}`);
    lines.push(`Diagrams: ${question.context.diagrams.length}`);
    lines.push(`Tables: ${question.context.tables.length}`);
    lines.push('');
    lines.push('--- Options ---');
    if (question.options) {
      for (const option of question.options) {
        lines.push(`${option.marker}: ${option.text}`);
      }
    } else {
      lines.push('No options');
    }
    lines.push('');
    lines.push('--- Metadata ---');
    lines.push(`Difficulty: ${question.metadata.difficulty}`);
    lines.push(`Topic: ${question.metadata.topic}`);
    lines.push(`Subtopic: ${question.metadata.subtopic || 'N/A'}`);
    lines.push(`Bloom Level: ${question.metadata.bloomLevel}`);
    lines.push(`Skills: ${question.metadata.skills.join(', ')}`);
    lines.push('');
    lines.push('--- Confidence ---');
    lines.push(`OCR: ${question.confidence.ocr.toFixed(2)}`);
    lines.push(`Layout: ${question.confidence.layout.toFixed(2)}`);
    lines.push(`Question Boundary: ${question.confidence.questionBoundary.toFixed(2)}`);
    lines.push(`Options: ${question.confidence.options.toFixed(2)}`);
    lines.push(`Answer: ${question.confidence.answer.toFixed(2)}`);
    lines.push(`Semantic: ${question.confidence.semantic.toFixed(2)}`);
    lines.push(`Overall: ${question.confidence.overall.toFixed(2)}`);
    lines.push('');
    lines.push('--- Reasoning ---');
    lines.push(`Decision: ${question.reasoning.decision}`);
    lines.push(`Confidence: ${question.reasoning.confidence.toFixed(2)}`);
    lines.push('');
    lines.push('Evidence:');
    for (const evidence of question.reasoning.evidence) {
      lines.push(`  - ${evidence.type}: ${JSON.stringify(evidence.value)} (${evidence.confidence.toFixed(2)})`);
    }
    lines.push('');
    lines.push('--- Validation ---');
    lines.push(`Valid: ${question.validation.isValid}`);
    lines.push(`Issues: ${question.validation.issues.join(', ') || 'None'}`);
    lines.push(`Warnings: ${question.validation.warnings.join(', ') || 'None'}`);
    lines.push('');
    lines.push('--- Repair History ---');
    if (question.repairHistory.length > 0) {
      for (const repair of question.repairHistory) {
        lines.push(`  [${repair.timestamp.toISOString()}] ${repair.type}: ${repair.description}`);
      }
    } else {
      lines.push('No repairs');
    }

    return lines.join('\n');
  }

  /**
   * Visualize reasoning tree
   */
  visualizeReasoning(question: QuestionObject): string {
    const lines: string[] = [];
    lines.push('=== Reasoning Tree ===');
    lines.push('');
    lines.push(`Decision: ${question.reasoning.decision}`);
    lines.push(`Confidence: ${question.reasoning.confidence.toFixed(2)}`);
    lines.push('');
    lines.push('Evidence:');
    for (const evidence of question.reasoning.evidence) {
      lines.push(`  ├─ ${evidence.type}: ${JSON.stringify(evidence.value)} (${evidence.confidence.toFixed(2)})`);
    }
    lines.push('');
    lines.push('Alternatives:');
    if (question.reasoning.alternatives.length > 0) {
      for (const alt of question.reasoning.alternatives) {
        lines.push(`  ├─ ${alt.decision} (${alt.confidence.toFixed(2)}): ${alt.reason}`);
      }
    } else {
      lines.push('  └─ No alternatives');
    }

    return lines.join('\n');
  }

  /**
   * Visualize processing timeline
   */
  visualizeTimeline(history: Array<{
    phase: string;
    timestamp: Date;
    success: boolean;
    duration: number;
    metadata?: Record<string, any>;
  }>): string {
    const lines: string[] = [];
    lines.push('=== Processing Timeline ===');
    lines.push('');

    let totalDuration = 0;
    for (const entry of history) {
      totalDuration += entry.duration;
    }

    lines.push(`Total Duration: ${totalDuration}ms`);
    lines.push(`Total Phases: ${history.length}`);
    lines.push('');

    for (const entry of history) {
      const status = entry.success ? '✓' : '✗';
      lines.push(`${status} ${entry.phase} (${entry.duration}ms)`);
      if (entry.metadata) {
        for (const [key, value] of Object.entries(entry.metadata)) {
          lines.push(`    ${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Export graph as JSON
   */
  exportGraphAsJSON(graph: DocumentGraph): string {
    return JSON.stringify(graph.toSerializable(), null, 2);
  }

  /**
   * Export questions as JSON
   */
  exportQuestionsAsJSON(questions: QuestionObject[]): string {
    return JSON.stringify(questions, null, 2);
  }

  /**
   * Compare two extractions
   */
  compareExtractions(extraction1: QuestionObject[], extraction2: QuestionObject[]): string {
    const lines: string[] = [];
    lines.push('=== Extraction Comparison ===');
    lines.push('');

    const count1 = extraction1.length;
    const count2 = extraction2.length;
    lines.push(`Extraction 1: ${count1} questions`);
    lines.push(`Extraction 2: ${count2} questions`);
    lines.push(`Difference: ${Math.abs(count1 - count2)} questions`);
    lines.push('');

    // Find common questions by statement similarity
    const common: Array<{ id1: string; id2: string; similarity: number }> = [];
    const onlyIn1: QuestionObject[] = [];
    const onlyIn2: QuestionObject[] = [];

    for (const q1 of extraction1) {
      let found = false;
      for (const q2 of extraction2) {
        const similarity = this.calculateSimilarity(q1.statement, q2.statement);
        if (similarity > 0.8) {
          common.push({ id1: q1.id, id2: q2.id, similarity });
          found = true;
          break;
        }
      }
      if (!found) {
        onlyIn1.push(q1);
      }
    }

    for (const q2 of extraction2) {
      let found = false;
      for (const q1 of extraction1) {
        const similarity = this.calculateSimilarity(q1.statement, q2.statement);
        if (similarity > 0.8) {
          found = true;
          break;
        }
      }
      if (!found) {
        onlyIn2.push(q2);
      }
    }

    lines.push(`Common Questions: ${common.length}`);
    lines.push(`Only in Extraction 1: ${onlyIn1.length}`);
    lines.push(`Only in Extraction 2: ${onlyIn2.length}`);
    lines.push('');

    if (onlyIn1.length > 0) {
      lines.push('--- Only in Extraction 1 ---');
      for (const q of onlyIn1.slice(0, 5)) {
        lines.push(`  - ${q.id}: ${q.statement.substring(0, 50)}...`);
      }
      if (onlyIn1.length > 5) {
        lines.push(`  ... and ${onlyIn1.length - 5} more`);
      }
      lines.push('');
    }

    if (onlyIn2.length > 0) {
      lines.push('--- Only in Extraction 2 ---');
      for (const q of onlyIn2.slice(0, 5)) {
        lines.push(`  - ${q.id}: ${q.statement.substring(0, 50)}...`);
      }
      if (onlyIn2.length > 5) {
        lines.push(`  ... and ${onlyIn2.length - 5} more`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Calculate similarity between two strings (Jaccard)
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
   * Generate HTML visualization
   */
  generateHTMLVisualization(questions: QuestionObject[]): string {
    let html = '<html><head><title>Document Intelligence Debug</title>';
    html += '<style>';
    html += 'body { font-family: Arial, sans-serif; padding: 20px; }';
    html += '.question { border: 1px solid #ccc; padding: 15px; margin: 10px 0; border-radius: 5px; }';
    html += '.question.high-confidence { border-color: green; }';
    html += '.question.medium-confidence { border-color: orange; }';
    html += '.question.low-confidence { border-color: red; }';
    html += '.statement { font-weight: bold; margin-bottom: 10px; }';
    html += '.options { margin-left: 20px; }';
    html += '.option { margin: 5px 0; }';
    html += '.confidence { font-size: 0.8em; color: #666; }';
    html += '</style></head><body>';
    html += '<h1>Document Intelligence Debug</h1>';
    html += `<p>Total Questions: ${questions.length}</p>`;

    for (const question of questions) {
      const confidenceClass = question.confidence.overall > 0.8 ? 'high-confidence' :
                               question.confidence.overall > 0.6 ? 'medium-confidence' : 'low-confidence';
      
      html += `<div class="question ${confidenceClass}">`;
      html += `<div class="statement">${question.statement}</div>`;
      
      if (question.options) {
        html += '<div class="options">';
        for (const option of question.options) {
          html += `<div class="option">${option.marker}. ${option.text}</div>`;
        }
        html += '</div>';
      }
      
      html += `<div class="confidence">Confidence: ${(question.confidence.overall * 100).toFixed(1)}%</div>`;
      html += '</div>';
    }

    html += '</body></html>';
    return html;
  }

  /**
   * Generate summary statistics
   */
  generateSummary(questions: QuestionObject[]): string {
    const lines: string[] = [];
    lines.push('=== Extraction Summary ===');
    lines.push('');

    const totalQuestions = questions.length;
    const avgConfidence = questions.reduce((sum, q) => sum + q.confidence.overall, 0) / totalQuestions;

    const typeDistribution: Record<string, number> = {};
    const difficultyDistribution: Record<string, number> = {};

    for (const question of questions) {
      typeDistribution[question.type] = (typeDistribution[question.type] || 0) + 1;
      difficultyDistribution[question.metadata.difficulty] = (difficultyDistribution[question.metadata.difficulty] || 0) + 1;
    }

    lines.push(`Total Questions: ${totalQuestions}`);
    lines.push(`Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('--- Type Distribution ---');
    for (const [type, count] of Object.entries(typeDistribution)) {
      lines.push(`${type}: ${count} (${(count / totalQuestions * 100).toFixed(1)}%)`);
    }
    lines.push('');
    lines.push('--- Difficulty Distribution ---');
    for (const [difficulty, count] of Object.entries(difficultyDistribution)) {
      lines.push(`${difficulty}: ${count} (${(count / totalQuestions * 100).toFixed(1)}%)`);
    }

    return lines.join('\n');
  }

  /**
   * Trace a specific question through the pipeline
   */
  traceQuestion(questionId: string, questions: QuestionObject[]): string {
    const question = questions.find(q => q.id === questionId);
    if (!question) {
      return `Question ${questionId} not found`;
    }

    return this.visualizeQuestion(question);
  }
}
