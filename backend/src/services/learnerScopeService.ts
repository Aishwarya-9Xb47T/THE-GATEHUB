import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";

export interface LearnerScope {
  userId: string;
  learningUniverseId: string;
  publishVersionId: string;
  enrollmentId?: string;
}

/** Resolve canonical LearningUniverse ID from either a LearningUniverse ID or a Course ID. */
export async function resolveCanonicalUniverseId(idOrCourseId: string): Promise<string | null> {
  if (!idOrCourseId) return null;

  // 1. Direct match on LearningUniverse.id
  const directLu = await prisma.learningUniverse.findUnique({
    where: { id: idOrCourseId },
    select: { id: true },
  });
  if (directLu) return directLu.id;

  // 2. Product catalog (courseId or product id)
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: idOrCourseId }, { courseId: idOrCourseId }, { learningUniverseId: idOrCourseId }],
    },
    select: { learningUniverseId: true, courseId: true },
  });
  if (product?.learningUniverseId) return product.learningUniverseId;

  const courseLookupId = product?.courseId || idOrCourseId;

  // 3. Match on Course.aiContent -> academicStudio.learningUniverseId
  const course = await prisma.course.findUnique({
    where: { id: courseLookupId },
    select: { id: true, aiContent: true, instructorId: true, title: true },
  });
  if (course?.aiContent) {
    try {
      const parsed = JSON.parse(course.aiContent) as {
        academicStudio?: { learningUniverseId?: string };
        learningUniverseId?: string;
      };
      const luId = parsed.academicStudio?.learningUniverseId || parsed.learningUniverseId;
      if (typeof luId === "string" && luId) {
        const lu = await prisma.learningUniverse.findUnique({
          where: { id: luId },
          select: { id: true },
        });
        if (lu) return lu.id;
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Match on LearningUniverse where structuredData.linkedCourseId == id
  if (course) {
    const universes = await prisma.learningUniverse.findMany({
      where: { instructorId: course.instructorId },
      select: { id: true, structuredData: true, instructorId: true, title: true },
      take: 200,
      orderBy: { updatedAt: "desc" },
    });
    for (const u of universes) {
      const sd = (u.structuredData as Record<string, unknown> | null) ?? {};
      if (sd.linkedCourseId === course.id || sd.linkedCourseId === idOrCourseId) {
        return u.id;
      }
    }

    // 5. Fallback match by instructor and title
    const titleMatch = universes.find(
      (u) => u.title.trim().toLowerCase() === course.title.trim().toLowerCase()
    );
    if (titleMatch) return titleMatch.id;
  } else {
    const universes = await prisma.learningUniverse.findMany({
      select: { id: true, structuredData: true },
      take: 300,
      orderBy: { updatedAt: "desc" },
    });
    for (const u of universes) {
      const sd = (u.structuredData as Record<string, unknown> | null) ?? {};
      if (sd.linkedCourseId === idOrCourseId) return u.id;
    }
  }

  // 6. LatexProject as sourceProjectId
  const byProject = await prisma.learningUniverse.findFirst({
    where: { sourceProjectId: idOrCourseId },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (byProject) return byProject.id;

  return null;
}

/**
 * Batch-resolve Learning Universe IDs for many course IDs (dashboard enrollments hot path).
 * Falls back to resolveCanonicalUniverseId for remaining unresolved IDs.
 */
export async function resolveCanonicalUniverseIds(
  courseIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(courseIds.filter(Boolean))];
  const out = new Map<string, string | null>();
  if (unique.length === 0) return out;

  for (const id of unique) out.set(id, null);

  const products = await prisma.product.findMany({
    where: {
      OR: [{ courseId: { in: unique } }, { id: { in: unique } }, { learningUniverseId: { in: unique } }],
    },
    select: { id: true, courseId: true, learningUniverseId: true },
  });

  for (const p of products) {
    if (!p.learningUniverseId) continue;
    if (p.courseId && unique.includes(p.courseId)) out.set(p.courseId, p.learningUniverseId);
    if (unique.includes(p.id)) out.set(p.id, p.learningUniverseId);
    if (unique.includes(p.learningUniverseId)) out.set(p.learningUniverseId, p.learningUniverseId);
  }

  const unresolved = unique.filter((id) => !out.get(id));
  if (unresolved.length === 0) return out;

  const courses = await prisma.course.findMany({
    where: { id: { in: unresolved } },
    select: { id: true, aiContent: true },
  });
  const candidateLuIds: string[] = [];
  const courseToCandidate = new Map<string, string>();
  for (const course of courses) {
    if (!course.aiContent) continue;
    try {
      const parsed = JSON.parse(course.aiContent) as {
        academicStudio?: { learningUniverseId?: string };
        learningUniverseId?: string;
      };
      const luId = parsed.academicStudio?.learningUniverseId || parsed.learningUniverseId;
      if (typeof luId === "string" && luId) {
        candidateLuIds.push(luId);
        courseToCandidate.set(course.id, luId);
      }
    } catch {
      /* ignore */
    }
  }
  if (candidateLuIds.length > 0) {
    const existing = await prisma.learningUniverse.findMany({
      where: { id: { in: [...new Set(candidateLuIds)] } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((e) => e.id));
    for (const [courseId, luId] of courseToCandidate) {
      if (existingSet.has(luId)) out.set(courseId, luId);
    }
  }

  const stillUnresolved = unique.filter((id) => !out.get(id));
  await Promise.all(
    stillUnresolved.map(async (id) => {
      out.set(id, await resolveCanonicalUniverseId(id));
    }),
  );

  return out;
}

/** Resolve the active publish version for a learning universe (latest published). */
export async function getCurrentPublishVersionId(learningUniverseId: string): Promise<string | null> {
  const lu = await prisma.learningUniverse.findUnique({
    where: { id: learningUniverseId },
    select: { currentPublishVersionId: true },
  });
  if (lu?.currentPublishVersionId) return lu.currentPublishVersionId;

  const latest = await prisma.learningUniversePublishVersion.findFirst({
    where: { learningUniverseId },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

export async function ensurePublishVersionPointer(learningUniverseId: string): Promise<string | null> {
  const lu = await prisma.learningUniverse.findUnique({
    where: { id: learningUniverseId },
    select: {
      currentPublishVersionId: true,
      dslSource: true,
      structuredData: true,
    },
  });
  if (!lu) return null;
  if (lu.currentPublishVersionId) return lu.currentPublishVersionId;

  const latest = await prisma.learningUniversePublishVersion.findFirst({
    where: { learningUniverseId },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  if (latest) {
    await prisma.learningUniverse.updateMany({
      where: { id: learningUniverseId, currentPublishVersionId: null },
      data: { currentPublishVersionId: latest.id },
    });
    return latest.id;
  }

  // Legacy courses without a publish version: materialize v1 from current LU content.
  const created = await prisma.learningUniversePublishVersion.create({
    data: {
      learningUniverseId,
      versionNumber: 1,
      dslSource: lu.dslSource,
      structuredData: lu.structuredData as object,
    },
  });
  await prisma.learningUniverse.update({
    where: { id: learningUniverseId },
    data: { currentPublishVersionId: created.id },
  });
  return created.id;
}

/** Pin or resolve publish version for an enrolled learner. Accepts Course ID or LU ID. */
export async function resolveLearnerScope(
  userId: string,
  idOrCourseId: string,
  options?: { requireEnrollment?: boolean }
): Promise<LearnerScope | null> {
  const learningUniverseId = (await resolveCanonicalUniverseId(idOrCourseId)) || idOrCourseId;

  // Course enrollment → keep linked LU enrollment in sync (canonical learning path)
  if (idOrCourseId !== learningUniverseId) {
    try {
      const { ensureLinkedLearningUniverseEnrollment } = await import("./enrollmentService.js");
      const course = await prisma.course.findUnique({ where: { id: idOrCourseId }, select: { id: true } });
      if (course) {
        const courseEnrollment = await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId, courseId: course.id } },
          select: { id: true },
        });
        if (courseEnrollment) {
          await ensureLinkedLearningUniverseEnrollment(userId, course.id);
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId, learningUniverseId } },
    select: { id: true, publishVersionId: true },
  });

  if (!enrollment) {
    if (options?.requireEnrollment) return null;
    const publishVersionId = await ensurePublishVersionPointer(learningUniverseId);
    if (!publishVersionId) return null;
    return { userId, learningUniverseId, publishVersionId };
  }

  let publishVersionId = enrollment.publishVersionId;
  if (!publishVersionId) {
    publishVersionId = await ensurePublishVersionPointer(learningUniverseId);
    if (publishVersionId) {
      await prisma.learningUniverseEnrollment.update({
        where: { id: enrollment.id },
        data: { publishVersionId },
      });
      await prisma.learningUniverseProgress.updateMany({
        where: { enrollmentId: enrollment.id },
        data: { publishVersionId },
      });
    }
  }

  if (!publishVersionId) return null;

  return {
    userId,
    learningUniverseId,
    publishVersionId,
    enrollmentId: enrollment.id,
  };
}

export async function requireLearnerScope(userId: string, idOrCourseId: string): Promise<LearnerScope> {
  const scope = await resolveLearnerScope(userId, idOrCourseId, { requireEnrollment: true });
  if (!scope) throw new AppError(404, "Not enrolled in this course");
  return scope;
}

export function scopeStorageKey(scope: LearnerScope): string {
  return `${scope.learningUniverseId}:${scope.publishVersionId}`;
}
