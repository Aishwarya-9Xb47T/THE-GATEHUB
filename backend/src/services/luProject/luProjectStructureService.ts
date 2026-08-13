import { prisma } from "../../utils/prisma.js";
import type { LuProjectJson, LuProjectLessonRef, LuProjectModuleRef } from "./luProjectSchema.js";
import { loadProjectFiles, getProjectJsonFromFiles } from "./luProjectFiles.js";
import { persistProjectJson, applyMutationWrites } from "./luAuthoringEngine.js";
import {
  addComponentToLesson,
  removeComponentFromLesson,
  addResourceItem,
  renameComponentInLesson,
  moveComponentInLesson,
  duplicateComponentInLesson,
  updateComponentConfigInLesson,
  findComponentById,
  type LuLessonComponentKind,
} from "./luLessonComponents.js";
import {
  addQuestionToQuiz,
  duplicateQuestionInQuiz,
  moveQuestionInQuiz,
  reorderQuestionsInQuiz,
} from "./luQuizEngine.js";
import { cloneLessonComponentsWithNewIds } from "./luLessonClone.js";
import { nextTrackId, nextModuleId, nextLessonId } from "./luIdUtils.js";
import {
  componentFilePath,
  lessonComponentDir,
} from "./luComponentFilePaths.js";
import { repairProjectQuestionOwnership } from "./luMigrationEngine.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function upsertFile(
  projectId: string,
  path: string,
  name: string,
  content: string,
  isFolder = false
) {
  const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
  if (existing) {
    await prisma.latexFile.update({
      where: { id: existing.id },
      data: { content: isFolder ? null : content, name, isFolder },
    });
    return existing.id;
  }
  const created = await prisma.latexFile.create({
    data: { projectId, path, name, isFolder, content: isFolder ? null : content },
  });
  return created.id;
}

async function deleteFileByPath(projectId: string, path: string) {
  await prisma.latexFile.deleteMany({ where: { projectId, path } });
}

/** Remove lesson .tex and all component files under the lesson folder. */
async function purgeLessonFiles(
  projectId: string,
  trackFolder: string,
  modFolder: string,
  lesson: { id: string; file: string }
) {
  const prefix = `/${trackFolder}/${modFolder}/${lesson.id}`;
  await prisma.latexFile.deleteMany({
    where: {
      projectId,
      OR: [
        { path: `/${trackFolder}/${modFolder}/${lesson.file}` },
        { path: { startsWith: `${prefix}/` } },
      ],
    },
  });
}

async function loadProject(projectId: string): Promise<LuProjectJson> {
  const files = await loadProjectFiles(projectId);
  const project = getProjectJsonFromFiles(files);
  if (!project) throw new Error("Not a v2 Learning Universe project");
  return project;
}

export type StructureAction =
  | { action: "createTrack"; title: string; description?: string }
  | { action: "createModule"; trackId: string; title: string; description?: string }
  | { action: "createLesson"; trackId: string; moduleId: string; title: string; template?: "full" }
  | { action: "duplicateModule"; trackId: string; moduleId: string }
  | { action: "deleteModule"; trackId: string; moduleId: string }
  | { action: "renameModule"; trackId: string; moduleId: string; title: string }
  | { action: "duplicateLesson"; trackId: string; moduleId: string; lessonId: string }
  | { action: "deleteLesson"; trackId: string; moduleId: string; lessonId: string }
  | { action: "renameLesson"; trackId: string; moduleId: string; lessonId: string; title: string }
  | { action: "moveLesson"; trackId: string; moduleId: string; lessonId: string; direction: "up" | "down" }
  | { action: "renameTrack"; trackId: string; title: string }
  | { action: "deleteTrack"; trackId: string }
  | { action: "duplicateTrack"; trackId: string }
  | { action: "moveTrack"; trackId: string; direction: "up" | "down" }
  | { action: "appendLessonBlock"; trackId: string; moduleId: string; lessonId: string; block: LuLessonComponentKind; title?: string }
  | { action: "removeLessonComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string }
  | { action: "renameComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string; title: string }
  | { action: "updateComponentConfig"; trackId: string; moduleId: string; lessonId: string; componentId: string; config: Record<string, unknown> }
  | { action: "moveComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string; direction: "up" | "down" }
  | { action: "duplicateComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string }
  | { action: "appendQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizComponentId: string; title?: string; questionType?: string }
  | { action: "addQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizId: string; title?: string; questionType?: string }
  | { action: "moveQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizId: string; questionId: string; direction: "up" | "down" }
  | { action: "duplicateQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizId: string; questionId: string }
  | { action: "reorderQuizQuestions"; trackId: string; moduleId: string; lessonId: string; quizId: string; orderedQuestionIds: string[] }
  | { action: "addResourceItem"; trackId: string; moduleId: string; lessonId: string; resourcesComponentId?: string; resourceType: string; title?: string }
  | { action: "importTrack"; texContent: string }
  | { action: "moveModule"; trackId: string; moduleId: string; direction: "up" | "down" };

export interface StructureMutationResult {
  project: LuProjectJson;
  createdFilePath?: string;
  createdComponentId?: string;
  deletedTrackFolder?: string;
}

function resolveLesson(
  project: LuProjectJson,
  trackId: string,
  moduleId: string,
  lessonId: string
) {
  const track = project.tracks.find((t) => t.id === trackId);
  const mod = track?.modules.find((m) => m.id === moduleId);
  const lesson = mod?.lessons.find((l) => l.id === lessonId);
  if (!track || !mod || !lesson) throw new Error("Lesson not found");
  return {
    track,
    mod,
    lesson,
    path: `/${track.folder}/${mod.folder}/${lesson.file}`,
  };
}

function resolveComponentFilePath(
  track: { folder: string },
  mod: { folder: string },
  lesson: { id: string },
  component: { id: string; kind: string; file?: string }
): string {
  return (
    component.file ||
    componentFilePath(track.folder, mod.folder, lesson.id, component.id, component.kind)
  );
}

async function ensureLessonComponentFolder(
  projectId: string,
  trackFolder: string,
  modFolder: string,
  lessonId: string
) {
  await upsertFile(projectId, lessonComponentDir(trackFolder, modFolder, lessonId), lessonId, "", true);
}

export async function applyStructureAction(
  projectId: string,
  body: StructureAction
): Promise<StructureMutationResult> {
  const project = await loadProject(projectId);
  if (repairProjectQuestionOwnership(project)) {
    await persistProjectJson(projectId, project);
  }
  let createdFilePath: string | undefined;
  let createdComponentId: string | undefined;
  let deletedTrackFolder: string | undefined;

  switch (body.action) {
    case "createTrack": {
      const id = nextTrackId(project.tracks);
      project.tracks.push({
        id,
        folder: id,
        file: "track.tex",
        title: body.title,
        description: body.description || "",
        modules: [],
      });
      createdFilePath = `/${id}/track.tex`;
      break;
    }
    case "createModule": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      if (!track) throw new Error("Track not found");
      const id = nextModuleId(track.modules);
      track.modules.push({
        id,
        folder: id,
        file: "module.tex",
        title: body.title,
        lessons: [],
      });
      createdFilePath = `/${track.folder}/${id}/module.tex`;
      break;
    }
    case "createLesson": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      const mod = track?.modules.find((m) => m.id === body.moduleId);
      if (!track || !mod) throw new Error("Module not found");
      const id = nextLessonId(mod.lessons);
      mod.lessons.push({ id, file: `${id}.tex`, title: body.title, components: [] });
      createdFilePath = `/${track.folder}/${mod.folder}/${id}.tex`;
      break;
    }
    case "duplicateModule": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      const mod = track?.modules.find((m) => m.id === body.moduleId);
      if (!track || !mod) throw new Error("Module not found");
      const newId = nextModuleId(track.modules);
      const newLessons: LuProjectLessonRef[] = [];
      for (let i = 0; i < mod.lessons.length; i++) {
        const l = mod.lessons[i];
        const newLessonId = `lesson-${pad2(i + 1)}`;
        newLessons.push({
          id: newLessonId,
          file: `${newLessonId}.tex`,
          title: `${l.title} (copy)`,
          components: cloneLessonComponentsWithNewIds(l),
        });
      }
      track.modules.push({
        id: newId,
        folder: newId,
        file: "module.tex",
        title: `${mod.title} (copy)`,
        lessons: newLessons,
      });
      break;
    }
    case "deleteModule": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      if (!track) throw new Error("Track not found");
      const mod = track.modules.find((m) => m.id === body.moduleId);
      if (!mod) throw new Error("Module not found");
      for (const l of mod.lessons) {
        await purgeLessonFiles(projectId, track.folder, mod.folder, l);
      }
      await deleteFileByPath(projectId, `/${track.folder}/${mod.folder}/${mod.file}`);
      await deleteFileByPath(projectId, `/${track.folder}/${mod.folder}`);
      track.modules = track.modules.filter((m) => m.id !== body.moduleId);
      break;
    }
    case "renameModule": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      const mod = track?.modules.find((m) => m.id === body.moduleId);
      if (!mod) throw new Error("Module not found");
      mod.title = body.title;
      break;
    }
    case "duplicateLesson": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      const mod = track?.modules.find((m) => m.id === body.moduleId);
      const lesson = mod?.lessons.find((l) => l.id === body.lessonId);
      if (!track || !mod || !lesson) throw new Error("Lesson not found");
      const newId = nextLessonId(mod.lessons);
      const files = await loadProjectFiles(projectId);
      const src = files.find((f) => f.path === `/${track.folder}/${mod.folder}/${lesson.file}`)?.content || "";
      mod.lessons.push({
        id: newId,
        file: `${newId}.tex`,
        title: `${lesson.title} (copy)`,
        components: cloneLessonComponentsWithNewIds(lesson),
      });
      await upsertFile(projectId, `/${track.folder}/${mod.folder}/${newId}.tex`, `${newId}.tex`, src);
      break;
    }
    case "deleteLesson": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      const mod = track?.modules.find((m) => m.id === body.moduleId);
      if (!track || !mod) throw new Error("Module not found");
      const lesson = mod.lessons.find((l) => l.id === body.lessonId);
      if (!lesson) throw new Error("Lesson not found");
      await purgeLessonFiles(projectId, track.folder, mod.folder, lesson);
      mod.lessons = mod.lessons.filter((l) => l.id !== body.lessonId);
      break;
    }
    case "renameLesson": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      const mod = track?.modules.find((m) => m.id === body.moduleId);
      const lesson = mod?.lessons.find((l) => l.id === body.lessonId);
      if (!lesson || !track || !mod) throw new Error("Lesson not found");
      lesson.title = body.title;
      break;
    }
    case "moveLesson": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      const mod = track?.modules.find((m) => m.id === body.moduleId);
      if (!mod) throw new Error("Module not found");
      const idx = mod.lessons.findIndex((l) => l.id === body.lessonId);
      if (idx < 0) throw new Error("Lesson not found");
      const swap = body.direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= mod.lessons.length) break;
      [mod.lessons[idx], mod.lessons[swap]] = [mod.lessons[swap], mod.lessons[idx]];
      break;
    }
    case "moveModule": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      if (!track) throw new Error("Track not found");
      const idx = track.modules.findIndex((m) => m.id === body.moduleId);
      if (idx < 0) throw new Error("Module not found");
      const swap = body.direction === "up" ? idx - 1 : idx + 1;
      if (swap >= 0 && swap < track.modules.length) {
        [track.modules[idx], track.modules[swap]] = [track.modules[swap], track.modules[idx]];
      }
      break;
    }
    case "appendLessonBlock": {
      const { track, mod, lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      const block = body.block;
      const comp = addComponentToLesson(lesson, block, body.title);
      const compPath = componentFilePath(track.folder, mod.folder, lesson.id, comp.id, comp.kind);
      comp.file = compPath;
      await ensureLessonComponentFolder(projectId, track.folder, mod.folder, lesson.id);
      createdComponentId = comp.id;
      createdFilePath = compPath;
      break;
    }
    case "renameComponent": {
      const { lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      if (!renameComponentInLesson(lesson, body.componentId, body.title)) {
        throw new Error("Component not found");
      }
      break;
    }
    case "updateComponentConfig": {
      const { track, mod, lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      const comp = updateComponentConfigInLesson(lesson, body.componentId, body.config);
      if (!comp) throw new Error("Component not found");
      const compPath = resolveComponentFilePath(track, mod, lesson, comp);
      comp.file = compPath;
      await ensureLessonComponentFolder(projectId, track.folder, mod.folder, lesson.id);
      createdFilePath = compPath;
      break;
    }
    case "moveComponent": {
      const { lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      if (!moveComponentInLesson(lesson, body.componentId, body.direction)) {
        throw new Error("Cannot move component");
      }
      break;
    }
    case "duplicateComponent": {
      const { track, mod, lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      const copy = duplicateComponentInLesson(lesson, body.componentId);
      if (!copy) throw new Error("Cannot duplicate component");
      const compPath = componentFilePath(track.folder, mod.folder, lesson.id, copy.id, copy.kind);
      copy.file = compPath;
      await ensureLessonComponentFolder(projectId, track.folder, mod.folder, lesson.id);
      createdComponentId = copy.id;
      createdFilePath = compPath;
      break;
    }
    case "removeLessonComponent": {
      const { track, mod, lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      const found = findComponentById(lesson, body.componentId);
      removeComponentFromLesson(lesson, body.componentId);
      if (found?.component.file) {
        await deleteFileByPath(projectId, found.component.file);
      } else if (found) {
        const compPath = componentFilePath(
          track.folder,
          mod.folder,
          lesson.id,
          found.component.id,
          found.component.kind
        );
        await deleteFileByPath(projectId, compPath);
      }
      break;
    }
    case "appendQuizQuestion":
    case "addQuizQuestion": {
      const { track, mod, lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      const quizId =
        body.action === "addQuizQuestion"
          ? body.quizId
          : body.quizComponentId;
      if (!quizId) {
        throw new Error("quizId is required — add questions only inside an existing Quiz");
      }
      await ensureLessonComponentFolder(projectId, track.folder, mod.folder, lesson.id);

      const quizComp = lesson.components?.find((c) => c.id === quizId && c.kind === "quiz");
      if (!quizComp) throw new Error("Quiz component not found");

      const q = addQuestionToQuiz(
        lesson,
        quizId,
        body.questionType || "multiple-choice",
        body.title
      );

      const qPath = componentFilePath(track.folder, mod.folder, lesson.id, q.id, "question");
      q.file = qPath;

      createdComponentId = q.id;
      createdFilePath = qPath;
      break;
    }
    case "moveQuizQuestion": {
      const { lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      if (!moveQuestionInQuiz(lesson, body.quizId, body.questionId, body.direction)) {
        throw new Error("Cannot move question");
      }
      break;
    }
    case "duplicateQuizQuestion": {
      const { track, mod, lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      const copy = duplicateQuestionInQuiz(lesson, body.quizId, body.questionId);
      if (!copy) throw new Error("Cannot duplicate question");
      const qPath = componentFilePath(track.folder, mod.folder, lesson.id, copy.id, "question");
      copy.file = qPath;
      await ensureLessonComponentFolder(projectId, track.folder, mod.folder, lesson.id);
      createdComponentId = copy.id;
      createdFilePath = qPath;
      break;
    }
    case "reorderQuizQuestions": {
      const { lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      if (!reorderQuestionsInQuiz(lesson, body.quizId, body.orderedQuestionIds)) {
        throw new Error("Cannot reorder questions");
      }
      break;
    }
    case "addResourceItem": {
      const { track, mod, lesson } = resolveLesson(project, body.trackId, body.moduleId, body.lessonId);
      let resId = body.resourcesComponentId;
      await ensureLessonComponentFolder(projectId, track.folder, mod.folder, lesson.id);

      if (!resId) {
        const existing = lesson.components?.find((c) => c.kind === "resources");
        if (existing) resId = existing.id;
        else {
          const res = addComponentToLesson(lesson, "resources", "Resources");
          resId = res.id;
          const resPath = componentFilePath(track.folder, mod.folder, lesson.id, res.id, res.kind);
          res.file = resPath;
        }
      }

      const resComp = lesson.components?.find((c) => c.id === resId);
      if (!resComp) throw new Error("Resources component not found");

      const item = addResourceItem(
        lesson,
        resId!,
        body.title || body.resourceType,
        body.resourceType
      );
      if (!item) throw new Error("Resources component not found");

      const itemPath = componentFilePath(track.folder, mod.folder, lesson.id, item.id, "resources");
      item.file = itemPath;

      createdComponentId = item.id;
      createdFilePath = itemPath;
      break;
    }
    case "duplicateTrack": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      if (!track) throw new Error("Track not found");
      const newId = nextTrackId(project.tracks);
      const newModules: LuProjectModuleRef[] = [];
      for (const mod of track.modules) {
        const modIdx = newModules.length + 1;
        const newModId = `module-${pad2(modIdx)}`;
        const newLessons: LuProjectLessonRef[] = [];
        for (let i = 0; i < mod.lessons.length; i++) {
          const l = mod.lessons[i];
          const newLessonId = `lesson-${pad2(i + 1)}`;
          newLessons.push({
            id: newLessonId,
            file: `${newLessonId}.tex`,
            title: `${l.title} (copy)`,
            components: cloneLessonComponentsWithNewIds(l),
          });
        }
        newModules.push({
          id: newModId,
          folder: newModId,
          file: "module.tex",
          title: `${mod.title} (copy)`,
          lessons: newLessons,
        });
      }
      project.tracks.push({
        id: newId,
        folder: newId,
        file: "track.tex",
        title: `${track.title} (copy)`,
        description: track.description || "",
        modules: newModules,
      });
      break;
    }
    case "renameTrack": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      if (!track) throw new Error("Track not found");
      track.title = body.title;
      break;
    }
    case "deleteTrack": {
      const track = project.tracks.find((t) => t.id === body.trackId);
      if (!track) throw new Error("Track not found");
      deletedTrackFolder = track.folder;
      for (const mod of track.modules) {
        for (const l of mod.lessons) {
          await purgeLessonFiles(projectId, track.folder, mod.folder, l);
        }
        await deleteFileByPath(projectId, `/${track.folder}/${mod.folder}/${mod.file}`);
        await deleteFileByPath(projectId, `/${track.folder}/${mod.folder}`);
      }
      await deleteFileByPath(projectId, `/${track.folder}/${track.file}`);
      await deleteFileByPath(projectId, `/${track.folder}`);
      project.tracks = project.tracks.filter((t) => t.id !== body.trackId);
      break;
    }
    case "moveTrack": {
      const idx = project.tracks.findIndex((t) => t.id === body.trackId);
      if (idx < 0) throw new Error("Track not found");
      const swap = body.direction === "up" ? idx - 1 : idx + 1;
      if (swap >= 0 && swap < project.tracks.length) {
        [project.tracks[idx], project.tracks[swap]] = [project.tracks[swap], project.tracks[idx]];
      }
      break;
    }
    case "importTrack": {
      const titleMatch = body.texContent.match(/title=\{([^}]+)\}/);
      const title = titleMatch?.[1] || `Imported Track ${project.tracks.length + 1}`;
      const descMatch = body.texContent.match(/description=\{([^}]*)\}/);
      const id = nextTrackId(project.tracks);
      project.tracks.push({
        id,
        folder: id,
        file: "track.tex",
        title,
        description: descMatch?.[1] || "",
        modules: [],
      });
      createdFilePath = `/${id}/track.tex`;
      break;
    }
    default:
      throw new Error("Unknown structure action");
  }

  await persistProjectJson(projectId, project);
  await applyMutationWrites(projectId, project, body, {
    createdFilePath,
    createdComponentId,
    deletedTrackFolder,
  });
  return { project, createdFilePath, createdComponentId, deletedTrackFolder };
}
