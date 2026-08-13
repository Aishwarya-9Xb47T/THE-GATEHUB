/**
 * ProcessingScreen (formerly AnalyzingScreen)
 *
 * Universal pipeline visualization — source-agnostic.
 * The steps reflect the Assessment Document pipeline, not file types.
 * Quiz Builder never sees where content came from — only the Assessment Document.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROCESSING_STEPS } from '@/lib/contentBuilder/types';

interface ProcessingScreenProps {
  /** Current step index (0 – PROCESSING_STEPS.length-1). Driven by parent via onProgress. */
  currentStep: number;
  /** e.g. "2 PDF files", "Google Doc", "pasted content" */
  sourceLabel?: string;
}

export function ProcessingScreen({ currentStep, sourceLabel }: ProcessingScreenProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  // Cascade step reveal for a satisfying animation
  useEffect(() => {
    const t = setTimeout(() => {
      setVisibleCount((v) => Math.min(v + 1, PROCESSING_STEPS.length));
    }, 100);
    return () => clearTimeout(t);
  }, [currentStep, visibleCount]);

  const isFinished = currentStep >= PROCESSING_STEPS.length - 1;
  const progressPercent = Math.round(((currentStep + 1) / PROCESSING_STEPS.length) * 100);

  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-10">
      {/* Central indicator */}
      <div className="relative flex items-center justify-center">
        {/* Outer ring — pulsing */}
        {!isFinished && (
          <div className="absolute h-28 w-28 rounded-full border border-primary/20 animate-ping" />
        )}
        {/* Middle ring */}
        <div
          className={cn(
            'absolute h-24 w-24 rounded-full border-2 transition-colors duration-700',
            isFinished ? 'border-emerald-500/40' : 'border-primary/30'
          )}
        />
        {/* Core */}
        <div
          className={cn(
            'relative h-20 w-20 rounded-full flex items-center justify-center transition-colors duration-700',
            isFinished ? 'bg-emerald-500/15' : 'bg-primary/10'
          )}
        >
          {isFinished ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-400 animate-in zoom-in duration-300" />
          ) : (
            <Loader2 className="h-9 w-9 text-primary animate-spin" />
          )}
        </div>
      </div>

      {/* Headline */}
      <div className="text-center space-y-1.5">
        <p className="text-xl font-bold text-white">
          {isFinished ? 'Ready for Review' : 'Building Assessment Document…'}
        </p>
        {sourceLabel && (
          <p className="text-sm text-white/45">{sourceLabel}</p>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm space-y-1.5">
        <div className="flex justify-between text-[11px] text-white/30">
          <span>Pipeline progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              isFinished
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                : 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <div className="w-full max-w-sm space-y-2.5">
        {PROCESSING_STEPS.map((step, i) => {
          const isCompleted = i < currentStep;
          const isActive = i === currentStep;
          const isVisible = i < visibleCount;

          return (
            <div
              key={step}
              className={cn(
                'flex items-center gap-3 transition-all duration-500',
                isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5'
              )}
            >
              {/* Step indicator */}
              <div className="shrink-0 h-5 w-5 flex items-center justify-center">
                {isCompleted ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  <div className="h-1.5 w-1.5 rounded-full bg-white/15" />
                )}
              </div>

              {/* Step label */}
              <span
                className={cn(
                  'text-sm transition-colors duration-300',
                  isCompleted
                    ? 'text-emerald-400'
                    : isActive
                    ? 'text-white font-semibold'
                    : 'text-white/25'
                )}
              >
                {step}
              </span>

              {/* Completion timestamp hint */}
              {isCompleted && (
                <span className="ml-auto text-[10px] text-emerald-400/50">✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Re-export as AnalyzingScreen for backward-compatibility with any other importers
export { ProcessingScreen as AnalyzingScreen };
