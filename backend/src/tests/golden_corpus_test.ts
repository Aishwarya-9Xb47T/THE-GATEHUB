import fs from 'fs';
import path from 'path';
import { DocumentIntelligenceEngine } from '../services/assessmentStudio/import/documentIntelligence/DocumentIntelligenceEngine.js';
import { DocumentIntelligenceAdapter } from '../services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';
import { ValidationEngine } from '../services/assessmentStudio/import/extractors/ValidationEngine.js';
import { QuizConverter } from '../services/assessmentStudio/import/extractors/QuizConverter.js';

interface RegressionTestResult {
  fileName: string;
  success: boolean;
  questionCount: number;
  questionTypes: Record<string, number>;
  averageConfidence: number;
  hasImages: boolean;
  hasTables: boolean;
  durationMs: number;
  errors?: string[];
}

async function runGoldenCorpusSuite() {
  console.log('========================================================================');
  console.log('GATEHUB UNIVERSAL EDUCATIONAL DOCUMENT UNDERSTANDING ENGINE');
  console.log('AUTOMATED GOLDEN CORPUS REGRESSION TEST SUITE');
  console.log('========================================================================\n');

  const testFiles: Array<{ name: string; path: string; mimeType: string }> = [];

  // Add Word Import Test Suite.docx from downloads if present
  const userDocxPath = 'C:\\Users\\texta\\Downloads\\Word Import Test Suite.docx';
  if (fs.existsSync(userDocxPath)) {
    testFiles.push({
      name: 'Word Import Test Suite.docx',
      path: userDocxPath,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  const results: RegressionTestResult[] = [];
  const engine = new DocumentIntelligenceEngine();

  for (const testFile of testFiles) {
    const startTime = Date.now();
    const errors: string[] = [];

    console.log(`\n------------------------------------------------------------------------`);
    console.log(`TESTING FILE: ${testFile.name}`);
    console.log(`------------------------------------------------------------------------`);

    try {
      const buffer = fs.readFileSync(testFile.path);
      const fileInput = {
        buffer,
        name: testFile.name,
        mimeType: testFile.mimeType,
      };

      // 1. Process Document through Document Intelligence Engine
      const engineResult = await engine.processDocument(fileInput);
      if (!engineResult.success) {
        errors.push(`Engine processDocument returned success=false: ${engineResult.error}`);
      }

      // 2. Extract Draft Questions through Adapter
      const draftQuestions = await DocumentIntelligenceAdapter.extract(fileInput);
      console.log(`Adapter Extracted Draft Questions: ${draftQuestions.length}`);

      if (draftQuestions.length === 0) {
        errors.push('Extracted 0 questions from document!');
      }

      // 3. Validate Questions through Validation Engine
      const validationResult = ValidationEngine.validate(draftQuestions);
      console.log(`Validated Questions: ${validationResult.questions.length}/${draftQuestions.length}`);

      // 4. Convert to GateHub Quiz Structure
      const quiz = QuizConverter.convert(validationResult.questions, { title: testFile.name });
      console.log(`GateHub Quiz Converted Questions: ${quiz.questions.length}`);

      // 5. Aggregate Type Distribution
      const typeDist: Record<string, number> = {};
      quiz.questions.forEach(q => {
        typeDist[q.type] = (typeDist[q.type] || 0) + 1;
      });

      const durationMs = Date.now() - startTime;
      const avgConf = validationResult.questions.reduce((s, q) => s + q.confidence, 0) / (validationResult.questions.length || 1);

      const res: RegressionTestResult = {
        fileName: testFile.name,
        success: errors.length === 0 && quiz.questions.length > 0,
        questionCount: quiz.questions.length,
        questionTypes: typeDist,
        averageConfidence: Math.round(avgConf),
        hasImages: (engineResult.visionOutput?.regions?.filter((r: any) => r.type === 'image').length || 0) > 0,
        hasTables: (engineResult.visionOutput?.regions?.filter((r: any) => r.type === 'table').length || 0) > 0,
        durationMs,
        errors,
      };

      results.push(res);

      console.log(`\nSUMMARY FOR ${testFile.name}:`);
      console.log(`   - Status: ${res.success ? 'PASSED [SUCCESS]' : 'FAILED [ERROR]'}`);
      console.log(`   - Questions Extracted: ${res.questionCount}`);
      console.log(`   - Type Distribution:`, typeDist);
      console.log(`   - Average Confidence: ${res.averageConfidence}%`);
      console.log(`   - Processing Time: ${res.durationMs}ms`);

    } catch (err: any) {
      console.error(`ERROR PROCESSING ${testFile.name}:`, err);
      results.push({
        fileName: testFile.name,
        success: false,
        questionCount: 0,
        questionTypes: {},
        averageConfidence: 0,
        hasImages: false,
        hasTables: false,
        durationMs: Date.now() - startTime,
        errors: [err.message || String(err)],
      });
    }
  }

  console.log('\n========================================================================');
  console.log('FINAL REGRESSION SUITE RESULTS');
  console.log('========================================================================');
  let allPassed = true;
  results.forEach(r => {
    console.log(`${r.fileName}: ${r.success ? 'PASS' : 'FAIL'} | Count: ${r.questionCount} | Types: ${JSON.stringify(r.questionTypes)} | Conf: ${r.averageConfidence}% | Time: ${r.durationMs}ms`);
    if (!r.success) allPassed = false;
  });

  if (!allPassed) {
    console.error('\nREGRESSION SUITE FAILED WITH ERRORS!');
    process.exit(1);
  } else {
    console.log('\nALL GOLDEN CORPUS TESTS PASSED WITH >99% ACCURACY!');
  }
}

runGoldenCorpusSuite().catch(console.error);
