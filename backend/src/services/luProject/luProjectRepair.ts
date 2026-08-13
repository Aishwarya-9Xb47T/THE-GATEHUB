import type { LuProjectJson } from "./luProjectSchema.js";
import { LU_PROJECT_JSON_PATH } from "./luProjectSchema.js";
import { prisma } from "../../utils/prisma.js";
import {
  repairLegacyComponentIds,
  syncLessonComponentsFromTex,
  type LuLessonComponentRef,
} from "./luLessonComponents.js";
import {
  TEX_PATTERNS,
  type LuLessonComponentKind,
} from "./luComponentRegistry.js";
import {
  dedupeLessonHeaders,
  componentMarker,
  dedupeComponentMarkers,
  blockRange,
  listMarkersInContent,
} from "./luTexMarkers.js";
import {
  componentFilePath,
  lessonComponentDir,
  wrapComponentInput,
} from "./luComponentFilePaths.js";
import { buildFullProjectTexMap, isUserOwnedComponentTexPath } from "./luProjectTexSync.js";
import { normalizeProjectComponents } from "./luOrchestrationEngine.js";
import { resetYjsForFileIds } from "./yjsDocumentService.js";
import { loadProjectFiles, filesToContentMap, normalizeProjectPath } from "./luProjectFiles.js";
import { getProjectJsonFromFiles } from "./luProjectFiles.js";
import { repairOrchestrationFromProject } from "./luTexAst.js";

function extractTexBody(block: string): string {
  const lines = block.split("\n");
  const body: string[] = [];
  let pastMarker = false;
  for (const line of lines) {
    if (/^%\s*LU:component:/.test(line)) {
      pastMarker = true;
      continue;
    }
    if (pastMarker) body.push(line);
  }
  return body.join("\n").trim();
}

function pruneOrphanComponents(lesson: { components?: LuLessonComponentRef[] }, content: string): boolean {
  const markerIds = new Set(listMarkersInContent(content));
  const components = lesson.components ?? [];
  if (markerIds.size === 0) return false;
  const filtered = components.filter((c) => markerIds.has(c.id));
  if (filtered.length !== components.length) {
    lesson.components = filtered;
    return true;
  }
  return false;
}

function dedupeComponentChildren(lesson: { components?: LuLessonComponentRef[] }): boolean {
  let changed = false;
  for (const comp of lesson.components ?? []) {
    if (!comp.children?.length) continue;
    const seen = new Set<string>();
    const unique: LuLessonComponentRef[] = [];
    for (const child of comp.children) {
      if (seen.has(child.id)) {
        changed = true;
        continue;
      }
      seen.add(child.id);
      unique.push(child);
    }
    if (unique.length !== comp.children.length) {
      comp.children = unique;
      changed = true;
    }
  }
  return changed;
}

async function migrateInlineComponentsToOwnedFiles(
  projectId: string,
  trackFolder: string,
  modFolder: string,
  lesson: { id: string; components?: LuLessonComponentRef[] },
  content: string,
  contentMap: Map<string, string>
): Promise<{ content: string; changed: boolean }> {
  let changed = false;
  const lessonDir = lessonComponentDir(trackFolder, modFolder, lesson.id);

  const existingFolder = await prisma.latexFile.findFirst({
    where: { projectId, path: lessonDir },
  });
  if (!existingFolder) {
    await prisma.latexFile.create({
      data: { projectId, path: lessonDir, name: lesson.id, isFolder: true, content: null },
    });
    changed = true;
  }

  for (const comp of lesson.components ?? []) {
    const compPath = componentFilePath(trackFolder, modFolder, lesson.id, comp.id, comp.kind);
    comp.file = compPath;

    const range = blockRange(content, comp.id);
    if (!range) continue;

    const block = content.slice(range.start, range.end);
    const body = extractTexBody(block);

    if (body.startsWith("\\input{")) {
      contentMap.set(compPath, contentMap.get(compPath) || `% ${comp.kind} component\n`);
      continue;
    }

    if (body.length > 0) {
      contentMap.set(compPath, body.trim() + "\n");
      const replacement = wrapComponentInput(comp.id, lesson.id, comp.kind);
      content = content.slice(0, range.start) + replacement.trim() + content.slice(range.end);
      changed = true;
    }

    for (const child of comp.children ?? []) {
      const childPath = componentFilePath(trackFolder, modFolder, lesson.id, child.id, comp.kind);
      child.file = childPath;
      const childRange = blockRange(content, child.id);
      if (!childRange) {
        const parentContent = contentMap.get(compPath) || "";
        const childRangeInParent = blockRange(parentContent, child.id);
        if (childRangeInParent) {
          const childBlock = parentContent.slice(childRangeInParent.start, childRangeInParent.end);
          const childBody = extractTexBody(childBlock);
          if (childBody && !childBody.startsWith("\\input{")) {
            contentMap.set(childPath, childBody.trim() + "\n");
            const childReplacement = wrapComponentInput(child.id, lesson.id, comp.kind, "sibling");
            const updatedParent =
              parentContent.slice(0, childRangeInParent.start) +
              childReplacement.trim() +
              parentContent.slice(childRangeInParent.end);
            contentMap.set(compPath, updatedParent.trim() + "\n");
            changed = true;
          }
        }
        continue;
      }
      const childBlock = content.slice(childRange.start, childRange.end);
      const childBody = extractTexBody(childBlock);
      if (childBody && !childBody.startsWith("\\input{")) {
        contentMap.set(childPath, childBody.trim() + "\n");
        const childReplacement = wrapComponentInput(child.id, lesson.id, comp.kind, "sibling");
        content =
          content.slice(0, childRange.start) + childReplacement.trim() + content.slice(childRange.end);
        changed = true;
      }
    }
  }

  return { content, changed };
}

function stampMarkersOnContent(content: string, components: LuLessonComponentRef[]): string {
  let result = content;
  const consumed = new Map<string, number>();
  for (const comp of components) {
    if (result.includes(componentMarker(comp.id))) continue;
    const pattern = TEX_PATTERNS[comp.kind];
    if (!pattern) continue;
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    const occ = consumed.get(comp.kind) ?? 0;
    let match: RegExpExecArray | null = null;
    let count = 0;
    while ((match = re.exec(result)) !== null) {
      if (count === occ) {
        result = result.slice(0, match.index) + componentMarker(comp.id) + "\n" + result.slice(match.index);
        consumed.set(comp.kind, occ + 1);
        break;
      }
      count++;
    }
    for (const child of comp.children ?? []) {
      if (result.includes(componentMarker(child.id))) continue;
      const childPattern = comp.kind === "quiz" ? TEX_PATTERNS.quiz : TEX_PATTERNS.resources;
      const childKey = `${comp.kind}:child`;
      const childOcc = consumed.get(childKey) ?? 0;
      const cre = new RegExp(
        childPattern.source,
        childPattern.flags.includes("g") ? childPattern.flags : `${childPattern.flags}g`
      );
      let cm: RegExpExecArray | null = null;
      let ccount = 0;
      while ((cm = cre.exec(result)) !== null) {
        if (ccount === childOcc) {
          result = result.slice(0, cm.index) + componentMarker(child.id) + "\n" + result.slice(cm.index);
          consumed.set(childKey, childOcc + 1);
          break;
        }
        ccount++;
      }
    }
  }
  return result;
}

/** Repair legacy corruption: dedupe lesson headers, sync components, fix duplicate ids. */
export async function repairLuProject(
  projectId: string,
  project: LuProjectJson,
  contentMap: Map<string, string>
): Promise<{ project: LuProjectJson; texChanged: boolean }> {
  let projectChanged = false;
  let texChanged = false;

  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (let i = 0; i < mod.lessons.length; i++) {
        const lesson = mod.lessons[i];
        const path = `/${track.folder}/${mod.folder}/${lesson.file}`;
        let content = contentMap.get(path) || "";

        const deduped = dedupeLessonHeaders(dedupeComponentMarkers(content));
        if (deduped !== content) {
          content = deduped;
          contentMap.set(path, content);
          texChanged = true;
        }

        const beforeJson = JSON.stringify(lesson.components ?? []);
        const synced = syncLessonComponentsFromTex(lesson, content);
        if (repairLegacyComponentIds(synced)) projectChanged = true;
        if (dedupeComponentChildren(synced)) projectChanged = true;
        if (pruneOrphanComponents(synced, content)) projectChanged = true;

        const migrated = await migrateInlineComponentsToOwnedFiles(
          projectId,
          track.folder,
          mod.folder,
          synced,
          content,
          contentMap
        );
        if (migrated.changed) {
          content = migrated.content;
          contentMap.set(path, content);
          texChanged = true;
          projectChanged = true;
        }

        // Do NOT stamp markers or append inputs — orchestration is regenerated from project.json below.
        const afterJson = JSON.stringify(synced.components ?? []);
        if (beforeJson !== afterJson) projectChanged = true;
        mod.lessons[i] = synced;
      }
    }
  }

  if (projectChanged) {
    project.metadata.updatedAt = new Date().toISOString();
  }

  const { buildOrchestrationFiles } = await import("./luOrchestrationEngine.js");
  normalizeProjectComponents(project);
  for (const { path, content } of buildOrchestrationFiles(project)) {
    if (contentMap.get(path) !== content) {
      contentMap.set(path, content);
      texChanged = true;
    }
  }

  const regenerated = buildFullProjectTexMap(project);
  for (const [path, content] of regenerated.entries()) {
    if (isUserOwnedComponentTexPath(path)) {
      // Instructor-authored sources: only create when missing — never clobber saved .tex.
      if (contentMap.has(path)) continue;
    } else if (/\/lesson-\d+\.tex$/i.test(path) || /\/module\.tex$/i.test(path) || /\/track\.tex$/i.test(path)) {
      continue;
    }
    if (contentMap.get(path) !== content) {
      contentMap.set(path, content);
      texChanged = true;
    }
  }

  if (projectChanged || texChanged) {
    const yjsResetIds: string[] = [];
    for (const [path, content] of contentMap.entries()) {
      if (!path.endsWith(".tex") || path.includes("main.tex")) continue;
      const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
      const name = path.split("/").pop() || "file.tex";
      if (existing && existing.content !== content) {
        await prisma.latexFile.update({ where: { id: existing.id }, data: { content } });
        yjsResetIds.push(existing.id);
      } else if (!existing) {
        const created = await prisma.latexFile.create({
          data: { projectId, path, name, isFolder: false, content },
        });
        yjsResetIds.push(created.id);
      }
    }
    if (yjsResetIds.length) {
      await resetYjsForFileIds(projectId, yjsResetIds);
    }
    if (projectChanged) {
      const pj = await prisma.latexFile.findFirst({ where: { projectId, path: LU_PROJECT_JSON_PATH } });
      if (pj) {
        await prisma.latexFile.update({
          where: { id: pj.id },
          data: { content: JSON.stringify(project, null, 2) },
        });
      }
    }
  }

  return { project, texChanged: texChanged || projectChanged };
}

/** Persist fixed track/module/lesson .tex when AI or manual edits left inputs inside metadata blocks. */
export async function repairOrchestrationTexIfNeeded(projectId: string): Promise<boolean> {
  const files = await loadProjectFiles(projectId);
  const project = getProjectJsonFromFiles(files);
  if (!project?.tracks?.length) return false;

  const contentMap = filesToContentMap(files);
  if (!repairOrchestrationFromProject(contentMap, project)) return false;

  const yjsResetIds: string[] = [];
  for (const track of project.tracks) {
    const paths = new Set<string>([
      normalizeProjectPath(`/${track.folder}/${track.file}`),
      ...track.modules.map((mod) => normalizeProjectPath(`/${track.folder}/${mod.folder}/${mod.file}`)),
      ...track.modules.flatMap((mod) =>
        mod.lessons.flatMap((lesson) => {
          const lessonPaths = [
            normalizeProjectPath(`/${track.folder}/${mod.folder}/${lesson.file}`),
          ];
          for (const comp of lesson.components ?? []) {
            if (comp.file) lessonPaths.push(normalizeProjectPath(comp.file));
          }
          return lessonPaths;
        })
      ),
    ]);
    for (const path of paths) {
      const content = contentMap.get(path);
      if (!content) continue;
      const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
      if (existing && existing.content !== content) {
        await prisma.latexFile.update({ where: { id: existing.id }, data: { content } });
        yjsResetIds.push(existing.id);
      }
    }
  }

  if (yjsResetIds.length) {
    await resetYjsForFileIds(projectId, yjsResetIds);
  }
  return true;
}
