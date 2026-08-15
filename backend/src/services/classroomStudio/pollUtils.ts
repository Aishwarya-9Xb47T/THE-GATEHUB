import { AppError } from '../../middlewares/errorHandler.js';

export const POLL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 10;
export const TIMER_PRESETS_SECONDS = [10, 30, 60, 120, 300] as const;

export type LivePollKind =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'yes_no'
  | 'rating'
  | 'short_answer'
  | 'numeric';

export type LivePollStatus = 'draft' | 'active' | 'closed' | 'archived';

export interface LivePollOption {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface LivePollSettings {
  livePoll: true;
  description?: string;
  pollKind: LivePollKind;
  anonymous: boolean;
  showResults: boolean;
  allowChangeAnswer: boolean;
  required: boolean;
  shuffleOptions: boolean;
  timerEnabled: boolean;
  durationSeconds: number | null;
  status: LivePollStatus;
  launchedAt?: string;
  closedAt?: string;
  timerEndsAt?: string | null;
  correctAnswer?: string | string[] | null;
}

export interface PollDraftInput {
  title?: string;
  question?: string;
  description?: string;
  type?: string;
  pollKind?: LivePollKind;
  options?: Array<{ id?: string; label?: string; text?: string; isCorrect?: boolean; order?: number }>;
  anonymous?: boolean;
  showResults?: boolean;
  allowChangeAnswer?: boolean;
  required?: boolean;
  shuffleOptions?: boolean;
  timerEnabled?: boolean;
  durationSeconds?: number | null;
  duration?: number | null;
}

export interface NormalizedPoll {
  title: string;
  question: string;
  description: string;
  pollKind: LivePollKind;
  interactionType: string;
  options: LivePollOption[];
  settings: LivePollSettings;
  duration: number | null;
}

export function optionLabelAt(index: number): string {
  if (index < 0 || index >= POLL_LABELS.length) {
    throw new Error(`Option index ${index} is out of range`);
  }
  return POLL_LABELS[index]!;
}

export function newOptionId(): string {
  return `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function relabelOptions(
  options: Array<Partial<LivePollOption> & { text?: string }>,
): LivePollOption[] {
  return options.map((option, index) => ({
    id: option.id && String(option.id).trim() ? String(option.id) : newOptionId(),
    label: optionLabelAt(index),
    text: String(option.text ?? '').trim(),
    isCorrect: Boolean(option.isCorrect),
    order: index,
  }));
}

export function defaultOptionsForKind(kind: LivePollKind): LivePollOption[] {
  if (kind === 'true_false') {
    return relabelOptions([
      { text: 'True', isCorrect: false },
      { text: 'False', isCorrect: false },
    ]);
  }
  if (kind === 'yes_no') {
    return relabelOptions([
      { text: 'Yes', isCorrect: false },
      { text: 'No', isCorrect: false },
    ]);
  }
  return relabelOptions([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
}

export function normalizePollKind(raw?: string): LivePollKind {
  const value = String(raw || 'single_choice').toLowerCase();
  if (value === 'multiple_choice' || value === 'multiple_select' || value === 'multi') {
    return 'multiple_choice';
  }
  if (value === 'true_false' || value === 'true/false') return 'true_false';
  if (value === 'yes_no' || value === 'yes/no') return 'yes_no';
  if (value === 'rating') return 'rating';
  if (value === 'short_answer' || value === 'open_answer') return 'short_answer';
  if (value === 'numeric' || value === 'numeric_answer') return 'numeric';
  if (value === 'mcq' || value === 'poll' || value === 'single_choice' || value === 'single') {
    return 'single_choice';
  }
  return 'single_choice';
}

export function toInteractionType(kind: LivePollKind): string {
  switch (kind) {
    case 'multiple_choice':
      return 'multiple_select';
    case 'true_false':
      return 'true_false';
    case 'rating':
      return 'rating';
    case 'short_answer':
      return 'open_answer';
    case 'numeric':
      return 'open_answer';
    default:
      return 'poll';
  }
}

export function usesChoiceOptions(kind: LivePollKind): boolean {
  return kind === 'single_choice' || kind === 'multiple_choice' || kind === 'true_false' || kind === 'yes_no';
}

export function hasCorrectAnswers(options: LivePollOption[]): boolean {
  return options.some((option) => option.isCorrect);
}

export function deriveCorrectAnswer(
  kind: LivePollKind,
  options: LivePollOption[],
): string | string[] | null {
  const correct = options.filter((option) => option.isCorrect).map((option) => option.label);
  if (correct.length === 0) return null;
  if (kind === 'multiple_choice') return correct;
  return correct[0] ?? null;
}

export function validatePollDraft(input: PollDraftInput): { errors: string[]; normalized?: NormalizedPoll } {
  const errors: string[] = [];
  const pollKind = normalizePollKind(input.pollKind || input.type);
  const question = String(input.question ?? '').trim();
  const title = String(input.title ?? question).trim();
  const description = String(input.description ?? '').trim();

  if (!question) {
    errors.push('Enter a poll question.');
  }

  let options: LivePollOption[] = [];
  if (usesChoiceOptions(pollKind)) {
    const incoming = Array.isArray(input.options) ? input.options : [];
    options = relabelOptions(incoming);
    if (options.length < MIN_POLL_OPTIONS) {
      errors.push(`Add at least ${MIN_POLL_OPTIONS} options.`);
    }
    if (options.length > MAX_POLL_OPTIONS) {
      errors.push(`Polls can have at most ${MAX_POLL_OPTIONS} options.`);
    }
    const empty = options.filter((option) => !option.text);
    if (empty.length > 0) {
      errors.push('Every option needs text.');
    }
    const texts = options.map((option) => option.text.toLowerCase());
    if (new Set(texts).size !== texts.length) {
      errors.push('Options must be unique.');
    }
    const correctCount = options.filter((option) => option.isCorrect).length;
    if (pollKind === 'single_choice' || pollKind === 'true_false' || pollKind === 'yes_no') {
      if (correctCount > 1) {
        errors.push('Single-choice polls can mark at most one correct answer.');
      }
    }
  }

  const timerEnabled = Boolean(input.timerEnabled);
  let durationSeconds =
    input.durationSeconds ?? input.duration ?? null;
  if (durationSeconds != null) {
    durationSeconds = Number(durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      errors.push('Timer duration must be a positive number of seconds.');
      durationSeconds = null;
    } else {
      durationSeconds = Math.round(durationSeconds);
    }
  }
  if (timerEnabled && (durationSeconds == null || durationSeconds <= 0)) {
    errors.push('Enable a timer duration or turn the timer off.');
  }

  if (errors.length > 0) {
    return { errors };
  }

  const settings: LivePollSettings = {
    livePoll: true,
    description: description || undefined,
    pollKind,
    anonymous: Boolean(input.anonymous),
    showResults: input.showResults !== false,
    allowChangeAnswer: Boolean(input.allowChangeAnswer),
    required: Boolean(input.required),
    shuffleOptions: Boolean(input.shuffleOptions),
    timerEnabled,
    durationSeconds: timerEnabled ? durationSeconds : null,
    status: 'draft',
    correctAnswer: deriveCorrectAnswer(pollKind, options),
  };

  return {
    errors,
    normalized: {
      title: title || question,
      question,
      description,
      pollKind,
      interactionType: toInteractionType(pollKind),
      options,
      settings,
      duration: timerEnabled ? durationSeconds : null,
    },
  };
}

export function getPollSettings(interaction: { settings?: unknown; duration?: number | null }): LivePollSettings {
  const raw = (interaction.settings ?? {}) as Record<string, unknown>;
  const pollKind = normalizePollKind(String(raw.pollKind || raw.type || 'single_choice'));
  const timerEnabled = Boolean(raw.timerEnabled);
  const durationSeconds =
    typeof raw.durationSeconds === 'number'
      ? raw.durationSeconds
      : typeof interaction.duration === 'number'
        ? interaction.duration
        : null;
  return {
    livePoll: raw.livePoll === true,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    pollKind,
    anonymous: Boolean(raw.anonymous),
    showResults: raw.showResults !== false,
    allowChangeAnswer: Boolean(raw.allowChangeAnswer ?? raw.allowRevote),
    required: Boolean(raw.required),
    shuffleOptions: Boolean(raw.shuffleOptions),
    timerEnabled,
    durationSeconds: timerEnabled ? durationSeconds : null,
    status: (raw.status as LivePollStatus) || 'draft',
    launchedAt: typeof raw.launchedAt === 'string' ? raw.launchedAt : undefined,
    closedAt: typeof raw.closedAt === 'string' ? raw.closedAt : undefined,
    timerEndsAt: typeof raw.timerEndsAt === 'string' ? raw.timerEndsAt : null,
    correctAnswer: (raw.correctAnswer as string | string[] | null | undefined) ?? null,
  };
}

export function parsePollOptions(raw: unknown): LivePollOption[] {
  if (!Array.isArray(raw)) return [];
  return relabelOptions(
    raw.map((item, index) => {
      if (typeof item === 'string') {
        return { text: item, order: index };
      }
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: typeof row.id === 'string' ? row.id : undefined,
        label: typeof row.label === 'string' ? row.label : undefined,
        text: String(row.text ?? row.label ?? ''),
        isCorrect: Boolean(row.isCorrect),
        order: typeof row.order === 'number' ? row.order : index,
      };
    }),
  );
}

export function remainingSeconds(timerEndsAt?: string | null, now: Date = new Date()): number | null {
  if (!timerEndsAt) return null;
  const end = new Date(timerEndsAt).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now.getTime()) / 1000));
}

export function isTimerExpired(timerEndsAt?: string | null, now: Date = new Date()): boolean {
  const remaining = remainingSeconds(timerEndsAt, now);
  return remaining != null && remaining <= 0;
}

export function extractResponseKeys(response: unknown): string[] {
  if (response == null) return [];
  if (Array.isArray(response)) {
    return response.flatMap((item) => extractResponseKeys(item));
  }
  if (typeof response === 'string' || typeof response === 'number' || typeof response === 'boolean') {
    return [String(response)];
  }
  if (typeof response === 'object') {
    const row = response as Record<string, unknown>;
    if (Array.isArray(row.labels)) return row.labels.map((item) => String(item));
    if (Array.isArray(row.optionLabels)) return row.optionLabels.map((item) => String(item));
    if (Array.isArray(row.optionIds)) return row.optionIds.map((item) => String(item));
    if (Array.isArray(row.selected)) return row.selected.flatMap((item) => extractResponseKeys(item));
    if (row.label != null) return [String(row.label)];
    if (row.text != null) return [String(row.text)];
    if (row.optionId != null) return [String(row.optionId)];
  }
  return [];
}

export function resolveSelectedOptions(
  response: unknown,
  options: LivePollOption[],
): LivePollOption[] {
  const keys = extractResponseKeys(response).map((key) => key.trim().toLowerCase());
  if (keys.length === 0) return [];
  const byId = new Map(options.map((option) => [option.id.toLowerCase(), option]));
  const byLabel = new Map(options.map((option) => [option.label.toLowerCase(), option]));
  const byText = new Map(options.map((option) => [option.text.toLowerCase(), option]));
  const selected: LivePollOption[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const match = byId.get(key) || byLabel.get(key) || byText.get(key);
    if (match && !seen.has(match.id)) {
      selected.push(match);
      seen.add(match.id);
    }
  }
  return selected;
}

export function canonicalizeResponse(
  response: unknown,
  options: LivePollOption[],
  kind: LivePollKind,
  responseTimeMs?: number,
): { labels: string[]; texts: string[]; optionIds: string[]; responseTimeMs?: number } | string | string[] | number {
  if (!usesChoiceOptions(kind)) {
    if (kind === 'numeric') {
      const value = typeof response === 'object' && response && 'answerText' in (response as object)
        ? (response as { answerText?: unknown }).answerText
        : response;
      return String(value ?? '').trim();
    }
    if (kind === 'rating') {
      return Number(response);
    }
    return typeof response === 'string' ? response : JSON.stringify(response);
  }
  const selected = resolveSelectedOptions(response, options);
  const payload = {
    optionIds: selected.map((option) => option.id),
    labels: selected.map((option) => option.label),
    texts: selected.map((option) => option.text),
    responseTimeMs,
  };
  if (kind === 'multiple_choice') {
    return payload;
  }
  return payload;
}

export function calculatePollCorrectness(
  kind: LivePollKind,
  options: LivePollOption[],
  response: unknown,
): boolean | null {
  const correct = options.filter((option) => option.isCorrect);
  if (correct.length === 0 || !usesChoiceOptions(kind)) {
    return null;
  }
  const selected = resolveSelectedOptions(response, options);
  if (kind === 'multiple_choice') {
    if (selected.length !== correct.length) return false;
    const correctIds = new Set(correct.map((option) => option.id));
    return selected.every((option) => correctIds.has(option.id));
  }
  return selected.length === 1 && selected[0]!.isCorrect;
}

export function aggregateOptionCounts(
  responses: Array<{ response: unknown }>,
  options: LivePollOption[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const option of options) {
    counts[option.label] = 0;
    counts[option.text] = 0;
    counts[option.id] = 0;
  }
  for (const row of responses) {
    const selected = resolveSelectedOptions(row.response, options);
    if (selected.length === 0) {
      for (const key of extractResponseKeys(row.response)) {
        counts[key] = (counts[key] || 0) + 1;
      }
      continue;
    }
    for (const option of selected) {
      counts[option.label] = (counts[option.label] || 0) + 1;
      counts[option.text] = (counts[option.text] || 0) + 1;
      counts[option.id] = (counts[option.id] || 0) + 1;
    }
  }
  return counts;
}

export function buildOptionStats(
  options: LivePollOption[],
  optionCounts: Record<string, number>,
  totalResponses: number,
  includeCorrect: boolean,
) {
  return options.map((option) => {
    const count = optionCounts[option.label] || optionCounts[option.text] || optionCounts[option.id] || 0;
    return {
      id: option.id,
      label: option.label,
      text: option.text,
      count,
      percent: totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0,
      isCorrect: includeCorrect ? option.isCorrect : undefined,
    };
  });
}

export function sanitizePollForStudent(interaction: {
  id: string;
  type: string;
  title?: string | null;
  question?: string | null;
  options?: unknown;
  settings?: unknown;
  duration?: number | null;
  points?: number;
  slideId?: string;
}, opts?: { shuffleSeed?: string; revealed?: boolean }) {
  const settings = getPollSettings(interaction);
  const options = parsePollOptions(interaction.options);
  const shuffled = settings.shuffleOptions && opts?.shuffleSeed
    ? shuffleWithSeed(options, opts.shuffleSeed)
    : options;
  const publicOptions = shuffled.map((option) => ({
    id: option.id,
    label: option.label,
    text: option.text,
    order: option.order,
    isCorrect: opts?.revealed ? option.isCorrect : undefined,
  }));
  return {
    id: interaction.id,
    type: interaction.type,
    title: interaction.title,
    question: interaction.question,
    options: publicOptions,
    duration: interaction.duration,
    points: interaction.points ?? 0,
    slideId: interaction.slideId,
    timerEnabled: settings.timerEnabled,
    timerEndsAt: settings.timerEndsAt,
    status: settings.status,
    settings: {
      livePoll: true,
      description: settings.description,
      pollKind: settings.pollKind,
      anonymous: settings.anonymous,
      showResults: settings.showResults,
      allowChangeAnswer: settings.allowChangeAnswer,
      required: settings.required,
      shuffleOptions: settings.shuffleOptions,
      timerEnabled: settings.timerEnabled,
      durationSeconds: settings.durationSeconds,
      status: settings.status,
      launchedAt: settings.launchedAt,
      closedAt: settings.closedAt,
      timerEndsAt: settings.timerEndsAt,
    },
  };
}

export function shuffleWithSeed<T extends { id: string }>(items: T[], seed: string): T[] {
  const copy = [...items];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = copy.length - 1; i > 0; i -= 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const j = hash % (i + 1);
    const current = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = current;
  }
  return copy;
}

export function formatTimer(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function assertPollAcceptingResponses(interaction: { settings?: unknown; duration?: number | null }) {
  const settings = getPollSettings(interaction);
  if (settings.status === 'closed' || settings.status === 'archived') {
    throw new AppError(400, 'This poll is already closed');
  }
  if (settings.timerEnabled && isTimerExpired(settings.timerEndsAt)) {
    throw new AppError(400, 'Time expired. You can no longer submit.');
  }
}

export function buildCanonicalPollResponse(
  interaction: { type: string; options?: unknown; settings?: unknown },
  response: unknown,
  responseTimeMs?: number,
) {
  const settings = getPollSettings(interaction);
  const options = parsePollOptions(interaction.options);
  if (usesChoiceOptions(settings.pollKind) && options.length > 0) {
    const selected = canonicalizeResponse(response, options, settings.pollKind, responseTimeMs) as {
      optionIds: string[];
      labels: string[];
      texts: string[];
    };
    if (!selected.optionIds?.length) {
      throw new AppError(400, 'Select a valid poll option.');
    }
    if (settings.pollKind !== 'multiple_choice' && selected.optionIds.length !== 1) {
      throw new AppError(400, 'Choose exactly one option.');
    }
    return selected;
  }
  return response;
}

export function scorePollResponse(
  interaction: { type: string; options?: unknown; settings?: unknown },
  response: unknown,
) {
  const settings = getPollSettings(interaction);
  const options = parsePollOptions(interaction.options);
  return calculatePollCorrectness(settings.pollKind, options, response);
}

export function toPublicPollSummary(summary: Record<string, unknown>, showResults: boolean) {
  if (!showResults) {
    return {
      totalResponses: summary.totalResponses,
      pending: summary.pending,
      participationPercent: summary.participationPercent,
      responseRate: summary.responseRate,
      remainingSeconds: summary.remainingSeconds,
      status: summary.status,
      question: summary.question,
    };
  }
  return {
    totalResponses: summary.totalResponses,
    pending: summary.pending,
    participationPercent: summary.participationPercent,
    responseRate: summary.responseRate,
    averageDuration: summary.averageDuration,
    optionCounts: summary.optionCounts,
    optionStats: Array.isArray(summary.optionStats)
      ? (summary.optionStats as Array<Record<string, unknown>>).map(({ isCorrect, ...rest }) => rest)
      : undefined,
    remainingSeconds: summary.remainingSeconds,
    status: summary.status,
    question: summary.question,
    accuracyPercent: summary.status === 'closed' ? summary.accuracyPercent : null,
  };
}
