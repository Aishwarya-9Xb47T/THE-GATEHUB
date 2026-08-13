/**
 * Auto-repair missing lesson components and broken file references.
 */
import type { LuProjectJson } from "./luProjectSchema.js";
import { LU_PROJECT_JSON_PATH } from "./luProjectSchema.js";
import { prisma } from "../../utils/prisma.js";
import {
  normalizeProjectPath,
  type ProjectFileRecord,
} from "./luProjectFiles.js";
import { componentFilePath } from "./luComponentFilePaths.js";
import { emitLeafComponentTex } from "./luProjectTexSync.js";
import { emitTexFromComponent } from "./luComponentEmitters.js";
import {
  inferKindFromComponentId,
  defaultConfigForKind,
  COMPONENT_TITLES,
  type LuLessonComponentKind,
} from "./luComponentRegistry.js";
import { resetYjsForFileIds } from "./yjsDocumentService.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import type { LuDependencyGraph } from "./luDependencyGraph.js";
import type { LuValidationIssue } from "./luProjectValidator.js";
import { validateAllQuizzesInLesson } from "./luQuizValidator.js";
import { emitQuizQuestionTex } from "./luComponentEmitters.js";
import { validateTexInvariants } from "./luProjectTexSync.js";

export interface LuRepairAction {
  code: string;
  message: string;
  file?: string;
}

function emitVideoPlaceholder(title = "Video Lessons"): string {
  return `\\video{type={placeholder},title={${title}},url={},description={No instructor media attached yet. Upload a video or add a YouTube URL in the lesson editor.}}
`;
}

function emitPlaceholderForKind(
  kind: string,
  title: string,
  componentId: string
): string {
  if (kind === "video" || componentId === "videos") {
    return emitVideoPlaceholder(title);
  }
  const luKind = inferKindFromComponentId(componentId) as LuLessonComponentKind;
  const config = defaultConfigForKind(luKind, title);
  return emitTexFromComponent(luKind, title, config).trim() + "\n";
}

function inferComponentIdFromPath(path: string): string {
  const base = path.split("/").pop()?.replace(/\.tex$/i, "") ?? "component";
  return base;
}

function inferKindFromPath(path: string): string {
  const base = path.split("/").pop()?.replace(/\.tex$/i, "") ?? "";
  if (base === "videos") return "video";
  if (base === "analogy" || base === "concepts" || base === "common-mistakes" || base === "best-practices") {
    return "topics";
  }
  return inferKindFromComponentId(base);
}

async function persistFileChanges(
  projectId: string,
  contentMap: Map<string, string>,
  changedPaths: Set<string>
): Promise<void> {
  const yjsResetIds: string[] = [];
  for (const path of changedPaths) {
    const content = contentMap.get(path);
    if (content == null) continue;
    const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
    const name = path.split("/").pop() || "file.tex";
    if (existing) {
      if (existing.content !== content) {
        await prisma.latexFile.update({ where: { id: existing.id }, data: { content } });
        yjsResetIds.push(existing.id);
      }
    } else {
      const isFolder = false;
      const parentPath = path.slice(0, path.lastIndexOf("/")) || "/";
      const parent = await prisma.latexFile.findFirst({ where: { projectId, path: parentPath } });
      if (!parent && parentPath !== "/") {
        await prisma.latexFile.create({
          data: {
            projectId,
            path: parentPath,
            name: parentPath.split("/").pop() || "folder",
            isFolder: true,
            content: null,
          },
        });
      }
      const created = await prisma.latexFile.create({
        data: { projectId, path, name, isFolder, content },
      });
      yjsResetIds.push(created.id);
    }
  }
  if (yjsResetIds.length) {
    await resetYjsForFileIds(projectId, yjsResetIds);
  }
}

async function persistProjectJson(projectId: string, project: LuProjectJson): Promise<void> {
  project.metadata.updatedAt = new Date().toISOString();
  const pj = await prisma.latexFile.findFirst({ where: { projectId, path: LU_PROJECT_JSON_PATH } });
  if (pj) {
    await prisma.latexFile.update({
      where: { id: pj.id },
      data: { content: JSON.stringify(project, null, 2) },
    });
  }
}

/** Create missing files referenced in the dependency graph. */
export async function repairMissingDependencies(
  projectId: string,
  project: LuProjectJson,
  contentMap: Map<string, string>,
  graph: LuDependencyGraph
): Promise<{ repairs: LuRepairAction[]; changed: boolean }> {
  const repairs: LuRepairAction[] = [];
  const changedPaths = new Set<string>();
  let projectChanged = false;

  for (const missing of graph.missingTargets) {
    if (!missing.endsWith(".tex")) continue;

    const edge = graph.edges.find((e) => e.to === missing);
    const componentId = inferComponentIdFromPath(missing);
    const kind = inferKindFromPath(missing);
    const title = COMPONENT_TITLES[kind as LuLessonComponentKind] ?? componentId;

    const content = emitPlaceholderForKind(kind, title, componentId);
    contentMap.set(missing, content);
    changedPaths.add(missing);
    repairs.push({
      code: "CREATED_MISSING_FILE",
      message: `Generated placeholder for missing file: ${missing}`,
      file: missing,
    });

    const lessonDirMatch = missing.match(/^(.*\/lesson-\d+)\//i);
    if (lessonDirMatch) {
      for (const track of project.tracks) {
        for (const mod of track.modules) {
          for (const lesson of mod.lessons) {
            const expectedDir = normalizeProjectPath(`/${track.folder}/${mod.folder}/${lesson.id}`);
            if (!missing.startsWith(expectedDir)) continue;
            const hasComp = (lesson.components ?? []).some((c) => c.id === componentId);
            if (!hasComp) {
              lesson.components = [
                ...(lesson.components ?? []),
                {
                  id: componentId,
                  kind,
                  title,
                  file: missing,
                  config: defaultConfigForKind(inferKindFromComponentId(componentId) as LuLessonComponentKind, title),
                },
              ];
              projectChanged = true;
            }
          }
        }
      }
    }

    void edge;
  }

  if (changedPaths.size) {
    await persistFileChanges(projectId, contentMap, changedPaths);
  }
  if (projectChanged) {
    await persistProjectJson(projectId, project);
  }

  return { repairs, changed: changedPaths.size > 0 || projectChanged };
}

/** Ensure every registered component has a file on disk. */
export async function repairMissingComponentFiles(
  projectId: string,
  project: LuProjectJson,
  contentMap: Map<string, string>
): Promise<{ repairs: LuRepairAction[]; changed: boolean }> {
  const repairs: LuRepairAction[] = [];
  const changedPaths = new Set<string>();

  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const comp of lesson.components ?? []) {
          const compPath =
            comp.file ||
            componentFilePath(track.folder, mod.folder, lesson.id, comp.id, comp.kind);
          comp.file = compPath;

          if (!contentMap.has(normalizeProjectPath(compPath))) {
            const body =
              comp.kind === "video"
                ? emitVideoPlaceholder(comp.title)
                : emitLeafComponentTex({ ...comp } as LuLessonComponentRef, null);
            contentMap.set(normalizeProjectPath(compPath), body);
            changedPaths.add(normalizeProjectPath(compPath));
            repairs.push({
              code: "CREATED_COMPONENT_FILE",
              message: `Generated missing component: ${compPath}`,
              file: compPath,
            });
          }

          if (comp.kind === "quiz") {
            for (const child of comp.children ?? []) {
              const childPath =
                child.file ||
                componentFilePath(track.folder, mod.folder, lesson.id, child.id, comp.kind);
              child.file = childPath;
              if (!contentMap.has(normalizeProjectPath(childPath))) {
                const qBody = emitQuizQuestionTex(child.title, child.config ?? {}).trim() + "\n";
                contentMap.set(normalizeProjectPath(childPath), qBody);
                changedPaths.add(normalizeProjectPath(childPath));
                repairs.push({
                  code: "CREATED_QUIZ_QUESTION",
                  message: `Generated missing quiz question: ${childPath}`,
                  file: childPath,
                });
              }
            }
            if (!(comp.children ?? []).length) {
              comp.children = [
                {
                  id: "question-01",
                  kind: "question",
                  title: "Question 1",
                  file: componentFilePath(track.folder, mod.folder, lesson.id, "question-01", comp.kind),
                  config: {},
                },
              ];
              const qPath = normalizeProjectPath(comp.children[0].file!);
              contentMap.set(qPath, emitQuizQuestionTex("Question 1", {}).trim() + "\n");
              changedPaths.add(qPath);
              repairs.push({
                code: "CREATED_DEFAULT_QUIZ",
                message: `Quiz ${comp.id} had no questions — added default question`,
                file: comp.file,
              });
            }
          }
        }
      }
    }
  }

  if (changedPaths.size) {
    await persistFileChanges(projectId, contentMap, changedPaths);
    await persistProjectJson(projectId, project);
  }

  return { repairs, changed: changedPaths.size > 0 };
}

export function quizValidationToIssues(project: LuProjectJson): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        const quizIssues = validateAllQuizzesInLesson(lesson);
        for (const qi of quizIssues) {
          issues.push({
            severity: "error",
            code: qi.code,
            message: qi.message,
            file: `/${track.folder}/${mod.folder}/${lesson.file}`,
            suggestedFix: "Regenerate quiz structure or add missing questions",
          });
        }
      }
    }
  }
  return issues;
}

export function texInvariantIssuesToValidation(project: LuProjectJson): LuValidationIssue[] {
  return validateTexInvariants(project).map((i) => ({
    severity: "error" as const,
    code: i.code,
    message: i.message,
    file: i.path,
    suggestedFix: "Regenerate orchestration .tex from project.json",
  }));
}

export function filesToContentMapFromRecords(files: ProjectFileRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of files) {
    if (!f.isFolder && f.content != null) {
      map.set(normalizeProjectPath(f.path), f.content);
    }
  }
  return map;
}
