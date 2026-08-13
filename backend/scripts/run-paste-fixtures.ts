/**
 * Acceptance fixtures through the SAME function the Quiz Room UI uses:
 * DocumentIntelligenceAdapter.extract → AntiGravityV2 → paste structured parse.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.ts';
import { ValidationEngine } from '../src/services/assessmentStudio/import/extractors/ValidationEngine.ts';
import { AntiGravityV2Engine } from '../src/services/antigravityV2/AntiGravityV2Engine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/paste-extraction');
const OUT_DIR = path.resolve(__dirname, 'fixture-results');
mkdirSync(OUT_DIR, { recursive: true });

type Expectation = {
  minQuestions: number;
  exactQuestions?: number;
  requireCode?: boolean;
  requireCorrect?: boolean;
  stems?: RegExp[];
};

const EXPECTATIONS: Record<string, Expectation> = {
  'plain-text-quiz.txt': {
    exactQuestions: 2,
    requireCorrect: true,
    stems: [/capital of France/i, /Red Planet/i],
  },
  'markdown-table-quiz.txt': {
    exactQuestions: 2,
    requireCorrect: true,
    stems: [/2 \+ 2/i, /capital of France/i],
  },
  'tsv-quiz.txt': {
    exactQuestions: 2,
    requireCorrect: true,
    stems: [/3 \+ 3/i, /capital of Italy/i],
  },
  'csv-quiz.txt': {
    exactQuestions: 2,
    requireCorrect: true,
    stems: [/5 \+ 5/i, /capital of Spain/i],
  },
  'python-code-quiz.txt': {
    exactQuestions: 2,
    requireCode: true,
    requireCorrect: true,
    stems: [/Python code print/i, /JavaScript statement/i],
  },
  'javascript-code-quiz.txt': {
    exactQuestions: 1,
    requireCode: true,
    requireCorrect: true,
    stems: [/valid JavaScript/i],
  },
  'mixed-code-mcq.txt': {
    minQuestions: 2,
    requireCode: true,
    requireCorrect: true,
  },
  'mixed-table-mcq.txt': {
    minQuestions: 1,
    requireCorrect: true,
    stems: [/metric is higher/i],
  },
  'mixed-text-table-code.txt': {
    minQuestions: 3,
    requireCode: true,
    requireCorrect: true,
  },
  'malformed-quiz.txt': {
    minQuestions: 1,
  },
};

function summarize(drafts: any[]) {
  return drafts.map((d, i) => ({
    i,
    text: String(d.text || '').slice(0, 120),
    options: (d.options || []).map((o: any) => ({ text: o.text, isCorrect: o.isCorrect })),
    correctAnswer: d.correctAnswer,
    starterCode: d.metadata?.starterCode,
    codeLang: d.metadata?.code?.language || d.metadata?.language,
    children: (d.children || d.metadata?.children || []).map((c: any) => c.type),
  }));
}

async function extractViaUiPath(text: string) {
  const file = {
    name: 'pasted-content.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(text, 'utf-8'),
  };
  const v2 = await AntiGravityV2Engine.processDocument(file);
  const drafts = await DocumentIntelligenceAdapter.extract(file);
  const validated = ValidationEngine.validate(drafts);
  return { v2Count: v2.questions?.length || 0, drafts, validated };
}

let failed = 0;
const results: any[] = [];

// Generate bulk fixtures on the fly
function makeBulk(n: number): string {
  const parts: string[] = [];
  for (let i = 1; i <= n; i++) {
    parts.push(
      `Question ${i}:\nWhat is item number ${i}?\nA. ${i}\nB. X\nC. Y\nD. Z\nCorrect Answer: A\nMarks: 1\n`,
    );
  }
  return parts.join('\n');
}

async function runNamed(name: string, text: string, exp: Expectation) {
  console.log(`\n=== ${name} ===`);
  const { v2Count, drafts, validated } = await extractViaUiPath(text);
  const qs = validated.questions.filter((q) => q.validationStatus !== 'rejected');
  const errors: string[] = [];

  if (exp.exactQuestions !== undefined && qs.length !== exp.exactQuestions) {
    errors.push(`expected ${exp.exactQuestions} questions, got ${qs.length} (v2=${v2Count}, drafts=${drafts.length})`);
  }
  if (qs.length < exp.minQuestions) {
    errors.push(`expected >= ${exp.minQuestions} questions, got ${qs.length}`);
  }
  if (exp.requireCorrect) {
    const withCorrect = qs.filter((q) => (q.options || []).some((o) => o.isCorrect) || q.correctAnswer);
    if (withCorrect.length < Math.min(exp.minQuestions, qs.length)) {
      errors.push('missing correct answers');
    }
  }
  if (exp.requireCode) {
    const withCode = qs.filter((q) => {
      const meta = q.metadata as any;
      const starter = String(meta?.starterCode || meta?.code?.code || '').trim();
      const child = (q.children || meta?.children || []).some(
        (c: any) => c.type === 'code' && String(c.code || '').trim(),
      );
      return starter.length > 0 || child;
    });
    if (withCode.length < 1) errors.push('expected code block on at least one question');
  }
  for (const stem of exp.stems || []) {
    if (!qs.some((q) => stem.test(String(q.text || '')))) {
      errors.push(`missing stem matching ${stem}`);
    }
  }

  // Table must not remain as one giant stem
  if (/markdown-table|tsv-quiz|csv-quiz/.test(name)) {
    if (qs.some((q) => /\| Question\s+\| Option A/i.test(String(q.text || '')))) {
      errors.push('table flattened into giant question stem');
    }
  }

  const ok = errors.length === 0;
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', errors.join('; ') || '');
  const summary = summarize(qs);
  results.push({ name, ok, errors, v2Count, draftCount: drafts.length, validatedCount: qs.length, summary });
  writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ ok, errors, summary }, null, 2));
}

for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.txt'))) {
  const exp = EXPECTATIONS[file] || { minQuestions: 1 };
  const text = readFileSync(path.join(FIXTURE_DIR, file), 'utf-8');
  await runNamed(file, text, exp);
}

await runNamed('bulk-10-questions.txt', makeBulk(10), { exactQuestions: 10, requireCorrect: true, minQuestions: 10 });
await runNamed('bulk-50-questions.txt', makeBulk(50), { exactQuestions: 50, requireCorrect: true, minQuestions: 50 });

// Acceptance A/B/C exact user samples
await runNamed(
  'acceptance-A-plain.txt',
  readFileSync(path.join(FIXTURE_DIR, 'plain-text-quiz.txt'), 'utf-8'),
  EXPECTATIONS['plain-text-quiz.txt']!,
);
await runNamed(
  'acceptance-B-table.txt',
  readFileSync(path.join(FIXTURE_DIR, 'markdown-table-quiz.txt'), 'utf-8'),
  EXPECTATIONS['markdown-table-quiz.txt']!,
);
await runNamed(
  'acceptance-C-code.txt',
  readFileSync(path.join(FIXTURE_DIR, 'python-code-quiz.txt'), 'utf-8'),
  EXPECTATIONS['python-code-quiz.txt']!,
);

writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed ? 1 : 0);
