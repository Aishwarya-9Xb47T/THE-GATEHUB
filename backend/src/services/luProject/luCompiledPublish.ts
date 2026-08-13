/**
 * Publish from compiled package ONLY — no TeX re-parse, no legacy body reconstruction.
 */
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuProjectJson } from "./luProjectSchema.js";
import type { ProjectFileRecord } from "./luProjectFiles.js";
import { loadProjectFiles, normalizeProjectPath } from "./luProjectFiles.js";
import {
  applyCompiledPackageToParsed,
  compileAllLessonTexFiles,
} from "./luLessonCompiler.js";
import type { LuCompiledPackage } from "./luCompiledPackageSchema.js";
import { LU_COMPILED_PACKAGE_PATH } from "./luCompiledPackageSchema.js";
import { getProjectJsonFromFiles } from "./luProjectFiles.js";

export function countCompiledDocuments(compiled: LuCompiledPackage): number {
  return Object.keys(compiled.files).filter(isLessonCompiledDocumentPath).length;
}

/** Lesson-scoped compiled documents — excludes project metadata.tex. */
export function isLessonCompiledDocumentPath(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/metadata.tex") return false;
  return /\/lesson-\d+\//i.test(normalized);
}

export function countDocumentBlocks(parsed: ParsedLearningUniverse): number {
  let n = 0;
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type === "document") n++;
        }
      }
    }
  }
  return n;
}

export function countDocumentImages(parsed: ParsedLearningUniverse): number {
  let n = 0;
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          const content = block.content as { nodes?: Array<{ type: string }> };
          if (Array.isArray(content?.nodes)) {
            n += content.nodes.filter((node) => node.type === "image").length;
          }
        }
      }
    }
  }
  return n;
}

export function countCompiledImages(compiled: LuCompiledPackage): number {
  let n = 0;
  for (const file of Object.values(compiled.files)) {
    n += file.nodes.filter((node) => node.type === "image").length;
  }
  return n;
}

/** Apply compiled package to parsed universe — sole source for document contentBlocks. */
export function publishFromCompiledPackage(
  parsed: ParsedLearningUniverse,
  project: LuProjectJson,
  compiled: LuCompiledPackage
): void {
  applyCompiledPackageToParsed(parsed, project, compiled);
}

export function assertPublishCompiledIntegrity(
  parsed: ParsedLearningUniverse,
  compiled: LuCompiledPackage
): void {
  const compiledDocs = countCompiledDocuments(compiled);
  const publishedDocs = countDocumentBlocks(parsed);
  if (compiledDocs !== publishedDocs) {
    throw new Error(
      `Publish integrity failed: compiled ${compiledDocs} document(s) but parsed has ${publishedDocs} document block(s). Publish must persist every compiled document.`
    );
  }
}

export async function loadCompiledPackageFromProject(
  projectId: string
): Promise<{ compiled: LuCompiledPackage; files: ProjectFileRecord[]; project: LuProjectJson } | null> {
  const files = await loadProjectFiles(projectId);
  const project = getProjectJsonFromFiles(files);
  if (!project) return null;

  const stored = files.find((f) => normalizeProjectPath(f.path) === LU_COMPILED_PACKAGE_PATH);
  if (stored?.content?.trim()) {
    try {
      const parsed = JSON.parse(stored.content) as LuCompiledPackage;
      if (parsed?.files && typeof parsed.files === "object") {
        return { compiled: parsed, files, project };
      }
    } catch {
      // Invalid compiled package - return null to enforce single source of truth
      // Caller should require a fresh publish instead of regenerating from draft files
      return null;
    }
  }

  // No compiled package exists - return null instead of recompiling from draft files
  // This ensures all views read from the published package only (single source of truth)
  return null;
}
