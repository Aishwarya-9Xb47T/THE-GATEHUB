/**
 * V4 Agent 8 — Project AI
 */
import { getOpenAi } from "../openaiClient.js";
import type { AICourseArchitectInterview, ArchitectLessonBlueprint, ArchitectModuleBlueprint } from "../types.js";
import type { LessonBlueprintPlan, ProjectSpec } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { hasLearningComponent } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, ANTI_HALLUCINATION_RULES } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { scanForPlaceholders } from "../pipeline/placeholderGuards.js";


function validateProject(output: ProjectSpec | null): ArchitectQualityReport {
  if (!output) {
    return { score: 100, passed: true, checks: [{ id: "skip", label: "No project required", status: "pass", detail: "Skipped" }], suggestions: [] };
  }
  const bad = scanForPlaceholders(output.problemStatement + output.instructions);
  const checks = [
    { id: "problem", label: "Problem statement", status: output.problemStatement.length >= 40 ? ("pass" as const) : ("fail" as const), detail: "" },
    { id: "milestones", label: "Milestones", status: output.milestones.length >= 3 ? ("pass" as const) : ("warn" as const), detail: `${output.milestones.length} milestones` },
    { id: "placeholder", label: "No placeholders", status: bad.length === 0 ? ("pass" as const) : ("fail" as const), detail: bad.join("; ") || "Clean" },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return { score: Math.max(0, 100 - fail * 30), passed: fail === 0, checks, suggestions: [] };
}

function buildHeuristicProject(
  mod: ArchitectModuleBlueprint,
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): ProjectSpec {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  return {
    title: `${topic} Industry Project`,
    problemStatement: `Design and implement a ${topic} solution for a ${interview.courseInfo.industry} use case using concepts from ${mod.title}.`,
    businessContext: `Organizations in ${interview.courseInfo.industry} need practitioners who can deliver end-to-end ${interview.courseInfo.subject} outcomes.`,
    objectives: ["Apply module concepts in a realistic scenario", "Document architecture and trade-offs", "Demonstrate measurable results"],
    requirements: ["Working implementation", "README with setup", "Test or validation evidence", "Short demo or report"],
    architecture: "Layered design: data/input → processing → output/reporting with clear interfaces.",
    folderStructure: ["src/", "tests/", "docs/", "README.md"],
    milestones: ["Requirements & design", "Core implementation", "Testing & documentation", "Demo delivery"],
    evaluationRubric: ["Correctness (40%)", "Code quality (25%)", "Documentation (20%)", "Professional presentation (15%)"],
    deliverables: ["Source code", "README", "Test results", "5-minute walkthrough"],
    portfolioGuidance: "Highlight problem, approach, metrics improved, and technologies used on your resume and GitHub.",
    resumeImpact: `Demonstrates ${interview.courseInfo.subject} competency for ${interview.courseInfo.industry} roles.`,
    industryApplications: [interview.courseInfo.industry, "Production ML/AI pipelines", "Cross-functional delivery"],
    deploymentSuggestions: ["Containerize if applicable", "CI smoke tests", "Environment configuration documented"],
    instructions: mod.project?.instructions || `Build a complete ${topic} project applying ${mod.title} concepts.`,
    difficulty: mod.project?.difficulty || lesson.difficultyTier || "intermediate",
  };
}

async function executeProjectAgent(
  input: {
    mod: ArchitectModuleBlueprint;
    lesson: ArchitectLessonBlueprint;
    interview: AICourseArchitectInterview;
    plan: LessonBlueprintPlan;
  },
  _attempt: number
): Promise<ProjectSpec | null> {
  const { mod, lesson, interview, plan } = input;
  const wantsProject =
    hasLearningComponent(interview, "Project") ||
    Boolean(mod.project) ||
    Boolean(lesson.miniProject);
  if (!wantsProject) return null;

  if (!getOpenAi()) return buildHeuristicProject(mod, lesson, interview);

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("project"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Agent 8 — Project AI. Return ProjectSpec JSON for lesson "${lesson.title}" in module "${mod.title}".
${buildInterviewContext(interview)}
Lesson objective: ${plan.lessonObjective}
${ANTI_HALLUCINATION_RULES}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 3000,
    });
    const raw = res.choices[0]?.message?.content;
    if (raw) return { ...buildHeuristicProject(mod, lesson, interview), ...JSON.parse(raw) };
  } catch (err) {
    console.error("[Agent 8 Project]", err);
  }
  return buildHeuristicProject(mod, lesson, interview);
}

export async function runProjectAgent(
  mod: ArchitectModuleBlueprint,
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview,
  plan: LessonBlueprintPlan
) {
  return runAgent({
    stage: "project",
    input: { mod, lesson, interview, plan },
    execute: executeProjectAgent,
    validate: validateProject,
    maxAttempts: 2,
    minConfidence: 80,
  });
}

export function applyProjectToLesson(lesson: ArchitectLessonBlueprint, spec: ProjectSpec | null): ArchitectLessonBlueprint {
  if (!spec) return lesson;
  return {
    ...lesson,
    miniProject: {
      title: spec.title,
      description: `${spec.problemStatement}\n\nBusiness context: ${spec.businessContext}`,
      instructions: `${spec.instructions}\n\nDeliverables: ${spec.deliverables.join(", ")}\n\nMilestones:\n${spec.milestones.map((m, i) => `${i + 1}. ${m}`).join("\n")}`,
    },
  };
}
