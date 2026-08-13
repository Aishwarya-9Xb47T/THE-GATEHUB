import { parseLearningUniverseLatex, type ParsedLearningUniverse } from "../controllers/learning-universe-parser.js";
import { buildDslCommandPattern } from "./learningCommandRegistry.js";
import type { LuProjectJson } from "./luProject/luProjectSchema.js";
import type { ProjectFileRecord } from "./luProject/luProjectFiles.js";
import {
  canonicalAssetFilename,
  resolveProjectAssetRef,
} from "./luProject/luProjectAssetResolver.js";
import { renderContentBlockToLatex, type PdfLinkContext } from "../../../shared/lesson-body/dist/contentEngine.js";

export interface LuPdfProjectContext {
  project?: LuProjectJson;
  files?: ProjectFileRecord[];
  /** Pre-compiled parsed universe — document blocks come from compiler, not DSL re-parse. */
  parsed?: ParsedLearningUniverse;
  linkContext?: PdfLinkContext;
}

const DSL_COMMAND_PATTERN = buildDslCommandPattern();

/** Escape plain text for LaTeX body (not in verbatim). */
function esc(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");
}

function escVerbatim(text: string): string {
  return (text || "").replace(/\\/g, "\\textbackslash ").replace(/%/g, "\\%");
}

function escUrl(url: string): string {
  return esc(url);
}

function resolvePdfImageRef(ref: string, files?: ProjectFileRecord[]): string {
  const normalized = ref.replace(/\\/g, "/").trim();
  if (!files?.length) return normalized;
  const resolved = resolveProjectAssetRef(ref, files);
  if (!resolved) return normalized;
  return resolved.path.replace(/^\//, "") || canonicalAssetFilename(ref, resolved);
}

function renderGraphicsForPdf(
  ref: string,
  options: string | undefined,
  centered: boolean,
  files?: ProjectFileRecord[]
): string {
  const outRef = resolvePdfImageRef(ref, files);
  const optPart = options?.trim() ? `[${options.trim()}]` : "";
  const cmd = `\\includegraphics${optPart}{${outRef}}`;
  return centered ? `\\begin{center}\n${cmd}\n\\end{center}\n\n` : `${cmd}\n\n`;
}

function renderPlainParagraphs(text: string, watchUrl?: string): string {
  const lines = text.split(/\r?\n/);
  let out = "";
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) {
      if (inList) {
        out += "\\end{itemize}\n\n";
        inList = false;
      }
      continue;
    }
    const watchMatch = t.match(/^-?\s*Watch:\s*(.+?)(?:\s*\([^)]*\))?$/i);
    if (watchMatch && watchUrl) {
      if (!inList) {
        out += "\\begin{itemize}\n";
        inList = true;
      }
      const label = watchMatch[1].trim();
      out += `  \\item \\href{${escUrl(watchUrl)}}{Watch: ${esc(label)}}\n`;
      continue;
    }
    if (t.startsWith("- ")) {
      if (!inList) {
        out += "\\begin{itemize}\n";
        inList = true;
      }
      out += `  \\item ${esc(t.slice(2))}\n`;
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      if (!inList) {
        out += "\\begin{itemize}\n";
        inList = true;
      }
      out += `  \\item ${esc(t.replace(/^\d+\.\s*/, ""))}\n`;
      continue;
    }
    if (inList) {
      out += "\\end{itemize}\n\n";
      inList = false;
    }
    out += `${esc(t)}\n\n`;
  }
  if (inList) out += "\\end{itemize}\n\n";
  return out;
}

/** Render course metadata prose (not lesson AST). */
function renderOverview(text: string, _files?: ProjectFileRecord[]): string {
  return renderPlainParagraphs(text);
}

function resolveLessonIdForTitle(project: LuProjectJson | undefined, lessonTitle: string): string | undefined {
  if (!project?.tracks?.length) return undefined;
  const normalized = lessonTitle.trim().toLowerCase();
  for (const track of project.tracks) {
    for (const mod of track.modules ?? []) {
      for (const lesson of mod.lessons ?? []) {
        if (lesson.title?.trim().toLowerCase() === normalized) return lesson.id;
      }
    }
  }
  return undefined;
}

function renderContentBlock(
  block: { type: string; content: unknown },
  files?: ProjectFileRecord[],
  linkCtx?: PdfLinkContext,
  blockIndex = 0,
  lessonId?: string
): string {
  return renderContentBlockToLatex(block, (ref) => resolvePdfImageRef(ref, files), linkCtx, blockIndex, lessonId);
}

export function renderParsedUniverseToLatex(
  parsed: ParsedLearningUniverse,
  files?: ProjectFileRecord[],
  projectContext?: LuPdfProjectContext
): string {
  const parts: string[] = [];

  parts.push("\\section*{Course Overview}\n");
  parts.push(`\\textbf{Title:} ${esc(parsed.universe.title)}\n\n`);
  if (parsed.universe.description) {
    parts.push(`${renderOverview(parsed.universe.description, files)}`);
  }
  if (parsed.universe.difficulty) {
    parts.push(`\\textbf{Difficulty:} ${esc(parsed.universe.difficulty)}\n\n`);
  }
  if (parsed.universe.estimatedHours) {
    parts.push(`\\textbf{Estimated Hours:} ${parsed.universe.estimatedHours}\n\n`);
  }
  if (parsed.universe.skills?.length) {
    parts.push(`\\textbf{Skills:} ${esc(parsed.universe.skills.join(", "))}\n\n`);
  }

  for (const track of parsed.tracks) {
    parts.push(`\\section{${esc(track.title)}}\n`);
    if (track.description) parts.push(`${renderOverview(track.description, files)}`);

    for (const mod of track.modules) {
      parts.push(`\\subsection{${esc(mod.title)}}\n`);
      if (mod.description) parts.push(`${renderOverview(mod.description, files)}`);
      if (mod.estimatedHours) parts.push(`\\textbf{Estimated Hours:} ${mod.estimatedHours}\n\n`);

      for (const lesson of mod.lessons) {
        parts.push(`\\subsubsection{${esc(lesson.title)}}\n`);

        const lessonId =
          resolveLessonIdForTitle(projectContext?.project, lesson.title) ?? projectContext?.linkContext?.lessonId;
        const lessonLinkCtx: PdfLinkContext | undefined = projectContext?.linkContext
          ? { ...projectContext.linkContext, lessonTitle: lesson.title, lessonId }
          : undefined;

        lesson.contentBlocks.forEach((block, blockIndex) => {
          const rendered = renderContentBlock(block, files, lessonLinkCtx, blockIndex, lessonId);
          if (rendered) parts.push(rendered);
        });

        if (lesson.quiz && !lesson.contentBlocks.some((b) => b.type === "quiz")) {
          parts.push(
            renderContentBlock(
              { type: "quiz", content: lesson.quiz },
              files,
              lessonLinkCtx,
              lesson.contentBlocks.length,
              lessonId
            )
          );
        }
        if (lesson.practice && !lesson.contentBlocks.some((b) => b.type === "practice")) {
          parts.push(
            renderContentBlock(
              { type: "practice", content: lesson.practice },
              files,
              lessonLinkCtx,
              lesson.contentBlocks.length + 1,
              lessonId
            )
          );
        }
      }
    }
  }

  return parts.join("\n");
}

function isInsideLatexComment(text: string, index: number): boolean {
  let lineStart = text.lastIndexOf("\n", index - 1);
  lineStart = lineStart === -1 ? 0 : lineStart + 1;
  const beforeMatch = text.slice(lineStart, index);
  for (let i = beforeMatch.length - 1; i >= 0; i--) {
    if (beforeMatch[i] === "%" && (i === 0 || beforeMatch[i - 1] !== "\\")) {
      return true;
    }
  }
  return false;
}

function stripDslBlocks(body: string): string {
  let result = body;
  let match: RegExpExecArray | null;
  DSL_COMMAND_PATTERN.lastIndex = 0;
  const spans: Array<{ start: number; end: number }> = [];

  while ((match = DSL_COMMAND_PATTERN.exec(body)) !== null) {
    if (isInsideLatexComment(body, match.index)) continue;
    const openBrace = match.index + match[0].length - 1;
    const close = findBraceClose(body, openBrace);
    if (close !== -1) spans.push({ start: match.index, end: close + 1 });
  }

  for (let i = spans.length - 1; i >= 0; i--) {
    result = result.slice(0, spans[i].start) + result.slice(spans[i].end);
  }
  return result;
}

function findBraceClose(text: string, openIndex: number): number {
  if (text[openIndex] !== "{") return -1;
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Replace Learning Universe DSL blocks with printable LaTeX sections. */
export function expandLearningUniverseForPdf(
  latexCode: string,
  projectContext?: LuPdfProjectContext
): string {
  const beginTag = "\\begin{document}";
  const endTag = "\\end{document}";
  const beginIdx = latexCode.indexOf(beginTag);
  const endIdx = latexCode.lastIndexOf(endTag);
  if (beginIdx === -1 || endIdx === -1) return latexCode;

  const parsed = projectContext?.parsed ?? parseLearningUniverseLatex(latexCode);
  if (!parsed.tracks.length) return latexCode;

  const preamble = latexCode.slice(0, beginIdx);
  const body = latexCode.slice(beginIdx + beginTag.length, endIdx);
  const rendered = renderParsedUniverseToLatex(parsed, projectContext?.files, projectContext);

  const pdfPackages = `
\\usepackage{tcolorbox}
\\tcbuselibrary{skins,breakable}
\\usepackage{enumitem}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true,linkcolor=blue,urlcolor=blue}
`;

  let updatedPreamble = preamble;
  if (!updatedPreamble.includes("tcolorbox")) {
    const insertAt = updatedPreamble.lastIndexOf("\\usepackage");
    if (insertAt !== -1) {
      const lineEnd = updatedPreamble.indexOf("\n", insertAt);
      const pos = lineEnd === -1 ? updatedPreamble.length : lineEnd + 1;
      updatedPreamble = updatedPreamble.slice(0, pos) + pdfPackages + updatedPreamble.slice(pos);
    } else {
      updatedPreamble += pdfPackages;
    }
  }

  return `${updatedPreamble}${beginTag}\n${rendered}\n${endTag}`;
}
