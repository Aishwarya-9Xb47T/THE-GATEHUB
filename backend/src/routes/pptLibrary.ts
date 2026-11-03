import { Router } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import crypto from "crypto";
import { authenticate, optionalAuthenticate, requireRole, requireAdmin } from "../middlewares/auth.js";
import { requireInstructorApproved } from "../middlewares/instructorApproval.js";
import { ROLES } from "../utils/roles.js";
import { AppError } from "../middlewares/errorHandler.js";
import * as controller from "../controllers/pptLibraryController.js";

const router = Router();

// Configure Multer for PPT and PPTX uploads
const tempStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `ppt-upload-${unique}${ext}`);
  },
});

const PPT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB max for presentations

const pptFileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === "file") {
    if (ext === ".pptx" || ext === ".ppt" || ext === ".pdf") {
      return cb(null, true);
    }
    return cb(new AppError(400, "Only .pptx, .ppt presentations and .pdf document files are supported"));
  }

  if (file.fieldname === "thumbnail") {
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      return cb(null, true);
    }
    return cb(new AppError(400, "Thumbnail must be an image file (jpg, png, webp, gif)"));
  }

  cb(null, true);
};

const pptUpload = multer({
  storage: tempStorage,
  limits: { fileSize: PPT_MAX_FILE_SIZE },
  fileFilter: pptFileFilter,
});

// ==========================================
// Public / Authenticated Library Browsing
// ==========================================
router.get("/", optionalAuthenticate, controller.getLibraryResources);
router.get("/topics", optionalAuthenticate, controller.getLibraryTopics);
router.get("/topics/:topicId", optionalAuthenticate, controller.getLibraryTopicById);
router.get("/topics/:topicId/subtopics", optionalAuthenticate, controller.getTopicSubtopics);
router.get("/categories", optionalAuthenticate, controller.getLibraryTopics);
router.get("/categories/:topicId", optionalAuthenticate, controller.getLibraryTopicById);
router.get("/categories/:topicId/subcategories", optionalAuthenticate, controller.getTopicSubtopics);
router.get("/categories/:topicId/subtopics", optionalAuthenticate, controller.getTopicSubtopics);
router.get("/my", authenticate, requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN), controller.getMyResources);
router.get("/admin/all", authenticate, requireAdmin(), controller.getAdminPptLibrary);

router.get("/:pptId", optionalAuthenticate, controller.getResourceDetail);
router.get("/:pptId/preview", optionalAuthenticate, controller.previewResourceFile);
router.get("/:pptId/download", optionalAuthenticate, controller.downloadResourceFile);

// ==========================================
// Category / Topic Management
// ==========================================
router.post(
  "/topics",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  requireInstructorApproved,
  controller.createTopic
);
router.patch(
  "/topics/:topicId",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  controller.updateTopic
);
router.delete(
  "/topics/:topicId",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  controller.deleteTopic
);

router.post(
  "/subtopics",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  requireInstructorApproved,
  controller.createSubtopic
);
router.patch(
  "/subtopics/:subtopicId",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  controller.updateSubtopic
);
router.delete(
  "/subtopics/:subtopicId",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  controller.deleteSubtopic
);

// ==========================================
// PPT Resource Lifecycle (Upload, Replace, Publish, Delete)
// ==========================================
router.post(
  "/upload",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  requireInstructorApproved,
  pptUpload.fields([
    { name: "file", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  controller.uploadResource
);

router.post(
  "/:pptId/replace",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  requireInstructorApproved,
  pptUpload.single("file"),
  controller.replaceResourceFile
);

router.patch(
  "/:pptId",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  controller.updateResource
);

router.post(
  "/:pptId/publish",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  requireInstructorApproved,
  controller.publishResource
);

router.post(
  "/:pptId/unpublish",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  controller.unpublishResource
);

router.delete(
  "/:pptId",
  authenticate,
  requireRole(ROLES.INSTRUCTOR, ROLES.ADMIN),
  controller.deleteResource
);

// Admin-specific actions
router.patch(
  "/admin/:pptId/status",
  authenticate,
  requireAdmin(),
  controller.updateAdminResourceStatus
);

router.delete(
  "/admin/:pptId",
  authenticate,
  requireAdmin(),
  controller.deleteResource
);

export default router;

