/**
 * Metadata Preserver
 * Extracts and preserves educational metadata (Marks, Difficulty, Bloom Level, Hints, Rubrics, Sections).
 */

import { EducationalObjectGraph, EducationalNode } from './EducationalObjectGraph.js';

export class MetadataPreserver {
  static preserve(eog: EducationalObjectGraph): EducationalObjectGraph {
    console.log('[MetadataPreserver] Preserving educational metadata across graph nodes');

    const questions = eog.getNodesByType('Question');

    for (const q of questions) {
      const content = q.content || '';
      
      // Preserve Marks
      if (!q.metadata.marks) {
        const markMatch = content.match(/\[(?:Marks|Points?|Score):\s*(\d+)\]|\((\d+)\s*marks?\)/i);
        if (markMatch) {
          q.metadata.marks = parseInt(markMatch[1] || markMatch[2], 10);
        } else {
          q.metadata.marks = 1;
        }
      }

      // Preserve Difficulty
      if (!q.metadata.difficulty) {
        if (/\[Difficulty:\s*(easy|medium|hard)\]/i.test(content)) {
          const match = content.match(/\[Difficulty:\s*(easy|medium|hard)\]/i);
          q.metadata.difficulty = match![1].toLowerCase();
        } else {
          q.metadata.difficulty = 'medium';
        }
      }

      // Preserve Bloom's Level
      if (!q.metadata.bloomLevel) {
        const bloomMatch = content.match(/\[Bloom:\s*(L[1-6])\]/i);
        if (bloomMatch) {
          q.metadata.bloomLevel = bloomMatch[1].toUpperCase();
        } else {
          q.metadata.bloomLevel = 'L2';
        }
      }

      // Preserve Estimated Time
      if (!q.metadata.estimatedTimeSeconds) {
        q.metadata.estimatedTimeSeconds = 60;
      }
    }

    console.log('[MetadataPreserver] Completed metadata preservation');
    return eog;
  }
}
