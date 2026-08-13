import fs from 'fs';
import path from 'path';
import { AntiGravityV2Engine } from '../src/services/antigravityV2/AntiGravityV2Engine.js';
import { generateV2GoldenCorpus } from './generate-v2-golden-corpus.js';

async function runV2GoldenTestSuite() {
  console.log('=================================================================');
  console.log('    ANTIGRAVITY V2 DOCUMENT INTELLIGENCE GOLDEN REGRESSION SUITE  ');
  console.log('=================================================================\n');

  // Step 1: Generate V2 Golden Corpus
  await generateV2GoldenCorpus();

  const corpusDir = path.resolve('v2-golden-corpus');

  const testCases = [
    {
      fileName: 'v2_engineering_paper.md',
      expected: {
        minPages: 1,
        minTables: 1,
        minCodeBlocks: 1,
        minEquations: 2,
        minDiagrams: 1,
        minQuestions: 2,
      },
    },
    {
      fileName: 'v2_slides_deck.pptx',
      expected: {
        minPages: 1,
        minQuestions: 1,
      },
    },
  ];

  // Include repository test files
  if (fs.existsSync('test-rich-content.docx')) {
    testCases.push({
      fileName: '../test-rich-content.docx',
      expected: {
        minPages: 1,
        minQuestions: 2,
      },
    });
  }

  let totalPassed = 0;
  let totalTests = testCases.length;

  for (const tc of testCases) {
    const filePath = path.join(corpusDir, tc.fileName);
    console.log(`\n-----------------------------------------------------------------`);
    console.log(`[V2 ENGINE EXECUTION] Document: ${tc.fileName}`);
    console.log(`-----------------------------------------------------------------`);

    if (!fs.existsSync(filePath)) {
      console.error(`[ERROR] File missing: ${filePath}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await AntiGravityV2Engine.processDocument(
      {
        name: path.basename(tc.fileName),
        buffer,
      },
      {
        expectedMetrics: tc.expected,
      }
    );

    console.log(`[AntiGravity V2 Result]`, {
      success: result.success,
      format: result.format,
      pages: result.document.pageCount,
      blocks: result.blocks.length,
      tables: result.tables.length,
      codeBlocks: result.codeBlocks.length,
      equations: result.equations.length,
      diagrams: result.diagrams.length,
      questions: result.questions.length,
      processingTimeMs: `${result.processingTimeMs}ms`,
    });

    console.log(`[V2 Validation Engine]`, {
      passed: result.validation.passed,
      accuracyScore: `${result.validation.accuracyScore.toFixed(1)}%`,
      isStructurallyEquivalent: result.validation.isStructurallyEquivalent,
      placeholderFound: result.validation.placeholderFound,
      discrepanciesCount: result.validation.discrepancies.length,
    });

    if (result.validation.discrepancies.length > 0) {
      console.warn(`[V2 Discrepancies]:`);
      result.validation.discrepancies.forEach(d => console.warn(`  ⚠️ ${d}`));
    }

    if (result.validation.passed) {
      totalPassed++;
    }
  }

  console.log('\n=================================================================');
  console.log('              ANTIGRAVITY V2 FINAL REGRESSION REPORT             ');
  console.log('=================================================================');
  console.log(`Total Documents Tested: ${totalTests}`);
  console.log(`Passed (100% Accuracy): ${totalPassed}`);
  console.log(`Failed:                 ${totalTests - totalPassed}`);
  console.log(`Suite Success Rate:     ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

  if (totalPassed === totalTests) {
    console.log('\n✅ ANTIGRAVITY V2 ENGINE PASSED 100% OF GOLDEN TEST CORPUS WITH ZERO PLACEHOLDERS!');
    process.exit(0);
  } else {
    console.error('\n❌ ANTIGRAVITY V2 SUITE FAILED - DISCREPANCIES DETECTED.');
    process.exit(1);
  }
}

runV2GoldenTestSuite();
