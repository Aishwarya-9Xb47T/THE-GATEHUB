import { Router } from "express";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import { lazyHandler } from "../utils/lazyHandler.js";

const adminCtrl = () => import("../controllers/adminController.js");
const settingsCtrl = () => import("../controllers/adminSettingsController.js");
const aiCtrl = () => import("../controllers/adminAiController.js");

export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin());

// Dashboard & analytics (admin + super_admin)
adminRouter.get("/dashboard", lazyHandler(adminCtrl, "dashboard"));
adminRouter.get("/analytics", lazyHandler(adminCtrl, "adminAnalytics"));
adminRouter.get("/reports", lazyHandler(adminCtrl, "adminReports"));

// User management
adminRouter.get("/users", lazyHandler(adminCtrl, "listUsers"));
adminRouter.get("/users/:id", lazyHandler(adminCtrl, "getUserDetail"));
adminRouter.patch("/users/:id", lazyHandler(adminCtrl, "updateUser"));
adminRouter.delete("/users/:id", requireSuperAdmin(), lazyHandler(adminCtrl, "deleteUser"));
adminRouter.post("/users/:id/restore", requireSuperAdmin(), lazyHandler(adminCtrl, "restoreUser"));

// Courses & learning universes
adminRouter.get("/courses", lazyHandler(adminCtrl, "listCoursesAdmin"));
adminRouter.get("/courses/:id/deletion-impact", lazyHandler(adminCtrl, "getCourseDeletionImpact"));
adminRouter.patch("/courses/:id/status", lazyHandler(adminCtrl, "updateCourseStatus"));
adminRouter.delete("/courses/:id", lazyHandler(adminCtrl, "deleteCourseAdmin"));
adminRouter.get("/learning-universes", lazyHandler(adminCtrl, "listLearningUniversesAdmin"));
adminRouter.get(
  "/learning-universes/:id/deletion-impact",
  lazyHandler(adminCtrl, "getLearningUniverseDeletionImpact")
);
adminRouter.patch("/learning-universes/:id/status", lazyHandler(adminCtrl, "updateLearningUniverseStatus"));
adminRouter.delete("/learning-universes/:id", lazyHandler(adminCtrl, "deleteLearningUniverseAdmin"));

// Reviews & categories
adminRouter.get("/reviews", lazyHandler(adminCtrl, "listReviews"));
adminRouter.patch("/reviews/:id/hide", lazyHandler(adminCtrl, "hideReview"));
adminRouter.patch("/reviews/:id/unhide", lazyHandler(adminCtrl, "unhideReview"));
adminRouter.get("/categories", lazyHandler(adminCtrl, "listCategories"));
adminRouter.post("/categories", lazyHandler(adminCtrl, "createCategory"));
adminRouter.patch("/categories/:id", lazyHandler(adminCtrl, "updateCategory"));

// Platform settings & admin profile
adminRouter.get("/settings/health", lazyHandler(settingsCtrl, "getHealth"));
adminRouter.get("/settings/certificate-preview", lazyHandler(settingsCtrl, "getCertificatePreview"));
adminRouter.get("/settings/certificate-preview/html", lazyHandler(settingsCtrl, "getCertificatePreviewHtml"));
adminRouter.post("/settings/certificate-preview", lazyHandler(settingsCtrl, "postCertificatePreview"));
adminRouter.post("/settings/certificate-preview/pdf", lazyHandler(settingsCtrl, "postCertificatePreviewPdf"));
adminRouter.delete("/settings/certificate-asset/:type", lazyHandler(settingsCtrl, "deleteCertificateAsset"));
adminRouter.get("/settings/profile", lazyHandler(settingsCtrl, "getAdminProfile"));
adminRouter.patch("/settings/profile", lazyHandler(settingsCtrl, "updateAdminProfile"));
adminRouter.post("/settings/logout-all", lazyHandler(settingsCtrl, "logoutAllSessions"));
adminRouter.post("/settings/test-email", requireSuperAdmin(), lazyHandler(settingsCtrl, "testEmail"));
adminRouter.post(
  "/settings/upload/:type",
  upload.single("file"),
  lazyHandler(settingsCtrl, "uploadPlatformAsset")
);
adminRouter.get("/settings", lazyHandler(settingsCtrl, "getSettings"));
adminRouter.patch("/settings", lazyHandler(settingsCtrl, "updateSettings"));

// AI Provider management
adminRouter.get("/ai/providers", lazyHandler(aiCtrl, "getAiProviders"));
adminRouter.get("/ai/models", lazyHandler(aiCtrl, "getAiModels"));
adminRouter.get("/ai/health", lazyHandler(aiCtrl, "getAiHealth"));
adminRouter.get("/ai/status", lazyHandler(aiCtrl, "getAiStatus"));
adminRouter.post("/ai/provider", lazyHandler(aiCtrl, "setAiProvider"));
adminRouter.post("/ai/model", lazyHandler(aiCtrl, "setAiModel"));
adminRouter.patch("/ai/config", lazyHandler(aiCtrl, "patchAiConfig"));

// Super admin: admin management & audit logs
adminRouter.get("/admins", requireSuperAdmin(), lazyHandler(adminCtrl, "listAdmins"));
adminRouter.post("/admins", requireSuperAdmin(), lazyHandler(adminCtrl, "createAdmin"));
adminRouter.patch("/admins/:id", requireSuperAdmin(), lazyHandler(adminCtrl, "updateAdmin"));
adminRouter.delete("/admins/:id", requireSuperAdmin(), lazyHandler(adminCtrl, "removeAdmin"));
adminRouter.get("/admins/:id/activity", requireSuperAdmin(), lazyHandler(adminCtrl, "getAdminActivity"));
adminRouter.get("/audit-logs", requireSuperAdmin(), lazyHandler(adminCtrl, "listAuditLogs"));
