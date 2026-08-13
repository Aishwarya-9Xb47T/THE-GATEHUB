import { prisma } from "../../utils/prisma.js";
import { parseLearningUniverseLatex } from "../../controllers/learning-universe-parser.js";
import {
  loadProjectFiles,
  type ProjectFileRecord,
} from "./luProjectFiles.js";
import { isLuV2Project } from "./luProjectFiles.js";
import { LU_LEGACY_BACKUP_PATH, LU_PROJECT_JSON_PATH, type LuProjectJson } from "./luProjectSchema.js";
import { buildLuProjectFilesFromParsed } from "./luProjectFileEmitter.js";
import { buildMainTexFromProject, hashMainTex } from "./luProjectMainTexBuilder.js";
import { isUserOwnedComponentTexPath } from "./luProjectTexSync.js";

export interface MigrationResult {
  migrated: boolean;
  alreadyV2: boolean;
  projectId: string;
  backupPath?: string;
  fileCount?: number;
}

async function upsertProjectFile(
  projectId: string,
  entry: { path: string; name: string; isFolder: boolean; content: string },
  options?: { preserveExistingUserFiles?: boolean }
) {
  if (options?.preserveExistingUserFiles && isUserOwnedComponentTexPath(entry.path)) {
    const existing = await prisma.latexFile.findFirst({
      where: { projectId, path: entry.path },
    });
    if (existing?.content?.trim()) {
      return existing.id;
    }
  }

  const file = await prisma.latexFile.upsert({
    where: {
      projectId_path: { projectId, path: entry.path },
    },
    create: {
      projectId,
      path: entry.path,
      name: entry.name,
      isFolder: entry.isFolder,
      content: entry.isFolder ? null : entry.content,
    },
    update: {
      name: entry.name,
      isFolder: entry.isFolder,
      content: entry.isFolder ? null : entry.content,
    },
  });
  return file.id;
}

export async function writeLuProjectToDb(
  projectId: string,
  project: LuProjectJson,
  files: Array<{ path: string; name: string; isFolder: boolean; content: string }>,
  mainTex: string,
  options?: { preserveExistingUserFiles?: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  project.metadata.updatedAt = now;
  project.versionMeta.lastMainTexHash = hashMainTex(mainTex);

  await upsertProjectFile(
    projectId,
    {
      path: LU_PROJECT_JSON_PATH,
      name: "project.json",
      isFolder: false,
      content: JSON.stringify(project, null, 2),
    },
    options
  );

  for (const f of files) {
    await upsertProjectFile(projectId, f, options);
  }

  await upsertProjectFile(
    projectId,
    {
      path: "/main.tex",
      name: "main.tex",
      isFolder: false,
      content: mainTex,
    },
    options
  );
}

function getMainTexContent(files: ProjectFileRecord[]): string {
  const main = files.find((f) => f.path === "/main.tex" && !f.isFolder);
  return main?.content?.trim() || "";
}

async function recoverMainTexFromLinkedUniverse(projectId: string): Promise<string | null> {
  const universe = await prisma.learningUniverse.findFirst({
    where: { sourceProjectId: projectId },
    select: { dslSource: true },
  });
  const dsl = universe?.dslSource?.trim();
  if (!dsl || !/\\(learninguniverse|track|module|lesson)\s*\{/i.test(dsl)) {
    return null;
  }
  return dsl;
}

async function seedMainTexIfEmpty(projectId: string, content: string): Promise<void> {
  await upsertProjectFile(projectId, {
    path: "/main.tex",
    name: "main.tex",
    isFolder: false,
    content,
  });
}

export async function migrateSingleFileToProject(projectId: string): Promise<MigrationResult> {
  const files = await loadProjectFiles(projectId);

  if (isLuV2Project(files)) {
    return { migrated: false, alreadyV2: true, projectId };
  }

  const mainContent = getMainTexContent(files);
  if (!mainContent) {
    throw new Error("Cannot migrate: main.tex is empty");
  }

  const parsed = parseLearningUniverseLatex(mainContent);
  if (!parsed?.universe?.title) {
    throw new Error("Cannot migrate: main.tex does not contain a valid Learning Universe DSL");
  }

  const title = parsed.universe.title;
  const { project, files: scaffoldFiles } = buildLuProjectFilesFromParsed(parsed, title);

  project.metadata.migratedFrom = "single-file";
  project.metadata.migrationBackupPath = LU_LEGACY_BACKUP_PATH;

  const mainTex = buildMainTexFromProject(project);

  // Backup original
  await upsertProjectFile(projectId, {
    path: LU_LEGACY_BACKUP_PATH,
    name: "original-main.tex",
    isFolder: false,
    content: mainContent,
  });

  await upsertProjectFile(projectId, {
    path: "/legacy-backup",
    name: "legacy-backup",
    isFolder: true,
    content: "",
  });

  await writeLuProjectToDb(projectId, project, scaffoldFiles, mainTex);

  return {
    migrated: true,
    alreadyV2: false,
    projectId,
    backupPath: LU_LEGACY_BACKUP_PATH,
    fileCount: scaffoldFiles.length + 2,
  };
}

export async function ensureLuProjectV2(projectId: string): Promise<MigrationResult> {
  let files = await loadProjectFiles(projectId);

  if (isLuV2Project(files)) {
    if (!getMainTexContent(files)) {
      await regenerateMainTexFromProjectJson(projectId);
    }
    return { migrated: false, alreadyV2: true, projectId };
  }

  let mainContent = getMainTexContent(files);
  if (!mainContent) {
    const backup = files.find((f) => f.path === LU_LEGACY_BACKUP_PATH)?.content?.trim();
    if (backup) {
      await seedMainTexIfEmpty(projectId, backup);
      mainContent = backup;
    }
  }
  if (!mainContent) {
    const recovered = await recoverMainTexFromLinkedUniverse(projectId);
    if (recovered) {
      await seedMainTexIfEmpty(projectId, recovered);
      mainContent = recovered;
    }
  }
  if (!mainContent) {
    throw new Error(
      "Cannot migrate: main.tex is empty. Link a Learning Universe with DSL content or switch to Developer Mode."
    );
  }

  return migrateSingleFileToProject(projectId);
}

export async function regenerateMainTexFromProjectJson(projectId: string): Promise<string> {
  const files = await loadProjectFiles(projectId);
  const jsonFile = files.find((f) => f.path === LU_PROJECT_JSON_PATH);
  if (!jsonFile?.content) {
    throw new Error("project.json not found");
  }

  const project = JSON.parse(jsonFile.content) as LuProjectJson;
  const mainTex = buildMainTexFromProject(project);
  project.versionMeta.lastMainTexHash = hashMainTex(mainTex);
  project.metadata.updatedAt = new Date().toISOString();

  await upsertProjectFile(projectId, {
    path: LU_PROJECT_JSON_PATH,
    name: "project.json",
    isFolder: false,
    content: JSON.stringify(project, null, 2),
  });

  await upsertProjectFile(projectId, {
    path: "/main.tex",
    name: "main.tex",
    isFolder: false,
    content: mainTex,
  });

  return mainTex;
}
