/**
 * V4 Agent 3 — Module Designer AI
 */
import { architectCompletionJSON } from "../architectLLM.js";
import { hasArchitectAiProvider } from "../openaiClient.js";
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { CoursePlannerOutput, ModuleDesignerOutput, ModuleDesignSpec } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { hasLearningComponent } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, ANTI_HALLUCINATION_RULES } from "../instructorPersona.js";
import { runAgent } from "../orchestrator/agentRunner.js";


function buildHeuristicModuleDesign(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): ModuleDesignerOutput {
  return {
    modules: blueprint.modules.map((mod, mi) => ({
      moduleId: mod.id,
      summary: mod.description || mod.title,
      learningGoals: mod.learningOutcomes,
      skills: mod.learningOutcomes.map((o) => o.split(" ").slice(0, 4).join(" ")),
      estimatedHours: mod.estimatedHours,
      prerequisites: mod.dependencies ?? (mi > 0 ? [`${blueprint.modules[mi - 1].title}`] : []),
      expectedOutcomes: mod.learningOutcomes,
      includesProject: Boolean(mod.project),
      includesLabs: hasLearningComponent(interview, "Coding"),
      includesAssessment: Boolean(mod.moduleQuiz),
      reviewSession: `Review key concepts from ${mod.title} before the module assessment.`,
      revisionNotes: `Revisit objectives, worked examples, and quiz incorrect answers for ${mod.title}.`,
    })),
  };
}

function validateModuleDesign(output: ModuleDesignerOutput): ArchitectQualityReport {
  const checks = output.modules.map((m) => ({
    id: m.moduleId,
    label: m.summary.slice(0, 40),
    status: m.learningGoals.length >= 2 && m.summary.length >= 20 ? ("pass" as const) : ("warn" as const),
    detail: `${m.learningGoals.length} goals · ${m.estimatedHours}h`,
  }));
  const warn = checks.filter((c) => c.status === "warn").length;
  return {
    score: Math.max(0, 100 - warn * 8),
    passed: output.modules.length > 0 && warn === 0,
    checks,
    suggestions: warn ? ["Enrich module design summaries"] : [],
  };
}

async function executeModuleDesigner(
  input: { blueprint: ArchitectBlueprint; interview: AICourseArchitectInterview; coursePlan: CoursePlannerOutput },
  _attempt: number
): Promise<ModuleDesignerOutput> {
  const { blueprint, interview, coursePlan } = input;
  const heuristic = buildHeuristicModuleDesign(blueprint, interview);
  if (!hasArchitectAiProvider()) {
    // No provider configured at all — use heuristic immediately
    console.info("[MODULE_DESIGNER] No AI provider configured — using heuristic module design");
    return heuristic;
  }

  try {
    const parsed = await architectCompletionJSON<{ modules?: ModuleDesignSpec[] }>({
      phase: "structure",
      system: PROFESSOR_SYSTEM_PROMPT,
      user: `Agent 3 — Module Designer. Return { "modules": ModuleDesignSpec[] } for each module.
${ANTI_HALLUCINATION_RULES}
Course plan: ${coursePlan.executiveSummary.slice(0, 300)}
Modules: ${JSON.stringify(blueprint.modules.map((m) => ({ id: m.id, title: m.title, lessons: m.lessons.length })))}`,
      temperature: 0.45,
    });
    if (parsed?.modules?.length) {
      return {
        modules: heuristic.modules.map((h) => {
          const enriched = parsed.modules!.find((m) => m.moduleId === h.moduleId);
          return enriched ? { ...h, ...enriched } : h;
        }),
      };
    }
    console.warn("[MODULE_DESIGNER] LLM returned empty — using heuristic module design");
    return heuristic;
  } catch (err) {
    // FIXED: Use heuristic fallback instead of throwing when AI fails.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[MODULE_DESIGNER] AI failed (${msg}) — using heuristic module design`);
    return heuristic;
  }
}

export async function runModuleDesignerAgent(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  coursePlan: CoursePlannerOutput
) {
  return runAgent({
    stage: "module-designer",
    input: { blueprint, interview, coursePlan },
    execute: executeModuleDesigner,
    validate: validateModuleDesign,
    maxAttempts: 2,
    minConfidence: 75,
  });
}
