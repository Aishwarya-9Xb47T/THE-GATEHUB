/**
 * Backend LaTeX Sanitizer & Markdown-to-LaTeX Converter Module
 * Converts AI-generated text or markdown into clean, valid LaTeX markup.
 */

/** Escape reserved LaTeX special characters in plain text */
export function escapeLatexText(str: string): string {
  if (!str) return "";

  return str
    .replace(/\\(?!([a-zA-Z]+|[{}_%&$#~^]))/g, "\\textbackslash{}")
    .replace(/(?<!\\)&/g, "\\&")
    .replace(/(?<!\\)%/g, "\\%")
    .replace(/(?<!\\)#/g, "\\#")
    .replace(/(?<!\\)_/g, "\\_")
    .replace(/(?<!\\)\$/g, "\\$")
    .replace(/(?<!\\)~/g, "\\textasciitilde{}")
    .replace(/(?<!\\)\^/g, "\\textasciicircum{}");
}

/** Convert Markdown string into clean, valid LaTeX markup */
export function convertMarkdownToLatex(md: string): string {
  if (!md) return "";

  const lines = md.split("\n");
  const output: string[] = [];

  let inVerbatim = false;
  let verbatimContent: string[] = [];
  let inList: "itemize" | "enumerate" | null = null;
  let inMathBlock = false;
  let mathBlockContent: string[] = [];

  const closeListIfActive = () => {
    if (inList === "itemize") {
      output.push("\\end{itemize}");
      inList = null;
    } else if (inList === "enumerate") {
      output.push("\\end{enumerate}");
      inList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      closeListIfActive();
      if (!inVerbatim) {
        inVerbatim = true;
        verbatimContent = [];
      } else {
        inVerbatim = false;
        output.push("\\begin{verbatim}");
        output.push(verbatimContent.join("\n"));
        output.push("\\end{verbatim}");
        verbatimContent = [];
      }
      continue;
    }

    if (inVerbatim) {
      verbatimContent.push(line);
      continue;
    }

    if (line.trim() === "$$" || line.trim() === "\\[") {
      closeListIfActive();
      if (!inMathBlock) {
        inMathBlock = true;
        mathBlockContent = [];
        output.push("\\[");
      } else {
        inMathBlock = false;
        output.push(mathBlockContent.join("\n"));
        output.push("\\]");
        mathBlockContent = [];
      }
      continue;
    }

    if (inMathBlock) {
      if (line.trim() === "$$" || line.trim() === "\\]") {
        inMathBlock = false;
        output.push(mathBlockContent.join("\n"));
        output.push("\\]");
        mathBlockContent = [];
      } else {
        mathBlockContent.push(line);
      }
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      closeListIfActive();
      output.push("");
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeListIfActive();
      output.push(`\\section{${processInlineFormatting(trimmed.slice(2))}}`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      closeListIfActive();
      output.push(`\\subsection{${processInlineFormatting(trimmed.slice(3))}}`);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      closeListIfActive();
      output.push(`\\subsubsection{${processInlineFormatting(trimmed.slice(4))}}`);
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      closeListIfActive();
      output.push(`\\paragraph{${processInlineFormatting(trimmed.slice(5))}}`);
      continue;
    }

    const bulletMatch = line.match(/^(\s*)([-*])\s+(.+)$/);
    if (bulletMatch) {
      if (inList !== "itemize") {
        closeListIfActive();
        output.push("\\begin{itemize}");
        inList = "itemize";
      }
      output.push(`  \\item ${processInlineFormatting(bulletMatch[3])}`);
      continue;
    }

    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (numMatch) {
      if (inList !== "enumerate") {
        closeListIfActive();
        output.push("\\begin{enumerate}");
        inList = "enumerate";
      }
      output.push(`  \\item ${processInlineFormatting(numMatch[3])}`);
      continue;
    }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      closeListIfActive();
      output.push("\\hrulefill");
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeListIfActive();
      output.push(`\\begin{quote}\n${processInlineFormatting(trimmed.slice(2))}\n\\end{quote}`);
      continue;
    }

    closeListIfActive();
    output.push(processInlineFormatting(line));
  }

  closeListIfActive();

  if (inVerbatim && verbatimContent.length > 0) {
    output.push("\\begin{verbatim}");
    output.push(verbatimContent.join("\n"));
    output.push("\\end{verbatim}");
  }

  return output.join("\n");
}

function processInlineFormatting(text: string): string {
  if (!text) return "";

  const parts: string[] = [];
  const mathRegex = /(\$[^$]+\$|\\\([^\)]+\\\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(transformNonMathInline(text.slice(lastIndex, match.index)));
    }
    parts.push(match[0]);
    lastIndex = mathRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(transformNonMathInline(text.slice(lastIndex)));
  }

  return parts.join("");
}

function transformNonMathInline(str: string): string {
  let result = str;

  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, "\\textbf{\\textit{$1}}");
  result = result.replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}");
  result = result.replace(/__([^_]+)__/g, "\\textbf{$1}");
  result = result.replace(/\*([^*]+)\*/g, "\\textit{$1}");
  result = result.replace(/_([^_]+)_/g, "\\textit{$1}");

  result = result.replace(/`([^`]+)`/g, (_m, p1) => {
    return `\\texttt{${p1.replace(/\\/g, "\\textbackslash{}").replace(/&/g, "\\&").replace(/%/g, "\\%").replace(/#/g, "\\#")}}`;
  });

  result = result
    .replace(/(?<!\\)&/g, "\\&")
    .replace(/(?<!\\)%/g, "\\%")
    .replace(/(?<!\\)#/g, "\\#")
    .replace(/(?<!\\)_/g, "\\_");

  return result;
}

export function sanitizeAiPayloadToLatex(payload: {
  title?: string;
  abstract?: string;
  introduction?: string;
  instructions?: string;
  sections?: Array<{ title: string; content: string }>;
}): { title: string; abstract: string; body: string } {
  const cleanTitle = processInlineFormatting(payload.title || "Research Paper");
  const cleanAbstract = convertMarkdownToLatex(payload.abstract || "Synthesize research and course theory.");
  
  let bodyTex = "";
  if (payload.introduction) {
    bodyTex += `\\section{Introduction}\n${convertMarkdownToLatex(payload.introduction)}\n\n`;
  } else if (payload.instructions) {
    bodyTex += `\\section{Introduction}\n${convertMarkdownToLatex(payload.instructions)}\n\n`;
  }

  if (Array.isArray(payload.sections)) {
    for (const sec of payload.sections) {
      if (sec.title && sec.content) {
        bodyTex += `\\section{${processInlineFormatting(sec.title)}}\n${convertMarkdownToLatex(sec.content)}\n\n`;
      }
    }
  }

  return {
    title: cleanTitle,
    abstract: cleanAbstract,
    body: bodyTex,
  };
}
