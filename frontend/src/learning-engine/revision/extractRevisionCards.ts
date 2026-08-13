import { hasDocumentNodes, type DocumentNode } from "@gatehub/lesson-body";
import type { LearnerExperienceStep } from "../types";

export interface RevisionCard {
  id: string;
  front: string;
  back: string;
  sourceStepId: string;
  sourceLabel: string;
}

function stripMd(s: string): string {
  return s.replace(/\*\*|__/g, "").replace(/`([^`]+)`/g, "$1").trim();
}

function bulletsFromMarkdown(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
    if (m?.[1]) out.push(stripMd(m[1]));
  }
  return out;
}

function textFromNodes(nodes: DocumentNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "markdown" && n.content) out.push(...bulletsFromMarkdown(n.content));
    if (n.type === "list" && n.items) out.push(...n.items.map(stripMd));
    if (n.type === "callout" && n.content) out.push(...bulletsFromMarkdown(n.content));
  }
  return out.filter((t) => t.length >= 8 && t.length <= 240);
}

function payloadTexts(step: LearnerExperienceStep): string[] {
  if (hasDocumentNodes(step.payload)) {
    return textFromNodes(step.payload.nodes as DocumentNode[]);
  }
  const body = String(
    step.payload?.body ?? step.payload?.markdown ?? step.payload?.content ?? step.payload?.text ?? ""
  );
  if (body) return bulletsFromMarkdown(body);
  const objectives = step.payload?.objectives;
  if (Array.isArray(objectives)) return objectives.map((o) => stripMd(String(o))).filter(Boolean);
  return [];
}

function isRevisionSource(step: LearnerExperienceStep): boolean {
  const blob = `${step.title} ${String(step.payload?.blockType ?? "")} ${step.kind}`.toLowerCase();
  return (
    step.kind === "objectives" ||
    step.kind === "summary" ||
    /key\s*takeaway|takeaway|key\s*point|revision|checkpoint|objective/i.test(blob)
  );
}

/** Build flashcard-like cues from published step payloads (client-side only). */
export function extractRevisionCards(
  lessonId: string,
  lessonTitle: string,
  steps: LearnerExperienceStep[]
): RevisionCard[] {
  const cards: RevisionCard[] = [];
  const seen = new Set<string>();

  for (const step of steps.filter(isRevisionSource)) {
    const items = payloadTexts(step);
    items.forEach((item, idx) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const id = `${lessonId}:${step.id}:${idx}:${key.slice(0, 32)}`;
      cards.push({
        id,
        front: `Recall from "${lessonTitle}"`,
        back: item,
        sourceStepId: step.id,
        sourceLabel: step.title || step.kind,
      });
    });
  }

  return cards.slice(0, 24);
}
