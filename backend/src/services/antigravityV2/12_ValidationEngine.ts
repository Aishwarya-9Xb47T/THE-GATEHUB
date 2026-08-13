import { V2ValidationResult, AntiGravityV2Result } from './types.js';

export interface V2ExpectedMetrics {
  minPages?: number;
  minParagraphs?: number;
  minTables?: number;
  minCodeBlocks?: number;
  minEquations?: number;
  minDiagrams?: number;
  minQuestions?: number;
  minSpeakerNotes?: boolean;
}

export class ValidationEngine {
  /**
   * Zero-placeholder compliance auditor & metric completeness validator
   */
  public static validate(result: Partial<AntiGravityV2Result>, expected?: V2ExpectedMetrics): V2ValidationResult {
    const discrepancies: string[] = [];
    const placeholderMatches: string[] = [];

    // Zero-placeholder audit
    const str = JSON.stringify(result);
    const forbidden = ['[placeholder]', 'dummy data', 'sample question stem', 'mock_question', 'undefined_stem', '[empty]'];
    forbidden.forEach(ph => {
      if (str.toLowerCase().includes(ph)) {
        placeholderMatches.push(ph);
        discrepancies.push(`CRITICAL: System placeholder token "${ph}" found in extracted V2 output!`);
      }
    });

    const actual = {
      pages: result.document?.pageCount || 0,
      blocks: result.blocks?.length || 0,
      tables: result.tables?.length || 0,
      codeBlocks: result.codeBlocks?.length || 0,
      equations: result.equations?.length || 0,
      diagrams: result.diagrams?.length || 0,
      questions: result.questions?.length || 0,
    };

    const expMap: Record<string, number> = expected ? (expected as any) : {};
    let totalChecks = 0;
    let passedChecks = 0;

    if (expected) {
      if (expected.minPages !== undefined) { totalChecks++; if (actual.pages >= expected.minPages) passedChecks++; else discrepancies.push(`Pages mismatch: Expected ${expected.minPages}, got ${actual.pages}`); }
      if (expected.minTables !== undefined) { totalChecks++; if (actual.tables >= expected.minTables) passedChecks++; else discrepancies.push(`Tables mismatch: Expected ${expected.minTables}, got ${actual.tables}`); }
      if (expected.minCodeBlocks !== undefined) { totalChecks++; if (actual.codeBlocks >= expected.minCodeBlocks) passedChecks++; else discrepancies.push(`Code mismatch: Expected ${expected.minCodeBlocks}, got ${actual.codeBlocks}`); }
      if (expected.minEquations !== undefined) { totalChecks++; if (actual.equations >= expected.minEquations) passedChecks++; else discrepancies.push(`Math mismatch: Expected ${expected.minEquations}, got ${actual.equations}`); }
      if (expected.minQuestions !== undefined) { totalChecks++; if (actual.questions >= expected.minQuestions) passedChecks++; else discrepancies.push(`Questions mismatch: Expected ${expected.minQuestions}, got ${actual.questions}`); }
    }

    const accuracyScore = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;
    const passed = accuracyScore === 100 && placeholderMatches.length === 0;

    return {
      passed,
      accuracyScore,
      isStructurallyEquivalent: passed,
      placeholderFound: placeholderMatches.length > 0,
      placeholderMatches,
      discrepancies,
      metrics: {
        expected: expMap,
        actual,
      },
    };
  }
}
