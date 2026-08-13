import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { AuthRequest } from "../middlewares/auth.js";
import {
  generateCourseBlueprint,
  performQualityReview,
  regenerateBlueprintSection,
  researchAndPlanCurriculum,
  generateApprovedCourseContent,
} from "../services/aiCourseArchitect/aiCourseArchitectService.js";
import {
  buildProjectFromBlueprint,
  assignVideosToLessons,
} from "../services/aiCourseArchitect/aiArchitectLaTeXEmitter.js";
import {
  normalizeVideoMappings,
  validateVideoMappingsForPublish,
} from "../services/aiCourseArchitect/videoAssignmentEngine.js";
import { validateGeneratedProject } from "../services/aiCourseArchitect/aiArchitectProjectValidator.js";
import { syncArchitectMediaAssets } from "../services/aiCourseArchitect/aiArchitectMediaSync.js";
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectGenerateResult,
} from "../services/aiCourseArchitect/types.js";
import { LEARNING_COMPONENT_IDS, normalizeInterview, DEFAULT_LESSON_STRUCTURE } from "../services/aiCourseArchitect/types.js";
import { validateCurriculumBlueprint } from "../services/aiCourseArchitect/curriculumValidator.js";
import { runDeliveryPipeline } from "../services/aiCourseArchitect/orchestrator/deliveryPipeline.js";
import { STRICT_QA_BLOCK, SKIP_THUMBNAIL_ON_GENERATE } from "../services/aiCourseArchitect/architectPerformance.js";
import {
  isArchitectAiDegraded,
  isArchitectAiQuotaError,
  resetArchitectAiDegraded,
} from "../services/aiCourseArchitect/architectLLM.js";
import {
  createLearningUniverseDraft,
  updateLearningUniverseBranding,
} from "./learning-universe-controller.js";
import { writeLuProjectToDb } from "../services/luProject/migrateSingleFileToProject.js";
import { buildMainTexFromProject } from "../services/luProject/luProjectMainTexBuilder.js";
import { generateCourseThumbnail } from "../services/aiCourseAuthoringService.js";
import { AGENT_REGISTRY, ORCHESTRATOR_AGENT_COUNT, SUPPORTING_AGENTS } from "../services/aiCourseArchitect/agentRegistry.js";
import { ORCHESTRATOR_VERSION } from "../services/aiCourseArchitect/orchestrator/contracts.js";

/** Strip runtime-only Part 4 metadata before persisting blueprint JSON. */
function serializeBlueprintForDb(blueprint: ArchitectBlueprint): unknown {
  return JSON.parse(
    JSON.stringify(blueprint, (key, value) => (key === "part4" ? undefined : value))
  );
}
import {
  parseProductType,
  syncProductListingRecord,
  validateProductPersistence,
  buildStructuredDataProductMeta,
  assertProductTypeMatch,
  readStructuredRecord,
} from "../services/productRoutingService.js";
import { hasOpenAiKey } from "../services/aiCourseArchitect/openaiClient.js";

/** Prevents concurrent duplicate generates for the same instructor. */
const activeGenerations = new Map<string, number>();

function friendlyArchitectError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : "Course generation failed";
  const lower = message.toLowerCase();
  if (lower.includes("openai") && (lower.includes("key") || lower.includes("api key") || lower.includes("401"))) {
    return new AppError(
      503,
      "AI provider is not configured or the API key is invalid. Set OPENAI_API_KEY and try again.",
    );
  }
  if (lower.includes("quota") || lower.includes("rate limit") || lower.includes("429")) {
    return new AppError(
      503,
      "AI provider rate limit or quota was reached. Your progress was not published. Please retry in a few minutes.",
    );
  }
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("aborted")) {
    return new AppError(
      504,
      "Course generation timed out. Completed stages were not saved for this attempt — please retry.",
    );
  }
  if (lower.includes("unexpected token") || lower.includes("json")) {
    return new AppError(
      502,
      "The AI returned invalid structured data. Please retry generation. No corrupt course was published.",
    );
  }
  return new AppError(500, message.replace(/^Error:\s*/i, ""));
}

function parseInterview(body: unknown): AICourseArchitectInterview {
  if (!body || typeof body !== "object") throw new AppError(400, "Interview data required");
  const b = body as AICourseArchitectInterview;

  const legacyComponents = [
    ...(b.practicalLearning?.enabled ?? []),
    ...(b.assessments?.types ?? []),
    ...(b.resources?.types ?? []),
    ...(b.curriculumStrategyLegacy?.contentStyles ?? []),
  ];
  const learningComponents =
    b.learningComponents?.length ? b.learningComponents : legacyComponents.length ? legacyComponents : [...LEARNING_COMPONENT_IDS.slice(0, 12)];

  const normalizedMappings = normalizeVideoMappings(b.videoStrategy?.mappings || []);
  if (normalizedMappings.length > 0 && !learningComponents.some((c) => c.toLowerCase().includes("video"))) {
    learningComponents.push("Video Lessons");
  }

  if (!b.courseInfo?.title?.trim()) throw new AppError(400, "Course title is required");
  if (!b.courseInfo?.subject?.trim()) throw new AppError(400, "Subject is required");
  if (!b.productType?.trim()) throw new AppError(400, "productType is required and must come from the creation flow");

  const productType = parseProductType(b.productType) as AICourseArchitectInterview["productType"];
  if (!["premium-course", "learning-universe", "free-course"].includes(productType)) {
    throw new AppError(400, `Unsupported productType for AI architect: ${productType}`);
  }

  const raw: AICourseArchitectInterview = {
    productType,
    courseInfo: {
      title: b.courseInfo.title.trim(),
      subtitle: b.courseInfo.subtitle?.trim(),
      subject: b.courseInfo.subject.trim(),
      domain: b.courseInfo.domain?.trim(),
      categoryId: b.courseInfo.categoryId,
      categoryName: b.courseInfo.categoryName,
      subcategory: b.courseInfo.subcategory,
      targetAudience: b.courseInfo.targetAudience || "Professionals and students",
      prerequisites: b.courseInfo.prerequisites || [],
      industry: b.courseInfo.industry || "Technology",
      learningGoals: b.courseInfo.learningGoals || [],
      expectedOutcomes: b.courseInfo.expectedOutcomes || [],
      estimatedDuration: b.courseInfo.estimatedDuration || "40 hours",
      estimatedHours: b.courseInfo.estimatedHours,
      difficulty: b.courseInfo.difficulty || "intermediate",
      certificationEligible: !!b.courseInfo.certificationEligible,
      language: b.courseInfo.language || "en",
      academicLevel: b.courseInfo.academicLevel || "intermediate",
      courseType: b.courseInfo.courseType || "professional",
    },
    courseScale: b.courseScale ?? { id: "standard" },
    difficultyDistribution: b.difficultyDistribution ?? { mode: "ai-decides" },
    learningStyle: b.learningStyle?.length ? b.learningStyle : ["balanced"],
    teachingStyle: b.teachingStyle?.length ? b.teachingStyle : ["professional"],
    lessonStructure: b.lessonStructure?.length ? b.lessonStructure : DEFAULT_LESSON_STRUCTURE,
    practicalComponents: b.practicalComponents?.length ? b.practicalComponents : [],
    assessmentStrategy: b.assessmentStrategy ?? {
      style: "Quiz after every module",
      methods: b.assessments?.types ?? ["Quizzes", "Projects"],
    },
    curriculumStrategy: {
      progression: b.curriculumStrategy?.progression || ["beginner-intermediate-advanced"],
      aiDecidesCurriculum: b.curriculumStrategy?.aiDecidesCurriculum ?? true,
    },
    learningComponents,
    videoStrategy: (() => {
      let method = b.videoStrategy?.method || "add-later";
      const mappings = normalizeVideoMappings(b.videoStrategy?.mappings || []);
      const includeVideos =
        b.videoStrategy?.includeVideos === false
          ? false
          : mappings.length > 0
            ? true
            : b.videoStrategy?.includeVideos ?? false;
      if (mappings.length > 0 && method === "add-later") {
        const hasYoutube = mappings.some((m) => m.type === "youtube");
        const hasUpload = mappings.some((m) => m.type === "upload");
        method = hasYoutube && hasUpload ? "both" : hasYoutube ? "youtube-urls" : "local-uploads";
      }
      return {
        includeVideos,
        method,
        placement: b.videoStrategy?.placement ?? "ai-auto",
        durationPreference: b.videoStrategy?.durationPreference,
        mappings,
      };
    })(),
    banner: b.banner,
    researchDepth: b.researchDepth || "professional",
    practicalLearning: b.practicalLearning,
    assessments: b.assessments,
    resources: b.resources,
    curriculumStrategyLegacy: b.curriculumStrategyLegacy,
  };

  return normalizeInterview(raw);
}

function resolveVideoPlacement(interview: AICourseArchitectInterview) {
  return interview.videoStrategy.placement ?? "ai-auto";
}

function applyVideoAssignments(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): ArchitectBlueprint {
  const mappings = normalizeVideoMappings(interview.videoStrategy.mappings);
  if (!mappings.length) return blueprint;
  if (interview.videoStrategy.includeVideos === false) return blueprint;
  return assignVideosToLessons(blueprint, mappings, resolveVideoPlacement(interview));
}

export async function architectResearch(req: AuthRequest, res: Response) {
  const interview = parseInterview(req.body?.interview ?? req.body);
  const { research, blueprint, curriculumValidation } = await researchAndPlanCurriculum(interview);
  res.json({ success: true, data: { research, blueprint, curriculumValidation } });
}

export async function architectValidateCurriculum(req: AuthRequest, res: Response) {
  const interview = parseInterview(req.body?.interview ?? req.body);
  const blueprint = req.body?.blueprint as ArchitectBlueprint;
  if (!blueprint?.modules?.length) throw new AppError(400, "Blueprint required");
  const curriculumValidation = validateCurriculumBlueprint(blueprint, interview);
  res.json({ success: true, data: { curriculumValidation } });
}

export async function architectBlueprint(req: AuthRequest, res: Response) {
  const interview = parseInterview(req.body?.interview ?? req.body);
  const { research, blueprint, curriculumValidation } = await researchAndPlanCurriculum(interview);
  const withVideos = applyVideoAssignments(blueprint, interview);
  const qualityReport = performQualityReview(withVideos, interview);
  res.json({
    success: true,
    data: { research, blueprint: withVideos, curriculumValidation, qualityReport },
  });
}

export async function architectQualityReview(req: AuthRequest, res: Response) {
  const interview = parseInterview(req.body?.interview ?? req.body);
  const blueprint = req.body?.blueprint as ArchitectBlueprint;
  if (!blueprint?.modules?.length) throw new AppError(400, "Blueprint required");
  const qualityReport = performQualityReview(blueprint, interview);
  res.json({ success: true, data: { qualityReport } });
}

export async function architectRegenerate(req: AuthRequest, res: Response) {
  const interview = parseInterview(req.body?.interview);
  const blueprint = req.body?.blueprint as ArchitectBlueprint;
  const scope = req.body?.scope as "module" | "lesson" | "quiz";
  const targetId = req.body?.targetId as string;
  if (!blueprint || !scope || !targetId) throw new AppError(400, "blueprint, scope, and targetId required");

  const updated = await regenerateBlueprintSection(interview, blueprint, scope, targetId);
  const withVideos = applyVideoAssignments(updated, interview);
  const qualityReport = performQualityReview(withVideos, interview);
  res.json({ success: true, data: { blueprint: withVideos, qualityReport } });
}

async function resolveValidCategoryId(categoryId?: string): Promise<string | undefined> {
  if (!categoryId?.trim()) return undefined;
  const category = await prisma.category.findUnique({
    where: { id: categoryId.trim() },
    select: { id: true },
  });
  return category?.id;
}

function serializeStructuredData(value: unknown): object {
  try {
    return JSON.parse(JSON.stringify(value)) as object;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid course metadata";
    throw new AppError(500, `Failed to save generated course metadata: ${message}`);
  }
}

export async function architectGenerate(req: AuthRequest, res: Response) {
  resetArchitectAiDegraded();
  const userId = req.user!.id;

  if (activeGenerations.has(userId)) {
    throw new AppError(
      409,
      "A course generation is already running for your account. Please wait for it to finish before starting another.",
    );
  }
  activeGenerations.set(userId, Date.now());

  try {
  if (!hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn("[AI Architect] No AI provider keys configured — generation will use heuristics / degraded mode");
  }

  const interview = parseInterview(req.body?.interview);
  let blueprint = req.body?.blueprint as ArchitectBlueprint;
  const approved = req.body?.approved !== false;

  if (!blueprint?.modules?.length) {
    blueprint = await generateCourseBlueprint(interview);
  }

  if (!approved) {
    throw new AppError(400, "Curriculum blueprint must be approved before generation");
  }

  const normalizedVideoMappings = normalizeVideoMappings(interview.videoStrategy.mappings);
  if (
    interview.videoStrategy.includeVideos !== false &&
    interview.videoStrategy.mappings.length > 0 &&
    normalizedVideoMappings.length < interview.videoStrategy.mappings.length
  ) {
    throw new AppError(
      422,
      `${interview.videoStrategy.mappings.length - normalizedVideoMappings.length} instructor video(s) failed validation. Fix invalid YouTube URLs or upload formats before generating.`
    );
  }

  const videoIssues = validateVideoMappingsForPublish(normalizedVideoMappings);
  if (videoIssues.length > 0 && interview.videoStrategy.includeVideos !== false) {
    throw new AppError(422, `Video validation failed: ${videoIssues.slice(0, 3).join("; ")}`);
  }

  const interviewWithVideos: AICourseArchitectInterview = {
    ...interview,
    videoStrategy: { ...interview.videoStrategy, mappings: normalizedVideoMappings },
  };

  const isPlanned = blueprint.phase === "planned" || blueprint.modules.some((m) =>
    m.lessons.some((l) => !l.theory?.trim() || l.contentStatus === "planned")
  );

  let qualityReport: Awaited<ReturnType<typeof performQualityReview>>;
  blueprint = applyVideoAssignments(blueprint, interviewWithVideos);

  if (isPlanned) {
    try {
      const populated = await generateApprovedCourseContent(blueprint, interviewWithVideos);
      blueprint = populated.blueprint;
      qualityReport = populated.qualityReport;
    } catch (err) {
      console.error("[AI Architect] Content generation error:", err);
      if (isArchitectAiQuotaError(err)) {
        qualityReport = performQualityReview(blueprint, interviewWithVideos);
      } else {
        throw friendlyArchitectError(err);
      }
    }
  } else {
    qualityReport = performQualityReview(blueprint, interviewWithVideos);
  }

  blueprint = applyVideoAssignments(blueprint, interviewWithVideos);

  const delivery = await runDeliveryPipeline({ interview: interviewWithVideos, blueprint });
  blueprint = delivery.blueprint;
  const qaWarning =
    !delivery.publisher.ready && STRICT_QA_BLOCK
      ? `Quality score ${delivery.qualityAssurance.score}/100 — review and regenerate weak lessons in Academic Studio before publishing.`
      : undefined;
  if (qaWarning) {
    console.warn(`[AI Architect] Draft generation continuing despite QA gate: ${qaWarning}`);
  }

  const bannerUrl = interview.banner?.bannerUrl;
  const thumbnailUrl = interview.banner?.thumbnailUrl || bannerUrl;

  let draftId: string | undefined;
  let projectId: string | undefined;

  const rollbackDraft = async () => {
    if (projectId) {
      await prisma.latexProject.delete({ where: { id: projectId } }).catch(() => {});
    }
    if (draftId) {
      await prisma.learningUniverse.delete({ where: { id: draftId } }).catch(() => {});
    }
  };

  try {
  const categoryId = await resolveValidCategoryId(interview.courseInfo.categoryId);
  const draft = await createLearningUniverseDraft(userId, {
    title: blueprint.courseTitle,
    subtitle: blueprint.subtitle,
    description: blueprint.description,
    categoryId,
    difficulty: blueprint.difficulty,
    productType: interview.productType,
    price: interview.productType === "premium-course"
      ? (typeof interview.courseInfo.price === "number" ? interview.courseInfo.price : 0)
      : 0,
    bannerUrl: bannerUrl ?? undefined,
    thumbnailUrl: thumbnailUrl ?? undefined,
    bannerType: interview.banner?.bannerType,
  });
  draftId = draft.id;

  const project = await prisma.latexProject.create({
    data: { title: blueprint.courseTitle, ownerId: userId },
  });
  projectId = project.id;

  let built: ReturnType<typeof buildProjectFromBlueprint>;
  try {
    built = delivery.projectBuild ?? buildProjectFromBlueprint(blueprint, interviewWithVideos);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Project build failed";
    throw new AppError(500, `Failed to build LaTeX project from blueprint: ${message}`);
  }
  const mainTex = buildMainTexFromProject(built.project);
  await writeLuProjectToDb(project.id, built.project, built.files, mainTex);

  await syncArchitectMediaAssets(draft.id, normalizedVideoMappings);

  const validationReport = await validateGeneratedProject({
    projectId: project.id,
    project: built.project,
    files: built.files,
    mainTex,
  });

  if (!validationReport.passed) {
    await rollbackDraft();
    throw new AppError(422, `Generation validation failed: ${validationReport.missingFiles.slice(0, 3).join("; ")}`);
  }

  let generatedThumbnail = thumbnailUrl;
  if (!generatedThumbnail && !SKIP_THUMBNAIL_ON_GENERATE) {
    try {
      generatedThumbnail =
        (await generateCourseThumbnail(blueprint.marketing.bannerPrompt, blueprint.courseTitle)) ?? undefined;
    } catch {
      /* optional */
    }
  }

  const existingStructured = readStructuredRecord(draft.structuredData);
  await prisma.learningUniverse.update({
    where: { id: draft.id },
    data: {
      sourceProjectId: project.id,
      thumbnail: generatedThumbnail ?? draft.thumbnail,
      bannerUrl: generatedThumbnail ?? draft.bannerUrl,
      structuredData: serializeStructuredData({
        ...existingStructured,
        ...buildStructuredDataProductMeta(interview.productType, "ai-architect", {
          sourceProjectId: project.id,
        }),
        // Persist Architect certification toggle for runtime certificate eligibility (not PDF engine).
        completionRules: {
          certificateEligible: !!interview.courseInfo.certificationEligible,
          minimumProgressPercent: 100,
          requireAllRequiredSteps: true,
        },
        aiArchitect: {
          interview: { ...interviewWithVideos, productType: interview.productType },
          blueprint: serializeBlueprintForDb(blueprint),
          qualityReport,
          validationReport,
          qaWarning,
          aiDegraded: isArchitectAiDegraded(),
          generatedAt: new Date().toISOString(),
        },
        universe: {
          title: blueprint.courseTitle,
          description: blueprint.description,
          difficulty: blueprint.difficulty,
          thumbnail: generatedThumbnail,
        },
        marketing: blueprint.marketing,
      }),
    },
  });

  const productRouting = await syncProductListingRecord({
    universeId: draft.id,
    productType: parseProductType(interview.productType),
    instructorId: userId,
    title: blueprint.courseTitle,
    subtitle: blueprint.subtitle,
    description: blueprint.description,
    thumbnail: generatedThumbnail ?? draft.thumbnail,
    categoryId,
    difficulty: blueprint.difficulty,
    price: interview.productType === "premium-course"
      ? (typeof interview.courseInfo.price === "number" ? interview.courseInfo.price : 0)
      : 0,
    sourceProjectId: project.id,
    creationSource: "ai-architect",
  });

  validateProductPersistence(parseProductType(interview.productType), productRouting);

  if (req.body?.expectedProductType) {
    assertProductTypeMatch(
      parseProductType(String(req.body.expectedProductType)),
      productRouting.productType,
      "generate request"
    );
  }

  if (generatedThumbnail) {
    await updateLearningUniverseBranding(draft.id, userId, {
      thumbnailUrl: generatedThumbnail,
      bannerUrl: generatedThumbnail,
      bannerType: interview.banner?.bannerType || "ai-generated",
    }).catch(() => {});
  }

  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  const result: ArchitectGenerateResult = {
    universeId: draft.id,
    projectId: project.id,
    productType: interview.productType,
    listingEntityId: productRouting.listingEntityId,
    listingTable: productRouting.listingTable,
    lessonCount,
    moduleCount: blueprint.modules.length,
    qualityReport,
    validationReport,
    thumbnailUrl: generatedThumbnail,
  };

  res.status(201).json({
    success: true,
    data: {
      ...result,
      qaWarning,
      aiDegraded: isArchitectAiDegraded(),
    },
  });
  } catch (err) {
    await rollbackDraft();
    if (err instanceof AppError) throw err;
    throw friendlyArchitectError(err);
  }
  } finally {
    activeGenerations.delete(userId);
  }
}

export async function architectGetAgents(_req: AuthRequest, res: Response) {
  res.json({
    success: true,
    data: {
      version: ORCHESTRATOR_VERSION,
      agentCount: ORCHESTRATOR_AGENT_COUNT,
      agents: AGENT_REGISTRY,
      supportingAgents: SUPPORTING_AGENTS,
      features: {
        rag: true,
        multiSourceConsensus: true,
        adaptiveGeneration: true,
        studentSimulation: true,
        codeValidation: true,
        multiProviderModels: true,
        fieldOwnership: true,
        productionPublishThreshold: 98,
      },
    },
  });
}

export async function architectBannerSuggestions(req: AuthRequest, res: Response) {
  const interview = parseInterview(req.body?.interview ?? req.body);
  const blueprint = req.body?.blueprint as ArchitectBlueprint | undefined;
  const c = interview.courseInfo;

  res.json({
    success: true,
    data: {
      bannerPrompt:
        blueprint?.marketing?.bannerPrompt ||
        `Professional e-learning banner for ${c.title}, ${c.subject}, modern education, no text`,
      colorTheme: blueprint?.marketing?.colorTheme || interview.banner?.colorTheme || "deep blue and gold",
      seoTitle: blueprint?.marketing?.seoTitle || `${c.title} | THE GATEHUB`,
      seoDescription:
        blueprint?.marketing?.seoDescription ||
        `Learn ${c.subject} with a production-ready course on THE GATEHUB.`,
      tags: blueprint?.marketing?.tags || [c.subject, c.industry, c.difficulty],
      highlights: blueprint?.marketing?.highlights || c.learningGoals,
      prerequisites: c.prerequisites,
      learningOutcomes: blueprint?.learningOutcomes || c.expectedOutcomes,
    },
  });
}
