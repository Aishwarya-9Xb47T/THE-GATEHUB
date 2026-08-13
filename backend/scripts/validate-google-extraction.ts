/**
 * Lightweight runner for Google extraction unit checks (avoids Jest OOM in this repo).
 */
import assert from 'assert';
import {
  parseGoogleResourceUrl,
  normalizeGoogleResourceKey,
  isValidGoogleResourceId,
} from '../src/services/googleWorkspace/GoogleResourceParser.ts';
import {
  classifyGoogleApiFailure,
  isRetryableGoogleFailure,
  sanitizeUrlForLog,
  GoogleIngestionError,
} from '../src/services/googleWorkspace/googleExtractionErrors.ts';
import {
  ingestGoogleFormsApiResponse,
  ingestPublicGoogleFormHtml,
  computeGoogleFormsStatistics,
} from '../src/services/googleWorkspace/googleFormsIngestion.ts';

const DOC_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const FORM_ID = '1FAIpQLSfabcdefghijklmnopqrstuvwxyz012345';
const PUB_FORM_ID = '1FAIpQLSdabcdefghijklmnopqrstuvwxyz098765';

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log('✓', name);
  } catch (err) {
    console.error('✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

check('docs /edit', () => {
  const p = parseGoogleResourceUrl(`https://docs.google.com/document/d/${DOC_ID}/edit`);
  assert.equal(p?.resourceId, DOC_ID);
  assert.equal(p?.resourceType, 'google_docs');
});

check('docs sharing + view + bare', () => {
  assert.equal(
    parseGoogleResourceUrl(`https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`)?.resourceId,
    DOC_ID,
  );
  assert.equal(
    parseGoogleResourceUrl(`https://docs.google.com/document/d/${DOC_ID}/view`)?.resourceId,
    DOC_ID,
  );
  assert.equal(
    parseGoogleResourceUrl(`https://docs.google.com/document/d/${DOC_ID}?foo=1#x`)?.resourceId,
    DOC_ID,
  );
});

check('forms variants', () => {
  assert.equal(
    parseGoogleResourceUrl(`https://docs.google.com/forms/d/${FORM_ID}/edit`)?.isPublishedForm,
    false,
  );
  assert.equal(
    parseGoogleResourceUrl(`https://docs.google.com/forms/d/${FORM_ID}/viewform?usp=sharing`)?.resourceId,
    FORM_ID,
  );
  assert.equal(
    parseGoogleResourceUrl(`https://docs.google.com/forms/d/e/${PUB_FORM_ID}/viewform`)?.isPublishedForm,
    true,
  );
});

check('drive file needs resolution', () => {
  const p = parseGoogleResourceUrl(`https://drive.google.com/file/d/${DOC_ID}/view`);
  assert.equal(p?.resourceType, 'google_drive');
  assert.equal(p?.needsTypeResolution, true);
});

check('invalid id rejected', () => {
  assert.equal(isValidGoogleResourceId('abc'), false);
  assert.equal(parseGoogleResourceUrl('https://docs.google.com/document/d/short/edit'), null);
});

check('normalize key dedupes', () => {
  assert.equal(
    normalizeGoogleResourceKey(`https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`),
    normalizeGoogleResourceKey(`https://docs.google.com/document/d/${DOC_ID}/view`),
  );
});

check('error classification', () => {
  assert.equal(classifyGoogleApiFailure({ code: 403 }).code, 'GOOGLE_PERMISSION_DENIED');
  assert.equal(classifyGoogleApiFailure({ response: { status: 404 } }).code, 'GOOGLE_RESOURCE_NOT_FOUND');
  assert.equal(isRetryableGoogleFailure({ response: { status: 429 } }), true);
  assert.ok(!sanitizeUrlForLog('https://x.com/?access_token=SECRET').includes('SECRET'));
  assert.equal(new GoogleIngestionError('GOOGLE_AUTH_REQUIRED', 'm', 401).httpStatus, 401);
});

check('forms API ingestion', () => {
  const drafts = ingestGoogleFormsApiResponse(
    {
      info: { title: 'Sample Quiz', description: 'Demo form' },
      items: [
        { itemId: 'sec1', pageBreakItem: { title: 'Section A', description: 'Intro' } },
        {
          itemId: 'q1',
          title: 'Capital of France?',
          questionItem: {
            question: {
              questionId: 'qq1',
              required: true,
              grading: {
                pointValue: 2,
                correctAnswers: { answers: [{ value: 'Paris' }] },
              },
              choiceQuestion: {
                type: 'RADIO',
                options: [{ value: 'Paris' }, { value: 'London' }],
              },
            },
          },
        },
        {
          itemId: 'q2',
          title: 'Select primes',
          questionItem: {
            question: {
              questionId: 'qq2',
              choiceQuestion: {
                type: 'CHECKBOX',
                options: [{ value: '2' }, { value: '4' }],
              },
            },
          },
        },
        {
          itemId: 'q3',
          title: 'Name a mammal',
          questionItem: {
            question: {
              questionId: 'qq3',
              textQuestion: { paragraph: false },
              grading: { correctAnswers: { answers: [{ value: 'Dog' }] } },
            },
          },
        },
      ],
    },
    { formId: FORM_ID, sourceUrl: `https://docs.google.com/forms/d/${FORM_ID}/edit` },
  );
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].type, 'multiple_choice');
  assert.equal(drafts[0].options?.find((o) => o.isCorrect)?.text, 'Paris');
  assert.equal((drafts[0].metadata as any).section, 'Section A');
  assert.equal((drafts[0].metadata as any).sectionDescription, 'Intro');
  assert.equal(drafts[1].type, 'multiple_select');
  assert.equal(drafts[2].type, 'short_answer');
  assert.equal(computeGoogleFormsStatistics(drafts).sectionsDetected, 1);
});

check('no invented answers', () => {
  const drafts = ingestGoogleFormsApiResponse(
    {
      info: { title: 'No key' },
      items: [
        {
          itemId: 'q1',
          title: 'Pick one',
          questionItem: {
            question: {
              questionId: 'qq1',
              choiceQuestion: {
                type: 'RADIO',
                options: [{ value: 'A' }, { value: 'B' }],
              },
            },
          },
        },
      ],
    },
    { formId: FORM_ID, sourceUrl: 'https://docs.google.com/forms/d/x' },
  );
  assert.ok(drafts[0].options?.every((o) => !o.isCorrect));
  assert.equal(drafts[0].correctAnswer, undefined);
});

check('public html forms', () => {
  const realistic = [
    null,
    [
      ['desc'],
      [
        [1, 'Section One', '', 13, null],
        [
          2,
          'MCQ question',
          'help',
          2,
          [[null, [['Option A', null, null, null, 1], ['Option B']], true]],
        ],
        [3, 'Checkbox question', '', 4, [[null, [['Red'], ['Blue']], false]]],
        [4, 'Short answer', '', 0, [[null, null, false]]],
      ],
    ],
    null,
    'Public Form Title',
  ];
  const html = `<html><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(realistic)};</script></html>`;
  const drafts = ingestPublicGoogleFormHtml(html, {
    formId: PUB_FORM_ID,
    sourceUrl: `https://docs.google.com/forms/d/e/${PUB_FORM_ID}/viewform`,
  });
  assert.ok(drafts.length >= 3);
  assert.equal(drafts[0].type, 'multiple_choice');
  assert.ok(drafts.some((d) => d.type === 'multiple_select'));
  assert.ok(drafts.some((d) => d.type === 'short_answer'));
  assert.equal((drafts[0].metadata as any).formTitle, 'Public Form Title');
});

check('empty html', () => {
  assert.deepEqual(
    ingestPublicGoogleFormHtml('<html></html>', { formId: 'x', sourceUrl: 'https://x' }),
    [],
  );
});

console.log(`\n${passed} checks passed`);
