import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import {
  buildLearnerExperienceFromPublishedUniverse,
  repairLearnerExperienceLabs,
  repairLearnerExperienceReading,
} from "../services/learningExperience/learningExperienceEngine.js";
import type { LearnerExperiencePackage } from "../services/learningExperience/learningExperienceSchema.js";
import { LEARNING_EXPERIENCE_ENGINE_VERSION } from "../services/learningExperience/learningExperienceSchema.js";
import { resolveLearnerScope, getCurrentPublishVersionId, resolveCanonicalUniverseId } from "../services/learnerScopeService.js";
import { hasCompletedLuPayment } from "../services/enrollmentService.js";

async function loadPublishedUniverse(universeIdOrCourseId: string) {
  const resolvedId = (await resolveCanonicalUniverseId(universeIdOrCourseId)) || universeIdOrCourseId;
  return prisma.learningUniverse.findUnique({
    where: { id: resolvedId },
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
      enrollments: false,
    },
  });
}

function universeToEngineInput(universe: NonNullable<Awaited<ReturnType<typeof loadPublishedUniverse>>>) {
  return {
    id: universe.id,
    title: universe.title,
    description: universe.description,
    thumbnail: universe.thumbnail,
    difficulty: universe.difficulty,
    tracks: universe.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      modules: t.modules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          contentBlocks: (l.contentBlocks as import("../services/learningUniverseSchema.js").LuContentBlock[]) ?? null,
          videos: l.videos,
          practice: l.practice,
          quiz: l.quiz,
          project: l.project,
          resources: l.resources,
        })),
      })),
    })),
  };
}

function countDbLessons(universe: NonNullable<Awaited<ReturnType<typeof loadPublishedUniverse>>>) {
  return universe.tracks.reduce(
    (sum, track) =>
      sum + track.modules.reduce((mSum, mod) => mSum + mod.lessons.length, 0),
    0
  );
}

function countDbVideos(universe: NonNullable<Awaited<ReturnType<typeof loadPublishedUniverse>>>) {
  return universe.tracks.reduce(
    (sum, track) =>
      sum +
      track.modules.reduce(
        (mSum, mod) => mSum + mod.lessons.reduce((lSum, lesson) => lSum + lesson.videos.length, 0),
        0
      ),
    0
  );
}

function countCachedLessons(experience: LearnerExperiencePackage) {
  return experience.outline.tracks.reduce(
    (sum, track) =>
      sum + track.modules.reduce((mSum, mod) => mSum + mod.lessons.length, 0),
    0
  );
}

function countCachedVideoSteps(experience: LearnerExperiencePackage) {
  return Object.values(experience.lessons).reduce(
    (sum, lesson) => sum + lesson.steps.filter((s) => s.kind === "video").length,
    0
  );
}

function countCachedEmbeddedLessonVideos(experience: LearnerExperiencePackage) {
  return Object.values(experience.lessons).reduce((sum, lesson) => {
    return (
      sum +
      lesson.steps.reduce((stepSum, step) => {
        const before = (step.payload.embeddedMediaBefore as Array<{ type?: string }> | undefined) ?? [];
        const after = (step.payload.embeddedMediaAfter as Array<{ type?: string }> | undefined) ?? [];
        return stepSum + [...before, ...after].filter((item) => item.type === "video").length;
      }, 0)
    );
  }, 0);
}

export async function getLearnerExperience(
  universeId: string,
  userId?: string,
  userRole?: string
): Promise<LearnerExperiencePackage | null> {
  const resolved = await resolveCanonicalUniverseId(universeId);

  // Bridge classic Course → canonical LU (same resolver as progress/experience).
  // Sync Course enrollment → LU enrollment so /student/course/:courseId/learn works.
  const course = await prisma.course.findUnique({
    where: { id: universeId },
    select: { id: true, title: true },
  });
  if (course && userId) {
    const courseEnrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
      select: { id: true },
    });
    if (courseEnrollment) {
      const { ensureLinkedLearningUniverseEnrollment } = await import("../services/enrollmentService.js");
      await ensureLinkedLearningUniverseEnrollment(userId, course.id);
    }
  }
  if (course && !resolved) {
    throw new AppError(
      404,
      `This course (“${course.title}”) is not available in the current learning format yet. It has no linked Learning Universe.`
    );
  }

  const canonicalId = resolved || universeId;
  const universe = await loadPublishedUniverse(canonicalId);
  if (!universe) return null;

  const isInstructor = Boolean(userId && userId === universe.instructorId);
  const isAdmin = isAdminRole(userRole);
  if (!isInstructor && !isAdmin && universe.status !== "published") {
    throw new AppError(403, "Learning experience not available");
  }

  // Students must be enrolled (and paid, when price > 0) before receiving the full experience package.
  if (!isInstructor && !isAdmin) {
    if (!userId) {
      throw new AppError(401, "Authentication required");
    }
    const enrollment = await prisma.learningUniverseEnrollment.findUnique({
      where: {
        userId_learningUniverseId: {
          userId,
          learningUniverseId: universe.id,
        },
      },
    });
    if (!enrollment) {
      throw new AppError(403, "Enrollment required to access this learning experience");
    }
    if (universe.price > 0) {
      const paid = await hasCompletedLuPayment(userId, universe.id);
      if (!paid) {
        throw new AppError(402, "Purchase required to access this learning experience");
      }
    }
  }

  const dbLessonCount = countDbLessons(universe);
  const dbVideoCount = countDbVideos(universe);
  const dbModuleCount = universe.tracks.reduce((sum, t) => sum + t.modules.length, 0);
  const dbTrackCount = universe.tracks.length;
  const currentPublishVersionId = universe.currentPublishVersionId;
  const snapshotHash = (universe.structuredData as { snapshotHash?: string } | null)?.snapshotHash || "none";

  console.log("[GET LEARNER EXPERIENCE] START", {
    universeId,
    userId,
    userRole,
    currentPublishVersionId,
    snapshotHash,
    dbLessonCount,
    dbModuleCount,
    dbTrackCount,
    dbVideoCount,
    loadedAt: new Date().toISOString(),
  });

  console.log("[GET LEARNER EXPERIENCE] API DETAILS", {
    endpoint: `/api/learning-universes/${universeId}/experience`,
    controller: "getLearnerExperience",
    universeId,
    userId,
    userRole,
  });

  const structured = universe.structuredData as { learnerExperience?: LearnerExperiencePackage } | null;
  const cached = structured?.learnerExperience;
  if (cached?.version) {
    const cachedLessonCount = countCachedLessons(cached);
    const cachedVideoSteps = countCachedVideoSteps(cached);
    const cachedEmbeddedVideos = countCachedEmbeddedLessonVideos(cached);
    const versionCurrent = cached.version === LEARNING_EXPERIENCE_ENGINE_VERSION;
    const videosAligned =
      dbVideoCount === 0 || cachedVideoSteps > 0 || cachedEmbeddedVideos >= dbVideoCount;
    const cachedPublishVersionId = (cached as { publishVersionId?: string }).publishVersionId;
    const publishVersionCurrent =
      !universe.currentPublishVersionId ||
      !cachedPublishVersionId ||
      cachedPublishVersionId === universe.currentPublishVersionId;

    console.log("[GET LEARNER EXPERIENCE] CACHE CHECK", {
      universeId,
      cachedLessonCount,
      dbLessonCount,
      cachedVideoSteps,
      cachedEmbeddedVideos,
      dbVideoCount,
      versionCurrent,
      videosAligned,
      cachedPublishVersionId,
      currentPublishVersionId,
      publishVersionCurrent,
      cacheValid: cachedLessonCount === dbLessonCount && dbLessonCount > 0 && versionCurrent && videosAligned && publishVersionCurrent,
    });

    if (
      cachedLessonCount === dbLessonCount &&
      dbLessonCount > 0 &&
      versionCurrent &&
      videosAligned &&
      publishVersionCurrent
    ) {
      console.log("[GET LEARNER EXPERIENCE] RETURNING CACHED", {
        universeId,
        cachedPublishVersionId,
        cachedLessonCount,
        returnedAt: new Date().toISOString(),
      });
      return attachPublishVersion(cached, universeId, userId);
    }
  }

  console.log("[GET LEARNER EXPERIENCE] REBUILDING FRESH", {
    universeId,
    reason: cached ? "cache_invalid" : "no_cache",
    dbLessonCount,
    rebuildingAt: new Date().toISOString(),
  });

  const { resolveCompletionRules } = await import("../services/learningExperience/completionRulesResolve.js");
  const rules = resolveCompletionRules(universe.structuredData);
  const fresh = buildLearnerExperienceFromPublishedUniverse(universeToEngineInput(universe), rules);
  if (dbLessonCount > 0) {
    const baseStructured = (universe.structuredData as Record<string, unknown>) || {};
    await prisma.learningUniverse.update({
      where: { id: universeId },
      data: {
        structuredData: {
          ...baseStructured,
          completionRules: rules,
          learnerExperience: fresh,
        } as object,
      },
    });
  }

  console.log("[GET LEARNER EXPERIENCE] RETURNING FRESH", {
    universeId,
    freshLessonCount: Object.keys(fresh.lessons || {}).length,
    savedAt: new Date().toISOString(),
  });

  return attachPublishVersion(fresh, universeId, userId);
}

async function attachPublishVersion(
  pkg: LearnerExperiencePackage,
  universeId: string,
  userId?: string
): Promise<LearnerExperiencePackage> {
  const scope = userId ? await resolveLearnerScope(userId, universeId) : null;
  const publishVersionId =
    scope?.publishVersionId ?? (await getCurrentPublishVersionId(universeId)) ?? undefined;

  console.log("[ATTACH PUBLISH VERSION]", {
    universeId,
    userId,
    scopePublishVersionId: scope?.publishVersionId,
    currentPublishVersionId: await getCurrentPublishVersionId(universeId),
    finalPublishVersionId: publishVersionId,
    attachedAt: new Date().toISOString(),
  });

  const lu = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    select: { structuredData: true },
  });
  const { applyCompletionRulesToExperience } = await import(
    "../services/learningExperience/completionRulesResolve.js"
  );
  const withRules = applyCompletionRulesToExperience(
    repairLearnerExperienceReading(repairLearnerExperienceLabs(pkg)),
    lu?.structuredData
  );

  return { ...withRules, publishVersionId };
}

export async function ensureLearnerExperienceCached(universeId: string): Promise<LearnerExperiencePackage> {
  const universe = await loadPublishedUniverse(universeId);
  if (!universe) throw new AppError(404, "Learning Universe not found");

  const structured = (universe.structuredData as Record<string, unknown>) || {};
  const { resolveCompletionRules, applyCompletionRulesToExperience } = await import(
    "../services/learningExperience/completionRulesResolve.js"
  );
  if (structured.learnerExperience) {
    return applyCompletionRulesToExperience(
      repairLearnerExperienceReading(
        repairLearnerExperienceLabs(structured.learnerExperience as LearnerExperiencePackage)
      ),
      structured
    );
  }

  const rules = resolveCompletionRules(structured);
  const learnerExperience = buildLearnerExperienceFromPublishedUniverse(
    universeToEngineInput(universe),
    rules
  );
  await prisma.learningUniverse.update({
    where: { id: universeId },
    data: {
      structuredData: { ...structured, completionRules: rules, learnerExperience } as object,
    },
  });
  return learnerExperience;
}
