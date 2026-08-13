/**
 * Ensures a LU v2 LaTeX project exists for structured/visual publish — routes all editors through runLuPublishPipeline.
 * Materializes real component .tex files via buildLuProjectFilesFromParsed (canonical compiler inputs).
 */
import { prisma } from "../../utils/prisma.js";
import { emitLearningUniverseDsl } from "../learningUniverseDslEmitter.js";
import type { LearningUniverseStructured } from "../learningUniverseSchema.js";
import { buildLuProjectFilesFromParsed } from "./luProjectFileEmitter.js";
import { buildMainTexFromProject } from "./luProjectMainTexBuilder.js";
import { writeLuProjectToDb } from "./migrateSingleFileToProject.js";
import { parseLearningUniverseLatex } from "../../controllers/learning-universe-parser.js";
import { LU_LEGACY_BACKUP_PATH } from "./luProjectSchema.js";
import { isLuV2Project, loadProjectFiles } from "./luProjectFiles.js";

export interface EnsureStructuredProjectOptions {
  userId: string;
  structuredData: LearningUniverseStructured;
  universeId?: string;
  dslSource?: string;
}

export async function ensureProjectForStructuredPublish(
  options: EnsureStructuredProjectOptions
): Promise<string> {
  const dsl = options.dslSource?.trim() || emitLearningUniverseDsl(options.structuredData);
  if (!dsl.trim()) {
    throw new Error("Structured publish produced empty DSL");
  }

  let projectId: string | undefined;
  let universeId = options.universeId;

  if (universeId) {
    const universe = await prisma.learningUniverse.findUnique({
      where: { id: universeId },
      select: { id: true, instructorId: true, sourceProjectId: true, title: true },
    });
    if (!universe) throw new Error("Learning Universe not found");
    if (universe.instructorId !== options.userId) throw new Error("Unauthorized");

    if (universe.sourceProjectId) {
      const existing = await prisma.latexProject.findUnique({
        where: { id: universe.sourceProjectId },
      });
      if (existing) projectId = existing.id;
    }

    if (!projectId) {
      const project = await prisma.latexProject.create({
        data: { title: universe.title, ownerId: options.userId },
      });
      projectId = project.id;
      await prisma.learningUniverse.update({
        where: { id: universeId },
        data: { sourceProjectId: projectId },
      });
    }

    // Existing v2 projects already have instructor-owned .tex files — never re-scaffold on republish.
    const existingFiles = await loadProjectFiles(projectId);
    if (isLuV2Project(existingFiles)) {
      const dsl = options.dslSource?.trim() || emitLearningUniverseDsl(options.structuredData);
      await prisma.latexFile.upsert({
        where: { projectId_path: { projectId, path: LU_LEGACY_BACKUP_PATH } },
        create: {
          projectId,
          path: LU_LEGACY_BACKUP_PATH,
          name: "original-main.tex",
          isFolder: false,
          content: dsl,
        },
        update: {
          content: dsl,
          name: "original-main.tex",
          isFolder: false,
        },
      });
      await prisma.learningUniverse.update({
        where: { id: universeId },
        data: {
          sourceProjectId: projectId,
          structuredData: options.structuredData as object,
          dslSource: dsl,
        },
      });
      return projectId;
    }
  }

  if (!projectId) {
    const title = options.structuredData.universe?.title || "Learning Universe";
    const project = await prisma.latexProject.create({
      data: { title, ownerId: options.userId },
    });
    projectId = project.id;
  }

  const parsed = parseLearningUniverseLatex(dsl);
  if (!parsed?.universe?.title) {
    throw new Error("Structured publish DSL did not parse into a Learning Universe");
  }

  const title = parsed.universe.title || options.structuredData.universe?.title || "Course";
  const { project: projectJson, files } = buildLuProjectFilesFromParsed(parsed, title);
  projectJson.metadata.migratedFrom = "structured-visual-publish";
  projectJson.metadata.migrationBackupPath = LU_LEGACY_BACKUP_PATH;

  const mainTex = buildMainTexFromProject(projectJson);

  // Preserve full DSL for forensics / re-migration — not used as compiler input for lesson bodies.
  await prisma.latexFile.upsert({
    where: { projectId_path: { projectId, path: LU_LEGACY_BACKUP_PATH } },
    create: {
      projectId,
      path: LU_LEGACY_BACKUP_PATH,
      name: "original-main.tex",
      isFolder: false,
      content: dsl,
    },
    update: {
      content: dsl,
      name: "original-main.tex",
      isFolder: false,
    },
  });

  await writeLuProjectToDb(projectId, projectJson, files, mainTex);

  if (!universeId) {
    const draft = await prisma.learningUniverse.create({
      data: {
        title: options.structuredData.universe?.title || "Learning Universe",
        description: options.structuredData.universe?.description || "",
        difficulty: options.structuredData.universe?.difficulty || "Beginner",
        instructorId: options.userId,
        status: "draft",
        sourceProjectId: projectId,
        structuredData: options.structuredData as object,
        dslSource: dsl,
      },
    });
    universeId = draft.id;
  } else {
    await prisma.learningUniverse.update({
      where: { id: universeId },
      data: {
        sourceProjectId: projectId,
        structuredData: options.structuredData as object,
        dslSource: dsl,
      },
    });
  }

  return projectId;
}
