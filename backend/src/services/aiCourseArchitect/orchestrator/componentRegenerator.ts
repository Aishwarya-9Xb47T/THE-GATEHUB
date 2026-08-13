/**
 * V4 — Regenerate only failed lesson components (not the entire course).
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "./contracts.js";
import type { ArchitectLessonBlueprint } from "../types.js";
import type { ArchitectQualityReport } from "../types.js";
import { runLessonWriterAgent } from "../agents/lessonWriterAgent.js";
import { runAssessmentAgent } from "../agents/assessmentAgent.js";
import { runCodingLabAgent } from "../agents/codingLabAgent.js";
import { runYoutubeRecommendationAgent } from "../agents/youtubeRecommendationAgent.js";
import { runResearchPaperAgent } from "../agents/researchPaperAgent.js";
import { runRevisionNotesAgent } from "../agents/revisionNotesAgent.js";
import { runCodeGeneratorAgent, applyCodeToLesson } from "../agents/codeGeneratorAgent.js";
import { validateAndFixLessonCode } from "../agents/codeValidationAgent.js";
import { runDiagramAgent, applyDiagramsToLesson } from "../agents/diagramAgent.js";
import { runAssignmentAgent } from "../agents/assignmentAgent.js";
import { runReferenceAgent } from "../agents/referenceAgent.js";
import { runGlossaryAgent } from "../agents/glossaryAgent.js";
import { runInterviewQuestionAgent } from "../agents/interviewQuestionAgent.js";
import { hasLearningComponent } from "../types.js";

export type FailedComponent =
  | "theory"
  | "quiz"
  | "lab"
  | "objectives"
  | "summary"
  | "videos"
  | "research-papers"
  | "revision-notes"
  | "code"
  | "code-validation"
  | "diagram"
  | "assignment"
  | "references"
  | "glossary"
  | "interview";

export function detectFailedComponents(
  qualityReport: ArchitectQualityReport,
  interview: LessonPipelineContext["interview"]
): FailedComponent[] {
  const failed: FailedComponent[] = [];
  for (const check of qualityReport.checks) {
    if (check.status !== "fail") continue;
    if (check.id.includes("theory") || check.id === "theory-depth") failed.push("theory");
    if (check.id.includes("quiz")) failed.push("quiz");
    if (check.id.includes("coding-lab") || check.id.includes("lab")) failed.push("lab");
    if (check.id.includes("objectives")) failed.push("objectives");
    if (check.id.includes("summary")) failed.push("summary");
    if (check.id.includes("video")) failed.push("videos");
    if (check.id.includes("research")) failed.push("research-papers");
    if (check.id.includes("revision")) failed.push("revision-notes");
    if (check.id.includes("code-validation") || check.id === "factual-surface") failed.push("code-validation");
    if (check.id.includes("code")) failed.push("code");
    if (check.id.includes("diagram") || check.id.includes("flowchart")) failed.push("diagram");
    if (check.id.includes("assignment")) failed.push("assignment");
    if (check.id.includes("reference")) failed.push("references");
    if (check.id.includes("glossary")) failed.push("glossary");
    if (check.id.includes("interview")) failed.push("interview");
  }
  if (
    (hasLearningComponent(interview, "Quiz") || interview.lessonStructure.includes("mini-quiz")) &&
    !failed.includes("quiz") &&
    qualityReport.checks.some((c) => c.id.includes("quiz") && c.status === "warn")
  ) {
    failed.push("quiz");
  }
  return [...new Set(failed)];
}

export async function regenerateFailedComponents(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint,
  failed: FailedComponent[],
  retryHint: string
): Promise<ArchitectLessonBlueprint> {
  let updated = { ...lesson };

  if (failed.some((f) => f === "theory" || f === "objectives" || f === "summary")) {
    const writer = await runLessonWriterAgent(ctx, plan, retryHint);
    updated = { ...updated, ...writer.output, id: lesson.id, title: lesson.title, videos: lesson.videos };
  }

  if (failed.includes("quiz") && (plan.requiredQuiz || hasLearningComponent(ctx.interview, "Quiz"))) {
    const quiz = await runAssessmentAgent(ctx, plan, updated);
    updated.quizQuestions = quiz.output;
  }

  if (failed.includes("lab") && (plan.requiredLab || hasLearningComponent(ctx.interview, "Coding"))) {
    const lab = await runCodingLabAgent(ctx, plan, updated);
    if (lab.output) updated.codingLab = lab.output;
  }

  if (failed.includes("videos")) {
    const youtubeResult = await runYoutubeRecommendationAgent(ctx, plan, updated);
    updated.videos = youtubeResult.output;
  }

  if (failed.includes("research-papers")) {
    const researchResult = await runResearchPaperAgent(ctx, plan, updated);
    updated.researchPapers = researchResult.output;
  }

  if (failed.includes("revision-notes")) {
    const revisionResult = await runRevisionNotesAgent(ctx, plan, updated);
    updated.revisionNotes = revisionResult.output;
  }

  if (failed.includes("code") || failed.includes("code-validation")) {
    const codeResult = await runCodeGeneratorAgent(ctx, plan, updated);
    updated = applyCodeToLesson(updated, codeResult.output);
    const validated = await validateAndFixLessonCode(updated, ctx, plan);
    updated = validated.lesson;
  }

  if (failed.includes("diagram") && plan.requiredDiagrams) {
    const diagramResult = await runDiagramAgent(ctx, plan, updated);
    updated = applyDiagramsToLesson(updated, diagramResult.output);
  }

  if (failed.includes("assignment") && plan.requiredAssignment) {
    const assignmentResult = await runAssignmentAgent(ctx, plan, updated);
    updated.assignment = assignmentResult.output;
  }

  if (failed.includes("references") && plan.requiredReferences) {
    const refResult = await runReferenceAgent(ctx, plan, updated);
    updated.lessonReferences = refResult.output;
  }

  if (failed.includes("glossary")) {
    const glossaryResult = await runGlossaryAgent(ctx, plan, updated);
    updated.glossary = glossaryResult.output.map((t) => ({
      term: t.term,
      definition: t.definition,
      category: t.category,
      relatedTerms: t.relatedTerms,
      difficulty: t.difficulty,
    }));
  }

  if (failed.includes("interview") && plan.requiredInterviewPrep) {
    const interviewResult = await runInterviewQuestionAgent(ctx, plan, updated);
    updated.interviewQuestions = interviewResult.output.map((q) => ({
      question: q.question,
      answer: q.answer,
      difficulty: q.difficulty,
      category: q.category,
      hints: q.hints,
      keyPoints: q.keyPoints,
    }));
  }

  return updated;
}
