import { describe, expect, it } from 'vitest';
import {
  createEmptyOption,
  defaultOptionsForKind,
  relabelPollOptions,
  validatePollForm,
  resolvePollContent,
  remainingSeconds,
  formatPollTimer,
  MAX_POLL_OPTIONS,
} from './pollOptions';

describe('pollOptions', () => {
  it('adds, removes, and relabels options A-J', () => {
    let options = [createEmptyOption(0), createEmptyOption(1), createEmptyOption(2)];
    options[0]!.text = 'Lexical Analysis';
    options[1]!.text = 'Syntax Analysis';
    options[2]!.text = 'Semantic Analysis';
    options = relabelPollOptions(options);
    expect(options.map((o) => o.label)).toEqual(['A', 'B', 'C']);
    options = relabelPollOptions(options.filter((_, i) => i !== 1));
    expect(options.map((o) => o.label)).toEqual(['A', 'B']);
    expect(options[1]?.text).toBe('Semantic Analysis');
    expect(MAX_POLL_OPTIONS).toBe(10);
  });

  it('validates empty question, one option, duplicates, and timer', () => {
    expect(validatePollForm({ question: '', pollKind: 'single_choice', options: defaultOptionsForKind('single_choice'), timerEnabled: false, durationSeconds: null }).length).toBeGreaterThan(0);
    expect(validatePollForm({
      question: 'Q?',
      pollKind: 'single_choice',
      options: [{ id: '1', label: 'A', text: 'Only' }],
      timerEnabled: false,
      durationSeconds: null,
    }).join(' ')).toMatch(/at least 2/i);
    expect(validatePollForm({
      question: 'Q?',
      pollKind: 'single_choice',
      options: [
        { id: '1', label: 'A', text: 'Same' },
        { id: '2', label: 'B', text: 'Same' },
      ],
      timerEnabled: true,
      durationSeconds: null,
    }).join(' ')).toMatch(/unique|timer/i);
  });

  it('resolves poll content from interaction.options instead of hardcoded A-D', () => {
    const content = resolvePollContent({
      question: 'What is the first phase of a compiler?',
      options: [
        { id: '1', label: 'A', text: 'Lexical Analysis' },
        { id: '2', label: 'B', text: 'Syntax Analysis' },
      ],
      settings: { pollKind: 'single_choice', showResults: true, allowChangeAnswer: true, timerEnabled: true, timerEndsAt: '2099-01-01T00:00:00.000Z' },
    });
    expect(content.options).toHaveLength(2);
    expect(content.options[0]?.text).toBe('Lexical Analysis');
    expect(content.allowChangeAnswer).toBe(true);
  });

  it('formats a synchronized countdown', () => {
    expect(formatPollTimer(29)).toBe('00:29');
    expect(remainingSeconds('2099-01-01T00:00:00.000Z', Date.parse('2099-01-01T00:00:00.000Z'))).toBe(0);
  });
});
