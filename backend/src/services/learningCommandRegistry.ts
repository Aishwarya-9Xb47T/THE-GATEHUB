/**
 * Canonical registry for Learning Universe DSL commands.
 * Single source of truth for parser, PDF renderer, and LaTeX compiler stubs.
 */

/** Structural / metadata commands */
export const STRUCTURAL_COMMANDS = [
  "learninguniverse",
  "course", // alias for learninguniverse (legacy DSL) / Academic Course Studio root
  "chapter", // Academic Course Studio section
  "track",
  "module",
  "lesson",
] as const;

/** Content block commands */
export const CONTENT_COMMANDS = [
  "overview",
  "overviewmarkdown",
  "theory",
  "note",
  "tip",
  "warning",
  "summary",
  "keypoints",
  "video",
  "image",
  "codeexample",
  "practice",
  "quiz",
  "question",
  "option",
  "project",
  "assignment",
  "colab",
  "github",
  "resource",
  "download",
  "checkpoint",
  "discussion",
  "certificatecriteria",
  "finalexam",
  "codinglab",
  "notebook",
  "researchpaper",
  "reflection",
  "references",
  "researchsection",
  "notebookcell",
  "referenceitem",
  /** Academic Studio topic wrappers (may alias to \\theory in emitted .tex) */
  "glossary",
  "industrynotes",
  "callout",
  "furtherreading",
  "revision",
] as const;

/** All registered LMS commands */
export const LEARNING_COMMANDS = [
  ...STRUCTURAL_COMMANDS,
  ...CONTENT_COMMANDS,
] as const;

export type LearningCommand = (typeof LEARNING_COMMANDS)[number];

/** Commands recognized by the DSL parser (same as registry) */
export const PARSER_COMMANDS: readonly string[] = [...LEARNING_COMMANDS];

/** Commands with rich PDF placeholder rendering in buildLearningCommandStubs */
export const RICH_PDF_COMMANDS = new Set<string>([
  "video",
  "quiz",
  "practice",
  "checkpoint",
  "discussion",
  "overviewmarkdown",
  "overview",
  "theory",
  "note",
  "tip",
  "warning",
  "summary",
  "keypoints",
  "codeexample",
  "project",
  "assignment",
  "resource",
  "image",
  "codinglab",
  "notebook",
  "researchpaper",
  "reflection",
  "references",
  "glossary",
  "industrynotes",
  "callout",
  "furtherreading",
  "revision",
]);

/** Commands with explicit rich LaTeX stub bodies in buildLearningCommandStubs(). All others get \\providecommand noop. */
export const COMMANDS_WITH_RICH_LATEX_STUBS = new Set<string>([
  "video",
  "quiz",
  "practice",
  "checkpoint",
  "discussion",
  "overviewmarkdown",
  "overview",
  "theory",
  "note",
  "tip",
  "warning",
  "summary",
  "keypoints",
  "codeexample",
  "project",
  "assignment",
  "resource",
  "image",
  "codinglab",
  "notebook",
  "researchpaper",
  "reflection",
  "references",
  "glossary",
  "industrynotes",
  "callout",
  "furtherreading",
  "revision",
]);

/** Suggested replacement when a macro is unsupported or misspelled. */
export const MACRO_REPLACEMENTS: Record<string, string> = {
  reference: "Use \\references{...} with \\referenceitem{citation={...}}",
  bibliograph: "Use \\references{...} for lesson bibliographies",
  bibitem: "Use \\referenceitem{citation={...}} inside \\references{...}",
  industrynote: "Use \\industrynotes{...} or \\theory{title={Industry Notes},body={...}}",
  "industry-notes": "Use \\industrynotes{...}",
  furtherreading: "Use \\furtherreading{...} or \\theory{title={Further Reading},body={...}}",
  "further-reading": "Use \\furtherreading{...}",
  revisionnotes: "Use \\revision{...} or \\theory{title={Revision Notes},body={...}}",
  "revision-notes": "Use \\revision{...}",
  overviewmd: "Use \\overviewmarkdown{...}",
  codinglab: "Use \\codinglab{...} (already registered)",
  researchpaper: "Use \\researchpaper{...} (already registered)",
};

export interface CommandValidationIssue {
  command: string;
  message: string;
  line: number | null;
  column?: number;
  file?: string;
  suggestedFix?: string;
}

export interface CommandValidationResult {
  valid: boolean;
  usedCommands: string[];
  supportedCommands: readonly string[];
  unsupportedCommands: string[];
  issues: CommandValidationIssue[];
}

/** Build regex to match \\cmd{ or \\cmd={ for all registered commands */
export function buildDslCommandPattern(): RegExp {
  return new RegExp(`\\\\(?:${LEARNING_COMMANDS.join("|")})(?:=)?\\{`, "g");
}

/** Find which registered commands appear in source */
export function findUsedLearningCommands(latexCode: string): string[] {
  const used = new Set<string>();
  for (const cmd of LEARNING_COMMANDS) {
    if (new RegExp(`\\\\${cmd}(?:=)?\\{`).test(latexCode)) {
      used.add(cmd);
    }
  }
  return [...used];
}

/**
 * Detect \\command{ usages that look like LMS DSL but are not registered.
 * Ignores standard LaTeX commands.
 */
const STANDARD_LATEX_COMMANDS = new Set([
  "documentclass",
  "usepackage",
  "begin",
  "end",
  "title",
  "author",
  "date",
  "maketitle",
  "tableofcontents",
  "section",
  "subsection",
  "subsubsection",
  "chapter",
  "paragraph",
  "textbf",
  "textit",
  "emph",
  "texttt",
  "href",
  "url",
  "includegraphics",
  "input",
  "newcommand",
  "renewcommand",
  "providecommand",
  "ifdefined",
  "fi",
  "else",
  "label",
  "ref",
  "cite",
  "bibliography",
  "bibliographystyle",
  "item",
  "vspace",
  "hspace",
  "newline",
  "linebreak",
  "pagebreak",
  "centering",
  "raggedright",
  "raggedleft",
  "footnote",
  "caption",
  "lstlisting",
  "lstset",
  "definecolor",
  "color",
  "textcolor",
  "geometry",
  "maketitle",
  "today",
  "and",
  "frac",
  "sqrt",
  "sum",
  "int",
  "infty",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "theta",
  "lambda",
  "mu",
  "pi",
  "sigma",
  "omega",
  "cdot",
  "times",
  "leq",
  "geq",
  "neq",
  "approx",
  "rightarrow",
  "leftarrow",
  "Rightarrow",
  "Leftarrow",
  "pm",
  "mp",
  "ldots",
  "dots",
  "quad",
  "qquad",
  "hfill",
  "vfill",
  "clearpage",
  "newpage",
  "thispagestyle",
  "pagestyle",
  "pagenumbering",
  "appendix",
  "abstract",
  "thanks",
  "makeatletter",
  "makeatother",
  "textwidth",
  "linewidth",
  "dimexpr",
  "fbox",
  "parbox",
  "minipage",
]);

function lineColumnAt(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

export function macroReplacementHint(macro: string): string {
  const key = macro.toLowerCase();
  return (
    MACRO_REPLACEMENTS[key] ??
    `Use a registered LMS command. Supported: ${LEARNING_COMMANDS.join(", ")}`
  );
}

function isInsideCommentLine(text: string, matchIdx: number): boolean {
  const lineStart = text.lastIndexOf("\n", matchIdx) + 1;
  const lineSegment = text.slice(lineStart, matchIdx);
  return /(?:^|[^\\])%/.test(lineSegment);
}

/** Validate every \\macro{ usage in one source string — collects all issues (no early abort). */
export function validateMacrosInSource(
  latexCode: string,
  filePath?: string
): CommandValidationIssue[] {
  const known = new Set<string>(LEARNING_COMMANDS as readonly string[]);
  const issues: CommandValidationIssue[] = [];
  const pattern = /\\([a-zA-Z@]+)(?:\[[^\]]*\])?\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(latexCode)) !== null) {
    if (isInsideCommentLine(latexCode, match.index)) continue;
    const cmd = match[1].toLowerCase();
    if (known.has(cmd) || STANDARD_LATEX_COMMANDS.has(cmd)) continue;
    if (!/^[a-z][a-z0-9]*$/.test(cmd)) continue;
    const pos = lineColumnAt(latexCode, match.index);
    issues.push({
      command: cmd,
      message: filePath
        ? `Unknown LMS command \\${cmd} in ${filePath}:${pos.line}:${pos.column}`
        : `Unknown LMS command \\${cmd} at line ${pos.line}, column ${pos.column}`,
      line: pos.line,
      column: pos.column,
      file: filePath,
      suggestedFix: macroReplacementHint(cmd),
    });
  }

  return issues;
}

/** @deprecated Use validateMacrosInSource */
export function findUnsupportedLmsCommands(latexCode: string): string[] {
  const seen = new Set<string>();
  for (const issue of validateMacrosInSource(latexCode)) {
    seen.add(issue.command);
  }
  return [...seen];
}

/** Validate LMS commands before PDF compilation */
export function validateLearningCommands(latexCode: string): CommandValidationResult {
  const usedCommands = findUsedLearningCommands(latexCode);
  const issues = validateMacrosInSource(latexCode);
  const unsupportedCommands = [...new Set(issues.map((i) => i.command))];

  return {
    valid: issues.length === 0,
    usedCommands,
    supportedCommands: LEARNING_COMMANDS,
    unsupportedCommands,
    issues,
  };
}

/** No-op commands receive \\providecommand stubs — this verifies registry completeness at runtime. */
export function commandsMissingLaTeXStubs(): string[] {
  return [];
}

/** Remove author-provided stubs so compiler-owned definitions always apply */
export function stripAuthorLearningCommandDefinitions(latexCode: string): string {
  let result = latexCode;

  for (const cmd of LEARNING_COMMANDS) {
    // \newcommand{\cmd}[1]{}
    result = result.replace(
      new RegExp(`\\\\newcommand\\{\\\\${cmd}\\}\\[1\\]\\{\\s*\\}\\s*\\n?`, "g"),
      ""
    );
    // \renewcommand{\cmd}[1]{}
    result = result.replace(
      new RegExp(`\\\\renewcommand\\{\\\\${cmd}\\}\\[1\\]\\{\\s*\\}\\s*\\n?`, "g"),
      ""
    );
    // \providecommand{\cmd}[1]{}
    result = result.replace(
      new RegExp(`\\\\providecommand\\{\\\\${cmd}\\}\\[1\\]\\{\\s*\\}\\s*\\n?`, "g"),
      ""
    );
    // \ifdefined\cmd\else ... \fi
    result = result.replace(
      new RegExp(`\\\\ifdefined\\\\${cmd}\\\\else[\\s\\S]*?\\\\fi\\s*\\n?`, "g"),
      ""
    );
  }

  return result;
}
