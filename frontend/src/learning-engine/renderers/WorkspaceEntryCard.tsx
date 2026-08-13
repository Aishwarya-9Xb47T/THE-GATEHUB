import { ArrowRight, Code2, ExternalLink, FileSearch, Hammer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LearnerExperienceStep } from "../types";
import { workspaceKindLabel } from "../workspaces/types";

const ICONS = {
  "coding-lab": Code2,
  notebook: Code2,
  project: Hammer,
  research: FileSearch,
};

function stepDescription(step: LearnerExperienceStep): string {
  const payload = step.payload;
  if (step.kind === "research") {
    const abstract = String(payload.abstract ?? "").trim();
    if (abstract) return abstract;
    const sections = (payload.sections as Array<{ title?: string; body?: string; content?: string }> | undefined) ?? [];
    const sectionText = sections
      .map((s) => String(s.body ?? s.content ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (sectionText) return sectionText;
  }
  return String(payload.description ?? payload.instructions ?? payload.problemStatement ?? payload.abstract ?? "").trim();
}

function companionHint(step: LearnerExperienceStep): string {
  const payload = step.payload;
  if (step.kind === "research") {
    const parts = ["Opens inside THE GATEHUB"];
    if (payload.enableOverleaf !== false && payload.enableoverleaf !== "false") parts.push("Overleaf in workspace");
    if (payload.enableColab !== false && payload.enablecolab !== "false") parts.push("Colab in workspace");
    return parts.join(" · ");
  }
  if (step.kind === "coding-lab" || step.kind === "notebook") {
    return "Opens inside THE GATEHUB · Google Colab available in workspace";
  }
  return "Opens inside THE GATEHUB · no external redirect";
}

interface WorkspaceEntryCardProps {
  step: LearnerExperienceStep;
  onOpen: () => void;
}

export function WorkspaceEntryCard({ step, onOpen }: WorkspaceEntryCardProps) {
  const Icon = ICONS[step.kind as keyof typeof ICONS] ?? Sparkles;
  const label = workspaceKindLabel(step.kind);
  const description = stepDescription(step);
  const sections =
    step.kind === "research"
      ? ((step.payload.sections as Array<{ title?: string }> | undefined) ?? []).map((s) => String(s.title ?? "").trim()).filter(Boolean)
      : [];

  return (
    <Card className="overflow-hidden border-0 shadow-xl w-full">
      <div className="surface-gradient bg-gradient-to-br from-[#161b22] to-[#0d1117] p-8 md:p-10">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
            <Icon className="w-7 h-7 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest opacity-60 mb-1">{label}</p>
            <h2 className="text-2xl font-bold mb-2">{step.title}</h2>
            {description && <p className="text-sm opacity-75 line-clamp-4">{description.slice(0, 420)}</p>}
            {sections.length > 0 && (
              <ul className="mt-3 text-xs opacity-60 space-y-1">
                {sections.slice(0, 5).map((title) => (
                  <li key={title} className="flex items-center gap-1.5">
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span>{title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" size="lg" className="gap-2" onClick={onOpen}>
            Open {label}
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-xs opacity-50 self-center">{companionHint(step)}</p>
        </div>
      </div>
    </Card>
  );
}
