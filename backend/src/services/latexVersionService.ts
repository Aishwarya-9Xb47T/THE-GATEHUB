import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../utils/prisma.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const PROJECTS_DIR = path.join(process.cwd(), UPLOAD_DIR, "projects");
const VERSIONS_DIR = path.join(process.cwd(), UPLOAD_DIR, "latex-versions");

export type PublishType =
  | "manual"
  | "publish"
  | "republish"
  | "auto-save"
  | "pre-restore"
  | "compile"
  | "resource-publish";

export type FileInventoryEntry = {
  path: string;
  name: string;
  isFolder: boolean;
  content?: string | null;
  s3Url?: string | null;
  contentHash?: string;
  storedFilename?: string;
};

export type AssetInventoryEntry = {
  path: string;
  name: string;
  storedFilename: string;
  mimeType?: string;
  size?: number;
};

export type CreateSnapshotOptions = {
  label?: string;
  publishType?: PublishType;
  notes?: string;
  authorId?: string;
  learningUniverseId?: string;
  resourceCourseId?: string;
  isSafetySnapshot?: boolean;
  dslSource?: string;
};

export type VersionCompareResult = {
  versionA: { id: string; versionNumber: number; createdAt: Date };
  versionB: { id: string; versionNumber: number; createdAt: Date };
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
  dslDiff: { line: number; type: "added" | "removed" | "unchanged"; content: string }[];
};

function hashContent(content: string | null | undefined): string {
  return createHash("sha256").update(content || "").digest("hex").slice(0, 16);
}

function versionAssetsDir(projectId: string, versionId: string): string {
  return path.join(VERSIONS_DIR, projectId, versionId);
}

async function nextVersionNumber(projectId: string): Promise<number> {
  const last = await prisma.latexProjectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

export async function backfillVersionNumbers(projectId: string): Promise<void> {
  const rows = await prisma.latexProjectVersion.findMany({
    where: { projectId, versionNumber: 0 },
    orderBy: { createdAt: "asc" },
  });
  if (!rows.length) return;

  const maxExisting = await prisma.latexProjectVersion.aggregate({
    where: { projectId, versionNumber: { gt: 0 } },
    _max: { versionNumber: true },
  });
  let counter = maxExisting._max.versionNumber ?? 0;

  for (const row of rows) {
    counter += 1;
    await prisma.latexProjectVersion.update({
      where: { id: row.id },
      data: { versionNumber: counter },
    });
  }
}

export async function recordTimelineEvent(
  projectId: string,
  eventType: string,
  actorId?: string,
  metadata?: object
) {
  return prisma.latexProjectTimelineEvent.create({
    data: {
      projectId,
      eventType,
      actorId: actorId ?? null,
      metadata: metadata ?? undefined,
    },
  });
}

async function buildFileInventory(projectId: string): Promise<{
  files: FileInventoryEntry[];
  assets: AssetInventoryEntry[];
}> {
  const projectFiles = await prisma.latexFile.findMany({ where: { projectId } });
  const files: FileInventoryEntry[] = [];
  const assets: AssetInventoryEntry[] = [];

  for (const f of projectFiles) {
    const entry: FileInventoryEntry = {
      path: f.path,
      name: f.name,
      isFolder: f.isFolder,
      content: f.content,
      s3Url: f.s3Url,
      contentHash: f.content ? hashContent(f.content) : undefined,
    };

    if (f.s3Url && !f.isFolder) {
      const storedFilename = f.s3Url.split("/").pop() || "";
      const localPath = path.join(PROJECTS_DIR, projectId, storedFilename);
      if (fs.existsSync(localPath)) {
        entry.storedFilename = storedFilename;
        assets.push({
          path: f.path,
          name: f.name,
          storedFilename,
          size: fs.statSync(localPath).size,
        });
      }
    }

    files.push(entry);
  }

  return { files, assets };
}

async function copyAssetsToVersionStore(
  projectId: string,
  versionId: string,
  assets: AssetInventoryEntry[]
): Promise<AssetInventoryEntry[]> {
  const destDir = versionAssetsDir(projectId, versionId);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const stored: AssetInventoryEntry[] = [];
  for (const asset of assets) {
    let srcPath = path.join(PROJECTS_DIR, projectId, asset.storedFilename);
    if (!fs.existsSync(srcPath)) {
      const { hydrateLocalUpload } = await import("../middlewares/persistUpload.js");
      srcPath =
        (await hydrateLocalUpload(`/uploads/projects/${projectId}/${asset.storedFilename}`)) || srcPath;
    }
    if (!fs.existsSync(srcPath)) continue;

    const versionFilename = `${randomUUID()}${path.extname(asset.name)}`;
    const destPath = path.join(destDir, versionFilename);
    fs.copyFileSync(srcPath, destPath);
    const { persistAtPublicRelative } = await import("../middlewares/persistUpload.js");
    await persistAtPublicRelative(destPath, `latex/${projectId}/${versionId}/${versionFilename}`);
    stored.push({ ...asset, storedFilename: versionFilename });
  }
  return stored;
}

export async function createProjectSnapshot(
  projectId: string,
  options: CreateSnapshotOptions = {}
) {
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    include: { files: true },
  });
  if (!project) throw new Error("Project not found");

  let dslSource = options.dslSource;
  if (!dslSource) {
    const mainTex = project.files.find((f) => f.name === "main.tex" || f.path === "/main.tex");
    dslSource = mainTex?.content || "";
  }

  const { files, assets } = await buildFileInventory(projectId);
  const versionNumber = await nextVersionNumber(projectId);

  const version = await prisma.latexProjectVersion.create({
    data: {
      projectId,
      versionNumber,
      label: options.label || options.publishType || "manual",
      publishType: options.publishType || "manual",
      notes: options.notes ?? null,
      dslSnapshot: dslSource,
      fileInventory: files as object,
      assetInventory: [] as object,
      projectMetadata: {
        title: project.title,
        fileCount: files.length,
        assetCount: assets.length,
      } as object,
      learningUniverseId: options.learningUniverseId ?? null,
      resourceCourseId: options.resourceCourseId ?? null,
      authorId: options.authorId ?? null,
      isSafetySnapshot: options.isSafetySnapshot ?? false,
    },
  });

  const storedAssets = await copyAssetsToVersionStore(projectId, version.id, assets);
  if (storedAssets.length) {
    await prisma.latexProjectVersion.update({
      where: { id: version.id },
      data: { assetInventory: storedAssets as object },
    });
  }

  return prisma.latexProjectVersion.findUnique({
    where: { id: version.id },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function listProjectVersions(projectId: string) {
  await backfillVersionNumbers(projectId);

  const versions = await prisma.latexProjectVersion.findMany({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  const universeIds = [...new Set(versions.map((v) => v.learningUniverseId).filter(Boolean))] as string[];
  const universes = universeIds.length
    ? await prisma.learningUniverse.findMany({
        where: { id: { in: universeIds } },
        select: { id: true, title: true },
      })
    : [];
  const universeMap = Object.fromEntries(universes.map((u) => [u.id, u.title]));

  const resourceIds = [...new Set(versions.map((v) => v.resourceCourseId).filter(Boolean))] as string[];
  const resources = resourceIds.length
    ? await prisma.resourceCourse.findMany({
        where: { id: { in: resourceIds } },
        select: { id: true, title: true },
      })
    : [];
  const resourceMap = Object.fromEntries(resources.map((r) => [r.id, r.title]));

  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    label: v.label,
    publishType: v.publishType,
    notes: v.notes,
    createdAt: v.createdAt,
    isSafetySnapshot: v.isSafetySnapshot,
    author: v.author
      ? { id: v.author.id, name: `${v.author.firstName} ${v.author.lastName}`.trim(), email: v.author.email }
      : null,
    learningUniverse: v.learningUniverseId
      ? { id: v.learningUniverseId, title: universeMap[v.learningUniverseId] || "Learning Universe" }
      : null,
    resourceCourse: v.resourceCourseId
      ? { id: v.resourceCourseId, title: resourceMap[v.resourceCourseId] || "Resource Course" }
      : null,
    fileCount: Array.isArray(v.fileInventory) ? (v.fileInventory as unknown[]).length : 0,
    assetCount: Array.isArray(v.assetInventory) ? (v.assetInventory as unknown[]).length : 0,
  }));
}

export async function getProjectVersion(versionId: string) {
  const version = await prisma.latexProjectVersion.findUnique({
    where: { id: versionId },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, email: true } },
      project: { select: { id: true, title: true, createdAt: true, updatedAt: true } },
    },
  });
  if (!version) throw new Error("Version not found");

  let universeTitle: string | null = null;
  if (version.learningUniverseId) {
    const u = await prisma.learningUniverse.findUnique({
      where: { id: version.learningUniverseId },
      select: { title: true },
    });
    universeTitle = u?.title ?? null;
  }

  let resourceTitle: string | null = null;
  if (version.resourceCourseId) {
    const r = await prisma.resourceCourse.findUnique({
      where: { id: version.resourceCourseId },
      select: { title: true },
    });
    resourceTitle = r?.title ?? null;
  }

  return {
    ...version,
    author: version.author
      ? { id: version.author.id, name: `${version.author.firstName} ${version.author.lastName}`.trim() }
      : null,
    learningUniverse: version.learningUniverseId
      ? { id: version.learningUniverseId, title: universeTitle }
      : null,
    resourceCourse: version.resourceCourseId
      ? { id: version.resourceCourseId, title: resourceTitle }
      : null,
  };
}

function inventoryPaths(inventory: unknown): Map<string, FileInventoryEntry> {
  const map = new Map<string, FileInventoryEntry>();
  if (!Array.isArray(inventory)) return map;
  for (const item of inventory as FileInventoryEntry[]) {
    map.set(item.path, item);
  }
  return map;
}

function computeDslDiff(dslA: string, dslB: string): VersionCompareResult["dslDiff"] {
  const linesA = dslA.split("\n");
  const linesB = dslB.split("\n");
  const maxLen = Math.max(linesA.length, linesB.length);
  const diff: VersionCompareResult["dslDiff"] = [];

  for (let i = 0; i < maxLen; i++) {
    const a = linesA[i];
    const b = linesB[i];
    if (a === b) {
      if (a !== undefined) diff.push({ line: i + 1, type: "unchanged", content: a });
    } else {
      if (a !== undefined) diff.push({ line: i + 1, type: "removed", content: a });
      if (b !== undefined) diff.push({ line: i + 1, type: "added", content: b });
    }
  }
  return diff.filter((d) => d.type !== "unchanged");
}

export async function compareProjectVersions(
  versionAId: string,
  versionBId: string
): Promise<VersionCompareResult> {
  const [a, b] = await Promise.all([
    prisma.latexProjectVersion.findUnique({ where: { id: versionAId } }),
    prisma.latexProjectVersion.findUnique({ where: { id: versionBId } }),
  ]);
  if (!a || !b) throw new Error("One or both versions not found");
  if (a.projectId !== b.projectId) throw new Error("Versions must belong to the same project");

  const invA = inventoryPaths(a.fileInventory);
  const invB = inventoryPaths(b.fileInventory);

  const pathsA = new Set(invA.keys());
  const pathsB = new Set(invB.keys());

  const addedFiles = [...pathsB].filter((p) => !pathsA.has(p));
  const removedFiles = [...pathsA].filter((p) => !pathsB.has(p));
  const changedFiles: string[] = [];

  for (const p of pathsA) {
    if (!pathsB.has(p)) continue;
    const fa = invA.get(p)!;
    const fb = invB.get(p)!;
    const hashA = fa.contentHash || hashContent(fa.content);
    const hashB = fb.contentHash || hashContent(fb.content);
    if (hashA !== hashB || fa.s3Url !== fb.s3Url) changedFiles.push(p);
  }

  return {
    versionA: { id: a.id, versionNumber: a.versionNumber, createdAt: a.createdAt },
    versionB: { id: b.id, versionNumber: b.versionNumber, createdAt: b.createdAt },
    addedFiles,
    removedFiles,
    changedFiles,
    dslDiff: computeDslDiff(a.dslSnapshot, b.dslSnapshot),
  };
}

async function restoreAssetsFromVersion(
  projectId: string,
  versionId: string,
  assets: AssetInventoryEntry[]
) {
  const srcDir = versionAssetsDir(projectId, versionId);
  const destDir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;

  for (const asset of assets) {
    let srcPath = path.join(srcDir, asset.storedFilename);
    if (!fs.existsSync(srcPath)) {
      const { hydrateLocalUpload } = await import("../middlewares/persistUpload.js");
      srcPath =
        (await hydrateLocalUpload(`/uploads/latex/${projectId}/${versionId}/${asset.storedFilename}`)) ||
        srcPath;
    }
    if (!fs.existsSync(srcPath)) continue;

    const destFilename = `${randomUUID()}${path.extname(asset.name)}`;
    const destPath = path.join(destDir, destFilename);
    fs.copyFileSync(srcPath, destPath);
    const { persistAtPublicRelative } = await import("../middlewares/persistUpload.js");
    const publicPath = await persistAtPublicRelative(destPath, `projects/${projectId}/${destFilename}`);
    const s3Url = publicPath.startsWith("http")
      ? publicPath
      : `${baseUrl}${publicPath}`;

    const existing = await prisma.latexFile.findUnique({
      where: { projectId_path: { projectId, path: asset.path } },
    });

    if (existing) {
      await prisma.latexFile.update({
        where: { id: existing.id },
        data: { s3Url, content: null, name: asset.name },
      });
    } else {
      await prisma.latexFile.create({
        data: {
          projectId,
          path: asset.path,
          name: asset.name,
          isFolder: false,
          s3Url,
          content: null,
        },
      });
    }
  }
}

export async function restoreProjectVersion(
  projectId: string,
  versionId: string,
  actorId: string
) {
  const version = await prisma.latexProjectVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId) throw new Error("Version not found for this project");

  const project = await prisma.latexProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");

  await createProjectSnapshot(projectId, {
    label: "pre-restore",
    publishType: "pre-restore",
    notes: `Safety snapshot before restoring to v${version.versionNumber}`,
    authorId: actorId,
    isSafetySnapshot: true,
  });

  const inventory = (version.fileInventory as FileInventoryEntry[]) || [];
  const inventoryPathsSet = new Set(inventory.map((f) => f.path));

  const currentFiles = await prisma.latexFile.findMany({ where: { projectId } });
  for (const cf of currentFiles) {
    if (!inventoryPathsSet.has(cf.path)) {
      await prisma.latexFile.delete({ where: { id: cf.id } });
    }
  }

  for (const entry of inventory) {
    if (entry.isFolder) {
      const existing = await prisma.latexFile.findUnique({
        where: { projectId_path: { projectId, path: entry.path } },
      });
      if (!existing) {
        await prisma.latexFile.create({
          data: {
            projectId,
            path: entry.path,
            name: entry.name,
            isFolder: true,
            content: "",
          },
        });
      }
      continue;
    }

    const existing = await prisma.latexFile.findUnique({
      where: { projectId_path: { projectId, path: entry.path } },
    });

    const data = {
      name: entry.name,
      isFolder: false as const,
      content: entry.content ?? null,
      s3Url: entry.s3Url ?? null,
    };

    if (existing) {
      await prisma.latexFile.update({ where: { id: existing.id }, data });
    } else {
      await prisma.latexFile.create({
        data: { projectId, path: entry.path, ...data },
      });
    }
  }

  const assets = (version.assetInventory as AssetInventoryEntry[]) || [];
  if (assets.length) {
    await restoreAssetsFromVersion(projectId, versionId, assets);
  }

  const mainPath = inventory.find((f) => f.name === "main.tex")?.path || "/main.tex";
  const mainFile = await prisma.latexFile.findUnique({
    where: { projectId_path: { projectId, path: mainPath } },
  });
  if (mainFile) {
    await prisma.latexFile.update({
      where: { id: mainFile.id },
      data: { content: version.dslSnapshot },
    });
  }

  await prisma.latexProject.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  await recordTimelineEvent(projectId, "restored", actorId, {
    restoredVersionId: versionId,
    restoredVersionNumber: version.versionNumber,
  });

  return {
    success: true,
    restoredVersionNumber: version.versionNumber,
    message: `Restored to version ${version.versionNumber}. A safety snapshot was created first.`,
  };
}

export async function getProjectTimeline(projectId: string) {
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  if (!project) throw new Error("Project not found");

  const events = await prisma.latexProjectTimelineEvent.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      actor: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const syntheticCreated = events.some((e) => e.eventType === "created")
    ? []
    : [
        {
          id: `synthetic-created-${projectId}`,
          eventType: "created",
          createdAt: project.createdAt,
          actor: null,
          metadata: { title: project.title },
        },
      ];

  return [...syntheticCreated, ...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function recordProjectVersion(
  projectId: string,
  dslSource: string,
  label: string,
  extras: {
    authorId?: string;
    learningUniverseId?: string;
    resourceCourseId?: string;
    publishType?: PublishType;
  } = {}
) {
  const publishType: PublishType =
    extras.publishType ||
    (label === "publish" ? "publish" : label === "republish" ? "republish" : "manual");

  const snapshot = await createProjectSnapshot(projectId, {
    dslSource,
    label,
    publishType,
    authorId: extras.authorId,
    learningUniverseId: extras.learningUniverseId,
    resourceCourseId: extras.resourceCourseId,
  });

  await recordTimelineEvent(
    projectId,
    publishType === "republish" ? "republished" : "published",
    extras.authorId,
    {
      versionId: snapshot?.id,
      versionNumber: snapshot?.versionNumber,
      learningUniverseId: extras.learningUniverseId,
    }
  );

  return snapshot;
}
