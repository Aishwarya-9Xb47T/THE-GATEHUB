import { describe, expect, it } from '@jest/globals';
import { AppError } from '../../../middlewares/errorHandler';
import {
  assertPollAcceptingResponses,
  buildCanonicalPollResponse,
  scorePollResponse,
} from '../pollUtils';

describe('poll authorization and response rules', () => {
  const activePoll = {
    type: 'poll',
    options: [
      { id: '1', label: 'A', text: 'Lexical Analysis', isCorrect: true, order: 0 },
      { id: '2', label: 'B', text: 'Syntax Analysis', isCorrect: false, order: 1 },
    ],
    settings: {
      livePoll: true,
      pollKind: 'single_choice',
      status: 'active',
      allowChangeAnswer: false,
    },
  };

  it('rejects responses after close', () => {
    expect(() =>
      assertPollAcceptingResponses({ settings: { ...activePoll.settings, status: 'closed' } }),
    ).toThrow(AppError);
  });

  it('rejects responses after timer expiry', () => {
    expect(() =>
      assertPollAcceptingResponses({
        settings: { ...activePoll.settings, timerEnabled: true, timerEndsAt: '2000-01-01T00:00:00.000Z' },
      }),
    ).toThrow(/Time expired/i);
  });

  it('accepts a valid single-choice answer and scores it', () => {
    const canonical = buildCanonicalPollResponse(activePoll, 'A');
    expect((canonical as any).labels).toEqual(['A']);
    expect(scorePollResponse(activePoll, canonical)).toBe(true);
    expect(scorePollResponse(activePoll, 'B')).toBe(false);
  });

  it('accepts multiple-choice answers', () => {
    const multi = {
      ...activePoll,
      type: 'multiple_select',
      settings: { ...activePoll.settings, pollKind: 'multiple_choice' },
      options: [
        { id: '1', label: 'A', text: 'Lex', isCorrect: true, order: 0 },
        { id: '2', label: 'B', text: 'Syn', isCorrect: true, order: 1 },
        { id: '3', label: 'C', text: 'Sem', isCorrect: false, order: 2 },
      ],
    };
    const canonical = buildCanonicalPollResponse(multi, ['A', 'B']);
    expect(scorePollResponse(multi, canonical)).toBe(true);
    expect(scorePollResponse(multi, ['A'])).toBe(false);
  });

  it('rejects an unknown option', () => {
    expect(() => buildCanonicalPollResponse(activePoll, 'Z')).toThrow(/valid poll option/i);
  });
});
