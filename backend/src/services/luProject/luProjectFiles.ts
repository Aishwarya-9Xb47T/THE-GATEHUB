import { prisma } from "../../utils/prisma.js";
import { LU_PROJECT_JSON_PATH, parseLuProjectJson, type LuProjectJson } from "./luProjectSchema.js";

export interface ProjectFileRecord {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  content: string | null;
  s3Url?: string | null;
}

export async function loadProjectFiles(projectId: string): Promise<ProjectFileRecord[]> {
  const files = await prisma.latexFile.findMany({
    where: { projectId },
    orderBy: { path: "asc" },
  });
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    isFolder: f.isFolder,
    content: f.content,
    s3Url: f.s3Url,
  }));
}

export function filesToContentMap(files: ProjectFileRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of files) {
    if (f.isFolder) continue;
    if (f.content != null) {
      map.set(normalizeProjectPath(f.path), f.content);
    }
  }
  return map;
}

export function normalizeProjectPath(inputPath: string): string {
  let p = inputPath.replace(/\\/g, "/").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

export function resolveInputPath(inputRef: string): string {
  let p = inputRef.replace(/\\/g, "/").trim();
  p = p.replace(/^\.\//, "");
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith(".tex") && !p.endsWith(".bib")) {
    p = `${p}.tex`;
  }
  return p;
}

export function getProjectJsonFromFiles(files: ProjectFileRecord[]): LuProjectJson | null {
  const jsonFile = files.find((f) => f.path === LU_PROJECT_JSON_PATH && !f.isFolder);
  if (!jsonFile?.content?.trim()) return null;
  return parseLuProjectJson(jsonFile.content);
}

export function isLuV2Project(files: ProjectFileRecord[]): boolean {
  return getProjectJsonFromFiles(files) !== null;
}
