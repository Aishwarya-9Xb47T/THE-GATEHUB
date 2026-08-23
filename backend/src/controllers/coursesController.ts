import { isAdminRole } from "../utils/roles.js";
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { generateCourseContent, generateCourseLandingPage, generateAutoDescription } from "../services/aiService.js";
import { generateCourseDetails } from "../services/aiCourseService.js";
import {
  generateFullCourseAuthoringPackage,
  generateCourseThumbnail,
  buildQuizCreateData,
  formatLessonMarkdown,
  formatProjectMarkdown,
  formatResourcesMarkdown,
  type AICourseAuthoringPackage,
} from "../services/aiCourseAuthoringService.js";
import { PremiumCertificateService } from "../services/premiumCertificateService.js";
import { getPlatformSettings } from "../services/platformSettingsService.js";
import {
  findPremiumUniverseForLinkedCourse,
  resolvePremiumCourseDisplayStatus,
  syncPremiumUniverseStatusFromCourse,
} from "../services/productRoutingService.js";
import fs from "fs";
import path from "path";

async function triggerAutoDescription(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sections: {
        include: { lectures: true }
      }
    }
  });

  if (!course) return;

  const contentSummary = course.sections.map(s => {
    return `Section: ${s.title}\nLectures: ${s.lectures.map(l => l.title).join(", ")}\nNotes: ${s.lectures.map(l => l.content || "").join("\n")}`;
  }).join("\n\n");

  const description = await generateAutoDescription(course.title, contentSummary);

  await prisma.course.update({
    where: { id: courseId },
    data: { description }
  });
}

const requiredTrimmedString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1)
);

const optionalTrimmedString = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const safePriceSchema = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return 0;
  return value;
}, z.coerce.number().min(0));

const createSchema = z.object({
  title: requiredTrimmedString,
  subtitle: optionalTrimmedString,
  description: optionalTrimmedString,
  price: safePriceSchema,
  category: optionalTrimmedString,
  subcategory: optionalTrimmedString,
  categoryId: optionalTrimmedString,
  subcategoryId: optionalTrimmedString,
  thumbnail: optionalTrimmedString,
  bannerUrl: optionalTrimmedString,
  bannerType: optionalTrimmedString,
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  language: optionalTrimmedString,
  status: z.enum(["draft", "published", "archived"]).optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["draft", "published", "archived"]).optional(),
});

function normalizeCourseCategory<T extends { categoryRel?: { id?: string; name: string; slug?: string } | null; category?: string | null }>(course: T) {
  return {
    ...course,
    category: course.categoryRel ?? (course.category ? { name: course.category } : null),
  };
}

function parseCourseAcademicStudioEdit(aiContent: string | null): {
  learningUniverseId?: string;
  sourceProjectId?: string;
} | null {
  if (!aiContent) return null;
  try {
    const parsed = JSON.parse(aiContent) as {
      academicStudio?: { learningUniverseId?: string; sourceProjectId?: string };
      sourceProjectId?: string;
    };
    const studio = parsed.academicStudio;
    const learningUniverseId = studio?.learningUniverseId;
    const sourceProjectId = studio?.sourceProjectId ?? parsed.sourceProjectId;
    if (learningUniverseId || sourceProjectId) {
      return { learningUniverseId, sourceProjectId };
    }
  } catch {
    /* ignore invalid JSON */
  }
  return null;
}

async function resolveCategoryFields(input: {
  category?: string;
  categoryId?: string;
  subcategory?: string;
  subcategoryId?: string;
}) {
  let categoryName = input.category;
  let categoryId = input.categoryId;

  if (categoryId && !categoryName) {
    const categoryById = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true },
    });
    if (!categoryById) throw new AppError(400, "Invalid categoryId");
    categoryName = categoryById.name;
  }

  if (!categoryId && categoryName) {
    const categoryByName = await prisma.category.findFirst({
      where: { name: { equals: categoryName, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (categoryByName) {
      categoryId = categoryByName.id;
      categoryName = categoryByName.name;
    }
  }

  let subcategoryName = input.subcategory;
  let subcategoryId = input.subcategoryId;

  if (subcategoryId && !subcategoryName) {
    const subcategoryById = await prisma.category.findUnique({
      where: { id: subcategoryId },
      select: { id: true, name: true },
    });
    if (!subcategoryById) throw new AppError(400, "Invalid subcategoryId");
    subcategoryName = subcategoryById.name;
  }

  if (!subcategoryId && subcategoryName) {
    const subcategoryByName = await prisma.category.findFirst({
      where: {
        name: { equals: subcategoryName, mode: "insensitive" },
        ...(categoryId ? { parentId: categoryId } : {}),
      },
      select: { id: true, name: true },
    });
    if (subcategoryByName) {
      subcategoryId = subcategoryByName.id;
      subcategoryName = subcategoryByName.name;
    }
  }

  return {
    categoryName: categoryName || "General",
    categoryId: categoryId || null,
    subcategoryName: subcategoryName || "General",
    subcategoryId: subcategoryId || null,
  };
}

export async function list(req: AuthRequest, res: Response) {
  const role = req.user?.role;
  const statusFilter = isAdminRole(role) ? undefined : "published";
  const andFilters: Record<string, unknown>[] = [];
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  if (statusFilter) {
    andFilters.push({ status: statusFilter });
  }

  const categoryQuery = typeof req.query.category === "string" ? req.query.category : undefined;
  const categoryIdQuery = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  if (categoryQuery || categoryIdQuery) {
    const categoryMatches: Record<string, unknown>[] = [];
    if (categoryQuery) {
      categoryMatches.push({ category: { equals: categoryQuery, mode: "insensitive" } });
      categoryMatches.push({ categoryRel: { is: { name: { equals: categoryQuery, mode: "insensitive" } } } });
    }

    if (categoryIdQuery) {
      categoryMatches.push({ categoryId: categoryIdQuery });
      const matchedCategory = await prisma.category.findUnique({
        where: { id: categoryIdQuery },
        select: { name: true },
      });
      if (matchedCategory) {
        categoryMatches.push({ category: matchedCategory.name });
      }
    }

    if (categoryMatches.length) {
      andFilters.push({ OR: categoryMatches });
    }
  }

  if (req.query.subcategory && typeof req.query.subcategory === "string") {
    andFilters.push({ subcategory: req.query.subcategory });
  }

  if (req.query.search && typeof req.query.search === "string") {
    andFilters.push({
      OR: [
        { title: { contains: req.query.search, mode: "insensitive" } },
        { subtitle: { contains: req.query.search, mode: "insensitive" } },
      ],
    });
  }

  if (req.query.difficulty && typeof req.query.difficulty === "string") {
    andFilters.push({ difficulty: req.query.difficulty });
  }

  if (req.query.price && typeof req.query.price === "string") {
    if (req.query.price === "free") andFilters.push({ price: 0 });
    else if (req.query.price === "paid") andFilters.push({ price: { gt: 0 } });
  }

  const featuredQuery = req.query.featured;
  const featuredOnly =
    featuredQuery === "1" || featuredQuery === "true" || featuredQuery === "home";

  const catalogQuery = typeof req.query.catalog === "string" ? req.query.catalog : undefined;
  const premiumCatalogOnly =
    catalogQuery === "premium" || featuredOnly || (!isAdminRole(role) && catalogQuery !== "all");

  if (premiumCatalogOnly) {
    const {
      resolvePublishedPremiumCourseIds,
      resolveFeaturedHomePremiumCourseIds,
    } = await import("../services/productRoutingService.js");
    let premiumCourseIds = await resolvePublishedPremiumCourseIds();
    if (featuredOnly) {
      const featuredIds = await resolveFeaturedHomePremiumCourseIds();
      if (featuredIds.length) {
        const featuredSet = new Set(featuredIds);
        premiumCourseIds = premiumCourseIds.filter((id) => featuredSet.has(id));
      }
    }
    // Landing fallback — never show an empty catalog when published paid courses exist
    if (featuredOnly && premiumCourseIds.length === 0) {
      const fallback = await prisma.course.findMany({
        where: { status: "published", price: { gt: 0 } },
        select: { id: true },
        orderBy: { publishedAt: "desc" },
        take: limit,
      });
      premiumCourseIds = fallback.map((c) => c.id);
    }
    andFilters.push({ id: { in: premiumCourseIds.length ? premiumCourseIds : ["__none__"] } });
  }

  const where = andFilters.length ? { AND: andFilters } : {};

  const courses = await prisma.course.findMany({
    where,
    include: {
      categoryRel: { select: { id: true, name: true, slug: true } },
      instructor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      _count: { select: { enrollments: true, reviews: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // 🚨 DEBUG: Log courses fetch details
  console.log("🎯 COURSES FETCH DEBUG:", {
    userRole: role,
    statusFilter,
    where,
    totalCourses: courses.length,
    courseStatuses: courses.map(c => ({ id: c.id, title: c.title, status: c.status })),
    limit
  });

  res.json({ success: true, courses: courses.map(normalizeCourseCategory) });
}

export async function listMyInstructor(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courses = await prisma.course.findMany({
    where: { instructorId: req.user.id },
    include: {
      categoryRel: { select: { id: true, name: true, slug: true } },
      _count: { select: { enrollments: true, sections: true, reviews: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const universes = await prisma.learningUniverse.findMany({
    where: { instructorId: req.user.id },
    select: {
      id: true,
      sourceProjectId: true,
      structuredData: true,
      status: true,
      bannerUrl: true,
      thumbnail: true,
    },
  });

  const studioEditByCourseId = new Map<string, { learningUniverseId: string; sourceProjectId?: string }>();
  for (const universe of universes) {
    const structured = universe.structuredData as Record<string, unknown> | null;
    const linkedCourseId =
      typeof structured?.linkedCourseId === "string" ? structured.linkedCourseId : undefined;
    if (!linkedCourseId) continue;
    studioEditByCourseId.set(linkedCourseId, {
      learningUniverseId: universe.id,
      sourceProjectId: universe.sourceProjectId ?? undefined,
    });
  }

  const enriched = courses.map((course) => {
    const normalized = normalizeCourseCategory(course);
    const fromAiContent = parseCourseAcademicStudioEdit(course.aiContent);
    const fromUniverse = studioEditByCourseId.get(course.id);
    const academicStudioEdit =
      fromAiContent || fromUniverse
        ? {
            learningUniverseId: fromAiContent?.learningUniverseId ?? fromUniverse?.learningUniverseId,
            sourceProjectId: fromAiContent?.sourceProjectId ?? fromUniverse?.sourceProjectId,
          }
        : null;
    const linkedUniverse = findPremiumUniverseForLinkedCourse(course.id, universes);
    const status = linkedUniverse
      ? resolvePremiumCourseDisplayStatus(course.status, linkedUniverse.status)
      : course.status;
    const bannerUrl = course.bannerUrl || linkedUniverse?.bannerUrl || null;
    const thumbnail = course.thumbnail || linkedUniverse?.thumbnail || bannerUrl;
    return { ...normalized, status, academicStudioEdit, bannerUrl, thumbnail };
  });

  res.json({ success: true, courses: enriched });
}

export async function getOne(req: AuthRequest, res: Response) {
  const id = req.params.id;
  console.log("Course request received:", id, "User:", req.user?.id);
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      categoryRel: true,
      instructor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          lectures: { orderBy: { order: "asc" }, include: { attachments: true } },
        },
      },
      _count: { select: { enrollments: true, reviews: true } },
      enrollments: req.user ? { where: { userId: req.user.id } } : false,
      payments: req.user ? { where: { userId: req.user.id, status: "completed" } } : false,
    },
  });
  if (!course) throw new AppError(404, "Course not found");
  if (course.status !== "published" && req.user?.id !== course.instructorId && !isAdminRole(req.user?.role)) {
    throw new AppError(404, "Course not found");
  }

  // Check if content should be masked for unpaid users
  const isEnrolled = (course as any).enrollments?.length > 0;
  const isPaid = course.price === 0 || (course as any).payments?.length > 0;
  const isInstructor = req.user?.id === course.instructorId;
  const isAdmin = isAdminRole(req.user?.role);

  if (!isInstructor && !isAdmin && (!isEnrolled || !isPaid)) {
    // Mask lecture content/urls if not paid/enrolled
    course.sections.forEach(s => {
      s.lectures.forEach(l => {
        l.videoUrl = null;
        // For notes lectures, preserve the PDF URL but mark as locked
        if (l.type === "notes" && (l.content?.startsWith('/uploads/') || l.content?.startsWith('http'))) {
          // Keep the PDF URL for preview, but the frontend will handle access control
          console.log("🔒 Notes lecture PDF URL preserved for preview:", l.content);
        } else {
          l.content = "Locked Content - Please enroll or purchase to view.";
        }
      });
    });
  }

  res.json({ success: true, course: normalizeCourseCategory(course) });
}

export async function getAIDetails(req: AuthRequest, res: Response) {
  const id = req.params.id;
  try {
    const details = await generateCourseDetails(id);
    res.json({ success: true, details });
  } catch (err: any) {
    throw new AppError(500, err.message || "Failed to generate AI details");
  }
}

export async function create(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = createSchema.parse(req.body);

  const resolvedCategory = await resolveCategoryFields({
    category: data.category,
    categoryId: data.categoryId,
    subcategory: data.subcategory,
    subcategoryId: data.subcategoryId,
  });

  const course = await prisma.course.create({
    data: {
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      price: data.price,
      category: resolvedCategory.categoryName,
      subcategory: resolvedCategory.subcategoryName,
      categoryId: resolvedCategory.categoryId,
      subcategoryId: resolvedCategory.subcategoryId,
      thumbnail: data.thumbnail || data.bannerUrl,
      bannerUrl: data.bannerUrl || data.thumbnail,
      bannerType: data.bannerType,
      difficulty: data.difficulty,
      language: data.language || "en",
      status: data.status || "draft",
      instructorId: req.user.id,
    },
    include: { categoryRel: true },
  });
  res.status(201).json({ success: true, course: normalizeCourseCategory(course) });
}

export async function generateAICourse(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }
  const { title } = req.body;
  if (!title) throw new AppError(400, "Course title is required");

  const aiData = await generateCourseContent(title);

  const course = await prisma.course.create({
    data: {
      title,
      description: aiData.description,
      instructorId: req.user.id,
      status: "draft",
      sections: {
        create: aiData.curriculum.map((section, sIndex) => ({
          title: section.title,
          order: sIndex,
          lectures: {
            create: section.topics.map((topic, lIndex) => {
              const lectureData: any = {
                title: topic.title,
                type: "article",
                content: topic.content,
                order: lIndex,
              };
              if (topic.quiz) {
                lectureData.quiz = {
                  create: {
                    title: `Quiz: ${topic.title}`,
                    description: `A quick assessment on ${topic.title}`,
                    totalMarks: topic.quiz.questions.length,
                    questions: {
                      create: topic.quiz.questions.map((q, qIndex) => ({
                        text: q.text,
                        type: "multiple_choice",
                        marks: 1,
                        order: qIndex,
                        explanation: q.explanation,
                        options: {
                          create: q.options.map((opt, oIndex) => ({
                            text: opt,
                            isCorrect: opt === q.correctAnswer,
                            order: oIndex,
                          })),
                        },
                      })),
                    },
                  },
                };
              }
              return lectureData;
            }),
          },
        })),
      },
    },
    include: {
      sections: {
        include: {
          lectures: {
            include: {
              quiz: {
                include: {
                  questions: {
                    include: {
                      options: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Also trigger landing page generation for the new AI course
  const summary = `Course Title: ${title}. Description: ${aiData.description}. Curriculum: ${aiData.curriculum.map(s => s.title).join(", ")}`;
  const landingData = await generateCourseLandingPage(title, summary);
  await prisma.course.update({
    where: { id: course.id },
    data: { aiLandingData: JSON.stringify(landingData) }
  });

  res.status(201).json({ success: true, course });
}

function buildSectionsFromAuthoringPackage(pkg: AICourseAuthoringPackage) {
  const sections: Array<Record<string, unknown>> = [];

  pkg.curriculum.forEach((mod, si) => {
    const lectures: Array<Record<string, unknown>> = [];

    mod.lessons.forEach((lesson, li) => {
      lectures.push({
        title: lesson.title,
        type: "article",
        content: formatLessonMarkdown(lesson),
        order: li,
      });
    });

    if (mod.moduleQuiz?.questions?.length) {
      lectures.push({
        title: mod.moduleQuiz.title || `${mod.title} Quiz`,
        type: "article",
        order: lectures.length,
        quiz: { create: buildQuizCreateData(mod.moduleQuiz.title || `${mod.title} Quiz`, mod.moduleQuiz.questions) },
      });
    }

    sections.push({
      title: mod.title,
      order: si,
      lectures: { create: lectures },
    });
  });

  // Assessments section
  const assessmentLectures: Array<Record<string, unknown>> = [];
  pkg.assessments.practiceQuestions.forEach((p, i) => {
    assessmentLectures.push({
      title: `Practice: ${p.title}`,
      type: "article",
      content: p.content,
      order: i,
    });
  });
  pkg.assessments.assignments.forEach((a, i) => {
    assessmentLectures.push({
      title: `Assignment: ${a.title}`,
      type: "article",
      content: `## ${a.title}\n\n${a.description}`,
      order: assessmentLectures.length,
    });
  });
  pkg.assessments.codingExercises.forEach((ex, i) => {
    assessmentLectures.push({
      title: `Coding Exercise: ${ex.title}`,
      type: "article",
      content: `## ${ex.title}\n\n${ex.description}\n\n\`\`\`${ex.language}\n${ex.starterCode || ""}\n\`\`\``,
      order: assessmentLectures.length,
    });
  });
  if (assessmentLectures.length) {
    sections.push({ title: "Assessments & Practice", order: sections.length, lectures: { create: assessmentLectures } });
  }

  // Projects section
  const projectLectures = [
    pkg.projects.beginner,
    pkg.projects.intermediate,
    pkg.projects.advanced,
    pkg.projects.capstone,
  ].map((p, i) => ({
    title: `Project: ${p.title}`,
    type: "article",
    content: formatProjectMarkdown(p),
    order: i,
  }));
  if (pkg.projects.githubIdeas?.length) {
    projectLectures.push({
      title: "GitHub & Portfolio Project Ideas",
      type: "article",
      content: `## GitHub Ideas\n${pkg.projects.githubIdeas.map((g) => `- ${g}`).join("\n")}\n\n## Portfolio Projects\n${pkg.projects.portfolioProjects.map((g) => `- ${g}`).join("\n")}\n\n## Industry Projects\n${pkg.projects.industryProjects.map((g) => `- ${g}`).join("\n")}`,
      order: projectLectures.length,
    });
  }
  sections.push({ title: "Projects", order: sections.length, lectures: { create: projectLectures } });

  // Final exam
  if (pkg.assessments.finalExam?.questions?.length) {
    sections.push({
      title: "Final Examination",
      order: sections.length,
      lectures: {
        create: [{
          title: pkg.assessments.finalExam.title,
          type: "article",
          order: 0,
          quiz: {
            create: buildQuizCreateData(
              pkg.assessments.finalExam.title,
              pkg.assessments.finalExam.questions
            ),
          },
        }],
      },
    });
  }

  // Resources
  sections.push({
    title: "Resources & References",
    order: sections.length,
    lectures: {
      create: [{
        title: "Course Resources",
        type: "article",
        content: formatResourcesMarkdown(pkg.resources),
        order: 0,
      }],
    },
  });

  return sections;
}

export async function previewAICourseAuthoring(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }
  const { topic } = req.body as { topic?: string };
  if (!topic?.trim()) throw new AppError(400, "Course topic is required");

  const authoringPackage = await generateFullCourseAuthoringPackage(topic.trim());
  let thumbnailUrl: string | null = null;
  try {
    thumbnailUrl = await generateCourseThumbnail(
      authoringPackage.courseDetails.thumbnailPrompt,
      authoringPackage.courseDetails.title
    );
  } catch {
    /* optional */
  }

  res.json({
    success: true,
    data: {
      authoringPackage,
      thumbnailUrl,
    },
  });
}

export async function createCourseWithAuthoring(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const bodySchema = z.object({
    title: requiredTrimmedString,
    subtitle: optionalTrimmedString,
    description: optionalTrimmedString,
    price: safePriceSchema,
    category: optionalTrimmedString,
    subcategory: optionalTrimmedString,
    thumbnail: optionalTrimmedString,
    difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    language: optionalTrimmedString,
    status: z.enum(["draft", "published", "archived"]).optional(),
    authoringPackage: z.record(z.unknown()),
  });

  const data = bodySchema.parse(req.body);
  const pkg = data.authoringPackage as unknown as AICourseAuthoringPackage;

  const resolvedCategory = await resolveCategoryFields({
    category: data.category,
    subcategory: data.subcategory,
  });

  const sectionsCreate = buildSectionsFromAuthoringPackage(pkg);

  const course = await prisma.course.create({
    data: {
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      price: data.price,
      category: resolvedCategory.categoryName,
      subcategory: resolvedCategory.subcategoryName,
      categoryId: resolvedCategory.categoryId,
      subcategoryId: resolvedCategory.subcategoryId,
      thumbnail: data.thumbnail,
      difficulty: data.difficulty,
      language: data.language || "en",
      status: data.status || "draft",
      instructorId: req.user.id,
      aiContent: JSON.stringify({
        ...pkg,
        courseDetails: {
          ...pkg.courseDetails,
          courseSummary: pkg.courseDetails?.courseSummary,
          seoDescription: pkg.courseDetails?.seoDescription,
          seoKeywords: pkg.courseDetails?.seoKeywords,
        },
      }),
      sections: { create: sectionsCreate },
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
      categoryRel: true,
    },
  });

  const summary = `Course: ${data.title}. ${data.description?.slice(0, 200) || ""}`;
  const landingData = await generateCourseLandingPage(data.title, summary);
  await prisma.course.update({
    where: { id: course.id },
    data: { aiLandingData: JSON.stringify(landingData) },
  });

  res.status(201).json({ success: true, course: normalizeCourseCategory(course) });
}

export async function generateAILandingPage(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }
  const { id } = req.params;

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      sections: {
        include: {
          lectures: {
            include: {
              quiz: {
                include: {
                  questions: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!course) throw new AppError(404, "Course not found");
  if (course.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Unauthorized to generate description for this course");
  }

  // Build a summary of instructor-provided content
  let summary = `Title: ${course.title}. `;
  if (course.subtitle) summary += `Subtitle: ${course.subtitle}. `;
  if (course.description) summary += `Initial Description: ${course.description}. `;

  const sectionSummaries = course.sections.map(s => {
    const lectureTitles = s.lectures.map(l => l.title).join(", ");
    const quizCount = s.lectures.filter(l => l.quiz).length;
    return `Section "${s.title}" has lessons: ${lectureTitles}. It contains ${quizCount} quizzes.`;
  }).join(" ");

  summary += sectionSummaries;

  // Extract skills/questions for context
  const questions = course.sections.flatMap(s => 
    s.lectures.flatMap(l => l.quiz?.questions.map(q => q.text) || [])
  ).slice(0, 10).join("; ");
  
  if (questions) summary += ` Skills tested in quizzes include questions about: ${questions}`;

  const landingData = await generateCourseLandingPage(course.title, summary);

  const updatedCourse = await prisma.course.update({
    where: { id },
    data: { aiLandingData: JSON.stringify(landingData) }
  });

  res.json({ success: true, aiLandingData: landingData });
}

export async function update(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Course not found");
  if (existing.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Not allowed to update this course");
  }
  const data = updateSchema.parse(req.body);
  if (!Object.keys(data).length) {
    throw new AppError(400, "No valid fields provided for update");
  }

  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.subtitle !== undefined) updateData.subtitle = data.subtitle;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
  if (data.bannerUrl !== undefined) updateData.bannerUrl = data.bannerUrl;
  if (data.bannerType !== undefined) updateData.bannerType = data.bannerType;
  if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
  if (data.language !== undefined) updateData.language = data.language;
  if (data.status !== undefined) updateData.status = data.status;

  const isCategoryPatch =
    Object.prototype.hasOwnProperty.call(data, "category") ||
    Object.prototype.hasOwnProperty.call(data, "categoryId") ||
    Object.prototype.hasOwnProperty.call(data, "subcategory") ||
    Object.prototype.hasOwnProperty.call(data, "subcategoryId");

  if (isCategoryPatch) {
    const resolvedCategory = await resolveCategoryFields({
      category: data.category ?? existing.category ?? undefined,
      categoryId: data.categoryId ?? existing.categoryId ?? undefined,
      subcategory: data.subcategory ?? existing.subcategory ?? undefined,
      subcategoryId: data.subcategoryId ?? existing.subcategoryId ?? undefined,
    });

    updateData.category = resolvedCategory.categoryName;
    updateData.categoryId = resolvedCategory.categoryId;
    updateData.subcategory = resolvedCategory.subcategoryName;
    updateData.subcategoryId = resolvedCategory.subcategoryId;
  }

  if (data.status === "published" && existing.status !== "published") {
    updateData.publishedAt = new Date();
  }
  if (data.status === "draft" && existing.status === "published") {
    updateData.publishedAt = null;
  }
  const course = await prisma.course.update({
    where: { id },
    data: updateData,
    include: { categoryRel: true },
  });

  if (data.status === "published" || data.status === "draft") {
    await syncPremiumUniverseStatusFromCourse(id, data.status, req.user.id);
    const { syncProductFromCourse, syncProductOnUnpublish } = await import("../services/productCatalogService.js");
    if (data.status === "published") {
      await syncProductFromCourse(id).catch(() => {});
    } else if (data.status === "draft") {
      await syncProductOnUnpublish({ courseId: id }).catch(() => {});
    }
  }

  // Non-blocking auto-description generation if lectures or title changed
  triggerAutoDescription(id).catch(err => console.error("Auto-description failed", err));

  res.json({ success: true, course: normalizeCourseCategory(course) });
}

export async function getStudentCourse(req: AuthRequest, res: Response) {
  console.log("🎯 STUDENT COURSE API HIT");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("CourseId:", req.params.id);
  console.log("User authenticated:", !!req.user);
  console.log("UserId:", req.user?.id);
  
  const courseId = req.params.id;
  console.log("Student course request received:", courseId, "User:", req.user?.id || "anonymous");

  // 1. VERIFY COURSE EXISTS
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      categoryRel: true,
      instructor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          lectures: { 
            orderBy: { order: "asc" }, 
            select: {
              id: true,
              title: true,
              type: true,
              content: true,
              videoUrl: true,
              videoType: true,
              videoCaptions: true,
              compiledPdfUrl: true,
              duration: true,
              order: true,
              quizId: true,
              createdAt: true,
              updatedAt: true,
              attachments: {
                select: {
                  id: true,
                  name: true,
                  url: true,
                  type: true,
                  size: true
                }
              }
            }
          },
        },
      },
      _count: { select: { enrollments: true, reviews: true } },
    },
  });

  if (!course) {
    console.log("Course not found:", courseId);
    return res.status(404).json({ message: "Course not found" });
  }

  
  if (course.status !== "published" && req.user?.id !== course.instructorId && !isAdminRole(req.user?.role)) {
    return res.status(404).json({ message: "Course not found" });
  }

  // 2. FETCH ENROLLMENT (only if user is authenticated)
  let enrollment = null;
  console.log("🎯 ENROLLMENT CHECK START");
  console.log("USER AUTHENTICATED:", !!req.user);
  console.log("USER ID:", req.user?.id);
  console.log("COURSE ID:", courseId);
  
  if (req.user) {
    enrollment = await prisma.enrollment.findFirst({
      where: {
        courseId,
        userId: req.user.id
      },
      include: {
        progress: {
          include: {
            lectureProgress: true
          }
        }
      }
    });
    console.log("🎯 ENROLLMENT FOUND:", !!enrollment);
    console.log("🎯 ENROLLMENT DATA:", enrollment ? {
      enrollmentId: enrollment.id,
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      progress: enrollment.progress ? {
        percent: enrollment.progress.percent,
        lectureProgressCount: enrollment.progress.lectureProgress.length
      } : null
    } : null);
  } else {
    console.log("🎯 NO USER - ENROLLMENT CHECK SKIPPED");
  }

  // 3. LECTURES DATA (already included in course query)
  const lecturesData = course.sections.flatMap(section => 
    section.lectures.map(lecture => ({
      ...lecture,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionOrder: section.order
    }))
  );

  // 4. PROCESS PROGRESS DATA
  const progressData = enrollment?.progress ? {
    percent: enrollment.progress.percent || 0,
    lectureProgress: enrollment.progress.lectureProgress.map((lp: any) => ({
      lectureId: lp.lectureId,
      completed: lp.completed,
      progressPercent: lp.progressPercent || 0
    }))
  } : [];

  // 6. Access control: enrolled students, instructors, and admins get full content
  const isInstructor = req.user?.id === course.instructorId;
  const isAdmin = isAdminRole(req.user?.role);
  const hasAccess = isInstructor || isAdmin || !!enrollment;

  course.sections.forEach((s: any) => {
    s.lectures.forEach((l: any) => {
      if (!hasAccess && l.type === "video") {
        l.videoUrl = null;
      }
    });
  });

  console.log("API response structure:", {
    course: course.id,
    lectures: lecturesData.length,
    progress: progressData,
    enrollment: enrollment ? "found" : null
  });

  // 7. RETURN EXACT STRUCTURE EXPECTED BY FRONTEND
  res.json({
    success: true,
    course: normalizeCourseCategory(course),
    lectures: lecturesData,
    progress: progressData || [],
    enrollment: enrollment || null
  });
}

/** Instructor preview — sample certificate with real course metadata (no enrollment required). */
export async function previewCourseCertificate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const courseId = req.params.id;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      instructor: { select: { firstName: true, lastName: true } },
    },
  });

  if (!course) throw new AppError(404, "Course not found");

  const isOwner = course.instructorId === req.user.id;
  if (!isOwner && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Not allowed to preview this course certificate");
  }

  const settings = await getPlatformSettings();
  const instructorName = course.instructor
    ? `${course.instructor.firstName} ${course.instructor.lastName}`.trim()
    : "Course Instructor";

  const svc = new PremiumCertificateService();
  const pdfBuffer = await svc.generateCertificate(
    {
      studentName: "Preview Student",
      courseTitle: course.title,
      instructorName,
      completionDate: new Date(),
      certificateId: `PREVIEW-${course.id.slice(0, 8).toUpperCase()}`,
    },
    { settings, previewMode: true }
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="certificate-preview-${course.id}.pdf"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}

export async function downloadCourse(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const courseId = req.params.id;

  // Verify enrollment
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      courseId,
      userId: req.user.id,
    },
  });

  if (!enrollment) {
    throw new AppError(403, "You must be enrolled to download this course");
  }

  // Fetch complete course data
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      instructor: { select: { firstName: true, lastName: true } },
      categoryRel: { select: { name: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          lectures: {
            orderBy: { order: "asc" },
            include: {
              attachments: true,
              quiz: {
                include: {
                  questions: {
                    include: { options: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course) throw new AppError(404, "Course not found");

  // Generate ZIP file with streaming
  const archiver = await import("archiver");
  const path = await import("path");
  const fs = await import("fs");

  const safeTitle = course.title.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const zipFileName = `${safeTitle}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

  const archive = archiver.default("zip", {
    zlib: { level: 9 },
  });

  archive.pipe(res);

  archive.on("error", (err: Error) => {
    console.error("Archive error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate download" });
    }
  });

  // Generate metadata JSON files
  const courseJson = {
    id: course.id,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    instructor: `${course.instructor.firstName} ${course.instructor.lastName}`,
    category: course.categoryRel?.name,
    difficulty: course.difficulty,
    price: course.price,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };

  archive.append(JSON.stringify(courseJson, null, 2), { name: "Metadata/course.json" });

  const modulesJson = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    order: section.order,
    lectureCount: section.lectures.length,
  }));

  archive.append(JSON.stringify(modulesJson, null, 2), { name: "Metadata/modules.json" });

  const lessonsJson = course.sections.flatMap((section) =>
    section.lectures.map((lecture) => ({
      id: lecture.id,
      title: lecture.title,
      type: lecture.type,
      sectionId: section.id,
      sectionTitle: section.title,
      order: lecture.order,
      duration: lecture.duration,
      videoUrl: lecture.videoUrl,
      hasAttachments: lecture.attachments.length > 0,
      hasQuiz: !!lecture.quiz,
    }))
  );

  archive.append(JSON.stringify(lessonsJson, null, 2), { name: "Metadata/lessons.json" });

  // Generate Course Guide PDF (basic text version for now)
  const guideContent = generateCourseGuide(course);
  archive.append(guideContent, { name: "Course Guide.txt" });

  // Process each lecture
  for (const section of course.sections) {
    const sectionDir = `Section_${section.order}_${section.title.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;

    for (const lecture of section.lectures) {
      const lectureDir = `${sectionDir}/Lesson_${lecture.order}_${lecture.title.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;

      // Lecture content
      if (lecture.content) {
        archive.append(lecture.content, { name: `${lectureDir}/content.md` });
      }

      // Video reference
      if (lecture.videoUrl) {
        archive.append(
          `Video URL: ${lecture.videoUrl}\nDuration: ${lecture.duration ? Math.round(lecture.duration / 60) + " minutes" : "Unknown"}`,
          { name: `${lectureDir}/video.txt` }
        );
      }

      // Attachments
      for (const attachment of lecture.attachments) {
        try {
          const filePath = path.join(process.cwd(), "uploads", attachment.url.replace("/uploads/", ""));
          if (fs.existsSync(filePath)) {
            const attachmentName = `${lectureDir}/Attachments/${attachment.name}`;
            archive.file(filePath, { name: attachmentName });
          }
        } catch (err) {
          console.error(`Failed to add attachment ${attachment.name}:`, err);
        }
      }

      // Quiz data
      if (lecture.quiz) {
        const quizData = {
          id: lecture.quiz.id,
          title: lecture.quiz.title,
          description: lecture.quiz.description,
          totalMarks: lecture.quiz.totalMarks,
          questions: lecture.quiz.questions.map((q) => ({
            id: q.id,
            text: q.text,
            type: q.type,
            marks: q.marks,
            explanation: q.explanation,
            options: q.options.map((o) => ({
              id: o.id,
              text: o.text,
              isCorrect: o.isCorrect,
            })),
          })),
        };
        archive.append(JSON.stringify(quizData, null, 2), { name: `${lectureDir}/quiz.json` });
      }
    }
  }

  await archive.finalize();
}

function generateCourseGuide(course: any): string {
  let guide = `COURSE GUIDE\n`;
  guide += `============\n\n`;
  guide += `Title: ${course.title}\n`;
  if (course.subtitle) guide += `Subtitle: ${course.subtitle}\n`;
  guide += `Instructor: ${course.instructor.firstName} ${course.instructor.lastName}\n`;
  if (course.categoryRel) guide += `Category: ${course.categoryRel.name}\n`;
  if (course.difficulty) guide += `Difficulty: ${course.difficulty}\n`;
  if (course.description) guide += `\nDescription:\n${course.description}\n\n`;
  guide += `TABLE OF CONTENTS\n`;
  guide += `==================\n\n`;

  for (const section of course.sections) {
    guide += `${section.order}. ${section.title}\n`;
    for (const lecture of section.lectures) {
      guide += `   ${lecture.order}. ${lecture.title} (${lecture.type})\n`;
    }
    guide += `\n`;
  }

  guide += `\nLESSON CONTENT\n`;
  guide += `===============\n\n`;

  for (const section of course.sections) {
    guide += `## ${section.title}\n\n`;
    for (const lecture of section.lectures) {
      guide += `### ${lecture.title}\n\n`;
      if (lecture.content) {
        guide += `${lecture.content}\n\n`;
      }
      if (lecture.videoUrl) {
        guide += `Video: ${lecture.videoUrl}\n`;
        if (lecture.duration) guide += `Duration: ${Math.round(lecture.duration / 60)} minutes\n`;
        guide += `\n`;
      }
      if (lecture.attachments.length > 0) {
        guide += `Attachments:\n`;
        for (const attachment of lecture.attachments) {
          guide += `- ${attachment.name} (${attachment.type})\n`;
        }
        guide += `\n`;
      }
      if (lecture.quiz) {
        guide += `Quiz: ${lecture.quiz.title}\n`;
        guide += `Questions: ${lecture.quiz.questions.length}\n`;
        guide += `Total Marks: ${lecture.quiz.totalMarks}\n\n`;
      }
    }
  }

  return guide;
}

export async function remove(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const existing = await prisma.course.findUnique({
    where: { id },
    include: {
      sections: {
        include: {
          lectures: {
            include: {
              attachments: true,
              mediaAssets: true
            }
          }
        }
      },
      certificates: true
    }
  });
  if (!existing) throw new AppError(404, "Course not found");
  if (existing.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Not allowed to delete this course");
  }

  const storedUrls: string[] = [];

  if (existing.thumbnail) storedUrls.push(existing.thumbnail);
  if (existing.bannerUrl) storedUrls.push(existing.bannerUrl);

  for (const section of existing.sections) {
    for (const lecture of section.lectures) {
      if (lecture.videoUrl && lecture.videoType === "upload") storedUrls.push(lecture.videoUrl);
      if (lecture.notesPdfUrl) storedUrls.push(lecture.notesPdfUrl);
      if (lecture.compiledPdfUrl) storedUrls.push(lecture.compiledPdfUrl);
      for (const attachment of lecture.attachments) storedUrls.push(attachment.url);
      for (const media of lecture.mediaAssets) storedUrls.push(media.url);
    }
  }

  // Delete database records in transaction first
  await prisma.$transaction(async (tx) => {
    await tx.course.delete({ where: { id } });
  });

  const { deleteStoredPublicPath } = await import("../middlewares/persistUpload.js");
  for (const stored of storedUrls) {
    await deleteStoredPublicPath(stored);
  }

  res.json({ success: true });
}

export async function populateCourseSectionsFromBackingStore(courseId: string) {
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { sections: { include: { lectures: true } } },
    });
    if (!course) return null;
    if (course.sections && course.sections.length > 0) return course;

    let luId: string | undefined;
    if (course.aiContent) {
      try {
        const parsed = JSON.parse(course.aiContent);
        luId = parsed.academicStudio?.learningUniverseId;
      } catch {}
    }

    let lu = luId
      ? await prisma.learningUniverse.findUnique({
          where: { id: luId },
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
        })
      : null;

    if (!lu) {
      const allLus = await prisma.learningUniverse.findMany({
        take: 50,
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
      lu =
        allLus.find((u) => {
          if (u.id === courseId) return true;
          try {
            const st = typeof u.structuredData === "string" ? JSON.parse(u.structuredData) : u.structuredData;
            if (st && st.linkedCourseId === courseId) return true;
          } catch {}
          return u.title.toLowerCase() === course.title.toLowerCase();
        }) || null;
    }

    if (lu && lu.tracks.length > 0) {
      const sectionCreates: any[] = [];
      let sectionOrder = 0;

      for (const track of lu.tracks) {
        for (const mod of track.modules) {
          const lectureCreates: any[] = [];

          for (const lesson of mod.lessons) {
            let contentParts: string[] = [];
            const blocks = lesson.contentBlocks as Array<{ type: string; content: any }> | null;
            if (Array.isArray(blocks) && blocks.length > 0) {
              for (const b of blocks) {
                if (typeof b.content === "string") {
                  contentParts.push(b.content);
                } else if (b.content && typeof b.content === "object") {
                  if (b.content.body) contentParts.push(b.content.body);
                  if (b.content.overview) contentParts.push(`## Overview\n${b.content.overview}`);
                  if (b.content.theory) contentParts.push(`## Detailed Theory\n${b.content.theory}`);
                  if (b.content.instructions) contentParts.push(`## Instructions\n${b.content.instructions}`);
                }
              }
            }

            const rawContent =
              contentParts.join("\n\n").trim() ||
              `## ${lesson.title}\n\nWelcome to this lesson on **${lesson.title}**. Master the concepts and apply them in practice.`;
            const mainContent = sanitizeDslContent(rawContent);

            const primaryVideo = lesson.videos?.[0];
            if (primaryVideo) {
              lectureCreates.push({
                title: lesson.title,
                type: "video",
                content: mainContent,
                videoUrl: primaryVideo.url,
                videoType: primaryVideo.type,
                order: lectureCreates.length,
              });
            } else {
              lectureCreates.push({
                title: lesson.title,
                type: "article",
                content: mainContent,
                order: lectureCreates.length,
              });
            }

            if (lesson.quiz?.questions?.length) {
              lectureCreates.push({
                title: lesson.quiz.title || `${lesson.title} Quiz`,
                type: "article",
                order: lectureCreates.length,
                quiz: {
                  create: {
                    title: lesson.quiz.title || `${lesson.title} Quiz`,
                    totalMarks: lesson.quiz.questions.length,
                    questions: {
                      create: lesson.quiz.questions.map((q, qi) => ({
                        text: q.text,
                        type: "multiple_choice",
                        marks: q.points || 1,
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
                  },
                },
              });
            }

            if (lesson.practice) {
              const codeContent = `## Practice Exercise: ${lesson.practice.title}\n\nLanguage: \`${lesson.practice.language}\`\n\n\`\`\`${lesson.practice.language}\n${lesson.practice.initialCode || ""}\n\`\`\`\n\n**Expected Output:**\n\`\`\`\n${lesson.practice.expectedOutput || ""}\n\`\`\``;
              lectureCreates.push({
                title: `Practice: ${lesson.practice.title}`,
                type: "article",
                content: codeContent,
                order: lectureCreates.length,
              });
            }

            if (lesson.project) {
              const projContent = `# ${lesson.project.title}\n\n**Difficulty:** ${lesson.project.difficulty}\n\n## Description\n${lesson.project.description}\n\n## Instructions\n${lesson.project.instructions}`;
              lectureCreates.push({
                title: `Project: ${lesson.project.title}`,
                type: "article",
                content: projContent,
                order: lectureCreates.length,
              });
            }
          }

          if (lectureCreates.length > 0) {
            sectionCreates.push({
              title: mod.title,
              order: sectionOrder++,
              lectures: { create: lectureCreates },
            });
          }
        }
      }

      if (sectionCreates.length > 0) {
        await prisma.course.update({
          where: { id: courseId },
          data: { sections: { create: sectionCreates } },
        });
      }
    } else {
      let blueprint: any = null;
      if (lu?.structuredData) {
        try {
          const st = typeof lu.structuredData === "string" ? JSON.parse(lu.structuredData) : lu.structuredData;
          blueprint = st?.aiArchitect?.blueprint;
        } catch {}
      }
      if (!blueprint && course.aiContent) {
        try {
          const parsed = JSON.parse(course.aiContent);
          blueprint = parsed?.aiArchitect?.blueprint;
        } catch {}
      }

      if (blueprint && Array.isArray(blueprint.modules)) {
        const sectionCreates: any[] = [];
        for (const [mIdx, mod] of blueprint.modules.entries()) {
          const lectureCreates: any[] = [];
          for (const lesson of mod.lessons || []) {
            const parts: string[] = [];
            if (lesson.introduction) parts.push(`## Introduction\n${lesson.introduction}`);
            if (lesson.objectives?.length) parts.push(`## Learning Objectives\n${lesson.objectives.map((o: string) => `- ${o}`).join("\n")}`);
            if (lesson.theory) parts.push(`## Detailed Theory\n${lesson.theory}`);
            if (lesson.conceptExplanation) parts.push(`## Concept Explanation\n${lesson.conceptExplanation}`);
            if (lesson.realWorldAnalogy) parts.push(`## Real-world Analogy\n${lesson.realWorldAnalogy}`);
            if (lesson.examples) parts.push(`## Worked Examples\n${lesson.examples}`);
            if (lesson.caseStudy) parts.push(`## Case Study\n${lesson.caseStudy}`);
            if (lesson.practice) parts.push(`## Hands-on Practice\n${lesson.practice}`);
            if (lesson.commonMistakes?.length) parts.push(`## Common Mistakes\n${lesson.commonMistakes.map((m: string) => `- ${m}`).join("\n")}`);
            if (lesson.bestPractices?.length) parts.push(`## Best Practices\n${lesson.bestPractices.map((b: string) => `- ${b}`).join("\n")}`);
            if (lesson.summary) parts.push(`## Summary\n${lesson.summary}`);
            if (lesson.keyTakeaways?.length) parts.push(`## Key Takeaways\n${lesson.keyTakeaways.map((k: string) => `- ${k}`).join("\n")}`);

            const mainContent = parts.join("\n\n").trim() || `## ${lesson.title}\n\nComprehensive educational content for ${lesson.title}.`;
            const primaryVideo = lesson.videos?.[0];

            if (primaryVideo) {
              lectureCreates.push({
                title: lesson.title,
                type: "video",
                content: mainContent,
                videoUrl: primaryVideo.url,
                videoType: primaryVideo.type,
                order: lectureCreates.length,
              });
            } else {
              lectureCreates.push({
                title: lesson.title,
                type: "article",
                content: mainContent,
                order: lectureCreates.length,
              });
            }
          }

          if (mod.moduleQuiz?.questions?.length) {
            lectureCreates.push({
              title: mod.moduleQuiz.title || `${mod.title} Assessment`,
              type: "article",
              order: lectureCreates.length,
              quiz: {
                create: {
                  title: mod.moduleQuiz.title || `${mod.title} Assessment`,
                  totalMarks: mod.moduleQuiz.questions.length,
                  questions: {
                    create: mod.moduleQuiz.questions.map((q: any, qi: number) => ({
                      text: q.text,
                      type: "multiple_choice",
                      marks: 1,
                      order: qi,
                      explanation: q.explanation,
                      options: {
                        create: (q.options || []).map((opt: string, oi: number) => ({
                          text: opt,
                          isCorrect: opt === q.correctAnswer,
                          order: oi,
                        })),
                      },
                    })),
                  },
                },
              },
            });
          }

          if (lectureCreates.length > 0) {
            sectionCreates.push({
              title: mod.title,
              order: mIdx,
              lectures: { create: lectureCreates },
            });
          }
        }

        if (sectionCreates.length > 0) {
          await prisma.course.update({
            where: { id: courseId },
            data: { sections: { create: sectionCreates } },
          });
        }
      }
    }
  } catch (err) {
    console.error("[populateCourseSectionsFromBackingStore] Error:", err);
  }
}
