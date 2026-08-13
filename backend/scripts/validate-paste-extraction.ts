/**
 * Paste-text quiz extraction validation (formats A–G + edge cases).
 * Runs NativeParserEngine → QuestionUnderstandingEngine without full HTTP.
 */
import assert from 'assert';
import { NativeParserEngine } from '../src/services/antigravityV2/02_NativeParserEngine.ts';
import { QuestionUnderstandingEngine } from '../src/services/antigravityV2/10_QuestionUnderstandingEngine.ts';
import { splitPasteTextIntoLines, normalizePasteText } from '../src/services/antigravityV2/pasteTextNormalize.ts';

async function extractFromPaste(text: string) {
  const buffer = Buffer.from(text, 'utf-8');
  const parsed = await NativeParserEngine.parse(buffer, 'pasted-content.txt', 'txt');
  const questions = QuestionUnderstandingEngine.extractQuestions(
    parsed.blocks,
    parsed.rawText,
    parsed.tables || [],
    [],
    [],
    [],
    [],
    [],
    parsed.comments || [],
    parsed.speakerNotes || [],
  );
  return questions;
}

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log('✓', name);
  } catch (err) {
    console.error('✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

await check('normalize + line split preserves single-newline structure', () => {
  const lines = splitPasteTextIntoLines('Q1\r\nWhat?\r\nA. One\r\nB. Two\n\n\n');
  assert.deepEqual(lines, ['Q1', 'What?', 'A. One', 'B. Two']);
  assert.ok(!normalizePasteText('a\r\nb').includes('\r'));
});

await check('Format A: Question N + A. options + Correct Answer letter', async () => {
  const qs = await extractFromPaste(`
Word Import Test Suite

Section 1: Multiple Choice

Difficulty: Easy
Marks: 2

Question 1
Which planet is known as the Red Planet?

A. Earth
B. Mars ✅
C. Venus
D. Jupiter

Correct Answer: B
`);
  assert.ok(qs.length >= 1, `expected >=1 got ${qs.length}`);
  const q = qs[0]!;
  assert.match(q.stem, /Red Planet/i);
  assert.equal(q.options.length, 4);
  assert.equal(String(q.correctAnswer).toUpperCase(), 'B');
  assert.equal(q.points, 2);
  assert.equal(q.difficulty, 'Easy');
  assert.match(String(q.currentSection || ''), /Multiple Choice/i);
});

await check('Format B: 1. stem + A) options + Answer text', async () => {
  const qs = await extractFromPaste(`
1. What is the capital of France?
A) Paris
B) London
C) Berlin
D) Rome
Answer: Paris
`);
  assert.equal(qs.length, 1);
  assert.match(qs[0]!.stem, /capital of France/i);
  assert.equal(qs[0]!.options.length, 4);
  assert.equal(String(qs[0]!.correctAnswer), 'Paris');
});

await check('Format C: Q1. + numbered options + Correct: 1', async () => {
  const qs = await extractFromPaste(`
Q1. What is the capital of France?
1. Paris
2. London
3. Berlin
4. Rome
Correct: 1
`);
  assert.equal(qs.length, 1);
  assert.equal(qs[0]!.options.length, 4);
  assert.equal(String(qs[0]!.correctAnswer), '1');
});

await check('Format D: Question 1: inline stem', async () => {
  const qs = await extractFromPaste(`
Question 1: What is the capital of France?
A. Paris
B. London
C. Berlin
D. Rome
Answer: A
`);
  assert.equal(qs.length, 1);
  assert.match(qs[0]!.stem, /capital of France/i);
  assert.equal(String(qs[0]!.correctAnswer).toUpperCase(), 'A');
});

await check('Format E: bullet options + Correct answer text', async () => {
  const qs = await extractFromPaste(`
1. What is the capital of France?

- Paris
- London
- Berlin
- Rome

Correct answer: Paris
`);
  assert.equal(qs.length, 1);
  assert.equal(qs[0]!.options.length, 4);
  assert.equal(String(qs[0]!.correctAnswer), 'Paris');
});

await check('Format F: Options: label line', async () => {
  const qs = await extractFromPaste(`
Question 1
What is the capital of France?

Options:
A. Paris
B. London
C. Berlin
D. Rome

Correct Answer: A
`);
  assert.equal(qs.length, 1);
  assert.equal(qs[0]!.options.length, 4);
});

await check('Format G: sections + multi-line stem + explanation', async () => {
  const qs = await extractFromPaste(`
Section A: Mixed

Question 1:
Which of the following statements is true
about photosynthesis in green plants?

A. It occurs only at night
B. It produces oxygen
C. It consumes oxygen
D. It happens in roots

Correct Answer: B
Explanation: Chloroplasts release oxygen during photosynthesis.
Difficulty: Hard
Marks: 5
`);
  assert.ok(qs.length >= 1);
  assert.match(qs[0]!.stem, /photosynthesis/i);
  assert.match(qs[0]!.stem, /green plants/i);
  assert.equal(qs[0]!.points, 5);
  assert.equal(qs[0]!.difficulty, 'Hard');
  assert.match(String(qs[0]!.explanation || ''), /Chloroplasts/i);
});

await check('True/False detection', async () => {
  const qs = await extractFromPaste(`
True or False:
The Earth is the center of the Solar System.

A. True
B. False

Answer: False
`);
  assert.ok(qs.length >= 1);
  assert.equal(qs[0]!.options.length, 2);
  // type refined on close
  assert.ok(qs[0]!.type === 'true_false' || qs[0]!.type === 'multiple_choice');
  assert.match(String(qs[0]!.correctAnswer), /False/i);
});

await check('Short answer without options — no invented answer', async () => {
  const qs = await extractFromPaste(`
Question 1
Name the largest planet in our solar system.

Correct Answer: Jupiter
`);
  assert.equal(qs.length, 1);
  assert.equal(qs[0]!.options.length, 0);
  assert.equal(String(qs[0]!.correctAnswer), 'Jupiter');
});

await check('Missing answer is not invented', async () => {
  const qs = await extractFromPaste(`
Question 1
Pick a color?

A. Red
B. Blue
C. Green
`);
  assert.equal(qs.length, 1);
  assert.equal(qs[0]!.options.length, 3);
  assert.ok(!qs[0]!.correctAnswer || qs[0]!.correctAnswer === '');
  assert.ok(!qs[0]!.options.some((o) => o.isCorrect));
});

await check('10-question bulk paste', async () => {
  const parts: string[] = [];
  for (let i = 1; i <= 10; i++) {
    parts.push(`Question ${i}\nWhat is number ${i}?\nA. ${i}\nB. X\nC. Y\nD. Z\nCorrect Answer: A\n`);
  }
  const qs = await extractFromPaste(parts.join('\n'));
  assert.equal(qs.length, 10, `expected 10 got ${qs.length}`);
});

await check('50-question bulk paste', async () => {
  const parts: string[] = [];
  for (let i = 1; i <= 50; i++) {
    parts.push(`${i}. Capital city quiz item ${i}?\nA) Alpha\nB) Beta\nC) Gamma\nD) Delta\nAnswer: A\n`);
  }
  const qs = await extractFromPaste(parts.join('\n'));
  assert.equal(qs.length, 50, `expected 50 got ${qs.length}`);
});

await check('tabs + extra blank lines + CRLF', async () => {
  const qs = await extractFromPaste(
    'Question 1\r\n\tWhat is 2+2?\r\n\r\n\tA. 3\r\n\tB. 4\r\n\tC. 5\r\n\r\nCorrect Answer:\tB\r\n',
  );
  assert.equal(qs.length, 1);
  assert.equal(qs[0]!.options.length, 3);
  assert.equal(String(qs[0]!.correctAnswer).toUpperCase(), 'B');
});

await check('partially malformed — still extracts valid questions', async () => {
  const qs = await extractFromPaste(`
Question 1
Good question?
A. Yes
B. No
Correct Answer: A

Question 2
(this one has no options and is messy)

Question 3
Another good one?
A. One
B. Two
C. Three
D. Four
Answer: B
`);
  assert.ok(qs.length >= 2, `expected >=2 got ${qs.length}`);
});

await check('numbered options are not treated as new questions', async () => {
  const qs = await extractFromPaste(`
Q1. Select the even number?
1. 1
2. 2
3. 3
4. 5
Correct: 2
`);
  assert.equal(qs.length, 1, `expected 1 question, got ${qs.length}: ${qs.map((q) => q.stem).join(' | ')}`);
  assert.equal(qs[0]!.options.length, 4);
});

console.log(`\n${passed} paste-extraction checks passed`);
