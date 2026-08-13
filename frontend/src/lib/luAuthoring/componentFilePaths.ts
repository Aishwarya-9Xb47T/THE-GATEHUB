/** Frontend mirror of backend luComponentFilePaths — keep in sync */

export function lessonComponentDir(trackFolder: string, modFolder: string, lessonId: string): string {
  return `/${trackFolder}/${modFolder}/${lessonId}`;
}

export function componentTexName(componentId: string, kind: string): string {
  if (componentId === kind || componentId === "overview") return `${kind === "overview" ? "overview" : kind}.tex`;
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

export function isOwnedComponentPath(path: string): boolean {
  return /\/lesson-\d+\/[^/]+\.tex$/i.test(path);
}

export function displayFileLabel(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}
