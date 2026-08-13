import { useCallback, useMemo, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LearnerExperienceStep } from "../types";
import { extractRevisionCards } from "../revision/extractRevisionCards";
import {
  applyReview,
  countDue,
  isDue,
  loadSpacedDeck,
  saveSpacedDeck,
  type ReviewRating,
  type SpacedDeckState,
} from "../revision/spacedRepetition";

interface RevisionStudyPanelProps {
  universeId: string;
  publishVersionId: string;
  lessonId: string;
  lessonTitle: string;
  steps: LearnerExperienceStep[];
}

export function RevisionStudyPanel({
  universeId,
  publishVersionId,
  lessonId,
  lessonTitle,
  steps,
}: RevisionStudyPanelProps) {
  const cards = useMemo(
    () => extractRevisionCards(lessonId, lessonTitle, steps),
    [lessonId, lessonTitle, steps]
  );

  const [deck, setDeck] = useState<SpacedDeckState>(() =>
    loadSpacedDeck(universeId, publishVersionId || "local")
  );
  const [revealed, setRevealed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [studying, setStudying] = useState(false);

  const dueIds = useMemo(() => {
    const now = new Date();
    return cards.filter((c) => isDue(deck.cards[c.id], now)).map((c) => c.id);
  }, [cards, deck]);

  const dueCount = dueIds.length;
  const queue = studying ? dueIds : [];
  const activeId = queue[cursor] ?? null;
  const activeCard = cards.find((c) => c.id === activeId) ?? null;

  const persist = useCallback(
    (next: SpacedDeckState) => {
      setDeck(next);
      saveSpacedDeck(universeId, publishVersionId || "local", next);
    },
    [universeId, publishVersionId]
  );

  const start = () => {
    setStudying(true);
    setCursor(0);
    setRevealed(false);
  };

  const rate = (rating: ReviewRating) => {
    if (!activeId) return;
    const nextCards = {
      ...deck.cards,
      [activeId]: applyReview(deck.cards[activeId], rating),
    };
    persist({ cards: nextCards, updatedAt: new Date().toISOString() });
    setRevealed(false);
    const remaining = queue.filter((id) => id !== activeId);
    if (remaining.length === 0) {
      setStudying(false);
      setCursor(0);
      return;
    }
    setCursor((c) => Math.min(c, remaining.length - 1));
  };

  if (cards.length === 0) return null;

  return (
    <section
      className="mt-6 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 md:p-5"
      aria-labelledby="revision-study-heading"
      data-testid="revision-study-panel"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <RotateCcw className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" aria-hidden />
          <h2 id="revision-study-heading" className="text-sm font-semibold">
            Revision & spaced practice
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {dueCount} due · {cards.length} cards from this lesson
        </p>
      </div>

      {!studying && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="gap-1.5" onClick={start} disabled={dueCount === 0}>
            <Sparkles className="h-3.5 w-3.5" />
            Study due cards
          </Button>
          {dueCount === 0 && (
            <span className="text-xs text-muted-foreground">All caught up — check back later.</span>
          )}
        </div>
      )}

      {studying && activeCard && (
        <div className="mt-2 space-y-3">
          <p className="text-xs text-muted-foreground">
            Card {Math.min(cursor + 1, queue.length)} of {queue.length} · {activeCard.sourceLabel}
          </p>
          <div className="rounded-lg border bg-background p-4 min-h-[100px]">
            <p className="text-sm font-medium text-foreground">{activeCard.front}</p>
            {revealed ? (
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">{activeCard.back}</p>
            ) : (
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setRevealed(true)}>
                Reveal answer
              </Button>
            )}
          </div>
          {revealed && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Rate recall">
              <Button type="button" size="sm" variant="outline" onClick={() => rate("again")}>
                Again
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => rate("hard")}>
                Hard
              </Button>
              <Button type="button" size="sm" onClick={() => rate("good")}>
                Good
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => rate("easy")}>
                Easy
              </Button>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setStudying(false);
              setRevealed(false);
              setCursor(0);
            }}
          >
            End session
          </Button>
        </div>
      )}

      {studying && !activeCard && (
        <p className="text-sm text-muted-foreground">
          Session complete. Due remaining: {countDue(deck, cards.map((c) => c.id))}.
        </p>
      )}
    </section>
  );
}
