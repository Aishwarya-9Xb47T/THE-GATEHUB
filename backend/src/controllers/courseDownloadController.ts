import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import archiver from "archiver";
import path from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";
import {
  sanitizeFilename,
  shortenRootFolder,
  shortenModuleName,
  shortenLessonName,
  shortenResourceName,
  validateAndShortenPath
} from "../services/courseDownloadService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function downloadCoursePackage(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.id;

  // 1. Fetch course data with all details
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      instructor: { select: { firstName: true, lastName: true, avatar: true } },
      categoryRel: true,
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
                    orderBy: { order: "asc" },
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

  // 2. Check if user is enrolled, instructor, or admin
  const isInstructor = req.user.id === course.instructorId;
  const isAdmin = isAdminRole(req.user.role);
  let isEnrolled = false;

  if (!isInstructor && !isAdmin) {
    const enrollment = await prisma.enrollment.findFirst({
      where: { courseId, userId: req.user.id },
    });
    if (!enrollment) throw new AppError(403, "Not enrolled in this course");
    isEnrolled = true;
  }

  const folderName = shortenRootFolder(course.title);

  // 3. Set headers for ZIP download
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${folderName}.zip"`);

  // 4. Initialize archiver
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  // 5. Add files to ZIP

  // --- Cover Page ---
  const coverPageHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>${course.title} - Course Package</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: auto; }
    h1 { color: #111; border-bottom: 2px solid #0070f3; padding-bottom: 10px; }
    .info { color: #555; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>${course.title}</h1>
  <p class="info">Instructor: ${course.instructor.firstName} ${course.instructor.lastName}</p>
  ${course.subtitle ? `<p class="info">Subtitle: ${course.subtitle}</p>` : ""}
  ${course.description ? `<p class="info">${course.description}</p>` : ""}
  ${course.category ? `<p class="info">Category: ${course.category}</p>` : ""}
  ${course.difficulty ? `<p class="info">Difficulty: ${course.difficulty}</p>` : ""}
  <hr />
  <h2>Table of Contents</h2>
  <ul>
    ${course.sections.map((section, sIndex) => `
      <li>
        <strong>${section.title}</strong>
        <ul>
          ${section.lectures.map((lecture) => `<li>${lecture.title}</li>`).join("")}
        </ul>
      </li>
    `).join("")}
  </ul>
</body>
</html>
`;
  archive.append(coverPageHtml, { name: validateAndShortenPath(`${folderName}/00-Cover-Page.html`) });

  // --- Sections & Lectures ---
  for (let sectionIndex = 0; sectionIndex < course.sections.length; sectionIndex++) {
    const section = course.sections[sectionIndex];
    const sectionPath = shortenModuleName(sectionIndex, section.title);

    for (let lectureIndex = 0; lectureIndex < section.lectures.length; lectureIndex++) {
      const lecture = section.lectures[lectureIndex];
      const lessonPath = `${sectionPath}/${shortenLessonName(lectureIndex, lecture.title)}`;

      // Lecture notes (if content exists)
      if (lecture.content) {
        // Try to convert to HTML if it's Markdown-like
        let lectureHtml = lecture.content;
        if (!lecture.content.includes("<html") && !lecture.content.includes("<HTML")) {
          try {
            lectureHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>${lecture.title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 30px; max-width: 800px; margin: auto; line-height: 1.6; }
    h1, h2, h3 { color: #111; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>${lecture.title}</h1>
  ${await marked(lecture.content)}
</body>
</html>
`;
          } catch (err) {
            lectureHtml = lecture.content;
          }
        }
        archive.append(lectureHtml, { name: validateAndShortenPath(`${folderName}/${lessonPath}/Notes.html`) });
      }

      // Lecture attachments
      if (lecture.attachments.length > 0) {
        for (let i = 0; i < lecture.attachments.length; i++) {
          const attachment = lecture.attachments[i];
          try {
            const resolvedPath = path.resolve(__dirname, "../../", attachment.url.replace(/^\//, ""));
            const shortName = shortenResourceName("resource", i, attachment.name);
            archive.file(resolvedPath, { name: validateAndShortenPath(`${folderName}/${lessonPath}/Attachments/${shortName}`) });
          } catch (err) {
            console.error("Error adding attachment:", err);
          }
        }
      }

      // Quiz (if any)
      if (lecture.quiz) {
        const quizContent = `
# ${lecture.quiz.title}
${lecture.quiz.description ? `\n${lecture.quiz.description}` : ""}

## Questions
${lecture.quiz.questions.map((q, qi) => {
  const options = q.options.map((opt, oi) => `- ${opt.text}${opt.isCorrect ? " [CORRECT]" : ""}`).join("\n");
  return `
### Q${qi + 1}: ${q.text}
\n${options}
\n**Explanation:** ${q.explanation || "N/A"}
\n**Marks:** ${q.marks}
  `.trim();
}).join("\n\n")}
`;
        archive.append(quizContent, { name: validateAndShortenPath(`${folderName}/${lessonPath}/Quiz.md`) });
      }
    }
  }

  // --- Resources Folder ---
  // (We'll skip for now if no dedicated resource folder, but the attachments are already in each lecture)

  // Finalize the archive
  await archive.finalize();
}
