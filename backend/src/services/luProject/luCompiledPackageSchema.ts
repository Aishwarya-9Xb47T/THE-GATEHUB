/**
 * Compiled lesson package — canonical output of the LU lesson compiler.
 * Publish, preview, experience engine, and PDF must consume this package.
 */
import type { DocumentNode } from "../../../../shared/lesson-body/dist/documentTypes.js";

export const LU_COMPILED_PACKAGE_PATH = "/course.compiled.json";
export const LU_COMPILED_PACKAGE_VERSION = 1;

export interface CompiledAssetRef {
  ref: string;
  resolvedPath: string;
  kind: "image" | "video";
}

export interface CompiledTexFile {
  /** Normalized project path, e.g. /track-01/module-01/lesson-01/summary.tex */
  path: string;
  command?: string;
  title?: string;
  /** Exact authored bytes from the editor / database — never modified. */
  sourceTex: string;
  nodes: DocumentNode[];
  assets: CompiledAssetRef[];
}

export interface LuCompiledPackage {
  version: typeof LU_COMPILED_PACKAGE_VERSION;
  compiledAt: string;
  projectId: string;
  files: Record<string, CompiledTexFile>;
}

export interface CompileDiagnostic {
  severity: "error" | "warning";
  file: string;
  line?: number;
  column?: number;
  code: string;
  message: string;
}
