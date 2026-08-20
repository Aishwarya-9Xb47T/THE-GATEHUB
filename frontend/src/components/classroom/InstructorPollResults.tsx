import { useMemo, useState } from "react";
import { Check, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type InstructorPollOption = {
  id?: string;
  label?: string;
  text?: string;
};

export type InstructorPollRespondent = {
  userId: string;
  firstName?: string;
  lastName?: string;
};

export type InstructorPollSummary = {
  totalResponses?: number;
  optionCounts?: Record<string, number>;
  respondents?: Record<string, InstructorPollRespondent[]>;
  anonymous?: boolean;
};

function optionKeys(option: InstructorPollOption, index: number): string[] {
  const label = option.label || String.fromCharCode(65 + index);
  return [option.id, option.label, label, option.text].filter((value): value is string => Boolean(value));
}

function respondentName(person: InstructorPollRespondent): string {
  return `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || "Student";
}

export function resolveOptionResult(
  option: InstructorPollOption,
  index: number,
  summary: InstructorPollSummary | null | undefined,
): { label: string; text: string; count: number; percent: number; respondents: InstructorPollRespondent[] } {
  const label = option.label || String.fromCharCode(65 + index);
  const keys = optionKeys(option, index);
  const counts = summary?.optionCounts ?? {};
  const count = keys.reduce((found, key) => found || counts[key] || 0, 0);
  const total = summary?.totalResponses ?? 0;
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const respondents = keys.reduce<InstructorPollRespondent[]>((found, key) => {
    if (found.length) return found;
    return summary?.respondents?.[key] ?? [];
  }, []);
  return { label, text: option.text || label, count, percent, respondents };
}

interface InstructorPollResultsProps {
  question: string;
  options: InstructorPollOption[];
  summary: InstructorPollSummary | null;
  participantCount: number;
  onClosePoll: () => void;
}

export function InstructorPollResults({
  question,
  options,
  summary,
  participantCount,
  onClosePoll,
}: InstructorPollResultsProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const total = summary?.totalResponses ?? 0;
  const rows = useMemo(
    () => options.map((option, index) => resolveOptionResult(option, index, summary)),
    [options, summary],
  );
  const selected = selectedIndex == null ? null : rows[selectedIndex];

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-violet-400/30 bg-slate-950/95 text-white shadow-2xl"
      data-testid="classroom-poll-stage"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-400 animate-pulse" />
          <p className="text-xs font-bold tracking-[0.18em] text-violet-300">LIVE POLL</p>
        </div>
        <p className="text-sm font-medium text-slate-300 tabular-nums">
          Total responses: {total} / {participantCount}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <h2 className="text-2xl md:text-3xl font-semibold leading-snug text-white">{question || "Live poll"}</h2>
        {total === 0 && (
          <p className="mt-3 text-sm text-slate-400">Waiting for responses…</p>
        )}

        <div className="mt-6 space-y-3">
          {rows.map((row, index) => (
            <button
              key={row.label + index}
              type="button"
              data-testid={`classroom-poll-option-${row.label}`}
              onClick={() => setSelectedIndex(index)}
              className="block w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-violet-400/50 hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-white">
                    {row.label} — {row.text}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {row.count} {row.count === 1 ? "response" : "responses"}
                    {total > 0 ? ` · ${row.percent}%` : ""}
                  </p>
                </div>
                <span className="text-xl font-semibold tabular-nums text-violet-200">{row.count}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${total > 0 ? row.percent : 0}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-4">
        <Button variant="destructive" className="w-full sm:w-auto min-w-[12rem]" onClick={onClosePoll}>
          Close Poll
        </Button>
      </div>

      <Dialog open={selectedIndex != null} onOpenChange={(open) => { if (!open) setSelectedIndex(null); }}>
        <DialogContent className="border-white/10 bg-slate-900 text-white sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              Students who selected {selected ? `${selected.label} — ${selected.text}` : "this option"}
            </DialogTitle>
          </DialogHeader>
          {summary?.anonymous ? (
            <p className="text-sm text-slate-300">This poll is anonymous, so student names are hidden.</p>
          ) : selected && selected.respondents.length === 0 ? (
            <p className="text-sm text-slate-300">No students have selected this option yet.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-auto">
              {selected?.respondents.map((person) => (
                <li key={person.userId} className="flex items-center gap-2 text-sm text-white">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  {respondentName(person)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {selected?.respondents.length ?? 0} students
          </p>
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="border-white/20 bg-white/5 text-white"
              data-testid="classroom-poll-detail-close"
              onClick={() => setSelectedIndex(null)}
            >
              <X className="mr-1.5 h-4 w-4" />
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
