/**
 * AssessmentReviewWorkspace (formerly ReviewQuestionsScreen)
 *
 * The Question Review step — shown before Quiz Builder.
 * Users see every extracted question with confidence scores, warnings,
 * and can edit, delete, or deselect before opening Quiz Builder.
 *
 * This component is source-agnostic — it only knows about AssessmentDocument questions.
 */

import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowRight,
  RotateCcw,
  FileCheck2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReviewQuestion, ReviewStatistics } from '@/lib/contentBuilder/types';
import { getConfidenceLevel } from '@/lib/contentBuilder/types';

interface AssessmentReviewWorkspaceProps {
  jobId: string;
  questions: ReviewQuestion[];
  statistics: ReviewStatistics;
  quizTitle: string;
  onBack: () => void;
  onContinue: (approvedIds: string[]) => Promise<void>;
  submitting?: boolean;
}

// ── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  const level = getConfidenceLevel(score);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border',
        level === 'high'
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
          : level === 'medium'
          ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
          : 'bg-red-500/10 border-red-500/25 text-red-400'
      )}
    >
      {score}%
    </span>
  );
}

// ── Question Card ────────────────────────────────────────────────────────────

function QuestionCard({
  q,
  index,
  selected,
  onToggle,
  onDelete,
}: {
  q: ReviewQuestion;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const level = getConfidenceLevel(q.confidence);
  const hasWarnings = q.warnings.length > 0;
  const isRejected = q.validationStatus === 'rejected';

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200 overflow-hidden',
        selected && !isRejected
          ? 'border-primary/35 bg-primary/[0.04]'
          : 'border-white/8 bg-white/[0.02]',
        isRejected && 'opacity-45'
      )}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={isRejected}
          className="mt-0.5 h-4 w-4 rounded border-white/25 bg-white/10 accent-primary cursor-pointer shrink-0"
        />

        {/* Number */}
        <span className="shrink-0 text-[11px] font-mono text-white/30 mt-0.5 min-w-[20px] text-right">
          {index + 1}.
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm text-white/85 leading-relaxed">
            {q.text.length > 180 ? `${q.text.slice(0, 180)}…` : q.text}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge score={q.confidence} />

            {/* Type badge */}
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/40 border border-white/10 capitalize">
              {q.type.replace('_', ' ')}
            </span>

            {Boolean((q as any).metadata?.table || (q as any).metadata?.tables) && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/20">
                Table
              </span>
            )}

            {Boolean((q as any).metadata?.code || (q as any).metadata?.codeBlocks) && (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400 border border-blue-500/20">
                Code
              </span>
            )}

            {Boolean((q as any).metadata?.formulas || (q as any).metadata?.equations) && (
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400 border border-violet-500/20">
                Formula
              </span>
            )}

            {Boolean((q as any).metadata?.images || (q as any).metadata?.diagram) && (
              <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] text-pink-400 border border-pink-500/20">
                Image
              </span>
            )}

            {Boolean((q as any).metadata?.passage || (q as any).metadata?.context) && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                Passage
              </span>
            )}

            {hasWarnings && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <AlertTriangle className="h-2.5 w-2.5" />
                {q.warnings.length} warning{q.warnings.length !== 1 ? 's' : ''}
              </span>
            )}

            {isRejected && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-red-500/10 border border-red-500/20 text-red-400">
                <XCircle className="h-2.5 w-2.5" />
                Auto-excluded
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
            title={expanded ? 'Collapse' : 'Preview'}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove question"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/8 px-4 py-3 space-y-3 bg-white/[0.01]">
          {/* Full question text */}
          <p className="text-sm text-white/75 leading-relaxed">{q.text}</p>

          {/* Answer options */}
          {q.options.length > 0 && (
            <div className="space-y-1.5">
              {q.options.map((opt) => (
                <div
                  key={opt.id}
                  className={cn(
                    'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
                    opt.isCorrect
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-white/[0.03] border border-white/5 text-white/50'
                  )}
                >
                  {opt.isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  {!opt.isCorrect && (
                    <div className="h-3.5 w-3.5 shrink-0 mt-0.5 rounded-full border border-white/20" />
                  )}
                  <span>{opt.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          {q.explanation && (
            <div className="rounded-lg bg-white/[0.04] border border-white/8 px-3 py-2 text-xs text-white/45 leading-relaxed">
              <span className="font-medium text-white/60 mr-1">Explanation:</span>
              {q.explanation}
            </div>
          )}

          {/* Warnings */}
          {q.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2 text-xs text-amber-400"
            >
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AssessmentReviewWorkspace({
  questions,
  statistics,
  quizTitle,
  onBack,
  onContinue,
  submitting,
}: AssessmentReviewWorkspaceProps) {
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(questions.filter((q) => q.validationStatus !== 'rejected').map((q) => q.id))
  );

  const visible = useMemo(
    () => questions.filter((q) => !deletedIds.has(q.id)),
    [questions, deletedIds]
  );

  const approvedCount = useMemo(
    () => visible.filter((q) => selectedIds.has(q.id)).length,
    [visible, selectedIds]
  );

  const nonRejectedVisible = useMemo(
    () => visible.filter((q) => q.validationStatus !== 'rejected'),
    [visible]
  );

  const allSelected = nonRejectedVisible.length > 0 && nonRejectedVisible.every((q) => selectedIds.has(q.id));

  const toggleAll = () => {
    const ids = nonRejectedVisible.map((q) => q.id);
    setSelectedIds(allSelected ? new Set() : new Set(ids));
  };

  const handleDelete = (id: string) => {
    setDeletedIds((prev) => new Set([...prev, id]));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleContinue = () => {
    const ids = visible.filter((q) => selectedIds.has(q.id)).map((q) => q.id);
    onContinue(ids);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-white">Assessment Review</h2>
        </div>
        <p className="text-sm text-white/45">
          GateHub detected{' '}
          <strong className="text-white">{statistics.questionsFound}</strong> questions.
          Select the ones to include, then open Quiz Builder.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: 'High confidence',
            value: statistics.highConfidence,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/8 border-emerald-500/15',
            dot: 'bg-emerald-400',
          },
          {
            label: 'Medium confidence',
            value: statistics.mediumConfidence,
            color: 'text-amber-400',
            bg: 'bg-amber-500/8 border-amber-500/15',
            dot: 'bg-amber-400',
          },
          {
            label: 'Low confidence',
            value: statistics.lowConfidence,
            color: 'text-red-400',
            bg: 'bg-red-500/8 border-red-500/15',
            dot: 'bg-red-400',
          },
        ].map((s) => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.bg)}>
            <div className="flex items-center gap-1.5 mb-1">
              <div className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
              <span className="text-[10px] text-white/40">{s.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Select all row */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-white/50 hover:text-white/80 transition-colors select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/25 bg-white/10 accent-primary"
            checked={allSelected}
            onChange={toggleAll}
          />
          Select all
        </label>
        <p className="text-xs text-white/35">
          {approvedCount} of {visible.length} selected
        </p>
      </div>

      {/* Question list */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-white/10">
        {visible.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            selected={selectedIds.has(q.id)}
            onToggle={() => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(q.id)) next.delete(q.id);
                else next.add(q.id);
                return next;
              });
            }}
            onDelete={() => handleDelete(q.id)}
          />
        ))}

        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-white/30 gap-2">
            <XCircle className="h-8 w-8" />
            <p className="text-sm">All questions removed.</p>
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div
        className={cn(
          'flex items-center gap-3 pt-3 border-t border-white/8',
        )}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try different content
        </button>

        <Button
          className={cn(
            'ml-auto gap-2 px-6 font-semibold',
            'bg-primary hover:bg-primary/90 text-primary-foreground',
            'shadow-lg shadow-primary/20 transition-all',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
          disabled={approvedCount === 0 || submitting}
          onClick={handleContinue}
        >
          {submitting ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Opening Quiz Builder…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Open in Quiz Builder
              {approvedCount > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">
                  {approvedCount}
                </span>
              )}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Backward-compat alias
export { AssessmentReviewWorkspace as ReviewQuestionsScreen };
