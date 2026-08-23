/**
 * V4 Agent 5 — Lesson Writer AI
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import { generateLessonContent } from "../lessonContentEngineCore.js";
import { buildLessonOutlineContext } from "../lessonPlanningEngine.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { isGenericLessonContent } from "../../lessonContentRepair.js";

const BLOOM_START_VERBS = new Set([
  "define",
  "list",
  "identify",
  "recall",
  "recognize",
  "name",
  "explain",
  "summarize",
  "classify",
  "interpret",
  "describe",
  "discuss",
  "apply",
  "demonstrate",
  "use",
  "implement",
  "solve",
  "execute",
  "analyze",
  "differentiate",
  "compare",
  "diagnose",
  "investigate",
  "evaluate",
  "justify",
  "critique",
  "assess",
  "prioritize",
  "defend",
  "design",
  "construct",
  "compose",
  "develop",
  "formulate",
  "propose",
]);

function bloomVerbCoverage(objectives: string[] = []): { aligned: number; total: number } {
  const aligned = objectives.filter((obj) => {
    const first = obj.trim().toLowerCase().split(/\s+/)[0] || "";
    return BLOOM_START_VERBS.has(first);
  }).length;
  return { aligned, total: objectives.length };
}

const SCAFFOLD_HEADINGS = ["foundation", "structure", "application", "depth"];

function scaffoldLayerCount(text: string): number {
  const lower = text.toLowerCase();
  return SCAFFOLD_HEADINGS.filter((h) => lower.includes(`## ${h}`) || lower.includes(`## ${h.charAt(0).toUpperCase()}${h.slice(1)}`)).length;
}

function numberedStepCount(text: string): number {
  const matches = text.match(/^\s*\d+\.\s+/gm);
  return matches?.length ?? 0;
}

function markdownSectionCount(text: string): number {
  const matches = text.match(/^##\s+/gm);
  return matches?.length ?? 0;
}

function caseStudyStructureScore(text: string): number {
  const lower = text.toLowerCase();
  const markers = ["situation", "challenge", "approach", "outcome", "lessons learned"];
  return markers.filter((m) => lower.includes(m)).length;
}

function continuityMentions(text: string): number {
  const lower = text.toLowerCase();
  const markers = ["prior lesson", "builds on", "next lesson", "prepare for next"];
  return markers.filter((m) => lower.includes(m)).length;
}

function validateLessonWriter(output: ArchitectLessonBlueprint): ArchitectQualityReport {
  if (!output || typeof output !== "object") {
    return {
      score: 0,
      passed: false,
      checks: [{ id: "lesson-present", label: "Lesson output", status: "fail", detail: "undefined" }],
      suggestions: ["Lesson writer returned no output — normalize from skeleton"],
    };
  }
  const theoryWords = (output.theory || "").split(/\s+/).filter(Boolean).length;
  const theoryGeneric = isGenericLessonContent(output.theory || "");
  const bloom = bloomVerbCoverage(output.objectives || []);
  const scaffoldLayers = scaffoldLayerCount(output.theory || "");
  const conceptSteps = numberedStepCount(output.conceptExplanation || "");
  const exampleSections = markdownSectionCount(output.examples || "");
  const exampleWords = (output.examples || "").split(/\s+/).filter(Boolean).length;
  const caseStudyText = output.caseStudy || "";
  const caseStudyWords = caseStudyText.split(/\s+/).filter(Boolean).length;
  const caseStudyMarkers = caseStudyStructureScore(caseStudyText);
  const summaryWords = (output.summary || "").split(/\s+/).filter(Boolean).length;
  const summaryGeneric = isGenericLessonContent(output.summary || "");
  const refCount = (output.furtherReading?.length ?? 0) + (output.references?.length ?? 0);
  const continuityCount = continuityMentions(`${output.introduction || ""}\n${output.theory || ""}\n${output.revision || ""}`);
  const checks = [
    { id: "theory", label: "Theory depth", status: theoryWords >= 280 ? ("pass" as const) : ("fail" as const), detail: `${theoryWords} words` },
    { id: "theory-quality", label: "Theory quality", status: !theoryGeneric ? ("pass" as const) : ("fail" as const), detail: theoryGeneric ? "Generic filler detected" : "Substantive" },
    { id: "intro", label: "Introduction", status: (output.introduction?.length ?? 0) >= 100 ? ("pass" as const) : ("fail" as const), detail: "" },
    { id: "objectives", label: "Objectives", status: (output.objectives?.length ?? 0) >= 3 ? ("pass" as const) : ("fail" as const), detail: `${output.objectives?.length ?? 0}` },
    {
      id: "objectives-bloom",
      label: "Bloom-aligned objective verbs",
      status: bloom.total >= 3 && bloom.aligned >= Math.min(3, bloom.total) ? ("pass" as const) : ("fail" as const),
      detail: `${bloom.aligned}/${bloom.total} aligned`,
    },
    {
      id: "scaffold-layers",
      label: "Progressive depth layers",
      status: scaffoldLayers >= 4 ? ("pass" as const) : ("fail" as const),
      detail: `${scaffoldLayers}/4 layers in theory`,
    },
    {
      id: "concept-steps",
      label: "Step-by-step concept explanation",
      status: conceptSteps >= 5 ? ("pass" as const) : ("fail" as const),
      detail: `${conceptSteps} numbered steps`,
    },
    {
      id: "examples-sections",
      label: "Real-world example sections",
      status: exampleSections >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${exampleSections} ## sections`,
    },
    {
      id: "examples-depth",
      label: "Example narrative depth",
      status: exampleWords >= 120 ? ("pass" as const) : ("fail" as const),
      detail: `${exampleWords} words`,
    },
    {
      id: "case-study",
      label: "Industry case study structure",
      status:
        caseStudyWords === 0
          ? ("warn" as const)
          : caseStudyWords >= 100 && caseStudyMarkers >= 3
            ? ("pass" as const)
            : ("fail" as const),
      detail: caseStudyWords === 0 ? "Not provided" : `${caseStudyMarkers}/5 structure markers`,
    },
    {
      id: "retention-takeaways",
      label: "Key takeaways",
      status: (output.keyTakeaways?.length ?? 0) >= 4 ? ("pass" as const) : ("fail" as const),
      detail: `${output.keyTakeaways?.length ?? 0} takeaways`,
    },
    {
      id: "retention-revision",
      label: "Revision notes",
      status: (output.revision?.length ?? 0) >= 60 ? ("pass" as const) : ("fail" as const),
      detail: `${(output.revision || "").split(/\s+/).filter(Boolean).length} words`,
    },
    {
      id: "retention-checkpoint",
      label: "Discussion checkpoint",
      status: (output.discussionPrompt?.length ?? 0) >= 40 ? ("pass" as const) : ("fail" as const),
      detail: output.discussionPrompt ? "Present" : "Missing",
    },
    {
      id: "summary",
      label: "Summary quality",
      status: summaryWords >= 60 && !summaryGeneric ? ("pass" as const) : ("fail" as const),
      detail: `${summaryWords} words${summaryGeneric ? " (generic)" : ""}`,
    },
    {
      id: "references",
      label: "References and further reading",
      status: refCount >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${refCount} total items`,
    },
    {
      id: "pedagogical-continuity",
      label: "Cross-lesson continuity",
      status: continuityCount >= 2 ? ("pass" as const) : ("fail" as const),
      detail: `${continuityCount} continuity markers`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return { score: Math.max(0, 100 - fail * 20), passed: fail === 0, checks, suggestions: fail ? ["Replace generic filler with concrete lesson-specific prose"] : [] };
}

export async function runLessonWriterAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  retryHint?: string
) {
  const outline = buildLessonOutlineContext(ctx.blueprint, ctx.modIndex, ctx.lessonIndex);
  return runAgent({
    stage: "lesson-writer",
    input: { ctx, plan, outline, retryHint },
    execute: async ({ ctx: c, plan: p, outline: o, retryHint: hint }) =>
      generateLessonContent(c.skeleton, c.mod, c.interview, c.lessonIndex, c.blueprint, p, o, hint),
    validate: validateLessonWriter,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 80,
  });
}
