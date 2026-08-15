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
  isLessonLeafDocumentPath,
  isNonPublishableCompileArtifact,
  isPublishableCompiledDocumentPath,
} from "./luPublishIntegrity.js";
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

const INTERACTIVE_COMPONENT_KINDS = new Set([
  "quiz",
  "question",
  "practice",
  "coding-lab",
  "notebook",
  "research-paper",
  "project",
  "assignment",
  "resources",
  "references",
  "video",
]);

const INTERACTIVE_TEX_RE =
  /^\\(?:question|quiz|practice|codinglab|notebook|researchpaper|references|project|assignment|resource|download|video)\s*\{/im;

function componentKindForPath(project: LuProjectJson, filePath: string): string | null {
  const normalized = normalizeProjectPath(filePath);
  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const comp of lesson.components ?? []) {
          if (comp.file && normalizeProjectPath(comp.file) === normalized) {
            return comp.kind;
          }
          for (const child of comp.children ?? []) {
            if (child.file && normalizeProjectPath(child.file) === normalized) {
              return child.kind;
            }
          }
        }
      }
    }
  }
  return null;
}

function shouldCompileAsDocument(
  filePath: string,
  sourceTex: string,
  project: LuProjectJson
): boolean {
  const normalized = normalizeProjectPath(filePath);
  if (isNonPublishableCompileArtifact(normalized)) return false;
  if (!isLessonLeafDocumentPath(normalized)) return false;
  if (/\/videos\.tex$/i.test(normalized)) return false;

  const kind = componentKindForPath(project, filePath);
  if (kind && INTERACTIVE_COMPONENT_KINDS.has(kind)) return false;

  const compId = (() => {
    for (const track of project.tracks) {
      for (const mod of track.modules) {
        for (const lesson of mod.lessons) {
          for (const comp of lesson.components ?? []) {
            if (comp.file && normalizeProjectPath(comp.file) === normalized) return comp.id;
          }
        }
      }
    }
    return null;
  })();
  if (compId === "videos") return false;

  if (INTERACTIVE_TEX_RE.test(sourceTex.trim())) return false;
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

/** Compile every editable lesson file in the project. */
export function compileAllLessonTexFiles(
  projectId: string,
  files: ProjectFileRecord[],
  project: LuProjectJson
): { package: LuCompiledPackage; issues: CompileDiagnostic[] } {
  const editable = discoverEditableTexFiles(files);
  const compiledFiles: Record<string, CompiledTexFile> = {};
  const issues: CompileDiagnostic[] = [];

  for (const file of editable) {
    const content = file.content ?? "";
    if (!shouldCompileAsDocument(file.path, content, project)) continue;

    const { compiled, issues: fileIssues } = compileTexFile(file.path, content, files);
    issues.push(...fileIssues);
    if (compiled) {
      compiledFiles[normalizeProjectPath(file.path)] = compiled;
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
  const sourcePath = normalizeProjectPath(compiledFile.path);
  const hasDocument = blocks.some((block) => block.type === "document");
  const videoOnly =
    compiledFile.nodes.length > 0 &&
    compiledFile.nodes.every((node) => node.type === "video" || node.kind === "video");
  if (!hasDocument && !videoOnly) {
    blocks.push({
      type: "document",
      title: title ?? compiledFile.title,
      content: compiledFile.sourceTex,
      sourceTex: compiledFile.sourceTex,
      nodes: compiledFile.nodes,
    });
  }
  for (const block of blocks) {
    if (block.type === "document") {
      block.compiledSourcePath = sourcePath;
      if (block.content && typeof block.content === "object") {
        (block.content as { compiledSourcePath?: string }).compiledSourcePath = sourcePath;
      }
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
  for (let trackIdx = 0; trackIdx < project.tracks.length; trackIdx++) {
    const track = project.tracks[trackIdx];
    const parsedTrack = parsed.tracks[trackIdx];
    if (!parsedTrack) continue;

    for (let modIdx = 0; modIdx < track.modules.length; modIdx++) {
      const mod = track.modules[modIdx];
      const parsedMod = parsedTrack.modules[modIdx];
      if (!parsedMod) continue;

      for (let lessonIdx = 0; lessonIdx < mod.lessons.length; lessonIdx++) {
        const lessonRef = mod.lessons[lessonIdx];
        const parsedLesson = parsedMod.lessons[lessonIdx];
        if (!parsedLesson) continue;

        const parsedBlocks = [...parsedLesson.contentBlocks];
        const usedParsed = new Set<number>();
        const usedCompiledPaths = new Set<string>();
        const nextBlocks: Array<{ type: string; content: unknown }> = [];
        const lessonDir = lessonDirectory(track, mod, lessonRef);

        for (const comp of sortedComponents(lessonRef)) {
          if (CHILD_CONTAINER_KINDS.has(comp.kind as never)) {
            const interactive = takeInteractiveBlock(parsedBlocks, comp.kind, usedParsed);
            if (interactive) nextBlocks.push(interactive);
            for (const child of comp.children ?? []) {
              const childPath = child.file ? normalizeProjectPath(child.file) : "";
              const compiledFile = childPath ? compiled.files[childPath] : undefined;
              if (compiledFile && isPublishableCompiledDocumentPath(childPath)) {
                pushCompiledDocumentBlock(nextBlocks, compiledFile, child.title);
                usedCompiledPaths.add(childPath);
              }
            }
            continue;
          }

          const compPath = comp.file ? normalizeProjectPath(comp.file) : "";
          const compiledFile = compPath ? compiled.files[compPath] : undefined;

          if (compiledFile && isPublishableCompiledDocumentPath(compPath)) {
            pushCompiledDocumentBlock(nextBlocks, compiledFile, comp.title);
            usedCompiledPaths.add(compPath);
            continue;
          }

          if (INTERACTIVE_BLOCK_TYPES.has(comp.kind.toLowerCase())) {
            const interactive = takeInteractiveBlock(parsedBlocks, comp.kind, usedParsed);
            if (interactive) nextBlocks.push(interactive);
          }
        }

        for (const [path, compiledFile] of Object.entries(compiled.files)) {
          const normalized = normalizeProjectPath(path);
          if (usedCompiledPaths.has(normalized)) continue;
          if (!isPublishableCompiledDocumentPath(normalized)) continue;
          if (!normalized.startsWith(`${lessonDir}/`)) continue;
          pushCompiledDocumentBlock(nextBlocks, compiledFile);
          usedCompiledPaths.add(normalized);
        }

        parsedLesson.contentBlocks = nextBlocks;
        if (nextBlocks.length > 0) {
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
        }
      }
    }
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
