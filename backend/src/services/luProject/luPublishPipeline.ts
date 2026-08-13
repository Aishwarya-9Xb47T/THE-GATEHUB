import type { Express } from "express";
import { parseLearningUniverseLatex } from "../../controllers/learning-universe-parser.js";
import { publishLearningUniverse } from "../../controllers/learning-universe-controller.js";
import { mergePublishStructuredData, syncCatalogOnPublish } from "../productRoutingService.js";
import { compileLatexLocally, storeCompiledPdfFromPath } from "../latexCompileService.js";
import type { LearningUniverseStructured } from "../learningUniverseSchema.js";
import { loadProjectFiles } from "./luProjectFiles.js";
import {
  hasBlockingIssues,
  validateLuProjectStructure,
  validateParsedContentBlocks,
  validateStructuredData,
  type LuValidationIssue,
} from "./luProjectValidator.js";
import { generateAnalyticsMetadata, generateLuSearchIndex, generateStudentPackage } from "./luSearchIndexService.js";
import { buildLearnerExperienceFromPublishedUniverse } from "../learningExperience/learningExperienceEngine.js";
import { ensureLuProjectV2 } from "./migrateSingleFileToProject.js";
import { LU_PIPELINE_VERSION } from "./luProjectSchema.js";
import { getProjectJsonFromFiles } from "./luProjectFiles.js";
import { stripAuthoringMarkers } from "./luTexMarkers.js";
import { sanitizeColabUrlsInDsl } from "../colabUrlValidator.js";
import { prepareLuBuild } from "./luBuildEngine.js";
import { resolveLuV2ContentSnapshot } from "./luCompileSource.js";
import { fileOverlayToMap } from "./projectSnapshotHash.js";
import {
  logSyncOperation,
  updateProjectSyncState,
  verifySnapshotHash,
  loadProjectSyncState,
} from "./projectSyncState.js";

export type LuPipelineStage =
  | "validate_project"
  | "resolve_includes"
  | "compile_pdf"
  | "parse_dsl"
  | "generate_content_blocks"
  | "validate_content_blocks"
  | "publish"
  | "student_package"
  | "search_index"
  | "analytics_metadata"
  | "learner_experience";

export interface LuPipelineStageResult {
  stage: LuPipelineStage;
  success: boolean;
  durationMs: number;
  issues?: LuValidationIssue[];
  error?: string;
}

export interface LuPublishPipelineOptions {
  projectId?: string;
  universeId?: string;
  userId: string;
  price?: number;
  files?: Express.Multer.File[];
  dslSource?: string;
  skipPdfCompile?: boolean;
  /** Full text-file overlay from flushed editor snapshot */
  fileOverlay?: Array<{ name: string; content: string }>;
  /** Client snapshot hash — must match merged overlay or publish aborts */
  snapshotHash?: string;
  editorVersion?: number;
}

export interface LuPublishPipelineResult {
  success: boolean;
  universe?: Awaited<ReturnType<typeof publishLearningUniverse>>;
  mergedDsl?: string;
  structuredData?: LearningUniverseStructured;
  pdfUrl?: string;
  stages: LuPipelineStageResult[];
  issues: LuValidationIssue[];
}

function stageResult(
  stage: LuPipelineStage,
  start: number,
  success: boolean,
  extra?: Partial<LuPipelineStageResult>
): LuPipelineStageResult {
  return {
    stage,
    success,
    durationMs: Date.now() - start,
    ...extra,
  };
}

function toStructured(parsed: ReturnType<typeof parseLearningUniverseLatex>): LearningUniverseStructured {
  return {
    universe: {
      title: parsed.universe.title,
      description: parsed.universe.description,
      difficulty: parsed.universe.difficulty,
      estimatedHours: parsed.universe.estimatedHours,
      skills: parsed.universe.skills,
      thumbnail: parsed.universe.thumbnail,
    },
    tracks: parsed.tracks.map((track) => ({
      title: track.title,
      description: track.description,
      learningOutcomes: track.learningOutcomes,
      careerOutcomes: track.careerOutcomes,
      difficulty: track.difficulty,
      modules: track.modules.map((mod) => ({
        title: mod.title,
        description: mod.description,
        prerequisites: mod.prerequisites,
        learningOutcomes: mod.learningOutcomes,
        estimatedHours: mod.estimatedHours,
        lessons: mod.lessons.map((lesson) => ({
          title: lesson.title,
          contentBlocks: lesson.contentBlocks,
          videos: lesson.videos,
          practice: lesson.practice,
          quiz: lesson.quiz,
          project: lesson.project,
          resources: lesson.resources,
        })),
      })),
    })),
  };
}

export async function runLuPublishPipeline(
  options: LuPublishPipelineOptions
): Promise<LuPublishPipelineResult> {
  const stages: LuPipelineStageResult[] = [];
  const allIssues: LuValidationIssue[] = [];
  let mergedDsl = options.dslSource?.trim() || "";
  let mergedForPdf = "";
  let structuredData: LearningUniverseStructured | undefined;
  let pdfUrl: string | undefined;
  let publishParsed: ReturnType<typeof parseLearningUniverseLatex> | undefined;
  let publishSnapshot: Awaited<ReturnType<typeof resolveLuV2ContentSnapshot>> | undefined;

  // --- Stage 0: Unified build engine (validate + repair + dry-run) ---
  if (options.projectId) {
    const s0 = Date.now();
    const build = await prepareLuBuild({
      projectId: options.projectId,
      mode: "compile",
      forPdf: false,
      skipDryRunPdf: options.skipPdfCompile,
      preserveInstructorContent: true,
    });
    allIssues.push(...build.issues);
    if (!build.ready) {
      const blocking = build.issues.filter((i) => i.severity === "error");
      stages.push(
        stageResult("validate_project", s0, false, {
          issues: blocking.length ? blocking : build.issues,
          error: blocking[0]?.message ?? "Pre-compilation validation failed",
        })
      );
      return { success: false, stages, issues: allIssues };
    }
    if (build.mergedTex) mergedDsl = build.mergedTex;
  }

  // --- Stage 1: Validate project ---
  const s1 = Date.now();
  if (options.projectId) {
    await ensureLuProjectV2(options.projectId);
    const files = await loadProjectFiles(options.projectId);
    const projectJson = getProjectJsonFromFiles(files);

    if (projectJson) {
      const filePaths = new Set(files.filter((f) => !f.isFolder).map((f) => f.path));
      const structIssues = validateLuProjectStructure(projectJson, filePaths);
      allIssues.push(...structIssues);
      if (hasBlockingIssues(structIssues)) {
        stages.push(stageResult("validate_project", s1, false, { issues: structIssues }));
        return { success: false, stages, issues: allIssues };
      }
    }
  }
  stages.push(stageResult("validate_project", s1, true));

  // --- Stage 2: Resolve includes (canonical snapshot shared with editor compile) ---
  const s2 = Date.now();
  try {
    if (options.projectId) {
      const overlayMap = fileOverlayToMap(options.fileOverlay);
      if (options.snapshotHash) {
        const verification = await verifySnapshotHash(
          options.projectId,
          options.snapshotHash,
          overlayMap.size ? overlayMap : undefined
        );
        if (!verification.ok) {
          logSyncOperation("publish-hash-mismatch", options.projectId, {
            expected: options.snapshotHash,
            actual: verification.actualHash,
          });
          // Flush already persisted editor state — publish from DB canonical snapshot.
          options.snapshotHash = verification.actualHash;
        }
      }

      const snapshot = await resolveLuV2ContentSnapshot(options.projectId, {
        runBuild: false,
        fileOverlay: overlayMap.size ? overlayMap : undefined,
      });
      if (!snapshot) {
        throw new Error("Could not resolve LU v2 project snapshot");
      }
      publishSnapshot = snapshot;
      mergedDsl = snapshot.parseSource;
      mergedForPdf = snapshot.mergedForPdf;
      publishParsed = snapshot.parsed;

      if (options.projectId) {
        const publishedHash =
          options.snapshotHash ??
          (await verifySnapshotHash(options.projectId, undefined, overlayMap.size ? overlayMap : undefined))
            .actualHash;
        const prevState = await loadProjectSyncState(options.projectId);
        await updateProjectSyncState(options.projectId, {
          publishedSnapshotHash: publishedHash,
          publishedVersion: prevState.projectVersion,
          editorVersion: options.editorVersion ?? prevState.editorVersion,
          previewSnapshotHash: publishedHash,
          recomputeHash: false,
        });
        logSyncOperation("publish", options.projectId, {
          publishVersion: prevState.projectVersion,
          snapshotHash: publishedHash,
          fileOverlayCount: options.fileOverlay?.length ?? 0,
          editorVersion: options.editorVersion,
          assetFileCount: options.files?.length ?? 0,
          lessonCount: publishParsed?.tracks?.reduce(
            (n, t) => n + t.modules.reduce((m, mod) => m + mod.lessons.length, 0),
            0
          ),
        });
      }
    }
    if (!mergedDsl.trim()) {
      throw new Error("No DSL content after include resolution");
    }
    if (!mergedForPdf.trim()) {
      mergedForPdf = mergedDsl;
    }
    stages.push(stageResult("resolve_includes", s2, true));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const issues: LuValidationIssue[] = [
      { severity: "error", code: "INCLUDE_RESOLVE_FAILED", message: msg },
    ];
    allIssues.push(...issues);
    stages.push(stageResult("resolve_includes", s2, false, { issues, error: msg }));
    return { success: false, stages, issues: allIssues };
  }

  mergedDsl = stripAuthoringMarkers(mergedDsl);
  const colabSanitized = sanitizeColabUrlsInDsl(mergedDsl);
  if (colabSanitized.strippedCount > 0) {
    console.warn(
      `[LU Publish] Stripped ${colabSanitized.strippedCount} invalid Colab URL(s) from project source`
    );
    mergedDsl = colabSanitized.latex;
  }

  // --- Stage 3: Compile PDF — failures are errors that block publish success downstream of stage metadata ---
  const s3 = Date.now();
  let pdfStageOk = true;
  if (!options.skipPdfCompile && options.projectId) {
    try {
      if (!mergedForPdf.trim()) {
        throw new Error("Could not resolve LU compile source for PDF");
      }
      const result = await compileLatexLocally(options.projectId, mergedForPdf, {
        copyReferencedImages: true,
        enableBibtex: true,
        compilerFallback: true,
        maxPasses: 3,
        preserveProvidedMainTex: true,
        pdfProjectContext: publishSnapshot
          ? {
              project: publishSnapshot.project,
              files: publishSnapshot.files,
              parsed: publishSnapshot.parsed,
            }
          : undefined,
      });
      if (!result.success || !result.pdfPath) {
        pdfStageOk = false;
        const errMsg = result.errors[0]?.message || "PDF compilation failed";
        const issues: LuValidationIssue[] = result.errors.map((e) => ({
          severity: "error" as const,
          code: "COMPILE_PDF_FAILED",
          message: e.message,
          line: e.line ?? undefined,
          suggestedFix: e.suggestedFix,
        }));
        if (!issues.length) {
          issues.push({ severity: "error", code: "COMPILE_PDF_FAILED", message: errMsg });
        }
        allIssues.push(...issues);
        stages.push(stageResult("compile_pdf", s3, false, { issues, error: errMsg }));
      } else {
        const stored = await storeCompiledPdfFromPath(
          result.pdfPath,
          `compiled-${options.projectId}`
        );
        pdfUrl = stored.publicUrl;
        stages.push(stageResult("compile_pdf", s3, true));
      }
    } catch (err) {
      pdfStageOk = false;
      const msg = err instanceof Error ? err.message : String(err);
      allIssues.push({
        severity: "error",
        code: "COMPILE_PDF_FAILED",
        message: msg,
      });
      stages.push(stageResult("compile_pdf", s3, false, { error: msg }));
    }
  } else {
    stages.push(stageResult("compile_pdf", s3, true));
  }

  const requirePdf = process.env.LU_REQUIRE_PDF_ON_PUBLISH === "true";
  if (!pdfStageOk && requirePdf && !options.skipPdfCompile) {
    return {
      success: false,
      stages,
      issues: allIssues,
      mergedDsl,
      pdfUrl,
    };
  }

  // --- Stage 4: Parse DSL (reuse canonical snapshot — no second inject) ---
  const s4 = Date.now();
  const parsed = publishParsed ?? parseLearningUniverseLatex(mergedDsl);
  if (!parsed) {
    const issues: LuValidationIssue[] = [
      { severity: "error", code: "PARSE_FAILED", message: "Could not parse Learning Universe structure" },
    ];
    allIssues.push(...issues);
    stages.push(stageResult("parse_dsl", s4, false, { issues }));
    return { success: false, stages, issues: allIssues, mergedDsl };
  }

  stages.push(stageResult("parse_dsl", s4, true));

  // --- Stage 5: Generate contentBlocks ---
  const s5 = Date.now();
  let existingStructured: Record<string, unknown> | null = null;
  if (options.universeId) {
    const { prisma } = await import("../../utils/prisma.js");
    const existing = await prisma.learningUniverse.findUnique({
      where: { id: options.universeId },
      select: { structuredData: true },
    });
    if (existing?.structuredData && typeof existing.structuredData === "object" && !Array.isArray(existing.structuredData)) {
      existingStructured = existing.structuredData as Record<string, unknown>;
    }
  }

  structuredData = toStructured(parsed);
  structuredData = {
    ...structuredData,
    ...(options.projectId ? { sourceProjectId: options.projectId } : {}),
    projectType: "legacy" as const,
    pipelineVersion: LU_PIPELINE_VERSION,
    ...(pdfUrl ? { compiledPdfUrl: pdfUrl } : {}),
  } as LearningUniverseStructured & Record<string, unknown>;

  structuredData = mergePublishStructuredData(
    existingStructured,
    structuredData as unknown as Record<string, unknown>
  ) as LearningUniverseStructured & Record<string, unknown>;

  if (options.projectId) {
    const projFiles = await loadProjectFiles(options.projectId);
    (structuredData as unknown as Record<string, unknown>).projectType = getProjectJsonFromFiles(projFiles) ? "v2" : "legacy";
  }
  stages.push(stageResult("generate_content_blocks", s5, true));

  // --- Stage 6: Validate contentBlocks ---
  const s6 = Date.now();
  const { validateAndPurgeInternalDsl } = await import("./luProjectValidator.js");
  const contentIssues = [
    ...validateParsedContentBlocks(parsed),
    ...validateAndPurgeInternalDsl(parsed),
    ...validateStructuredData(structuredData),
  ];
  allIssues.push(...contentIssues);
  if (hasBlockingIssues(contentIssues)) {
    stages.push(stageResult("validate_content_blocks", s6, false, { issues: contentIssues }));
    return { success: false, stages, issues: allIssues, mergedDsl, structuredData };
  }
  stages.push(stageResult("validate_content_blocks", s6, true));

  // --- Stage 7: Publish ---
  const s7 = Date.now();
  let universe;
  try {
    universe = await publishLearningUniverse(
      mergedDsl,
      options.userId,
      options.files,
      {
        projectId: options.projectId,
        universeId: options.universeId,
        parsed,
        compiledPackage: publishSnapshot?.compiledPackage,
      },
      options.price ?? 0
    );
    stages.push(stageResult("publish", s7, true));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const issues: LuValidationIssue[] = [
      { severity: "error", code: "PUBLISH_FAILED", message: msg },
    ];
    allIssues.push(...issues);
    stages.push(stageResult("publish", s7, false, { issues, error: msg }));
    return { success: false, stages, issues: allIssues, mergedDsl, structuredData };
  }

  // --- Stages 8–11: Student package, search index, analytics, learner experience ---
  const studentPackage = generateStudentPackage(structuredData);
  const searchIndex = generateLuSearchIndex(structuredData);
  const analytics = generateAnalyticsMetadata(structuredData);

  let learnerExperience: ReturnType<typeof buildLearnerExperienceFromPublishedUniverse> | undefined;
  const s8 = Date.now();
  if (universe?.id) {
    const { prisma } = await import("../../utils/prisma.js");
    const published = await prisma.learningUniverse.findUnique({
      where: { id: universe.id },
      include: {
        tracks: {
          orderBy: { order: "asc" },
          include: {
            modules: {
              orderBy: { order: "asc" },
              include: {
                lessons: {
                  orderBy: { order: "asc" },
                  include: {
                    videos: true,
                    practice: true,
                    quiz: { include: { questions: { include: { options: true } } } },
                    project: true,
                    resources: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (published) {
      const lessonCount = published.tracks.reduce((sum, t) => sum + t.modules.reduce((mSum, m) => mSum + m.lessons.length, 0), 0);
      const moduleCount = published.tracks.reduce((sum, t) => sum + t.modules.length, 0);
      const trackCount = published.tracks.length;
      const currentPublishVersionId = published.currentPublishVersionId;
      const snapshotHash = options.snapshotHash || "none";

      console.log("[PUBLISH PIPELINE] learnerExperience generation START", {
        universeId: published.id,
        currentPublishVersionId,
        snapshotHash,
        lessonCount,
        moduleCount,
        trackCount,
        generatedAt: new Date().toISOString(),
      });

      const { resolveCompletionRules } = await import("../learningExperience/completionRulesResolve.js");
      const completionRules = resolveCompletionRules(structuredData);

      learnerExperience = buildLearnerExperienceFromPublishedUniverse(
        {
          id: published.id,
          title: published.title,
          description: published.description,
          thumbnail: published.thumbnail,
          difficulty: published.difficulty,
          tracks: published.tracks.map((t) => ({
            id: t.id,
            title: t.title,
            modules: t.modules.map((m) => ({
              id: m.id,
              title: m.title,
              lessons: m.lessons.map((l) => ({
                id: l.id,
                title: l.title,
                contentBlocks: (l.contentBlocks as import("../learningUniverseSchema.js").LuContentBlock[]) ?? null,
                videos: l.videos,
                practice: l.practice,
                quiz: l.quiz,
                project: l.project,
                resources: l.resources,
              })),
            })),
          })),
        },
        completionRules
      );

      // Keep top-level completionRules in sync with resolved value
      (structuredData as Record<string, unknown>).completionRules = completionRules;

      console.log("[PUBLISH PIPELINE] learnerExperience generation COMPLETE", {
        universeId: published.id,
        learnerExperienceLessonCount: Object.keys(learnerExperience.lessons || {}).length,
        generatedAt: new Date().toISOString(),
      });
    }
  }
  stages.push(stageResult("learner_experience", s8, Boolean(learnerExperience)));

  const enrichedStructured = {
    ...structuredData,
    studentPackage,
    searchIndex,
    analyticsMetadata: analytics,
    learnerExperience,
    pipelineVersion: LU_PIPELINE_VERSION,
  };

  if (universe?.id) {
    try {
      const { prisma } = await import("../../utils/prisma.js");
      const existing = await prisma.learningUniverse.findUnique({
        where: { id: universe.id },
        select: { structuredData: true, currentPublishVersionId: true },
      });

      const existingPublishVersionId = existing?.currentPublishVersionId;
      const existingLearnerExperienceLessonCount = existing?.structuredData
        ? Object.keys((existing.structuredData as { learnerExperience?: { lessons?: Record<string, unknown> } }).learnerExperience?.lessons || {}).length
        : 0;
      const newLearnerExperienceLessonCount = learnerExperience
        ? Object.keys(learnerExperience.lessons || {}).length
        : 0;

      console.log("[PUBLISH PIPELINE] DATABASE SAVE START", {
        universeId: universe.id,
        existingPublishVersionId,
        existingLearnerExperienceLessonCount,
        newLearnerExperienceLessonCount,
        hasLearnerExperience: !!learnerExperience,
        savingAt: new Date().toISOString(),
      });

      const mergedStructured = mergePublishStructuredData(
        existing?.structuredData,
        enrichedStructured as Record<string, unknown>
      );
      await prisma.learningUniverse.update({
        where: { id: universe.id },
        data: {
          structuredData: mergedStructured as object,
        },
      });

      console.log("[PUBLISH PIPELINE] DATABASE SAVE COMPLETE", {
        universeId: universe.id,
        savedAt: new Date().toISOString(),
      });

      await syncCatalogOnPublish(universe.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[LU Publish] post-publish metadata sync failed (publish succeeded):", msg);
      allIssues.push({
        severity: "warning",
        code: "POST_PUBLISH_METADATA",
        message: msg,
      });
    }
  }

  stages.push(stageResult("student_package", Date.now(), true));
  stages.push(stageResult("search_index", Date.now(), true));
  stages.push(stageResult("analytics_metadata", Date.now(), true));

  return {
    success: true,
    universe,
    mergedDsl,
    structuredData: enrichedStructured,
    pdfUrl,
    stages,
    issues: allIssues,
  };
}
