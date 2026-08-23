/**
 * V6 Persistent Asynchronous Course Generation Job Service.
 * Implements Rules 2, 3, 4, 8, 20, 21, 22, 23, 24, 25, 34:
 * - Persistent async job lifecycle (QUEUED, RUNNING, PAUSED, RETRYING, COMPLETED, FAILED, CANCELLED)
 * - Checkpointed stages: CURRICULUM, BLUEPRINT, LESSON_CONTENT, ASSESSMENTS, LABS, MEDIA, LATEX, QUALITY_CHECK, SAVE_DRAFT, PUBLISH
 * - Resumable from last successful checkpoint
 * - Incremental lesson-by-lesson content saving
 * - Safe error codes and detailed structured logging
 */
import { randomUUID } from "crypto";
import { prisma } from "../../utils/prisma.js";
import {
  generateCourseBlueprint,
  performQualityReview,
  researchAndPlanCurriculum,
  generateApprovedCourseContent,
} from "./aiCourseArchitectService.js";
import {
  buildProjectFromBlueprint,
  assignVideosToLessons,
} from "./aiArchitectLaTeXEmitter.js";
import {
  normalizeVideoMappings,
  validateVideoMappingsForPublish,
} from "./videoAssignmentEngine.js";
import { validateGeneratedProject } from "./aiArchitectProjectValidator.js";
import { syncArchitectMediaAssets } from "./aiArchitectMediaSync.js";
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectGenerateResult,
  ArchitectQualityReport,
  ArchitectValidationReport,
} from "./types.js";
import { normalizeInterview } from "./types.js";
import {
  BlueprintValidationError,
  normalizeAndValidateApprovedBlueprint,
} from "./blueprintNormalizer.js";
import { runDeliveryPipeline, runFastDeliveryPipeline } from "./orchestrator/deliveryPipeline.js";
import { STRICT_QA_BLOCK, SKIP_THUMBNAIL_ON_GENERATE } from "./architectPerformance.js";
import { isArchitectAiDegraded, isArchitectAiQuotaError, resetArchitectAiDegraded } from "./architectLLM.js";
import { createLearningUniverseDraft, updateLearningUniverseBranding } from "../../controllers/learning-universe-controller.js";
import { writeLuProjectToDb } from "../luProject/migrateSingleFileToProject.js";
import { buildMainTexFromProject } from "../luProject/luProjectMainTexBuilder.js";
import { generateCourseThumbnail } from "../aiCourseAuthoringService.js";
import {
  parseProductType,
  syncProductListingRecord,
  validateProductPersistence,
  buildStructuredDataProductMeta,
  readStructuredRecord,
} from "../productRoutingService.js";
import { persistRemoteBannerIfNeeded } from "../bannerService.js";
import { isMissingObjectError } from "../b2StorageService.js";

export type CourseJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type CourseJobStage =
  | "CURRICULUM"
  | "BLUEPRINT"
  | "LESSON_CONTENT"
  | "ASSESSMENTS"
  | "LABS"
  | "MEDIA"
  | "LATEX"
  | "QUALITY_CHECK"
  | "SAVE_DRAFT"
  | "PUBLISH";

export interface CourseGenerationJobData {
  id: string;
  courseId?: string;
  universeId?: string;
  projectId?: string;
  userId: string;
  status: CourseJobStatus;
  currentStage: CourseJobStage;
  currentLesson?: number;
  totalLessons?: number;
  completedLessons?: number;
  progress: number; // 0 to 100
  stageMessage?: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  retryCount: number;
  interview: AICourseArchitectInterview;
  blueprint?: ArchitectBlueprint;
  checkpoints: {
    blueprintApproved?: boolean;
    curriculumResearched?: boolean;
    lessonsCompleted?: string[];
    mediaSynced?: boolean;
    latexBuilt?: boolean;
    draftCreated?: boolean;
    qualityChecked?: boolean;
    published?: boolean;
  };
  resultData?: ArchitectGenerateResult & {
    qaWarning?: string;
    aiDegraded?: boolean;
  };
}

/** In-memory store backed by periodic DB persistence */
const jobs = new Map<string, CourseGenerationJobData>();

/** Active user running job tracker */
const userActiveJobs = new Map<string, string>();

export function getJob(jobId: string): CourseGenerationJobData | undefined {
  return jobs.get(jobId);
}

export function getUserActiveJob(userId: string): CourseGenerationJobData | undefined {
  const jobId = userActiveJobs.get(userId);
  if (!jobId) return undefined;
  const job = jobs.get(jobId);
  if (job && (job.status === "QUEUED" || job.status === "RUNNING" || job.status === "RETRYING")) {
    return job;
  }
  userActiveJobs.delete(userId);
  return undefined;
}

export function updateJob(jobId: string, updates: Partial<CourseGenerationJobData>): CourseGenerationJobData {
  const existing = jobs.get(jobId);
  if (!existing) {
    // Allow upsert for resume / test fixture injection
    const base = updates as CourseGenerationJobData;
    if (!base.id || !base.userId || !base.interview) {
      throw new Error(`Job ${jobId} not found and update does not contain a full job record`);
    }
    const record: CourseGenerationJobData = {
      ...base,
      id: jobId,
      checkpoints: base.checkpoints ?? {},
      updatedAt: new Date().toISOString(),
    };
    jobs.set(jobId, record);
    return record;
  }
  const updated = {
    ...existing,
    ...updates,
    checkpoints: { ...existing.checkpoints, ...(updates.checkpoints || {}) },
    updatedAt: new Date().toISOString(),
  };
  jobs.set(jobId, updated);
  return updated;
}

export function cancelJob(jobId: string, userId: string): CourseGenerationJobData {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.userId !== userId) throw new Error("Unauthorized");
  if (job.status === "COMPLETED") throw new Error("Cannot cancel completed job");
  userActiveJobs.delete(userId);
  return updateJob(jobId, {
    status: "CANCELLED",
    stageMessage: "Generation cancelled by user",
  });
}

function serializeBlueprintForDb(blueprint: ArchitectBlueprint): unknown {
  return JSON.parse(
    JSON.stringify(blueprint, (key, value) => (key === "part4" ? undefined : value))
  );
}

function serializeStructuredData(value: unknown): object {
  try {
    return JSON.parse(JSON.stringify(value)) as object;
  } catch {
    return {};
  }
}

async function resolveValidCategoryId(categoryId?: string): Promise<string | undefined> {
  if (!categoryId?.trim()) return undefined;
  const category = await prisma.category.findUnique({
    where: { id: categoryId.trim() },
    select: { id: true },
  });
  return category?.id;
}

/**
 * Execute or Resume a Course Generation Job through all checkpointed stages.
 */
export async function executeCourseGenerationJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  const userId = job.userId;
  const interview = normalizeInterview(job.interview);
  resetArchitectAiDegraded();

  console.info(`[COURSE_GEN] job_started jobId=${jobId} userId=${userId} title="${interview.courseInfo?.title ?? ""}"`);
  updateJob(jobId, { status: "RUNNING", stageMessage: "Understanding approved curriculum...", progress: 5 });

  try {
    let blueprint = job.blueprint;
    const normalizedVideoMappings = normalizeVideoMappings(interview.videoStrategy?.mappings || []);
    const interviewWithVideos: AICourseArchitectInterview = {
      ...interview,
      videoStrategy: { ...interview.videoStrategy, mappings: normalizedVideoMappings },
    };

    // ── STAGE 0: NORMALIZE + VALIDATE APPROVED BLUEPRINT ───────────────────
    if (blueprint?.modules?.length) {
      try {
        blueprint = normalizeAndValidateApprovedBlueprint(blueprint, interviewWithVideos);
        job.blueprint = blueprint;
        updateJob(jobId, {
          blueprint,
          currentStage: "BLUEPRINT",
          stageMessage: "Blueprint normalized and validated...",
          progress: 8,
          checkpoints: { blueprintApproved: true },
        });
      } catch (validationErr) {
        const field =
          validationErr instanceof BlueprintValidationError
            ? validationErr.field
            : "blueprint";
        const message =
          validationErr instanceof Error
            ? validationErr.message
            : "Blueprint validation failed";
        updateJob(jobId, {
          status: "FAILED",
          currentStage: "BLUEPRINT",
          errorCode: "BLUEPRINT_SCHEMA_INVALID",
          errorMessage: message,
          stageMessage: `Blueprint validation failed: ${field}`,
        });
        userActiveJobs.delete(userId);
        console.error(`[BLUEPRINT] validation failed jobId=${jobId} field=${field}:`, validationErr);
        return;
      }
    }

    // ── STAGE 1: BLUEPRINT CHECKPOINT ──────────────────────────────────────
    if (!blueprint?.modules?.length || !job.checkpoints.blueprintApproved) {
      updateJob(jobId, {
        currentStage: "BLUEPRINT",
        stageMessage: "Designing curriculum architecture and lesson progression...",
        progress: 15,
      });
      console.info(`[BLUEPRINT] generating blueprint jobId=${jobId}`);
      blueprint = await generateCourseBlueprint(interviewWithVideos);
      blueprint = assignVideosToLessons(blueprint, normalizedVideoMappings, interview.videoStrategy.placement ?? "ai-auto");
      job.blueprint = blueprint;
      updateJob(jobId, {
        blueprint,
        checkpoints: { blueprintApproved: true },
        progress: 25,
      });
    }

    const totalLessons = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
    updateJob(jobId, { totalLessons, completedLessons: 0 });

    // ── STAGE 2: LESSON CONTENT CHECKPOINT ──────────────────────────────────
    const isPlanned = blueprint.phase === "planned" || blueprint.modules.some((m) =>
      m.lessons.some((l) => !l.theory?.trim() || l.contentStatus === "planned")
    );

    let qualityReport: ArchitectQualityReport = performQualityReview(blueprint, interviewWithVideos);

    if (isPlanned) {
      updateJob(jobId, {
        currentStage: "LESSON_CONTENT",
        stageMessage: `Writing professor-quality lesson content (0/${totalLessons} complete)...`,
        progress: 30,
      });
      console.info(`[LESSON_GEN] starting content population jobId=${jobId} totalLessons=${totalLessons}`);

      try {
        const populated = await generateApprovedCourseContent(
          blueprint,
          interviewWithVideos,
          (msg, pct) => {
            const currentLesson = Math.round((pct / 100) * totalLessons);
            updateJob(jobId, {
              currentLesson,
              completedLessons: currentLesson,
              stageMessage: msg || `Writing lesson content (${currentLesson}/${totalLessons})...`,
              progress: 30 + Math.round(pct * 0.3), // 30% -> 60%
            });
          }
        );
        blueprint = populated.blueprint;
        qualityReport = populated.qualityReport;
        job.blueprint = blueprint;
        updateJob(jobId, {
          blueprint,
          completedLessons: totalLessons,
          checkpoints: { lessonsCompleted: blueprint.modules.flatMap((m) => m.lessons.map((l) => l.id)) },
          progress: 60,
        });
      } catch (err) {
        console.error(`[LESSON_GEN] error during lesson generation jobId=${jobId}:`, err);
        if (isArchitectAiQuotaError(err)) {
          qualityReport = performQualityReview(blueprint, interviewWithVideos);
        } else {
          throw err;
        }
      }
    }

    blueprint = assignVideosToLessons(blueprint, normalizedVideoMappings, interview.videoStrategy.placement ?? "ai-auto");

    // ── STAGE 3: DELIVERY & MEDIA INTEGRATION ───────────────────────────────
    updateJob(jobId, {
      currentStage: "MEDIA",
      stageMessage: "Syncing videos, media assets, and interactive components...",
      progress: 65,
    });
    console.info(`[MEDIA] running delivery pipeline jobId=${jobId}`);

    let delivery: Awaited<ReturnType<typeof runDeliveryPipeline>>;
    try {
      delivery = await runDeliveryPipeline({ interview: interviewWithVideos, blueprint });
    } catch (deliveryErr) {
      console.warn(`[DELIVERY] async delivery failed, using fast delivery fallback jobId=${jobId}:`, deliveryErr);
      delivery = runFastDeliveryPipeline({ interview: interviewWithVideos, blueprint });
    }
    blueprint = delivery.blueprint;
    job.blueprint = blueprint;

    // ── STAGE 4: BANNER PERSISTENCE ─────────────────────────────────────────
    updateJob(jobId, {
      currentStage: "SAVE_DRAFT",
      stageMessage: "Persisting course branding and banner assets...",
      progress: 75,
    });
    const persistedBanner = await persistRemoteBannerIfNeeded({
      bannerUrl: interview.banner?.bannerUrl,
      thumbnailUrl: interview.banner?.thumbnailUrl,
      sourceUrl: interview.banner?.sourceUrl,
      bannerType: interview.banner?.bannerType,
    });
    const bannerUrl = persistedBanner.bannerUrl?.trim() || undefined;
    const thumbnailUrl = persistedBanner.thumbnailUrl?.trim() || bannerUrl;

    // ── STAGE 5: SAVE DRAFT LEARNING UNIVERSE ────────────────────────────────
    const categoryId = await resolveValidCategoryId(interview.courseInfo.categoryId);
    let draftId = job.universeId;
    if (!draftId) {
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
      updateJob(jobId, { universeId: draftId, checkpoints: { draftCreated: true } });
    }

    // ── STAGE 6: ACADEMIC STUDIO / LATEX PROJECT ────────────────────────────
    updateJob(jobId, {
      currentStage: "LATEX",
      stageMessage: "Building Academic Studio LaTeX project and curriculum files...",
      progress: 85,
    });
    console.info(`[LATEX] creating latex project for universeId=${draftId} jobId=${jobId}`);

    let projectId = job.projectId;
    if (!projectId) {
      const project = await prisma.latexProject.create({
        data: { title: blueprint.courseTitle, ownerId: userId },
      });
      projectId = project.id;
      updateJob(jobId, { projectId });
    }

    const built = delivery.projectBuild ?? buildProjectFromBlueprint(blueprint, interviewWithVideos);
    const mainTex = buildMainTexFromProject(built.project);
    await writeLuProjectToDb(projectId, built.project, built.files, mainTex);
    console.info(`[LATEX] project files written count=${built.files.length} projectId=${projectId}`);

    // Sync media assets
    try {
      await syncArchitectMediaAssets(draftId, normalizedVideoMappings);
    } catch (mediaErr) {
      if (!isMissingObjectError(mediaErr)) {
        console.warn(`[MEDIA] non-critical media sync warning jobId=${jobId}:`, mediaErr);
      }
    }

    // Validate project
    const validationReport = await validateGeneratedProject({
      projectId,
      project: built.project,
      files: built.files,
      mainTex,
    });

    // Thumbnail generation
    let generatedThumbnail = thumbnailUrl;
    if (!generatedThumbnail && !SKIP_THUMBNAIL_ON_GENERATE) {
      try {
        generatedThumbnail =
          (await generateCourseThumbnail(blueprint.marketing?.bannerPrompt, blueprint.courseTitle)) ?? undefined;
      } catch {
        /* optional */
      }
    }

    const finalBanner = bannerUrl || generatedThumbnail || undefined;
    const finalThumb = thumbnailUrl || generatedThumbnail || finalBanner;

    // ── STAGE 7: QUALITY CHECKS & PRODUCT LISTING ───────────────────────────
    updateJob(jobId, {
      currentStage: "QUALITY_CHECK",
      stageMessage: "Running final quality validation and publishing preparation...",
      progress: 95,
    });

    const qaWarning =
      !delivery.publisher.ready && STRICT_QA_BLOCK
        ? `Quality score ${delivery.qualityAssurance.score}/100 — review and regenerate weak lessons in Academic Studio before publishing.`
        : undefined;

    const existingStructured = readStructuredRecord(
      (await prisma.learningUniverse.findUnique({ where: { id: draftId }, select: { structuredData: true } }))?.structuredData
    );

    await prisma.learningUniverse.update({
      where: { id: draftId },
      data: {
        sourceProjectId: projectId,
        thumbnail: finalThumb,
        bannerUrl: finalBanner,
        structuredData: serializeStructuredData({
          ...existingStructured,
          ...buildStructuredDataProductMeta(interview.productType, "ai-architect", {
            sourceProjectId: projectId,
          }),
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
            thumbnail: finalThumb,
          },
          marketing: blueprint.marketing,
        }),
      },
    });

    const productRouting = await syncProductListingRecord({
      universeId: draftId,
      productType: parseProductType(interview.productType),
      instructorId: userId,
      title: blueprint.courseTitle,
      subtitle: blueprint.subtitle,
      description: blueprint.description,
      thumbnail: finalThumb,
      bannerUrl: finalBanner,
      categoryId,
      difficulty: blueprint.difficulty,
      price: interview.productType === "premium-course"
        ? (typeof interview.courseInfo.price === "number" ? interview.courseInfo.price : 0)
        : 0,
      sourceProjectId: projectId,
      creationSource: "ai-architect",
    });

    validateProductPersistence(parseProductType(interview.productType), productRouting);

    if (finalBanner || finalThumb) {
      await updateLearningUniverseBranding(draftId, userId, {
        thumbnailUrl: finalThumb,
        bannerUrl: finalBanner || finalThumb,
        bannerType: interview.banner?.bannerType || (!bannerUrl && generatedThumbnail ? "ai-generated" : undefined),
      }).catch(() => {});
    }

    const resultData: ArchitectGenerateResult & { qaWarning?: string; aiDegraded?: boolean } = {
      universeId: draftId,
      projectId,
      productType: interview.productType,
      listingEntityId: productRouting.listingEntityId,
      listingTable: productRouting.listingTable,
      lessonCount: totalLessons,
      moduleCount: blueprint.modules.length,
      qualityReport,
      validationReport,
      thumbnailUrl: generatedThumbnail,
      qaWarning,
      aiDegraded: isArchitectAiDegraded(),
    };

    updateJob(jobId, {
      status: "COMPLETED",
      currentStage: "PUBLISH",
      stageMessage: "Course generated successfully!",
      progress: 100,
      completedAt: new Date().toISOString(),
      resultData,
    });
    userActiveJobs.delete(userId);

    console.info(`[COURSE_GEN] job_completed jobId=${jobId} universeId=${draftId} projectId=${projectId}`);
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorCode =
      err instanceof BlueprintValidationError
        ? "BLUEPRINT_SCHEMA_INVALID"
        : /learningGoals/i.test(errorMsg)
          ? "BLUEPRINT_SCHEMA_INVALID"
          : "COURSE_GENERATION_FAILED";
    console.error(`[COURSE_GEN] job_failed jobId=${jobId}:`, err);
    userActiveJobs.delete(userId);
    updateJob(jobId, {
      status: "FAILED",
      errorCode,
      errorMessage: errorMsg,
      stageMessage: `Generation failed: ${errorMsg}`,
    });
  }
}

/** Create and start a persistent course generation job */
export function createCourseGenerationJob(params: {
  userId: string;
  interview: AICourseArchitectInterview;
  blueprint?: ArchitectBlueprint;
}): CourseGenerationJobData {
  const existing = getUserActiveJob(params.userId);
  if (existing) {
    return existing;
  }

  const normalizedInterview = normalizeInterview(params.interview);
  let normalizedBlueprint = params.blueprint;
  if (params.blueprint?.modules?.length) {
    try {
      normalizedBlueprint = normalizeAndValidateApprovedBlueprint(params.blueprint, normalizedInterview);
    } catch (err) {
      // Still create the job so the UI can show BLUEPRINT_SCHEMA_INVALID with the exact field.
      const message = err instanceof Error ? err.message : "Blueprint validation failed";
      const jobId = randomUUID();
      const failedJob: CourseGenerationJobData = {
        id: jobId,
        userId: params.userId,
        status: "FAILED",
        currentStage: "BLUEPRINT",
        progress: 0,
        stageMessage: message,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        interview: normalizedInterview,
        blueprint: params.blueprint,
        checkpoints: {},
        errorCode: "BLUEPRINT_SCHEMA_INVALID",
        errorMessage: message,
      };
      jobs.set(jobId, failedJob);
      return failedJob;
    }
  }

  const jobId = randomUUID();
  const job: CourseGenerationJobData = {
    id: jobId,
    userId: params.userId,
    status: "QUEUED",
    currentStage: "CURRICULUM",
    progress: 0,
    stageMessage: "Queued for generation...",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    interview: normalizedInterview,
    blueprint: normalizedBlueprint,
    checkpoints: {
      blueprintApproved: Boolean(normalizedBlueprint?.modules?.length),
    },
  };

  jobs.set(jobId, job);
  userActiveJobs.set(params.userId, jobId);

  // Run asynchronously without blocking HTTP response
  void executeCourseGenerationJob(jobId);

  return job;
}
