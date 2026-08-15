import { Router } from "express";
import path from "path";
import fs from "fs";
import * as lecturesController from "../controllers/lecturesController.js";
import { authenticate, optionalAuthenticate } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import { resolveLectureVideoFilePath, videoContentTypeFromPath } from "../utils/lectureVideoPath.js";
import { persistMulterFile, serveStoredUpload, localPathIfExists } from "../middlewares/persistUpload.js";
import { b2KeyFromPublicPath, isB2Configured, getSignedGetUrl } from "../services/b2StorageService.js";

export const lectureRouter = Router({ mergeParams: true });

lectureRouter.get("/", authenticate, lecturesController.listBySection);
lectureRouter.patch("/reorder", authenticate, lecturesController.reorder);

/** Stream compiled lecture notes PDF — used by course player (student + instructor preview). */
lectureRouter.get("/:id/notes-pdf", optionalAuthenticate, async (req: AuthRequest, res) => {
  const lecture = await prisma.lecture.findUnique({
    where: { id: req.params.id },
    include: { section: { include: { course: true } } },
  });

  if (!lecture?.compiledPdfUrl) {
    return res.status(404).json({ success: false, error: "PDF not compiled for this lecture" });
  }

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

  if (!hasAccess) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }

  const local = localPathIfExists(lecture.compiledPdfUrl);
  if (local) {
    const stat = fs.statSync(local);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": stat.size,
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Allow-Origin": process.env.CLIENT_URL || "http://localhost:5173",
    });
    return fs.createReadStream(local).pipe(res);
  }

  const key = b2KeyFromPublicPath(lecture.compiledPdfUrl);
  if (key && isB2Configured()) {
    const relative = key.replace(/^uploads\//, "");
    const served = await serveStoredUpload(res, relative);
    if (served) return;
  }

  return res.status(404).json({ success: false, error: "PDF file missing on server" });
});

lectureRouter.get("/:id/structured-content", optionalAuthenticate, lecturesController.getStructuredContent);

async function streamLectureVideo(req: AuthRequest, res: import("express").Response) {
  try {
    const paramId = req.params.id;
    let filePath: string | null = null;

    const lecture = await prisma.lecture.findUnique({
      where: { id: paramId },
      include: { section: { include: { course: true } } },
    });

    if (lecture?.videoUrl) {
      const course = lecture.section.course;
      const isOwner = req.user?.id === course.instructorId;
      const isAdmin = isAdminRole(req.user?.role);
      let hasAccess = isOwner || isAdmin;

      if (!hasAccess && req.user) {
        const enrollment = await prisma.enrollment.findFirst({
          where: { userId: req.user.id, courseId: course.id },
        });
        hasAccess = Boolean(enrollment);
      }

      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      filePath = resolveLectureVideoFilePath(lecture.videoUrl);
    } else {
      // Direct filename resolution for uploaded asset streams
      filePath = resolveLectureVideoFilePath(paramId);
    }

    const clientOrigin = process.env.CLIENT_URL || "http://localhost:5173";

    if ((!filePath || !fs.existsSync(filePath)) && lecture?.videoUrl && isB2Configured()) {
      const key = b2KeyFromPublicPath(lecture.videoUrl);
      if (key) {
        const signed = await getSignedGetUrl(key);
        return res.redirect(302, signed);
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).send("File missing");
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const contentType = videoContentTypeFromPath(filePath);

    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": clientOrigin,
        "Cache-Control": "private, max-age=3600",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const matches = range.match(/bytes=(\d+)-(\d*)/);
    const start = matches ? parseInt(matches[1], 10) : 0;
    const end = matches && matches[2] ? parseInt(matches[2], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": clientOrigin,
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  } catch (err) {
    console.error("VIDEO STREAM ERROR:", err);
    res.status(500).send("Streaming error");
  }
}

// Stream uploaded lecture video (protected by authentication & authorization)
lectureRouter.get("/:id/video", authenticate, streamLectureVideo);
lectureRouter.get("/video/:id", authenticate, streamLectureVideo);

// Protected video streaming endpoint - for API calls with auth
lectureRouter.get("/video-protected/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id: req.params.id },
    });

    if (!lecture?.videoUrl) {
      return res.status(404).send("No video");
    }

    const filePath = resolveLectureVideoFilePath(lecture.videoUrl);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File missing");
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const contentType = videoContentTypeFromPath(filePath);

    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const CHUNK_SIZE = 10 ** 6;
    const start = Number(range.replace(/\D/g, ""));
    const end = Math.min(start + CHUNK_SIZE, fileSize - 1);
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  } catch (err) {
    console.error("VIDEO ERROR:", err);
    res.status(500).send("Streaming error");
  }
});

lectureRouter.get("/:id", authenticate, lecturesController.getOne);
lectureRouter.get("/:id/quiz", authenticate, lecturesController.getLectureQuiz);
lectureRouter.get("/:id/notes", authenticate, lecturesController.getLectureNotes);
lectureRouter.patch("/:id/notes", authenticate, lecturesController.updateLectureNotes);
lectureRouter.post("/:lectureId/attach-notes", authenticate, lecturesController.attachNotes);
lectureRouter.post("/:id/upload-video", authenticate, upload.single("video"), async (req: AuthRequest, res) => {
  if (!req.file) throw new AppError(400, "No video file uploaded");
  if (!req.file.mimetype.startsWith("video/")) throw new AppError(400, "File must be a video");
  
  const lectureId = req.params.id;
  const lecture = await prisma.lecture.findUnique({ 
    where: { id: lectureId }, 
    include: { section: { include: { course: true } } } 
  });
  
  if (!lecture) throw new AppError(404, "Lecture not found");
  if (lecture.section.course.instructorId !== req.user?.id) throw new AppError(403, "Forbidden");

  const videoUrl = await persistMulterFile(req.file, "videos");
  
  await prisma.lecture.update({
    where: { id: lectureId },
    data: { 
      videoUrl,
      videoType: "upload"
    } as any
  });
  
  res.json({ success: true, videoUrl, videoType: "upload" });
});
lectureRouter.post("/", authenticate, lecturesController.create);
lectureRouter.patch("/:id", authenticate, lecturesController.update);
lectureRouter.delete("/:id", authenticate, lecturesController.remove);

lectureRouter.post("/:id/upload", authenticate, upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) throw new AppError(400, "No file uploaded");
  const lectureId = req.params.id;
  const lecture = await prisma.lecture.findUnique({ where: { id: lectureId }, include: { section: { include: { course: true } } } });
  if (!lecture) throw new AppError(404, "Lecture not found");
  if (lecture.section.course.instructorId !== req.user?.id) throw new AppError(403, "Forbidden");
  const url = await persistMulterFile(req.file, "attachments");
  const attachment = await prisma.attachment.create({
    data: {
      lectureId,
      name: req.file.originalname,
      url,
      type: req.file.mimetype,
      size: req.file.size,
    },
  });
  res.status(201).json({ success: true, attachment });
});
