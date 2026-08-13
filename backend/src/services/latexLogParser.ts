/**
 * Parses pdflatex/latexmk logs and surfaces the FIRST real root-cause error.
 * Ignores terminal "Fatal error occurred" / emergency-stop messages.
 */

export type LatexErrorCategory =
  | "LATEX_SYNTAX"
  | "FILE_NOT_FOUND"
  | "MISSING_COMPONENT"
  | "INVALID_MEDIA"
  | "BROKEN_IMAGE"
  | "BROKEN_VIDEO"
  | "INVALID_TABLE"
  | "INVALID_CODE"
  | "INVALID_UTF8"
  | "BROKEN_REFERENCE"
  | "BROKEN_BIBLIOGRAPHY"
  | "UNKNOWN_MACRO"
  | "DUPLICATE_INPUT"
  | "MISSING_INPUT"
  | "PACKAGE_ERROR"
  | "TIKZ_ERROR"
  | "FATAL_TERMINATION"
  | "OTHER";

export interface ParsedLatexError {
  message: string;
  line: number | null;
  column?: number | null;
  file?: string | null;
  macro?: string | null;
  /** Human-readable label for UI */
  type: string;
  category: LatexErrorCategory;
  raw: string;
  suggestedFix?: string;
  autoRepairAvailable?: boolean;
  autoRepairAction?: string;
  sourceFile?: string;
  sourceLine?: number;
}

export interface LatexLogParseResult {
  errors: ParsedLatexError[];
  /** First non-termination error — the one instructors should fix */
  firstError: ParsedLatexError | null;
  includeOrder: string[];
  failedAtFile: string | null;
}

const TERMINATION_PATTERNS = [
  /fatal error occurred/i,
  /emergency stop/i,
  /job aborted/i,
  /no output pdf file produced/i,
  /==>\s*fatal error/i,
  /tex capacity exceeded/i,
];

const FILE_LINE_ERROR_RE =
  /^(\.?\.?\/?[^:\s][^:]*?\.(?:tex|sty|cls|bib|mp|eps|pdf|png|jpe?g)):(\d+):(?:\d+:)?\s*(.+)$/i;

const INPUT_FILE_RE = /^\(\.?\.?\/?([^)]+\.(?:tex|sty|cls))\s*$/;
const ENTERED_FILE_RE = /^\((\.?\.?\/?[^)]+\.(?:tex|sty|cls))/i;

function normalizeLogPath(raw: string): string {
  let p = raw.trim().replace(/\\/g, "/");
  p = p.replace(/^\.\//, "");
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

function isTerminationMessage(message: string): boolean {
  return TERMINATION_PATTERNS.some((re) => re.test(message));
}

function isWarningLine(line: string): boolean {
  return (
    /^LaTeX Warning:/i.test(line) ||
    /^Package .* Warning:/i.test(line) ||
    /^pdfTeX warning:/i.test(line) ||
    /^Underfull \\hbox/i.test(line) ||
    /^Overfull \\hbox/i.test(line)
  );
}

function extractMacro(context: string): string | null {
  const fromRecent = context.match(/\\[a-zA-Z@]+/);
  return fromRecent?.[0] ?? null;
}

function classifyCategory(message: string, raw: string, macro?: string | null): LatexErrorCategory {
  const text = `${message} ${raw}`;
  if (/undefined control sequence/i.test(text)) return "UNKNOWN_MACRO";
  if (/file not found|can't find file|unable to find file/i.test(text)) {
    if (/\.(png|jpe?g|gif|pdf|eps|svg)/i.test(text)) return "BROKEN_IMAGE";
    if (/\.bib/i.test(text)) return "BROKEN_BIBLIOGRAPHY";
    if (/\.tex/i.test(text)) return "FILE_NOT_FOUND";
    return "MISSING_COMPONENT";
  }
  if (/\\includegraphics|unknown graphics extension|division by 0/i.test(text)) return "BROKEN_IMAGE";
  if (/\\video|\\youtubevideo|invalid media/i.test(text)) return "BROKEN_VIDEO";
  if (/undefined reference|reference.*undefined/i.test(text)) return "BROKEN_REFERENCE";
  if (/undefined citation|citation.*undefined/i.test(text)) return "BROKEN_BIBLIOGRAPHY";
  if (/utf-8|invalid byte|invalid character/i.test(text)) return "INVALID_UTF8";
  if (/package .* error|package .* not found/i.test(text)) return "PACKAGE_ERROR";
  if (/tikz|pgfkeys/i.test(text)) return "TIKZ_ERROR";
  if (/duplicate|\\input.*already/i.test(text)) return "DUPLICATE_INPUT";
  if (/missing \\input|no file/i.test(text)) return "MISSING_INPUT";
  if (/tabular|alignment/i.test(text)) return "INVALID_TABLE";
  if (/verbatim|lstlisting|minted/i.test(text)) return "INVALID_CODE";
  if (
    /missing \$|missing \}|missing \]|missing \\end|extra \}|runaway argument|paragraph ended before|illegal unit|missing number|file ended while scanning/i.test(
      text
    )
  ) {
    return "LATEX_SYNTAX";
  }
  if (isTerminationMessage(message)) return "FATAL_TERMINATION";
  return "OTHER";
}

function humanType(category: LatexErrorCategory, message: string): string {
  const map: Record<LatexErrorCategory, string> = {
    LATEX_SYNTAX: "Syntax Error",
    FILE_NOT_FOUND: "File Not Found",
    MISSING_COMPONENT: "Missing Component",
    INVALID_MEDIA: "Invalid Media",
    BROKEN_IMAGE: "Broken Image",
    BROKEN_VIDEO: "Broken Video",
    INVALID_TABLE: "Table Error",
    INVALID_CODE: "Code Block Error",
    INVALID_UTF8: "UTF-8 Error",
    BROKEN_REFERENCE: "Broken Reference",
    BROKEN_BIBLIOGRAPHY: "Bibliography Error",
    UNKNOWN_MACRO: "Undefined Command",
    DUPLICATE_INPUT: "Duplicate Input",
    MISSING_INPUT: "Missing Input",
    PACKAGE_ERROR: "Package Error",
    TIKZ_ERROR: "TikZ Error",
    FATAL_TERMINATION: "Fatal Error",
    OTHER: "LaTeX Error",
  };
  if (/missing \}/i.test(message)) return "Missing Brace";
  if (/missing \$/i.test(message)) return "Missing Math Delimiter";
  return map[category] ?? "LaTeX Error";
}

const MACRO_REPLACEMENTS: Record<string, string> = {
  "\\youtubevideo": "\\video",
  "\\youtube": "\\video",
  "\\undefined": "(supported LMS macro)",
};

function suggestFixAndRepair(
  category: LatexErrorCategory,
  message: string,
  macro: string | null,
  file: string | null
): { suggestedFix: string; autoRepairAvailable: boolean; autoRepairAction?: string } {
  if (category === "UNKNOWN_MACRO" && macro) {
    const replacement = MACRO_REPLACEMENTS[macro];
    if (replacement) {
      return {
        suggestedFix: `Replace ${macro} with supported macro ${replacement}.`,
        autoRepairAvailable: true,
        autoRepairAction: `replace_macro:${macro}`,
      };
    }
    return {
      suggestedFix: `Undefined command ${macro}. Use a supported LMS macro or remove the command.`,
      autoRepairAvailable: true,
      autoRepairAction: `replace_macro:${macro}`,
    };
  }

  if (category === "FILE_NOT_FOUND" || category === "MISSING_COMPONENT") {
    const hint = file ? `Missing file ${file}.` : "A required component file is missing.";
    return {
      suggestedFix: `${hint} Run Auto Repair to generate the missing component.`,
      autoRepairAvailable: true,
      autoRepairAction: "repair_missing_component",
    };
  }

  if (category === "BROKEN_IMAGE") {
    return {
      suggestedFix: "Upload the image to the project or remove the broken \\includegraphics reference.",
      autoRepairAvailable: true,
      autoRepairAction: "repair_broken_image",
    };
  }

  if (category === "BROKEN_VIDEO") {
    return {
      suggestedFix: "Use \\video{type={youtube|upload|placeholder},...} instead of unsupported video macros.",
      autoRepairAvailable: true,
      autoRepairAction: "repair_broken_video",
    };
  }

  if (category === "BROKEN_BIBLIOGRAPHY") {
    return {
      suggestedFix: "Add missing .bib entries or run Auto Repair to rebuild the bibliography block.",
      autoRepairAvailable: true,
      autoRepairAction: "repair_bibliography",
    };
  }

  if (category === "LATEX_SYNTAX") {
    if (/missing \}/i.test(message)) {
      return {
        suggestedFix: "An opening brace { is not closed. Count braces in this block.",
        autoRepairAvailable: true,
        autoRepairAction: "repair_braces",
      };
    }
    if (/missing \$/i.test(message)) {
      return {
        suggestedFix: "Math mode requires matching $ or \\( \\) delimiters.",
        autoRepairAvailable: false,
      };
    }
    if (/file ended while scanning/i.test(message)) {
      return {
        suggestedFix: "Unclosed brace or environment. Each \\begin{...} needs \\end{...}.",
        autoRepairAvailable: true,
        autoRepairAction: "repair_braces",
      };
    }
    return {
      suggestedFix: "Fix the syntax error at the reported line before recompiling.",
      autoRepairAvailable: true,
      autoRepairAction: "repair_braces",
    };
  }

  if (category === "FATAL_TERMINATION") {
    return {
      suggestedFix: "Compilation stopped. Fix the first error listed above — this message is only the final consequence.",
      autoRepairAvailable: false,
    };
  }

  return {
    suggestedFix: "Open the Logs tab for full compiler output and fix the first reported error.",
    autoRepairAvailable: false,
  };
}

function pushError(
  errors: ParsedLatexError[],
  seen: Set<string>,
  partial: Omit<ParsedLatexError, "type" | "category" | "suggestedFix" | "autoRepairAvailable" | "autoRepairAction"> & {
    message: string;
  }
): void {
  const category = classifyCategory(partial.message, partial.raw, partial.macro);
  const key = `${partial.file ?? ""}:${partial.line ?? ""}:${category}:${partial.message}`;
  if (seen.has(key)) return;
  seen.add(key);

  const { suggestedFix, autoRepairAvailable, autoRepairAction } = suggestFixAndRepair(
    category,
    partial.message,
    partial.macro ?? null,
    partial.file ?? null
  );

  errors.push({
    ...partial,
    category,
    type: humanType(category, partial.message),
    suggestedFix,
    autoRepairAvailable,
    autoRepairAction,
  });
}

/** Extract .tex files opened during compilation (include order). */
export function extractIncludeOrder(logs: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const line of logs.split(/\r?\n/)) {
    const m = line.match(ENTERED_FILE_RE) ?? line.match(INPUT_FILE_RE);
    if (!m) continue;
    const path = normalizeLogPath(m[1]);
    if (seen.has(path)) continue;
    seen.add(path);
    order.push(path);
  }
  return order;
}

/**
 * Parse a complete compiler log and return all errors plus the first real root cause.
 */
export function parseLatexLog(logs: string): LatexLogParseResult {
  const lines = logs.split(/\r?\n/);
  const errors: ParsedLatexError[] = [];
  const seen = new Set<string>();
  let currentFile: string | null = null;
  const includeOrder = extractIncludeOrder(logs);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isWarningLine(line)) continue;

    const entered = line.match(ENTERED_FILE_RE);
    if (entered) {
      currentFile = normalizeLogPath(entered[1]);
      continue;
    }

    const fileLine = line.match(FILE_LINE_ERROR_RE);
    if (fileLine) {
      const file = normalizeLogPath(fileLine[1]);
      const lineNum = Number(fileLine[2]);
      const message = fileLine[3].trim();
      currentFile = file;
      if (!isTerminationMessage(message)) {
        let macro: string | null = null;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          macro = extractMacro(lines[j]);
          if (macro) break;
        }
        pushError(errors, seen, {
          message,
          line: lineNum,
          file,
          macro,
          raw: line,
        });
      }
      continue;
    }

    if (line.startsWith("!")) {
      const message = line.replace(/^!\s*/, "").trim();
      if (isTerminationMessage(message)) continue;

      let lineNum: number | null = null;
      let macro: string | null = extractMacro(line);
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const next = lines[j];
        const lMatch = next.match(/^l\.(\d+)\s*(.*)/);
        if (lMatch) {
          lineNum = Number(lMatch[1]);
          macro = macro ?? extractMacro(lMatch[2] || next);
          break;
        }
        const colMatch = next.match(/^<[^>]+>\s*(.*)/);
        if (colMatch) macro = macro ?? extractMacro(colMatch[1]);
      }

      pushError(errors, seen, {
        message,
        line: lineNum,
        file: currentFile,
        macro,
        raw: line,
      });
      continue;
    }

    if (/undefined control sequence/i.test(line) && !fileLine) {
      pushError(errors, seen, {
        message: line.trim(),
        line: null,
        file: currentFile,
        macro: extractMacro(line),
        raw: line,
      });
    }
  }

  const realErrors = errors.filter((e) => e.category !== "FATAL_TERMINATION");
  const firstError = realErrors[0] ?? null;
  const failedAtFile = firstError?.file ?? currentFile ?? null;

  return {
    errors: realErrors.length > 0 ? realErrors : errors,
    firstError,
    includeOrder,
    failedAtFile,
  };
}

/** Back-compat wrapper — returns errors with first real error first. */
export function parseLatexErrors(logs: string): ParsedLatexError[] {
  const result = parseLatexLog(logs);
  if (result.firstError) {
    const rest = result.errors.filter((e) => e !== result.firstError);
    return [result.firstError, ...rest];
  }
  return result.errors;
}

export function buildCompileErrorReport(
  parseResult: LatexLogParseResult,
  options: {
    compilationTimeMs?: number;
    compileCommands?: string[];
    buildStages?: Array<{ name: string; ok: boolean; detail?: string }>;
  } = {}
): Record<string, unknown> {
  const primary = parseResult.firstError;
  return {
    compilationStarted: true,
    stages: options.buildStages ?? [],
    compiling: !primary,
    primaryError: primary
      ? {
          file: primary.file ?? primary.sourceFile,
          line: primary.line ?? primary.sourceLine,
          column: primary.column,
          category: primary.category,
          type: primary.type,
          message: primary.message,
          macro: primary.macro,
          suggestedFix: primary.suggestedFix,
          autoRepairAvailable: primary.autoRepairAvailable,
          autoRepairAction: primary.autoRepairAction,
        }
      : null,
    includeOrder: parseResult.includeOrder,
    failedAtFile: parseResult.failedAtFile,
    compileCommands: options.compileCommands ?? [],
    compilationTimeMs: options.compilationTimeMs,
  };
}
