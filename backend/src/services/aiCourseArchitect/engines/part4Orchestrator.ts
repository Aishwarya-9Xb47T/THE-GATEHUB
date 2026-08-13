/**
 * V6 Part 4 — Central orchestrator wiring all Part 4 engines into the pipeline.
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectBlueprint, ArchitectLessonBlueprint, AICourseArchitectInterview } from "../types.js";
import { buildAdaptiveProfile } from "../adaptiveProfile.js";
import { buildLessonOutlineContext } from "../lessonPlanningEngine.js";
import { applyMasterPedagogyToPlan, validatePedagogyCompliance, formatMasterPedagogyForPrompt } from "./masterPedagogy.js";
import { mapLessonBloomActivities, formatBloomMappingForPrompt, bloomsCoverageScore } from "./bloomsEngine.js";
import { buildLearningStyleProfile, applyLearningStyleToPlan, formatLearningStyleForPrompt } from "./learningStyleEngine.js";
import {
  buildStudentPersonaProfile,
  formatPersonaForPrompt,
  applyPersonaToAdaptiveProfile,
  inferStudentPersona,
} from "./studentPersonaEngine.js";
import { buildLearningPaths } from "./learningPathsEngine.js";
import { analyzePrerequisites, formatPrerequisitesForPrompt } from "./prerequisiteDetector.js";
import { resolveContentDensity, formatContentDensityForPrompt } from "./contentDensityEngine.js";
import {
  buildExampleRequirements,
  suggestAnalogies,
  buildStoryHooks,
  enrichIndustryContext,
  mapCareerOpportunities,
  formatExampleRequirementsForPrompt,
} from "./contentEnrichmentEngines.js";
import {
  generatePracticeMaterials,
  buildEngagementMeta,
  buildGamificationMeta,
  mapCertificationAlignment,
  getProjectEscalationLevel,
} from "./practiceEngagementEngine.js";
import { buildAccessibilityPlus } from "./accessibilityPlus.js";
import { scoreLessonComplexity } from "./difficultyBalancer.js";
import { scoreLessonComponents } from "./componentConfidence.js";
import { resolveMultiLanguageMeta } from "./multiLanguageEngine.js";
import { computeLessonAnalytics } from "./learningAnalytics.js";
import { buildContentVersion } from "./contentVersioning.js";
import { buildEnterpriseCompliance } from "./enterpriseCompliance.js";
import { buildLmsIntegrationMeta } from "./lmsIntegration.js";
import { analyzeCurriculumGaps } from "./knowledgeGapAnalyzer.js";
import { auditDifficultyProgression } from "./difficultyBalancer.js";

export interface Part4LessonMeta {
  bloomMappings: ReturnType<typeof mapLessonBloomActivities>;
  bloomsCoverage: number;
  complexity: ReturnType<typeof scoreLessonComplexity>;
  engagement: ReturnType<typeof buildEngagementMeta>;
  gamification: ReturnType<typeof buildGamificationMeta>;
  practice: ReturnType<typeof generatePracticeMaterials>;
  career: ReturnType<typeof mapCareerOpportunities>;
  certification: ReturnType<typeof mapCertificationAlignment>;
  accessibilityPlus: ReturnType<typeof buildAccessibilityPlus>;
  componentConfidence: ReturnType<typeof scoreLessonComponents>;
  pedagogyCompliance: ReturnType<typeof validatePedagogyCompliance>;
  projectLevel: ReturnType<typeof getProjectEscalationLevel>;
}

export interface Part4CourseMeta {
  learningPaths: ReturnType<typeof buildLearningPaths>;
  gapAnalysis: ReturnType<typeof analyzeCurriculumGaps>;
  difficultyBalance: ReturnType<typeof auditDifficultyProgression>;
  contentVersion: ReturnType<typeof buildContentVersion>;
  enterpriseCompliance: ReturnType<typeof buildEnterpriseCompliance>;
  lmsIntegration: ReturnType<typeof buildLmsIntegrationMeta>;
  multiLanguage: ReturnType<typeof resolveMultiLanguageMeta>;
  persona: ReturnType<typeof buildStudentPersonaProfile>;
}

/** Apply Part 4 pedagogy to lesson plan before generation. */
export function enrichLessonPlanPart4(
  plan: LessonBlueprintPlan,
  ctx: LessonPipelineContext
): LessonBlueprintPlan {
  const persona = buildStudentPersonaProfile(ctx.interview);
  const style = buildLearningStyleProfile(ctx.interview);
  const density = resolveContentDensity(ctx.interview);
  const adaptive = applyPersonaToAdaptiveProfile(
    ctx.adaptiveProfile ?? buildAdaptiveProfile(ctx.interview),
    persona
  );

  let enriched = applyMasterPedagogyToPlan(plan, ctx.interview);
  enriched = applyLearningStyleToPlan(enriched, style);
  enriched = {
    ...enriched,
    adaptiveProfile: adaptive,
    estimatedReadingMinutes: density.durationMinutes,
    motivation: enriched.motivation ?? `Persona (${persona.persona}): ${enriched.lessonObjective}`,
  };
  return enriched;
}

/** Build Part 4 prompt context for Lesson Writer. */
export function formatPart4PromptContext(
  plan: LessonBlueprintPlan,
  ctx: LessonPipelineContext
): string {
  const persona = buildStudentPersonaProfile(ctx.interview);
  const style = buildLearningStyleProfile(ctx.interview);
  const density = resolveContentDensity(ctx.interview);
  const outline = buildLessonOutlineContext(ctx.blueprint, ctx.modIndex, ctx.lessonIndex);
  const prereqs = analyzePrerequisites(ctx.skeleton, outline, ctx.blueprint);
  const examples = buildExampleRequirements(plan, ctx.interview);
  const analogies = suggestAnalogies(plan.lessonObjective, persona);
  const stories = buildStoryHooks(plan, ctx.interview);
  const blooms = mapLessonBloomActivities(ctx.skeleton, plan);

  return [
    formatMasterPedagogyForPrompt(plan),
    formatPersonaForPrompt(persona),
    formatLearningStyleForPrompt(style),
    formatContentDensityForPrompt(density),
    formatPrerequisitesForPrompt(prereqs),
    formatExampleRequirementsForPrompt(examples),
    `ANALOGIES (use one): ${analogies.join("; ")}`,
    `STORY HOOKS: ${stories.join(" | ")}`,
    formatBloomMappingForPrompt(blooms),
    ctx.memoryContext ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Attach Part 4 metadata to a generated lesson. */
export function enrichLessonPart4(
  lesson: ArchitectLessonBlueprint,
  plan: LessonBlueprintPlan,
  ctx: LessonPipelineContext,
  lessonIndex: number,
  totalLessons: number,
  retrievalConfidence = 0
): ArchitectLessonBlueprint & { part4?: Part4LessonMeta } {
  const persona = inferStudentPersona(ctx.interview);
  const industryText = enrichIndustryContext(lesson, ctx.interview);
  const career = mapCareerOpportunities(lesson, ctx.interview);
  const practice = generatePracticeMaterials(lesson);
  const analytics = lesson.learningAnalytics ?? computeLessonAnalytics(lesson, ctx.interview);

  return {
    ...lesson,
    industryNotes: industryText,
    flashcards: lesson.flashcards?.length ? lesson.flashcards : practice.flashcards,
    cheatSheet: lesson.cheatSheet ?? practice.cheatSheet,
    discussionPrompt: lesson.discussionPrompt ?? buildEngagementMeta(lesson).reflectionQuestions[0],
    learningAnalytics: {
      ...analytics,
      careerMapping: career.jobRoles,
      certificationMapping: mapCertificationAlignment(lesson, ctx.interview).certifications,
    },
    part4: {
      bloomMappings: mapLessonBloomActivities(lesson, plan),
      bloomsCoverage: bloomsCoverageScore(mapLessonBloomActivities(lesson, plan)),
      complexity: scoreLessonComplexity(lesson),
      engagement: buildEngagementMeta(lesson),
      gamification: buildGamificationMeta(lesson, lessonIndex),
      practice,
      career,
      certification: mapCertificationAlignment(lesson, ctx.interview),
      accessibilityPlus: buildAccessibilityPlus(lesson),
      componentConfidence: scoreLessonComponents(lesson, retrievalConfidence),
      pedagogyCompliance: validatePedagogyCompliance(lesson, plan),
      projectLevel: getProjectEscalationLevel(lessonIndex, totalLessons, persona),
    },
  };
}

/** Attach Part 4 course-level metadata to blueprint. */
export function enrichBlueprintPart4(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): ArchitectBlueprint & { part4?: Part4CourseMeta } {
  return {
    ...blueprint,
    part4: {
      learningPaths: buildLearningPaths(blueprint, interview),
      gapAnalysis: analyzeCurriculumGaps(blueprint, interview),
      difficultyBalance: auditDifficultyProgression(blueprint),
      contentVersion: buildContentVersion(blueprint),
      enterpriseCompliance: buildEnterpriseCompliance(blueprint),
      lmsIntegration: buildLmsIntegrationMeta(blueprint, interview),
      multiLanguage: resolveMultiLanguageMeta(),
      persona: buildStudentPersonaProfile(interview),
    },
  };
}
