import { motion } from "framer-motion";
import type { AiAssessmentInsights } from "@/lib/aiAssessmentStudio/copilotTypes";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Lightbulb } from "lucide-react";

interface AiInsightsPanelProps {
  insights: AiAssessmentInsights;
}

export function AiInsightsPanel({ insights }: AiInsightsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Est. duration" value={`${insights.estimatedMinutes} min`} />
        <MiniStat label="Confidence" value={`${insights.confidenceScore}%`} />
        <MiniStat label="Diversity" value={`${insights.questionDiversity}%`} />
        <MiniStat label="Reading level" value={insights.readingLevel} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Difficulty distribution">
          <BarRow data={insights.difficultyDistribution} />
        </Panel>
        <Panel title="Bloom distribution">
          <BarRow data={insights.bloomDistribution} />
        </Panel>
      </div>

      {insights.topicCoverage.length > 0 && (
        <Panel title="Topic coverage">
          <div className="space-y-2">
            {insights.topicCoverage.map((t) => (
              <div key={t.topic} className="flex items-center gap-3">
                <span className="w-28 truncate text-xs text-white/60">{t.topic}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${t.percent}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400"
                  />
                </div>
                <span className="text-xs text-white/40">{t.percent}%</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {insights.recommendations.length > 0 && (
        <Panel title="AI recommendations">
          <ul className="space-y-2">
            {insights.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-white/70">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {r}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {insights.validationIssues.length > 0 && (
        <Panel title="Validation warnings">
          <div className="flex flex-wrap gap-2">
            {insights.validationIssues.slice(0, 8).map((v, i) => (
              <Badge
                key={`${v.questionId}-${i}`}
                variant="outline"
                className={`gap-1 border-white/15 text-[10px] ${
                  v.severity === "high" ? "border-amber-500/40 text-amber-300" : "text-white/60"
                }`}
              >
                <AlertTriangle className="h-3 w-3" />
                {v.message}
              </Badge>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{title}</h4>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/45">{label}</p>
    </div>
  );
}

function BarRow({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(data).map(([k, v]) => (
        <Badge key={k} variant="secondary" className="bg-white/10 capitalize">
          {k.replace(/_/g, " ")}: {Math.round((v / total) * 100)}%
        </Badge>
      ))}
    </div>
  );
}
