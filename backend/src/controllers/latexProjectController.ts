import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { AuthRequest } from "../middlewares/auth.js";
import { getTemplate, templateFolderEntries } from "../services/latexProjectTemplates.js";
import { recordTimelineEvent } from "../services/latexVersionService.js";
import { sanitizeProjectFileContent } from "../services/latexContentSanitizer.js";
import { loadProjectFiles } from "../services/luProject/luProjectFiles.js";
import {
  resolveProjectAssetPublicUrl,
  resolveProjectAssetPhysicalPath,
} from "../services/luProject/luProjectAssetResolver.js";
import { isAdminRole } from "../utils/roles.js";
import { persistMulterFile } from "../middlewares/persistUpload.js";

async function assertProjectAccess(projectId: string, userId: string, role?: string) {
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    include: { collaborators: { select: { userId: true } } },
  });
  if (!project) throw new AppError(404, "Project not found");
  if (isAdminRole(role)) return project;
  if (project.ownerId !== userId && !project.collaborators.some((c) => c.userId === userId)) {
    throw new AppError(403, "Not authorized to access this project");
  }
  return project;
}

// Get all projects for the logged in user
export async function getProjects(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const projects = await prisma.latexProject.findMany({
    where: { ownerId: userId },
    include: {
      collaborators: { include: { user: { select: { id: true, firstName: true, email: true } } } }
    },
    orderBy: { updatedAt: 'desc' }
  });
  res.json({ success: true, projects });
}

// Create a new empty or templated project
export async function createProject(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const { title, lectureId, template: templateId } = req.body;

  if (!title) throw new AppError(400, "Project title is required");

  const template = getTemplate(typeof templateId === "string" ? templateId : "blank");
  const fileEntries = templateFolderEntries(template);

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.latexProject.create({
      data: {
        title,
        ownerId: userId,
        lectureId: lectureId || null,
        files: {
          create: fileEntries.map((entry) => ({
            name: entry.name,
            path: entry.path,
            isFolder: entry.isFolder,
            content: entry.isFolder ? null : entry.content,
          })),
        },
      },
      include: { files: true },
    });
    return p;
  });

  recordTimelineEvent(project.id, "created", userId, { title, template: template.id }).catch(() => {});

  res.status(201).json({ success: true, project, template: template.id });
}

// Fetch single project with entire file tree
export async function getProject(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    include: { files: true, collaborators: true }
  });
  if (!project) throw new AppError(404, "Project not found");

  res.json({ success: true, project });
}

// Create a new logic file/folder inside a project
async function ensureParentFolders(projectId: string, filePath: string) {
  const parts = filePath.split("/").filter(Boolean);
  parts.pop();
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : `/${part}`;
    const existing = await prisma.latexFile.findFirst({ where: { projectId, path: acc } });
    if (!existing) {
      await prisma.latexFile.create({
        data: { projectId, path: acc, name: part, isFolder: true, content: null },
      });
    }
  }
}

export async function createFile(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const { path, name, isFolder, content } = req.body;

  if (!path || !name) throw new AppError(400, "Path and name are required");
  if (path.includes("..") || name.includes("..")) throw new AppError(400, "Invalid path: no directory traversal allowed");

  const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
  if (existing) throw new AppError(409, `A file or folder already exists at ${path}`);

  if (!isFolder) await ensureParentFolders(projectId, path);

  const file = await prisma.latexFile.create({
    data: {
      projectId,
      path,
      name,
      isFolder: !!isFolder,
      content: content || ""
    }
  });

  res.json({ success: true, file });
}

export async function updateFileContent(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const { fileId, content } = req.body;

  if (!fileId) throw new AppError(400, "fileId is required");

  const file = await prisma.latexFile.findUnique({
    where: { id: fileId, projectId }
  });

  if (!file) throw new AppError(404, "File not found");

  const sanitized =
    typeof content === "string" ? sanitizeProjectFileContent(file.path, content) : "";

  const updatedFile = await prisma.latexFile.update({
    where: { id: fileId },
    data: { content: sanitized },
  });

  recordTimelineEvent(projectId, "edited", req.user!.id, {
    fileId,
    path: file.path,
  }).catch(() => {});

  res.json({ success: true, file: updatedFile });
}

export async function deleteFile(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const fileId = req.body.fileId || req.query.fileId as string;
  
  const file = await prisma.latexFile.findUnique({
    where: { id: fileId, projectId }
  });

  if (!file) {
    throw new AppError(404, "File not found");
  }

  // If it's a folder, delete all files that are inside this folder
  if (file.isFolder) {
    await prisma.latexFile.deleteMany({
      where: {
        projectId,
        path: {
          startsWith: `${file.path}/`
        }
      }
    });
  }

  // Delete the file/folder itself
  await prisma.latexFile.delete({
    where: { id: fileId }
  });

  res.json({ success: true });
}

export async function uploadFile(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const pathField = req.body.path; // e.g., /images/logo.png

  if (!req.file) {
    throw new AppError(400, "No file uploaded.");
  }

  console.log("[VIDEO_UPLOAD_BACKEND] RECEIVED", {
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    storedFilename: req.file.filename,
    projectId,
    pathField
  });
  if (!pathField) {
    throw new AppError(400, "Target path is required.");
  }
  if (pathField.includes("..")) {
    throw new AppError(400, "Invalid path: no directory traversal allowed");
  }

  const publicPath = await persistMulterFile(req.file, "projects", projectId);
  const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
  const localUrl = publicPath.startsWith("http") ? publicPath : `${baseUrl}${publicPath}`;
  
  const basePathName = pathField.split('/').pop() || req.file.originalname;

  // upsert or create the new file
  const existingFile = await prisma.latexFile.findUnique({
    where: { projectId_path: { projectId, path: pathField } }
  });

  let file;
  try {
    if (existingFile) {
      file = await prisma.latexFile.update({
        where: { id: existingFile.id },
        data: {
          s3Url: localUrl,
          content: null // it's a binary/uploaded file
        }
      });
    } else {
      file = await prisma.latexFile.create({
        data: {
          projectId,
          name: basePathName,
          path: pathField,
          isFolder: false,
          s3Url: localUrl,
          content: null
        }
      });
    }
  } catch {
    throw new AppError(500, "Failed to save file metadata to database");
  }

  res.json({ 
    success: true, 
    file: {
      id: file.id,
      path: file.path,
      name: file.name,
      url: file.s3Url
    } 
  });
}

export async function renameFile(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const { fileId, newName, newPath } = req.body;

  if (!fileId || !newName || !newPath) throw new AppError(400, "fileId, newName and newPath are required");
  if (newPath.includes("..") || newName.includes("..")) throw new AppError(400, "Invalid path: no directory traversal allowed");

  const file = await prisma.latexFile.findUnique({
    where: { id: fileId, projectId }
  });

  if (!file) throw new AppError(404, "File not found");

  const oldPath = file.path;

  await prisma.$transaction(async (tx) => {
    // 1. Update the file/folder itself
    await tx.latexFile.update({
      where: { id: fileId },
      data: { name: newName, path: newPath }
    });

    // 2. If it's a folder, recursively update children
    if (file.isFolder) {
      const children = await tx.latexFile.findMany({
        where: {
          projectId,
          path: { startsWith: `${oldPath}/` }
        }
      });

      for (const child of children) {
        const childNewPath = child.path.replace(oldPath, newPath);
        await tx.latexFile.update({
          where: { id: child.id },
          data: { path: childNewPath }
        });
      }
    }
  });

  // Fetch updated file to return
  const updatedFile = await prisma.latexFile.findUnique({
    where: { id: fileId }
  });

  res.json({ success: true, file: updatedFile });
}

/** Move a file or folder to a new parent path (Overleaf-style drag/move). */
export async function moveFile(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const { fileId, newPath } = req.body;

  if (!fileId || !newPath) throw new AppError(400, "fileId and newPath are required");
  if (newPath.includes("..")) throw new AppError(400, "Invalid path");

  const file = await prisma.latexFile.findUnique({ where: { id: fileId, projectId } });
  if (!file) throw new AppError(404, "File not found");

  const newName = newPath.split("/").filter(Boolean).pop() || file.name;
  const oldPath = file.path;

  await prisma.$transaction(async (tx) => {
    await tx.latexFile.update({
      where: { id: fileId },
      data: { path: newPath, name: newName },
    });

    if (file.isFolder) {
      const children = await tx.latexFile.findMany({
        where: { projectId, path: { startsWith: `${oldPath}/` } },
      });
      for (const child of children) {
        await tx.latexFile.update({
          where: { id: child.id },
          data: { path: child.path.replace(oldPath, newPath) },
        });
      }
    }
  });

  const updated = await prisma.latexFile.findUnique({ where: { id: fileId } });
  res.json({ success: true, file: updated });
}

/** Get or create a LaTeX project linked to a lecture (course notes editor). */
export async function ensureLectureProject(req: AuthRequest, res: Response) {
  const lectureId = req.params.lectureId;
  const userId = req.user!.id;

  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: { section: { include: { course: true } }, latexProject: { include: { files: true } } },
  });

  if (!lecture) throw new AppError(404, "Lecture not found");

  const course = lecture.section.course;
  if (course.instructorId !== userId && req.user!.role !== "admin" && req.user!.role !== "super_admin") {
    throw new AppError(403, "Not authorized");
  }

  if (lecture.latexProject) {
    return res.json({ success: true, project: lecture.latexProject });
  }

  const template = getTemplate("course");
  const fileEntries = templateFolderEntries(template);
  let mainContent = fileEntries.find((f) => f.path === "/main.tex")?.content || "";

  if (lecture.content?.trim() && !lecture.content.startsWith("/uploads/")) {
    mainContent = lecture.content;
  } else {
    mainContent = mainContent.replace("Course Lecture Notes", lecture.title.replace(/&/g, "\\&"));
  }

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.latexProject.create({
      data: {
        title: `${lecture.title} — Notes`,
        ownerId: userId,
        lectureId,
        files: {
          create: fileEntries.map((entry) => ({
            name: entry.name,
            path: entry.path,
            isFolder: entry.isFolder,
            content: entry.path === "/main.tex" ? mainContent : entry.isFolder ? null : entry.content,
          })),
        },
      },
      include: { files: true },
    });

    await tx.lecture.update({
      where: { id: lectureId },
      data: { content: mainContent },
    });

    return p;
  });

  res.status(201).json({ success: true, project });
}

export async function getProjectFilesTree(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);

  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    include: { files: { select: { id: true, name: true, path: true, isFolder: true, updatedAt: true } }, collaborators: true }
  });

  if (!project) throw new AppError(404, "Project not found");

  res.json({ success: true, files: project.files });
}

export async function getFileContent(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const fileId = req.query.fileId as string;

  if (!fileId) throw new AppError(400, "fileId is required in query");

  const file = await prisma.latexFile.findUnique({
    where: { id: fileId, projectId }
  });

  if (!file) throw new AppError(404, "File not found");

  res.json({ success: true, file });
}

/** Resolve \\includegraphics{...} ref to the same public URL PDF compile uses. */
export async function resolveProjectAssetUrl(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id, req.user!.role);
  const ref = typeof req.query.ref === "string" ? req.query.ref.trim() : "";
  if (!ref) throw new AppError(400, "ref query parameter is required");

  const files = await loadProjectFiles(projectId);
  const resolved = resolveProjectAssetPhysicalPath(ref, files, projectId);
  const publicUrl = resolved?.publicUrl ?? resolveProjectAssetPublicUrl(ref, files, projectId);

  res.json({
    success: true,
    ref,
    publicUrl,
    physicalFilename: resolved?.physicalFilename ?? null,
    logicalPath: resolved?.logicalPath ?? null,
    found: Boolean(publicUrl),
  });
}
