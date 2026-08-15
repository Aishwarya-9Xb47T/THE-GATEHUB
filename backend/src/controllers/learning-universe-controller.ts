import { isAdminRole } from "../utils/roles.js";
import { PrismaClient } from "@prisma/client";
import { parseLearningUniverseLatex } from "./learning-universe-parser.js";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ParsedLearningUniverse } from "./learning-universe-parser.js";
import { recordProjectVersion } from "../services/latexVersionService.js";
import { validateColabUrl, validateColabUrlsInDsl, sanitizeColabUrlsInDsl } from "../services/colabUrlValidator.js";
import { validateMediaAssets } from "../services/learningUniverseMedia.js";
import { ensureUniverseMediaFromReferences } from "../services/aiCourseArchitect/aiArchitectMediaSync.js";
import { loadProjectFiles, getProjectJsonFromFiles } from "../services/luProject/luProjectFiles.js";
import {
  assertPublishCompiledIntegrity,
  publishFromCompiledPackage,
} from "../services/luProject/luCompiledPublish.js";
import { resolveCanonicalUniverseId } from "../services/learnerScopeService.js";
import {
  parseProductType,
  buildStructuredDataProductMeta,
  syncProductListingRecord,
  mergePublishStructuredData,
  syncCatalogOnPublish,
  filterUniversesForLuListing,
  filterFeaturedHomeUniverses,
  defaultCatalogVisibilityForProduct,
  CATALOG_VISIBILITY,
  getProductTypeFromStructuredData,
  getCatalogVisibility,
  inferProductType,
  PRODUCT_TYPES,
  type CatalogVisibilityFlag,
} from "../services/productRoutingService.js";
import {
  readArchitectVideoMappings,
  readArchitectVideoPlacement,
  injectVideosIntoParsedUniverse,
} from "../services/aiCourseArchitect/videoAssignmentEngine.js";
import { buildScaffoldV2Files } from "../services/luProject/luProjectFileEmitter.js";
import { buildMainTexFromProject } from "../services/luProject/luProjectMainTexBuilder.js";
import { writeLuProjectToDb } from "../services/luProject/migrateSingleFileToProject.js";

/** Large LU republish deletes and recreates tracks/modules/lessons — needs more than Prisma's 5s default. */
const LU_PUBLISH_TRANSACTION_OPTIONS = { maxWait: 20_000, timeout: 180_000 } as const;

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const ASSETS_DIR = path.join(UPLOAD_DIR, "learning-universes");
const PROJECTS_DIR = path.join(UPLOAD_DIR, "projects");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

export interface PublishLearningUniverseOptions {
  projectId?: string;
  universeId?: string;
  /** Pre-parsed universe structure (quiz, video, metadata) — document bodies come from compiledPackage. */
  parsed?: ParsedLearningUniverse;
  /** Canonical compiled document package from luLessonCompiler — required for LU v2 publish. */
  compiledPackage?: import("../services/luProject/luCompiledPackageSchema.js").LuCompiledPackage;
}

function buildLessonData(
  lesson: ParsedLearningUniverse["tracks"][0]["modules"][0]["lessons"][0],
  order: number
): any {
  const lessonData: any = {
    title: lesson.title,
    order,
    contentBlocks: lesson.contentBlocks as object,
    videos: {
      create: lesson.videos.map((v, vi) => ({
        type: v.type,
        url: v.url,
        title: v.title,
        order: vi,
      })),
    },
    resources: {
      create: lesson.resources.map((r, ri) => ({
        type: r.type,
        title: r.title,
        url: r.url,
        fileUrl: r.fileUrl,
        order: ri,
      })),
    },
  };

  if (lesson.practice) {
    lessonData.practice = {
      create: {
        title: lesson.practice.title,
        language: lesson.practice.language,
        initialCode: lesson.practice.initialCode,
        expectedOutput: lesson.practice.expectedOutput,
        solution: lesson.practice.solution,
        hints: lesson.practice.hints ? JSON.stringify(lesson.practice.hints) : null,
      },
    };
  }

  if (lesson.quiz) {
    lessonData.quiz = {
      create: {
        title: lesson.quiz.title || `${lesson.title} Quiz`,
        questions: {
          create: lesson.quiz.questions.map((q, qi) => ({
            text: q.text,
            type: q.type === "multiple" ? "multiple_select" : q.type === "single" ? "multiple_choice" : (q.type || "multiple_choice"),
            explanation: q.explanation,
            difficulty: q.difficulty,
            points: q.points,
            order: qi,
            options: {
              create: q.options.map((o, oi) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                order: oi,
              })),
            },
          })),
        },
      },
    };
  }

  if (lesson.project) {
    lessonData.project = {
      create: {
        title: lesson.project.title,
        description: lesson.project.description,
        difficulty: lesson.project.difficulty,
        instructions: lesson.project.instructions,
        expectedOutput: lesson.project.expectedOutput,
        colabUrl: lesson.project.colabUrl,
        githubUrl: lesson.project.githubUrl,
      },
    };
  }

  return lessonData;
}

function normalizeProjectColabUrls(parsed: ParsedLearningUniverse) {
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        if (!lesson.project?.colabUrl) continue;
        const check = validateColabUrl(lesson.project.colabUrl);
        if (!check.valid) {
          console.warn(
            `[LU Publish] Stripping invalid Colab URL from project "${lesson.project.title}" (${lesson.title}): ${lesson.project.colabUrl}`
          );
          lesson.project.colabUrl = undefined;
          const projectBlock = lesson.contentBlocks.find((b) => b.type === "project");
          if (projectBlock?.content && typeof projectBlock.content === "object") {
            delete (projectBlock.content as { colabUrl?: string }).colabUrl;
          }
          continue;
        }
        lesson.project.colabUrl = check.normalizedUrl!;
        const projectBlock = lesson.contentBlocks.find((b) => b.type === "project");
        if (projectBlock?.content && typeof projectBlock.content === "object") {
          (projectBlock.content as { colabUrl?: string }).colabUrl = check.normalizedUrl;
        }
      }
    }
  }
}

async function assertPublishValidation(
  latexContent: string,
  parsed: ParsedLearningUniverse,
  availableFilenames: string[],
  universeId?: string,
  sourceProjectId?: string
) {
  const dslSanitized = sanitizeColabUrlsInDsl(latexContent);
  if (dslSanitized.strippedCount > 0) {
    console.warn(
      `[LU Publish] Stripped ${dslSanitized.strippedCount} invalid Colab URL(s) from LaTeX before publish`
    );
  }
  const dslColab = validateColabUrlsInDsl(dslSanitized.latex);
  if (!dslColab.valid) {
    const loc = dslColab.line ? ` (line ${dslColab.line})` : "";
    console.warn(`[LU Publish] Remaining Colab URL issue after sanitize${loc}: ${dslColab.error}`);
  }

  normalizeProjectColabUrls(parsed);

  if (parsed.warnings?.length) {
    console.warn("[LU Publish] Parser warnings:", parsed.warnings.join("; "));
  }

  if (universeId) {
    await ensureUniverseMediaFromReferences(universeId, parsed, sourceProjectId);
    const syncedAssets = await prisma.learningUniverseAsset.findMany({
      where: { learningUniverseId: universeId },
      select: { filename: true },
    });
    for (const a of syncedAssets) {
      if (!availableFilenames.some((n) => n.toLowerCase() === a.filename.toLowerCase())) {
        availableFilenames.push(a.filename);
      }
    }
  }

  const mediaIssues = validateMediaAssets(parsed, availableFilenames);
  if (mediaIssues.length > 0) {
    throw new Error(mediaIssues.map((i) => i.message).join("; "));
  }
}

function buildTracksCreate(parsed: ParsedLearningUniverse) {
  return parsed.tracks.map((track, ti) => ({
    title: track.title,
    description: track.description,
    learningOutcomes: track.learningOutcomes,
    careerOutcomes: track.careerOutcomes,
    difficulty: track.difficulty,
    order: ti,
    modules: {
      create: track.modules.map((module, mi) => ({
        title: module.title,
        description: module.description,
        prerequisites: module.prerequisites,
        learningOutcomes: module.learningOutcomes,
        estimatedHours: module.estimatedHours,
        order: mi,
        lessons: {
          create: module.lessons.map((lesson, li) => buildLessonData(lesson, li)),
        },
      })),
    },
  }));
}

async function syncUniverseAssets(
  universeId: string,
  files: Express.Multer.File[] | undefined
) {
  if (!files?.length) return;

  const universeAssetsDir = path.join(ASSETS_DIR, universeId);
  if (!fs.existsSync(universeAssetsDir)) {
    fs.mkdirSync(universeAssetsDir, { recursive: true });
  }

  const existing = await prisma.learningUniverseAsset.findMany({
    where: { learningUniverseId: universeId },
  });
  const byFilename = new Map(existing.map((a) => [a.filename, a]));

  for (const file of files) {
    const srcPath = (file as Express.Multer.File & { path?: string }).path;
    if (!srcPath || !fs.existsSync(srcPath)) continue;

    const prior = byFilename.get(file.originalname);
    const ext = path.extname(file.originalname);
    const storedFilename = prior?.storedFilename ?? `${randomUUID()}${ext}`;
    const destPath = path.join(universeAssetsDir, storedFilename);
    fs.copyFileSync(srcPath, destPath);
    const { persistAtPublicRelative } = await import("../middlewares/persistUpload.js");
    await persistAtPublicRelative(
      destPath,
      `learning-universes/${universeId}/${storedFilename}`,
      file.mimetype
    );

    if (prior) {
      await prisma.learningUniverseAsset.update({
        where: { id: prior.id },
        data: {
          mimeType: file.mimetype,
          size: file.size,
          storedFilename,
        },
      });
    } else {
      await prisma.learningUniverseAsset.create({
        data: {
          filename: file.originalname,
          storedFilename,
          mimeType: file.mimetype,
          size: file.size,
          learningUniverseId: universeId,
        },
      });
    }
  }
}

async function recordPublishVersion(
  universeId: string,
  dslSource: string,
  structuredData: object
) {
  const last = await prisma.learningUniversePublishVersion.findFirst({
    where: { learningUniverseId: universeId },
    orderBy: { versionNumber: "desc" },
  });

  const previousPublishVersionId = last?.id;
  const previousVersionNumber = last?.versionNumber ?? 0;

  console.log("[RECORD PUBLISH VERSION] START", {
    universeId,
    previousPublishVersionId,
    previousVersionNumber,
    newVersionNumber: previousVersionNumber + 1,
    recordingAt: new Date().toISOString(),
  });

  const version = await prisma.learningUniversePublishVersion.create({
    data: {
      learningUniverseId: universeId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      dslSource,
      structuredData: structuredData as object,
    },
  });

  console.log("[RECORD PUBLISH VERSION] CREATED", {
    universeId,
    newPublishVersionId: version.id,
    newVersionNumber: version.versionNumber,
    createdAt: new Date().toISOString(),
  });

  await prisma.learningUniverse.update({
    where: { id: universeId },
    data: { currentPublishVersionId: version.id },
  });

  console.log("[RECORD PUBLISH VERSION] UPDATED UNIVERSE", {
    universeId,
    currentPublishVersionId: version.id,
    updatedAt: new Date().toISOString(),
  });

  return version;
}

export async function publishLearningUniverse(
  latexContent: string,
  userId: string,
  files?: Express.Multer.File[],
  options: PublishLearningUniverseOptions = {},
  price = 0
) {
  const parsed = options.parsed;
  if (!parsed) {
    throw new Error(
      "Learning Universe publish requires pre-parsed compiled payload. Runtime parse fallback is disabled."
    );
  }

  if (options.compiledPackage && options.projectId) {
    const projectJson = getProjectJsonFromFiles(await loadProjectFiles(options.projectId));
    if (!projectJson) {
      throw new Error("LU v2 publish requires project.json");
    }
    publishFromCompiledPackage(parsed, projectJson, options.compiledPackage);
    assertPublishCompiledIntegrity(parsed, options.compiledPackage);
  } else if (options.projectId) {
    throw new Error(
      "LU v2 publish requires compiledPackage — run compiler before publish. Legacy body reconstruction is disabled."
    );
  }

  if (options.universeId) {
    const meta = await prisma.learningUniverse.findUnique({
      where: { id: options.universeId },
      select: { structuredData: true },
    });
    const mappings = readArchitectVideoMappings(meta?.structuredData);
    if (mappings.length) {
      injectVideosIntoParsedUniverse(
        parsed,
        mappings,
        readArchitectVideoPlacement(meta?.structuredData)
      );
    }
  } else if (options.projectId) {
    const linked = await prisma.learningUniverse.findFirst({
      where: { sourceProjectId: options.projectId },
      select: { structuredData: true },
    });
    const mappings = readArchitectVideoMappings(linked?.structuredData);
    if (mappings.length) {
      injectVideosIntoParsedUniverse(
        parsed,
        mappings,
        readArchitectVideoPlacement(linked?.structuredData)
      );
    }
  }

  const availableFilenames = [
    ...(files?.map((f) => f.originalname) || []),
  ];
  if (options.universeId) {
    const existingAssets = await prisma.learningUniverseAsset.findMany({
      where: { learningUniverseId: options.universeId },
      select: { filename: true },
    });
    for (const a of existingAssets) {
      if (!availableFilenames.some((n) => n.toLowerCase() === a.filename.toLowerCase())) {
        availableFilenames.push(a.filename);
      }
    }
  }

  await assertPublishValidation(latexContent, parsed, availableFilenames, options.universeId, options.projectId);

  const parsedStructured: Record<string, unknown> = {
    ...parsed,
    sourceProjectId: options.projectId,
  };

  if (options.universeId) {
    const existing = await prisma.learningUniverse.findUnique({
      where: { id: options.universeId },
      select: {
        instructorId: true,
        price: true,
        subtitle: true,
        bannerUrl: true,
        bannerType: true,
        thumbnail: true,
        categoryId: true,
        structuredData: true,
      },
    });

    if (!existing) throw new Error("Learning Universe not found for republish");
    if (existing.instructorId !== userId) throw new Error("Unauthorized to republish this Learning Universe");

    const effectivePrice = price > 0 ? price : existing.price;
    const cardThumbnail =
      existing.bannerUrl || parsed.universe.thumbnail || existing.thumbnail;
    const structuredData = mergePublishStructuredData(existing.structuredData, parsedStructured);

    const tracksCreate = buildTracksCreate(parsed);

    const universe = await prisma.$transaction(async (tx) => {
      await tx.learningUniverseTrack.deleteMany({
        where: { learningUniverseId: options.universeId },
      });

      return tx.learningUniverse.update({
        where: { id: options.universeId },
        data: {
          title: parsed.universe.title || undefined,
          description: parsed.universe.description,
          subtitle: existing.subtitle,
          thumbnail: cardThumbnail,
          bannerUrl: existing.bannerUrl,
          bannerType: existing.bannerType,
          categoryId: existing.categoryId,
          price: effectivePrice,
          difficulty: parsed.universe.difficulty || "Beginner",
          status: "published",
          dslSource: latexContent,
          structuredData: structuredData as object,
          sourceProjectId: options.projectId ?? undefined,
          publishedAt: new Date(),
          tracks: { create: tracksCreate },
        },
        include: {
          tracks: {
            include: {
              modules: { include: { lessons: true } },
            },
          },
        },
      });
    }, LU_PUBLISH_TRANSACTION_OPTIONS);

    await syncUniverseAssets(universe.id, files);
    if (options.projectId) {
      await ensureUniverseMediaFromReferences(universe.id, parsed, options.projectId);
    }
    await recordPublishVersion(universe.id, latexContent, structuredData);
    await syncCatalogOnPublish(universe.id);
    if (options.projectId) {
      await recordProjectVersion(options.projectId, latexContent, "republish", {
        authorId: userId,
        learningUniverseId: universe.id,
        publishType: "republish",
      });
    }
    return universe;
  }

  const structuredData = mergePublishStructuredData(null, parsedStructured);

  const universe = await prisma.learningUniverse.create({
    data: {
      title: parsed.universe.title,
      description: parsed.universe.description,
      thumbnail: parsed.universe.thumbnail,
      price: price > 0 ? price : 0,
      difficulty: parsed.universe.difficulty || "Beginner",
      status: "published",
      instructorId: userId,
      dslSource: latexContent,
      structuredData: structuredData as object,
      sourceProjectId: options.projectId ?? null,
      publishedAt: new Date(),
      tracks: { create: buildTracksCreate(parsed) },
    },
    include: {
      tracks: {
        include: {
          modules: { include: { lessons: true } },
        },
      },
    },
  });

  await syncUniverseAssets(universe.id, files);
  if (options.projectId) {
    await ensureUniverseMediaFromReferences(universe.id, parsed, options.projectId);
  }
  await recordPublishVersion(universe.id, latexContent, structuredData);
  await syncCatalogOnPublish(universe.id);
  if (options.projectId) {
    await recordProjectVersion(options.projectId, latexContent, "publish", {
      authorId: userId,
      learningUniverseId: universe.id,
      publishType: "publish",
    });
  }
  return universe;
}

async function linkUniverseAssetsToProject(
  universeId: string,
  universe: {
    assets: Array<{ filename: string; storedFilename: string }>;
    structuredData?: unknown;
  },
  projectId: string
) {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;

  for (const asset of universe.assets) {
    const sourcePath = path.join(ASSETS_DIR, universeId, asset.storedFilename);
    let resolvedSource = sourcePath;
    if (!fs.existsSync(resolvedSource)) {
      const { hydrateLocalUpload } = await import("../middlewares/persistUpload.js");
      resolvedSource =
        (await hydrateLocalUpload(`/uploads/learning-universes/${universeId}/${asset.storedFilename}`)) ||
        sourcePath;
    }
    if (!fs.existsSync(resolvedSource)) continue;

    const ext = path.extname(asset.filename);
    const storedProjectFilename = `${randomUUID()}${ext}`;
    const destPath = path.join(projectDir, storedProjectFilename);
    fs.copyFileSync(resolvedSource, destPath);
    const { persistAtPublicRelative } = await import("../middlewares/persistUpload.js");
    const publicPath = await persistAtPublicRelative(
      destPath,
      `projects/${projectId}/${storedProjectFilename}`
    );
    const s3Url = publicPath.startsWith("http") ? publicPath : `${baseUrl}${publicPath}`;

    await prisma.latexFile.create({
      data: {
        projectId,
        name: asset.filename,
        path: `/${asset.filename}`,
        isFolder: false,
        s3Url,
        content: null,
      },
    });
  }

  await prisma.learningUniverse.update({
    where: { id: universeId },
    data: {
      sourceProjectId: projectId,
      structuredData: {
        ...(universe.structuredData as object),
        sourceProjectId: projectId,
      },
    },
  });
}

/** Rehydrate a LatexProject from a published LU when sourceProjectId is missing. */
export async function rehydrateProjectFromUniverse(universeId: string, userId: string) {
  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    include: { assets: true },
  });
  if (!universe) throw new Error("Learning Universe not found");
  if (universe.instructorId !== userId) throw new Error("Unauthorized");

  if (universe.sourceProjectId) {
    const existing = await prisma.latexProject.findUnique({
      where: { id: universe.sourceProjectId },
    });
    if (existing) return existing;
  }

  const dsl = universe.dslSource?.trim() || "";

  if (!dsl) {
    const project = await prisma.latexProject.create({
      data: {
        title: universe.title,
        ownerId: userId,
      },
    });

    const { project: projectJson, files } = buildScaffoldV2Files(universe.title);
    const mainTex = buildMainTexFromProject(projectJson);
    await writeLuProjectToDb(project.id, projectJson, files, mainTex);
    await linkUniverseAssetsToProject(universeId, universe, project.id);
    return prisma.latexProject.findUnique({ where: { id: project.id }, include: { files: true } });
  }

  const project = await prisma.latexProject.create({
    data: {
      title: universe.title,
      ownerId: userId,
      files: {
        create: [{
          name: "main.tex",
          path: "/main.tex",
          isFolder: false,
          content: universe.dslSource,
        }],
      },
    },
    include: { files: true },
  });

  await linkUniverseAssetsToProject(universeId, universe, project.id);

  const { migrateSingleFileToProject } = await import("../services/luProject/migrateSingleFileToProject.js");
  const migration = await migrateSingleFileToProject(project.id);
  if (!migration.alreadyV2 && !migration.migrated) {
    console.warn("[LU Rehydrate] Migration did not produce v2 project");
  }

  return project;
}

function mapUniversesWithStats(
  universes: Array<{
    tracks: Array<{ modules: Array<{ lessons: unknown[]; estimatedHours: number }> }>;
    [key: string]: unknown;
  }>
) {
  return universes.map((lu) => {
    let totalLessons = 0;
    let totalHours = 0;
    for (const track of lu.tracks) {
      for (const mod of track.modules) {
        totalLessons += mod.lessons.length;
        totalHours += mod.estimatedHours;
      }
    }
    const { dslSource: _dsl, structuredData: _sd, ...publicFields } = lu as {
      dslSource?: string;
      structuredData?: unknown;
      [key: string]: unknown;
    };
    return {
      ...publicFields,
      lessonCount: totalLessons,
      estimatedHours: totalHours,
    };
  });
}

async function excludeResourceBackedUniverses<T extends { id: string; structuredData: unknown }>(
  rows: T[]
): Promise<T[]> {
  if (!rows.length) return rows;
  const linked = await prisma.resourceCourse.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: { id: true },
  });
  const linkedIds = new Set(linked.map((r) => r.id));

  return rows.filter((row) => {
    if (linkedIds.has(row.id)) return false;
    return inferProductType(row.structuredData) === PRODUCT_TYPES.LEARNING_UNIVERSE;
  });
}

export async function getPublishedLearningUniverses(options?: {
  categorySlug?: string;
  categoryId?: string;
}) {
  const categoryFilter =
    options?.categoryId
      ? { categoryId: options.categoryId }
      : options?.categorySlug
        ? { categoryRel: { slug: options.categorySlug } }
        : {};

  const universes = await prisma.learningUniverse.findMany({
    where: { status: "published", ...categoryFilter },
    include: {
      categoryRel: { select: { id: true, name: true, slug: true } },
      tracks: {
        include: {
          modules: {
            include: {
              lessons: true,
            },
          },
        },
      },
      instructor: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return mapUniversesWithStats(await excludeResourceBackedUniverses(filterUniversesForLuListing(universes)));
}

/** Landing page — published learning universes only (never free/premium mini courses). */
export async function getLandingShowcaseLearningUniverses() {
  const universes = await prisma.learningUniverse.findMany({
    where: { status: "published" },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      thumbnail: true,
      bannerUrl: true,
      price: true,
      difficulty: true,
      status: true,
      structuredData: true,
      publishedAt: true,
      categoryRel: { select: { id: true, name: true, slug: true } },
      instructor: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      tracks: {
        select: {
          modules: {
            select: {
              estimatedHours: true,
              lessons: { select: { id: true } },
            },
          },
        },
      },
    },
    orderBy: { publishedAt: "desc" },
    take: 24,
  });

  const filtered = await excludeResourceBackedUniverses(
    filterUniversesForLuListing(universes as Parameters<typeof filterUniversesForLuListing>[0])
  );
  return mapUniversesWithStats(filtered as Parameters<typeof mapUniversesWithStats>[0]);
}

export async function getFeaturedHomeLearningUniverses() {
  const universes = await prisma.learningUniverse.findMany({
    where: { status: "published" },
    include: {
      categoryRel: { select: { id: true, name: true, slug: true } },
      tracks: {
        include: {
          modules: {
            include: {
              lessons: true,
            },
          },
        },
      },
      instructor: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  const { filterUniversesForLuListing, filterFeaturedHomeUniverses } = await import("../services/productRoutingService.js");
  const luCatalog = filterUniversesForLuListing(universes);
  return mapUniversesWithStats(filterFeaturedHomeUniverses(luCatalog));
}

export async function getLearningUniverseById(id: string, userId?: string, userRole?: string) {
  const canonicalId = (await resolveCanonicalUniverseId(id)) || id;

  console.log("[GET LEARNING UNIVERSE BY ID] START", {
    requestId: id,
    canonicalId,
    userId,
    userRole,
    endpoint: `/api/learning-universes/${id}`,
    controller: "getLearningUniverseById",
    timestamp: new Date().toISOString(),
  });

  const lu = await prisma.learningUniverse.findUnique({
    where: { id: canonicalId },
    include: {
      categoryRel: true,
      instructor: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
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
                  quiz: {
                    include: {
                      questions: { include: { options: true } },
                    },
                  },
                  project: true,
                  resources: true,
                },
              },
            },
          },
        },
      },
      assets: true,
      enrollments: userId ? { where: { userId } } : false,
      payments: userId ? { where: { userId, status: "completed" } } : false,
    },
  });

  if (!lu) return null;

  const isInstructor = userId === lu.instructorId;
  const isAdmin = isAdminRole(userRole);
  const isEnrolled = (lu as { enrollments?: unknown[] }).enrollments?.length > 0;
  const isPaid = lu.price === 0 || (lu as { payments?: unknown[] }).payments?.length > 0;
  const hasFullAccess = isInstructor || isAdmin || (isEnrolled && isPaid);

  const lessonCount = lu.tracks.reduce(
    (sum, t) => sum + t.modules.reduce((mSum, m) => mSum + m.lessons.length, 0),
    0
  );
  const moduleCount = lu.tracks.reduce((sum, t) => sum + t.modules.length, 0);
  const trackCount = lu.tracks.length;

  console.log("[GET LEARNING UNIVERSE BY ID] DATA", {
    lessonCount,
    moduleCount,
    trackCount,
    hasFullAccess,
    isInstructor,
    isAdmin,
    isEnrolled,
    isPaid,
  });

  const { enrollments: _e, payments: _p, ...rest } = lu as Record<string, unknown>;

  if (!hasFullAccess) {
    rest.dslSource = "";
    rest.structuredData = { title: lu.title, description: lu.description };
    for (const track of rest.tracks as { modules: { lessons: Record<string, unknown>[] }[] }[]) {
      for (const mod of track.modules) {
        for (const lesson of mod.lessons) {
          lesson.contentBlocks = null;
          lesson.videos = [];
          lesson.practice = null;
          lesson.quiz = null;
          lesson.project = null;
          lesson.resources = [];
        }
      }
    }
  }

  return rest;
}

export interface LearningUniverseBrandingInput {
  title: string;
  subtitle?: string;
  description?: string;
  categoryId?: string;
  difficulty?: string;
  bannerUrl?: string;
  thumbnailUrl?: string;
  bannerType?: string;
  productType?: string;
  price?: number;
  featureOnHomepage?: boolean;
}

export async function createLearningUniverseDraft(userId: string, input: LearningUniverseBrandingInput) {
  const thumbnail = input.thumbnailUrl || input.bannerUrl || null;
  const productType = parseProductType(input.productType);
  const universe = await prisma.learningUniverse.create({
    data: {
      title: input.title,
      subtitle: input.subtitle || null,
      description: input.description || input.subtitle || "",
      thumbnail,
      bannerUrl: input.bannerUrl || null,
      bannerType: input.bannerType || null,
      categoryId: input.categoryId || null,
      difficulty: input.difficulty || "Beginner",
      price: typeof input.price === "number" && input.price >= 0 ? input.price : 0,
      status: "draft",
      instructorId: userId,
      dslSource: "",
      structuredData: {
        ...buildStructuredDataProductMeta(productType, "branding-draft"),
        catalogVisibility: defaultCatalogVisibilityForProduct(productType),
        universe: {
          title: input.title,
          description: input.description || input.subtitle || "",
          difficulty: input.difficulty || "Beginner",
          thumbnail,
        },
      },
    },
  });

  if (productType !== "learning-universe") {
    await syncProductListingRecord({
      universeId: universe.id,
      productType,
      instructorId: userId,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description || input.subtitle || "",
      thumbnail,
      categoryId: input.categoryId,
      difficulty: input.difficulty,
      price: input.price,
      creationSource: "branding-draft",
    });
  }

  return universe;
}

export async function updateLearningUniverseBranding(
  universeId: string,
  userId: string,
  input: Partial<LearningUniverseBrandingInput>
) {
  const existing = await prisma.learningUniverse.findUnique({ where: { id: universeId } });
  if (!existing) throw new Error("Learning Universe not found");
  if (existing.instructorId !== userId) throw new Error("Unauthorized");

  const thumbnail =
    input.thumbnailUrl ?? input.bannerUrl ?? existing.thumbnail ?? existing.bannerUrl;

  const existingStructured =
    existing.structuredData && typeof existing.structuredData === "object" && !Array.isArray(existing.structuredData)
      ? (existing.structuredData as Record<string, unknown>)
      : {};

  if (input.productType && existingStructured.immutableProductType) {
    const locked = existingStructured.productType;
    if (locked && input.productType !== locked) {
      throw new Error(`Product type is locked to "${locked}" and cannot be changed`);
    }
  }

  const productType =
    getProductTypeFromStructuredData(existingStructured) ??
    (input.productType ? parseProductType(input.productType) : null);

  const featureOnHomepage =
    typeof input.featureOnHomepage === "boolean"
      ? input.featureOnHomepage
      : existingStructured.featureOnHomepage === true || existingStructured.featuredHome === true;

  let catalogVisibility = getCatalogVisibility(existingStructured);
  if (!catalogVisibility.length && productType) {
    catalogVisibility = [...getCatalogVisibility({ productType })];
  }

  const featuredFlags: CatalogVisibilityFlag[] = [
    CATALOG_VISIBILITY.FEATURED_HOME,
    CATALOG_VISIBILITY.TRENDING,
    CATALOG_VISIBILITY.EDITOR_PICK,
    CATALOG_VISIBILITY.AI_RECOMMENDED,
  ];
  if (featureOnHomepage) {
    if (!catalogVisibility.includes(CATALOG_VISIBILITY.FEATURED_HOME)) {
      catalogVisibility = [...catalogVisibility, CATALOG_VISIBILITY.FEATURED_HOME];
    }
  } else {
    catalogVisibility = catalogVisibility.filter((flag) => !featuredFlags.includes(flag));
  }

  const structuredData = {
    ...existingStructured,
    ...(input.productType && !existingStructured.immutableProductType ? { productType: input.productType } : {}),
    featureOnHomepage,
    featuredHome: featureOnHomepage,
    catalogVisibility,
  };

  const updated = await prisma.learningUniverse.update({
    where: { id: universeId },
    data: {
      title: input.title ?? existing.title,
      subtitle: input.subtitle ?? existing.subtitle,
      description: input.description ?? existing.description,
      categoryId: input.categoryId ?? existing.categoryId,
      difficulty: input.difficulty ?? existing.difficulty,
      bannerUrl: input.bannerUrl ?? existing.bannerUrl,
      bannerType: input.bannerType ?? existing.bannerType,
      thumbnail: thumbnail ?? null,
      ...(typeof input.price === "number" && input.price >= 0 ? { price: input.price } : {}),
      structuredData,
    },
  });

  const resolvedProductType =
    productType ??
    (existingStructured.productType ? parseProductType(String(existingStructured.productType)) : null);

  if (resolvedProductType && resolvedProductType !== PRODUCT_TYPES.LEARNING_UNIVERSE) {
    const effectivePrice =
      typeof input.price === "number" && input.price >= 0 ? input.price : existing.price;
    await syncProductListingRecord({
      universeId,
      productType: resolvedProductType,
      instructorId: userId,
      title: updated.title,
      subtitle: updated.subtitle ?? undefined,
      description: updated.description ?? undefined,
      thumbnail: updated.thumbnail,
      categoryId: updated.categoryId,
      difficulty: updated.difficulty ?? undefined,
      price: effectivePrice,
      creationSource: "branding-draft",
    });
  }

  return updated;
}
