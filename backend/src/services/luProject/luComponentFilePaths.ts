import { SINGLETON_COMPONENTS, type LuLessonComponentKind } from "./luComponentRegistry.js";

/** Per-component .tex files live in a subfolder named after the lesson id. */
export function lessonComponentDir(trackFolder: string, modFolder: string, lessonId: string): string {
  return `/${trackFolder}/${modFolder}/${lessonId}`;
}

export function componentTexName(componentId: string, kind: string): string {
  if (SINGLETON_COMPONENTS.has(kind as LuLessonComponentKind)) return `${kind}.tex`;
  return `${componentId}.tex`;
}

export function componentFilePath(
  trackFolder: string,
  modFolder: string,
  lessonId: string,
  componentId: string,
  kind: string
): string {
  return `${lessonComponentDir(trackFolder, modFolder, lessonId)}/${componentTexName(componentId, kind)}`;
}

export function texBasenameFromPath(filePath?: string): string | null {
  if (!filePath?.trim()) return null;
  const base = filePath.split("/").pop()?.replace(/\.tex$/i, "");
  return base?.trim() ? base : null;
}

/** Relative \\input path from the lesson .tex file (sibling folder). */
export function componentInputRef(
  lessonId: string,
  componentId: string,
  kind: string,
  filePath?: string
): string {
  const fromFile = texBasenameFromPath(filePath);
  if (fromFile) return `${lessonId}/${fromFile}`;
  const base = componentTexName(componentId, kind).replace(/\.tex$/i, "");
  return `${lessonId}/${base}`;
}

/** Relative \\input path from another component file in the same lesson folder. */
export function siblingInputRef(componentId: string, kind: string, filePath?: string): string {
  const fromFile = texBasenameFromPath(filePath);
  if (fromFile) return fromFile;
  return componentTexName(componentId, kind).replace(/\.tex$/i, "");
}

export function wrapComponentInput(
  componentId: string,
  lessonId: string,
  kind: string,
  relativeTo: "lesson" | "sibling" = "lesson",
  filePath?: string
): string {
  const inputRef =
    relativeTo === "sibling"
      ? siblingInputRef(componentId, kind, filePath)
      : componentInputRef(lessonId, componentId, kind, filePath);
  return `\n\n% LU:component:${componentId}\n\\input{${inputRef}}\n`;
}

export function isComponentOwnedPath(path: string): boolean {
  return /\/lesson-\d+\/[^/]+\.tex$/i.test(path);
}
