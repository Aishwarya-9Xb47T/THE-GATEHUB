/**
 * Publish from compiled package ONLY — no TeX re-parse, no legacy body reconstruction.
 */
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuProjectJson } from "./luProjectSchema.js";
import type { ProjectFileRecord } from "./luProjectFiles.js";
import { loadProjectFiles, normalizeProjectPath, getProjectJsonFromFiles } from "./luProjectFiles.js";
import { applyCompiledPackageToParsed } from "./luLessonCompiler.js";
import type { LuCompiledPackage } from "./luCompiledPackageSchema.js";
import { LU_COMPILED_PACKAGE_PATH } from "./luCompiledPackageSchema.js";
import {
  assertPublishCompiledIntegrity,
  countCompiledDocuments,
  countCompiledImages,
  countDocumentBlocks,
  countDocumentImages,
  dropNonPublishableDocumentBlocks,
  isLessonCompiledDocumentPath,
} from "./luPublishIntegrity.js";

export {
  assertPublishCompiledIntegrity,
  countCompiledDocuments,
  countCompiledImages,
  countDocumentBlocks,
  countDocumentImages,
  dropNonPublishableDocumentBlocks,
  isLessonCompiledDocumentPath,
};

/** Apply compiled package to parsed universe — sole source for document contentBlocks. */
export function publishFromCompiledPackage(
  parsed: ParsedLearningUniverse,
  project: LuProjectJson,
  compiled: LuCompiledPackage
): void {
  applyCompiledPackageToParsed(parsed, project, compiled);
  const dropped = dropNonPublishableDocumentBlocks(parsed, compiled);
  if (dropped.length) {
    console.warn("[PublishIntegrity] dropped non-publishable dsl-orphan document block(s):", dropped.length);
    for (const ref of dropped) {
      console.warn(
        `[PublishIntegrity] dsl-orphan lesson=${JSON.stringify(ref.lessonTitle)} title=${JSON.stringify(ref.title)} path=${ref.compiledSourcePath ?? "(none)"}`
      );
    }
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
      return null;
    }
  }

  return null;
}
