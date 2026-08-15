/**
 * LaTeX editor files are the publish source of truth.
 * saved .tex → canonical path → compiled document → published document
 */
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuCompiledPackage } from "./luCompiledPackageSchema.js";
import {
  canonicalDocumentIdentity,
  getCompiledSourcePath,
  isNonPublishableCompileArtifact,
  isPublishableCompiledDocumentPath,
  listParsedDocumentRefs,
  listPublishableCompiledPaths,
} from "./luPublishIntegrity.js";

const INTERACTIVE_ONLY_TEX_RE =
  /^\\(?:question|quiz|practice|codinglab|notebook|video|researchpaper|project|assignment)\s*\{/im;

export function isInteractiveOnlyTex(sourceTex: string): boolean {
  return INTERACTIVE_ONLY_TEX_RE.test((sourceTex ?? "").trim());
}

export function extractInputRefs(tex: string): string[] {
  const refs: string[] = [];
  const re = /\\(?:input|include)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tex ?? ""))) {
    const ref = match[1]?.trim();
    if (ref) refs.push(ref);
  }
  return refs;
}

function withTexExtension(path: string): string {
  const normalized = canonicalDocumentIdentity(path);
  if (/\.(tex|bib)$/i.test(normalized)) return normalized;
  return `${normalized}.tex`;
}

export function resolveInputToSavedPath(
  wrapperPath: string,
  ref: string,
  savedPaths: Set<string>
): string | null {
  const wrapper = canonicalDocumentIdentity(wrapperPath);
  const sourceDir = wrapper.replace(/\/[^/]+$/, "");
  const wrapperBase = wrapper.split("/").pop()?.replace(/\.tex$/i, "") ?? "";
  const lessonDir = wrapperBase ? `${sourceDir}/${wrapperBase}` : sourceDir;
  const trimmed = ref.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  const candidates = [
    withTexExtension(`${sourceDir}/${trimmed}`),
    withTexExtension(`${lessonDir}/${trimmed}`),
    withTexExtension(`/${trimmed}`),
    withTexExtension(trimmed),
  ];
  for (const candidate of candidates) {
    if (savedPaths.has(candidate)) return candidate;
  }
  return null;
}

export function lessonDirectoryFromDocumentPath(path: string): string | null {
  const parts = canonicalDocumentIdentity(path).split("/").filter(Boolean);
  if (parts.length < 4) return null;
  return `/${parts.slice(0, 3).join("/")}`;
}

type SavedFile = { path: string; content?: string | null; isFolder?: boolean };

function savedTexFiles(files: SavedFile[]): Array<{ path: string; content: string }> {
  return files
    .filter((file) => !file.isFolder && /\.tex$/i.test(file.path.replace(/\\/g, "/")))
    .map((file) => ({
      path: canonicalDocumentIdentity(file.path),
      content: file.content ?? "",
    }));
}

/**
 * Instructor-authored publishable document sources from the saved LaTeX project.
 * Wrappers are not documents; their \\input targets are.
 */
export function listSavedPublishableSourcePaths(files: SavedFile[]): string[] {
  const texFiles = savedTexFiles(files);
  const pathSet = new Set(texFiles.map((file) => file.path));
  const byPath = new Map(texFiles.map((file) => [file.path, file]));
  const publishable = new Set<string>();

  const considerLeaf = (path: string, content: string) => {
    if (!isPublishableCompiledDocumentPath(path)) return;
    if (isInteractiveOnlyTex(content)) return;
    publishable.add(path);
  };

  const visitInputs = (fromPath: string, content: string, depth: number) => {
    if (depth > 24) return;
    for (const ref of extractInputRefs(content)) {
      const resolved = resolveInputToSavedPath(fromPath, ref, pathSet);
      if (!resolved) continue;
      const child = byPath.get(resolved);
      if (!child) continue;
      if (isNonPublishableCompileArtifact(resolved)) {
        visitInputs(resolved, child.content, depth + 1);
        continue;
      }
      considerLeaf(resolved, child.content);
      visitInputs(resolved, child.content, depth + 1);
    }
  };

  for (const file of texFiles) {
    if (isNonPublishableCompileArtifact(file.path)) {
      visitInputs(file.path, file.content, 0);
      continue;
    }
    considerLeaf(file.path, file.content);
    visitInputs(file.path, file.content, 0);
  }

  return [...publishable].sort();
}

export function listPublishedSourcePaths(parsed: ParsedLearningUniverse): string[] {
  return listParsedDocumentRefs(parsed)
    .map((ref) => ref.compiledSourcePath)
    .filter((path): path is string => Boolean(path))
    .sort();
}

export interface PublishSourceOfTruthDiff {
  savedPaths: string[];
  compiledPaths: string[];
  publishingPaths: string[];
  missingFromCompile: string[];
  missingFromPublish: string[];
}

export function diffPublishSourceOfTruth(
  files: SavedFile[],
  compiled: LuCompiledPackage,
  parsed: ParsedLearningUniverse
): PublishSourceOfTruthDiff {
  const savedPaths = listSavedPublishableSourcePaths(files);
  const compiledPaths = listPublishableCompiledPaths(compiled);
  const publishingPaths = listPublishedSourcePaths(parsed);
  const compiledSet = new Set(compiledPaths);
  const publishedSet = new Set(publishingPaths);
  return {
    savedPaths,
    compiledPaths,
    publishingPaths,
    missingFromCompile: savedPaths.filter((path) => !compiledSet.has(path)),
    missingFromPublish: compiledPaths.filter((path) => !publishedSet.has(path)),
  };
}

function logPathList(label: string, paths: string[]): void {
  console.log(`[PublishSourceOfTruth] ${label}`);
  if (!paths.length) {
    console.log("[PublishSourceOfTruth] (none)");
    return;
  }
  for (const path of paths) {
    console.log(`[PublishSourceOfTruth] ${path}`);
  }
}

export function logPublishSourceOfTruth(
  files: SavedFile[],
  compiled: LuCompiledPackage,
  parsed: ParsedLearningUniverse
): PublishSourceOfTruthDiff {
  const diff = diffPublishSourceOfTruth(files, compiled, parsed);
  logPathList("SAVED LATEX FILES:", diff.savedPaths);
  logPathList("COMPILED FILES:", diff.compiledPaths);
  logPathList("PUBLISHING FILES:", diff.publishingPaths);
  logPathList("MISSING FROM COMPILE:", diff.missingFromCompile);
  logPathList("MISSING FROM PUBLISH:", diff.missingFromPublish);
  return diff;
}

export function assertPublishSourceOfTruth(
  files: SavedFile[],
  compiled: LuCompiledPackage,
  parsed: ParsedLearningUniverse
): void {
  const diff = logPublishSourceOfTruth(files, compiled, parsed);
  if (diff.missingFromCompile.length) {
    throw new Error(
      `Publish source-of-truth failed: saved LaTeX document(s) missing from compile: ${diff.missingFromCompile.join(", ")}.`
    );
  }
  if (diff.missingFromPublish.length) {
    throw new Error(
      `Publish source-of-truth failed: compiled document(s) missing from publish: ${diff.missingFromPublish.join(", ")}.`
    );
  }
}

export function publishedDocumentSourceTex(
  parsed: ParsedLearningUniverse,
  sourcePath: string
): string | null {
  const identity = canonicalDocumentIdentity(sourcePath);
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          const path = getCompiledSourcePath(block);
          if (path !== identity) continue;
          const content = block.content as { sourceTex?: string } | undefined;
          if (typeof content?.sourceTex === "string") return content.sourceTex;
        }
      }
    }
  }
  return null;
}
