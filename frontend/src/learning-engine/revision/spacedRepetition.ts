/**
 * Lightweight SM-2–inspired spaced repetition (local to device).
 * Stores only scheduling metadata; card content comes from published experience.
 */

export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface SpacedCardState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string; // ISO
  lastRating?: ReviewRating;
}

export interface SpacedDeckState {
  cards: Record<string, SpacedCardState>;
  updatedAt: string;
}

function storageKey(universeId: string, publishVersionId: string): string {
  return `lu-srs-v1:${universeId}:${publishVersionId}`;
}

export function loadSpacedDeck(universeId: string, publishVersionId: string): SpacedDeckState {
  try {
    const raw = localStorage.getItem(storageKey(universeId, publishVersionId));
    if (!raw) return { cards: {}, updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as SpacedDeckState;
    return parsed?.cards ? parsed : { cards: {}, updatedAt: new Date().toISOString() };
  } catch {
    return { cards: {}, updatedAt: new Date().toISOString() };
  }
}

export function saveSpacedDeck(
  universeId: string,
  publishVersionId: string,
  deck: SpacedDeckState
): void {
  try {
    localStorage.setItem(
      storageKey(universeId, publishVersionId),
      JSON.stringify({ ...deck, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* quota */
  }
}

export function defaultCardState(now = new Date()): SpacedCardState {
  return {
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now.toISOString(),
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  return d.toISOString();
}

/** Apply review rating and return updated card state. */
export function applyReview(
  state: SpacedCardState | undefined,
  rating: ReviewRating,
  now = new Date()
): SpacedCardState {
  const prev = state ?? defaultCardState(now);
  let { ease, intervalDays, repetitions } = prev;

  if (rating === "again") {
    repetitions = 0;
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = rating === "easy" ? 2 : 1;
    else if (repetitions === 2) intervalDays = rating === "easy" ? 4 : 3;
    else {
      const factor = rating === "hard" ? 1.2 : rating === "good" ? ease : ease + 0.15;
      intervalDays = Math.max(1, Math.round(intervalDays * factor));
    }
    if (rating === "hard") ease = Math.max(1.3, ease - 0.15);
    if (rating === "easy") ease = ease + 0.15;
  }

  return {
    ease,
    intervalDays,
    repetitions,
    dueAt: addDays(now.toISOString(), intervalDays === 0 ? 0 : intervalDays),
    lastRating: rating,
  };
}

export function isDue(state: SpacedCardState | undefined, now = new Date()): boolean {
  if (!state) return true;
  return new Date(state.dueAt).getTime() <= now.getTime();
}

export function countDue(deck: SpacedDeckState, cardIds: string[], now = new Date()): number {
  return cardIds.filter((id) => isDue(deck.cards[id], now)).length;
}
