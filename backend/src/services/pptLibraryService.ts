import fs from "fs";
import path from "path";
import crypto from "crypto";
import JSZip from "jszip";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import {
  isB2Configured,
  uploadFile as b2UploadFile,
  getObjectStream as b2GetObjectStream,
  deleteObject as b2DeleteObject,
  buildObjectKeyWithName,
  publicPathFromKey,
  b2KeyFromPublicPath,
} from "./b2StorageService.js";
import { getUploadRoot } from "../middlewares/uploadAccess.js";
import { appCache } from "../utils/cache.js";

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
}

export async function detectSlideCount(buffer: Buffer, filename: string): Promise<number | null> {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== ".pptx") return null;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const slideEntries = Object.keys(zip.files).filter((fileName) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(fileName)
    );
    return slideEntries.length > 0 ? slideEntries.length : null;
  } catch (err) {
    console.warn("[PPT_LIBRARY] Could not extract slide count from PPTX:", err);
    return null;
  }
}

export function detectPdfPageCount(buffer: Buffer): number | null {
  try {
    const text = buffer.toString("latin1");
    const countMatches = [...text.matchAll(/\/Count\s+(\d+)/g)];
    if (countMatches.length > 0) {
      const counts = countMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n) && n > 0);
      if (counts.length > 0) {
        return Math.max(...counts);
      }
    }
    const pageMatches = [...text.matchAll(/\/Type\s*\/Page\b/g)];
    if (pageMatches.length > 0) {
      return pageMatches.length;
    }
    return null;
  } catch (err) {
    console.warn("[PPT_LIBRARY] Could not extract page count from PDF:", err);
    return null;
  }
}


// ==========================================
// Topics & Subtopics Management
// ==========================================

export const INITIAL_PPT_CATEGORIES = [
  {
    name: "Programming",
    description: "Core programming languages, syntax, algorithms, and fundamental computer science concepts.",
    displayOrder: 1,
    subtopics: [
      "Python",
      "Java",
      "C Programming",
      "C++",
      "Data Structures and Algorithms",
    ],
  },
  {
    name: "Artificial Intelligence",
    description: "AI paradigms, deep learning, NLP, computer vision, and foundation models.",
    displayOrder: 2,
    subtopics: [
      "Artificial Intelligence Fundamentals",
      "Machine Learning",
      "Deep Learning",
      "Natural Language Processing",
      "Generative AI",
      "Computer Vision",
    ],
  },
  {
    name: "Data Science",
    description: "Data analysis, statistical modeling, data visualization, and querying techniques.",
    displayOrder: 3,
    subtopics: [
      "Statistics",
      "Data Analytics",
      "Data Visualization",
      "SQL",
      "Python for Data Science",
    ],
  },
  {
    name: "Web Development",
    description: "Modern full-stack web technologies, frontend frameworks, APIs, and client-server systems.",
    displayOrder: 4,
    subtopics: [
      "HTML and CSS",
      "JavaScript",
      "React.js",
      "Node.js",
      "Full Stack Development",
    ],
  },
  {
    name: "Database Management",
    description: "Relational and NoSQL database management, schema design, and query optimization.",
    displayOrder: 5,
    subtopics: [
      "MySQL",
      "PostgreSQL",
      "MongoDB",
      "Database Design",
    ],
  },
  {
    name: "Cloud Computing",
    description: "Cloud architectures, virtualization, cloud infrastructure providers, and DevOps practices.",
    displayOrder: 6,
    subtopics: [
      "AWS",
      "Microsoft Azure",
      "Google Cloud",
      "DevOps",
    ],
  },
];

export async function ensureInitialPptCategories(): Promise<{ topicsCreated: number; subtopicsCreated: number }> {
  let topicsCreated = 0;
  let subtopicsCreated = 0;

  for (const cat of INITIAL_PPT_CATEGORIES) {
    const topicSlug = slugify(cat.name);
    let topic = await prisma.pPTTopic.findFirst({
      where: {
        OR: [
          { name: { equals: cat.name, mode: "insensitive" } },
          { slug: topicSlug },
        ],
      },
    });

    if (!topic) {
      try {
        topic = await prisma.pPTTopic.create({
          data: {
            name: cat.name,
            slug: topicSlug,
            description: cat.description,
            displayOrder: cat.displayOrder,
            isActive: true,
          },
        });
        topicsCreated++;
        console.log(`[PPT_SEED] Created topic: ${cat.name}`);
      } catch (err) {
        topic = await prisma.pPTTopic.findFirst({
          where: {
            OR: [
              { name: { equals: cat.name, mode: "insensitive" } },
              { slug: topicSlug },
            ],
          },
        });
      }
    }

    if (topic) {
      for (let i = 0; i < cat.subtopics.length; i++) {
        const subName = cat.subtopics[i];
        const subSlug = slugify(subName);
        const existingSub = await prisma.pPTSubtopic.findFirst({
          where: {
            topicId: topic.id,
            OR: [
              { name: { equals: subName, mode: "insensitive" } },
              { slug: subSlug },
            ],
          },
        });

        if (!existingSub) {
          try {
            await prisma.pPTSubtopic.create({
              data: {
                topicId: topic.id,
                name: subName,
                slug: subSlug,
                displayOrder: i + 1,
                isActive: true,
              },
            });
            subtopicsCreated++;
            console.log(`[PPT_SEED] Created subtopic: ${cat.name} -> ${subName}`);
          } catch (err) {
            // Ignore race condition on duplicate
          }
        }
      }
    }
  }

  return { topicsCreated, subtopicsCreated };
}

export async function listTopics(includeInactive = false) {
  const where = includeInactive ? {} : { isActive: true };
  let topics = await prisma.pPTTopic.findMany({
    where,
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      subtopics: {
        where,
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        include: {
          _count: {
            select: { resources: { where: { status: "published" } } },
          },
        },
      },
      _count: {
        select: { resources: { where: { status: "published" } } },
      },
    },
  });

  // Self-healing bootstrap: if empty in DB, seed standard categories and reload
  if (topics.length === 0) {
    try {
      await ensureInitialPptCategories();
      topics = await prisma.pPTTopic.findMany({
        where,
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        include: {
          subtopics: {
            where,
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            include: {
              _count: {
                select: { resources: { where: { status: "published" } } },
              },
            },
          },
          _count: {
            select: { resources: { where: { status: "published" } } },
          },
        },
      });
    } catch (err) {
      console.warn("[PPT_LIBRARY] Could not auto-seed topics:", err);
    }
  }

  return topics.map((t) => ({
    ...t,
    resourceCount: t._count.resources,
    subtopics: t.subtopics.map((s) => ({
      ...s,
      resourceCount: s._count.resources,
    })),
  }));
}

export async function listSubtopicsByTopic(topicId: string, includeInactive = false) {
  const where = { topicId };
  if (!includeInactive) where.isActive = true;
  return prisma.pPTSubtopic.findMany({
    where,
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { resources: { where: { status: "published" } } },
      },
    },
  });
}

export async function getTopicById(id: string) {
  const topic = await prisma.pPTTopic.findUnique({
    where: { id },
    include: {
      subtopics: {
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      },
      _count: {
        select: { resources: true },
      },
    },
  });
  if (!topic) throw new AppError(404, "Topic not found");
  return topic;
}

export async function createTopic(data: {
  name: string;
  description?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
  createdById?: string;
}) {
  const trimmedName = data.name.trim();
  if (!trimmedName) throw new AppError(400, "Topic name is required");

  let slug = slugify(trimmedName);
  if (!slug) slug = `topic-${Date.now()}`;

  const existing = await prisma.pPTTopic.findFirst({
    where: {
      OR: [{ name: { equals: trimmedName, mode: "insensitive" } }, { slug }],
    },
  });
  if (existing) {
    throw new AppError(409, "A topic with this name already exists");
  }

  appCache.invalidate("ppt:");
  return prisma.pPTTopic.create({
    data: {
      name: trimmedName,
      slug,
      description: data.description?.trim() || null,
      icon: data.icon?.trim() || null,
      displayOrder: data.displayOrder ?? 0,
      isActive: data.isActive ?? true,
      createdById: data.createdById || null,
    },
  });
}

export async function updateTopic(
  id: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    displayOrder?: number;
    isActive?: boolean;
  }
) {
  const topic = await prisma.pPTTopic.findUnique({ where: { id } });
  if (!topic) throw new AppError(404, "Topic not found");

  const updateData: any = {};
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new AppError(400, "Topic name cannot be empty");
    const slug = slugify(trimmed) || `topic-${Date.now()}`;
    const duplicate = await prisma.pPTTopic.findFirst({
      where: {
        id: { not: id },
        OR: [{ name: { equals: trimmed, mode: "insensitive" } }, { slug }],
      },
    });
    if (duplicate) throw new AppError(409, "A topic with this name already exists");
    updateData.name = trimmed;
    updateData.slug = slug;
  }
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.icon !== undefined) updateData.icon = data.icon?.trim() || null;
  if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  appCache.invalidate("ppt:");
  return prisma.pPTTopic.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteTopic(id: string) {
  const topic = await prisma.pPTTopic.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subtopics: true, resources: true },
      },
    },
  });
  if (!topic) throw new AppError(404, "Topic not found");

  if (topic._count.resources > 0) {
    throw new AppError(
      400,
      `Cannot delete topic "${topic.name}" because it contains ${topic._count.resources} presentation(s). Reassign or delete them first.`
    );
  }
  if (topic._count.subtopics > 0) {
    throw new AppError(
      400,
      `Cannot delete topic "${topic.name}" because it contains ${topic._count.subtopics} subtopic(s). Delete or reassign the subtopics first.`
    );
  }

  await prisma.pPTTopic.delete({ where: { id } });
  return { success: true, message: "Topic deleted successfully" };
}

// Subtopics
export async function createSubtopic(data: {
  topicId: string;
  name: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
  createdById?: string;
}) {
  const topic = await prisma.pPTTopic.findUnique({ where: { id: data.topicId } });
  if (!topic) throw new AppError(404, "Parent topic not found");

  const trimmedName = data.name.trim();
  if (!trimmedName) throw new AppError(400, "Subtopic name is required");

  let slug = slugify(trimmedName);
  if (!slug) slug = `subtopic-${Date.now()}`;

  const existing = await prisma.pPTSubtopic.findFirst({
    where: {
      topicId: data.topicId,
      OR: [{ name: { equals: trimmedName, mode: "insensitive" } }, { slug }],
    },
  });
  if (existing) {
    throw new AppError(409, "A subtopic with this name already exists under this topic");
  }

  appCache.invalidate("ppt:");
  return prisma.pPTSubtopic.create({
    data: {
      topicId: data.topicId,
      name: trimmedName,
      slug,
      description: data.description?.trim() || null,
      displayOrder: data.displayOrder ?? 0,
      isActive: data.isActive ?? true,
      createdById: data.createdById || null,
    },
  });
}

export async function updateSubtopic(
  id: string,
  data: {
    name?: string;
    description?: string;
    displayOrder?: number;
    isActive?: boolean;
  }
) {
  const subtopic = await prisma.pPTSubtopic.findUnique({ where: { id } });
  if (!subtopic) throw new AppError(404, "Subtopic not found");

  const updateData: any = {};
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new AppError(400, "Subtopic name cannot be empty");
    const slug = slugify(trimmed) || `subtopic-${Date.now()}`;
    const duplicate = await prisma.pPTSubtopic.findFirst({
      where: {
        topicId: subtopic.topicId,
        id: { not: id },
        OR: [{ name: { equals: trimmed, mode: "insensitive" } }, { slug }],
      },
    });
    if (duplicate) throw new AppError(409, "A subtopic with this name already exists in this topic");
    updateData.name = trimmed;
    updateData.slug = slug;
  }
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  appCache.invalidate("ppt:");
  return prisma.pPTSubtopic.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteSubtopic(id: string) {
  const subtopic = await prisma.pPTSubtopic.findUnique({
    where: { id },
    include: {
      _count: {
        select: { resources: true },
      },
    },
  });
  if (!subtopic) throw new AppError(404, "Subtopic not found");

  if (subtopic._count.resources > 0) {
    throw new AppError(
      400,
      `Cannot delete subtopic "${subtopic.name}" because it contains ${subtopic._count.resources} presentation(s). Reassign or delete them first.`
    );
  }

  await prisma.pPTSubtopic.delete({ where: { id } });
  return { success: true, message: "Subtopic deleted successfully" };
}

// ==========================================
// Resource Management (Upload, Replace, CRUD)
// ==========================================

export async function uploadAndCreateResource(params: {
  title: string;
  description?: string;
  topicId: string;
  subtopicId: string;
  instructorId: string;
  file: Express.Multer.File;
  thumbnailFile?: Express.Multer.File;
  tags?: string[];
  language?: string;
  academicLevel?: string;
  status?: "draft" | "published";
}) {
  const { title, description, topicId, subtopicId, instructorId, file, tags, language, academicLevel, status } = params;

  if (!title?.trim()) throw new AppError(400, "Presentation title is required");
  if (!file) throw new AppError(400, "Presentation file is required");

  // Validate topic & subtopic
  const subtopic = await prisma.pPTSubtopic.findFirst({
    where: { id: subtopicId, topicId },
  });
  if (!subtopic) throw new AppError(400, "Selected subtopic does not belong to the selected topic");

  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".pptx" && ext !== ".ppt" && ext !== ".pdf") {
    throw new AppError(400, "Only .pptx, .ppt presentations and .pdf document files are supported");
  }

  const fileType = ext === ".pdf" ? "pdf" : (ext === ".ppt" ? "ppt" : "pptx");
  const fileBuffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : Buffer.alloc(0));
  const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const slideCount = fileType === "pptx" ? await detectSlideCount(fileBuffer, file.originalname) : null;
  const pageCount = fileType === "pdf" ? detectPdfPageCount(fileBuffer) : null;

  // Generate storage key
  const safeBaseName = path.basename(file.originalname, ext).replace(/[^\w.-]/g, "_").slice(0, 50);
  const resourceId = crypto.randomUUID();
  const storageFileName = `${safeBaseName}-${Date.now()}${ext}`;
  const relativeUploadPath = `/uploads/ppt-library/${resourceId}/${storageFileName}`;
  const localDestDir = path.join(getUploadRoot(), "ppt-library", resourceId);

  if (!fs.existsSync(localDestDir)) {
    fs.mkdirSync(localDestDir, { recursive: true });
  }
  const localFilePath = path.join(localDestDir, storageFileName);
  fs.writeFileSync(localFilePath, fileBuffer);

  // Upload to Backblaze B2 if configured
  let storageKey = relativeUploadPath;
  if (isB2Configured()) {
    try {
      const b2Key = `uploads/ppt-library/${resourceId}/${storageFileName}`;
      await b2UploadFile({
        filePath: localFilePath,
        key: b2Key,
        contentType: file.mimetype || (ext === ".pdf" ? "application/pdf" : (ext === ".pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.ms-powerpoint")),
      });
      storageKey = publicPathFromKey(b2Key);
    } catch (err) {
      console.warn("[PPT_LIBRARY] Backblaze B2 upload failed; keeping local copy:", err);
    }
  }

  // Handle optional thumbnail
  let thumbnailUrl: string | null = null;
  if (params.thumbnailFile) {
    const thumbExt = path.extname(params.thumbnailFile.originalname).toLowerCase();
    const thumbName = `thumb-${Date.now()}${thumbExt}`;
    const localThumbPath = path.join(localDestDir, thumbName);
    fs.copyFileSync(params.thumbnailFile.path, localThumbPath);
    thumbnailUrl = `/uploads/ppt-library/${resourceId}/${thumbName}`;
    if (isB2Configured()) {
      try {
        const thumbKey = `uploads/ppt-library/${resourceId}/${thumbName}`;
        await b2UploadFile({
          filePath: localThumbPath,
          key: thumbKey,
          contentType: params.thumbnailFile.mimetype || "image/jpeg",
        });
        thumbnailUrl = publicPathFromKey(thumbKey);
      } catch (err) {
        console.warn("[PPT_LIBRARY] Thumbnail B2 upload warning:", err);
      }
    }
  }

  // Clean up temporary multer files
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    if (params.thumbnailFile && fs.existsSync(params.thumbnailFile.path)) {
      fs.unlinkSync(params.thumbnailFile.path);
    }
  } catch {
    /* ignore */
  }

  const isPublished = status === "published";

  // Create database record with initial version and file bytes backup
  return prisma.$transaction(async (tx) => {
    const created = await tx.pPTResource.create({
      data: {
        id: resourceId,
        title: title.trim(),
        description: description?.trim() || null,
        topicId,
        subtopicId,
        instructorId,
        originalFileName: file.originalname,
        fileType,
        pageCount,
        storageKey,
        mimeType: file.mimetype || (ext === ".pdf" ? "application/pdf" : (ext === ".pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.ms-powerpoint")),
        fileSize: file.size,
        thumbnailUrl,
        status: isPublished ? "published" : "draft",
        publishedAt: isPublished ? new Date() : null,
        language: language?.trim() || "en",
        tags: Array.isArray(tags) ? tags.map((t) => t.trim()).filter(Boolean) : [],
        academicLevel: academicLevel?.trim() || null,
        slideCount,
      },
      include: {
        topic: true,
        subtopic: true,
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            profileImage: true,
          },
        },
      },
    });

    // Save durable byte storage backup (ensures zero data loss across Render deploys)
    await tx.pPTResourceFile.create({
      data: {
        resourceId,
        bytes: fileBuffer,
        size: file.size,
        sha256,
        mimeType: created.mimeType,
      },
    });

    // Record version 1
    await tx.pPTResourceVersion.create({
      data: {
        resourceId,
        versionNumber: 1,
        originalFileName: file.originalname,
        fileType,
        storageKey,
        fileSize: file.size,
        mimeType: created.mimeType,
        changeNote: "Initial upload",
        uploadedById: instructorId,
      },
    });

    return created;
  });
}

export async function replaceResourceFile(
  resourceId: string,
  file: Express.Multer.File,
  userId: string,
  userRole: string,
  changeNote?: string
) {
  const resource = await prisma.pPTResource.findUnique({
    where: { id: resourceId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!resource) throw new AppError(404, "Presentation not found");

  if (resource.instructorId !== userId && !isAdminRole(userRole)) {
    throw new AppError(403, "You do not have permission to replace this presentation");
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".pptx" && ext !== ".ppt" && ext !== ".pdf") {
    throw new AppError(400, "Only .pptx, .ppt presentations and .pdf document files are supported");
  }

  const fileType = ext === ".pdf" ? "pdf" : (ext === ".ppt" ? "ppt" : "pptx");
  const fileBuffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : Buffer.alloc(0));
  const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const slideCount = fileType === "pptx" ? await detectSlideCount(fileBuffer, file.originalname) : null;
  const pageCount = fileType === "pdf" ? detectPdfPageCount(fileBuffer) : null;

  const safeBaseName = path.basename(file.originalname, ext).replace(/[^\w.-]/g, "_").slice(0, 50);
  const nextVersion = (resource.versions[0]?.versionNumber || 1) + 1;
  const storageFileName = `${safeBaseName}-v${nextVersion}-${Date.now()}${ext}`;
  const relativeUploadPath = `/uploads/ppt-library/${resourceId}/${storageFileName}`;
  const localDestDir = path.join(getUploadRoot(), "ppt-library", resourceId);

  if (!fs.existsSync(localDestDir)) {
    fs.mkdirSync(localDestDir, { recursive: true });
  }
  const localFilePath = path.join(localDestDir, storageFileName);
  fs.writeFileSync(localFilePath, fileBuffer);

  let storageKey = relativeUploadPath;
  if (isB2Configured()) {
    try {
      const b2Key = `uploads/ppt-library/${resourceId}/${storageFileName}`;
      await b2UploadFile({
        filePath: localFilePath,
        key: b2Key,
        contentType: file.mimetype || (ext === ".pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.ms-powerpoint"),
      });
      storageKey = publicPathFromKey(b2Key);
    } catch (err) {
      console.warn("[PPT_LIBRARY] B2 replace upload warning:", err);
    }
  }

  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch {
    /* ignore */
  }

  const mimeType = file.mimetype || (ext === ".pdf" ? "application/pdf" : (ext === ".pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.ms-powerpoint"));

  return prisma.$transaction(async (tx) => {
    // Record new version
    await tx.pPTResourceVersion.create({
      data: {
        resourceId,
        versionNumber: nextVersion,
        originalFileName: file.originalname,
        fileType,
        storageKey,
        fileSize: file.size,
        mimeType,
        changeNote: changeNote?.trim() || `Replaced with ${file.originalname}`,
        uploadedById: userId,
      },
    });

    // Update backup bytes
    await tx.pPTResourceFile.upsert({
      where: { resourceId },
      create: {
        resourceId,
        bytes: fileBuffer,
        size: file.size,
        sha256,
        mimeType,
      },
      update: {
        bytes: fileBuffer,
        size: file.size,
        sha256,
        mimeType,
      },
    });

    // Update main resource metadata
    return tx.pPTResource.update({
      where: { id: resourceId },
      data: {
        originalFileName: file.originalname,
        fileType,
        pageCount,
        storageKey,
        fileSize: file.size,
        mimeType,
        slideCount,
      },
      include: {
        topic: true,
        subtopic: true,
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
  });
}

export async function updateResourceMetadata(
  resourceId: string,
  userId: string,
  userRole: string,
  data: {
    title?: string;
    description?: string;
    topicId?: string;
    subtopicId?: string;
    language?: string;
    academicLevel?: string;
    tags?: string[];
  }
) {
  const resource = await prisma.pPTResource.findUnique({ where: { id: resourceId } });
  if (!resource) throw new AppError(404, "Presentation not found");

  if (resource.instructorId !== userId && !isAdminRole(userRole)) {
    throw new AppError(403, "You do not have permission to edit this presentation");
  }

  const updateData: any = {};
  if (data.title !== undefined) {
    const trimmed = data.title.trim();
    if (!trimmed) throw new AppError(400, "Title cannot be empty");
    updateData.title = trimmed;
  }
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.language !== undefined) updateData.language = data.language?.trim() || "en";
  if (data.academicLevel !== undefined) updateData.academicLevel = data.academicLevel?.trim() || null;
  if (data.tags !== undefined) {
    updateData.tags = Array.isArray(data.tags) ? data.tags.map((t) => t.trim()).filter(Boolean) : [];
  }

  if (data.topicId || data.subtopicId) {
    const topicId = data.topicId || resource.topicId;
    const subtopicId = data.subtopicId || resource.subtopicId;
    const subtopic = await prisma.pPTSubtopic.findFirst({
      where: { id: subtopicId, topicId },
    });
    if (!subtopic) throw new AppError(400, "Selected subtopic does not belong to the selected topic");
    updateData.topicId = topicId;
    updateData.subtopicId = subtopicId;
  }

  return prisma.pPTResource.update({
    where: { id: resourceId },
    data: updateData,
    include: {
      topic: true,
      subtopic: true,
      instructor: {
        select: { id: true, firstName: true, lastName: true, avatar: true, profileImage: true },
      },
    },
  });
}

export async function setResourcePublishStatus(
  resourceId: string,
  userId: string,
  userRole: string,
  status: "published" | "draft" | "archived"
) {
  const resource = await prisma.pPTResource.findUnique({ where: { id: resourceId } });
  if (!resource) throw new AppError(404, "Presentation not found");

  if (resource.instructorId !== userId && !isAdminRole(userRole)) {
    throw new AppError(403, "You do not have permission to modify this presentation status");
  }

  return prisma.pPTResource.update({
    where: { id: resourceId },
    data: {
      status,
      publishedAt: status === "published" ? (resource.publishedAt || new Date()) : resource.publishedAt,
    },
    include: {
      topic: true,
      subtopic: true,
    },
  });
}

export async function deleteResource(resourceId: string, userId: string, userRole: string) {
  const resource = await prisma.pPTResource.findUnique({ where: { id: resourceId } });
  if (!resource) throw new AppError(404, "Presentation not found");

  if (resource.instructorId !== userId && !isAdminRole(userRole)) {
    throw new AppError(403, "You do not have permission to delete this presentation");
  }

  // Delete storage assets if possible
  const localDir = path.join(getUploadRoot(), "ppt-library", resourceId);
  try {
    if (fs.existsSync(localDir)) {
      fs.rmSync(localDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn("[PPT_LIBRARY] Local cleanup warning:", err);
  }

  if (isB2Configured()) {
    try {
      const b2Key = b2KeyFromPublicPath(resource.storageKey);
      if (b2Key) await b2DeleteObject(b2Key);
    } catch (err) {
      console.warn("[PPT_LIBRARY] B2 delete warning:", err);
    }
  }

  await prisma.pPTResource.delete({ where: { id: resourceId } });
  return { success: true, message: "Presentation deleted successfully" };
}

// ==========================================
// Viewing, Searching & Downloading
// ==========================================

export async function listResources(
  query: {
    page?: number;
    limit?: number;
    search?: string;
    topicId?: string;
    subtopicId?: string;
    language?: string;
    academicLevel?: string;
    status?: string;
    instructorId?: string;
    sort?: "newest" | "popular" | "title" | "views";
  },
  currentUser?: { id: string; role: string }
) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
  const skip = (page - 1) * limit;

  const andClauses: any[] = [];

  // Visibility logic
  const isPrivileged = currentUser && isAdminRole(currentUser.role);
  if (!isPrivileged) {
    if (currentUser?.id) {
      andClauses.push({
        OR: [
          { status: "published" },
          { instructorId: currentUser.id },
        ],
      });
    } else {
      andClauses.push({ status: "published" });
    }
  } else if (query.status) {
    andClauses.push({ status: query.status });
  }

  if (query.topicId) andClauses.push({ topicId: query.topicId });
  if (query.subtopicId) andClauses.push({ subtopicId: query.subtopicId });
  if (query.instructorId) andClauses.push({ instructorId: query.instructorId });
  if (query.language) andClauses.push({ language: query.language });
  if (query.academicLevel) andClauses.push({ academicLevel: query.academicLevel });

  if (query.fileType && query.fileType !== "all") {
    if (query.fileType === "presentation") {
      andClauses.push({ fileType: { in: ["pptx", "ppt"] } });
    } else if (query.fileType === "pdf") {
      andClauses.push({ fileType: "pdf" });
    } else if (query.fileType === "ppt" || query.fileType === "pptx") {
      andClauses.push({ fileType: query.fileType });
    }
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    andClauses.push({
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { tags: { has: term.toLowerCase() } },
        { topic: { name: { contains: term, mode: "insensitive" } } },
        { subtopic: { name: { contains: term, mode: "insensitive" } } },
        {
          instructor: {
            OR: [
              { firstName: { contains: term, mode: "insensitive" } },
              { lastName: { contains: term, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  const where = andClauses.length > 0 ? { AND: andClauses } : {};

  let orderBy: any = { createdAt: "desc" };
  if (query.sort === "popular") orderBy = { downloadCount: "desc" };
  else if (query.sort === "views") orderBy = { viewCount: "desc" };
  else if (query.sort === "title") orderBy = { title: "asc" };
  else if (query.sort === "newest") orderBy = { createdAt: "desc" };

  const [total, resources] = await Promise.all([
    prisma.pPTResource.count({ where }),
    prisma.pPTResource.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        topic: { select: { id: true, name: true, slug: true } },
        subtopic: { select: { id: true, name: true, slug: true } },
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            profileImage: true,
          },
        },
      },
    }),
  ]);

  return {
    resources,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getResourceById(resourceId: string, currentUser?: { id: string; role: string }) {
  const resource = await prisma.pPTResource.findUnique({
    where: { id: resourceId },
    include: {
      topic: true,
      subtopic: true,
      instructor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          profileImage: true,
          designation: true,
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

  if (!resource) throw new AppError(404, "Presentation not found");

  const isAuthor = currentUser?.id === resource.instructorId;
  const isAdmin = currentUser && isAdminRole(currentUser.role);

  if (resource.status !== "published" && !isAuthor && !isAdmin) {
    throw new AppError(403, "This presentation is not published or is no longer available");
  }

  // Increment view count asynchronously
  prisma.pPTResource.update({
    where: { id: resourceId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  appCache.invalidate("ppt:");
  return resource;
}

export async function getResourceFileBuffer(resourceId: string): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}> {
  const resource = await prisma.pPTResource.findUnique({
    where: { id: resourceId },
    include: { file: true },
  });
  if (!resource) throw new AppError(404, "Presentation not found");

  // 1. Try local disk
  const localDir = path.join(getUploadRoot(), "ppt-library", resourceId);
  const localCandidates = fs.existsSync(localDir) ? fs.readdirSync(localDir) : [];
  for (const c of localCandidates) {
    if (c.endsWith(".pptx") || c.endsWith(".ppt") || c.endsWith(".pdf")) {
      const fullPath = path.join(localDir, c);
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath);
        return {
          buffer,
          filename: resource.originalFileName,
          mimeType: resource.mimeType,
          size: buffer.length,
        };
      }
    }
  }

  // 2. Try DB byte backup
  if (resource.file?.bytes) {
    const buffer = Buffer.from(resource.file.bytes);
    return {
      buffer,
      filename: resource.originalFileName,
      mimeType: resource.mimeType,
      size: buffer.length,
    };
  }

  // 3. Try B2 storage
  if (isB2Configured()) {
    try {
      const b2Key = b2KeyFromPublicPath(resource.storageKey);
      if (b2Key) {
        const stream = await b2GetObjectStream(b2Key);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const buffer = Buffer.concat(chunks);
        return {
          buffer,
          filename: resource.originalFileName,
          mimeType: resource.mimeType,
          size: buffer.length,
        };
      }
    } catch (err) {
      console.warn("[PPT_LIBRARY] Could not fetch file from B2:", err);
    }
  }

  throw new AppError(404, "Presentation file is unavailable in storage");
}

export async function recordDownload(
  resourceId: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string
) {
  await prisma.$transaction([
    prisma.pPTResource.update({
      where: { id: resourceId },
      data: { downloadCount: { increment: 1 } },
    }),
    prisma.pPTDownloadLog.create({
      data: {
        resourceId,
        userId: userId || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    }),
  ]);
}

// ==========================================
// Dashboard Statistics
// ==========================================

export async function getInstructorDashboardStats(instructorId: string) {
  const [total, published, drafts, downloads] = await Promise.all([
    prisma.pPTResource.count({ where: { instructorId } }),
    prisma.pPTResource.count({ where: { instructorId, status: "published" } }),
    prisma.pPTResource.count({ where: { instructorId, status: "draft" } }),
    prisma.pPTResource.aggregate({
      where: { instructorId },
      _sum: { downloadCount: true, viewCount: true },
    }),
  ]);

  return {
    totalPpts: total,
    publishedPpts: published,
    draftPpts: drafts,
    totalDownloads: downloads._sum.downloadCount || 0,
    totalViews: downloads._sum.viewCount || 0,
  };
}

export async function getAdminDashboardStats() {
  const [total, published, drafts, downloads, topics, subtopics, activeInstructors] = await Promise.all([
    prisma.pPTResource.count(),
    prisma.pPTResource.count({ where: { status: "published" } }),
    prisma.pPTResource.count({ where: { status: "draft" } }),
    prisma.pPTResource.aggregate({
      _sum: { downloadCount: true, viewCount: true },
    }),
    prisma.pPTTopic.count(),
    prisma.pPTSubtopic.count(),
    prisma.pPTResource.groupBy({
      by: ["instructorId"],
    }),
  ]);

  return {
    totalPpts: total,
    publishedPpts: published,
    draftPpts: drafts,
    totalDownloads: downloads._sum.downloadCount || 0,
    totalViews: downloads._sum.viewCount || 0,
    totalTopics: topics,
    totalSubtopics: subtopics,
    contributingInstructors: activeInstructors.length,
  };
}

