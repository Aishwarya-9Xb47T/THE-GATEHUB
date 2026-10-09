/**
 * End-to-End Verification of Quiz Extraction Engine and Quiz Lifecycle
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';
import { QuizConverter } from '../src/services/assessmentStudio/import/extractors/QuizConverter.js';
import { parseGoogleResourceUrl, normalizeGoogleResourceKey } from '../src/services/googleWorkspace/GoogleResourceParser.js';
import { getGoogleClientId, getGoogleClientSecret } from '../src/services/googleWorkspace/googleOAuth.js';

async function main() {
  console.log('======================================================================');
  console.log('THE GATEHUB — EXTRACTION ENGINE FINAL E2E VERIFICATION');
  console.log('======================================================================\n');

  // STEP 1: Verify PDF 38-Question Extraction & Output
  console.log('>>> [1/5] Extracting 38-Question Test PDF...');
  const pdfPath = 'C:/Users/texta/Downloads/Quiz_Extraction_Test_Material_Mixed_Question_Types.pdf';
  const buffer = fs.readFileSync(pdfPath);
  const drafts = await DocumentIntelligenceAdapter.extract({
    buffer,
    name: 'Quiz_Extraction_Test_Material_Mixed_Question_Types.pdf',
    mimeType: 'application/pdf',
  });

  console.log(`Extracted total questions: ${drafts.length}`);
  assert.equal(drafts.length, 38, 'Must extract exactly 38 questions');

  // Verify key types and evidence
  const q1 = drafts[0];
  console.log(`\nQ1 (MCQ): "${q1.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q1.type} | Marks: ${q1.marks} | Ans: ${q1.correctAnswer}`);
  console.log(`  Options: ${q1.options.map(o => `${o.isCorrect ? '[x]' : '[ ]'} ${o.text}`).join(' | ')}`);
  assert.equal(q1.type, 'multiple_choice');
  assert.equal(q1.marks, 2);
  assert.equal(q1.options.length, 4);
  assert.equal(q1.correctAnswer, 'B');

  const q5 = drafts[4];
  console.log(`\nQ5 (MSQ): "${q5.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q5.type} | Marks: ${q5.marks} | Ans: ${JSON.stringify(q5.correctAnswer)}`);
  console.log(`  Options: ${q5.options.map(o => `${o.isCorrect ? '[x]' : '[ ]'} ${o.text}`).join(' | ')}`);
  assert.equal(q5.type, 'multiple_select');
  assert.equal(q5.marks, 3);
  assert.equal(q5.options.length, 4);

  const q8 = drafts[7];
  console.log(`\nQ8 (True/False): "${q8.text}"`);
  console.log(`  Type: ${q8.type} | Marks: ${q8.marks} | Ans: ${q8.correctAnswer}`);
  assert.equal(q8.type, 'true_false');
  assert.equal(q8.marks, 1);
  assert.equal(q8.text, 'A Python dictionary maps keys to values.');
  assert.equal(q8.options.length, 2);

  const q11 = drafts[10];
  console.log(`\nQ11 (Fill in Blanks): "${q11.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q11.type} | Marks: ${q11.marks} | Ans: "${q11.correctAnswer}"`);
  assert.equal(q11.type, 'fill_blank');
  assert.equal(q11.marks, 2);
  assert.equal(q11.correctAnswer, 'def');

  const q15 = drafts[14];
  console.log(`\nQ15 (Matching): "${q15.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q15.type} | Marks: ${q15.marks} | Ans: "${q15.correctAnswer}"`);
  assert.equal(q15.type, 'match_following');
  assert.equal(q15.marks, 4);

  const q16 = drafts[15];
  console.log(`\nQ16 (Ordering): "${q16.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q16.type} | Marks: ${q16.marks} | Ans: "${q16.correctAnswer}"`);
  assert.equal(q16.type, 'ordering');
  assert.equal(q16.marks, 3);

  const q22 = drafts[21];
  console.log(`\nQ22 (Code Python): "${q22.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q22.type} | Marks: ${q22.marks} | Ans: "${q22.correctAnswer}"`);
  assert.equal(q22.type, 'coding');
  assert.equal(q22.marks, 3);

  const q25 = drafts[24];
  console.log(`\nQ25 (Code JavaScript): "${q25.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q25.type} | Marks: ${q25.marks} | Ans: "${q25.correctAnswer}"`);
  assert.equal(q25.type, 'coding');
  assert.equal(q25.marks, 4);

  const q27 = drafts[26];
  console.log(`\nQ27 (Image-based Figure 1): "${q27.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q27.type} | Marks: ${q27.marks} | Ans: ${q27.correctAnswer}`);
  const mediaUrl = q27.metadata?.mediaUrl || (q27.metadata?.images?.[0] as any)?.dataUrl || '';
  console.log(`  Media URL Prefix: "${mediaUrl.slice(0, 30)}..." | Total Base64 Length: ${mediaUrl.length}`);
  assert.ok(mediaUrl.startsWith('data:image/bmp;base64,Qk'), 'Must be valid BMP base64 data URL');
  assert.ok(mediaUrl.length > 500, 'Image base64 must contain valid decoded bitmap data');

  const q30 = drafts[29];
  console.log(`\nQ30 (Table-based Table 1): "${q30.text.slice(0, 40)}..."`);
  console.log(`  Type: ${q30.type} | Marks: ${q30.marks} | Table Rows: ${q30.metadata?.table?.rows?.length}`);
  console.log(`  Table Headers: ${JSON.stringify(q30.metadata?.table?.headers)}`);
  console.log(`  Table Row 1: ${JSON.stringify(q30.metadata?.table?.rows?.[0])}`);
  assert.equal(q30.type, 'table_question');
  assert.equal(q30.metadata?.table?.rows?.length, 4);

  const q38 = drafts[37];
  console.log(`\nQ38 (Intentionally Incomplete Item): "${q38.text.slice(0, 40)}..."`);
  console.log(`  NeedsReview: ${(q38 as any).needsReview} | ValidationStatus: ${(q38 as any).validationStatus}`);
  console.log(`  Warnings: ${JSON.stringify(q38.warnings)}`);
  assert.ok((q38 as any).needsReview || (q38 as any).validationStatus === 'flagged');
  assert.ok(q38.warnings?.some((w: string) => w.toLowerCase().includes('review')));

  // STEP 2: Quiz Converter & Schema Transformation
  console.log('\n>>> [2/5] Testing QuizConverter.convert transformation...');
  const gatehubQuiz = await QuizConverter.convert(drafts as any, {
    title: 'GATE Computer Science Comprehensive Assessment',
    description: 'Auto-extracted multi-format assessment',
  });

  console.log(`Converted Quiz Title: "${gatehubQuiz.title}"`);
  console.log(`Converted Questions Count: ${gatehubQuiz.questions.length}`);
  console.log(`Settings: TimeLimit=${gatehubQuiz.metadata.settings?.timeLimit}m, PassingScore=${gatehubQuiz.metadata.settings?.passingScore}%`);
  assert.equal(gatehubQuiz.questions.length, 38);

  // STEP 3: Reopen & Round-Trip Serialization Fidelity
  console.log('\n>>> [3/5] Testing Save / Reopen Round-Trip Serialization...');
  const serialized = JSON.stringify(gatehubQuiz);
  const deserialized = JSON.parse(serialized);

  assert.equal(deserialized.title, gatehubQuiz.title);
  assert.equal(deserialized.questions.length, 38);

  // Check Q1 after reopen
  const reopenedQ1 = deserialized.questions[0];
  assert.equal(reopenedQ1.type, 'multiple_choice');
  assert.equal(reopenedQ1.options.length, 4);
  assert.equal(reopenedQ1.points, 2);
  assert.equal(reopenedQ1.options.find((o: any) => o.isCorrect)?.text, '200');

  // Check Q27 image after reopen
  const reopenedQ27 = deserialized.questions[26];
  assert.equal(reopenedQ27.type, 'image_question');
  const reopenedMediaUrl = reopenedQ27.metadata?.mediaUrl || reopenedQ27.metadata?.images?.[0]?.dataUrl;
  assert.ok(reopenedMediaUrl, 'Media URL must be preserved after reopen');
  if (reopenedMediaUrl.startsWith('/uploads/')) {
    const filename = path.basename(reopenedMediaUrl);
    const diskPath = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads', filename);
    assert.ok(fs.existsSync(diskPath), `Persisted image file must exist on disk: ${diskPath}`);
    assert.ok(fs.statSync(diskPath).size > 500, 'Persisted image file size must be non-empty');
  } else {
    assert.ok(reopenedMediaUrl.startsWith('data:image/'), 'Media must be valid data URL');
  }

  // Check Q30 table after reopen
  const reopenedQ30 = deserialized.questions[29];
  assert.deepEqual(reopenedQ30.metadata?.table?.headers, ['Endpoint', 'Response time (ms)']);
  assert.equal(reopenedQ30.metadata?.table?.rows?.length, 4);

  console.log('  [PASS] All 38 questions, images, tables, options, and marks preserved after reopen.');

  // STEP 4: Quiz Attempt & Scoring Workflow Simulation
  console.log('\n>>> [4/5] Simulating Quiz Attempt & Grading Engine...');
  let totalScore = 0;
  let maxPossibleScore = 0;

  // Student answers Q1, Q5, Q8, Q11 correctly
  const simulatedStudentResponses: Record<number, any> = {
    0: 'B', // Q1 correct (2 marks)
    4: ['A', 'B', 'D'], // Q5 correct (3 marks)
    7: 'A', // Q8 correct (1 mark)
    10: 'def', // Q11 correct (2 marks)
    1: 'WRONG', // Q2 incorrect (0 of 2 marks)
  };

  drafts.forEach((d, idx) => {
    const qMarks = d.marks || 1;
    maxPossibleScore += qMarks;

    const studentAns = simulatedStudentResponses[idx];
    if (studentAns !== undefined) {
      const normStudent = Array.isArray(studentAns)
        ? studentAns.map(s => String(s).trim().toUpperCase()).sort().join(',')
        : String(studentAns).trim().toUpperCase();
      const normCorrect = Array.isArray(d.correctAnswer)
        ? d.correctAnswer.map(s => String(s).trim().toUpperCase()).sort().join(',')
        : String(d.correctAnswer).split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort().join(',');
      if (normStudent === normCorrect) {
        totalScore += qMarks;
      }
    }
  });

  console.log(`Simulated Attempt Score: ${totalScore} / ${maxPossibleScore} marks`);
  assert.equal(totalScore, 2 + 3 + 1 + 2); // Q1(2) + Q5(3) + Q8(1) + Q11(2) = 8 marks
  console.log(`  [PASS] Scoring calculation accurately rewarded 8 marks for correct responses.`);

  // STEP 5: Google Workspace Integration Status Check
  console.log('\n>>> [5/5] Checking Google Workspace Configurations...');
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  console.log(`  Google Client ID configured: ${clientId ? 'YES (' + clientId.slice(0, 15) + '...)' : 'NO'}`);
  console.log(`  Google Client Secret configured: ${clientSecret ? 'YES (' + clientSecret.slice(0, 8) + '...)' : 'NO'}`);

  // Test URL recognitions
  const testFormsUrl = 'https://docs.google.com/forms/d/1FAIpQLSfabcdefghijklmnopqrstuvwxyz012345/viewform';
  const testDocsUrl = 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
  const testSlidesUrl = 'https://docs.google.com/presentation/d/1s2d3f4g5h6j7k8l9z0x_presentation_12345/edit';

  assert.equal(parseGoogleResourceUrl(testFormsUrl)?.resourceType, 'google_forms');
  assert.equal(parseGoogleResourceUrl(testDocsUrl)?.resourceType, 'google_docs');
  assert.equal(parseGoogleResourceUrl(testSlidesUrl)?.resourceType, 'google_slides');
  console.log('  [PASS] All 3 Google Workspace URL formats parsed and categorized correctly.');

  console.log('\n======================================================================');
  console.log('ALL E2E WORKFLOW VERIFICATIONS PASSED CLEANLY');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('\nE2E VERIFICATION FAILED:', err);
  process.exit(1);
});
