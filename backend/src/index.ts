import "./config/env.js";
import "express-async-errors";
import { JWT_SECRET } from "./config/jwt.js";
void JWT_SECRET;

const fmtMb = (b: number) => (b / 1024 / 1024).toFixed(2) + " MB";
console.log(`[MEM] After env | RSS: ${fmtMb(process.memoryUsage().rss)} | Heap: ${fmtMb(process.memoryUsage().heapUsed)}`);

process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] Unhandled promise rejection (server kept alive):", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[PROCESS] Uncaught exception (server kept alive):", error);
});
import express, { type Request, type Response } from "express";
import cors from "cors";
import passport from "passport";
import path from "path";
import rateLimit from "express-rate-limit";
import fs from "fs";
import { createSecurityHeadersMiddleware } from "./middlewares/securityHeaders.js";
import { authRouter } from "./routes/auth.js";
import { userRouter } from "./routes/users.js";
import { courseRouter } from "./routes/courses.js";
import { categoryRouter } from "./routes/categories.js";
import { sectionRouter } from "./routes/sections.js";
import { lectureRouter } from "./routes/lectures.js";
import { quizRouter } from "./routes/quizzes.js";
import { quizBuilderRouter } from "./routes/quizBuilder.js";
import { enrollmentRouter } from "./routes/enrollments.js";
import { reviewRouter } from "./routes/reviews.js";
import { wishlistRouter } from "./routes/wishlist.js";
import { adminRouter } from "./routes/admin.js";
import { uploadRouter } from "./routes/upload.js";
import { notesRouter } from "./routes/notes.js";
import { latexRouter } from "./routes/latex.js";
import { latexProjectsRouter } from "./routes/latexProjects.js";
import { analyticsRouter } from "./routes/analytics.js";
import { paymentRouter } from "./routes/payments.js";
import { commerceRouter } from "./routes/commerce.js";
import certificatesRouter from "./routes/certificatesRoutes.js";
import { testAuthRouter } from "./routes/test-auth.js";
import { avatarRouter } from "./routes/avatar.js";
import { resourceRouter } from "./routes/resources.js";
import { learningUniverseRouter } from "./routes/learning-universe.js";
import learningRouter from "./routes/learning.js";
import { projectReviewRouter, notificationRouter } from "./routes/projectReview.js";
import { docsRouter } from "./routes/docs.js";
import { bannersRouter } from "./routes/banners.js";
import { integrationsRouter } from "./routes/integrations.js";
import { aiArchitectRouter } from "./routes/aiArchitect.js";
import { assessmentStudioRouter } from "./routes/assessmentStudio.js";
import { contentBuilderRouter } from "./routes/contentBuilder.js";
import { googleWorkspaceRouter } from "./routes/googleWorkspace.js";
import providersRouter from "./routes/providers.js";
import contentSourcesRouter from "./routes/contentSources.js";
import { liveSessionRouter } from "./routes/liveSessions.js";
import { templateLibraryRouter } from "./routes/templateLibrary.js";
import { aiQuizDesignerRouter } from "./routes/aiQuizDesigner.js";
import { learningPlatformsRouter } from "./routes/learningPlatforms.routes.js";
import { assessmentsV2Router } from "./assessment-platform/routes/assessments.js";
import { questionsV2Router } from "./assessment-platform/routes/questions.js";
import { assessmentFeatureFlagsRouter } from "./assessment-platform/routes/featureFlags.js";
import classroomStudioRouter from "./routes/classroomStudio.js";
import { multimodalKnowledgeRouter } from "./routes/multimodalKnowledge.js";
import { antigravityV2Router } from "./routes/antigravityV2.js";
import { registerBuiltinQuestionPlugins } from "./assessment-platform/plugins/registerQuestionPlugins.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { notFound } from "./middlewares/notFound.js";
import type { AuthRequest } from "./middlewares/auth.js";
import {
  getUploadRoot,
  requireUploadAccess,
  resolveSafeUploadPath,
  sendUploadFile,
} from "./middlewares/uploadAccess.js";
import { serveStoredUpload } from "./middlewares/persistUpload.js";
import { pingB2Storage } from "./services/b2StorageService.js";

registerBuiltinQuestionPlugins();
import "./services/providers/index.js";
import "./services/content-sources/index.js";
import { createYjsServer } from "./ws/yjsServer.js";
import { createLiveSessionServer } from "./ws/liveSessionServer.js";
import { handleClassroomStudioUpgrade } from "./ws/classroomStudioServer.js";
import { ensureSuperAdminExists } from "./services/superAdminBootstrap.js";
import { getPlatformSettings } from "./services/platformSettingsService.js";
import { bootstrapAiProviders } from "./services/ai/AiRouter.js";
import { ensureDocIndexLoaded } from "./services/docsAssistantService.js";
import { waitForDatabase } from "./utils/waitForDatabase.js";
import { logBannerStudioStartupStatus } from "./services/bannerService.js";

const requiredEnv = ["DATABASE_URL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "OPENAI_API_KEY"];
requiredEnv.forEach((env) => {
  if (!process.env[env]) {
    console.warn(`[WARNING] Missing environment variable: ${env}. Some features may not work.`);
  }
});

// Ensure required directories exist
const uploadDir = process.env.UPLOAD_DIR || "uploads";
const latexDir = path.join(uploadDir, "latex");
const latexPdfDir = path.join(latexDir, "pdfs");
const requiredDirs = [uploadDir, latexDir, latexPdfDir];

requiredDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    console.log(`[SETUP] Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
});

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

app.use(createSecurityHeadersMiddleware());

// Global API rate limit — production only; auth and editor autosave use dedicated rules.
if (isProduction) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests" },
    skip: (req) => {
      const path = req.path;
      if (path.startsWith("/api/auth")) return true;
      if (path.startsWith("/api/latex-projects/") && path.endsWith("/files/content")) return true;
      return false;
    },
  });
  app.use(limiter);
}

const allowedOrigins = [
  ...(isProduction ? [] : ["http://localhost:5173", "http://localhost:5174"]),
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((o) => String(o).replace(/\/$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin / curl / server-to-server
      const normalized = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      // Dev-only: allow other localhost ports
      if (!isProduction && /^http:\/\/localhost:\d+$/.test(normalized)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

// Passport (no sessions — JWT-only, used for OAuth)
app.use(passport.initialize());

// Razorpay webhook (needs raw body for signature verification)
app.use("/api/payments/razorpay/webhook", express.raw({ type: "application/json" }));
// Legacy Stripe webhook
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Compiled LaTeX PDFs — register BEFORE generic /uploads static (HEAD + GET, no stale cache)
async function serveCompiledLatexPdf(req: Request, res: Response) {
  const filename = req.params.filename;
  if (!/^compiled-[a-zA-Z0-9_-]+\.pdf$/.test(filename)) {
    return res.status(400).json({ success: false, error: "Invalid PDF filename" });
  }

  const filePath = path.join(process.cwd(), uploadDir, "latex", "pdfs", filename);

  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.size < 128) {
      return res.status(500).json({ success: false, error: "PDF file is empty or invalid" });
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": stat.size,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      "Access-Control-Allow-Origin": process.env.CLIENT_URL || "http://localhost:5173",
    });

    if (req.method === "HEAD") {
      return res.status(200).end();
    }

    return fs.createReadStream(filePath).pipe(res);
  }

  const served = await serveStoredUpload(res, `latex/pdfs/${filename}`);
  if (served) return;
  return res.status(404).json({ success: false, error: "PDF not found" });
}

app.head("/uploads/latex/pdfs/:filename", requireUploadAccess as any, serveCompiledLatexPdf);
app.get("/uploads/latex/pdfs/:filename", requireUploadAccess as any, serveCompiledLatexPdf);

// Authenticated uploads (except /uploads/public/**). Query ?token= supported for media elements.
app.use("/uploads", requireUploadAccess as any, (req, res, next) => {
  if (req.path.toLowerCase().endsWith(".vtt")) {
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
  }
  next();
});

app.get("/uploads/projects/:projectId/:filename", async (req, res) => {
  const { projectId, filename } = req.params;
  const relative = `projects/${projectId}/${filename}`;
  const filePath = resolveSafeUploadPath(relative);
  if (!filePath) {
    return res.status(400).json({ success: false, error: "Invalid path" });
  }
  if (fs.existsSync(filePath)) {
    return sendUploadFile(res, filePath);
  }
  const served = await serveStoredUpload(res, relative);
  if (served) return;
  return res.status(404).json({ success: false, error: "File not found" });
});

app.use("/uploads", express.static(getUploadRoot(), {
  setHeaders(res, filePath) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (filePath.toLowerCase().endsWith(".vtt")) {
      res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    }
  },
}));

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/users", avatarRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/quizzes", quizRouter);
app.use("/api/quiz-builder", quizBuilderRouter);
app.use("/api/enrollments", enrollmentRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/admin", adminRouter);
app.use("/api/courses/:courseId/sections", sectionRouter);
app.use("/api/sections/:sectionId/lectures", lectureRouter);
app.use("/api/lectures", lectureRouter);
app.use("/api/courses", courseRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/latex", latexRouter);
app.use("/api/latex-projects", latexProjectsRouter);
app.use("/api/lectures/:lectureId/notes", notesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/commerce", commerceRouter);
app.use("/api/certificates", certificatesRouter);
if (process.env.NODE_ENV !== "production") {
  app.use("/api/test-auth", testAuthRouter);
}
app.use("/api/resources", resourceRouter);
app.use("/api/learning-universes", learningUniverseRouter);
app.use("/api/banners", bannersRouter);
app.use("/api/banner", bannersRouter);
app.use("/api/learning", learningRouter);
app.use("/api/docs", docsRouter);
app.use("/api/project-reviews", projectReviewRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/ai-architect", aiArchitectRouter);
app.use("/api/live-sessions", liveSessionRouter);
app.use("/api/template-library", templateLibraryRouter);
app.use("/api/ai-quiz-designer", aiQuizDesignerRouter);
app.use("/api/v2/assessments", assessmentsV2Router);
app.use("/api/v2/questions", questionsV2Router);
app.use("/api/assessment-platform/feature-flags", assessmentFeatureFlagsRouter);
app.use("/api/assessment-studio", assessmentStudioRouter);
app.use("/api/content-builder", contentBuilderRouter);
app.use("/api/google-workspace", googleWorkspaceRouter);
app.use("/api/providers", providersRouter);
app.use("/api/content-sources", contentSourcesRouter);
app.use("/api/learning-platforms", learningPlatformsRouter);
app.use("/api/classroom-studio", classroomStudioRouter);
app.use("/api/multimodal-knowledge", multimodalKnowledgeRouter);
app.use("/api/antigravity-v2", antigravityV2Router);

// Authenticated range streaming for uploaded videos (local) or signed B2 redirect
app.get("/uploads/*", requireUploadAccess as any, async (req, res, next) => {
  const relativePath = String((req.params as Record<string, string>)[0] || "");
  const filePath = resolveSafeUploadPath(relativePath);
  if (!filePath) {
    return res.status(400).json({ success: false, error: "Invalid path" });
  }

  const ext = path.extname(filePath).toLowerCase();
  const isVideo = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"].includes(ext);

  if (isVideo) {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const contentType = `video/${ext.slice(1) === "mov" ? "quicktime" : ext.slice(1)}`;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
        });
        return file.pipe(res);
      }

      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    const redirected = await serveStoredUpload(res, relativePath, { asVideo: true });
    if (redirected) return;
    return res.status(404).json({ success: false, error: "Video not found" });
  }

  if (fs.existsSync(filePath)) {
    return next();
  }

  const served = await serveStoredUpload(res, relativePath, { range: req.headers.range });
  if (served) return;
  return next();
});

app.get("/api/health", async (_req, res) => {
  try {
    const { prisma } = await import("./utils/prisma.js");
    await prisma.$queryRaw`SELECT 1`;
    const storage = await pingB2Storage();
    res.json({
      status: "ok",
      database: "connected",
      storage,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      database: "unreachable",
      timestamp: new Date().toISOString(),
      hint: "Start Docker Desktop, then: docker compose -f docker-compose.dev.yml up -d postgres",
    });
  }
});

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "GateHub Backend",
    status: "healthy",
    version: "1.0.0",
    uptime: process.uptime(),
  });
});

app.use(notFound);
app.use(errorHandler);

async function initializeBackgroundServices() {
  try {
    await waitForDatabase();
    await ensureSuperAdminExists();
    await getPlatformSettings();
    await bootstrapAiProviders();
    await ensureDocIndexLoaded();
    logBannerStudioStartupStatus();
    console.log("[SUCCESS] Background services initialized.");
  } catch (err) {
    console.error("[ERROR] Background initialization failed:", err);
  }
}

try {
  console.log(`[MEM] Before app.listen | RSS: ${fmtMb(process.memoryUsage().rss)} | Heap: ${fmtMb(process.memoryUsage().heapUsed)}`);
  const server = app.listen(PORT, () => {
    console.log(`[MEM] After app.listen | RSS: ${fmtMb(process.memoryUsage().rss)} | Heap: ${fmtMb(process.memoryUsage().heapUsed)}`);
    console.log(`[SUCCESS] Server running on http://localhost:${PORT}`);
    console.log("SERVER STARTED SUCCESSFULLY ON PORT 5000");
    void initializeBackgroundServices();
  });

  createYjsServer(server);
  createLiveSessionServer(server);

  // Handle Classroom Studio WebSocket upgrades
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/classroom-studio') {
      handleClassroomStudioUpgrade(request, socket, head);
    }
  });
} catch (error) {
  console.error("[FATAL ERROR] Failed to start server:", error);
  process.exit(1);
}





