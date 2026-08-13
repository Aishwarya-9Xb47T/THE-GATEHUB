import type { ReviewStatistics } from '@/lib/contentBuilder/types';
import { computeExtractionMetrics } from '@/lib/contentBuilder/extractionSummaryMetrics';
import type { ReviewQuestion } from '@/lib/contentBuilder/types';

interface ExtractionSummaryPanelProps {
  questions: ReviewQuestion[];
  statistics?: ReviewStatistics;
  diagnostics?: {
    flaggedQuestions?: number;
    rejectedQuestions?: number;
    answersDetected?: number;
    needsReview?: number;
    warnings?: string[];
    googleResourceType?: string;
    extractionMethod?: string;
    sectionsDetected?: number;
  };
}

export function ExtractionSummaryPanel({ questions, statistics, diagnostics }: ExtractionSummaryPanelProps) {
  const metrics = statistics
    ? {
        questionsFound: statistics.questionsFound,
        imagesImported: statistics.imagesImported,
        tablesImported: statistics.tablesImported,
        formulaeImported: statistics.formulaeImported ?? 0,
        codeBlocksImported: statistics.codeBlocksImported ?? 0,
        linksImported: statistics.linksImported ?? 0,
        audioImported: statistics.audioImported ?? 0,
        videoImported: statistics.videoImported ?? 0,
        highConfidence: statistics.highConfidence,
        mediumConfidence: statistics.mediumConfidence,
        lowConfidence: statistics.lowConfidence,
        overallConfidence: statistics.overallConfidence ?? computeExtractionMetrics(questions).overallConfidence,
        pagesProcessed: statistics.pagesProcessed,
      }
    : computeExtractionMetrics(questions);

  const typeCounts = questions.reduce<Record<string, number>>((acc, q) => {
    const key = (q.type || 'unknown').replace(/_/g, ' ');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const warningCount =
    (diagnostics?.warnings?.length ?? 0) +
    questions.reduce((n, q) => n + (q.warnings?.length ?? 0), 0);
  const needsReviewCount =
    (diagnostics?.needsReview ?? 0) ||
    questions.filter((q) => (q.warnings?.length ?? 0) > 0 || q.validationStatus === 'flagged').length;

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-emerald-300">
          {metrics.questionsFound} question{metrics.questionsFound === 1 ? '' : 's'} extracted
          {needsReviewCount > 0 ? ` · ${needsReviewCount} need review` : ''}
        </p>
        <p className="text-xs text-white/50 mt-0.5">
          Review detected questions below, edit if needed, then open in Quiz Builder.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ['Questions', metrics.questionsFound],
          ['Pages', metrics.pagesProcessed ?? '—'],
          ['Answers', diagnostics?.answersDetected ?? '—'],
          ['High conf.', metrics.highConfidence],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-white/5 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
            <p className="text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {Object.entries(typeCounts).map(([type, count]) => (
          <span key={type} className="rounded-full bg-white/10 px-2 py-0.5 text-white/70 capitalize">
            {count} {type}
          </span>
        ))}
        {metrics.codeBlocksImported > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">
            {metrics.codeBlocksImported} code blocks
          </span>
        )}
        {metrics.formulaeImported > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">
            {metrics.formulaeImported} formulas
          </span>
        )}
      </div>

      {(diagnostics?.googleResourceType || diagnostics?.extractionMethod) ? (
        <p className="text-[11px] text-white/45">
          Source: {diagnostics.googleResourceType?.replace(/_/g, ' ')}
          {diagnostics.extractionMethod ? ` · ${diagnostics.extractionMethod.replace(/_/g, ' ')}` : ''}
          {diagnostics.sectionsDetected ? ` · ${diagnostics.sectionsDetected} sections` : ''}
        </p>
      ) : null}

      {(diagnostics?.flaggedQuestions || diagnostics?.rejectedQuestions || needsReviewCount || warningCount > 0) ? (
        <p className="text-xs text-amber-300/90">
          {diagnostics?.flaggedQuestions ? `${diagnostics.flaggedQuestions} flagged for review. ` : ''}
          {diagnostics?.rejectedQuestions ? `${diagnostics.rejectedQuestions} rejected during validation. ` : ''}
          {needsReviewCount ? `${needsReviewCount} question${needsReviewCount === 1 ? '' : 's'} need review. ` : ''}
          {warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? '' : 's'} detected.` : ''}
        </p>
      ) : null}
    </div>
  );
}
