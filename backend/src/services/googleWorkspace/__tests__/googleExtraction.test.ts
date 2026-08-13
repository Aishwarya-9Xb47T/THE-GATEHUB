/**
 * GoogleResourceParser + Forms ingestion + error classification tests.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseGoogleResourceUrl,
  normalizeGoogleResourceKey,
  isValidGoogleResourceId,
  getGoogleResourceErrorMessage,
} from '../GoogleResourceParser.js';
import {
  classifyGoogleApiFailure,
  getGoogleExtractionUserMessage,
  GoogleIngestionError,
  isRetryableGoogleFailure,
  sanitizeUrlForLog,
} from '../googleExtractionErrors.js';
import {
  ingestGoogleFormsApiResponse,
  ingestPublicGoogleFormHtml,
  computeGoogleFormsStatistics,
} from '../googleFormsIngestion.js';

const DOC_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const FORM_ID = '1FAIpQLSfabcdefghijklmnopqrstuvwxyz012345';
const PUB_FORM_ID = '1FAIpQLSdabcdefghijklmnopqrstuvwxyz098765';

describe('GoogleResourceParser', () => {
  it('parses standard /edit Docs URL', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/document/d/${DOC_ID}/edit`,
    );
    expect(parsed?.resourceType).toBe('google_docs');
    expect(parsed?.resourceId).toBe(DOC_ID);
  });

  it('parses /edit?usp=sharing Docs URL', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`,
    );
    expect(parsed?.resourceId).toBe(DOC_ID);
    expect(parsed?.normalizedUrl).toBe(`https://docs.google.com/document/d/${DOC_ID}`);
  });

  it('parses /view Docs URL', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/document/d/${DOC_ID}/view`,
    );
    expect(parsed?.resourceId).toBe(DOC_ID);
  });

  it('parses bare Docs URL with extra query params and fragment', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/document/d/${DOC_ID}?usp=sharing&pli=1#heading=h.abc`,
    );
    expect(parsed?.resourceId).toBe(DOC_ID);
  });

  it('parses /u/N/ Docs URL', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/document/u/0/d/${DOC_ID}/edit`,
    );
    expect(parsed?.resourceId).toBe(DOC_ID);
  });

  it('parses Forms /edit URL', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/forms/d/${FORM_ID}/edit`,
    );
    expect(parsed?.resourceType).toBe('google_forms');
    expect(parsed?.resourceId).toBe(FORM_ID);
    expect(parsed?.isPublishedForm).toBe(false);
  });

  it('parses Forms /viewform URL', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/forms/d/${FORM_ID}/viewform`,
    );
    expect(parsed?.resourceId).toBe(FORM_ID);
  });

  it('parses Forms /viewform?usp=sharing', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/forms/d/${FORM_ID}/viewform?usp=sharing`,
    );
    expect(parsed?.resourceId).toBe(FORM_ID);
  });

  it('parses published /d/e/ Forms URL', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/forms/d/e/${PUB_FORM_ID}/viewform?usp=sf_link`,
    );
    expect(parsed?.isPublishedForm).toBe(true);
    expect(parsed?.resourceId).toBe(PUB_FORM_ID);
  });

  it('parses Drive file links as needing type resolution', () => {
    const parsed = parseGoogleResourceUrl(
      `https://drive.google.com/file/d/${DOC_ID}/view?usp=sharing`,
    );
    expect(parsed?.resourceType).toBe('google_drive');
    expect(parsed?.needsTypeResolution).toBe(true);
    expect(parsed?.resourceId).toBe(DOC_ID);
  });

  it('rejects invalid / short IDs', () => {
    expect(isValidGoogleResourceId('abc')).toBe(false);
    expect(
      parseGoogleResourceUrl('https://docs.google.com/document/d/short/edit'),
    ).toBeNull();
  });

  it('normalizes duplicate identity across URL variants', () => {
    const a = normalizeGoogleResourceKey(
      `https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`,
    );
    const b = normalizeGoogleResourceKey(
      `https://docs.google.com/document/d/${DOC_ID}/view`,
    );
    expect(a).toBe(b);
    expect(a).toBe(`google_docs:${DOC_ID}`);
  });

  it('returns null for unsupported Sheets links', () => {
    expect(
      parseGoogleResourceUrl('https://docs.google.com/spreadsheets/d/abc1234567890/edit'),
    ).toBeNull();
  });
});

describe('googleExtractionErrors', () => {
  it('classifies permission denied', () => {
    const result = classifyGoogleApiFailure({ code: 403, message: 'Permission denied' });
    expect(result.code).toBe('GOOGLE_PERMISSION_DENIED');
    expect(result.httpStatus).toBe(403);
  });

  it('classifies not found', () => {
    const result = classifyGoogleApiFailure({ response: { status: 404 } });
    expect(result.code).toBe('GOOGLE_RESOURCE_NOT_FOUND');
  });

  it('classifies quota / rate limit as retryable', () => {
    const err = { response: { status: 429 } };
    expect(classifyGoogleApiFailure(err).code).toBe('GOOGLE_QUOTA_ERROR');
    expect(isRetryableGoogleFailure(err)).toBe(true);
  });

  it('never exposes tokens in sanitized URLs', () => {
    const safe = sanitizeUrlForLog(
      'https://docs.google.com/document/d/abc?access_token=SECRET&usp=sharing',
    );
    expect(safe).not.toContain('SECRET');
  });

  it('maps user messages for all primary codes', () => {
    expect(getGoogleExtractionUserMessage('GOOGLE_AUTH_REQUIRED')).toMatch(/permission/i);
    expect(getGoogleResourceErrorMessage('INVALID_GOOGLE_URL')).toMatch(/Invalid Google link/i);
    expect(getGoogleExtractionUserMessage('GOOGLE_QUOTA_ERROR')).toMatch(/quota/i);
  });

  it('GoogleIngestionError preserves code + status', () => {
    const err = new GoogleIngestionError('GOOGLE_PERMISSION_DENIED', 'no access', 403);
    expect(err.code).toBe('GOOGLE_PERMISSION_DENIED');
    expect(err.httpStatus).toBe(403);
  });
});

describe('googleFormsIngestion', () => {
  it('maps multiple-choice, checkbox, short-answer, and sections from Forms API', () => {
    const formsContent = {
      info: { title: 'Sample Quiz', description: 'Demo form' },
      items: [
        { itemId: 'sec1', pageBreakItem: { title: 'Section A', description: 'Intro' } },
        {
          itemId: 'q1',
          title: 'Capital of France?',
          description: 'Choose one',
          questionItem: {
            question: {
              questionId: 'qq1',
              required: true,
              grading: {
                pointValue: 2,
                correctAnswers: { answers: [{ value: 'Paris' }] },
                generalFeedback: { text: 'Paris is correct' },
              },
              choiceQuestion: {
                type: 'RADIO',
                options: [{ value: 'Paris' }, { value: 'London' }, { value: 'Berlin' }],
              },
            },
          },
        },
        {
          itemId: 'q2',
          title: 'Select all primes',
          questionItem: {
            question: {
              questionId: 'qq2',
              choiceQuestion: {
                type: 'CHECKBOX',
                options: [{ value: '2' }, { value: '3' }, { value: '4' }],
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
    };

    const drafts = ingestGoogleFormsApiResponse(formsContent, {
      formId: FORM_ID,
      sourceUrl: `https://docs.google.com/forms/d/${FORM_ID}/edit`,
      formTitle: 'Sample Quiz',
    });

    expect(drafts).toHaveLength(3);
    expect(drafts[0].type).toBe('multiple_choice');
    expect(drafts[0].options?.find((o) => o.isCorrect)?.text).toBe('Paris');
    expect(drafts[0].metadata).toMatchObject({
      section: 'Section A',
      sectionDescription: 'Intro',
      marks: 2,
      required: true,
      sourceType: 'google_forms',
    });
    expect(drafts[1].type).toBe('multiple_select');
    expect(drafts[2].type).toBe('short_answer');
    expect(drafts[2].correctAnswer).toBe('Dog');

    const stats = computeGoogleFormsStatistics(drafts);
    expect(stats.questionsFound).toBe(3);
    expect(stats.sectionsDetected).toBe(1);
    expect(stats.answersDetected).toBeGreaterThanOrEqual(2);
  });

  it('does not invent correct answers when grading is absent', () => {
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
    expect(drafts[0].options?.every((o) => !o.isCorrect)).toBe(true);
    expect(drafts[0].correctAnswer).toBeUndefined();
    expect(drafts[0].warnings?.some((w) => /No answer key/i.test(w))).toBe(true);
  });

  it('parses public HTML FB_PUBLIC_LOAD_DATA_ payload', () => {
    // Public form item layout: [id, title, description, type, questionData]
    // questionData[0] = [unused, optionsRows, required]
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
            [
              [
                null,
                [
                  ['Option A', null, null, null, 1],
                  ['Option B'],
                ],
                true,
              ],
            ],
          ],
          [
            3,
            'Checkbox question',
            '',
            4,
            [
              [
                null,
                [['Red'], ['Blue']],
                false,
              ],
            ],
          ],
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

    expect(drafts.length).toBeGreaterThanOrEqual(3);
    expect(drafts[0].type).toBe('multiple_choice');
    expect(drafts.some((d) => d.type === 'multiple_select')).toBe(true);
    expect(drafts.some((d) => d.type === 'short_answer')).toBe(true);
    expect(drafts[0].metadata).toMatchObject({ formTitle: 'Public Form Title' });
  });

  it('returns empty for inaccessible / empty HTML', () => {
    const drafts = ingestPublicGoogleFormHtml('<html>no form data</html>', {
      formId: 'x',
      sourceUrl: 'https://docs.google.com/forms/d/x',
    });
    expect(drafts).toEqual([]);
  });
});
