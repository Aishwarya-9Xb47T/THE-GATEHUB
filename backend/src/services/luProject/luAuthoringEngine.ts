/**
 * Authoring engine — CREATE once, UPDATE only the owned file.
 * project.json is the registry; tex files are updated surgically, never bulk-regenerated.
 */
import { prisma } from "../../utils/prisma.js";
import { loadProjectFiles } from "./luProjectFiles.js";
import type { LuProjectJson, LuProjectLessonRef, LuProjectModuleRef, LuProjectTrackRef } from "./luProjectSchema.js";
import { LU_PROJECT_JSON_PATH } from "./luProjectSchema.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import { findComponentById } from "./luLessonComponents.js";
import { componentFilePath, componentInputRef, lessonComponentDir } from "./luComponentFilePaths.js";
import { resetYjsForFileIds } from "./yjsDocumentService.js";
import {
  emitTrackOrchestrationTex,
  emitModuleOrchestrationTex,
  emitLessonOrchestrationTex,
  emitContainerOrchestrationTex,
  emitLeafComponentTex,
  buildProjectTexEntries,
} from "./luProjectTexSync.js";
import {
  addComponentInput,
  addSiblingInput,
  addMainInputLine,
  removeComponentInput,
  removeMainInputLine,
  patchMetadataTitle,
  dedupeCommandBlock,
  rebuildTrackInputs,
  rebuildModuleInputs,
} from "./luTexAst.js";
import { reorderMarkedBlocks } from "./luTexMarkers.js";
import { hasComponentMarker } from "./luTexAst.js";
import type { StructureAction } from "./luProjectStructureService.js";

export async function readTexFile(projectId: string, path: string): Promise<string> {
  const file = await prisma.latexFile.findFirst({ where: { projectId, path } });
  return file?.content ?? "";
}

export async function writeTexFile(
  projectId: string,
  path: string,
  content: string
): Promise<string> {
  const name = path.split("/").pop() || "file.tex";
  const normalized = content.trim() + "\n";
  const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
  if (existing) {
    await prisma.latexFile.update({
      where: { id: existing.id },
      data: { content: normalized },
    });
    await resetYjsForFileIds(projectId, [existing.id]);
    return existing.id;
  }
  const created = await prisma.latexFile.create({
    data: { projectId, path, name, isFolder: false, content: normalized },
  });
  await resetYjsForFileIds(projectId, [created.id]);
  return created.id;
}

export async function ensureFolder(projectId: string, path: string, name: string): Promise<void> {
  const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
  if (!existing) {
    await prisma.latexFile.create({
      data: { projectId, path, name, isFolder: true, content: null },
    });
  }
}

export async function persistProjectJson(projectId: string, project: LuProjectJson): Promise<void> {
  project.metadata.updatedAt = new Date().toISOString();
  const json = JSON.stringify(project, null, 2);
  const existing = await prisma.latexFile.findFirst({ where: { projectId, path: LU_PROJECT_JSON_PATH } });
  if (existing) {
    await prisma.latexFile.update({ where: { id: existing.id }, data: { content: json } });
  } else {
    await prisma.latexFile.create({
      data: { projectId, path: LU_PROJECT_JSON_PATH, name: "project.json", isFolder: false, content: json },
    });
  }
}

function trackPath(track: LuProjectTrackRef): string {
  return `/${track.folder}/${track.file}`;
}

function modulePath(track: LuProjectTrackRef, mod: LuProjectModuleRef): string {
  return `/${track.folder}/${mod.folder}/${mod.file}`;
}

function lessonPath(track: LuProjectTrackRef, mod: LuProjectModuleRef, lesson: LuProjectLessonRef): string {
  return `/${track.folder}/${mod.folder}/${lesson.file}`;
}

async function writeTrackSubtreeTex(projectId: string, project: LuProjectJson, trackId: string): Promise<void> {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) return;
  await ensureFolder(projectId, `/${track.folder}`, track.folder);
  for (const mod of track.modules) {
    await ensureFolder(projectId, `/${track.folder}/${mod.folder}`, mod.folder);
    for (const lesson of mod.lessons) {
      await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
    }
  }
  const mini = { ...project, tracks: [track] };
  for (const entry of buildProjectTexEntries(mini)) {
    if (entry.path.startsWith(`/${track.folder}/`) || entry.path === `/${track.folder}/${track.file}`) {
      await writeTexFile(projectId, entry.path, entry.content);
    }
  }
}

export async function applyMutationWrites(
  projectId: string,
  project: LuProjectJson,
  action: StructureAction,
  ctx: { createdFilePath?: string; createdComponentId?: string; deletedTrackFolder?: string }
): Promise<void> {
  switch (action.action) {
    case "createTrack": {
      const track = project.tracks[project.tracks.length - 1];
      await ensureFolder(projectId, `/${track.folder}`, track.folder);
      await writeTexFile(projectId, trackPath(track), emitTrackOrchestrationTex(track));
      const main = await readTexFile(projectId, "/main.tex");
      if (main.trim()) {
        await writeTexFile(
          projectId,
          "/main.tex",
          addMainInputLine(main, `${track.folder}/track`)
        );
      }
      break;
    }
    case "createModule": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules[track.modules.length - 1];
      await ensureFolder(projectId, `/${track.folder}/${mod.folder}`, mod.folder);
      await writeTexFile(projectId, modulePath(track, mod), emitModuleOrchestrationTex(mod, track.folder));
      const trackContent = await readTexFile(projectId, trackPath(track));
      await writeTexFile(
        projectId,
        trackPath(track),
        rebuildTrackInputs(track, trackContent)
      );
      break;
    }
    case "createLesson": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons[mod.lessons.length - 1];
      await writeTexFile(projectId, lessonPath(track, mod, lesson), emitLessonOrchestrationTex(lesson));
      const modContent = await readTexFile(projectId, modulePath(track, mod));
      await writeTexFile(
        projectId,
        modulePath(track, mod),
        rebuildModuleInputs(mod, track.folder, mod.folder, modContent)
      );
      break;
    }
    case "renameTrack": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const content = await readTexFile(projectId, trackPath(track));
      await writeTexFile(projectId, trackPath(track), patchMetadataTitle(content, "track", action.title));
      break;
    }
    case "renameModule": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const content = await readTexFile(projectId, modulePath(track, mod));
      await writeTexFile(projectId, modulePath(track, mod), patchMetadataTitle(content, "module", action.title));
      break;
    }
    case "renameLesson": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const path = lessonPath(track, mod, lesson);
      const content = await readTexFile(projectId, path);
      await writeTexFile(projectId, path, patchMetadataTitle(content, "lesson", action.title));
      break;
    }
    case "moveModule": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const content = await readTexFile(projectId, trackPath(track));
      await writeTexFile(projectId, trackPath(track), rebuildTrackInputs(track, content));
      break;
    }
    case "moveLesson": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const content = await readTexFile(projectId, modulePath(track, mod));
      await writeTexFile(
        projectId,
        modulePath(track, mod),
        rebuildModuleInputs(mod, track.folder, mod.folder, content)
      );
      break;
    }
    case "moveTrack": {
      const main = await readTexFile(projectId, "/main.tex");
      if (!main.trim()) break;
      const inputs = project.tracks.map((t) => `\\input{${t.folder}/track}`);
      const header = main.split("\\begin{document}")[0] + "\\begin{document}\n";
      const footer = "\n\\end{document}";
      await writeTexFile(projectId, "/main.tex", header + inputs.join("\n") + footer);
      break;
    }
    case "appendLessonBlock": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const comp = lesson.components!.find((c) => c.id === ctx.createdComponentId)!;
      await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
      const compPath = componentFilePath(track.folder, mod.folder, lesson.id, comp.id, comp.kind);
      comp.file = compPath;
      await writeTexFile(projectId, compPath, emitLeafComponentTex(comp, null));
      const lessonContent = await readTexFile(projectId, lessonPath(track, mod, lesson));
      await writeTexFile(
        projectId,
        lessonPath(track, mod, lesson),
        addComponentInput(lessonContent, comp.id, lesson.id, comp.kind)
      );
      break;
    }
    case "updateComponentConfig": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const found = findComponentById(lesson, action.componentId);
      if (!found) break;
      const comp = found.component;
      const compPath = comp.file || componentFilePath(track.folder, mod.folder, lesson.id, comp.id, comp.kind);
      comp.file = compPath;
      await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
      await writeTexFile(projectId, compPath, emitLeafComponentTex(comp, found.parent));
      if (found.parent?.kind === "quiz" && action.config.title) {
        const quizPath = found.parent.file || componentFilePath(track.folder, mod.folder, lesson.id, found.parent.id, "quiz");
        const quizContent = await readTexFile(projectId, quizPath);
        await writeTexFile(
          projectId,
          quizPath,
          patchMetadataTitle(dedupeCommandBlock(quizContent, "quiz"), "quiz", String(action.config.title))
        );
      }
      break;
    }
    case "moveComponent": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const path = lessonPath(track, mod, lesson);
      const content = await readTexFile(projectId, path);
      const orderedIds = (lesson.components ?? []).map((c) => c.id);
      await writeTexFile(projectId, path, reorderMarkedBlocks(content, orderedIds));
      break;
    }
    case "appendQuizQuestion":
    case "addQuizQuestion": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const quizId =
        action.action === "addQuizQuestion"
          ? action.quizId
          : action.quizComponentId;
      const q = findComponentById(lesson, ctx.createdComponentId!)!.component;
      const quizParent = findComponentById(lesson, quizId)!;
      const quiz = quizParent.component;
      await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
      const qPath = componentFilePath(track.folder, mod.folder, lesson.id, q.id, "question");
      q.file = qPath;
      await writeTexFile(projectId, qPath, emitLeafComponentTex(q, quiz));
      const quizPath = quiz.file || componentFilePath(track.folder, mod.folder, lesson.id, quiz.id, "quiz");
      quiz.file = quizPath;
      let quizContent = await readTexFile(projectId, quizPath);
      if (!quizContent.trim() || !quizContent.includes("\\quiz{")) {
        await writeTexFile(projectId, quizPath, emitContainerOrchestrationTex(quiz));
        quizContent = await readTexFile(projectId, quizPath);
      }
      await writeTexFile(projectId, quizPath, addSiblingInput(quizContent, q.id, "quiz", "question"));
      break;
    }
    case "duplicateQuizQuestion": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const copy = findComponentById(lesson, ctx.createdComponentId!)!.component;
      const quiz = findComponentById(lesson, action.quizId)!.component;
      await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
      const qPath = componentFilePath(track.folder, mod.folder, lesson.id, copy.id, "question");
      copy.file = qPath;
      await writeTexFile(projectId, qPath, emitLeafComponentTex(copy, quiz));
      const quizPath = quiz.file || componentFilePath(track.folder, mod.folder, lesson.id, quiz.id, "quiz");
      let quizContent = await readTexFile(projectId, quizPath);
      await writeTexFile(projectId, quizPath, addSiblingInput(quizContent, copy.id, "quiz", "question"));
      break;
    }
    case "moveQuizQuestion": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const quiz = findComponentById(lesson, action.quizId)!.component;
      const quizPath = quiz.file || componentFilePath(track.folder, mod.folder, lesson.id, quiz.id, "quiz");
      const quizContent = await readTexFile(projectId, quizPath);
      const orderedIds = (quiz.children ?? []).map((c) => c.id);
      await writeTexFile(projectId, quizPath, reorderMarkedBlocks(quizContent, orderedIds));
      break;
    }
    case "reorderQuizQuestions": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const quiz = findComponentById(lesson, action.quizId)!.component;
      const quizPath = quiz.file || componentFilePath(track.folder, mod.folder, lesson.id, quiz.id, "quiz");
      const quizContent = await readTexFile(projectId, quizPath);
      await writeTexFile(
        projectId,
        quizPath,
        reorderMarkedBlocks(quizContent, action.orderedQuestionIds)
      );
      break;
    }
    case "addResourceItem": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const item = findComponentById(lesson, ctx.createdComponentId!)!.component;
      const resParent = findComponentById(
        lesson,
        action.resourcesComponentId || lesson.components!.find((c) => c.kind === "resources")!.id
      )!;
      const res = resParent.component;
      await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
      const itemPath = componentFilePath(track.folder, mod.folder, lesson.id, item.id, "resources");
      item.file = itemPath;
      await writeTexFile(projectId, itemPath, emitLeafComponentTex(item, res));
      const resPath = res.file || componentFilePath(track.folder, mod.folder, lesson.id, res.id, "resources");
      res.file = resPath;
      let resContent = await readTexFile(projectId, resPath);
      if (!resContent.trim()) {
        await writeTexFile(projectId, resPath, emitContainerOrchestrationTex(res));
        resContent = await readTexFile(projectId, resPath);
      }
      await writeTexFile(projectId, resPath, addSiblingInput(resContent, item.id, "resources"));
      break;
    }
    case "removeLessonComponent": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const found = findComponentById(lesson, action.componentId);
      if (found?.parent?.kind === "quiz") {
        const quiz = found.parent;
        const quizPath =
          quiz.file || componentFilePath(track.folder, mod.folder, lesson.id, quiz.id, "quiz");
        const quizContent = await readTexFile(projectId, quizPath);
        await writeTexFile(
          projectId,
          quizPath,
          removeComponentInput(quizContent, action.componentId)
        );
      } else if (found?.parent?.kind === "resources") {
        const res = found.parent;
        const resPath =
          res.file || componentFilePath(track.folder, mod.folder, lesson.id, res.id, "resources");
        const resContent = await readTexFile(projectId, resPath);
        await writeTexFile(
          projectId,
          resPath,
          removeComponentInput(resContent, action.componentId)
        );
      } else {
        const lessonContent = await readTexFile(projectId, lessonPath(track, mod, lesson));
        await writeTexFile(
          projectId,
          lessonPath(track, mod, lesson),
          removeComponentInput(lessonContent, action.componentId)
        );
      }
      break;
    }
    case "deleteTrack": {
      const main = await readTexFile(projectId, "/main.tex");
      if (ctx.deletedTrackFolder && main.trim()) {
        await writeTexFile(
          projectId,
          "/main.tex",
          removeMainInputLine(main, `${ctx.deletedTrackFolder}/track`)
        );
      }
      break;
    }
    case "duplicateComponent": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const copy = lesson.components!.find((c) => c.id === ctx.createdComponentId)!;
      await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
      const compPath = componentFilePath(track.folder, mod.folder, lesson.id, copy.id, copy.kind);
      copy.file = compPath;

      if (copy.kind === "quiz") {
        await writeTexFile(projectId, compPath, emitContainerOrchestrationTex(copy));
        for (const child of copy.children ?? []) {
          const childPath = componentFilePath(track.folder, mod.folder, lesson.id, child.id, "question");
          child.file = childPath;
          await writeTexFile(projectId, childPath, emitLeafComponentTex(child, copy));
        }
      } else if (copy.kind === "resources") {
        await writeTexFile(projectId, compPath, emitContainerOrchestrationTex(copy));
        for (const child of copy.children ?? []) {
          const childPath = componentFilePath(track.folder, mod.folder, lesson.id, child.id, "resources");
          child.file = childPath;
          await writeTexFile(projectId, childPath, emitLeafComponentTex(child, copy));
        }
      } else {
        await writeTexFile(projectId, compPath, emitLeafComponentTex(copy, null));
      }

      const lessonContent = await readTexFile(projectId, lessonPath(track, mod, lesson));
      await writeTexFile(
        projectId,
        lessonPath(track, mod, lesson),
        addComponentInput(lessonContent, copy.id, lesson.id, copy.kind)
      );
      break;
    }
    case "deleteLesson": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const content = await readTexFile(projectId, modulePath(track, mod));
      await writeTexFile(
        projectId,
        modulePath(track, mod),
        rebuildModuleInputs(mod, track.folder, mod.folder, content)
      );
      break;
    }
    case "deleteModule": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const content = await readTexFile(projectId, trackPath(track));
      await writeTexFile(projectId, trackPath(track), rebuildTrackInputs(track, content));
      break;
    }
    case "duplicateTrack": {
      const track = project.tracks[project.tracks.length - 1];
      await writeTrackSubtreeTex(projectId, project, track.id);
      const main = await readTexFile(projectId, "/main.tex");
      if (main.trim()) {
        await writeTexFile(
          projectId,
          "/main.tex",
          addMainInputLine(main, `${track.folder}/track`)
        );
      }
      break;
    }
    case "duplicateModule": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules[track.modules.length - 1];
      await ensureFolder(projectId, `/${track.folder}/${mod.folder}`, mod.folder);
      for (const lesson of mod.lessons) {
        await ensureFolder(projectId, lessonComponentDir(track.folder, mod.folder, lesson.id), lesson.id);
      }
      const mini = { ...project, tracks: [{ ...track, modules: [mod] }] };
      for (const entry of buildProjectTexEntries(mini)) {
        if (entry.path.includes(`/${mod.folder}/`)) {
          await writeTexFile(projectId, entry.path, entry.content);
        }
      }
      const trackContent = await readTexFile(projectId, trackPath(track));
      await writeTexFile(projectId, trackPath(track), rebuildTrackInputs(track, trackContent));
      break;
    }
    case "renameComponent": {
      const track = project.tracks.find((t) => t.id === action.trackId)!;
      const mod = track.modules.find((m) => m.id === action.moduleId)!;
      const lesson = mod.lessons.find((l) => l.id === action.lessonId)!;
      const found = findComponentById(lesson, action.componentId);
      if (!found) break;
      const compPath =
        found.component.file ||
        componentFilePath(track.folder, mod.folder, lesson.id, found.component.id, found.component.kind);
      const content = await readTexFile(projectId, compPath);
      if (found.component.kind === "quiz" && !found.parent) {
        await writeTexFile(
          projectId,
          compPath,
          patchMetadataTitle(dedupeCommandBlock(content, "quiz"), "quiz", action.title)
        );
      }
      break;
    }
    case "importTrack": {
      if (ctx.createdFilePath && action.action === "importTrack") {
        const track = project.tracks[project.tracks.length - 1];
        await ensureFolder(projectId, `/${track.folder}`, track.folder);
        await writeTexFile(
          projectId,
          ctx.createdFilePath,
          dedupeCommandBlock(action.texContent, "track")
        );
        const main = await readTexFile(projectId, "/main.tex");
        if (main.trim()) {
          await writeTexFile(
            projectId,
            "/main.tex",
            addMainInputLine(main, `${track.folder}/track`)
          );
        }
      }
      break;
    }
    default:
      break;
  }
}
