/**
 * LaTeX Validator and Self-Healing Repair Engine Module
 * Inspects LaTeX source code for common compilation errors and automatically
 * repairs them before sending to pdfLaTeX or rendering in the Research Workspace.
 */

export interface LatexValidationResult {
  valid: boolean;
  errors: string[];
  repairedTex: string;
  wasRepaired: boolean;
}

/** Validate LaTeX document structure and auto-repair common syntax errors */
export function validateAndRepairLatex(tex: string): LatexValidationResult {
  if (!tex || typeof tex !== "string") {
    return {
      valid: false,
      errors: ["Empty LaTeX source"],
      repairedTex: "\\documentclass{article}\n\\begin{document}\nEmpty document.\n\\end{document}",
      wasRepaired: true,
    };
  }

  const errors: string[] = [];
  let repaired = tex;
  let wasRepaired = false;

  // 1. Ensure \documentclass and \begin{document} / \end{document} exist
  if (!repaired.includes("\\documentclass")) {
    repaired = `\\documentclass[11pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n\n${repaired}`;
    wasRepaired = true;
    errors.push("Missing \\documentclass - prepended standard preamble");
  }

  if (!repaired.includes("\\begin{document}")) {
    const docClassEndIdx = repaired.indexOf("\\documentclass");
    const nextLineIdx = repaired.indexOf("\n", docClassEndIdx);
    if (nextLineIdx !== -1) {
      repaired = repaired.slice(0, nextLineIdx + 1) + "\\begin{document}\n" + repaired.slice(nextLineIdx + 1);
    } else {
      repaired = repaired + "\n\\begin{document}\n";
    }
    wasRepaired = true;
    errors.push("Missing \\begin{document} - auto-inserted");
  }

  if (!repaired.includes("\\end{document}")) {
    repaired = repaired.trimEnd() + "\n\n\\end{document}\n";
    wasRepaired = true;
    errors.push("Missing \\end{document} - auto-appended");
  }

  // 2. Fix unescaped alignment tabs (&) outside tabular/matrix environments
  const sanitizedTabs = fixUnescapedAlignmentTabs(repaired);
  if (sanitizedTabs !== repaired) {
    repaired = sanitizedTabs;
    wasRepaired = true;
    errors.push("Repaired unescaped alignment tab character &");
  }

  // 3. Fix unescaped Markdown remnants (**bold**, ## Header, etc.)
  const sanitizedMarkdown = fixMarkdownRemnants(repaired);
  if (sanitizedMarkdown !== repaired) {
    repaired = sanitizedMarkdown;
    wasRepaired = true;
    errors.push("Converted unescaped Markdown syntax to LaTeX commands");
  }

  // 4. Fix mismatched environments (\begin{foo} without \end{foo})
  const environmentRepairs = fixMismatchedEnvironments(repaired);
  if (environmentRepairs !== repaired) {
    repaired = environmentRepairs;
    wasRepaired = true;
    errors.push("Repaired mismatched \\begin / \\end environment pairs");
  }

  // 5. Fix unbalanced curly braces { }
  const braceRepairs = fixUnbalancedBraces(repaired);
  if (braceRepairs !== repaired) {
    repaired = braceRepairs;
    wasRepaired = true;
    errors.push("Repaired unbalanced curly braces { }");
  }

  return {
    valid: errors.length === 0,
    errors,
    repairedTex: repaired,
    wasRepaired,
  };
}

/** Fix unescaped & outside tabular/matrix/align environments */
function fixUnescapedAlignmentTabs(tex: string): string {
  const lines = tex.split("\n");
  let inTabularOrAlign = false;
  let inVerbatim = false;

  const resultLines = lines.map((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("\\begin{verbatim}") || trimmed.startsWith("\\begin{lstlisting}")) {
      inVerbatim = true;
      return line;
    }
    if (trimmed.startsWith("\\end{verbatim}") || trimmed.startsWith("\\end{lstlisting}")) {
      inVerbatim = false;
      return line;
    }
    if (inVerbatim) return line;

    if (
      trimmed.startsWith("\\begin{tabular}") ||
      trimmed.startsWith("\\begin{align}") ||
      trimmed.startsWith("\\begin{matrix}") ||
      trimmed.startsWith("\\begin{pmatrix}") ||
      trimmed.startsWith("\\begin{bmatrix}")
    ) {
      inTabularOrAlign = true;
      return line;
    }
    if (
      trimmed.startsWith("\\end{tabular}") ||
      trimmed.startsWith("\\end{align}") ||
      trimmed.startsWith("\\end{matrix}") ||
      trimmed.startsWith("\\end{pmatrix}") ||
      trimmed.startsWith("\\end{bmatrix}")
    ) {
      inTabularOrAlign = false;
      return line;
    }

    if (inTabularOrAlign) return line;

    // Replace & with \& if not preceded by \
    return line.replace(/(?<!\\)&/g, "\\&");
  });

  return resultLines.join("\n");
}

/** Convert raw markdown remnants in LaTeX document into proper LaTeX commands */
function fixMarkdownRemnants(tex: string): string {
  let cleaned = tex;

  // Convert **text** to \textbf{text}
  cleaned = cleaned.replace(/(?<!\\)\*\*([^*]+)\*\*/g, "\\textbf{$1}");

  // Convert __text__ to \textbf{text}
  cleaned = cleaned.replace(/(?<!\\)__([^_]+)__/g, "\\textbf{$1}");

  // Convert `code` to \texttt{code}
  cleaned = cleaned.replace(/`([^`]+)`/g, "\\texttt{$1}");

  return cleaned;
}

/** Track and auto-close missing \end{env} environments */
function fixMismatchedEnvironments(tex: string): string {
  const beginRegex = /\\begin\{([a-zA-Z0-9*]+)\}/g;
  const endRegex = /\\end\{([a-zA-Z0-9*]+)\}/g;

  const stack: string[] = [];
  let match: RegExpExecArray | null;

  // Simple token scan
  const tokens: Array<{ type: "begin" | "end"; name: string; index: number }> = [];
  while ((match = beginRegex.exec(tex)) !== null) {
    tokens.push({ type: "begin", name: match[1], index: match.index });
  }
  while ((match = endRegex.exec(tex)) !== null) {
    tokens.push({ type: "end", name: match[1], index: match.index });
  }

  tokens.sort((a, b) => a.index - b.index);

  for (const token of tokens) {
    if (token.type === "begin") {
      stack.push(token.name);
    } else if (token.type === "end") {
      if (stack.length > 0 && stack[stack.length - 1] === token.name) {
        stack.pop();
      }
    }
  }

  // If stack has unclosed environments (excluding document which is handled separately)
  if (stack.length > 0) {
    let appends = "";
    const docEndIndex = tex.indexOf("\\end{document}");
    
    for (let i = stack.length - 1; i >= 0; i--) {
      const envName = stack[i];
      if (envName !== "document") {
        appends += `\\end{${envName}}\n`;
      }
    }

    if (appends) {
      if (docEndIndex !== -1) {
        return tex.slice(0, docEndIndex) + appends + tex.slice(docEndIndex);
      }
      return tex + "\n" + appends;
    }
  }

  return tex;
}

/** Balance opening and closing curly braces */
function fixUnbalancedBraces(tex: string): string {
  let openCount = 0;
  let inEscape = false;
  let inComment = false;

  for (let i = 0; i < tex.length; i++) {
    const char = tex[i];
    if (char === "\n") {
      inComment = false;
      inEscape = false;
      continue;
    }
    if (inComment) continue;

    if (char === "\\") {
      inEscape = !inEscape;
      continue;
    }

    if (!inEscape) {
      if (char === "%") {
        inComment = true;
      } else if (char === "{") {
        openCount++;
      } else if (char === "}") {
        openCount--;
      }
    } else {
      inEscape = false;
    }
  }

  let result = tex;
  if (openCount > 0) {
    // Append missing closing braces before \end{document}
    const docEndIdx = result.indexOf("\\end{document}");
    const closingBraces = "}".repeat(openCount);
    if (docEndIdx !== -1) {
      result = result.slice(0, docEndIdx) + closingBraces + "\n" + result.slice(docEndIdx);
    } else {
      result = result + closingBraces;
    }
  }

  return result;
}
