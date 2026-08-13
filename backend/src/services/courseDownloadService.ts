import { prisma } from "../utils/prisma.js";
import { marked } from "marked";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { renderUniversalBlockToHtml } from "./luDocumentHtmlRenderer.js";
import { stringifyExportValue } from "./quizReporting/contentSerialize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

export interface CourseDownloadData {
  course: any;
  sections: any[];
  instructor: any;
  category: any;
  enrollments: any[];
}

export interface LearningUniverseDownloadData {
  universe: any;
  tracks: any[];
  instructor: any;
  category: any;
  enrollments: any[];
}

export async function verifyCourseAccess(courseId: string, userId: string, userRole: string): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true, price: true },
  });

  if (!course) return false;

  const isInstructor = course.instructorId === userId;
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  if (isInstructor || isAdmin) return true;

  const enrollment = await prisma.enrollment.findFirst({
    where: { courseId, userId },
    include: { progress: { select: { percent: true } } },
  });

  if (!enrollment) return false;

  if (course.price === 0) return true;

  const payment = await prisma.payment.findFirst({
    where: { courseId, userId, status: "completed" },
  });

  return !!payment;
}

/** Students may download the complete ZIP only after finishing the course. Instructors/admins always allowed. */
export async function verifyCourseDownloadEligibility(
  courseId: string,
  userId: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string }> {
  const hasAccess = await verifyCourseAccess(courseId, userId, userRole);
  if (!hasAccess) return { allowed: false, reason: "You do not have access to this course." };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true },
  });
  if (!course) return { allowed: false, reason: "Course not found." };
  if (course.instructorId === userId || userRole === "admin" || userRole === "super_admin") {
    return { allowed: true };
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { courseId, userId },
    include: { progress: { select: { percent: true } } },
  });
  let completed = Boolean(enrollment?.isCompleted || (enrollment?.progress?.percent ?? 0) >= 100);

  // Architect courses: completion lives on the linked Learning Universe enrollment.
  if (!completed) {
    const { resolveCanonicalUniverseId } = await import("./learnerScopeService.js");
    const luId = await resolveCanonicalUniverseId(courseId);
    if (luId) {
      const luEnrollment = await prisma.learningUniverseEnrollment.findFirst({
        where: { learningUniverseId: luId, userId },
        include: { progress: { select: { percentComplete: true } } },
      });
      completed = Boolean(
        luEnrollment?.isCompleted || (luEnrollment?.progress?.percentComplete ?? 0) >= 100
      );
    }
  }

  if (!completed) {
    return { allowed: false, reason: "Complete the course to unlock the downloadable course package." };
  }
  return { allowed: true };
}

export async function verifyLearningUniverseAccess(universeId: string, userId: string, userRole: string): Promise<boolean> {
  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    select: { instructorId: true, price: true },
  });

  if (!universe) return false;

  const isInstructor = universe.instructorId === userId;
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  if (isInstructor || isAdmin) return true;

  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: universeId, userId },
  });

  if (!enrollment) return false;

  if (universe.price === 0) return true;

  const payment = await prisma.payment.findFirst({
    where: { learningUniverseId: universeId, userId, status: "completed" },
  });

  return !!payment;
}

export async function verifyLearningUniverseDownloadEligibility(
  universeId: string,
  userId: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string }> {
  const hasAccess = await verifyLearningUniverseAccess(universeId, userId, userRole);
  if (!hasAccess) return { allowed: false, reason: "You do not have access to this course." };

  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    select: { instructorId: true },
  });
  if (!universe) return { allowed: false, reason: "Learning Universe not found." };
  if (universe.instructorId === userId || userRole === "admin" || userRole === "super_admin") {
    return { allowed: true };
  }

  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: universeId, userId },
    include: { progress: { select: { percentComplete: true } } },
  });
  const completed = Boolean(
    enrollment?.isCompleted || (enrollment?.progress?.percentComplete ?? 0) >= 100
  );
  if (!completed) {
    return { allowed: false, reason: "Complete the course to unlock the downloadable course package." };
  }
  return { allowed: true };
}

export async function fetchCompleteCourseData(courseId: string, userId?: string): Promise<CourseDownloadData> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      instructor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      categoryRel: true,
      sections: {
        orderBy: { order: "asc" },
        include: {
          lectures: {
            orderBy: { order: "asc" },
            include: {
              attachments: true,
              mediaAssets: true,
              latexProject: true,
              quiz: {
                include: {
                  questions: {
                    include: { options: true },
                    orderBy: { order: "asc" },
                  },
                },
              },
              notes: userId ? {
                where: { userId },
              } : true,
            },
          },
        },
      },
    },
  });

  if (!course) throw new Error("Course not found");

  return {
    course,
    sections: course.sections,
    instructor: course.instructor,
    category: course.categoryRel,
    enrollments: [],
  };
}

export async function fetchCompleteLearningUniverseData(universeId: string): Promise<LearningUniverseDownloadData> {
  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    include: {
      instructor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      categoryRel: true,
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
    },
  });

  if (!universe) throw new Error("Learning Universe not found");

  return {
    universe,
    tracks: universe.tracks,
    instructor: universe.instructor,
    category: universe.categoryRel,
    enrollments: [],
  };
}

export function getLocalFileUri(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname.startsWith("/uploads/")) {
        url = urlObj.pathname;
      } else {
        return url;
      }
    } catch {
      return url;
    }
  }
  let cleanPath = url.replace(/^\//, "");
  if (cleanPath.startsWith("uploads/")) {
    cleanPath = cleanPath.replace(/^uploads\//, "");
  }
  const absolutePath = path.join(process.cwd(), UPLOAD_DIR, cleanPath);
  if (fs.existsSync(absolutePath)) {
    return `file:///${absolutePath.replace(/\\/g, "/")}`;
  }
  return "";
}

export function resolveContentImagesForPdf(content: string): string {
  if (!content) return "";
  const uploadsRegex = /(\/uploads\/[^\s\)]+)/g;
  return content.replace(uploadsRegex, (match) => {
    if (match.startsWith("file://") || match.startsWith("http://") || match.startsWith("https://")) {
      return match;
    }
    const uri = getLocalFileUri(match);
    return uri || match;
  });
}

/**
 * Convert lesson/project text (string or structured JSON) into safe HTML.
 * Never emits "[object Object]".
 */
export function compileInlineContent(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
    try {
      return marked.parse(trimmed, { async: false }) as string;
    } catch {
      return `<p>${escapeHtml(trimmed)}</p>`;
    }
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `<p>${String(value)}</p>`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => compileInlineContent(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.html === "string") return o.html;
    if (typeof o.markdown === "string") return compileInlineContent(o.markdown);
    if (typeof o.body === "string") return compileInlineContent(o.body);
    if (typeof o.text === "string") return compileInlineContent(o.text);
    if (typeof o.content === "string") return compileInlineContent(o.content);
    if (o.latex != null) return `<p><code>${escapeHtml(String(o.latex))}</code></p>`;
    if (o.code != null) {
      const lang = o.language ? String(o.language) : "code";
      return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(String(o.code))}</code></pre>`;
    }
    if (Array.isArray(o.headers) || Array.isArray(o.rows)) {
      return `<pre>${escapeHtml(stringifyExportValue(o))}</pre>`;
    }
    return `<pre>${escapeHtml(stringifyExportValue(o))}</pre>`;
  }
  return `<p>${escapeHtml(stringifyExportValue(value))}</p>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderQuizToHtml(quiz: any): string {
  if (!quiz) return "";
  let html = `<div class="block-container quiz-block">`;
  html += `<h4>Quiz: ${quiz.title}</h4>`;
  if (quiz.description) html += `<p>${quiz.description}</p>`;
  
  if (quiz.questions && quiz.questions.length > 0) {
    quiz.questions.forEach((q: any, qi: number) => {
      html += `
        <div class="question-block">
          <p><strong>Q${qi + 1}: ${q.text}</strong> <span style="font-size:0.8rem; color:#6b7280;">(${q.marks || q.points || 1} Marks, ${q.difficulty || "N/A"})</span></p>
          <ul class="option-list">
      `;
      if (q.options && q.options.length > 0) {
        q.options.forEach((opt: any) => {
          const isCorr = opt.isCorrect ? " option-correct" : "";
          const checkIcon = opt.isCorrect ? "☑" : "☐";
          html += `<li class="option-item${isCorr}">${checkIcon} ${opt.text}</li>`;
        });
      }
      html += `</ul>`;
      if (q.explanation) {
        html += `<div class="explanation"><strong>Explanation:</strong> ${q.explanation}</div>`;
      }
      html += `</div>`;
    });
  }
  html += `</div>`;
  return html;
}

function renderProjectToHtml(project: any): string {
  if (!project) return "";
  let html = `<div class="block-container project-block">`;
  html += `<h4>Project: ${project.title}</h4>`;
  if (project.description) html += `<h5>Description</h5><p>${compileInlineContent(project.description)}</p>`;
  if (project.instructions) html += `<h5>Instructions</h5><div>${compileInlineContent(project.instructions)}</div>`;
  if (project.expectedOutput) html += `<h5>Expected Output</h5><p>${project.expectedOutput}</p>`;
  if (project.successCriteria) html += `<h5>Success Criteria</h5><p>${project.successCriteria}</p>`;
  
  let links = [];
  if (project.colabUrl) links.push(`<a href="${project.colabUrl}">Google Colab</a>`);
  if (project.githubUrl) links.push(`<a href="${project.githubUrl}">GitHub Repository</a>`);
  if (links.length > 0) {
    html += `<h5>Project Links</h5><p>${links.join(" | ")}</p>`;
  }
  html += `</div>`;
  return html;
}

function renderContentBlockToHtml(block: any): string {
  const content = block.content || {};
  switch (block.type) {
    case "overview":
      return `<div class="lesson-body">${compileInlineContent(resolveContentImagesForPdf(String(block.content || "")))}</div>`;
    case "theory":
      return `<div class="theory-block"><h4>${content.title || "Theory"}</h4><div>${compileInlineContent(resolveContentImagesForPdf(content.body || content.content || content.text || ""))}</div></div>`;
    case "note":
      return `<div class="callout callout-note"><strong>Note:</strong> ${compileInlineContent(resolveContentImagesForPdf(content.content || content.text || ""))}</div>`;
    case "tip":
      return `<div class="callout callout-tip"><strong>Tip:</strong> ${compileInlineContent(resolveContentImagesForPdf(content.content || content.text || ""))}</div>`;
    case "warning":
      return `<div class="callout callout-warning"><strong>Warning:</strong> ${compileInlineContent(resolveContentImagesForPdf(content.content || content.text || ""))}</div>`;
    case "summary":
      return `<div class="callout callout-summary"><strong>Summary:</strong> ${compileInlineContent(resolveContentImagesForPdf(content.content || content.text || ""))}</div>`;
    case "keypoints":
      return `<div class="block-container keypoints-block"><h5>Key Points</h5><ul>${(content.content || content.text || "").split(/[,;\n]/).map((p: string) => p.trim()).filter(Boolean).map((p: string) => `<li>${p}</li>`).join("")}</ul></div>`;
    case "codeexample":
      return `<div class="block-container code-block"><h5>Code Example (${content.language || "code"})</h5><pre><code>${content.code || ""}</code></pre>${content.output ? `<p><strong>Expected Output:</strong></p><pre><code>${content.output}</code></pre>` : ""}</div>`;
    case "image":
      const imgUri = getLocalFileUri(content.file || block.src || block.url);
      return `<div style="text-align: center; margin: 20px 0;">
        ${imgUri ? `<img src="${imgUri}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);" />` : ""}
        ${content.caption ? `<p style="font-style: italic; font-size: 0.9rem; color: #4b5563;">${content.caption}</p>` : ""}
      </div>`;
    case "video":
      return `<div class="block-container video-block"><strong>🎥 Video: ${content.title || block.title || "Video Lecture"}</strong> (${content.type || block.videoType || "External"})</div>`;
    case "practice":
      return `<div class="block-container practice-block">
        <h5>Coding Practice: ${content.title || "Practice Exercise"}</h5>
        <p>Language: <code>${content.language}</code></p>
        <p><strong>Exercise:</strong></p>
        <pre><code>${content.initialCode}</code></pre>
        ${content.hints ? `<p><em>Hint: ${content.hints}</em></p>` : ""}
      </div>`;
    case "quiz":
      return renderQuizToHtml(content);
    case "project":
      return renderProjectToHtml(content);
    case "assignment":
      return `<div class="block-container assignment-block">
        <h5>Assignment: ${content.title || "Lesson Assignment"}</h5>
        <p><strong>Points:</strong> ${content.points || "100"}</p>
        <div>${compileInlineContent(content.instructions || "")}</div>
      </div>`;
    case "resource":
    case "download":
      return `<div class="block-container resource-block"><strong>🔗 Downloadable Resource:</strong> <a href="${content.url}">${content.title || "Resource Link"}</a></div>`;
    case "checkpoint":
      return `<div class="callout callout-note" style="border-left-color: #8b5cf6;"><strong>Checkpoint:</strong> ${content.title || "Section Checkpoint"}</div>`;
    case "finalexam":
      return `<div class="block-container exam-block">
        <h5>Final Exam: ${content.title || "Course Final Exam"}</h5>
        <p>Duration: ${content.duration || "N/A"}</p>
        <p>${content.description || ""}</p>
      </div>`;
    default:
      return "";
  }
}

export async function generateCourseGuidePdf(data: CourseDownloadData | LearningUniverseDownloadData, isLearningUniverse: boolean = false): Promise<Buffer> {
  const isLU = isLearningUniverse;
  const title = isLU ? (data as LearningUniverseDownloadData).universe.title : (data as CourseDownloadData).course.title;
  const subtitle = isLU ? (data as LearningUniverseDownloadData).universe.subtitle : (data as CourseDownloadData).course.subtitle;
  const instructor = isLU ? (data as LearningUniverseDownloadData).instructor : (data as CourseDownloadData).instructor;
  const description = isLU ? (data as LearningUniverseDownloadData).universe.description : (data as CourseDownloadData).course.description;
  const difficulty = isLU ? (data as LearningUniverseDownloadData).universe.difficulty : (data as CourseDownloadData).course.difficulty;
  const category = isLU ? (data as LearningUniverseDownloadData).category : (data as CourseDownloadData).category;
  const bannerUrl = isLU ? (data as LearningUniverseDownloadData).universe.bannerUrl : (data as CourseDownloadData).course.bannerUrl;

  const bannerUri = getLocalFileUri(bannerUrl);

  let objectives: string[] = [];
  let skills: string[] = [];
  let prerequisites: string[] = [];
  let duration = "";

  if (isLU) {
    const lu = (data as LearningUniverseDownloadData).universe;
    if (lu.structuredData) {
      try {
        const sd = typeof lu.structuredData === "string" ? JSON.parse(lu.structuredData) : lu.structuredData;
        objectives = sd.learningOutcomes || sd.outcomes || [];
        skills = sd.skills || [];
        prerequisites = sd.prerequisites || [];
      } catch {}
    }
    if (objectives.length === 0 && lu.description) {
      objectives = [lu.description];
    }
    let totalHours = 0;
    (data as LearningUniverseDownloadData).tracks.forEach((t: any) => {
      t.modules.forEach((m: any) => {
        totalHours += m.estimatedHours || 0;
      });
    });
    duration = totalHours > 0 ? `${totalHours} Hours` : "Self-paced";
  } else {
    const c = (data as CourseDownloadData).course;
    if (c.aiContent) {
      try {
        const ai = JSON.parse(c.aiContent);
        objectives = ai.whatYouWillLearn || [];
        skills = ai.skills || [];
        prerequisites = ai.requirements || [];
      } catch {}
    }
    let totalSec = 0;
    (data as CourseDownloadData).sections.forEach((s: any) => {
      s.lectures.forEach((l: any) => {
        totalSec += l.duration || 0;
      });
    });
    duration = totalSec > 0 ? `${Math.ceil(totalSec / 3600)} Hours` : "Self-paced";
  }

  let contentHtml = "";

  // 1. Cover Page
  contentHtml += `
    <div class="cover-page">
      ${bannerUri ? `<div class="banner"><img class="banner-img" src="${bannerUri}" /></div>` : `<div class="banner-fallback"></div>`}
      <h1 class="title">${title}</h1>
      ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}
      <p class="instructor">Created by <strong>${instructor.firstName} ${instructor.lastName}</strong></p>
      
      <div class="metadata-grid">
        <div class="meta-item">
          <div class="meta-label">Category</div>
          <div class="meta-value">${category?.name || "General"}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Difficulty</div>
          <div class="meta-value">${difficulty || "Intermediate"}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Duration</div>
          <div class="meta-value">${duration}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Platform</div>
          <div class="meta-value">THE GATEHUB</div>
        </div>
      </div>
      
      ${description ? `
      <div class="cover-description">
        <h3>Course Overview</h3>
        <p>${description}</p>
      </div>` : ""}
      
      ${objectives.length > 0 ? `
      <div class="learning-objectives">
        <h3>What You Will Learn</h3>
        <ul>
          ${objectives.map(o => `<li>${o}</li>`).join("")}
        </ul>
      </div>` : ""}

      ${skills.length > 0 ? `
      <div class="skills-acquired">
        <h3>Skills Acquired</h3>
        <div class="skills-badges">
          ${skills.map(s => `<span class="badge">${s}</span>`).join("")}
        </div>
      </div>` : ""}

      ${prerequisites.length > 0 ? `
      <div class="prerequisites">
        <h3>Prerequisites</h3>
        <ul>
          ${prerequisites.map(p => `<li>${p}</li>`).join("")}
        </ul>
      </div>` : ""}
    </div>
  `;

  // 2. Table of Contents
  contentHtml += `
    <div class="toc-page">
      <h2 class="toc-title">Table of Contents</h2>
      <ul class="toc-list">
  `;
  if (isLU) {
    const luData = data as LearningUniverseDownloadData;
    luData.tracks.forEach((track: any, ti: number) => {
      contentHtml += `<li class="toc-track"><strong>Track ${ti + 1}: ${track.title}</strong><ul>`;
      track.modules.forEach((mod: any, mi: number) => {
        contentHtml += `<li class="toc-module">Module ${mi + 1}: ${mod.title}<ul>`;
        mod.lessons.forEach((lesson: any, li: number) => {
          contentHtml += `<li class="toc-lesson">${lesson.title}</li>`;
        });
        contentHtml += `</ul></li>`;
      });
      contentHtml += `</ul></li>`;
    });
  } else {
    const courseData = data as CourseDownloadData;
    courseData.sections.forEach((section: any, si: number) => {
      contentHtml += `<li class="toc-track"><strong>Section ${si + 1}: ${section.title}</strong><ul>`;
      section.lectures.forEach((lecture: any) => {
        contentHtml += `<li class="toc-lesson">${lecture.title}</li>`;
      });
      contentHtml += `</ul></li>`;
    });
  }
  contentHtml += `
      </ul>
    </div>
  `;

  // 3. Export Course Material
  if (isLU) {
    const luData = data as LearningUniverseDownloadData;
    luData.tracks.forEach((track, ti) => {
      contentHtml += `<div class="track-header"><h1>Track ${ti + 1}: ${track.title}</h1>`;
      if (track.description) contentHtml += `<p class="track-desc">${track.description}</p>`;
      contentHtml += `</div>`;

      track.modules.forEach((mod: any, mi: number) => {
        contentHtml += `<div class="module-header"><h2>Module ${mi + 1}: ${mod.title}</h2>`;
        if (mod.description) contentHtml += `<p class="module-desc">${mod.description}</p>`;
        contentHtml += `</div>`;

        mod.lessons.forEach((lesson: any) => {
          contentHtml += `<div class="lesson-page">`;
          contentHtml += `<h3>${lesson.title}</h3>`;

          if (lesson.contentBlocks && Array.isArray(lesson.contentBlocks)) {
            lesson.contentBlocks.forEach((block: any) => {
              contentHtml += renderUniversalBlockToHtml(block, (ref) =>
                resolveContentImagesForPdf(ref)
              );
            });
          }

          if (lesson.videos && lesson.videos.length > 0) {
            contentHtml += `<div class="block-container videos-block"><h4>Videos</h4>`;
            lesson.videos.forEach((video: any) => {
              contentHtml += `<div class="video-ref"><strong>🎥 ${video.title || "Video Lecture"}</strong> (${video.type === "upload" ? "Uploaded Video" : "YouTube"})</div>`;
            });
            contentHtml += `</div>`;
          }

          if (lesson.resources && lesson.resources.length > 0) {
            contentHtml += `<div class="block-container resources-block"><h4>Resources</h4><ul>`;
            lesson.resources.forEach((resource: any) => {
              contentHtml += `<li><strong>🔗 ${resource.title}</strong> (${resource.type})</li>`;
            });
            contentHtml += `</ul></div>`;
          }

          if (lesson.quiz) {
            contentHtml += renderQuizToHtml(lesson.quiz);
          }

          if (lesson.project) {
            contentHtml += renderProjectToHtml(lesson.project);
          }

          contentHtml += `</div>`;
        });
      });
    });
  } else {
    const courseData = data as CourseDownloadData;
    courseData.sections.forEach((section: any, si: number) => {
      contentHtml += `<div class="section-header"><h1>Section ${si + 1}: ${section.title}</h1></div>`;

      section.lectures.forEach((lecture: any) => {
        contentHtml += `<div class="lesson-page">`;
        contentHtml += `<h3>${lecture.title}</h3>`;

        if (lecture.content) {
          contentHtml += `<div class="lesson-body">${compileInlineContent(resolveContentImagesForPdf(lecture.content))}</div>`;
        }

        if (lecture.attachments && lecture.attachments.length > 0) {
          contentHtml += `<div class="block-container attachments-block"><h4>Attachments</h4><ul>`;
          lecture.attachments.forEach((att: any) => {
            contentHtml += `<li><strong>📁 ${att.name}</strong> (${att.type})</li>`;
          });
          contentHtml += `</ul></div>`;
        }

        if (lecture.quiz) {
          contentHtml += renderQuizToHtml(lecture.quiz);
        }

        contentHtml += `</div>`;
      });
    });
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - Course Guide</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    body {
      font-family: 'Outfit', sans-serif;
      color: #1f2937;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #111827;
      font-weight: 700;
    }
    .cover-page {
      padding: 40px;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      min-height: 90vh;
      justify-content: center;
    }
    .banner {
      width: 100%;
      height: 220px;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 30px;
    }
    .banner-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .banner-fallback {
      width: 100%;
      height: 220px;
      background: linear-gradient(135deg, #6366f1, #06b6d4);
      border-radius: 12px;
      margin-bottom: 30px;
    }
    h1.title {
      font-family: 'Playfair Display', serif;
      font-size: 2.8rem;
      margin: 10px 0;
      color: #1e1b4b;
    }
    .subtitle {
      font-size: 1.3rem;
      color: #4b5563;
      margin-top: 0;
      margin-bottom: 30px;
    }
    .instructor {
      font-size: 1.1rem;
      color: #374151;
      margin-bottom: 30px;
    }
    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
      padding: 20px 0;
      margin-bottom: 30px;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
      font-weight: 600;
    }
    .meta-value {
      font-size: 1.05rem;
      font-weight: 500;
      color: #1f2937;
      margin-top: 4px;
    }
    .cover-description, .learning-objectives, .skills-acquired, .prerequisites {
      margin-top: 25px;
    }
    .cover-description h3, .learning-objectives h3, .skills-acquired h3, .prerequisites h3 {
      font-size: 1.2rem;
      border-left: 4px solid #4f46e5;
      padding-left: 10px;
      margin-bottom: 10px;
    }
    .skills-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .badge {
      background-color: #f3f4f6;
      color: #374151;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .toc-page {
      page-break-after: always;
      padding: 40px 0;
    }
    .toc-title {
      font-family: 'Playfair Display', serif;
      font-size: 2rem;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 8px;
      margin-bottom: 25px;
    }
    .toc-list, .toc-list ul {
      list-style: none;
      padding-left: 0;
    }
    .toc-track {
      margin-bottom: 20px;
      font-size: 1.15rem;
    }
    .toc-module {
      margin-left: 20px;
      margin-top: 8px;
      font-size: 1rem;
      color: #374151;
    }
    .toc-lesson {
      margin-left: 20px;
      margin-top: 5px;
      font-size: 0.92rem;
      color: #6b7280;
    }
    .track-header, .section-header {
      page-break-before: always;
      padding: 50px 0 20px;
      border-bottom: 2px solid #4f46e5;
    }
    .track-header h1, .section-header h1 {
      font-family: 'Playfair Display', serif;
      font-size: 2.2rem;
      color: #1e1b4b;
    }
    .module-header {
      margin-top: 40px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
    }
    .module-header h2 {
      font-size: 1.6rem;
      color: #4f46e5;
    }
    .lesson-page {
      page-break-before: always;
      padding: 30px 0 10px;
    }
    .lesson-page h3 {
      font-size: 1.4rem;
      color: #111827;
      margin-bottom: 15px;
      border-bottom: 1px solid #f3f4f6;
      padding-bottom: 8px;
    }
    .lesson-body {
      margin-bottom: 30px;
    }
    .lesson-body img {
      max-width: 100%;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      margin: 15px 0;
    }
    .block-container {
      margin: 20px 0;
      padding: 15px 20px;
      border-radius: 8px;
      background-color: #f9fafb;
    }
    .block-container h4, .block-container h5 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 1.05rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #4b5563;
    }
    .callout {
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid;
      margin: 20px 0;
    }
    .callout-note {
      background-color: #eff6ff;
      border-left-color: #3b82f6;
      color: #1e3a8a;
    }
    .callout-tip {
      background-color: #f0fdf4;
      border-left-color: #22c55e;
      color: #14532d;
    }
    .callout-warning {
      background-color: #fffbeb;
      border-left-color: #f59e0b;
      color: #78350f;
    }
    .callout-summary {
      background-color: #f5f3ff;
      border-left-color: #8b5cf6;
      color: #4c1d95;
    }
    pre {
      background-color: #f3f4f6;
      padding: 14px;
      border-radius: 8px;
      font-family: 'Fira Code', 'Courier New', monospace;
      font-size: 0.88rem;
      overflow-x: auto;
      margin: 15px 0;
    }
    code {
      font-family: 'Fira Code', 'Courier New', monospace;
      background-color: #f3f4f6;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 10px 12px;
      text-align: left;
    }
    th {
      background-color: #f9fafb;
      font-weight: 600;
    }
    .question-block {
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 15px;
    }
    .option-list {
      list-style: none;
      padding-left: 0;
    }
    .option-item {
      padding: 6px 10px;
      margin: 4px 0;
      border-radius: 4px;
      background-color: #f9fafb;
    }
    .option-correct {
      background-color: #d1fae5;
      color: #065f46;
      font-weight: 500;
    }
    .explanation {
      margin-top: 10px;
      font-style: italic;
      color: #4b5563;
      font-size: 0.92rem;
    }
    @media print {
      body {
        margin: 0;
      }
      .cover-page {
        page-break-after: always;
      }
      .toc-page {
        page-break-after: always;
      }
      .track-header, .section-header, .lesson-page {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  ${contentHtml}
</body>
</html>`;

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function generateVideoMetadata(video: any, index: number, secureLink: string): Promise<{ text: string; json: string; qr: Buffer }> {
  const lessonNum = String(index + 1).padStart(2, "0");
  const textContent = `Lesson ${lessonNum}: ${video.title || "Video"}
Type: ${video.type || "video"}
Duration: ${video.duration ? Math.round(video.duration / 60) + " minutes" : "N/A"}
URL: ${video.url || secureLink}
Description: ${video.description || "N/A"}
`;

  const jsonContent = JSON.stringify({
    title: video.title,
    type: video.type,
    url: video.url || secureLink,
    duration: video.duration,
    description: video.description,
    order: index,
  }, null, 2);

  const qrBuffer = await QRCode.toBuffer(secureLink, {
    width: 200,
    margin: 2,
  });

  return { text: textContent, json: jsonContent, qr: qrBuffer };
}

export async function generateMetadataJson(data: CourseDownloadData | LearningUniverseDownloadData, isLearningUniverse: boolean = false): Promise<Record<string, string>> {
  const isLU = isLearningUniverse;
  const title = isLU ? (data as LearningUniverseDownloadData).universe.title : (data as CourseDownloadData).course.title;
  const instructor = isLU ? (data as LearningUniverseDownloadData).instructor : (data as CourseDownloadData).instructor;
  const downloadDate = new Date().toISOString();

  const manifest = {
    name: title,
    version: "1.0.0",
    downloadDate,
    platform: "THE GATEHUB",
    instructor: `${instructor.firstName} ${instructor.lastName}`,
    type: isLU ? "learning-universe" : "course",
  };

  const courseJson = isLU ? {
    id: (data as LearningUniverseDownloadData).universe.id,
    title: (data as LearningUniverseDownloadData).universe.title,
    subtitle: (data as LearningUniverseDownloadData).universe.subtitle,
    description: (data as LearningUniverseDownloadData).universe.description,
    difficulty: (data as LearningUniverseDownloadData).universe.difficulty,
    price: (data as LearningUniverseDownloadData).universe.price,
    instructorId: (data as LearningUniverseDownloadData).universe.instructorId,
  } : {
    id: (data as CourseDownloadData).course.id,
    title: (data as CourseDownloadData).course.title,
    subtitle: (data as CourseDownloadData).course.subtitle,
    description: (data as CourseDownloadData).course.description,
    difficulty: (data as CourseDownloadData).course.difficulty,
    price: (data as CourseDownloadData).course.price,
    instructorId: (data as CourseDownloadData).course.instructorId,
  };

  let modulesJson: any[] = [];
  let lessonsJson: any[] = [];
  let videosJson: any[] = [];
  let quizzesJson: any[] = [];
  let resourcesJson: any[] = [];
  let projectsJson: any[] = [];
  let assignmentsJson: any[] = [];

  if (isLU) {
    const luData = data as LearningUniverseDownloadData;
    luData.tracks.forEach((track: any, ti: number) => {
      track.modules.forEach((mod: any, mi: number) => {
        modulesJson.push({
          id: mod.id,
          title: mod.title,
          description: mod.description,
          order: mod.order,
          trackIndex: ti,
          moduleIndex: mi,
        });

        mod.lessons.forEach((lesson: any, li: number) => {
          lessonsJson.push({
            id: lesson.id,
            title: lesson.title,
            order: lesson.order,
            moduleId: mod.id,
            moduleIndex: mi,
            lessonIndex: li,
          });

          if (lesson.videos) {
            lesson.videos.forEach((video: any, vi: number) => {
              videosJson.push({
                id: video.id,
                title: video.title,
                type: video.type,
                url: video.url,
                order: vi,
                lessonId: lesson.id,
              });
            });
          }

          if (lesson.quiz) {
            quizzesJson.push({
              id: lesson.quiz.id,
              title: lesson.quiz.title,
              lessonId: lesson.id,
              questionCount: lesson.quiz.questions?.length || 0,
            });
          }

          if (lesson.project) {
            projectsJson.push({
              id: lesson.project.id,
              title: lesson.project.title,
              description: lesson.project.description,
              lessonId: lesson.id,
            });
          }

          if (lesson.resources) {
            lesson.resources.forEach((resource: any) => {
              resourcesJson.push({
                id: resource.id,
                title: resource.title,
                type: resource.type,
                url: resource.url || resource.fileUrl,
                lessonId: lesson.id,
              });
            });
          }

          if (lesson.contentBlocks && Array.isArray(lesson.contentBlocks)) {
            lesson.contentBlocks.forEach((block: any) => {
              if (block.type === "assignment") {
                assignmentsJson.push({
                  id: `assignment-${lesson.id}`,
                  title: block.content?.title || "Assignment",
                  instructions: block.content?.instructions || "",
                  points: block.content?.points || 100,
                  dueDate: block.content?.dueDate,
                  moduleId: mod.id,
                  lessonId: lesson.id,
                });
              }
            });
          }
        });
      });
    });
  } else {
    const courseData = data as CourseDownloadData;
    courseData.sections.forEach((section: any, si: number) => {
      modulesJson.push({
        id: section.id,
        title: section.title,
        order: section.order,
        sectionIndex: si,
      });

      section.lectures.forEach((lecture: any, li: number) => {
        lessonsJson.push({
          id: lecture.id,
          title: lecture.title,
          type: lecture.type,
          order: lecture.order,
          sectionId: section.id,
          lectureIndex: li,
        });

        if (lecture.quiz) {
          quizzesJson.push({
            id: lecture.quiz.id,
            title: lecture.quiz.title,
            lectureId: lecture.id,
            questionCount: lecture.quiz.questions?.length || 0,
          });
        }

        if (lecture.type === "assignment" || lecture.title.toLowerCase().includes("assignment")) {
          assignmentsJson.push({
            id: `assignment-${lecture.id}`,
            title: lecture.title,
            instructions: lecture.content || "",
            points: 100,
            moduleId: section.id,
            lessonId: lecture.id,
          });
        }
      });
    });
  }

  return {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "course.json": JSON.stringify(courseJson, null, 2),
    "modules.json": JSON.stringify(modulesJson, null, 2),
    "lessons.json": JSON.stringify(lessonsJson, null, 2),
    "videos.json": JSON.stringify(videosJson, null, 2),
    "quizzes.json": JSON.stringify(quizzesJson, null, 2),
    "resources.json": JSON.stringify(resourcesJson, null, 2),
    "projects.json": JSON.stringify(projectsJson, null, 2),
    "assignments.json": JSON.stringify(assignmentsJson, null, 2),
  };
}

export function generateReadme(data: CourseDownloadData | LearningUniverseDownloadData, isLearningUniverse: boolean = false): string {
  const isLU = isLearningUniverse;
  const title = isLU ? (data as LearningUniverseDownloadData).universe.title : (data as CourseDownloadData).course.title;
  const instructor = isLU ? (data as LearningUniverseDownloadData).instructor : (data as CourseDownloadData).instructor;
  const downloadDate = new Date().toLocaleDateString();

  return `${title}
====================

Download Date: ${downloadDate}
Instructor: ${instructor.firstName} ${instructor.lastName}
Platform: THE GATEHUB

FOLDER STRUCTURE
----------------

Course Guide.pdf - Complete course manual with all content

Videos/ - Video lessons with metadata
  Lesson 01.mp4 - Video file (if downloadable)
  Lesson 01.txt - Video information
  Lesson 01.qr.png - QR code for online access
  Lesson 01.json - Video metadata

Images/ - All images used in the course

Resources/ - Downloadable resources, attachments, and files

Assignments/ - Assignment instructions and materials

Projects/ - Project descriptions, requirements, and starter files

Quizzes/ - Quiz questions and answers

Notes/ - Instructor notes and lesson summaries

Attachments/ - Additional attachments from lessons

References/ - External links, research papers, and citations

Metadata/ - JSON metadata files
  manifest.json - Package information
  course.json - Course details
  modules.json - Module structure
  lessons.json - Lesson information
  videos.json - Video metadata
  quizzes.json - Quiz data
  resources.json - Resource information
  projects.json - Project details
  assignments.json - Assignment details

For the best learning experience, start with the Course Guide.pdf, then follow the folder structure to access individual lessons, videos, and resources.
`;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\. ]/g, "_").trim().substring(0, 100);
}

export function shortenRootFolder(name: string): string {
  // Take first 30 characters, replace spaces with underscores
  return sanitizeFilename(name).replace(/\s+/g, "_").substring(0, 40);
}

export function shortenModuleName(moduleIndex: number, originalTitle: string): string {
  // Format: M01_ShortTitle (max 30 chars)
  const num = String(moduleIndex + 1).padStart(2, "0");
  const shortTitle = sanitizeFilename(originalTitle)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 25);
  return `M${num}_${shortTitle}`.substring(0, 30);
}

export function shortenLessonName(lessonIndex: number, originalTitle: string): string {
  // Format: L01_ShortTitle (max 35 chars)
  const num = String(lessonIndex + 1).padStart(2, "0");
  const shortTitle = sanitizeFilename(originalTitle)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);
  return `L${num}_${shortTitle}`.substring(0, 35);
}

export function shortenResourceName(type: string, index: number, originalName?: string): string {
  // Types: "notes", "image", "video", "quiz", "resource"
  switch (type) {
    case "notes":
      return "Lesson_Notes.md";
    case "image":
      return `Image${String(index + 1).padStart(2, "0")}${path.extname(originalName || ".png")}`;
    case "video":
      return `Video${String(index + 1).padStart(2, "0")}${path.extname(originalName || ".mp4")}`;
    case "quiz":
      return "Quiz.md";
    case "resource":
      if (originalName) {
        const ext = path.extname(originalName);
        const base = path.basename(originalName, ext);
        const shortBase = sanitizeFilename(base).substring(0, 30);
        return `${shortBase}${ext}`;
      }
      return `Resource${String(index + 1).padStart(2, "0")}.txt`;
    default:
      return `File${String(index + 1).padStart(2, "0")}${path.extname(originalName || "")}`;
  }
}

export function validateAndShortenPath(fullPath: string): string {
  const MAX_PATH_LENGTH = 180;
  if (fullPath.length <= MAX_PATH_LENGTH) {
    return fullPath;
  }
  // If path is too long, shorten directory names recursively
  const parts = fullPath.split("/");
  let currentLength = 0;
  const shortenedParts: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    const remainingParts = parts.length - i - 1;
    const estimatedRemainingLength = remainingParts * 20; // Estimate 20 chars per remaining part
    const maxPartLength = MAX_PATH_LENGTH - currentLength - estimatedRemainingLength - (remainingParts > 0 ? 1 : 0);
    
    if (maxPartLength < 5) {
      // Even with minimal parts, it's too long - use hash
      part = part.substring(0, 4) + "_" + Buffer.from(part).toString("base64").substring(0, 6);
    } else if (part.length > maxPartLength) {
      part = part.substring(0, maxPartLength);
    }
    
    shortenedParts.push(part);
    currentLength += part.length + 1;
  }
  
  return shortenedParts.join("/");
}
