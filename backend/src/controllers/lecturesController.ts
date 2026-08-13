import { isAdminRole } from "../utils/roles.js";
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { buildLectureContentBlocks } from "../services/lectureStructuredContentService.js";

const captionTrackSchema = z.object({
  language: z.string().min(2).max(10),
  label: z.string().min(1),
  url: z.string().min(1),
  default: z.boolean().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["video", "article", "file", "quiz", "notes"]),
  content: z.string().optional(),
  videoUrl: z.string().optional(),
  videoType: z.enum(["youtube", "upload"]).optional(),
  videoCaptions: z.array(captionTrackSchema).optional(),
  duration: z.number().int().min(0).optional(),
  order: z.number().int().min(0).optional(),
  quizId: z.string().optional(),
});

const reorderSchema = z.object({ lectureIds: z.array(z.string()) });

const updateSchema = createSchema.partial();

export async function listBySection(req: AuthRequest, res: Response) {
  const sectionId = req.params.sectionId;
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { course: true } });
  if (!section) throw new AppError(404, "Section not found");
  if (section.course.instructorId !== req.user?.id && !isAdminRole(req.user?.role)) {
    throw new AppError(403, "Forbidden");
  }
  const lectures = await prisma.lecture.findMany({
    where: { sectionId },
    orderBy: { order: "asc" },
    include: { attachments: true, quiz: true },
  });
  res.json({ success: true, lectures });
}

export async function getOne(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const lecture = await prisma.lecture.findUnique({
    where: { id },
    include: {
      section: { 
        include: { 
          course: { 
            include: {
              enrollments: {
                where: { userId: req.user?.id }
              }
            }
          }
        }
      },
      attachments: true,
      quiz: { include: { questions: { include: { options: true } } } },
    },
  });
  if (!lecture) throw new AppError(404, "Lecture not found");
  
  // Check access permissions
  const isInstructor = lecture.section.course.instructorId === req.user?.id;
  const isAdmin = isAdminRole(req.user?.role);
  const isEnrolled = lecture.section.course.enrollments.length > 0;
  const isPublished = lecture.section.course.status === "published";
  
  // Allow access if: instructor, admin, or (published course + enrolled student)
  const canAccess = isInstructor || isAdmin || (isPublished && isEnrolled);
  
  if (!canAccess) throw new AppError(403, "Forbidden");
  
  // For private videos, only return videoUrl if user has access
  const responseLecture = { ...lecture };
  const lectureWithVideoType = lecture as any;
  if (lectureWithVideoType.videoType === "upload" && !isInstructor && !isAdmin) {
    // For enrolled students accessing private videos, keep the videoUrl
    // For non-enrolled users, this would be blocked by the canAccess check above
    responseLecture.videoUrl = lecture.videoUrl;
  }
  
  res.json({ success: true, lecture: responseLecture });
}

export async function getLectureQuiz(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const lecture = await prisma.lecture.findUnique({
    where: { id },
    include: {
      section: { include: { course: true } },
      quiz: { include: { questions: { include: { options: true } } } },
    },
  });
  if (!lecture) throw new AppError(404, "Lecture not found");
  const canAccess =
    lecture.section.course.status === "published" ||
    lecture.section.course.instructorId === req.user?.id ||
    isAdminRole(req.user?.role);
  if (!canAccess) throw new AppError(403, "Forbidden");
  if (!lecture.quiz) throw new AppError(404, "Quiz not found for this lecture");
  res.json({ success: true, quiz: lecture.quiz });
}

export async function create(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sectionId = req.params.sectionId;
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { course: true } });
  if (!section) throw new AppError(404, "Section not found");
  if (section.course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  const data = createSchema.parse(req.body);
  const maxOrder = await prisma.lecture.findFirst({
    where: { sectionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  
  let quizId = data.quizId;
  if (data.type === "quiz" && !quizId) {
    const newQuiz = await prisma.quiz.create({ data: { title: data.title } });
    quizId = newQuiz.id;
  }

  const lecture = await prisma.lecture.create({
    data: {
      sectionId,
      title: data.title,
      type: data.type as "video" | "article" | "file" | "quiz" | "notes",
      content: data.content,
      videoUrl: data.videoUrl,
      videoType: data.videoType,
      videoCaptions: data.videoCaptions,
      duration: data.duration,
      order: data.order ?? (maxOrder?.order ?? 0) + 1,
      quizId: quizId,
    } as any,
    include: { attachments: true },
  });
  res.status(201).json({ success: true, lecture });
}

export async function update(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const lecture = await prisma.lecture.findUnique({ where: { id }, include: { section: { include: { course: true } } } });
  if (!lecture) throw new AppError(404, "Lecture not found");
  if (lecture.section.course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  const data = updateSchema.parse(req.body);
  const updated = await prisma.lecture.update({
    where: { id },
    data: data as Record<string, unknown>,
    include: { attachments: true },
  });
  res.json({ success: true, lecture: updated });
}

export async function remove(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const lecture = await prisma.lecture.findUnique({ where: { id }, include: { section: { include: { course: true } } } });
  if (!lecture) throw new AppError(404, "Lecture not found");
  if (lecture.section.course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  await prisma.lecture.delete({ where: { id } });
  res.json({ success: true });
}

export async function reorder(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sectionId = req.params.sectionId;
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { course: true } });
  if (!section || (section.course.instructorId !== req.user.id && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }
  const { lectureIds } = reorderSchema.parse(req.body);
  await prisma.$transaction(
    lectureIds.map((id, index) => prisma.lecture.update({ where: { id }, data: { order: index } }))
  );
  const lectures = await prisma.lecture.findMany({
    where: { sectionId },
    orderBy: { order: "asc" },
    include: { attachments: true, quiz: true },
  });
  res.json({ success: true, lectures });
}

export async function getLectureNotes(req: AuthRequest, res: Response) {
  const id = req.params.id;
  console.log("🔍 NOTES API HIT - Lecture ID:", id);
  console.log("🔍 USER:", req.user?.id, "Role:", req.user?.role);
  
  const lecture = await prisma.lecture.findUnique({
    where: { id },
    include: {
      section: { include: { course: true } },
    },
  });
  
  console.log("🔍 LECTURE FOUND:", !!lecture);
  if (lecture) {
    console.log("🔍 LECTURE TITLE:", lecture.title);
    console.log("🔍 LECTURE TYPE:", lecture.type);
    console.log("🔍 LECTURE CONTENT:", lecture.content ? "HAS CONTENT" : "NO CONTENT");
    console.log("🔍 LECTURE PDF URL:", lecture.compiledPdfUrl);
  }
  
  if (!lecture) {
    console.log("❌ LECTURE NOT FOUND");
    throw new AppError(404, "Lecture not found");
  }
  
  // Check if user can access lecture notes
  let canAccess = false;
  
  // Admin can always access
  if (isAdminRole(req.user?.role)) {
    canAccess = true;
  }
  // Course instructor can always access
  else if (lecture.section.course.instructorId === req.user?.id) {
    canAccess = true;
  }
  // Any instructor can access for debugging
  else if (req.user?.role === "instructor") {
    canAccess = true;
    console.log("🔧 DEBUG: Allowing instructor access for debugging");
  }
  // Students can access if enrolled or course is published
  else if (req.user?.role === "student") {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        courseId: lecture.section.courseId,
        userId: req.user.id
      }
    });
    canAccess = !!enrollment || lecture.section.course.status === "published";
  }
  
  if (!canAccess) throw new AppError(403, "Forbidden");
  
  // Return actual lecture data with content and compiledPdfUrl
  res.json({ 
    success: true, 
    lecture: {
      id: lecture.id,
      title: lecture.title,
      content: lecture.content || "",
      compiledPdfUrl: lecture.compiledPdfUrl,
      type: lecture.type,
      updatedAt: lecture.updatedAt
    }
  });
}

export async function updateLectureNotes(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const lecture = await prisma.lecture.findUnique({
    where: { id },
    include: { section: { include: { course: true } } },
  });
  if (!lecture) throw new AppError(404, "Lecture not found");
  if (lecture.section.course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  
  const { content } = req.body;
  const updated = await prisma.lecture.update({
    where: { id },
    data: { 
      content,
      updatedAt: new Date()
    },
    select: {
      id: true,
      title: true,
      content: true,
      updatedAt: true
    }
  });
  
  res.json({ success: true, lecture: updated });
}

export async function attachNotes(req: AuthRequest, res: Response) {
  console.log("🔗 ATTACH NOTES REQUEST:", {
    lectureId: req.params.lectureId,
    userId: req.user?.id,
    userRole: req.user?.role,
    userEmail: req.user?.email,
    body: req.body
  });
  
  console.log("🚨 CRITICAL AUTH DEBUG - User Details:", {
    id: req.user?.id,
    email: req.user?.email,
    role: req.user?.role,
    firstName: req.user?.firstName,
    lastName: req.user?.lastName,
    headers: req.headers.authorization ? "Token present" : "No token"
  });

  if (!req.user) throw new AppError(401, "Unauthorized");
  const lectureId = req.params.lectureId;
  
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: { section: { include: { course: true } } },
  });
  if (!lecture) {
    console.log("🔗 Lecture not found:", lectureId);
    throw new AppError(404, "Lecture not found");
  }
  // Allow course instructor, admin, or any instructor (for debugging)
  if (lecture.section.course.instructorId !== req.user.id && !isAdminRole(req.user.role) && req.user.role !== "instructor") {
    console.log("🔗 Forbidden - only course instructor or admin can attach notes:", {
      lectureInstructorId: lecture.section.course.instructorId,
      userId: req.user.id,
      userRole: req.user.role
    });
    throw new AppError(403, "Forbidden - Only course instructor can attach notes");
  }
  
  if (req.user.role === "instructor" && lecture.section.course.instructorId !== req.user.id) {
    console.log("🔧 DEBUG: Allowing non-course instructor to attach notes for debugging");
  }
  
  const { fileUrl } = req.body;
  if (!fileUrl || typeof fileUrl !== "string") {
    console.log("🔗 Invalid fileUrl:", fileUrl);
    throw new AppError(400, "fileUrl is required and must be a string");
  }
  
  // Convert full URL to relative path for LaTeX compatibility
  const relativeUrl = fileUrl.replace(/https?:\/\/[^\/]+/, '');
  
  console.log("🔗 Updating lecture:", {
    lectureId,
    originalUrl: fileUrl,
    relativeUrl
  });
  
  // Store PDF URL in compiledPdfUrl field - NEVER overwrite content!
  console.log("🔗 CRITICAL FIX: Preserving LaTeX content, storing PDF in compiledPdfUrl");
  const updated = await prisma.lecture.update({
    where: { id: lectureId },
    data: { 
      compiledPdfUrl: relativeUrl, // Store PDF URL in compiledPdfUrl field - DO NOT TOUCH content!
      updatedAt: new Date()
    },
    select: {
      id: true,
      title: true,
      content: true,
      compiledPdfUrl: true,
      updatedAt: true
    }
  });
  
  console.log("🔗 Lecture updated successfully:", updated);
  res.json({ success: true, lecture: updated });
}

export async function getStructuredContent(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const lecture = await prisma.lecture.findUnique({
    where: { id },
    include: {
      section: { include: { course: true } },
      mediaAssets: { orderBy: { createdAt: "asc" } },
      attachments: true,
      quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
    },
  });

  if (!lecture) throw new AppError(404, "Lecture not found");

  const course = lecture.section.course;
  const isOwner = req.user?.id === course.instructorId;
  const isAdmin = isAdminRole(req.user?.role);
  let hasAccess = isOwner || isAdmin;

  if (req.user && !hasAccess) {
    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: req.user.id, courseId: course.id },
    });
    hasAccess = !!enrollment;
  }

  if (!hasAccess && course.status !== "published") {
    throw new AppError(403, "Forbidden");
  }

  const blocks = buildLectureContentBlocks(lecture as Parameters<typeof buildLectureContentBlocks>[0]);

  res.json({
    success: true,
    lecture: {
      id: lecture.id,
      title: lecture.title,
      type: lecture.type,
    },
    blocks,
  });
}
