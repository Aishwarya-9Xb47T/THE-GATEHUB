/**
 * Shared snapshot hash — must match frontend projectSnapshot.hashSnapshotPayload
 * and latexController hashCompileSnapshot.
 */

import type { ProjectFileRecord } from "./luProjectFiles.js";
import { normalizeProjectPath } from "./luProjectFiles.js";
import { isTextLikeProjectPath } from "../latexContentSanitizer.js";

export interface SnapshotFileInput {
  name: string;
  content: string;
}

export function hashSnapshotPayload(payload: {
  projectId: string;
  mainFileName: string;
  code?: string;
  files: SnapshotFileInput[];
}): string {
  const normalized = payload.files
    .map((f) => ({ name: f.name.replace(/\\/g, "/"), content: f.content }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const raw = JSON.stringify({
    projectId: payload.projectId,
    mainFileName: payload.mainFileName,
    code: payload.code ?? "",
    files: normalized,
  });
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashFromProjectFiles(
  projectId: string,
  files: ProjectFileRecord[],
  mainFileName = "main.tex"
): string {
  const textFiles: SnapshotFileInput[] = [];
  for (const file of files) {
    if (file.isFolder) continue;
    const path = normalizeProjectPath(file.path);
    // Internal authoring state must not affect editor/publish hash parity.
    if (path.startsWith("/.lu/")) continue;
    if (!isTextLikeProjectPath(path)) continue;
    textFiles.push({
      name: path.replace(/^\//, ""),
      content: file.content ?? "",
    });
  }
  const main =
    textFiles.find((f) => f.name === mainFileName) ??
    textFiles.find((f) => f.name.endsWith(`/${mainFileName}`));
  return hashSnapshotPayload({
    projectId,
    mainFileName,
    code: main?.content ?? "",
    files: textFiles,
  });
}

export function fileOverlayToMap(
  overlay?: Array<{ name: string; content: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  if (!overlay?.length) return map;
  for (const entry of overlay) {
    const normalized = normalizeProjectPath(`/${entry.name.replace(/\\/g, "/").replace(/^\//, "")}`);
    map.set(normalized, entry.content);
  }
  return map;
}
