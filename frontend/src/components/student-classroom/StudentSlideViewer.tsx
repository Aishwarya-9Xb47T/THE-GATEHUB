import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Radio, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SlideRenderer } from '@/components/classroom/SlideRenderer';
import { InteractionOverlay, type Interaction } from '@/components/classroom/InteractionOverlay';
import {
  resolveStudentPollOverlay,
  studentPollOverlayAutoDismissMs,
} from '@/lib/classroom/studentPollOverlay';
import type { NavigationMode } from '@/hooks/useStudentClassroom';

interface Slide {
  id: string;
  order: number;
  title: string;
  content?: any;
  interactions: any[];
}

interface Props {
  currentSlide: Slide | null;
  currentIndex: number;
  totalSlides: number;
  navigation: NavigationMode;
  pointer: { x: number; y: number } | null;
  activeInteraction: Interaction | null;
  submission: any | null;
  revealed?: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onInteractionSubmit: (response: any) => Promise<void>;
  connectionStatus: 'connected' | 'disconnected' | 'recovering';
  pollResults?: any;
  remainingSeconds?: number | null;
}

function formatResponseLabel(response: unknown): string {
  if (Array.isArray(response)) return response.join(', ');
  if (response == null) return '';
  return String(response);
}

export function StudentSlideViewer({
  currentSlide,
  currentIndex,
  totalSlides,
  navigation,
  pointer,
  activeInteraction,
  submission,
  revealed = false,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onInteractionSubmit,
  pollResults,
  remainingSeconds,
}: Props) {
  const isLocked = navigation === 'locked';
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const expired = remainingSeconds === 0;
  const hasSubmitted = Boolean(submission && activeInteraction);
  const overlayPlan = resolveStudentPollOverlay({
    hasActiveInteraction: Boolean(activeInteraction),
    hasSlide: Boolean(currentSlide),
    hasSubmitted,
    instructorClosed: false,
    expired,
    confirmationElapsedMs: overlayDismissed ? Number.POSITIVE_INFINITY : (hasSubmitted ? 0 : null),
  });
  const keepOverlay = overlayPlan.visible && !overlayDismissed;
  const awaitingAnswer = Boolean(activeInteraction && currentSlide && !submission && keepOverlay);

  useEffect(() => {
    setOverlayDismissed(false);
  }, [activeInteraction?.id]);

  useEffect(() => {
    const autoDismissMs = studentPollOverlayAutoDismissMs({
      hasSubmitted,
      expired,
      instructorClosed: false,
    });
    if (autoDismissMs == null) {
      if (!hasSubmitted && !expired) setOverlayDismissed(false);
      return;
    }
    const timer = window.setTimeout(() => setOverlayDismissed(true), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [activeInteraction?.id, hasSubmitted, expired]);

  const isCorrect = (() => {
    if (!submission || !activeInteraction?.settings?.correctAnswer) return undefined;
    const correct = activeInteraction.settings.correctAnswer;
    const response = submission.response;
    if (Array.isArray(correct)) {
      if (Array.isArray(response)) {
        return (
          correct.length === response.length &&
          correct.every((c: string) => response.includes(c))
        );
      }
      return correct.includes(response);
    }
    return String(correct).toLowerCase() === String(response).toLowerCase();
  })();

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Slide area — always visible so students follow the instructor */}
      <div className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_#1e2a4a_0%,_#080d1b_70%)] overflow-hidden min-h-0">
        {currentSlide ? (
          <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8">
            <div
              className="w-full max-w-5xl bg-white rounded-xl shadow-2xl relative overflow-hidden"
              style={{ aspectRatio: '16/9', maxHeight: '100%' }}
            >
              <SlideRenderer
                content={currentSlide.content}
                title={currentSlide.title}
                slideNumber={currentSlide.order}
                pointer={pointer}
                className="w-full h-full"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-slate-500">
              <div className="text-6xl mb-4">🎓</div>
              <p>Waiting for instructor to begin…</p>
            </div>
          </div>
        )}

        {/* Submitted — keep watching the live slide */}
        {hasSubmitted && !revealed && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/90 px-4 py-2 shadow-lg backdrop-blur-sm">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-100 font-medium">Answer submitted</span>
            <span className="text-xs text-emerald-300/80 hidden sm:inline">
              · {formatResponseLabel(submission.response)} · following live
            </span>
          </div>
        )}

        {/* Revealed answer — compact banner, slide stays visible */}
        {hasSubmitted && revealed && (
          <div
            className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-xl border px-5 py-3 shadow-xl backdrop-blur-md max-w-md w-[calc(100%-2rem)] ${
              isCorrect === true
                ? 'border-emerald-500/40 bg-emerald-950/90'
                : isCorrect === false
                  ? 'border-rose-500/40 bg-rose-950/90'
                  : 'border-violet-500/40 bg-violet-950/90'
            }`}
          >
            {isCorrect === true ? (
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : isCorrect === false ? (
              <X className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <Check className="w-5 h-5 text-violet-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {isCorrect === true ? 'Correct!' : isCorrect === false ? 'Answer revealed' : 'Results shared'}
              </p>
              <p className="text-xs text-white/70 truncate">
                Your answer: {formatResponseLabel(submission.response)}
              </p>
            </div>
          </div>
        )}

        {/* Pending poll — subtle nudge without blocking slide */}
        {awaitingAnswer && (
          <div className="absolute top-4 right-4 z-20">
            <Badge className="bg-violet-600 hover:bg-violet-600 text-white animate-pulse shadow-lg">
              {activeInteraction!.type.replace(/_/g, ' ')} · tap to answer
            </Badge>
          </div>
        )}

        {currentSlide && (
          <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs text-white/70 select-none z-10">
            {currentIndex + 1} / {totalSlides}
          </div>
        )}

        {isLocked && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs text-emerald-300 z-10">
            <Radio className="w-3 h-3" />
            <span>Following live</span>
          </div>
        )}
      </div>

      {/* Full-screen overlay only while answering (not after submit) */}
      {keepOverlay && (
        <InteractionOverlay
          interaction={activeInteraction!}
          slide={currentSlide!}
          submission={submission}
          onSubmit={onInteractionSubmit}
          revealed={revealed}
          isCorrect={isCorrect}
          results={pollResults}
          remainingSeconds={remainingSeconds}
        />
      )}

      {!isLocked && (
        <div className="flex items-center justify-center gap-4 py-2 bg-slate-900/80 border-t border-white/10 shrink-0">
          <Button
            variant="outline"
            size="icon"
            disabled={!canGoPrev}
            onClick={onPrev}
            className="border-white/20 bg-white/5 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-sm text-slate-400 min-w-[60px] text-center">
            {currentIndex + 1} / {totalSlides}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={!canGoNext}
            onClick={onNext}
            className="border-white/20 bg-white/5 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
