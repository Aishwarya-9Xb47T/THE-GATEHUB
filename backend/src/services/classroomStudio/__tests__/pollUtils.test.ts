import { describe, expect, it } from '@jest/globals';
import {
  validatePollDraft,
  relabelOptions,
  optionLabelAt,
  calculatePollCorrectness,
  aggregateOptionCounts,
  canonicalizeResponse,
  remainingSeconds,
  isTimerExpired,
  sanitizePollForStudent,
  extractResponseKeys,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
} from '../pollUtils';

describe('pollUtils', () => {
  it('generates A-J labels and relabels after delete', () => {
    expect(optionLabelAt(0)).toBe('A');
    expect(optionLabelAt(9)).toBe('J');
    const options = relabelOptions([
      { text: 'Lexical Analysis' },
      { text: 'Syntax Analysis' },
      { text: 'Semantic Analysis' },
    ]);
    expect(options.map((o) => o.label)).toEqual(['A', 'B', 'C']);
    const afterDelete = relabelOptions(options.filter((_, i) => i !== 1));
    expect(afterDelete.map((o) => o.label)).toEqual(['A', 'B']);
    expect(afterDelete[1]?.text).toBe('Semantic Analysis');
  });

  it('rejects empty question, one option, and duplicate options', () => {
    expect(validatePollDraft({ question: '', options: [{ text: 'A' }, { text: 'B' }] }).errors.length).toBeGreaterThan(0);
    expect(validatePollDraft({ question: 'Q?', options: [{ text: 'Only one' }] }).errors.join(' ')).toMatch(/at least 2/i);
    expect(
      validatePollDraft({
        question: 'Q?',
        options: [{ text: 'Same' }, { text: 'Same' }],
      }).errors.join(' '),
    ).toMatch(/unique/i);
  });

  it('allows 2-10 options and optional correct answers', () => {
    const draft = validatePollDraft({
      question: 'What is the first phase of a compiler?',
      pollKind: 'single_choice',
      options: [
        { text: 'Lexical Analysis', isCorrect: true },
        { text: 'Syntax Analysis' },
        { text: 'Semantic Analysis' },
        { text: 'Code Generation' },
      ],
    });
    expect(draft.errors).toEqual([]);
    expect(draft.normalized?.options).toHaveLength(4);
    expect(draft.normalized?.settings.correctAnswer).toBe('A');

    const opinion = validatePollDraft({
      question: 'What topic should we cover next?',
      options: [{ text: 'Parsing' }, { text: 'Code gen' }],
    });
    expect(opinion.normalized?.settings.correctAnswer).toBeNull();
    expect(MIN_POLL_OPTIONS).toBe(2);
    expect(MAX_POLL_OPTIONS).toBe(10);
  });

  it('enforces one correct answer for single choice and many for multiple choice', () => {
    const single = validatePollDraft({
      question: 'Q?',
      pollKind: 'single_choice',
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: true },
      ],
    });
    expect(single.errors.join(' ')).toMatch(/at most one/i);

    const multi = validatePollDraft({
      question: 'Q?',
      pollKind: 'multiple_choice',
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: true },
      ],
    });
    expect(multi.errors).toEqual([]);
    expect(multi.normalized?.settings.correctAnswer).toEqual(['A', 'B']);
    expect(multi.normalized?.interactionType).toBe('multiple_select');
  });

  it('calculates correctness and ignores opinion polls', () => {
    const options = relabelOptions([
      { text: 'Lexical Analysis', isCorrect: true },
      { text: 'Syntax Analysis', isCorrect: false },
    ]);
    expect(calculatePollCorrectness('single_choice', options, 'A')).toBe(true);
    expect(calculatePollCorrectness('single_choice', options, 'B')).toBe(false);
    const opinion = relabelOptions([{ text: 'A' }, { text: 'B' }]);
    expect(calculatePollCorrectness('single_choice', opinion, 'A')).toBeNull();
  });

  it('prevents counting the same student twice by aggregating labels', () => {
    const options = relabelOptions([{ text: 'Lexical Analysis' }, { text: 'Syntax Analysis' }]);
    const counts = aggregateOptionCounts(
      [{ response: { labels: ['A'] } }, { response: 'A' }, { response: ['B'] }],
      options,
    );
    expect(counts.A).toBe(2);
    expect(counts.B).toBe(1);
  });

  it('canonicalizes single and multiple choice responses', () => {
    const options = relabelOptions([{ text: 'Yes' }, { text: 'No' }]);
    const single = canonicalizeResponse('A', options, 'single_choice') as { labels: string[] };
    expect(single.labels).toEqual(['A']);
    const multi = canonicalizeResponse(['A', 'B'], options, 'multiple_choice') as { labels: string[] };
    expect(multi.labels).toEqual(['A', 'B']);
  });

  it('computes timer remaining from server timestamp', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    expect(remainingSeconds('2026-08-15T12:00:29.000Z', now)).toBe(29);
    expect(isTimerExpired('2026-08-15T11:59:59.000Z', now)).toBe(true);
  });

  it('strips correct answers from the student payload', () => {
    const publicPoll = sanitizePollForStudent({
      id: 'p1',
      type: 'poll',
      question: 'Q?',
      options: relabelOptions([{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }]),
      settings: { livePoll: true, pollKind: 'single_choice', showResults: false, status: 'active' },
    });
    expect(publicPoll.options.every((o) => o.isCorrect === undefined)).toBe(true);
    expect((publicPoll.settings as any).correctAnswer).toBeUndefined();
  });

  it('extracts keys from stored response objects', () => {
    expect(extractResponseKeys({ labels: ['A', 'C'] })).toEqual(['A', 'C']);
    expect(extractResponseKeys('B')).toEqual(['B']);
  });
});
