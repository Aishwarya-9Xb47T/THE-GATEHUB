/**
 * One-time migration — upgrades legacy projects on first load, then never runs again.
 * Surgical JSON + owned-file fixes only. Never bulk-regenerates orchestration tex.
 */
import { prisma } from "../../utils/prisma.js";
import type { LuProjectJson, LuProjectLessonRef } from "./luProjectSchema.js";
import { LU_PROJECT_JSON_PATH } from "./luProjectSchema.js";
import { loadProjectFiles } from "./luProjectFiles.js";
import { persistProjectJson } from "./luAuthoringEngine.js";
import { repairLegacyComponentIds } from "./luLessonComponents.js";
import { nextQuestionIdInLesson } from "./luLessonClone.js";
import { normalizeQuestionChild } from "./luQuizValidator.js";
import { componentFilePath } from "./luComponentFilePaths.js";
import { emitQuestionTex } from "./luQuizTexEmitter.js";
import { emitContainerOrchestrationTex } from "./luProjectTexSync.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";

export const TX_ENGINE_VERSION = 3;

export function needsTxEngineMigration(project: LuProjectJson): boolean {
  return (project.metadata.txEngineVersion ?? 0) < TX_ENGINE_VERSION;
}

function repairLessonOwnership(lesson: LuProjectLessonRef): boolean {
  let changed = false;
  if (repairLegacyComponentIds(lesson)) changed = true;

  const usedQuestionIds = new Set<string>();

  for (const comp of lesson.components ?? []) {
    if (comp.kind !== "quiz") continue;

    const nextChildren: LuLessonComponentRef[] = [];
    for (const raw of comp.children ?? []) {
      let child = normalizeQuestionChild(
        {
          ...raw,
          kind: (raw.kind === "quiz" || raw.id.startsWith("quiz-q-") ? "question" : raw.kind) as LuLessonComponentRef["kind"],
          id: raw.id.startsWith("quiz-q-") ? raw.id.replace(/^quiz-q/, "question") : raw.id,
        },
        comp.id
      );

      if (usedQuestionIds.has(child.id)) {
        child = {
          ...child,
          id: nextQuestionIdInLesson(lesson),
          file: undefined,
        };
        changed = true;
      }
      usedQuestionIds.add(child.id);

      const parentId = String(child.config?.parentId ?? "");
      if (parentId !== comp.id) {
        child = {
          ...child,
          config: { ...(child.config ?? {}), parentId: comp.id },
        };
        changed = true;
      }

      nextChildren.push(child);
    }
    if (nextChildren.length !== (comp.children ?? []).length) changed = true;
    comp.children = nextChildren;
  }

  return changed;
}

/** Repair cross-quiz duplicate question IDs — safe to run on every load. */
export function repairProjectQuestionOwnership(project: LuProjectJson): boolean {
  let changed = false;
  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        if (repairLessonOwnership(lesson)) changed = true;
      }
    }
  }
  return changed;
}

async function writeFile(projectId: string, path: string, content: string): Promise<void> {
  const name = path.split("/").pop() || "file.tex";
  const normalized = content.trim() + "\n";
  const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
  if (existing) {
    await prisma.latexFile.update({ where: { id: existing.id }, data: { content: normalized } });
  } else {
    await prisma.latexFile.create({
      data: { projectId, path, name, isFolder: false, content: normalized },
    });
  }
}

/** Persist surgical tex fixes for migrated quiz/question ownership. */
async function syncMigratedQuizFiles(
  projectId: string,
  project: LuProjectJson
): Promise<void> {
  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const comp of lesson.components ?? []) {
          if (comp.kind !== "quiz") continue;
          const quizPath =
            comp.file ||
            componentFilePath(track.folder, mod.folder, lesson.id, comp.id, comp.kind);
          comp.file = quizPath;

          await writeFile(projectId, quizPath, emitContainerOrchestrationTex(comp as LuLessonComponentRef));

          for (const child of comp.children ?? []) {
            const qRef = { ...child, kind: "question" as const } as LuLessonComponentRef;
            const qPath = componentFilePath(track.folder, mod.folder, lesson.id, qRef.id, "question");
            qRef.file = qPath;
            await writeFile(projectId, qPath, emitQuestionTex(qRef));
          }
        }
      }
    }
  }
}

export interface MigrationResult {
  project: LuProjectJson;
  migrated: boolean;
  fixes: string[];
}

/**
 * Run once per project when txEngineVersion < TX_ENGINE_VERSION.
 * Marks project permanently upgraded — never runs again on subsequent loads.
 */
export async function runOneTimeMigrationIfNeeded(
  projectId: string,
  project: LuProjectJson
): Promise<MigrationResult> {
  if (!needsTxEngineMigration(project)) {
    return { project, migrated: false, fixes: [] };
  }

  const fixes: string[] = [];
  let jsonChanged = false;

  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        if (repairLessonOwnership(lesson)) {
          jsonChanged = true;
          fixes.push(`Repaired question ownership in ${lesson.id}`);
        }
      }
    }
  }

  if (jsonChanged) {
    fixes.push("Repaired question ownership in project.json");
  }

  await syncMigratedQuizFiles(projectId, project);
  fixes.push("Re-synced quiz/question .tex files (brace-safe encoding)");

  project.metadata.txEngineVersion = TX_ENGINE_VERSION;
  project.metadata.txEngineMigratedAt = new Date().toISOString();
  project.metadata.updatedAt = new Date().toISOString();

  await persistProjectJson(projectId, project);
  fixes.push(`Upgraded to txEngine v${TX_ENGINE_VERSION}`);

  return { project, migrated: true, fixes };
}

/** Force re-run migration (tests / admin only). */
export async function runMigrationForProject(projectId: string): Promise<MigrationResult> {
  const files = await loadProjectFiles(projectId);
  const raw = files.find((f) => f.path === LU_PROJECT_JSON_PATH)?.content;
  if (!raw) throw new Error("Not a v2 project");
  const project = JSON.parse(raw) as LuProjectJson;
  project.metadata.txEngineVersion = 0;
  return runOneTimeMigrationIfNeeded(projectId, project);
}
