import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { loadProjectFiles } from "../services/luProject/luProjectFiles.js";
import archiver from "archiver";
import path from "path";
import fs from "fs";
import {
  verifyCourseAccess,
  verifyLearningUniverseAccess,
  verifyCourseDownloadEligibility,
  verifyLearningUniverseDownloadEligibility,
  fetchCompleteCourseData,
  fetchCompleteLearningUniverseData,
  generateCourseGuidePdf,
  generateVideoMetadata,
  generateMetadataJson,
  generateReadme,
  sanitizeFilename,
  shortenRootFolder,
  shortenModuleName,
  shortenLessonName,
  shortenResourceName,
  validateAndShortenPath,
} from "../services/courseDownloadService.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

function debugLog(msg: string) {
  try {
    const logPath = path.join(process.cwd(), UPLOAD_DIR, "download_debug.log");
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
    console.log(msg);
  } catch {}
}

async function getLocalFilePath(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname.startsWith("/uploads/")) {
        url = urlObj.pathname;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  let cleanPath = url.replace(/^\//, "");
  if (cleanPath.startsWith("uploads/")) {
    cleanPath = cleanPath.replace(/^uploads\//, "");
  }
  const absolutePath = path.join(process.cwd(), UPLOAD_DIR, cleanPath);
  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }
  const { hydrateLocalUpload } = await import("../middlewares/persistUpload.js");
  return hydrateLocalUpload(url.startsWith("/") ? url : `/${url}`);
}

function extractLocalImages(content: string | null | undefined): string[] {
  if (!content) return [];
  const imagePaths: string[] = [];
  const markdownImgRegex = /!\[.*?\]\((.*?)\)/g;
  const htmlImgRegex = /<img[^>]+src=["']([^"']+)["']/g;
  
  let match;
  while ((match = markdownImgRegex.exec(content)) !== null) {
    const url = match[1];
    if (url.includes("/uploads/")) imagePaths.push(url);
  }
  while ((match = htmlImgRegex.exec(content)) !== null) {
    const url = match[1];
    if (url.includes("/uploads/")) imagePaths.push(url);
  }
  return imagePaths;
}

function extractDocumentImageRefs(contentBlocks: any[] | null | undefined): string[] {
  if (!Array.isArray(contentBlocks)) return [];
  const refs: string[] = [];
  for (const block of contentBlocks) {
    if (block?.type !== "document") continue;
    const nodes = block?.content?.nodes;
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      if (node?.type === "image" && typeof node.ref === "string" && node.ref.includes("/uploads/")) {
        refs.push(node.ref);
      }
    }
  }
  return refs;
}

function extractDocumentMarkdown(contentBlocks: any[] | null | undefined): string {
  if (!Array.isArray(contentBlocks)) return "";
  const chunks: string[] = [];
  for (const block of contentBlocks) {
    if (block?.type !== "document") continue;
    const title =
      typeof block?.content?.title === "string" && block.content.title.trim()
        ? String(block.content.title).trim()
        : "";
    const nodes = block?.content?.nodes;
    if (!Array.isArray(nodes)) continue;
    const markdown = nodes
      .filter((n: any) => n?.type === "markdown" && typeof n.content === "string")
      .map((n: any) => String(n.content).trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (!markdown) continue;
    chunks.push(title ? `### ${title}\n\n${markdown}` : markdown);
  }
  return chunks.join("\n\n").trim();
}

export async function downloadCompleteCourse(req: AuthRequest, res: Response) {
  const courseId = req.params.id;
  debugLog("[DOWNLOAD DEBUG] REQUEST RECEIVED for course: " + courseId);
  if (!req.user) {
    debugLog("[DOWNLOAD DEBUG] AUTH FAILED: req.user is undefined");
    throw new AppError(401, "Unauthorized");
  }
  
  const userId = req.user.id;
  const userRole = req.user.role;
  debugLog("[DOWNLOAD DEBUG] AUTH PASSED. User ID: " + userId + " Role: " + userRole);

  const hasAccess = await verifyCourseAccess(courseId, userId, userRole);
  if (!hasAccess) {
    debugLog("[DOWNLOAD DEBUG] ENROLLMENT FAILED");
    throw new AppError(403, "You must be enrolled in this course to download it");
  }
  const eligibility = await verifyCourseDownloadEligibility(courseId, userId, userRole);
  if (!eligibility.allowed) {
    throw new AppError(403, eligibility.reason || "Complete the course to unlock the downloadable course package.");
  }
  debugLog("[DOWNLOAD DEBUG] ENROLLMENT PASSED");

  const data = await fetchCompleteCourseData(courseId, userId);
  const folderName = shortenRootFolder(data.course.title);
  const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;

  try {
    debugLog("[DOWNLOAD DEBUG] PDF START");
    // 1. Generate Course Guide PDF (slow async operation)
    const pdfBuffer = await generateCourseGuidePdf(data, false);
    debugLog("[DOWNLOAD DEBUG] PDF COMPLETE. Buffer size: " + pdfBuffer.length);

    debugLog("[DOWNLOAD DEBUG] ZIP START");
    // 2. Set headers and pipe archive only after PDF is ready
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folderName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    archive.on("error", (err: Error) => {
      debugLog("[DOWNLOAD DEBUG] Archive error: " + err.message);
    });

    archive.append(pdfBuffer, { name: validateAndShortenPath(`${folderName}/Course Guide.pdf`) });

    // 2. Add README
    const readmeContent = generateReadme(data, false);
    archive.append(readmeContent, { name: validateAndShortenPath(`${folderName}/README.txt`) });

    // 3. Add metadata JSON files
    const metadataFiles = await generateMetadataJson(data, false);
    for (const [filename, content] of Object.entries(metadataFiles)) {
      archive.append(content, { name: validateAndShortenPath(`${folderName}/Metadata/${filename}`) });
    }

    // Load student notes written by this user
    const studentNotes = await prisma.studentNote.findMany({
      where: { userId, lecture: { section: { courseId } } },
    });

    const notesMap = new Map<string, string[]>();
    studentNotes.forEach(n => {
      const arr = notesMap.get(n.lectureId) || [];
      arr.push(n.content);
      notesMap.set(n.lectureId, arr);
    });

    // Tracking for files to avoid duplicates
    const addedImages = new Set<string>();
    const globalReferences: string[] = [];

    let videoIndex = 0;
    let attachmentIndex = 0;
    let imageIndex = 0;

    for (let sectionIndex = 0; sectionIndex < data.sections.length; sectionIndex++) {
      const section = data.sections[sectionIndex];
      const sectionPath = shortenModuleName(sectionIndex, section.title);

      for (let lectureIndex = 0; lectureIndex < section.lectures.length; lectureIndex++) {
        const lecture = section.lectures[lectureIndex];
        const lessonPath = `${sectionPath}/${shortenLessonName(lectureIndex, lecture.title)}`;

        // Extract Images from content
        const contentImages = extractLocalImages(lecture.content);
        for (const imgUrl of contentImages) {
          const imgPath = await getLocalFilePath(imgUrl);
          if (imgPath && !addedImages.has(imgPath)) {
            const shortName = shortenResourceName("image", imageIndex, imgPath);
            archive.file(imgPath, { name: validateAndShortenPath(`${folderName}/Images/${shortName}`) });
            addedImages.add(imgPath);
            imageIndex++;
          }
        }

        // Add Video (if present and uploaded)
        if (lecture.videoUrl) {
          debugLog("[DOWNLOAD DEBUG] ADDING VIDEOS");
          const videoDestPath = `${folderName}/Videos/${sectionPath}/${shortenLessonName(lectureIndex, lecture.title)}`;

          if (lecture.videoType === "upload") {
            const videoPath = await getLocalFilePath(lecture.videoUrl);
            if (videoPath) {
              const shortName = shortenResourceName("video", 0, videoPath);
              archive.file(videoPath, { name: validateAndShortenPath(`${videoDestPath}/${shortName}`) });
            }
          } else {
            // YouTube / External Video Metadata
            const secureLink = lecture.videoUrl.startsWith("http") ? lecture.videoUrl : `${baseUrl}/courses/${courseId}/lessons/${lecture.id}`;
            const { text, json, qr } = await generateVideoMetadata(
              { title: lecture.title, url: lecture.videoUrl, duration: lecture.duration },
              videoIndex,
              secureLink
            );
            const shortName = "Video01";
            archive.append(text, { name: validateAndShortenPath(`${videoDestPath}/${shortName}.txt`) });
            archive.append(json, { name: validateAndShortenPath(`${videoDestPath}/${shortName}.json`) });
            archive.append(qr, { name: validateAndShortenPath(`${videoDestPath}/${shortName}.qr.png`) });
          }

          // Handle additional videos in mediaAssets
          if (lecture.mediaAssets && lecture.mediaAssets.length > 0) {
            for (let vi = 0; vi < lecture.mediaAssets.length; vi++) {
              const media = lecture.mediaAssets[vi];
              if (media.type === "video" || media.mimeType?.startsWith("video/")) {
                const addVideoPath = await getLocalFilePath(media.url);
                if (addVideoPath) {
                  const shortName = shortenResourceName("video", vi + 1, addVideoPath);
                  archive.file(addVideoPath, { name: validateAndShortenPath(`${videoDestPath}/${shortName}`) });
                }
              }
            }
          }

          videoIndex++;
        }

        // Attachments
        if (lecture.attachments && lecture.attachments.length > 0) {
          debugLog("[DOWNLOAD DEBUG] ADDING RESOURCES");
          for (const attachment of lecture.attachments) {
            const attachmentPath = await getLocalFilePath(attachment.url);
            if (attachmentPath) {
              const fileDest = shortenResourceName("resource", attachmentIndex, attachment.name);
              archive.file(attachmentPath, { name: validateAndShortenPath(`${folderName}/Attachments/${fileDest}`) });
              // Also add to Resources
              archive.file(attachmentPath, { name: validateAndShortenPath(`${folderName}/Resources/${lessonPath}/${fileDest}`) });
              attachmentIndex++;
            }
          }
        }

        // Quiz
        if (lecture.quiz) {
          const quizContent = `# Quiz: ${lecture.quiz.title}
${lecture.quiz.description || ""}

## Questions
${lecture.quiz.questions.map((q: any, qi: number) => {
  const options = q.options.map((opt: any) => `- [${opt.isCorrect ? "x" : " "}] ${opt.text}${opt.isCorrect ? " [CORRECT]" : ""}`).join("\n");
  return `### Q${qi + 1}: ${q.text}
Points: ${q.marks} | Difficulty: ${q.difficulty || "N/A"}

${options}

**Explanation:** ${q.explanation || "N/A"}
`;
}).join("\n\n")}`;
          archive.append(quizContent, { name: validateAndShortenPath(`${folderName}/Quizzes/${lessonPath}/Quiz.md`) });
        }

        // Projects (LaTeX project templates)
        if (lecture.latexProject) {
          const projectFiles = await loadProjectFiles(lecture.latexProject.id);
          const projectDest = `${folderName}/Projects/${lessonPath}`;
          
          let projDesc = `# Project: ${lecture.latexProject.title}\n\n`;
          if (lecture.latexProject.description) projDesc += `${lecture.latexProject.description}\n\n`;
          projDesc += `### LaTeX Starter Files\n`;
          
          for (const file of projectFiles) {
            if (file.isFolder) continue;
            if (file.content) {
              archive.append(file.content, { name: validateAndShortenPath(`${projectDest}/${file.path.replace(/^\//, "")}`) });
              projDesc += `- [${file.name}](./${file.path.replace(/^\//, "")})\n`;
            }
          }
          archive.append(projDesc, { name: validateAndShortenPath(`${projectDest}/Project_Instructions.md`) });
        }

        // Student & Instructor Notes
        let lectureNotes = "";
        if (lecture.content) {
          lectureNotes += `## Lesson Notes\n\n${lecture.content}\n\n`;
        }
        
        const myNotes = notesMap.get(lecture.id);
        if (myNotes && myNotes.length > 0) {
          lectureNotes += `## Student Notes\n\n`;
          myNotes.forEach((n, ni) => {
            lectureNotes += `### Note ${ni + 1}\n${n}\n\n`;
          });
        }

        if (lectureNotes.trim()) {
          archive.append(lectureNotes, { name: validateAndShortenPath(`${folderName}/Notes/${lessonPath}/Lesson_Notes.md`) });
        }

        if (lecture.notesPdfUrl) {
          const notePath = await getLocalFilePath(lecture.notesPdfUrl);
          if (notePath) {
            archive.file(notePath, { name: validateAndShortenPath(`${folderName}/Notes/${lessonPath}/Instructor_Notes.pdf`) });
          }
        }
        if (lecture.compiledPdfUrl) {
          const compiledPath = await getLocalFilePath(lecture.compiledPdfUrl);
          if (compiledPath) {
            archive.file(compiledPath, { name: validateAndShortenPath(`${folderName}/Notes/${lessonPath}/Compiled_Notes.pdf`) });
          }
        }

        // Gather references
        const urlMatches = lecture.content?.match(/https?:\/\/[^\s\)]+/g);
        if (urlMatches) {
          urlMatches.forEach((url: string) => {
            globalReferences.push(`- [${lecture.title} Citation](${url})`);
          });
        }
      }
    }

    // References
    if (globalReferences.length > 0) {
      const refContent = `# References\n\nExternal links and resources referenced in this course:\n\n${globalReferences.join("\n")}\n`;
      archive.append(refContent, { name: validateAndShortenPath(`${folderName}/References/References.md`) });
    }

    debugLog("[DOWNLOAD DEBUG] FINALIZE ZIP");
    await archive.finalize();
    debugLog("[DOWNLOAD DEBUG] RESPONSE FINISHED");
  } catch (error: any) {
    debugLog("[DOWNLOAD DEBUG] EXCEPTION: " + (error?.stack || error));
    throw new AppError(500, "Failed to generate download package");
  }
}

export async function downloadCompleteLearningUniverse(req: AuthRequest, res: Response) {
  const rawUniverseId = req.params.id;
  debugLog("[DOWNLOAD DEBUG] REQUEST RECEIVED for universe: " + rawUniverseId);
  if (!req.user) {
    debugLog("[DOWNLOAD DEBUG] AUTH FAILED: req.user is undefined");
    throw new AppError(401, "Unauthorized");
  }
  
  const userId = req.user.id;
  const userRole = req.user.role;
  debugLog("[DOWNLOAD DEBUG] AUTH PASSED. User ID: " + userId + " Role: " + userRole);

  const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");
  const universeId = (await resolveCanonicalUniverseId(rawUniverseId)) || rawUniverseId;

  const hasAccess = await verifyLearningUniverseAccess(universeId, userId, userRole);
  if (!hasAccess) {
    debugLog("[DOWNLOAD DEBUG] ENROLLMENT FAILED");
    throw new AppError(403, "You must be enrolled in this Learning Universe to download it");
  }
  const eligibility = await verifyLearningUniverseDownloadEligibility(universeId, userId, userRole);
  if (!eligibility.allowed) {
    throw new AppError(403, eligibility.reason || "Complete the course to unlock the downloadable course package.");
  }
  debugLog("[DOWNLOAD DEBUG] ENROLLMENT PASSED");

  const data = await fetchCompleteLearningUniverseData(universeId);
  const folderName = shortenRootFolder(data.universe.title);
  const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;

  try {
    debugLog("[DOWNLOAD DEBUG] PDF START");
    // 1. Generate Course Guide PDF (slow async operation)
    const pdfBuffer = await generateCourseGuidePdf(data, true);
    debugLog("[DOWNLOAD DEBUG] PDF COMPLETE. Buffer size: " + pdfBuffer.length);

    debugLog("[DOWNLOAD DEBUG] ZIP START");
    // 2. Set headers and pipe archive only after PDF is ready
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folderName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    archive.on("error", (err: Error) => {
      debugLog("[DOWNLOAD DEBUG] Archive error: " + err.message);
    });

    archive.append(pdfBuffer, { name: validateAndShortenPath(`${folderName}/Course Guide.pdf`) });

    // 2. Add README
    const readmeContent = generateReadme(data, true);
    archive.append(readmeContent, { name: validateAndShortenPath(`${folderName}/README.txt`) });

    // 3. Add metadata JSON files
    const metadataFiles = await generateMetadataJson(data, true);
    for (const [filename, content] of Object.entries(metadataFiles)) {
      archive.append(content, { name: validateAndShortenPath(`${folderName}/Metadata/${filename}`) });
    }

    const addedImages = new Set<string>();
    const globalReferences: string[] = [];

    // Add universe-level assets (like course images/banners)
    if (data.universe.assets && data.universe.assets.length > 0) {
      for (let i = 0; i < data.universe.assets.length; i++) {
        const asset = data.universe.assets[i];
        const assetPath = path.join(process.cwd(), UPLOAD_DIR, "learning-universes", universeId, asset.storedFilename);
        if (fs.existsSync(assetPath)) {
          const ext = path.extname(asset.filename);
          const shortName = shortenResourceName("image", i, asset.filename);
          archive.file(assetPath, { 
            name: validateAndShortenPath(`${folderName}/Images/${shortName}`) 
          });
          addedImages.add(assetPath);
        }
      }
    }

    let videoIndex = 0;
    let resourceIndex = 0;
    let imageIndex = 0;

    for (const track of data.tracks) {
      const trackNum = String(track.order + 1).padStart(2, "0");
      const trackPath = `Track_${trackNum}`;

      for (let moduleIndex = 0; moduleIndex < track.modules.length; moduleIndex++) {
        const module = track.modules[moduleIndex];
        const modulePath = `${trackPath}/${shortenModuleName(moduleIndex, module.title)}`;

        for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
          const lesson = module.lessons[lessonIndex];
          const lessonPath = `${modulePath}/${shortenLessonName(lessonIndex, lesson.title)}`;

          // Scan compiled document AST for image refs.
          const mdImages = extractDocumentImageRefs(lesson.contentBlocks);
          for (const imgUrl of mdImages) {
            const imgPath = await getLocalFilePath(imgUrl);
            if (imgPath && !addedImages.has(imgPath)) {
              const shortName = shortenResourceName("image", imageIndex, imgPath);
              archive.file(imgPath, { name: validateAndShortenPath(`${folderName}/Images/${shortName}`) });
              addedImages.add(imgPath);
              imageIndex++;
            }
          }

          // Scan contentBlocks for images and text images
          if (lesson.contentBlocks && Array.isArray(lesson.contentBlocks)) {
            for (const block of lesson.contentBlocks as any[]) {
              if (block.type === "image") {
                const imgUrl = block.content?.file || block.src || block.url;
                const imgPath = await getLocalFilePath(imgUrl);
                if (imgPath && !addedImages.has(imgPath)) {
                  const shortName = shortenResourceName("image", imageIndex, imgPath);
                  archive.file(imgPath, { name: validateAndShortenPath(`${folderName}/Images/${shortName}`) });
                  addedImages.add(imgPath);
                  imageIndex++;
                }
              } else if (block.content) {
                // Check if text elements have inline images
                const textToCheck = typeof block.content === "string" 
                  ? block.content 
                  : (block.content.body || block.content.content || block.content.text || "");
                const inlineImgs = extractLocalImages(textToCheck);
                for (const imgUrl of inlineImgs) {
                  const imgPath = await getLocalFilePath(imgUrl);
                  if (imgPath && !addedImages.has(imgPath)) {
                    const shortName = shortenResourceName("image", imageIndex, imgPath);
                    archive.file(imgPath, { name: validateAndShortenPath(`${folderName}/Images/${shortName}`) });
                    addedImages.add(imgPath);
                    imageIndex++;
                  }
                }
              }
            }
          }

          // Videos
          if (lesson.videos && lesson.videos.length > 0) {
            console.log("[DOWNLOAD DEBUG] ADDING VIDEOS");
            for (let vi = 0; vi < lesson.videos.length; vi++) {
              const video = lesson.videos[vi];
              const videoDestPath = `${folderName}/Videos/${modulePath}/${shortenLessonName(lessonIndex, lesson.title)}`;

              if (video.type === "upload") {
                const videoPath = await getLocalFilePath(video.url);
                if (videoPath) {
                  const ext = path.extname(videoPath) || ".mp4";
                  const shortName = shortenResourceName("video", vi, videoPath);
                  archive.file(videoPath, { name: validateAndShortenPath(`${videoDestPath}/${shortName}`) });
                }
              } else {
                const secureLink = video.url || `${baseUrl}/api/learning-universes/${universeId}`;
                const { text, json, qr } = await generateVideoMetadata(video, videoIndex, secureLink);
                const shortName = `Video${String(vi + 1).padStart(2, "0")}`;
                archive.append(text, { name: validateAndShortenPath(`${videoDestPath}/${shortName}.txt`) });
                archive.append(json, { name: validateAndShortenPath(`${videoDestPath}/${shortName}.json`) });
                archive.append(qr, { name: validateAndShortenPath(`${videoDestPath}/${shortName}.qr.png`) });
              }
              videoIndex++;
            }
          }

          // Resources
          if (lesson.resources && lesson.resources.length > 0) {
            console.log("[DOWNLOAD DEBUG] ADDING RESOURCES");
            for (const resource of lesson.resources) {
              const resourceNum = String(resourceIndex + 1).padStart(3, "0");
              const resourceName = shortenResourceName("resource", resourceIndex, resource.title);
              
              if (resource.fileUrl) {
                const resourcePath = await getLocalFilePath(resource.fileUrl);
                if (resourcePath) {
                  const ext = path.extname(resourcePath);
                  const finalName = resourceName.endsWith(ext) ? resourceName : resourceName + ext;
                  archive.file(resourcePath, { name: validateAndShortenPath(`${folderName}/Resources/${lessonPath}/${finalName}`) });
                  // Also add to Attachments
                  archive.file(resourcePath, { name: validateAndShortenPath(`${folderName}/Attachments/${resourceNum}-${finalName}`) });
                }
              } else if (resource.url) {
                archive.append(`Resource: ${resource.title}\nURL: ${resource.url}`, { 
                  name: validateAndShortenPath(`${folderName}/Resources/${lessonPath}/${resourceName}`) 
                });
                globalReferences.push(`- [${resource.title}](${resource.url})`);
              }
              resourceIndex++;
            }
          }

          // Quizzes
          if (lesson.quiz) {
            const quizContent = `# Quiz: ${lesson.quiz.title}
${lesson.quiz.description || ""}

## Questions
${lesson.quiz.questions.map((q: any, qi: number) => {
  const options = q.options.map((opt: any) => `- [${opt.isCorrect ? "x" : " "}] ${opt.text}${opt.isCorrect ? " [CORRECT]" : ""}`).join("\n");
  return `### Q${qi + 1}: ${q.text}
Points: ${q.points || 1} | Difficulty: ${q.difficulty || "N/A"}

${options}

**Explanation:** ${q.explanation || "N/A"}
`;
}).join("\n\n")}`;
            archive.append(quizContent, { name: validateAndShortenPath(`${folderName}/Quizzes/${lessonPath}/Quiz.md`) });
          }

          // Projects
          if (lesson.project) {
            let projectContent = `# Project: ${lesson.project.title}
Difficulty: ${lesson.project.difficulty || "Medium"}

${lesson.project.description || ""}

## Instructions
${lesson.project.instructions || ""}

${lesson.project.expectedOutput ? `## Expected Output\n${lesson.project.expectedOutput}\n\n` : ""}
${lesson.project.successCriteria ? `## Success Criteria\n${lesson.project.successCriteria}\n\n` : ""}
`;
            let links = [];
            if (lesson.project.colabUrl) links.push(`[Google Colab](${lesson.project.colabUrl})`);
            if (lesson.project.githubUrl) links.push(`[GitHub Repository](${lesson.project.githubUrl})`);
            if (links.length > 0) {
              projectContent += `## Links\n${links.join(" | ")}\n`;
            }
            archive.append(projectContent, { name: validateAndShortenPath(`${folderName}/Projects/${lessonPath}/Project.md`) });
          }

          // Assignments (from content blocks)
          if (lesson.contentBlocks && Array.isArray(lesson.contentBlocks)) {
            lesson.contentBlocks.forEach((block: any, bi: number) => {
              if (block.type === "assignment") {
                const assName = `Assignment${String(bi + 1).padStart(2, "0")}.md`;
                const assContent = `# Assignment: ${block.content?.title || "Lesson Assignment"}
Points: ${block.content?.points || 100}

## Instructions
${block.content?.instructions || ""}

${block.content?.dueDate ? `Due Date: ${block.content.dueDate}` : ""}
`;
                archive.append(assContent, { name: validateAndShortenPath(`${folderName}/Assignments/${lessonPath}/${assName}`) });
              }
            });
          }

          // Notes Compilation (Instructor & Lesson notes)
          let compiledNotes = "";
          const lessonDocumentNotes = extractDocumentMarkdown(lesson.contentBlocks);
          if (lessonDocumentNotes) {
            compiledNotes += `## Lesson Overview\n\n${lessonDocumentNotes}\n\n`;
          }
          if (lesson.contentBlocks && Array.isArray(lesson.contentBlocks)) {
            lesson.contentBlocks.forEach((block: any) => {
              if (block.type === "note" || block.type === "tip" || block.type === "warning") {
                compiledNotes += `### [${block.type.toUpperCase()}] ${block.content?.title || ""}\n${block.content?.content || block.content?.text || ""}\n\n`;
              }
            });
          }
          if (compiledNotes.trim()) {
            archive.append(compiledNotes, { name: validateAndShortenPath(`${folderName}/Notes/${lessonPath}/Lesson_Notes.md`) });
          }
        }
      }
    }

    // Global Project Templates from source LatexProject if present
    if (data.universe.sourceProjectId) {
      const luProjFiles = await loadProjectFiles(data.universe.sourceProjectId);
      const projDest = `${folderName}/Projects/Starter_Templates`;
      for (const file of luProjFiles) {
        if (file.isFolder) continue;
        if (file.content) {
          archive.append(file.content, { name: validateAndShortenPath(`${projDest}/${file.path.replace(/^\//, "")}`) });
        }
      }
    }

    // References
    if (globalReferences.length > 0) {
      const refContent = `# References\n\nExternal links and citations for this Learning Universe:\n\n${globalReferences.join("\n")}\n`;
      archive.append(refContent, { name: validateAndShortenPath(`${folderName}/References/References.md`) });
    }

    console.log("[DOWNLOAD DEBUG] FINALIZE ZIP");
    await archive.finalize();
    console.log("[DOWNLOAD DEBUG] RESPONSE FINISHED");
  } catch (error: any) {
    console.error("[DOWNLOAD DEBUG] EXCEPTION:", error?.stack || error);
    throw new AppError(500, "Failed to generate download package");
  }
}
