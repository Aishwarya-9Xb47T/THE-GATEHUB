export const POLL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 10;

export type LivePollKind =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'yes_no'
  | 'rating'
  | 'short_answer'
  | 'numeric';

export interface PollOption {
  id: string;
  label: string;
  text: string;
  isCorrect?: boolean;
  order?: number;
}

export function optionLabelAt(index: number): string {
  return POLL_LABELS[index] ?? String(index + 1);
}

export function createEmptyOption(index: number): PollOption {
  return {
    id: `opt_${index}_${Math.random().toString(36).slice(2, 8)}`,
    label: optionLabelAt(index),
    text: '',
    isCorrect: false,
    order: index,
  };
}

export function relabelPollOptions(options: PollOption[]): PollOption[] {
  return options.map((option, index) => ({
    ...option,
    label: optionLabelAt(index),
    order: index,
  }));
}

export function defaultOptionsForKind(kind: LivePollKind): PollOption[] {
  if (kind === 'true_false') {
    return relabelPollOptions([
      { id: 'opt_true', label: 'A', text: 'True', isCorrect: false, order: 0 },
      { id: 'opt_false', label: 'B', text: 'False', isCorrect: false, order: 1 },
    ]);
  }
  if (kind === 'yes_no') {
    return relabelPollOptions([
      { id: 'opt_yes', label: 'A', text: 'Yes', isCorrect: false, order: 0 },
      { id: 'opt_no', label: 'B', text: 'No', isCorrect: false, order: 1 },
    ]);
  }
  return [createEmptyOption(0), createEmptyOption(1)];
}

export function usesChoiceOptions(kind: LivePollKind): boolean {
  return kind === 'single_choice' || kind === 'multiple_choice' || kind === 'true_false' || kind === 'yes_no';
}

export function normalizePollKind(raw?: string): LivePollKind {
  const value = String(raw || 'single_choice').toLowerCase();
  if (value === 'multiple_choice' || value === 'multiple_select' || value === 'multi') return 'multiple_choice';
  if (value === 'true_false') return 'true_false';
  if (value === 'yes_no') return 'yes_no';
  if (value === 'rating') return 'rating';
  if (value === 'short_answer' || value === 'open_answer') return 'short_answer';
  if (value === 'numeric' || value === 'numeric_answer') return 'numeric';
  return 'single_choice';
}

export function parsePollOptions(raw: unknown): PollOption[] {
  if (!Array.isArray(raw)) return [];
  return relabelPollOptions(
    raw.map((item, index) => {
      if (typeof item === 'string') {
        return { id: `opt_${index}`, label: optionLabelAt(index), text: item, order: index };
      }
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? `opt_${index}`),
        label: String(row.label ?? optionLabelAt(index)),
        text: String(row.text ?? ''),
        isCorrect: Boolean(row.isCorrect),
        order: typeof row.order === 'number' ? row.order : index,
      };
    }),
  );
}

export function resolvePollContent(interaction: any, slide?: any) {
  const settings = (interaction?.settings ?? {}) as Record<string, unknown>;
  const fromInteraction = parsePollOptions(interaction?.options ?? settings.options);
  const fromSlide = Array.isArray(slide?.parsedOptions) ? parsePollOptions(slide.parsedOptions) : [];
  const options = fromInteraction.length > 0 ? fromInteraction : fromSlide;
  const question =
    String(interaction?.question || settings.question || slide?.title || '').trim() || 'Live poll';
  const description = String(settings.description || '').trim();
  const pollKind = normalizePollKind(String(settings.pollKind || interaction?.type || 'single_choice'));
  return {
    question,
    description,
    options,
    pollKind,
    allowChangeAnswer: Boolean(settings.allowChangeAnswer ?? settings.allowRevote),
    showResults: settings.showResults !== false,
    anonymous: Boolean(settings.anonymous),
    timerEnabled: Boolean(settings.timerEnabled || interaction?.timerEnabled),
    timerEndsAt: (settings.timerEndsAt || interaction?.timerEndsAt) as string | undefined,
    durationSeconds:
      (typeof settings.durationSeconds === 'number' ? settings.durationSeconds : undefined) ??
      interaction?.duration ??
      null,
    status: String(settings.status || interaction?.status || 'active'),
    required: Boolean(settings.required),
    shuffleOptions: Boolean(settings.shuffleOptions),
  };
}

export function remainingSeconds(timerEndsAt?: string | null, nowMs: number = Date.now()): number | null {
  if (!timerEndsAt) return null;
  const end = new Date(timerEndsAt).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

export function formatPollTimer(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function validatePollForm(input: {
  question: string;
  pollKind: LivePollKind;
  options: PollOption[];
  timerEnabled: boolean;
  durationSeconds: number | null;
}): string[] {
  const errors: string[] = [];
  if (!input.question.trim()) errors.push('Enter a poll question.');
  if (usesChoiceOptions(input.pollKind)) {
    if (input.options.length < MIN_POLL_OPTIONS) errors.push('Add at least 2 options.');
    if (input.options.length > MAX_POLL_OPTIONS) errors.push('Polls can have at most 10 options.');
    if (input.options.some((option) => !option.text.trim())) errors.push('Every option needs text.');
    const texts = input.options.map((option) => option.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) errors.push('Options must be unique.');
    const correctCount = input.options.filter((option) => option.isCorrect).length;
    if (input.pollKind !== 'multiple_choice' && correctCount > 1) {
      errors.push('Single-choice polls can mark at most one correct answer.');
    }
  }
  if (input.timerEnabled && (!input.durationSeconds || input.durationSeconds <= 0)) {
    errors.push('Choose a timer duration or turn the timer off.');
  }
  return errors;
}
