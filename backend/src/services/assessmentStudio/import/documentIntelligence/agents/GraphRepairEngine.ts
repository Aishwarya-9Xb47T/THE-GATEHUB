/**
 * Graph Repair Engine
 * Scans Educational Object Graph before assembly to repair orphan attachments,
 * re-assign unlinked media, tables, code blocks, and formulas, and resolve boundary ambiguities.
 */

import { EducationalObjectGraph, EducationalNode } from '../EducationalObjectGraph.js';

export interface RepairResult {
  repairedGraph: EducationalObjectGraph;
  repairsApplied: number;
  repairLogs: string[];
}

export class GraphRepairEngine {
  static repair(eog: EducationalObjectGraph): RepairResult {
    console.log('[GraphRepairEngine] Starting Educational Object Graph repair phase');

    let repairsApplied = 0;
    const repairLogs: string[] = [];

    const nodes = eog.getAllNodes();
    const questions = eog.getNodesByType('Question');

    // 1. Repair Orphan Tables
    const tables = eog.getNodesByType('Table');
    for (const table of tables) {
      const hasOwner = eog.getEdgesFrom(table.id).some(e => e.relationship === 'references_table');
      if (!hasOwner && questions.length > 0) {
        const nearestQ = this.findClosestQuestion(table, questions, nodes);
        if (nearestQ) {
          eog.addEdge({
            id: `repair_table_${table.id}_${nearestQ.id}`,
            sourceId: table.id,
            targetId: nearestQ.id,
            relationship: 'references_table',
            confidence: 0.88,
          });
          repairsApplied++;
          repairLogs.push(`Re-bound orphan table ${table.id} to Question ${nearestQ.id}`);
        }
      }
    }

    // 2. Repair Orphan Equations / Formulas
    const equations = eog.getNodesByType('Equation');
    for (const eq of equations) {
      const hasOwner = eog.getEdgesFrom(eq.id).some(e => e.relationship === 'references_equation');
      if (!hasOwner && questions.length > 0) {
        const nearestQ = this.findClosestQuestion(eq, questions, nodes);
        if (nearestQ) {
          eog.addEdge({
            id: `repair_eq_${eq.id}_${nearestQ.id}`,
            sourceId: eq.id,
            targetId: nearestQ.id,
            relationship: 'references_equation',
            confidence: 0.88,
          });
          repairsApplied++;
          repairLogs.push(`Re-bound orphan equation ${eq.id} to Question ${nearestQ.id}`);
        }
      }
    }

    // 3. Repair Orphan Code Blocks
    const codeBlocks = eog.getNodesByType('CodeBlock');
    for (const code of codeBlocks) {
      const hasOwner = eog.getEdgesFrom(code.id).some(e => e.relationship === 'attached_to');
      if (!hasOwner && questions.length > 0) {
        const nearestQ = this.findClosestQuestion(code, questions, nodes);
        if (nearestQ) {
          eog.addEdge({
            id: `repair_code_${code.id}_${nearestQ.id}`,
            sourceId: code.id,
            targetId: nearestQ.id,
            relationship: 'attached_to',
            confidence: 0.88,
          });
          repairsApplied++;
          repairLogs.push(`Re-bound orphan code block ${code.id} to Question ${nearestQ.id}`);
        }
      }
    }

    console.log('[GraphRepairEngine] Repair phase completed', { repairsApplied, logsCount: repairLogs.length });

    return {
      repairedGraph: eog,
      repairsApplied,
      repairLogs,
    };
  }

  private static findClosestQuestion(
    node: EducationalNode,
    questions: EducationalNode[],
    allNodes: EducationalNode[]
  ): EducationalNode | null {
    const nodeIdx = allNodes.findIndex(n => n.id === node.id);
    if (nodeIdx < 0) return questions[0] || null;

    let closest: EducationalNode | null = null;
    let minDistance = Infinity;

    for (const q of questions) {
      const qIdx = allNodes.findIndex(n => n.id === q.id);
      if (qIdx >= 0) {
        const dist = Math.abs(qIdx - nodeIdx);
        if (dist < minDistance) {
          minDistance = dist;
          closest = q;
        }
      }
    }

    return closest;
  }
}
