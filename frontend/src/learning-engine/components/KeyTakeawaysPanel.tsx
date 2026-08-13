import { useMemo } from "react";
import { ListChecks } from "lucide-react";
import type { DocumentNode } from "@gatehub/lesson-body";
import { hasDocumentNodes } from "@gatehub/lesson-body";
import type { LearnerExperienceStep } from "../types";

function isTakeawayStep(step: LearnerExperienceStep): boolean {
  const title = `${step.title} ${String(step.payload?.title ?? "")} ${String(step.payload?.blockType ?? "")}`.toLowerCase();
  return (
    /key\s*takeaway|takeaway|key\s*point|checkpoint|revision|summary/i.test(title) ||
    step.kind === "summary" ||
    String(step.payload?.blockType ?? "").toLowerCase() === "keypoints"
  );
}

function extractBulletsFromMarkdown(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const bullets: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
    if (m?.[1]) bullets.push(m[1].replace(/\*\*|__/g, "").trim());
  }
  return bullets;
}

function extractFromNodes(nodes: DocumentNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "markdown" && node.content) out.push(...extractBulletsFromMarkdown(node.content));
    if (node.type === "list" && node.items) out.push(...node.items.map((i) => i.replace(/\*\*|__/g, "").trim()));
    if (node.type === "callout" && node.content) {
      out.push(...extractBulletsFromMarkdown(node.content));
      if (!out.length && node.content.trim()) out.push(node.content.trim());
    }
  }
  return out.filter(Boolean);
}

function extractTakeaways(steps: LearnerExperienceStep[]): string[] {
  const candidates = steps.filter(isTakeawayStep);
  const collected: string[] = [];
  for (const step of candidates) {
    if (hasDocumentNodes(step.payload)) {
      collected.push(...extractFromNodes(step.payload.nodes as DocumentNode[]));
      continue;
    }
    const body = String(
      step.payload?.body ?? step.payload?.markdown ?? step.payload?.content ?? step.payload?.text ?? ""
    );
    if (body) collected.push(...extractBulletsFromMarkdown(body));
  }
  const unique: string[] = [];
  for (const item of collected) {
    if (item.length < 8 || item.length > 220) continue;
    if (unique.some((u) => u.toLowerCase() === item.toLowerCase())) continue;
    unique.push(item);
    if (unique.length >= 6) break;
  }
  return unique;
}

interface KeyTakeawaysPanelProps {
  steps: LearnerExperienceStep[];
  className?: string;
}

/** Client-side takeaways strip from already-published experience payloads (no recompile). */
export function KeyTakeawaysPanel({ steps, className }: KeyTakeawaysPanelProps) {
  const takeaways = useMemo(() => extractTakeaways(steps), [steps]);
  if (takeaways.length === 0) return null;

  return (
    <aside
      className={className}
      aria-labelledby="lesson-key-takeaways-heading"
      data-testid="key-takeaways-panel"
    >
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <h2 id="lesson-key-takeaways-heading" className="text-sm font-semibold text-foreground">
            Key takeaways
          </h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {takeaways.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="text-foreground/90 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
