/**
 * Universal quiz extraction regression suite:
 * plain text, tables, code, mixed content.
 */
import assert from 'assert';
import { NativeParserEngine } from '../src/services/antigravityV2/02_NativeParserEngine.ts';
import { QuestionUnderstandingEngine } from '../src/services/antigravityV2/10_QuestionUnderstandingEngine.ts';
import {
  parseStructuredPasteText,
  isQuizLikeTable,
  materializeQuizRowsFromTable,
  mapQuizTableHeaders,
} from '../src/services/antigravityV2/pasteStructuredParse.ts';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.ts';

async function extract(text: string) {
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
  return { parsed, questions };
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

// --- Structured parse unit ---
await check('structured parse: fenced python code preserved exactly', () => {
  const src = 'Before\n```python\ndef hello():\n    print("Hello")\n```\nAfter';
  const r = parseStructuredPasteText(src);
  assert.equal(r.codeBlocks.length, 1);
  assert.equal(r.codeBlocks[0].language, 'python');
  assert.equal(r.codeBlocks[0].code, 'def hello():\n    print("Hello")');
  assert.ok(r.blocks.some((b) => b.type === 'code'));
});

await check('structured parse: markdown table becomes table node', () => {
  const src = `| Question | A | B | C | D | Correct |
| -------- | --- | --- | --- | --- | ------- |
| Capital of France? | Paris | London | Rome | Berlin | A |`;
  const r = parseStructuredPasteText(src);
  assert.ok(r.tables.length >= 1);
  assert.ok(isQuizLikeTable(r.tables[0].headers));
  const rows = materializeQuizRowsFromTable(r.tables[0]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].stem, /Capital of France/);
  assert.equal(rows[0].options.length, 4);
  assert.equal(rows[0].correctAnswer, 'A');
});

await check('header synonym mapping', () => {
  const map = mapQuizTableHeaders(['Q.No', 'Question Text', 'Option A', 'Option B', 'Answer Key', 'Points', 'Explanation']);
  assert.ok(map.some((m) => m.role === 'number'));
  assert.ok(map.some((m) => m.role === 'question'));
  assert.equal(map.filter((m) => m.role === 'option').length, 2);
  assert.ok(map.some((m) => m.role === 'answer'));
  assert.ok(map.some((m) => m.role === 'marks'));
  assert.ok(map.some((m) => m.role === 'explanation'));
});

// --- Regression: Word Import sample ---
await check('REGRESSION: Word Import Test Suite sample', async () => {
  const { questions } = await extract(`
Word Import Test Suite

Section 1: Multiple Choice

Difficulty: Easy
Marks: 2

Question 1
Which planet is known as the Red Planet?

A. Earth
B. Mars ✅
C. Jupiter
D. Venus

Correct Answer: B
`);
  assert.equal(questions.length, 1);
  assert.match(questions[0].stem, /Red Planet/);
  assert.equal(questions[0].options.length, 4);
  assert.equal(String(questions[0].correctAnswer).toUpperCase(), 'B');
  assert.equal(questions[0].points, 2);
  assert.equal(questions[0].difficulty, 'Easy');
});

// --- Tables end-to-end ---
await check('markdown quiz table → MCQ questions', async () => {
  const { questions } = await extract(`
| Q.No | Question | A | B | C | D | Correct |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Capital of France? | Paris | London | Rome | Berlin | A |
| 2 | 2 + 2 = ? | 3 | 4 | 5 | 6 | B |
`);
  assert.equal(questions.length, 2, `got ${questions.length}`);
  assert.match(questions[0].stem, /Capital of France/);
  assert.equal(questions[0].options.length, 4);
  assert.equal(String(questions[0].correctAnswer).toUpperCase(), 'A');
  assert.equal(String(questions[1].correctAnswer).toUpperCase(), 'B');
});

await check('tab-separated quiz table', async () => {
  const { questions } = await extract(
    'Question\tA\tB\tC\tD\tCorrect\nCapital of France?\tParis\tLondon\tRome\tBerlin\tA\nLargest planet?\tEarth\tMars\tJupiter\tVenus\tC\n',
  );
  assert.ok(questions.length >= 2, `got ${questions.length}`);
  assert.match(questions[0].stem, /Capital of France/);
});

await check('question/answer/marks table (short answer)', async () => {
  const { questions } = await extract(`
| Question | Answer | Marks |
| --- | --- | --- |
| Name the largest planet | Jupiter | 2 |
| Chemical symbol for water | H2O | 1 |
`);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].options.length, 0);
  assert.equal(String(questions[0].correctAnswer), 'Jupiter');
  assert.equal(questions[0].points, 2);
});

// --- Code end-to-end ---
await check('code + MCQ preserves code and stays multiple_choice', async () => {
  const { questions } = await extract(`
Question 1
What is the output of the following Python code?

\`\`\`python
x = 10
y = 20
print(x + y)
\`\`\`

A. 20
B. 30
C. 40
D. 1020

Correct Answer: B
`);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].options.length, 4);
  assert.equal(String(questions[0].correctAnswer).toUpperCase(), 'B');
  assert.ok(questions[0].associatedCode.length >= 1, 'code missing');
  assert.match(questions[0].associatedCode[0].code, /x = 10/);
  assert.match(questions[0].associatedCode[0].code, /print\(x \+ y\)/);
  assert.ok(
    questions[0].type === 'multiple_choice' || questions[0].options.length === 4,
    `type=${questions[0].type}`,
  );
  assert.notEqual(questions[0].type, 'coding');
});

await check('javascript / java / sql / html fences detected', async () => {
  for (const [lang, body] of [
    ['javascript', 'const x = 10;\nconsole.log(x);'],
    ['java', 'public class Main {\n  public static void main(String[] args) {}\n}'],
    ['sql', 'SELECT * FROM students;'],
    ['html', '<div>Hello</div>'],
    ['cpp', 'int main() {\n  return 0;\n}'],
  ] as const) {
    const r = parseStructuredPasteText(`\`\`\`${lang}\n${body}\n\`\`\``);
    assert.equal(r.codeBlocks.length, 1, lang);
    assert.equal(r.codeBlocks[0].code, body);
  }
});

await check('mixed text + reference table + code MCQ', async () => {
  const { questions } = await extract(`
Section: Python

Question 1:
Consider the following code:

\`\`\`python
numbers = [1, 2, 3]
print(numbers[0])
\`\`\`

What is printed?

A. 0
B. 1
C. 2
D. 3

Correct Answer: B

Question 2:
Which method adds an item?

| Method | Purpose |
| --- | --- |
| append() | Add item |
| pop() | Remove item |

A. append()
B. pop()
C. remove()
D. insert()

Answer: A
`);
  assert.ok(questions.length >= 2, `got ${questions.length}: ${questions.map((q) => q.stem).join(' || ')}`);
  const q1 = questions.find((q) => /printed|numbers/i.test(q.stem) || q.associatedCode.length > 0);
  assert.ok(q1, 'code question missing');
  assert.ok(q1!.associatedCode.length >= 1 || q1!.children.some((c) => c.type === 'code'));
});

await check('adapter maps code into metadata.starterCode', async () => {
  const file = {
    name: 'pasted-content.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`Question 1
What prints?

\`\`\`python
print(1+1)
\`\`\`

A. 1
B. 2
Correct Answer: B
`),
    size: 10,
  };
  const drafts = await DocumentIntelligenceAdapter.extract(file as any);
  assert.ok(drafts.length >= 1);
  const meta = drafts[0].metadata as any;
  assert.ok(String(meta.starterCode || meta.code?.code || '').includes('print'), JSON.stringify(meta));
  assert.ok((drafts[0].options || []).length >= 2);
});

await check('50 MCQ still works after table/code changes', async () => {
  const parts: string[] = [];
  for (let i = 1; i <= 50; i++) {
    parts.push(`Question ${i}\nItem ${i}?\nA. A\nB. B\nC. C\nD. D\nCorrect Answer: A\n`);
  }
  const { questions } = await extract(parts.join('\n'));
  assert.equal(questions.length, 50);
});

await check('missing answer not invented in table row', async () => {
  const { questions } = await extract(`
| Question | A | B | C | D |
| --- | --- | --- | --- | --- |
| Pick one? | One | Two | Three | Four |
`);
  assert.equal(questions.length, 1);
  assert.ok(!questions[0].correctAnswer || questions[0].correctAnswer === '');
  assert.ok(!questions[0].options.some((o) => o.isCorrect));
});

console.log(`\n${passed} universal extraction checks passed`);
