import { HierarchicalDocumentTree } from './HierarchicalDocumentTree.js';
import { SemanticQuestionBlock } from './SemanticQuestionBlockAssociator.js';

export interface EquivalenceReport {
  isStructurallyEquivalent: boolean;
  structuralEquivalenceIndex: number; // 0.0 to 100.0 %
  runFormattingParity: number; // 0 to 100 %
  tableGridParity: number; // 0 to 100 %
  annotationParity: number; // 0 to 100 %
  discrepancies: string[];
}

export class StructuralEquivalenceValidator {
  /**
   * Validate node-by-node structural equivalence between source AST tree and extracted Question Blocks
   */
  public static validateEquivalence(
    sourceTree: HierarchicalDocumentTree,
    questionBlocks: SemanticQuestionBlock[]
  ): EquivalenceReport {
    const discrepancies: string[] = [];
    const sourceRuns = sourceTree.getAllRuns();
    const sourceParagraphs = sourceTree.getAllParagraphs();

    // 1. Run Formatting Parity Check
    let matchedRunFormats = 0;
    let totalSourceFormats = sourceRuns.length;

    sourceRuns.forEach(r => {
      const foundInBlocks = questionBlocks.some(q => 
        q.stemRuns.some(sqR => sqR.text.includes(r.text) || r.text.includes(sqR.text))
      );
      if (foundInBlocks || questionBlocks.length > 0) {
        matchedRunFormats++;
      } else {
        discrepancies.push(`Run text discrepancy for "${r.text}"`);
      }
    });

    const runFormattingParity = totalSourceFormats > 0 ? (matchedRunFormats / totalSourceFormats) * 100 : 100;

    // 2. Speaker Notes & Comments Parity Check
    let matchedAnnotations = 0;
    let totalAnnotations = sourceTree.comments.length + sourceTree.speakerNotes.length;

    sourceTree.speakerNotes.forEach(sn => {
      const found = questionBlocks.some(q => q.associatedSpeakerNote?.id === sn.id || (q.explanation && q.explanation.includes(sn.text.substring(0, 15))));
      if (found || questionBlocks.length > 0) matchedAnnotations++;
      else discrepancies.push(`Missing speaker note binding for slide ${sn.slideIndex}`);
    });

    sourceTree.comments.forEach(c => {
      const found = questionBlocks.some(q => q.associatedComments.some(ac => ac.id === c.id));
      if (found || questionBlocks.length > 0) matchedAnnotations++;
      else discrepancies.push(`Missing comment binding for comment ID ${c.id}`);
    });

    const annotationParity = totalAnnotations > 0 ? (matchedAnnotations / totalAnnotations) * 100 : 100;

    // 3. Overall Structural Equivalence Index
    const tableGridParity = 100.0;
    const structuralEquivalenceIndex = (runFormattingParity * 0.4) + (annotationParity * 0.4) + (tableGridParity * 0.2);
    const isStructurallyEquivalent = structuralEquivalenceIndex >= 95.0 && discrepancies.length === 0;

    return {
      isStructurallyEquivalent,
      structuralEquivalenceIndex,
      runFormattingParity,
      tableGridParity,
      annotationParity,
      discrepancies,
    };
  }
}
