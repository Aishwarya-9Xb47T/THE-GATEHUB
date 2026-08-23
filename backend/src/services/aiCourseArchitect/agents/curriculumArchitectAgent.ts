/**
 * V4 Agent 2 — Curriculum Architect AI
 */
import type { AICourseArchitectInterview, ArchitectBlueprint, ArchitectQualityReport } from "../types.js";
import type { CurriculumArchitectOutput } from "../orchestrator/contracts.js";
import { normalizeInterview } from "../types.js";
import { conductCurriculumResearch } from "../curriculumResearch.js";
import { planCurriculumStructure, enforceBlueprintStructure, computeScalePlan } from "../curriculumPlanner.js";
import { buildAcademicCourseBlueprint, enrichAcademicBlueprint } from "../academicBlueprintBuilder.js";
import { validateCurriculumBlueprint } from "../curriculumValidator.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { PROFESSOR_SYSTEM_PROMPT } from "../instructorPersona.js";


import { architectCompletionJSON } from "../architectLLM.js";

async function enrichStructuralBlueprint(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): Promise<ArchitectBlueprint> {
  const plan = computeScalePlan(interview); // instructor config is source of truth
  const outline = blueprint.modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, tier: l.difficultyTier })),
  }));
  try {
    const parsed = await architectCompletionJSON<{ modules: ArchitectBlueprint["modules"] }>({
      phase: "structure",
      system: PROFESSOR_SYSTEM_PROMPT,
      user: `You are designing content WITHIN a predefined academic structure for "${interview.courseInfo.title}" (${interview.courseInfo.subject}).

HARD STRUCTURAL CONSTRAINTS (do not change):
TARGET MODULE COUNT: ${plan.moduleCount}
TARGET TOTAL LESSON COUNT: ${plan.targetLessons}
LESSONS PER MODULE (distribution): ${plan.lessonDistribution.join(", ")}
COURSE SCALE: ${plan.scaleLabel}

You may ONLY improve module/lesson TITLES and descriptions so they are subject-specific and professional.
Do NOT add/remove modules or lessons. Do NOT change IDs or counts.
Avoid generic phrases like "Foundations & Prerequisites" or "Core Theory". Use real domain concepts.
Return JSON: { modules: [{ id, title, description, lessons: [{ id, title }] }] }. Keep IDs intact.\n${JSON.stringify(outline)}`,
      temperature: 0.5,
    });

    if (!parsed?.modules?.length) return blueprint;
    const updated = structuredClone(blueprint);
    for (const mod of updated.modules) {
      const e = parsed.modules.find((m) => m.id === mod.id);
      if (!e) continue;
      mod.title = e.title || mod.title;
      mod.description = e.description || mod.description;
      for (const lesson of mod.lessons) {
        const el = e.lessons?.find((l) => l.id === lesson.id);
        if (el?.title) lesson.title = el.title;
      }
    }
    // Never accept AI-added modules/lessons
    return enforceBlueprintStructure(updated, interview, blueprint.researchReport);
  } catch {
    return blueprint;
  }
}

function validateCurriculum(
  output: CurriculumArchitectOutput,
  interview: AICourseArchitectInterview
): ArchitectQualityReport {
  return validateCurriculumBlueprint(output.blueprint, interview);
}

async function executeCurriculumArchitect(
  interview: AICourseArchitectInterview,
  _attempt: number
): Promise<CurriculumArchitectOutput> {
  const normalized = normalizeInterview(interview);
  let research: Awaited<ReturnType<typeof conductCurriculumResearch>>;

  try {
    research = await conductCurriculumResearch(normalized);
  } catch (err) {
    // FIXED: conductCurriculumResearch may still throw for non-AI errors (e.g. import failures).
    // If so, build a minimal synthetic research report so planning can continue.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[CURRICULUM_ARCHITECT] Research failed (${msg}) — using minimal synthetic research`);
    const plan = computeScalePlan(normalized);
    const c = normalized.courseInfo;
    research = {
      courseRationale: `A ${plan.scaleLabel} curriculum in ${c.subject} for ${c.targetAudience}.`,
      industryStandards: [`${c.industry} best practices`],
      universityReferences: ["MIT OpenCourseWare", "Stanford Online"],
      officialDocumentation: ["Official documentation"],
      recommendedProgression: ["Foundations", "Core", "Applied", "Advanced"],
      skillDependencyGraph: `Concepts in ${c.subject} build sequentially.`,
      prerequisiteGraph: c.prerequisites.join(" → ") || "Basic skills → Mastery",
      prerequisites: c.prerequisites.length ? c.prerequisites : ["Basic computer literacy"],
      learningOutcomes: c.expectedOutcomes.length ? c.expectedOutcomes : c.learningGoals,
      conceptMap: [],
      assessmentRecommendations: normalized.assessmentStrategy.methods,
      researchSources: ["University syllabuses", "Industry certifications"],
      researchedAt: new Date().toISOString(),
    };
  }

  let blueprint = planCurriculumStructure(normalized, research);
  blueprint = await enrichStructuralBlueprint(blueprint, normalized);
  blueprint = enforceBlueprintStructure(blueprint, normalized, research);

  let academicBlueprint = buildAcademicCourseBlueprint(normalized, research, blueprint);
  academicBlueprint = await enrichAcademicBlueprint(academicBlueprint, normalized, research);
  // Re-assert counts after narrative enrichment
  academicBlueprint.lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  academicBlueprint.moduleStructure = blueprint.modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessonCount: m.lessons.length,
    focus: m.description.slice(0, 120),
  }));
  blueprint.academicBlueprint = academicBlueprint;
  blueprint.phase = "planned";
  blueprint.knowledgeGraph = research.skillDependencyGraph;
  blueprint.prerequisiteGraph = research.prerequisiteGraph;

  return {
    research,
    blueprint,
    academicBlueprint,
    prerequisiteGraph: research.prerequisiteGraph,
    difficultyProgression: blueprint.difficultyProgression,
    trackCount: blueprint.tracks?.length ?? 1,
  };
}

export async function runCurriculumArchitectAgent(interview: AICourseArchitectInterview) {
  const normalized = normalizeInterview(interview);
  return runAgent({
    stage: "curriculum-architect",
    input: normalized,
    execute: executeCurriculumArchitect,
    validate: (output) => validateCurriculum(output, normalized),
    maxAttempts: 2,
    minConfidence: 70,
  });
}
