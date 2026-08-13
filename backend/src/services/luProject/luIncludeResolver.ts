import {
  filesToContentMap,
  normalizeProjectPath,
  resolveInputPath,
  type ProjectFileRecord,
} from "./luProjectFiles.js";
import { getProjectJsonFromFiles, isLuV2Project } from "./luProjectFiles.js";
import { LU_PROJECT_JSON_PATH } from "./luProjectSchema.js";
import type { LuProjectJson } from "./luProjectSchema.js";
import { componentFilePath } from "./luComponentFilePaths.js";
import { repairOrchestrationFromProject } from "./luTexAst.js";

export interface SourceLineMapping {
  mergedLine: number;
  sourcePath: string;
  sourceLine: number;
}

export interface ResolvedProjectSource {
  mergedDsl: string;
  mergedForPdf: string;
  lineMap: SourceLineMapping[];
  includedFiles: string[];
  isV2Project: boolean;
}


function extractDocumentBody(tex: string): string {
  const begin = tex.indexOf("\\begin{document}");
  const end = tex.indexOf("\\end{document}");
  if (begin !== -1 && end !== -1 && end > begin) {
    return tex.slice(begin + "\\begin{document}".length, end);
  }
  return tex;
}

function wrapAsDocument(body: string): string {
  if (body.includes("\\begin{document}")) return body;
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\begin{document}
${body}
\\end{document}`;
}

interface ExpandState {
  contentMap: Map<string, string>;
  lineMap: SourceLineMapping[];
  includedFiles: string[];
  visiting: Set<string>;
}

/** Legacy short names used in older lesson .tex orchestration files. */
const LEGACY_INPUT_ALIASES: Record<string, string> = {
  "learning-objectives": "objectives",
  objectives: "objectives",
  "objectives-01": "objectives",
  "topics-01": "topics",
  "coding-lab-01": "coding-lab-01",
};

function normalizeLessonSlug(raw: string): string {
  const m = raw.match(/lesson[\s_-]*0*(\d+)/i);
  if (!m) return raw.replace(/\s+/g, "-").toLowerCase();
  return `lesson-${String(m[1]).padStart(2, "0")}`;
}

function lessonContextFromSource(
  sourcePath: string
): { lessonId: string; lessonDir: string } | null {
  const normalized = normalizeProjectPath(sourcePath);
  const asLessonFile = normalized.match(/^(.*\/)(lesson[\s_-]*\d+)\.tex$/i);
  if (asLessonFile) {
    const lessonId = normalizeLessonSlug(asLessonFile[2]);
    const parent = asLessonFile[1];
    const lessonDir = `${parent}${lessonId}`;
    return { lessonId, lessonDir };
  }
  const insideLesson = normalized.match(/^(.*\/lesson[\s_-]*\d+)\/[^/]+\.tex$/i);
  if (insideLesson) {
    const lessonDir = insideLesson[1].replace(/(lesson)[\s_-]*(\d+)/i, (_, _p, n) => `lesson-${String(n).padStart(2, "0")}`);
    const lessonId = lessonDir.match(/lesson-\d+$/i)?.[0];
    if (lessonId) return { lessonId, lessonDir };
  }
  return null;
}

function inputRefVariants(ref: string): string[] {
  const variants = new Set<string>([ref]);
  const lower = ref.toLowerCase();
  const aliased = LEGACY_INPUT_ALIASES[lower];
  if (aliased) variants.add(aliased);
  variants.add(ref.replace(/\s+/g, "-").toLowerCase());
  variants.add(ref.replace(/\s+/g, "").toLowerCase());

  const withoutNumSuffix = lower.replace(/-\d+$/, "");
  if (withoutNumSuffix !== lower) variants.add(withoutNumSuffix);

  const questionMatch = lower.match(/^question-(\d+)$/);
  if (questionMatch) {
    const n = questionMatch[1];
    variants.add(`quiz-q-${n.padStart(2, "0")}`);
    variants.add(`quiz-q-${n}`);
  }

  const quizQMatch = lower.match(/^quiz-q-(\d+)$/);
  if (quizQMatch) {
    const n = quizQMatch[1];
    variants.add(`question-${n.padStart(2, "0")}`);
    variants.add(`question-${n}`);
  }

  return [...variants];
}

function buildIncludeCandidates(
  ref: string,
  sourcePath: string,
  contentMap: Map<string, string>
): string[] {
  const normalizedSource = normalizeProjectPath(sourcePath);
  const sourceDir = normalizedSource.replace(/\/[^/]+$/, "");
  const lessonCtx = lessonContextFromSource(normalizedSource);
  const candidates: string[] = [];

  for (const variant of inputRefVariants(ref)) {
    candidates.push(
      resolveInputPath(`${sourceDir}/${variant}`),
      resolveInputPath(variant.startsWith("/") ? variant : `/${variant}`),
      resolveInputPath(variant)
    );
    if (lessonCtx) {
      candidates.push(resolveInputPath(`${lessonCtx.lessonDir}/${variant}`));
      if (!variant.includes("/")) {
        candidates.push(resolveInputPath(`${sourceDir}/${lessonCtx.lessonId}/${variant}`));
      }
    }
  }

  if (lessonCtx) {
    const refBase = ref.replace(/\.tex$/i, "").split("/").pop()!.toLowerCase().replace(/\s+/g, "-");
    for (const [path] of contentMap) {
      if (!path.startsWith(`${lessonCtx.lessonDir}/`)) continue;
      const base = path
        .slice(lessonCtx.lessonDir.length + 1)
        .replace(/\.tex$/i, "")
        .toLowerCase();
      if (
        base === refBase ||
        base === LEGACY_INPUT_ALIASES[refBase] ||
        base.replace(/-/g, "") === refBase.replace(/-/g, "")
      ) {
        candidates.push(normalizeProjectPath(path));
      }
    }
  }

  return [...new Set(candidates)];
}

function expandInputs(
  sourcePath: string,
  content: string,
  state: ExpandState,
  forPdf: boolean
): string {
  const normalizedSource = normalizeProjectPath(sourcePath);
  if (state.visiting.has(normalizedSource)) {
    throw new Error(`Circular include detected: ${normalizedSource}`);
  }
  state.visiting.add(normalizedSource);
  state.includedFiles.push(normalizedSource);

  const body = extractDocumentBody(content);
  const lines = body.split("\n");
  const outLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let remainder = line;

    while (remainder.length > 0) {
      const inputMatch = remainder.match(/\\(?:input|include)\s*\{([^}]+)\}/);

      if (!inputMatch || inputMatch.index === undefined) {
        if (remainder.trim()) {
          outLines.push(remainder);
          state.lineMap.push({
            mergedLine: outLines.length,
            sourcePath: normalizedSource,
            sourceLine: i + 1,
          });
        }
        break;
      }

      const before = remainder.slice(0, inputMatch.index);
      if (before.trim()) {
        outLines.push(before);
        state.lineMap.push({
          mergedLine: outLines.length,
          sourcePath: normalizedSource,
          sourceLine: i + 1,
        });
      }

      const ref = inputMatch[1].trim();
      const candidates = buildIncludeCandidates(ref, normalizedSource, state.contentMap);

      let childContent: string | undefined;
      let resolvedPath: string | undefined;
      for (const candidate of candidates) {
        const hit = state.contentMap.get(candidate);
        if (hit != null) {
          childContent = hit;
          resolvedPath = candidate;
          break;
        }
      }

      if (childContent == null || !resolvedPath) {
        throw new Error(`Missing include file: ${ref} (tried ${candidates.join(", ")})`);
      }

      const expanded = expandInputs(resolvedPath, childContent, state, forPdf);
      const expandedLines = expanded.split("\n");
      for (let j = 0; j < expandedLines.length; j++) {
        outLines.push(expandedLines[j]);
        state.lineMap.push({
          mergedLine: outLines.length,
          sourcePath: resolvedPath,
          sourceLine: j + 1,
        });
      }

      remainder = remainder.slice(inputMatch.index + inputMatch[0].length);
    }
  }

  state.visiting.delete(normalizedSource);
  return outLines.join("\n");
}

function stripInputLines(tex: string): string {
  return tex
    .split("\n")
    .map((line) => line.replace(/\\(?:input|include)\s*\{[^}]*\}/g, "").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function findLessonFilePath(
  contentMap: Map<string, string>,
  trackFolder: string,
  modFolder: string,
  lessonFile: string,
  lessonId: string
): string {
  const expected = normalizeProjectPath(`/${trackFolder}/${modFolder}/${lessonFile}`);
  if (contentMap.has(expected)) return expected;
  const prefix = `/${trackFolder}/${modFolder}/`;
  const normalizedId = normalizeLessonSlug(lessonId);
  for (const path of contentMap.keys()) {
    if (!path.startsWith(prefix)) continue;
    if (path === `${prefix}${normalizedId}.tex`) return path;
    if (/lesson[\s_-]*\d+\.tex$/i.test(path)) return path;
  }
  return expected;
}

/**
 * Flatten project .tex files in registry order — used when \\input chains are broken
 * but individual component files exist on disk (source-of-truth compile path).
 */
export function assembleDslFromProjectRegistry(
  files: ProjectFileRecord[],
  project: LuProjectJson
): string {
  const contentMap = filesToContentMap(files);
  repairOrchestrationFromProject(contentMap, project);
  const chunks: string[] = [];

  const metadata = contentMap.get("/metadata.tex");
  if (metadata?.trim()) {
    chunks.push(stripInputLines(extractDocumentBody(metadata)));
  }

  for (const track of project.tracks) {
    const trackPath = normalizeProjectPath(`/${track.folder}/${track.file}`);
    const trackTex = contentMap.get(trackPath);
    if (trackTex?.trim()) chunks.push(stripInputLines(extractDocumentBody(trackTex)));

    for (const mod of track.modules) {
      const modPath = normalizeProjectPath(`/${track.folder}/${mod.folder}/${mod.file}`);
      const modTex = contentMap.get(modPath);
      if (modTex?.trim()) chunks.push(stripInputLines(extractDocumentBody(modTex)));

      for (const lesson of mod.lessons) {
        const lessonPath = findLessonFilePath(
          contentMap,
          track.folder,
          mod.folder,
          lesson.file,
          lesson.id
        );
        const lessonTex = contentMap.get(lessonPath);
        if (lessonTex?.trim()) chunks.push(stripInputLines(extractDocumentBody(lessonTex)));

        for (const comp of lesson.components ?? []) {
          const compPath = normalizeProjectPath(
            comp.file ||
              componentFilePath(track.folder, mod.folder, lesson.id, comp.id, comp.kind)
          );
          const compTex = contentMap.get(compPath);
          if (compTex?.trim()) chunks.push(extractDocumentBody(compTex));

          for (const child of comp.children ?? []) {
            const childKind =
              comp.kind === "quiz"
                ? child.kind === "question" || child.id.startsWith("question") || child.id.startsWith("quiz-q")
                  ? "question"
                  : "question"
                : "resources";
            const childPath = normalizeProjectPath(
              child.file ||
                componentFilePath(track.folder, mod.folder, lesson.id, child.id, childKind)
            );
            const childTex = contentMap.get(childPath);
            if (childTex?.trim()) chunks.push(extractDocumentBody(childTex));
          }
        }
      }
    }
  }

  return wrapAsDocument(chunks.filter(Boolean).join("\n\n"));
}

/** Fix track/module/lesson orchestration .tex before include merge (repairs AI-architect brace/input bugs). */
function repairOrchestrationFilesInMap(
  contentMap: Map<string, string>,
  project: LuProjectJson
): void {
  repairOrchestrationFromProject(contentMap, project);
}

export function resolveProjectIncludesWithFallback(
  files: ProjectFileRecord[],
  options: { forPdf?: boolean } = {}
): ResolvedProjectSource {
  const project = getProjectJsonFromFiles(files);
  try {
    const resolved = resolveProjectIncludes(files, options);
    const needsTrack = (project?.tracks?.length ?? 0) > 0;
    if (needsTrack && !resolved.mergedDsl.includes("\\track{")) {
      throw new Error("Include merge did not produce track content");
    }
    return resolved;
  } catch (primaryErr) {
    if (!project) throw primaryErr;
    console.warn(
      "[LU] Include merge failed, using registry assembly:",
      primaryErr instanceof Error ? primaryErr.message : primaryErr
    );
    const merged = assembleDslFromProjectRegistry(files, project);
    return {
      mergedDsl: merged,
      mergedForPdf: merged,
      lineMap: [],
      includedFiles: [],
      isV2Project: true,
    };
  }
}

export function resolveProjectIncludes(
  files: ProjectFileRecord[],
  options: { forPdf?: boolean } = {}
): ResolvedProjectSource {
  const forPdf = options.forPdf ?? false;
  const contentMap = filesToContentMap(files);
  const v2 = isLuV2Project(files);

  if (!v2) {
    const main =
      contentMap.get("/main.tex") ||
      [...contentMap.entries()].find(([p]) => p.endsWith(".tex"))?.[1] ||
      "";

    const body = extractDocumentBody(main);
    const lineMap: SourceLineMapping[] = body.split("\n").map((_, i) => ({
      mergedLine: i + 1,
      sourcePath: "/main.tex",
      sourceLine: i + 1,
    }));

    return {
      mergedDsl: wrapAsDocument(body),
      mergedForPdf: main.trim() ? main : wrapAsDocument(body),
      lineMap,
      includedFiles: ["/main.tex"],
      isV2Project: false,
    };
  }

  const projectJson = getProjectJsonFromFiles(files);
  if (!projectJson) {
    throw new Error("project.json not found for v2 project");
  }

  repairOrchestrationFilesInMap(contentMap, projectJson);

  const mainPath = normalizeProjectPath(`/${projectJson.compile.mainFile || "main.tex"}`);
  const mainContent = contentMap.get(mainPath);
  if (!mainContent?.trim()) {
    throw new Error("main.tex is empty or missing");
  }

  const state: ExpandState = {
    contentMap,
    lineMap: [],
    includedFiles: [],
    visiting: new Set(),
  };

  const expandedBody = expandInputs(mainPath, mainContent, state, forPdf);
  const mergedForPdf = mainContent.includes("\\begin{document}")
    ? mainContent.replace(
        /\\begin\{document\}[\s\S]*?\\end\{document\}/,
        `\\begin{document}\n${expandedBody}\n\\end{document}`
      )
    : wrapAsDocument(expandedBody);

  return {
    mergedDsl: wrapAsDocument(expandedBody),
    mergedForPdf,
    lineMap: state.lineMap,
    includedFiles: state.includedFiles,
    isV2Project: true,
  };
}

export function mapMergedLineToSource(
  lineMap: SourceLineMapping[],
  mergedLine: number | null
): { sourcePath: string; sourceLine: number } | null {
  if (mergedLine == null || !lineMap.length) return null;
  let best = lineMap[0];
  for (const entry of lineMap) {
    if (entry.mergedLine <= mergedLine) best = entry;
    else break;
  }
  return { sourcePath: best.sourcePath, sourceLine: best.sourceLine };
}

/** Strip project.json from file list when writing merged content is not needed */
export function isGeneratedOrMetaPath(filePath: string): boolean {
  const p = normalizeProjectPath(filePath);
  return p === LU_PROJECT_JSON_PATH || p === "/main.tex";
}
