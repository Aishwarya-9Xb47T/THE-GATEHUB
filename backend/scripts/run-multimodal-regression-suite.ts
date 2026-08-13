import fs from 'fs';
import path from 'path';
import { MultimodalKnowledgeEngine } from '../src/services/multimodalKnowledge/MultimodalKnowledgeEngine.js';
import { ExtractionValidator, ExpectedMetrics, ValidationReport } from '../src/services/multimodalKnowledge/ExtractionValidator.js';
import { generateTestCorpus } from './generate-multimodal-test-corpus.js';

interface TestCase {
  fileName: string;
  expected: ExpectedMetrics;
}

async function runRegressionSuite() {
  console.log('=================================================================');
  console.log('  PRODUCTION-GRADE MULTIMODAL EXTRACTION ENGINE REGRESSION SUITE ');
  console.log('=================================================================\n');

  // Step 1: Ensure test corpus is generated
  await generateTestCorpus();

  const corpusDir = path.resolve('test-corpus');

  const testCases: TestCase[] = [
    {
      fileName: 'quantum_computing.md',
      expected: {
        minPages: 1,
        minParagraphs: 5,
        minTables: 1,
        minCodeBlocks: 1,
        minEquations: 2,
        minDiagrams: 1,
        minQuestions: 2,
        minFlashcards: 2,
      },
    },
    {
      fileName: 'ai_deep_learning.pptx',
      expected: {
        minPages: 1,
        minQuestions: 1,
        requireSpeakerNotes: true,
      },
    },
  ];

  // Also include pre-existing repository DOCX test files if present
  if (fs.existsSync('test-rich-content.docx')) {
    testCases.push({
      fileName: '../test-rich-content.docx',
      expected: {
        minPages: 1,
        minParagraphs: 2,
      },
    });
  }

  let totalPassed = 0;
  let totalTests = testCases.length;
  const suiteReports: Array<{ file: string; report: ValidationReport }> = [];

  for (const tc of testCases) {
    const filePath = path.join(corpusDir, tc.fileName);
    console.log(`\n-----------------------------------------------------------------`);
    console.log(`[TESTING FILE] ${tc.fileName}`);
    console.log(`-----------------------------------------------------------------`);

    if (!fs.existsSync(filePath)) {
      console.error(`[ERROR] File not found: ${filePath}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await MultimodalKnowledgeEngine.process({
      name: path.basename(tc.fileName),
      buffer,
    });

    console.log(`[Engine Result Summary]`, {
      success: result.success,
      sourceType: result.sourceType,
      pages: result.document.pageCount,
      blocks: result.blocks.length,
      tables: result.tables.length,
      codeBlocks: result.codeBlocks.length,
      equations: result.equations.length,
      diagrams: result.diagrams.length,
      questions: result.questions.length,
      flashcards: result.aiEnrichment.flashcards.length,
      processingTimeMs: `${result.processingTimeMs}ms`,
    });

    const validationReport = ExtractionValidator.validate(result, tc.expected);
    suiteReports.push({ file: tc.fileName, report: validationReport });

    console.log(`[Validation Report]`, {
      passed: validationReport.passed,
      accuracyScore: `${validationReport.accuracyScore.toFixed(1)}%`,
      placeholderFound: validationReport.placeholderFound,
      discrepanciesCount: validationReport.discrepancies.length,
    });

    if (validationReport.discrepancies.length > 0) {
      console.warn(`[Discrepancy Details]:`);
      validationReport.discrepancies.forEach(d => console.warn(`  ⚠️ ${d}`));
    }

    if (validationReport.passed) {
      totalPassed++;
    }
  }

  console.log('\n=================================================================');
  console.log('                     FINAL REGRESSION REPORT                     ');
  console.log('=================================================================');
  console.log(`Total Test Documents Processed: ${totalTests}`);
  console.log(`Passed (100% Accuracy):         ${totalPassed}`);
  console.log(`Failed:                          ${totalTests - totalPassed}`);
  console.log(`Suite Success Rate:             ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

  if (totalPassed === totalTests) {
    console.log('\n✅ ZERO PLACEHOLDERS VERIFIED. ALL DOCUMENTS EXTRACTED WITH 100% ACCURACY!');
    process.exit(0);
  } else {
    console.error('\n❌ REGRESSION SUITE FAILED - DISCREPANCIES DETECTED.');
    process.exit(1);
  }
}

runRegressionSuite();
