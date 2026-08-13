import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { latexUpload } from "../middlewares/latexUpload.js";
import { lazyHandler } from "../utils/lazyHandler.js";

const projectCtrl = () => import("../controllers/latexProjectController.js");
const versionCtrl = () => import("../controllers/latexVersionController.js");
const syncCtrl = () => import("../controllers/projectSyncController.js");
const luCtrl = () => import("../controllers/luProjectController.js");

export const latexProjectsRouter = Router();

latexProjectsRouter.use(authenticate);

latexProjectsRouter.get("/", lazyHandler(projectCtrl, "getProjects"));
latexProjectsRouter.post("/", lazyHandler(projectCtrl, "createProject"));
latexProjectsRouter.post("/lecture/:lectureId/ensure", lazyHandler(projectCtrl, "ensureLectureProject"));
latexProjectsRouter.get("/:projectId", lazyHandler(projectCtrl, "getProject"));
latexProjectsRouter.get("/:projectId/asset-url", lazyHandler(projectCtrl, "resolveProjectAssetUrl"));

latexProjectsRouter.get("/:projectId/versions", lazyHandler(versionCtrl, "listVersions"));
latexProjectsRouter.post("/:projectId/versions", lazyHandler(versionCtrl, "createManualSnapshot"));
latexProjectsRouter.get("/:projectId/versions/compare", lazyHandler(versionCtrl, "compareVersions"));
latexProjectsRouter.get("/:projectId/versions/:versionId", lazyHandler(versionCtrl, "getVersion"));
latexProjectsRouter.post("/:projectId/versions/:versionId/restore", lazyHandler(versionCtrl, "restoreVersion"));
latexProjectsRouter.get("/:projectId/timeline", lazyHandler(versionCtrl, "getTimeline"));

latexProjectsRouter.get("/:projectId/lu/state", lazyHandler(luCtrl, "getLuAuthoringStateHandler"));
latexProjectsRouter.post("/:projectId/lu/structure", lazyHandler(luCtrl, "mutateLuStructure"));
latexProjectsRouter.post("/:projectId/lu/undo", lazyHandler(luCtrl, "undoLuTransaction"));
latexProjectsRouter.post("/:projectId/lu/redo", lazyHandler(luCtrl, "redoLuTransaction"));
latexProjectsRouter.get("/:projectId/lu/meta", lazyHandler(luCtrl, "getLuProjectMeta"));
latexProjectsRouter.post("/:projectId/lu/ensure", lazyHandler(luCtrl, "ensureLuProject"));
latexProjectsRouter.post("/:projectId/lu/regenerate-main", lazyHandler(luCtrl, "regenerateLuMainTex"));
latexProjectsRouter.get("/:projectId/lu/resolve", lazyHandler(luCtrl, "resolveLuProject"));
latexProjectsRouter.get("/:projectId/lu/validate-build", lazyHandler(luCtrl, "validateLuBuild"));
latexProjectsRouter.post("/:projectId/lu/prepare-build", lazyHandler(luCtrl, "prepareLuBuildHandler"));
latexProjectsRouter.get("/:projectId/lu/ai-guide/files", lazyHandler(luCtrl, "listLuAuthoringGuideFilesHandler"));
latexProjectsRouter.post("/:projectId/lu/ai-guide", lazyHandler(luCtrl, "generateLuAuthoringGuideHandler"));

latexProjectsRouter.post("/:projectId/sync/flush", lazyHandler(syncCtrl, "flushProjectFiles"));
latexProjectsRouter.get("/:projectId/sync/snapshot", lazyHandler(syncCtrl, "getProjectSyncSnapshot"));

latexProjectsRouter.get("/:projectId/files/tree", lazyHandler(projectCtrl, "getProjectFilesTree"));
latexProjectsRouter.get("/:projectId/files/content", lazyHandler(projectCtrl, "getFileContent"));
latexProjectsRouter.put("/:projectId/files/content", lazyHandler(projectCtrl, "updateFileContent"));
latexProjectsRouter.post("/:projectId/files/create", lazyHandler(projectCtrl, "createFile"));
latexProjectsRouter.post("/:projectId/files/upload", latexUpload.single("file"), lazyHandler(projectCtrl, "uploadFile"));
latexProjectsRouter.patch("/:projectId/files/rename", lazyHandler(projectCtrl, "renameFile"));
latexProjectsRouter.patch("/:projectId/files/move", lazyHandler(projectCtrl, "moveFile"));
latexProjectsRouter.delete("/:projectId/files/delete", lazyHandler(projectCtrl, "deleteFile"));
