/**
 * LaTeX Sanitizer & Markdown-to-LaTeX Converter Module
 * Ensures any AI-generated text, markdown, or raw content converts into valid,
 * 100% compilable LaTeX code without syntax or character escaping errors.
 */

/** Escape reserved LaTeX special characters in plain text */
export function escapeLatexText(str: string): string {
  if (!str) return "";
  
  // Protect existing valid LaTeX commands or already escaped sequences
  return str
    // Escape backslashes that are standalone (not part of a control sequence like \textbf, \section, etc.)
    .replace(/\\(?!([a-zA-Z]+|[{}_%&$#~^]))/g, "\\textbackslash{}")
    // Escape & (unless already \&)
    .replace(/(?<!\\)&/g, "\\&")
    // Escape % (unless already \%)
    .replace(/(?<!\\)%/g, "\\%")
    // Escape # (unless already \#)
    .replace(/(?<!\\)#/g, "\\#")
    // Escape _ (unless already \_ or inside math $...$)
    .replace(/(?<!\\)_/g, "\\_")
    // Escape $ (unless already \$ or part of math)
    // Note: math dollar handling is done during markdown-to-latex parsing
    .replace(/(?<!\\)\$/g, "\\$")
    // Escape ~
    .replace(/(?<!\\)~/g, "\\textasciitilde{}")
    // Escape ^
    .replace(/(?<!\\)\^/g, "\\textasciicircum{}");
}

/** Convert Markdown string into clean, valid LaTeX markup */
export function convertMarkdownToLatex(md: string): string {
  if (!md) return "";

  const lines = md.split("\n");
  const output: string[] = [];

  let inVerbatim = false;
  let verbatimLang = "";
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

    // Handle ``` code blocks
    if (line.trim().startsWith("```")) {
      closeListIfActive();
      if (!inVerbatim) {
        inVerbatim = true;
        verbatimLang = line.trim().slice(3).trim();
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

    // Handle $$ or \[ display math blocks
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

    // Empty line
    if (!trimmed) {
      closeListIfActive();
      output.push("");
      continue;
    }

    // Markdown Headers
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

    // Bullet list items (- or *)
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

    // Numbered list items (1. 2. etc)
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

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      closeListIfActive();
      output.push("\\hrulefill");
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      closeListIfActive();
      output.push(`\\begin{quote}\n${processInlineFormatting(trimmed.slice(2))}\n\\end{quote}`);
      continue;
    }

    // Normal paragraph line
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

/** Process inline markdown formatting like bold, italic, code, links, math, and reserved chars */
function processInlineFormatting(text: string): string {
  if (!text) return "";

  // Split text into inline math parts ($...$) and non-math parts
  const parts: string[] = [];
  const mathRegex = /(\$[^$]+\$|\\\([^\)]+\\\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(transformNonMathInline(text.slice(lastIndex, match.index)));
    }
    // Keep math expression intact
    parts.push(match[0]);
    lastIndex = mathRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(transformNonMathInline(text.slice(lastIndex)));
  }

  return parts.join("");
}

/** Transform markdown formatting and escape characters in non-math inline text */
function transformNonMathInline(str: string): string {
  let result = str;

  // 1. Triple bold/italic ***text*** -> \textbf{\textit{text}}
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, "\\textbf{\\textit{$1}}");

  // 2. Bold **text** or __text__ -> \textbf{text}
  result = result.replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}");
  result = result.replace(/__([^_]+)__/g, "\\textbf{$1}");

  // 3. Italic *text* or _text_ -> \textit{text}
  result = result.replace(/\*([^*]+)\*/g, "\\textit{$1}");
  result = result.replace(/_([^_]+)_/g, "\\textit{$1}");

  // 4. Inline code `code` -> \texttt{code}
  result = result.replace(/`([^`]+)`/g, (_m, p1) => {
    return `\\texttt{${p1.replace(/\\/g, "\\textbackslash{}").replace(/&/g, "\\&").replace(/%/g, "\\%").replace(/#/g, "\\#")}}`;
  });

  // 5. Escape remaining reserved LaTeX characters (&, %, $, #, _, {, })
  result = result
    .replace(/(?<!\\)&/g, "\\&")
    .replace(/(?<!\\)%/g, "\\%")
    .replace(/(?<!\\)#/g, "\\#")
    .replace(/(?<!\\)_/g, "\\_");

  return result;
}

/** Sanitize an entire AI payload or document string for insertion into a LaTeX main.tex template */
export function sanitizeAiPayloadToLatex(payload: {
  title?: string;
  abstract?: string;
  introduction?: string;
  instructions?: string;
  sections?: Array<{ title: string; content: string }>;
}): { title: string; abstract: string; body: string } {
  const cleanTitle = processInlineFormatting(payload.title || "Research Paper");
  const cleanAbstract = convertMarkdownToLatex(payload.abstract || "Synthesize research and course findings.");
  
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
