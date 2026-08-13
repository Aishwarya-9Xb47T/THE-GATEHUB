import { isAdminRole } from "../utils/roles.js";
import path from "path";
import fs from "fs";
import { prisma } from "../utils/prisma.js";
import { parseCourseDslLatex, type ParsedCourseDsl, type ParsedCourseLesson } from "./course-dsl-parser.js";
import { recordProjectVersion } from "../services/latexVersionService.js";
import { generateCourseLandingPage } from "../services/aiService.js";
import { resolveLinkedCourseIdForProject } from "../services/productRoutingService.js";

const PROJECTS_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads", "projects");

export interface PublishCourseDslOptions {
  projectId?: string;
  courseId?: string;
}

interface AcademicStudioMeta {
  dslSource?: string;
  sourceProjectId?: string;
}

function getAcademicStudioMeta(aiContent: string | null): AcademicStudioMeta {
  if (!aiContent) return {};
  try {
    const parsed = JSON.parse(aiContent) as { academicStudio?: AcademicStudioMeta };
    return parsed.academicStudio || {};
  } catch {
    return {};
  }
}

function mergeAcademicStudioMeta(
  aiContent: string | null,
  update: AcademicStudioMeta
): string {
  let base: Record<string, unknown> = {};
  if (aiContent) {
    try {
      base = JSON.parse(aiContent) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }
  const existing = (base.academicStudio as AcademicStudioMeta) || {};
  base.academicStudio = { ...existing, ...update };
  return JSON.stringify(base);
}

function normalizeDifficulty(raw?: string): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes("begin")) return "beginner";
  if (lower.includes("inter")) return "intermediate";
  if (lower.includes("adv")) return "advanced";
  return undefined;
}

function buildLessonContent(lesson: ParsedCourseLesson): string {
  const parts: string[] = [];
  if (lesson.overview) {
    parts.push(lesson.overview);
  }
  if (lesson.practice) {
    parts.push(
      `## ${lesson.practice.title}\n\n\`\`\`${lesson.practice.language}\n${lesson.practice.initialCode}\n\`\`\``
    );
    if (lesson.practice.expectedOutput) {
      parts.push(`**Expected output:** ${lesson.practice.expectedOutput}`);
    }
  }
  if (lesson.assignment) {
    parts.push(
      `## Assignment: ${lesson.assignment.title}\n\n${lesson.assignment.instructions}`
    );
    if (lesson.assignment.dueDate) {
      parts.push(`**Due:** ${lesson.assignment.dueDate}`);
    }
    if (lesson.assignment.points) {
      parts.push(`**Points:** ${lesson.assignment.points}`);
    }
  }
  if (lesson.resources.length) {
    parts.push("## Resources\n");
    for (const r of lesson.resources) {
      parts.push(r.url ? `- [${r.title}](${r.url})` : `- ${r.title}`);
    }
  }
  return parts.join("\n\n").trim();
}

function buildQuizCreate(lesson: ParsedCourseLesson) {
  if (!lesson.quiz?.questions?.length) return undefined;
  return {
    title: lesson.quiz.title || `${lesson.title} Quiz`,
    description: `Quiz for ${lesson.title}`,
    totalMarks: lesson.quiz.questions.length,
    questions: {
      create: lesson.quiz.questions.map((q, qi) => ({
        text: q.text,
        type: "multiple_choice",
        marks: 1,
        order: qi,
        explanation: q.explanation,
        options: {
          create: q.options.map((o, oi) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            order: oi,
          })),
        },
      })),
    },
  };
}

function buildLectureCreate(lesson: ParsedCourseLesson, order: number) {
  const primaryVideo = lesson.videos[0];
  const content = buildLessonContent(lesson);
  const quizCreate = buildQuizCreate(lesson);

  if (primaryVideo) {
    return {
      title: lesson.title,
      type: "video",
      content: content || null,
      videoUrl: primaryVideo.url,
      videoType: primaryVideo.type,
      order,
      ...(quizCreate ? { quiz: { create: quizCreate } } : {}),
    };
  }

  if (quizCreate && !content) {
    return {
      title: lesson.quiz?.title || `${lesson.title} Quiz`,
      type: "article",
      content: null,
      order,
      quiz: { create: quizCreate },
    };
  }

  return {
    title: lesson.title,
    type: "article",
    content: content || null,
    order,
    ...(quizCreate ? { quiz: { create: quizCreate } } : {}),
  };
}

function buildSectionsCreate(parsed: ParsedCourseDsl) {
  return parsed.chapters.map((chapter, ci) => ({
    title: chapter.title,
    order: ci,
    lectures: {
      create: chapter.lessons.map((lesson, li) => buildLectureCreate(lesson, li)),
    },
  }));
}

async function resolveCategoryFields(input: {
  category?: string;
  subcategory?: string;
}) {
  const categoryName = input.category?.trim() || "Development";
  const subcategoryName = input.subcategory?.trim() || "Programming Languages";

  const category = await prisma.category.findFirst({
    where: { name: { equals: categoryName, mode: "insensitive" } },
    include: { subcategories: true },
  });

  if (!category) {
    return { categoryName, subcategoryName, categoryId: null, subcategoryId: null };
  }

  const sub = category.subcategories.find(
    (s) => s.name.toLowerCase() === subcategoryName.toLowerCase()
  );

  return {
    categoryName: category.name,
    subcategoryName: sub?.name || subcategoryName,
    categoryId: category.id,
    subcategoryId: sub?.id || null,
  };
}

export async function publishCourseFromDsl(
  latexContent: string,
  userId: string,
  options: PublishCourseDslOptions = {}
) {
  const parsed = parseCourseDslLatex(latexContent);
  if (!parsed) {
    throw new Error("Could not parse course DSL structure");
  }

  if (parsed.warnings?.length) {
    console.warn("[Course DSL Publish] Parser warnings:", parsed.warnings.join("; "));
  }

  let courseId = options.courseId;
  if (!courseId && options.projectId) {
    courseId = await resolveLinkedCourseIdForProject(options.projectId, userId);
  }

  const resolvedCategory = await resolveCategoryFields({
    category: parsed.course.category,
    subcategory: parsed.course.subcategory,
  });

  const academicMeta = {
    dslSource: latexContent,
    sourceProjectId: options.projectId,
  };

  if (courseId) {
    const existing = await prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true, aiContent: true, price: true, status: true },
    });

    if (!existing) throw new Error("Course not found for republish");
    if (existing.instructorId !== userId) throw new Error("Unauthorized to republish this course");

    await prisma.section.deleteMany({ where: { courseId } });

    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        title: parsed.course.title,
        subtitle: parsed.course.subtitle,
        description: parsed.course.description,
        price: existing.price,
        difficulty: normalizeDifficulty(parsed.course.difficulty),
        language: parsed.course.language || "en",
        category: resolvedCategory.categoryName,
        subcategory: resolvedCategory.subcategoryName,
        categoryId: resolvedCategory.categoryId,
        subcategoryId: resolvedCategory.subcategoryId,
        thumbnail: parsed.course.thumbnail,
        status: existing.status === "published" ? "published" : "draft",
        aiContent: mergeAcademicStudioMeta(existing.aiContent, academicMeta),
        sections: { create: buildSectionsCreate(parsed) },
      },
      include: {
        sections: {
          include: {
            lectures: {
              include: {
                quiz: { include: { questions: { include: { options: true } } } },
              },
            },
          },
        },
      },
    });

    if (options.projectId) {
      await recordProjectVersion(options.projectId, latexContent, "republish", {
        authorId: userId,
        publishType: "republish",
        resourceCourseId: course.id,
      });
    }

    return course;
  }

  const course = await prisma.course.create({
    data: {
      title: parsed.course.title,
      subtitle: parsed.course.subtitle,
      description: parsed.course.description,
      price: parsed.course.price ?? 0,
      difficulty: normalizeDifficulty(parsed.course.difficulty),
      language: parsed.course.language || "en",
      category: resolvedCategory.categoryName,
      subcategory: resolvedCategory.subcategoryName,
      categoryId: resolvedCategory.categoryId,
      subcategoryId: resolvedCategory.subcategoryId,
      thumbnail: parsed.course.thumbnail,
      status: "draft",
      instructorId: userId,
      aiContent: mergeAcademicStudioMeta(null, academicMeta),
      sections: { create: buildSectionsCreate(parsed) },
    },
    include: {
      sections: {
        include: {
          lectures: {
            include: {
              quiz: { include: { questions: { include: { options: true } } } },
            },
          },
        },
      },
    },
  });

  const summary = `Course: ${parsed.course.title}. ${parsed.course.description?.slice(0, 200) || ""}`;
  const landingData = await generateCourseLandingPage(parsed.course.title, summary);
  await prisma.course.update({
    where: { id: course.id },
    data: { aiLandingData: JSON.stringify(landingData) },
  });

  if (options.projectId) {
    await recordProjectVersion(options.projectId, latexContent, "publish", {
      authorId: userId,
      publishType: "publish",
      resourceCourseId: course.id,
    });
  }

  return course;
}

export async function rehydrateProjectFromCourse(courseId: string, userId: string, userRole?: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Course not found");
  if (course.instructorId !== userId && !isAdminRole(userRole)) {
    throw new Error("Unauthorized");
  }

  const meta = getAcademicStudioMeta(course.aiContent);
  if (meta.sourceProjectId) {
    const existing = await prisma.latexProject.findUnique({
      where: { id: meta.sourceProjectId },
    });
    if (existing) return existing;
  }

  const dslSource = meta.dslSource;
  if (!dslSource) {
    throw new Error("No academic studio DSL found for this course");
  }

  const project = await prisma.latexProject.create({
    data: {
      title: course.title,
      ownerId: userId,
      files: {
        create: [{
          name: "main.tex",
          path: "/main.tex",
          isFolder: false,
          content: dslSource,
        }],
      },
    },
    include: { files: true },
  });

  const projectDir = path.join(PROJECTS_DIR, project.id);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  await prisma.course.update({
    where: { id: courseId },
    data: {
      aiContent: mergeAcademicStudioMeta(course.aiContent, { sourceProjectId: project.id }),
    },
  });

  return project;
}

export function getCourseDslSource(course: { aiContent: string | null }): string | null {
  return getAcademicStudioMeta(course.aiContent).dslSource || null;
}

export function getCourseSourceProjectId(course: { aiContent: string | null }): string | null {
  return getAcademicStudioMeta(course.aiContent).sourceProjectId || null;
}
