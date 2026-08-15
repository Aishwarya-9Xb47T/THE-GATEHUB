/**
 * LU lesson compiler — compiles every instructor-owned .tex file independently.
 * Editor bytes → Document AST. No repair, no regeneration, no stripping.
 */
import type { DocumentNode } from "../../../../shared/lesson-body/dist/documentTypes.js";
import { parseLessonDocument } from "../../../../shared/lesson-body/dist/parseDocument.js";
import { parseLessonTexCommand } from "../../../../shared/lesson-body/dist/parseTexCommand.js";
import { toDocumentBlock, documentNodesToBlocks } from "../../../../shared/lesson-body/dist/documentPipeline.js";
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuProjectJson, LuProjectLessonRef, LuProjectModuleRef, LuProjectTrackRef } from "./luProjectSchema.js";
import type { ProjectFileRecord } from "./luProjectFiles.js";
import { normalizeProjectPath } from "./luProjectFiles.js";
import { isUserOwnedComponentTexPath } from "./luProjectTexSync.js";
import { CHILD_CONTAINER_KINDS } from "./luComponentRegistry.js";
import {
  canonicalAssetFilename,
  resolveProjectMediaAssetRef,
} from "./luProjectAssetResolver.js";
import type {
  CompileDiagnostic,
  CompiledAssetRef,
  CompiledTexFile,
  LuCompiledPackage,
} from "./luCompiledPackageSchema.js";
import { LU_COMPILED_PACKAGE_VERSION } from "./luCompiledPackageSchema.js";
import {
  canonicalDocumentIdentity,
  isPublishableCompiledDocument,
  isPublishableCompiledDocumentPath,
} from "./luPublishIntegrity.js";
import {
  isInteractiveOnlyTex,
  lessonDirectoryFromDocumentPath,
  listSavedPublishableSourcePaths,
} from "./luPublishSourceOfTruth.js";
import { sanitizeAIContentForLaTeX } from "../../utils/aiContentSanitizer.js";

function consumeCommandArgumentBraces(tex: string, startIdx: number): { content: string; endIdx: number } | null {
  if (tex[startIdx] !== "{") return null;
  let depth = 0;
  let result = "";
  for (let k = startIdx; k < tex.length; k++) {
    const ch = tex[k];
    if (ch === "\\") {
      if (k + 1 < tex.length) {
        result += tex[k] + tex[k + 1];
        k++;
        continue;
      }
    }
    result += ch;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { content: result, endIdx: k + 1 };
      }
    }
  }
  return null;
}

/**
 * Sanitize instructor-edited .tex content by escaping special LaTeX characters
 * while preserving code blocks, math environments, and complete LaTeX command blocks.
 */
function sanitizeInstructorTexContent(tex: string): string {
  if (!tex) return "";

  let result = "";
  let i = 0;
  const len = tex.length;

  while (i < len) {
    // Preserve verbatim and lstlisting environments
    if (tex.slice(i).startsWith("\\begin{verbatim}") || tex.slice(i).startsWith("\\begin{lstlisting}")) {
      const endTag = tex.slice(i).startsWith("\\begin{verbatim}") ? "\\end{verbatim}" : "\\end{lstlisting}";
      const endIdx = tex.indexOf(endTag, i);
      if (endIdx === -1) {
        // Unclosed environment, preserve as-is
        result += tex.slice(i);
        break;
      }
      result += tex.slice(i, endIdx + endTag.length);
      i = endIdx + endTag.length;
      continue;
    }

    // Preserve math environments: \[...\] and $$...$$
    if (tex[i] === "\\" && i + 1 < len && tex[i + 1] === "[") {
      const endIdx = tex.indexOf("\\]", i + 2);
      if (endIdx === -1) {
        result += tex.slice(i);
        break;
      }
      result += tex.slice(i, endIdx + 2);
      i = endIdx + 2;
      continue;
    }

    if (tex[i] === "$" && i + 1 < len && tex[i + 1] === "$") {
      const endIdx = tex.indexOf("$$", i + 2);
      if (endIdx === -1) {
        result += tex.slice(i);
        break;
      }
      result += tex.slice(i, endIdx + 2);
      i = endIdx + 2;
      continue;
    }

    // Preserve inline math $...$
    if (tex[i] === "$" && (i === 0 || tex[i - 1] !== "$")) {
      const endIdx = tex.indexOf("$", i + 1);
      if (endIdx === -1) {
        result += tex.slice(i);
        break;
      }
      result += tex.slice(i, endIdx + 1);
      i = endIdx + 1;
      continue;
    }

    // Preserve backslash-escaped characters or TeX commands: \cmd, \&, \#, \%, etc.
    if (tex[i] === "\\") {
      let j = i + 1;
      while (j < len && /[a-zA-Z*]/.test(tex[j])) {
        j++;
      }
      if (j > i + 1) {
        // Full command name matched: \video, \section, \theory, \documentclass, etc.
        result += tex.substring(i, j);
        i = j;

        // Consume whitespace after command name if any
        while (i < len && /\s/.test(tex[i])) {
          result += tex[i];
          i++;
        }

        // Consume optional bracket argument [ ...] if present
        if (i < len && tex[i] === "[") {
          const bracketEnd = tex.indexOf("]", i);
          if (bracketEnd !== -1) {
            result += tex.substring(i, bracketEnd + 1);
            i = bracketEnd + 1;
            while (i < len && /\s/.test(tex[i])) {
              result += tex[i];
              i++;
            }
          }
        }

        // Consume balanced brace argument block { ... } if present
        if (i < len && tex[i] === "{") {
          const argBlock = consumeCommandArgumentBraces(tex, i);
          if (argBlock) {
            result += argBlock.content;
            i = argBlock.endIdx;
          }
        }
        continue;
      } else {
        // Escaped single character: \&, \#, \%, \_, etc.
        result += tex[i];
        if (i + 1 < len) {
          result += tex[i + 1];
          i += 2;
          continue;
        }
        i++;
        continue;
      }
    }

    // Check for unescaped special LaTeX characters in text context
    const specialChars = ["&", "%", "#", "_", "{", "}", "$", "^", "~"];
    if (specialChars.includes(tex[i])) {
      result += "\\" + tex[i];
      i++;
      continue;
    }

    result += tex[i];
    i++;
  }

  return result;
}

const WORKSPACE_COMPONENT_KINDS = new Set([
  "coding-lab",
  "notebook",
  "research-paper",
  "project",
  "assignment",
  "practice",
  "video",
]);

const INTERACTIVE_BLOCK_TYPES = new Set([
  "quiz",
  "practice",
  "project",
  "codinglab",
  "coding-lab",
  "notebook",
  "research-paper",
  "research",
  "references",
  "assignment",
  "video",
  "image",
  "resource",
  "download",
]);

function shouldCompileAsDocument(filePath: string, sourceTex: string): boolean {
  const normalized = canonicalDocumentIdentity(filePath);
  if (!isPublishableCompiledDocumentPath(normalized)) return false;
  if (/\/videos\.tex$/i.test(normalized)) return false;
  if (isInteractiveOnlyTex(sourceTex)) return false;
  return true;
}

function lineColumnAt(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, index));
  const lines = before.split("\n");
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function findRefPosition(source: string, ref: string): { line?: number; column?: number } {
  const idx = source.indexOf(ref);
  if (idx < 0) return {};
  return lineColumnAt(source, idx);
}

function rewriteAssetNodes(
  nodes: DocumentNode[],
  sourceTex: string,
  files: ProjectFileRecord[],
  filePath: string,
  issues: CompileDiagnostic[]
): CompiledAssetRef[] {
  const assets: CompiledAssetRef[] = [];

  for (const node of nodes) {
    if (node.type !== "image" && node.type !== "video") continue;
    const ref = node.ref?.trim() ?? "";
    if (!ref) continue;
    if (node.type === "video" && /^https?:\/\//i.test(ref)) continue;

    const kind = node.type === "image" ? "image" : "video";
    const resolved = resolveProjectMediaAssetRef(ref, files, kind);
    if (!resolved) {
      const pos = findRefPosition(sourceTex, ref);
      issues.push({
        severity: "error",
        file: filePath,
        line: pos.line,
        column: pos.column,
        code: kind === "image" ? "MISSING_IMAGE_ASSET" : "MISSING_VIDEO_ASSET",
        message: `Unresolved ${kind} asset "${node.ref}" in ${filePath}`,
      });
      continue;
    }
    const resolvedPath = normalizeProjectPath(resolved.path);
    node.ref = canonicalAssetFilename(ref, resolved);
    assets.push({ ref: node.ref, resolvedPath, kind });
  }

  return assets;
}

/** Discover every instructor-editable component .tex file — never hardcode lesson names. */
export function discoverEditableTexFiles(files: ProjectFileRecord[]): ProjectFileRecord[] {
  return files
    .filter((f) => !f.isFolder && f.path.endsWith(".tex") && isUserOwnedComponentTexPath(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Compile one .tex file exactly as authored in the editor. */
export function compileTexFile(
  filePath: string,
  sourceTex: string,
  files: ProjectFileRecord[]
): { compiled: CompiledTexFile | null; issues: CompileDiagnostic[] } {
  const path = normalizeProjectPath(filePath);
  const issues: CompileDiagnostic[] = [];
  const content = sourceTex ?? "";

  if (!content.trim()) {
    issues.push({
      severity: "error",
      file: path,
      code: "EMPTY_LESSON_FILE",
      message: `Lesson file is empty: ${path}`,
    });
    return { compiled: null, issues };
  }

  // Sanitize instructor-edited content to prevent invalid LaTeX from entering compilation
  // This handles the case where instructors directly edit .tex files and may introduce
  // unescaped special characters that break compilation (e.g., & in text)
  const sanitizedContent = sanitizeInstructorTexContent(content);

  let doc: ReturnType<typeof parseLessonDocument>;
  let parsedCmd: ReturnType<typeof parseLessonTexCommand>;
  try {
    parsedCmd = parseLessonTexCommand(sanitizedContent);
    doc = parseLessonDocument(sanitizedContent);
  } catch (err) {
    issues.push({
      severity: "error",
      file: path,
      code: "PARSE_ERROR",
      message: err instanceof Error ? err.message : String(err),
    });
    return { compiled: null, issues };
  }

  if (!doc.nodes.length && !doc.title) {
    issues.push({
      severity: "error",
      file: path,
      code: "EMPTY_COMPILED_DOCUMENT",
      message: `Compiled document has no nodes: ${path}`,
    });
    return { compiled: null, issues };
  }

  const nodes = doc.nodes.map((n) => ({ ...n })) as DocumentNode[];
  const assets = rewriteAssetNodes(nodes, content, files, path, issues);

  if (issues.some((i) => i.severity === "error")) {
    return { compiled: null, issues };
  }

  return {
    compiled: {
      path,
      command: parsedCmd && "command" in parsedCmd ? String(parsedCmd.command ?? "") || undefined : undefined,
      title: doc.title,
      sourceTex: content,
      nodes,
      assets,
    },
    issues,
  };
}

/** Compile every saved instructor document .tex file, including \\input targets of named/numeric wrappers. */
export function compileAllLessonTexFiles(
  projectId: string,
  files: ProjectFileRecord[],
  _project: LuProjectJson
): { package: LuCompiledPackage; issues: CompileDiagnostic[] } {
  const byPath = new Map(
    files
      .filter((file) => !file.isFolder)
      .map((file) => [canonicalDocumentIdentity(file.path), file] as const)
  );
  const compilePaths = new Set([
    ...listSavedPublishableSourcePaths(files),
    ...discoverEditableTexFiles(files)
      .filter((file) => shouldCompileAsDocument(file.path, file.content ?? ""))
      .map((file) => canonicalDocumentIdentity(file.path)),
  ]);
  const compiledFiles: Record<string, CompiledTexFile> = {};
  const issues: CompileDiagnostic[] = [];

  for (const path of [...compilePaths].sort()) {
    const file = byPath.get(path);
    const content = file?.content ?? "";
    if (!shouldCompileAsDocument(path, content)) continue;

    const { compiled, issues: fileIssues } = compileTexFile(path, content, files);
    issues.push(...fileIssues);
    if (compiled) {
      compiledFiles[path] = compiled;
    }
  }

  return {
    package: {
      version: LU_COMPILED_PACKAGE_VERSION,
      compiledAt: new Date().toISOString(),
      projectId,
      files: compiledFiles,
    },
    issues,
  };
}

function sortedComponents(lesson: LuProjectLessonRef) {
  const comps = [...(lesson.components ?? [])];
  comps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return comps;
}

function lessonDirectory(
  track: LuProjectTrackRef,
  mod: LuProjectModuleRef,
  lesson: LuProjectLessonRef
): string {
  const fromId = lesson.id?.trim();
  const fromFile =
    lesson.file
      .replace(/\\/g, "/")
      .replace(/\.tex$/i, "")
      .split("/")
      .filter(Boolean)
      .pop() || "";
  const slug = fromId || fromFile;
  return normalizeProjectPath(`/${track.folder}/${mod.folder}/${slug}`);
}

function compiledFileForPath(
  compiled: LuCompiledPackage,
  path: string
): CompiledTexFile | undefined {
  const identity = canonicalDocumentIdentity(path);
  return compiled.files[identity] ?? compiled.files[normalizeProjectPath(path)] ?? compiled.files[path];
}

function emptyParsedLesson(title: string): ParsedLearningUniverse["tracks"][number]["modules"][number]["lessons"][number] {
  return {
    title,
    overviewMarkdown: "",
    contentBlocks: [],
    videos: [],
    resources: [],
  };
}

function ensureParsedLesson(
  parsed: ParsedLearningUniverse,
  track: LuProjectTrackRef,
  mod: LuProjectModuleRef,
  lessonRef: LuProjectLessonRef,
  trackIdx: number,
  modIdx: number,
  lessonIdx: number
): ParsedLearningUniverse["tracks"][number]["modules"][number]["lessons"][number] {
  while (parsed.tracks.length <= trackIdx) {
    parsed.tracks.push({
      title: track.title,
      description: track.description ?? "",
      modules: [],
    });
  }
  const parsedTrack = parsed.tracks[trackIdx];
  while (parsedTrack.modules.length <= modIdx) {
    parsedTrack.modules.push({
      title: mod.title,
      description: "",
      lessons: [],
    });
  }
  const parsedMod = parsedTrack.modules[modIdx];
  while (parsedMod.lessons.length <= lessonIdx) {
    parsedMod.lessons.push(emptyParsedLesson(lessonRef.title));
  }
  return parsedMod.lessons[lessonIdx];
}

function ensureLessonForDirectory(
  parsed: ParsedLearningUniverse,
  project: LuProjectJson,
  lessonDir: string
): ParsedLearningUniverse["tracks"][number]["modules"][number]["lessons"][number] {
  for (let trackIdx = 0; trackIdx < project.tracks.length; trackIdx++) {
    const track = project.tracks[trackIdx];
    for (let modIdx = 0; modIdx < track.modules.length; modIdx++) {
      const mod = track.modules[modIdx];
      for (let lessonIdx = 0; lessonIdx < mod.lessons.length; lessonIdx++) {
        const lessonRef = mod.lessons[lessonIdx];
        if (lessonDirectory(track, mod, lessonRef) !== lessonDir) continue;
        return ensureParsedLesson(parsed, track, mod, lessonRef, trackIdx, modIdx, lessonIdx);
      }
    }
  }

  const parts = lessonDir.split("/").filter(Boolean);
  const title = parts[parts.length - 1] ?? "Lesson";
  if (!parsed.tracks[0]) {
    parsed.tracks.push({ title: parts[0] ?? "Track", description: "", modules: [] });
  }
  if (!parsed.tracks[0].modules[0]) {
    parsed.tracks[0].modules.push({ title: parts[1] ?? "Module", description: "", lessons: [] });
  }
  const created = emptyParsedLesson(title);
  parsed.tracks[0].modules[0].lessons.push(created);
  return created;
}

function stampCompiledSource(
  block: { type: string; content?: unknown; compiledSourcePath?: string; title?: string },
  compiledFile: CompiledTexFile
): void {
  const sourcePath = canonicalDocumentIdentity(compiledFile.path);
  block.compiledSourcePath = sourcePath;
  if (block.content && typeof block.content === "object") {
    const content = block.content as {
      compiledSourcePath?: string;
      sourceTex?: string;
      nodes?: unknown;
      title?: string;
    };
    content.compiledSourcePath = sourcePath;
    content.sourceTex = compiledFile.sourceTex;
    if (!content.nodes) content.nodes = compiledFile.nodes;
    if (!content.title) content.title = compiledFile.title;
  } else {
    block.content = {
      title: compiledFile.title,
      compiledSourcePath: sourcePath,
      sourceTex: compiledFile.sourceTex,
      nodes: compiledFile.nodes,
    };
  }
}

function pushCompiledDocumentBlock(
  nextBlocks: Array<{ type: string; content: unknown; compiledSourcePath?: string; title?: string }>,
  compiledFile: CompiledTexFile,
  title?: string
): void {
  const blocks = documentNodesToBlocks(
    compiledFile.nodes,
    compiledFile.sourceTex,
    title ?? compiledFile.title
  );
  const sourcePath = canonicalDocumentIdentity(compiledFile.path);
  const hasDocument = blocks.some((block) => block.type === "document");
  const videoOnly =
    compiledFile.nodes.length > 0 &&
    compiledFile.nodes.every((node) => node.type === "video" || node.kind === "video");
  if (!hasDocument && !videoOnly) {
    blocks.push({
      type: "document",
      title: title ?? compiledFile.title,
      content: {
        title: title ?? compiledFile.title,
        compiledSourcePath: sourcePath,
        sourceTex: compiledFile.sourceTex,
        nodes: compiledFile.nodes,
      },
      sourceTex: compiledFile.sourceTex,
      nodes: compiledFile.nodes,
    });
  }
  for (const block of blocks) {
    if (block.type === "document") {
      stampCompiledSource(block, compiledFile);
      nextBlocks.push({
        type: block.type,
        content: block.content,
        compiledSourcePath: sourcePath,
        title: typeof block.title === "string" ? block.title : undefined,
      });
    } else {
      nextBlocks.push({
        type: block.type,
        content: block.content,
        title: typeof block.title === "string" ? block.title : undefined,
      });
    }
  }
}

function takeInteractiveBlock(
  parsedBlocks: Array<{ type: string; content: unknown }>,
  kind: string,
  used: Set<number>
): { type: string; content: unknown } | null {
  for (let i = 0; i < parsedBlocks.length; i++) {
    if (used.has(i)) continue;
    const block = parsedBlocks[i];
    const t = block.type.toLowerCase();
    if (
      t === kind ||
      (kind === "coding-lab" && (t === "codinglab" || t === "coding-lab")) ||
      (kind === "research-paper" && (t === "research-paper" || t === "research" || t === "researchpaper")) ||
      (kind === "references" && t === "references")
    ) {
      used.add(i);
      return block;
    }
  }
  return null;
}

/**
 * Rebuild lesson contentBlocks from compiled package + parsed interactive blocks.
 * Document blocks always come from compiled .tex files — never from merged DSL body extraction.
 */
export function applyCompiledPackageToParsed(
  parsed: ParsedLearningUniverse,
  project: LuProjectJson,
  compiled: LuCompiledPackage
): void {
  const usedCompiledPaths = new Set<string>();

  const applyLesson = (
    parsedLesson: ParsedLearningUniverse["tracks"][number]["modules"][number]["lessons"][number],
    track: LuProjectTrackRef,
    mod: LuProjectModuleRef,
    lessonRef: LuProjectLessonRef
  ) => {
    const parsedBlocks = [...parsedLesson.contentBlocks];
    const usedParsed = new Set<number>();
    const nextBlocks: Array<{ type: string; content: unknown }> = [];
    const lessonDir = lessonDirectory(track, mod, lessonRef);
    const localUsed = new Set<string>();

    for (const comp of sortedComponents(lessonRef)) {
      if (CHILD_CONTAINER_KINDS.has(comp.kind as never)) {
        const interactive = takeInteractiveBlock(parsedBlocks, comp.kind, usedParsed);
        if (interactive && interactive.type !== "document") nextBlocks.push(interactive);
        for (const child of comp.children ?? []) {
          const childPath = child.file ? canonicalDocumentIdentity(child.file) : "";
          const compiledFile = childPath ? compiledFileForPath(compiled, childPath) : undefined;
          if (compiledFile && isPublishableCompiledDocument(childPath, compiledFile)) {
            pushCompiledDocumentBlock(nextBlocks, compiledFile, child.title);
            localUsed.add(canonicalDocumentIdentity(compiledFile.path));
          }
        }
        continue;
      }

      if (WORKSPACE_COMPONENT_KINDS.has(comp.kind)) {
        const interactive = takeInteractiveBlock(parsedBlocks, comp.kind, usedParsed);
        if (interactive && interactive.type !== "document") nextBlocks.push(interactive);
        continue;
      }

      const compPath = comp.file ? canonicalDocumentIdentity(comp.file) : "";
      const compiledFile = compPath ? compiledFileForPath(compiled, compPath) : undefined;

      if (compiledFile && isPublishableCompiledDocument(compPath, compiledFile)) {
        pushCompiledDocumentBlock(nextBlocks, compiledFile, comp.title);
        localUsed.add(canonicalDocumentIdentity(compiledFile.path));
        continue;
      }

      if (INTERACTIVE_BLOCK_TYPES.has(comp.kind.toLowerCase())) {
        const interactive = takeInteractiveBlock(parsedBlocks, comp.kind, usedParsed);
        if (interactive && interactive.type !== "document") nextBlocks.push(interactive);
      }
    }

    for (const [path, compiledFile] of Object.entries(compiled.files)) {
      const normalized = canonicalDocumentIdentity(path);
      if (localUsed.has(normalized) || usedCompiledPaths.has(normalized)) continue;
      if (!isPublishableCompiledDocument(normalized, compiledFile)) continue;
      if (!normalized.startsWith(`${lessonDir}/`)) continue;
      pushCompiledDocumentBlock(nextBlocks, compiledFile);
      localUsed.add(normalized);
    }

    parsedLesson.contentBlocks = nextBlocks;
    for (const path of localUsed) usedCompiledPaths.add(path);

    const overviewDoc = nextBlocks.find(
      (b) =>
        b.type === "document" &&
        typeof b.content === "object" &&
        /^overview$/i.test(String((b.content as { title?: string }).title ?? ""))
    );
    if (overviewDoc && typeof overviewDoc.content === "object") {
      const c = overviewDoc.content as { sourceTex?: string };
      if (c.sourceTex) parsedLesson.overviewMarkdown = c.sourceTex;
    }
  };

  for (let trackIdx = 0; trackIdx < project.tracks.length; trackIdx++) {
    const track = project.tracks[trackIdx];
    for (let modIdx = 0; modIdx < track.modules.length; modIdx++) {
      const mod = track.modules[modIdx];
      for (let lessonIdx = 0; lessonIdx < mod.lessons.length; lessonIdx++) {
        const lessonRef = mod.lessons[lessonIdx];
        const parsedLesson = ensureParsedLesson(
          parsed,
          track,
          mod,
          lessonRef,
          trackIdx,
          modIdx,
          lessonIdx
        );
        applyLesson(parsedLesson, track, mod, lessonRef);
      }
    }
  }

  for (const [path, compiledFile] of Object.entries(compiled.files)) {
    const identity = canonicalDocumentIdentity(path);
    if (usedCompiledPaths.has(identity)) continue;
    if (!isPublishableCompiledDocument(identity, compiledFile)) continue;
    const lessonDir = lessonDirectoryFromDocumentPath(identity);
    if (!lessonDir) continue;
    const parsedLesson = ensureLessonForDirectory(parsed, project, lessonDir);
    pushCompiledDocumentBlock(parsedLesson.contentBlocks, compiledFile);
    usedCompiledPaths.add(identity);
  }
}

export function compileDiagnosticsToValidation(
  issues: CompileDiagnostic[]
): Array<{ severity: "error" | "warning"; code: string; message: string; line?: number }> {
  return issues.map((i) => ({
    severity: i.severity,
    code: i.code,
    message: i.file ? `${i.message}` : i.message,
    line: i.line,
  }));
}

export function hasBlockingCompileErrors(issues: CompileDiagnostic[]): boolean {
  return issues.some((i) => i.severity === "error");
}
