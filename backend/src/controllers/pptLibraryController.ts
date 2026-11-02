import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import * as pptService from "../services/pptLibraryService.js";

export async function getLibraryResources(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, search, topicId, subtopicId, language, academicLevel, status, instructorId, sort } = req.query;

    const result = await pptService.listResources(
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: typeof search === "string" ? search : undefined,
        topicId: typeof topicId === "string" ? topicId : undefined,
        subtopicId: typeof subtopicId === "string" ? subtopicId : undefined,
        language: typeof language === "string" ? language : undefined,
        academicLevel: typeof academicLevel === "string" ? academicLevel : undefined,
        status: typeof status === "string" ? status : undefined,
        instructorId: typeof instructorId === "string" ? instructorId : undefined,
        sort: (sort as any) || "newest",
      },
      req.user
    );

    res.json({
      success: true,
      data: result.resources,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

export async function getLibraryTopics(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.user && isAdminRole(req.user.role) && req.query.all === "true";
    const topics = await pptService.listTopics(Boolean(includeInactive));
    res.json({ success: true, data: topics });
  } catch (err) {
    next(err);
  }
}

export async function getLibraryTopicById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const topic = await pptService.getTopicById(req.params.topicId);
    res.json({ success: true, data: topic });
  } catch (err) {
    next(err);
  }
}

export async function getTopicSubtopics(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.user && isAdminRole(req.user.role) && req.query.all === "true";
    const subtopics = await pptService.listSubtopicsByTopic(req.params.topicId, Boolean(includeInactive));
    res.json({ success: true, data: subtopics });
  } catch (err) {
    next(err);
  }
}

export async function getResourceDetail(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const resource = await pptService.getResourceById(req.params.pptId, req.user);
    res.json({ success: true, data: resource });
  } catch (err) {
    next(err);
  }
}

export async function previewResourceFile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const resource = await pptService.getResourceById(req.params.pptId, req.user);
    const file = await pptService.getResourceFileBuffer(resource.id);

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", file.size);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
}

export async function downloadResourceFile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const resource = await pptService.getResourceById(req.params.pptId, req.user);
    const file = await pptService.getResourceFileBuffer(resource.id);

    // Record download asynchronously
    const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";
    pptService.recordDownload(resource.id, req.user?.id, ip, userAgent).catch((err) => {
      console.warn("[PPT_LIBRARY] Download log error:", err);
    });

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", file.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`
    );
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
}

export async function getMyResources(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const { page, limit, status, search } = req.query;

    const result = await pptService.listResources(
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        instructorId: req.user.id,
        status: typeof status === "string" ? status : undefined,
        search: typeof search === "string" ? search : undefined,
      },
      req.user
    );

    const stats = await pptService.getInstructorDashboardStats(req.user.id);

    res.json({
      success: true,
      data: result.resources,
      pagination: result.pagination,
      stats,
    });
  } catch (err) {
    next(err);
  }
}

export async function createTopic(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const topic = await pptService.createTopic({
      ...req.body,
      createdById: req.user.id,
    });
    res.status(201).json({ success: true, data: topic });
  } catch (err) {
    next(err);
  }
}

export async function updateTopic(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || !isAdminRole(req.user.role)) {
      throw new AppError(403, "Administrator access required to update topics");
    }
    const topic = await pptService.updateTopic(req.params.topicId, req.body);
    res.json({ success: true, data: topic });
  } catch (err) {
    next(err);
  }
}

export async function deleteTopic(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || !isAdminRole(req.user.role)) {
      throw new AppError(403, "Administrator access required to delete topics");
    }
    const result = await pptService.deleteTopic(req.params.topicId);
    res.json({ success: true, message: result.message });
  } catch (err) {
    next(err);
  }
}

export async function createSubtopic(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const subtopic = await pptService.createSubtopic({
      ...req.body,
      createdById: req.user.id,
    });
    res.status(201).json({ success: true, data: subtopic });
  } catch (err) {
    next(err);
  }
}

export async function updateSubtopic(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || !isAdminRole(req.user.role)) {
      throw new AppError(403, "Administrator access required to update subtopics");
    }
    const subtopic = await pptService.updateSubtopic(req.params.subtopicId, req.body);
    res.json({ success: true, data: subtopic });
  } catch (err) {
    next(err);
  }
}

export async function deleteSubtopic(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || !isAdminRole(req.user.role)) {
      throw new AppError(403, "Administrator access required to delete subtopics");
    }
    const result = await pptService.deleteSubtopic(req.params.subtopicId);
    res.json({ success: true, message: result.message });
  } catch (err) {
    next(err);
  }
}

export async function uploadResource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const pptFile = files?.file?.[0] || (req.file as Express.Multer.File | undefined);
    const thumbFile = files?.thumbnail?.[0];

    if (!pptFile) {
      throw new AppError(400, "Presentation file is required");
    }

    let tags: string[] = [];
    if (typeof req.body.tags === "string") {
      try {
        tags = JSON.parse(req.body.tags);
      } catch {
        tags = req.body.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      }
    } else if (Array.isArray(req.body.tags)) {
      tags = req.body.tags;
    }

    const created = await pptService.uploadAndCreateResource({
      title: req.body.title,
      description: req.body.description,
      topicId: req.body.topicId,
      subtopicId: req.body.subtopicId,
      instructorId: req.user.id,
      file: pptFile,
      thumbnailFile: thumbFile,
      tags,
      language: req.body.language,
      academicLevel: req.body.academicLevel,
      status: req.body.status === "published" ? "published" : "draft",
    });

    res.status(201).json({
      success: true,
      message: "Presentation uploaded successfully",
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateResource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    let tags = req.body.tags;
    if (typeof tags === "string") {
      try {
        tags = JSON.parse(tags);
      } catch {
        tags = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      }
    }

    const updated = await pptService.updateResourceMetadata(
      req.params.pptId,
      req.user.id,
      req.user.role,
      { ...req.body, tags }
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function replaceResourceFile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const file = req.file;
    if (!file) throw new AppError(400, "Replacement presentation file is required");

    const updated = await pptService.replaceResourceFile(
      req.params.pptId,
      file,
      req.user.id,
      req.user.role,
      req.body.changeNote
    );

    res.json({
      success: true,
      message: "Presentation file replaced and version updated successfully",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function publishResource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const updated = await pptService.setResourcePublishStatus(
      req.params.pptId,
      req.user.id,
      req.user.role,
      "published"
    );
    res.json({ success: true, message: "Presentation published successfully", data: updated });
  } catch (err) {
    next(err);
  }
}

export async function unpublishResource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const updated = await pptService.setResourcePublishStatus(
      req.params.pptId,
      req.user.id,
      req.user.role,
      "draft"
    );
    res.json({ success: true, message: "Presentation moved to draft", data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteResource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const result = await pptService.deleteResource(req.params.pptId, req.user.id, req.user.role);
    res.json({ success: true, message: result.message });
  } catch (err) {
    next(err);
  }
}

export async function getAdminPptLibrary(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || !isAdminRole(req.user.role)) {
      throw new AppError(403, "Administrator access required");
    }

    const { page, limit, search, topicId, status, instructorId, sort } = req.query;
    const [result, stats] = await Promise.all([
      pptService.listResources(
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search: typeof search === "string" ? search : undefined,
          topicId: typeof topicId === "string" ? topicId : undefined,
          status: typeof status === "string" ? status : undefined,
          instructorId: typeof instructorId === "string" ? instructorId : undefined,
          sort: (sort as any) || "newest",
        },
        req.user
      ),
      pptService.getAdminDashboardStats(),
    ]);

    res.json({
      success: true,
      data: result.resources,
      pagination: result.pagination,
      stats,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAdminResourceStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || !isAdminRole(req.user.role)) {
      throw new AppError(403, "Administrator access required");
    }
    const { status } = req.body;
    if (!["published", "draft", "archived"].includes(status)) {
      throw new AppError(400, "Invalid status");
    }

    const updated = await pptService.setResourcePublishStatus(
      req.params.pptId,
      req.user.id,
      req.user.role,
      status
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
