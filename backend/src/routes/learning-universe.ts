import { isAdminRole } from "../utils/roles.js";

import express from "express";
import { getPublishedLearningUniverses, getFeaturedHomeLearningUniverses, getLandingShowcaseLearningUniverses, getLearningUniverseById, rehydrateProjectFromUniverse, createLearningUniverseDraft, updateLearningUniverseBranding } from "../controllers/learning-universe-controller.js";
import { runLuPublishPipeline } from "../services/luProject/luPublishPipeline.js";
import { ensureProjectForStructuredPublish } from "../services/luProject/ensureStructuredPublishProject.js";
import { syncCatalogOnPublish } from "../services/productRoutingService.js";
import { emitLearningUniverseDsl } from "../services/learningUniverseDslEmitter.js";
import type { LearningUniverseStructured } from "../services/learningUniverseSchema.js";
import * as luEnrollmentController from "../controllers/learningUniverseEnrollmentController.js";
import * as projectSubmissionController from "../controllers/projectSubmissionController.js";
import * as luComponentSubmissionController from "../controllers/luComponentSubmissionController.js";
import * as luProgressController from "../controllers/learningUniverseProgressController.js";
import * as learnerStepProgressController from "../controllers/learnerStepProgressController.js";
import * as learningAnalyticsController from "../controllers/learningAnalyticsController.js";
import { getLearnerExperience } from "../controllers/learningExperienceController.js";
import { AuthRequest } from "../middlewares/auth.js";
import { authenticate, requireRole, optionalAuthenticate } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { upload } from "../middlewares/upload.js";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import mime from "mime-types";
import { downloadCompleteLearningUniverse } from "../controllers/enhancedCourseDownloadController.js";

const prisma = new PrismaClient();
const router = express.Router();
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const ASSETS_DIR = path.join(UPLOAD_DIR, "learning-universes");

// Public routes
router.get("/catalog/landing", async (_req, res) => {
  try {
    const universes = await getLandingShowcaseLearningUniverses();
    res.json({ success: true, data: universes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to get landing learning paths" });
  }
});

router.get("/catalog/featured", async (_req, res) => {
  try {
    const universes = await getFeaturedHomeLearningUniverses();
    res.json({ success: true, data: universes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to get featured learning paths" });
  }
});

router.get("/", async (req, res) => {
  try {
    const categorySlug =
      typeof req.query.categorySlug === "string" ? req.query.categorySlug : undefined;
    const categoryId =
      typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
    const universes = await getPublishedLearningUniverses({ categorySlug, categoryId });
    res.json({ success: true, data: universes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to get learning universes" });
  }
});

router.get("/my-enrollments", authenticate, luEnrollmentController.myEnrollments);

router.get("/mine", authenticate, requireRole("instructor", "admin"), async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });
    const universes = await prisma.learningUniverse.findMany({
      where: { instructorId: req.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        thumbnail: true,
        price: true,
        updatedAt: true,
        structuredData: true,
        _count: { select: { enrollments: true } },
      },
    });
    const { filterUniversesForInstructorMine } = await import("../services/productRoutingService.js");
    res.json({ success: true, data: filterUniversesForInstructorMine(universes) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to list your learning universes" });
  }
});

router.get("/:id/progress", authenticate, luProgressController.getProgress);
router.patch("/:id/lessons/:lessonId/progress", authenticate, luProgressController.updateLessonProgress);
router.get("/:id/step-progress", authenticate, learnerStepProgressController.getStepProgress);
router.patch("/:id/step-progress", authenticate, learnerStepProgressController.patchStepProgress);
router.put("/:id/step-progress/sync", authenticate, learnerStepProgressController.bulkSyncStepProgress);
router.get("/:id/analytics/student", authenticate, learningAnalyticsController.getStudentLearningAnalytics);
router.get(
  "/:id/analytics/instructor",
  authenticate,
  requireRole("instructor", "admin", "super_admin"),
  learningAnalyticsController.getInstructorLearningAnalytics
);

router.get("/:id/enrollment-check", authenticate, luEnrollmentController.check);
router.post("/:id/enroll", authenticate, luEnrollmentController.enroll);

router.get(
  "/:id/lessons/:lessonId/project/submission",
  authenticate,
  projectSubmissionController.getMyProjectSubmission
);
router.post(
  "/:id/lessons/:lessonId/project/submit",
  authenticate,
  upload.fields([
    { name: "zipFile", maxCount: 1 },
    { name: "reportPdf", maxCount: 1 },
  ]),
  projectSubmissionController.submitProject
);

router.get(
  "/:id/lessons/:lessonId/components/:componentKey/submission",
  authenticate,
  luComponentSubmissionController.getMyComponentSubmission
);
router.post(
  "/:id/lessons/:lessonId/components/:componentKey/submission",
  authenticate,
  luComponentSubmissionController.upsertComponentSubmission
);
router.get(
  "/:id/component-submissions",
  authenticate,
  requireRole("instructor", "admin", "super_admin"),
  luComponentSubmissionController.listInstructorComponentSubmissions
);
router.post(
  "/component-submissions/:submissionId/review",
  authenticate,
  requireRole("instructor", "admin", "super_admin"),
  luComponentSubmissionController.reviewComponentSubmission
);

router.get("/:id/experience", authenticate, async (req: AuthRequest, res) => {
  try {
    const experience = await getLearnerExperience(
      req.params.id,
      req.user?.id,
      req.user?.role
    );
    if (!experience) {
      return res.status(404).json({ success: false, error: "Learning experience not found" });
    }
    res.json({ success: true, data: experience });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load learning experience";
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ success: false, error: message });
  }
});

router.get("/:id", optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const universe = await getLearningUniverseById(
      req.params.id,
      req.user?.id,
      req.user?.role
    );
    if (!universe) {
      return res.status(404).json({ success: false, error: "Learning Universe not found" });
    }
    res.json({ success: true, data: universe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to get learning universe" });
  }
});

router.get("/:id/download-complete", authenticate, downloadCompleteLearningUniverse);

// Asset serving endpoint — requires enrollment for paid universes
router.get("/:id/assets/:filename", optionalAuthenticate, async (req: AuthRequest, res) => {
  const { id: rawId, filename } = req.params;
  try {
    const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");
    const id = (await resolveCanonicalUniverseId(rawId)) || rawId;
    const lu = await prisma.learningUniverse.findUnique({
      where: { id },
      select: { price: true, instructorId: true, status: true, sourceProjectId: true },
    });
    if (!lu) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    const isOwner = req.user?.id === lu.instructorId;
    const isAdmin = isAdminRole(req.user?.role);
    if (lu.status !== "published" && !isOwner && !isAdmin) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }
    if (lu.price > 0 && !isOwner && !isAdmin) {
      if (!req.user) return res.status(401).json({ success: false, error: "Authentication required" });
      const enrollment = await prisma.learningUniverseEnrollment.findUnique({
        where: { userId_learningUniverseId: { userId: req.user.id, learningUniverseId: id } },
      });
      const payment = await prisma.payment.findFirst({
        where: { userId: req.user.id, learningUniverseId: id, status: "completed" },
      });
      if (!enrollment || !payment) {
        return res.status(403).json({ success: false, error: "Purchase required to access assets" });
      }
    }

    let asset = await prisma.learningUniverseAsset.findFirst({
      where: { learningUniverseId: id, filename: filename },
    });
    if (!asset) {
      const allAssets = await prisma.learningUniverseAsset.findMany({
        where: { learningUniverseId: id },
      });
      asset =
        allAssets.find((a) => a.filename.toLowerCase() === filename.toLowerCase()) ?? null;
    }

    if (!asset && lu.sourceProjectId) {
      const { loadProjectFiles } = await import("../services/luProject/luProjectFiles.js");
      const { resolveProjectAssetRef } = await import("../services/luProject/luProjectAssetResolver.js");
      const projectFiles = await loadProjectFiles(lu.sourceProjectId);
      const hit = resolveProjectAssetRef(filename, projectFiles);
      if (hit?.s3Url) {
        const physical = path.basename(hit.s3Url);
        const projectPath = path.join(
          process.cwd(),
          process.env.UPLOAD_DIR || "uploads",
          "projects",
          lu.sourceProjectId,
          physical
        );
        if (fs.existsSync(projectPath)) {
          return res.sendFile(projectPath);
        }
      }
    }

    if (!asset) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }
    const assetPath = path.join(ASSETS_DIR, id, asset.storedFilename);
    if (!fs.existsSync(assetPath)) {
      return res.status(404).json({ success: false, error: "Asset file not found" });
    }
    res.sendFile(assetPath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to serve asset" });
  }
});

// Protected routes (for instructors)
router.post("/draft", authenticate, requireRole("instructor", "admin"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");
    const universe = await createLearningUniverseDraft(userId, req.body);
    res.status(201).json({ success: true, data: universe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message || "Failed to create draft" });
  }
});

router.patch("/:id/branding", authenticate, requireRole("instructor", "admin"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");
    const universe = await updateLearningUniverseBranding(req.params.id, userId, req.body);
    res.json({ success: true, data: universe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message || "Failed to update branding" });
  }
});

router.post("/:id/rehydrate-project", authenticate, requireRole("instructor", "admin"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");
    const project = await rehydrateProjectFromUniverse(req.params.id, userId);
    res.json({ success: true, data: project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message || "Failed to rehydrate project" });
  }
});

router.post("/publish", authenticate, requireRole("instructor", "admin"), upload.array("assets", 100), async (req: AuthRequest, res) => {
  try {
    const { dslSource: rawDsl, structuredData: rawStructured, projectId, universeId, price, snapshotHash, editorVersion } = req.body;
    let fileOverlay: Array<{ name: string; content: string }> | undefined;
    if (typeof req.body?.fileOverlay === "string") {
      try {
        fileOverlay = JSON.parse(req.body.fileOverlay) as Array<{ name: string; content: string }>;
      } catch {
        fileOverlay = undefined;
      }
    } else if (Array.isArray(req.body?.fileOverlay)) {
      fileOverlay = req.body.fileOverlay as Array<{ name: string; content: string }>;
    }
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    let structuredData: LearningUniverseStructured | undefined;
    if (rawStructured) {
      structuredData = typeof rawStructured === "string"
        ? JSON.parse(rawStructured) as LearningUniverseStructured
        : rawStructured as LearningUniverseStructured;
    }

    let filesToProcess = req.files as Express.Multer.File[] || [];

    // If a projectId was provided, fetch the files from the Overleaf-style project.
    // This mirrors Free Resources: DB LatexFile.name is the logical filename,
    // while s3Url points at /uploads/projects/:projectId/:storedFilename.
    if (projectId) {
      const project = await prisma.latexProject.findUnique({ where: { id: projectId } });
      if (!project) {
        throw new AppError(404, "LaTeX project not found");
      }
      if (project.ownerId !== userId) {
        throw new AppError(403, "Unauthorized access to project");
      }

      const projectFiles = await prisma.latexFile.findMany({ where: { projectId } });
      const projectDir = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads", "projects", projectId);
      const seenAssetNames = new Set(filesToProcess.map((file) => file.originalname));
      const isBinaryAsset = (name: string) =>
        /\.(png|jpe?g|gif|svg|webp|pdf|mp4|webm|mov|m4v)$/i.test(name);

      // Always include binary assets from project asset folders on disk.
      const assetSubdirs = ["assets/images", "assets/videos", "assets/downloads"];
      for (const subdir of assetSubdirs) {
        const assetDir = path.join(projectDir, ...subdir.split("/"));
        if (!fs.existsSync(assetDir)) continue;
        for (const entry of fs.readdirSync(assetDir, { withFileTypes: true })) {
          if (!entry.isFile() || !isBinaryAsset(entry.name)) continue;
          if (seenAssetNames.has(entry.name)) continue;
          const filePath = path.join(assetDir, entry.name);
          const stat = fs.statSync(filePath);
          filesToProcess.push({
            originalname: entry.name,
            mimetype: mime.lookup(entry.name) || "application/octet-stream",
            size: stat.size,
            path: filePath,
          } as Express.Multer.File);
          seenAssetNames.add(entry.name);
        }
      }

      for (const pFile of projectFiles) {
        if (pFile.isFolder || pFile.name === "main.tex" || pFile.path.endsWith(".tex")) continue;
        if (!isBinaryAsset(pFile.name) && !pFile.s3Url) continue;
        if (seenAssetNames.has(pFile.name)) continue;

        let filePath: string | null = null;

        if (pFile.s3Url) {
          const physicalFilename = path.basename(pFile.s3Url);
          const candidate = path.join(projectDir, physicalFilename);
          if (fs.existsSync(candidate)) filePath = candidate;
        }

        if (!filePath) {
          const ext = path.extname(pFile.name);
          const byId = path.join(projectDir, `${pFile.id}${ext}`);
          if (fs.existsSync(byId)) filePath = byId;
        }

        if (!filePath) {
          const byName = path.join(projectDir, pFile.name);
          if (fs.existsSync(byName)) filePath = byName;
        }

        if (filePath) {
          const stat = fs.statSync(filePath);
          filesToProcess.push({
            originalname: pFile.name,
            mimetype: mime.lookup(pFile.name) || "application/octet-stream",
            size: stat.size,
            path: filePath,
          } as Express.Multer.File);
          seenAssetNames.add(pFile.name);
        }
      }
    }

    let dslSource = rawDsl as string | undefined;

    if (!dslSource?.trim() && structuredData) {
      dslSource = emitLearningUniverseDsl(structuredData as LearningUniverseStructured);
    }

    if (!dslSource?.trim() && !projectId) {
      throw new AppError(400, "Provide dslSource, structuredData, or projectId");
    }

    let effectiveProjectId = typeof projectId === "string" && projectId.trim() ? projectId : undefined;

    if (!effectiveProjectId && structuredData) {
      effectiveProjectId = await ensureProjectForStructuredPublish({
        userId,
        structuredData,
        universeId: typeof universeId === "string" ? universeId : undefined,
        dslSource,
      });
    }

    if (effectiveProjectId) {
      const pipeline = await runLuPublishPipeline({
        projectId: effectiveProjectId,
        universeId: universeId as string | undefined,
        userId,
        price: Number(price) || 0,
        files: filesToProcess,
        dslSource,
        skipPdfCompile: false,
        fileOverlay,
        snapshotHash: typeof snapshotHash === "string" ? snapshotHash : undefined,
        editorVersion: Number(editorVersion) || undefined,
      });

      if (!pipeline.success) {
        const firstError = pipeline.issues.find((i) => i.severity === "error");
        const stage = pipeline.stages.find((s) => !s.success);
        throw new AppError(
          400,
          firstError?.message || stage?.error || "Publish pipeline failed"
        );
      }

      return res.json({ success: true, data: pipeline.universe, pipeline: { stages: pipeline.stages } });
    }

    throw new AppError(400, "LU v2 publish requires structuredData or projectId.");
  } catch (err) {
    console.error("[LU Publish]", err);
    let message = err instanceof Error ? err.message : "Failed to publish learning universe";
    if (message.includes("Transaction already closed") || message.includes("interactive transaction timeout")) {
      message =
        "Publish timed out while saving your course structure. This is fixed in the latest server — restart the backend and try again. Very large courses may take up to 2 minutes.";
    }
    const status =
      err instanceof AppError
        ? err.statusCode
        : message.includes("Colab") || message.includes("asset not found")
          ? 400
          : 500;
    res.status(status).json({ success: false, error: message });
  }
});


router.post("/:id/toggle-publish", authenticate, requireRole("instructor", "admin"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const universe = await prisma.learningUniverse.findUnique({ where: { id: req.params.id } });
    if (!universe) return res.status(404).json({ success: false, error: "Learning Universe not found" });
    if (universe.instructorId !== userId) return res.status(403).json({ success: false, error: "Unauthorized" });

    const nextStatus = universe.status === "published" ? "draft" : "published";
    const updated = await prisma.learningUniverse.update({
      where: { id: universe.id },
      data: {
        status: nextStatus,
        publishedAt: nextStatus === "published" ? new Date() : null,
      },
    });

    if (nextStatus === "published") {
      const { syncCatalogOnPublish } = await import("../services/productRoutingService.js");
      await syncCatalogOnPublish(universe.id);
    } else {
      const { syncCatalogOnUnpublish } = await import("../services/productRoutingService.js");
      await syncCatalogOnUnpublish(universe.id);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to update publish status" });
  }
});

router.post("/:id/duplicate", authenticate, requireRole("instructor", "admin"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");

    const source = await prisma.learningUniverse.findUnique({
      where: { id: req.params.id },
      include: { assets: true },
    });
    if (!source) return res.status(404).json({ success: false, error: "Learning Universe not found" });
    if (source.instructorId !== userId) return res.status(403).json({ success: false, error: "Unauthorized" });

    const project = await prisma.latexProject.create({
      data: {
        title: `${source.title} Copy`,
        ownerId: userId,
        files: {
          create: [{
            name: "main.tex",
            path: "/main.tex",
            isFolder: false,
            content: source.dslSource,
          }],
        },
      },
      include: { files: true },
    });

    const projectDir = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads", "projects", project.id);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    const filesToProcess: Express.Multer.File[] = [];
    for (const asset of source.assets) {
      const sourcePath = path.join(ASSETS_DIR, source.id, asset.storedFilename);
      if (!fs.existsSync(sourcePath)) continue;

      const ext = path.extname(asset.filename);
      const storedProjectFilename = `${randomUUID()}${ext}`;
      const projectAssetPath = path.join(projectDir, storedProjectFilename);
      fs.copyFileSync(sourcePath, projectAssetPath);

      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
      await prisma.latexFile.create({
        data: {
          projectId: project.id,
          name: asset.filename,
          path: `/${asset.filename}`,
          isFolder: false,
          s3Url: `${baseUrl}/uploads/projects/${project.id}/${storedProjectFilename}`,
          content: null,
        },
      });

      filesToProcess.push({
        originalname: asset.filename,
        mimetype: asset.mimeType,
        size: asset.size,
        path: projectAssetPath,
      } as Express.Multer.File);
    }

    const pipeline = await runLuPublishPipeline({
      projectId: project.id,
      userId,
      price: source.price ?? 0,
      files: filesToProcess,
      dslSource: source.dslSource,
      skipPdfCompile: false,
    });

    if (!pipeline.success) {
      const firstError = pipeline.issues.find((i) => i.severity === "error");
      const stage = pipeline.stages.find((s) => !s.success);
      throw new AppError(
        400,
        firstError?.message || stage?.error || "Duplicate publish pipeline failed"
      );
    }

    res.json({ success: true, data: pipeline.universe, pipeline: { stages: pipeline.stages } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to duplicate Learning Universe" });
  }
});

router.delete("/:id", authenticate, requireRole("instructor", "admin"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");

    const force = req.query.force === "true";
    const universe = await prisma.learningUniverse.findUnique({
      where: { id: req.params.id },
      include: {
        assets: true,
        _count: { select: { enrollments: true, certificates: true } },
      },
    });
    if (!universe) return res.status(404).json({ success: false, error: "Learning Universe not found" });
    if (universe.instructorId !== userId && !isAdminRole(req.user?.role)) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const hasLearners = universe._count.enrollments > 0 || universe._count.certificates > 0;

    // P3 safety: never hard-delete learner history. Archive + hide catalog instead.
    if (hasLearners || !force) {
      const archived = await prisma.learningUniverse.update({
        where: { id: universe.id },
        data: { status: "archived", publishedAt: null },
      });
      try {
        const { syncCatalogOnUnpublish } = await import("../services/productRoutingService.js");
        const { syncProductOnUnpublish } = await import("../services/productCatalogService.js");
        await syncCatalogOnUnpublish(universe.id);
        await syncProductOnUnpublish({ learningUniverseId: universe.id });
      } catch (syncErr) {
        console.warn("[LU delete] catalog sync after archive failed:", syncErr);
      }

      return res.json({
        success: true,
        action: "archived",
        message: hasLearners
          ? "Learning Universe archived instead of deleted to preserve student enrollments and certificates."
          : "Learning Universe archived. Use force=true only when no learner history exists and hard delete is intentional.",
        learningUniverse: { id: archived.id, status: archived.status },
        impact: {
          enrollments: universe._count.enrollments,
          certificates: universe._count.certificates,
          canHardDelete: !hasLearners,
        },
      });
    }

    // Collect files to delete (hard delete path — no learner history)
    const filesToDelete: string[] = [];
    const dirsToDelete: string[] = [];

    if (universe.thumbnail) {
      const thumbnailPath = path.join(UPLOAD_DIR, path.basename(universe.thumbnail));
      filesToDelete.push(thumbnailPath);
    }
    if (universe.bannerUrl) {
      const bannerPath = path.join(UPLOAD_DIR, path.basename(universe.bannerUrl));
      filesToDelete.push(bannerPath);
    }

    const universeAssetsDir = path.join(ASSETS_DIR, universe.id);
    dirsToDelete.push(universeAssetsDir);

    if (universe.sourceProjectId) {
      const projectDir = path.join(UPLOAD_DIR, "projects", universe.sourceProjectId);
      dirsToDelete.push(projectDir);
    }

    await prisma.$transaction(async (tx) => {
      await tx.learningUniverse.delete({ where: { id: universe.id } });
    });

    for (const filePath of filesToDelete) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    }

    for (const dirPath of dirsToDelete) {
      try {
        if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete directory ${dirPath}:`, err);
      }
    }

    res.json({ success: true, action: "deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to delete Learning Universe" });
  }
});

export { router as learningUniverseRouter };


