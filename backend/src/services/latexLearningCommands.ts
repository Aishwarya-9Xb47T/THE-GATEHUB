/**
 * Learning DSL commands that must compile to PDF without breaking standard LaTeX.
 * Registry: learningCommandRegistry.ts (kept in sync with learning-universe-parser.ts).
 */

import { expandLearningUniverseForPdf, type LuPdfProjectContext } from "./latexPdfRenderer.js";
import { sanitizeForListings } from "./luProject/luTexEscape.js";
import {
  LEARNING_COMMANDS,
  COMMANDS_WITH_RICH_LATEX_STUBS,
  stripAuthorLearningCommandDefinitions,
  validateLearningCommands,
  type CommandValidationResult,
} from "./learningCommandRegistry.js";

export type { LuPdfProjectContext } from "./latexPdfRenderer.js";

export {
  LEARNING_COMMANDS,
  validateLearningCommands,
  type CommandValidationResult,
} from "./learningCommandRegistry.js";

export type LearningCommand = (typeof LEARNING_COMMANDS)[number];

const INJECTED_STUB_MARKER = "% GATEHUB Learning Universe commands (auto-injected)";

const LISTINGS_PREAMBLE = `\\usepackage{listings}
\\usepackage{xcolor}
\\definecolor{codegreen}{rgb}{0,0.6,0}
\\definecolor{codegray}{rgb}{0.5,0.5,0.5}
\\definecolor{codepurple}{rgb}{0.58,0,0.82}
\\definecolor{backcolour}{rgb}{0.95,0.95,0.92}
\\lstset{
    backgroundcolor=\\color{backcolour},
    commentstyle=\\color{codegreen},
    keywordstyle=\\color{magenta},
    numberstyle=\\tiny\\color{codegray},
    stringstyle=\\color{codepurple},
    basicstyle=\\ttfamily\\footnotesize,
    breaklines=true,
    numbers=left,
    tabsize=2
}`;

function hasListingsPackage(latexCode: string): boolean {
  return /\\usepackage(?:\[[^\]]*\])?\{listings\}/.test(latexCode);
}

/** Inject listings + lstset when code blocks appear (after DSL→PDF expansion). */
export function ensureListingsPackage(latexCode: string): string {
  if (!latexCode.includes("lstlisting") || hasListingsPackage(latexCode)) {
    return latexCode;
  }
  return injectIntoPreamble(latexCode, LISTINGS_PREAMBLE);
}

export type { ParsedLatexError, LatexErrorCategory, LatexLogParseResult } from "./latexLogParser.js";
export { parseLatexErrors, parseLatexLog, buildCompileErrorReport } from "./latexLogParser.js";

/** Escape characters that break LaTeX inside learning block bodies (no double-escape). */
export function escapeLearningBlockContent(content: string): string {
  if (!content) return "";

  let result = "";
  let i = 0;
  const len = content.length;

  while (i < len) {
    // Preserve verbatim and lstlisting environments as-is
    if (content.slice(i).startsWith("\\begin{verbatim}") || content.slice(i).startsWith("\\begin{lstlisting}")) {
      const endTag = content.slice(i).startsWith("\\begin{verbatim}") ? "\\end{verbatim}" : "\\end{lstlisting}";
      const endIdx = content.indexOf(endTag, i);
      if (endIdx === -1) {
        result += content.slice(i);
        break;
      }
      result += content.slice(i, endIdx + endTag.length);
      i = endIdx + endTag.length;
      continue;
    }

    // Preserve math environments: \[...\] and $$...$$
    if (content[i] === "\\" && i + 1 < len && content[i + 1] === "[") {
      const endIdx = content.indexOf("\\]", i + 2);
      if (endIdx === -1) {
        result += content.slice(i);
        break;
      }
      result += content.slice(i, endIdx + 2);
      i = endIdx + 2;
      continue;
    }

    // Preserve backslash-escaped characters or TeX commands: \cmd, \&, \#, \%, etc.
    if (content[i] === "\\") {
      let j = i + 1;
      // Read all command name letters: \theory, \documentclass, \section, etc.
      while (j < len && /[a-zA-Z]/.test(content[j])) {
        j++;
      }
      if (j > i + 1) {
        // Full command name matched: \command
        result += content.substring(i, j);
        i = j;
        continue;
      } else {
        // Escaped single character: \&, \#, \%, \_, etc.
        result += content[i];
        if (i + 1 < len) {
          result += content[i + 1];
          i += 2;
          continue;
        }
        i++;
        continue;
      }
    }

    // Escape unescaped alignment tab character & to \& and macro parameter character # to \#
    if (content[i] === "&") {
      result += "\\&";
    } else if (content[i] === "#") {
      result += "\\#";
    } else {
      result += content[i];
    }

    i++;
  }

  return result;
}

/** Insert content into the LaTeX preamble (after documentclass/usepackages, before title). */
export function injectIntoPreamble(latexCode: string, snippet: string): string {
  const trimmed = snippet.trim();
  if (!trimmed) return latexCode;

  const beginTag = "\\begin{document}";
  const beginIdx = latexCode.indexOf(beginTag);
  if (beginIdx === -1) return `${latexCode}\n${trimmed}\n`;

  const preamble = latexCode.slice(0, beginIdx);
  const body = latexCode.slice(beginIdx);

  const titleIdx = preamble.search(/\\title\b/);
  const lastUsepackage = [...preamble.matchAll(/\\usepackage[^\n]*/g)].pop();

  let insertPos = 0;
  if (lastUsepackage?.index !== undefined) {
    const lineEnd = preamble.indexOf("\n", lastUsepackage.index);
    insertPos = lineEnd === -1 ? preamble.length : lineEnd + 1;
  } else {
    const docclass = preamble.match(/\\documentclass[^\n]*/);
    if (docclass?.index !== undefined) {
      const lineEnd = preamble.indexOf("\n", docclass.index);
      insertPos = lineEnd === -1 ? docclass.index + docclass[0].length : lineEnd + 1;
    }
  }

  if (titleIdx !== -1 && insertPos > titleIdx) {
    insertPos = titleIdx;
  }

  return preamble.slice(0, insertPos) + trimmed + "\n" + preamble.slice(insertPos) + body;
}

/** Remove author-provided noop \\newcommand{\\cmd}[1]{} stubs — compile injects rich definitions. */
export function stripNoopLearningCommandDefinitions(latexCode: string): string {
  return stripAuthorLearningCommandDefinitions(latexCode);
}

/**
 * Validate LMS commands, strip author stubs, repair blocks, expand DSL for PDF.
 * Caller must still inject buildLearningCommandStubs() into the preamble.
 */
export function sanitizeLearningCommandsForPdf(
  latexCode: string,
  projectContext?: LuPdfProjectContext
): string {
  let result = stripAuthorLearningCommandDefinitions(latexCode);
  result = repairUnclosedLearningBlocks(result);
  result = expandLearningUniverseForPdf(result, projectContext);

  const beginTag = "\\begin{document}";
  const endTag = "\\end{document}";
  const beginIdx = result.indexOf(beginTag);
  const endIdx = result.lastIndexOf(endTag);

  // Only escape DSL parameter values inside the document body (not injected preamble stubs)
  const escapeStart = beginIdx === -1 ? 0 : beginIdx + beginTag.length;
  const escapeEnd = endIdx === -1 ? result.length : endIdx;
  const beforeBody = result.slice(0, escapeStart);
  const body = result.slice(escapeStart, escapeEnd);
  const afterBody = result.slice(escapeEnd);

  type Span = { innerStart: number; innerEnd: number };
  const spans: Span[] = [];

  for (const cmd of LEARNING_COMMANDS) {
    const pattern = new RegExp(`\\\\${cmd}\\{`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      const openBrace = match.index + match[0].length - 1;
      const closeBrace = findMatchingBrace(body, openBrace);
      if (closeBrace === -1) continue;
      spans.push({ innerStart: openBrace + 1, innerEnd: closeBrace });
    }
  }

  spans.sort((a, b) => b.innerStart - a.innerStart);

  let escapedBody = body;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const inner = escapedBody.slice(span.innerStart, span.innerEnd);
    const sanitized = escapeLearningBlockContent(inner);
    if (sanitized !== inner) {
      const diff = sanitized.length - inner.length;
      escapedBody = escapedBody.slice(0, span.innerStart) + sanitized + escapedBody.slice(span.innerEnd);
      for (let j = i + 1; j < spans.length; j++) {
        if (spans[j].innerStart < span.innerStart && spans[j].innerEnd >= span.innerEnd) {
          spans[j].innerEnd += diff;
        }
      }
    }
  }

  escapedBody = escapedBody.replace(
    /\\(theory|overviewmarkdown|overview|callout|checkpoint|objectives|examples|video|code|formula)([a-zA-Z])/g,
    "\\$1 $2"
  );

  escapedBody = escapedBody.replace(
    /\\title\{([^}]*)\}/g,
    (_, title: string) => `\\title{${escapeLearningBlockContent(title)}}`
  );

  escapedBody = escapedBody.replace(
    /\\begin\{lstlisting\}([\s\S]*?)\\end\{lstlisting\}/g,
    (_match, inner: string) => `\\begin{lstlisting}${sanitizeForListings(inner)}\\end{lstlisting}`
  );

  return beforeBody + escapedBody + afterBody;
}

/**
 * Auto-close unclosed \\track, \\module, and \\lesson blocks before \\end{document}.
 */
export function repairUnclosedLearningBlocks(latexCode: string): string {
  const structural = ["track", "module", "lesson"] as const;
  const endDocTag = "\\end{document}";
  const endIdx = latexCode.lastIndexOf(endDocTag);
  if (endIdx === -1) return latexCode;

  const unclosed: string[] = [];

  for (const cmd of structural) {
    const pattern = new RegExp(`\\\\${cmd}\\{`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(latexCode)) !== null) {
      const openBrace = match.index + match[0].length - 1;
      if (findMatchingBrace(latexCode, openBrace) === -1) {
        unclosed.push(cmd);
      }
    }
  }

  if (unclosed.length === 0) return latexCode;

  const closing = unclosed
    .reverse()
    .map((cmd) => `\n% Auto-closed unclosed \\\\${cmd}\n}`)
    .join("");

  return `${latexCode.slice(0, endIdx)}${closing}\n${latexCode.slice(endIdx)}`;
}

/**
 * Full pre-compile pipeline: validate commands, sanitize DSL, inject LaTeX stubs.
 */
export function prepareLatexForCompilation(
  latexCode: string,
  projectId?: string,
  projectContext?: LuPdfProjectContext
): { code: string; validation: CommandValidationResult } {
  const validation = validateLearningCommands(latexCode);
  // Always sanitize/inject to avoid stale partial stub states causing
  // intermittent "Undefined control sequence" for LMS commands (e.g. \theory).
  let code = sanitizeLearningCommandsForPdf(latexCode, projectContext);
  code = ensureListingsPackage(code);
  code = injectIntoPreamble(code, buildLearningCommandStubs(projectId));
  return { code, validation };
}

function findMatchingBrace(text: string, openIndex: number): number {
  if (text[openIndex] !== "{") return -1;
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function buildLearningCommandStubs(projectId?: string): string {
  const videoUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const resourceBase = projectId
    ? `${videoUrl}/resources/course/${projectId}`
    : videoUrl;

  const noopCommands = LEARNING_COMMANDS.filter(
    (cmd) => !COMMANDS_WITH_RICH_LATEX_STUBS.has(cmd) && cmd !== "course"
  );
  const noopDefs = noopCommands.map((cmd) => `\\providecommand{\\${cmd}}[1]{}`);

  // Legacy alias: \course → \learninguniverse (must come after learninguniverse noop)
  const aliasDefs = `\\providecommand{\\course}[1]{\\learninguniverse{#1}}`;

  const richDefs = `
\\providecommand{\\video}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Video]}\\\\
      \\small\\texttt{#1}
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\quiz}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Quiz]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\practice}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Practice Exercise]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\checkpoint}[1]{%
  \\vspace{0.5em}\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep}{\\textbf{Checkpoint:} #1}}\\vspace{0.5em}%
}
\\providecommand{\\discussion}[1]{%
  \\vspace{0.5em}\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep}{\\textbf{Discussion:} #1}}\\vspace{0.5em}%
}
\\providecommand{\\discussionprompt}[1]{#1}
\\providecommand{\\overviewmarkdown}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Overview}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\overview}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Overview}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\theory}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Theory}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\note}[1]{%
  \\vspace{0.5em}\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep}{\\textbf{Note:} #1}}\\vspace{0.5em}%
}
\\providecommand{\\tip}[1]{%
  \\vspace{0.5em}\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep}{\\textbf{Tip:} #1}}\\vspace{0.5em}%
}
\\providecommand{\\warning}[1]{%
  \\vspace{0.5em}\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep}{\\textbf{Warning:} #1}}\\vspace{0.5em}%
}
\\providecommand{\\summary}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Summary}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\keypoints}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Key Points}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\codeexample}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Code Example]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\project}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Project]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\assignment}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Assignment]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\resource}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Resource]} \\\\ \\href{${resourceBase}}{#1}
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\image}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Image]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\codinglab}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Coding Lab]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\notebook}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Notebook]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\researchpaper}[1]{%
  \\begin{center}
    \\fbox{\\begin{minipage}{0.85\\textwidth}\\centering
      \\textbf{[Research Paper]}\\\\
      \\small #1
    \\end{minipage}}
  \\end{center}%
}
\\providecommand{\\reflection}[1]{%
  \\vspace{0.5em}\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep}{\\textbf{Reflection:} #1}}\\vspace{0.5em}%
}
\\providecommand{\\references}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{References}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\glossary}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Glossary}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\industrynotes}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Industry Notes}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\callout}[1]{%
  \\vspace{0.5em}\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep}{#1}}\\vspace{0.5em}%
}
\\providecommand{\\furtherreading}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Further Reading}\\\\
  #1\\vspace{0.5em}%
}
\\providecommand{\\revision}[1]{%
  \\vspace{0.5em}\\noindent\\textbf{Revision Notes}\\\\
  #1\\vspace{0.5em}%
}
`;

  return `${INJECTED_STUB_MARKER}\n${noopDefs.join("\n")}\n${aliasDefs}\n${richDefs}`;
}

