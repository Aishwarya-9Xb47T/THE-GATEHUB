/**
 * V6 Part 3 — Topic detection and keyword extraction for RAG.
 */
import type { LessonPipelineContext } from "../orchestrator/contracts.js";
import type { LessonBlueprintPlan } from "../orchestrator/contracts.js";

export interface TopicAnalysis {
  primaryTopic: string;
  subtopics: string[];
  keywords: string[];
  academicQueries: string[];
  docQueries: string[];
  programmingQueries: string[];
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "in", "to", "for", "with", "from", "by", "on", "at"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export function analyzeLessonTopic(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): TopicAnalysis {
  const subject = ctx.interview.courseInfo.subject;
  const title = ctx.skeleton.title;
  const goals = plan.learningGoals.join(" ");
  const concepts = plan.conceptOrder.join(" ");
  const corpus = `${subject} ${title} ${goals} ${concepts} ${ctx.interview.courseInfo.industry}`;
  const tokens = tokenize(corpus);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);

  const primaryTopic = title.split("—")[0]?.trim() || title;
  const subtopics = plan.conceptOrder.length ? plan.conceptOrder : keywords.slice(0, 5);
  const stack = ctx.interview.practicalComponents ?? [];

  return {
    primaryTopic,
    subtopics,
    keywords,
    academicQueries: [`${primaryTopic} ${subject}`, ...subtopics.slice(0, 2).map((s) => `${s} ${subject}`)],
    docQueries: [`${primaryTopic} ${stack[0] ?? subject} documentation`, `${subject} official docs ${primaryTopic}`],
    programmingQueries: stack.length ? [`${primaryTopic} ${stack[0]} example`, `${stack[0]} ${primaryTopic} github`] : [],
  };
}

export function buildHybridSearchQueries(analysis: TopicAnalysis, subject: string): string[] {
  return [
    `${analysis.primaryTopic} ${subject}`,
    ...analysis.academicQueries.slice(0, 2),
    ...analysis.docQueries.slice(0, 1),
    ...analysis.programmingQueries.slice(0, 1),
  ].filter((q, i, arr) => arr.indexOf(q) === i);
}
