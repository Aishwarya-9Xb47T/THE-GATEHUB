/**
 * Transaction-based authoring — snapshot undo/redo around explicit mutations only.
 * Opening, compiling, publishing, and refreshing never touch this layer.
 */
import { randomUUID } from "node:crypto";
import type { LuProjectJson } from "./luProjectSchema.js";
import { LU_PROJECT_JSON_PATH } from "./luProjectSchema.js";
import { loadProjectFiles, getProjectJsonFromFiles } from "./luProjectFiles.js";
import {
  applyStructureAction,
  type StructureAction,
  type StructureMutationResult,
} from "./luProjectStructureService.js";
import { prisma } from "../../utils/prisma.js";
import { resetYjsForFileIds } from "./yjsDocumentService.js";

const UNDO_STACK_PATH = "/.lu/undo-stack.json";
const REDO_STACK_PATH = "/.lu/redo-stack.json";
const MAX_STACK = 50;

export interface ProjectSnapshot {
  id: string;
  label: string;
  timestamp: string;
  projectJson: string;
  files: Array<{ path: string; content: string }>;
}

interface SnapshotStack {
  version: 1;
  entries: ProjectSnapshot[];
}

export interface CommitResult extends StructureMutationResult {
  transactionId: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface UndoRedoResult {
  state: "ok";
  canUndo: boolean;
  canRedo: boolean;
}

function labelForAction(action: StructureAction): string {
  switch (action.action) {
    case "createTrack":
      return `Create track: ${action.title}`;
    case "createModule":
      return `Create module: ${action.title}`;
    case "createLesson":
      return `Create lesson: ${action.title}`;
    case "appendLessonBlock":
      return `Add ${action.block}`;
    case "addQuizQuestion":
      return `Add question`;
    case "appendQuizQuestion":
      return `Add question`;
    case "removeLessonComponent":
      return `Delete component`;
    case "renameComponent":
    case "renameTrack":
    case "renameModule":
    case "renameLesson":
      return `Rename`;
    case "updateComponentConfig":
      return `Save`;
    case "duplicateComponent":
      return `Duplicate component`;
    case "duplicateQuizQuestion":
      return `Duplicate question`;
    case "duplicateLesson":
      return `Duplicate lesson`;
    case "duplicateTrack":
      return `Duplicate track`;
    case "duplicateModule":
      return `Duplicate module`;
    case "moveComponent":
    case "moveQuizQuestion":
    case "moveLesson":
    case "moveModule":
    case "moveTrack":
      return `Move`;
    default:
      return action.action;
  }
}

async function readStack(projectId: string, path: string): Promise<SnapshotStack> {
  const file = await prisma.latexFile.findFirst({ where: { projectId, path } });
  if (!file?.content?.trim()) return { version: 1, entries: [] };
  try {
    return JSON.parse(file.content) as SnapshotStack;
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeStack(projectId: string, path: string, stack: SnapshotStack): Promise<void> {
  const content = JSON.stringify(stack, null, 2);
  const name = path.split("/").pop() || "stack.json";
  const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
  if (existing) {
    await prisma.latexFile.update({ where: { id: existing.id }, data: { content } });
  } else {
    await prisma.latexFile.create({
      data: { projectId, path, name, isFolder: false, content },
    });
  }
}

export async function captureProjectSnapshotForProject(
  projectId: string,
  label: string
): Promise<ProjectSnapshot> {
  const files = await loadProjectFiles(projectId);
  const project = getProjectJsonFromFiles(files);
  if (!project) throw new Error("project.json missing");

  const snapshotFiles: Array<{ path: string; content: string }> = [];
  for (const f of files) {
    if (f.isFolder) continue;
    if (!f.path.endsWith(".tex") && f.path !== LU_PROJECT_JSON_PATH) continue;
    snapshotFiles.push({ path: f.path, content: f.content ?? "" });
  }

  return {
    id: randomUUID(),
    label,
    timestamp: new Date().toISOString(),
    projectJson: JSON.stringify(project),
    files: snapshotFiles,
  };
}

async function pushUndo(projectId: string, snap: ProjectSnapshot): Promise<void> {
  const stack = await readStack(projectId, UNDO_STACK_PATH);
  stack.entries = [...stack.entries, snap].slice(-MAX_STACK);
  await writeStack(projectId, UNDO_STACK_PATH, stack);
}

async function clearRedo(projectId: string): Promise<void> {
  await writeStack(projectId, REDO_STACK_PATH, { version: 1, entries: [] });
}

async function pushRedo(projectId: string, snap: ProjectSnapshot): Promise<void> {
  const stack = await readStack(projectId, REDO_STACK_PATH);
  stack.entries = [...stack.entries, snap].slice(-MAX_STACK);
  await writeStack(projectId, REDO_STACK_PATH, stack);
}

async function restoreSnapshot(projectId: string, snap: ProjectSnapshot): Promise<void> {
  const project = JSON.parse(snap.projectJson) as LuProjectJson;
  const yjsIds: string[] = [];

  const pj = await prisma.latexFile.findFirst({ where: { projectId, path: LU_PROJECT_JSON_PATH } });
  if (pj) {
    await prisma.latexFile.update({
      where: { id: pj.id },
      data: { content: JSON.stringify(project, null, 2) },
    });
    yjsIds.push(pj.id);
  }

  for (const { path, content } of snap.files) {
    if (path === LU_PROJECT_JSON_PATH) continue;
    const name = path.split("/").pop() || "file.tex";
    const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
    if (existing) {
      await prisma.latexFile.update({ where: { id: existing.id }, data: { content: content.trim() + "\n" } });
      yjsIds.push(existing.id);
    } else {
      const created = await prisma.latexFile.create({
        data: { projectId, path, name, isFolder: false, content: content.trim() + "\n" },
      });
      yjsIds.push(created.id);
    }
  }

  if (yjsIds.length) await resetYjsForFileIds(projectId, yjsIds);
}

export async function getTransactionStackState(projectId: string): Promise<{
  canUndo: boolean;
  canRedo: boolean;
}> {
  const undo = await readStack(projectId, UNDO_STACK_PATH);
  const redo = await readStack(projectId, REDO_STACK_PATH);
  return {
    canUndo: undo.entries.length > 0,
    canRedo: redo.entries.length > 0,
  };
}

/** Explicit mutation — snapshots before apply, clears redo stack. */
export async function commitAuthoringTransaction(
  projectId: string,
  action: StructureAction
): Promise<CommitResult> {
  const before = await captureProjectSnapshotForProject(projectId, labelForAction(action));
  await pushUndo(projectId, before);
  await clearRedo(projectId);

  const result = await applyStructureAction(projectId, action);
  const stacks = await getTransactionStackState(projectId);

  return {
    ...result,
    transactionId: before.id,
    canUndo: stacks.canUndo,
    canRedo: stacks.canRedo,
  };
}

export async function undoAuthoringTransaction(projectId: string): Promise<UndoRedoResult> {
  const undoStack = await readStack(projectId, UNDO_STACK_PATH);
  if (undoStack.entries.length === 0) {
    throw new Error("Nothing to undo");
  }

  const current = await captureProjectSnapshotForProject(projectId, "redo point");
  const target = undoStack.entries.pop()!;
  await writeStack(projectId, UNDO_STACK_PATH, undoStack);

  await restoreSnapshot(projectId, target);
  await pushRedo(projectId, current);

  const stacks = await getTransactionStackState(projectId);
  return { state: "ok", ...stacks };
}

export async function redoAuthoringTransaction(projectId: string): Promise<UndoRedoResult> {
  const redoStack = await readStack(projectId, REDO_STACK_PATH);
  if (redoStack.entries.length === 0) {
    throw new Error("Nothing to redo");
  }

  const current = await captureProjectSnapshotForProject(projectId, "undo point");
  const target = redoStack.entries.pop()!;
  await writeStack(projectId, REDO_STACK_PATH, redoStack);

  await restoreSnapshot(projectId, target);
  await pushUndo(projectId, current);

  const stacks = await getTransactionStackState(projectId);
  return { state: "ok", ...stacks };
}
