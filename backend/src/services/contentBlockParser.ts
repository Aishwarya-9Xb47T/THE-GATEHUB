import katex from "katex";

export interface ContentBlock {
  type: string;
  content?: string;
  language?: string;
  code?: string;
  expectedOutput?: string;
  title?: string;
  src?: string;
  alt?: string;
  videoUrl?: string;
  videoType?: string;
  question?: string;
  options?: string[];
  correct?: string;
  explanation?: string;
  id?: string;
  lectureId?: string;
  quiz?: unknown;
}

function detectVideoType(ref: string): "youtube" | "vimeo" | "upload" {
  const u = ref.toLowerCase();
  if (u.includes("youtu")) return "youtube";
  if (u.includes("vimeo")) return "vimeo";
  return "upload";
}

function buildVideoBlock(ref: string, title?: string): ContentBlock {
  const trimmed = ref.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      type: "video",
      videoUrl: trimmed,
      videoType: detectVideoType(trimmed),
      title: title || "Video",
    };
  }
  return {
    type: "video",
    src: trimmed,
    videoUrl: trimmed,
    videoType: "upload",
    title: title || "Video",
  };
}

export function cleanLatexBoilerplate(text: string): string {
  if (!text) return "";

  return text
    .replace(/^[\s\S]*?\\begin\s*\{document\}/i, "")
    .replace(/\\end\s*\{document\}[\s\S]*$/i, "")
    .replace(/\\documentclass(?:\[[\s\S]*?\])?\{[\s\S]*?\}/gi, "")
    .replace(/\\usepackage(?:\[[\s\S]*?\])?\{[\s\S]*?\}/gi, "")
    .replace(/\\definecolor\{[\s\S]*?\}\{[\s\S]*?\}\{[\s\S]*?\}/gi, "")
    .replace(/\\title\{[\s\S]*?\}/gi, "")
    .replace(/\\author\{[\s\S]*?\}/gi, "")
    .replace(/\\date\{[\s\S]*?\}/gi, "")
    .replace(/\\geometry\{[\s\S]*?\}/gi, "")
    .replace(/\\hypersetup\{[\s\S]*?\}/gi, "")
    .replace(/\\maketitle/gi, "")
    .replace(/\\tableofcontents/gi, "")
    .replace(/\\newpage/gi, "")
    .replace(/\\clearpage/gi, "")
    .replace(/\\thispagestyle\{[\s\S]*?\}/gi, "")
    .replace(/\\pagestyle\{[\s\S]*?\}/gi, "")
    .replace(
      /\\begin\s*\{(?:tikzpicture|pgfpicture|tikz|wrapfigure|tabular|longtable|tabu|frame).*?\}[\s\S]*?\\end\s*\{(?:tikzpicture|pgfpicture|tikz|wrapfigure|tabular|longtable|tabu|frame)\}/gi,
      ""
    )
    .replace(
      /\\(?:Large|large|huge|Huge|small|footnotesize|tiny|centering|raggedright|raggedleft|selectfont|vfill|hfill|noindent|indent|hspace\{.*?\}|vspace\{.*?\}|\\|\[.*?\])(?![a-zA-Z])/gi,
      ""
    )
    .replace(/(?<!\\)%.*$/gm, "")
    .replace(/\\(?:label|ref|cite|index|glossary)\{.*?\}/gi, "")
    .replace(/\\begin\{(?!lstlisting|verbatim|tcolorbox|tryit|pythoncode|javascriptcode|nodecode).*?\}(?:\[.*?\])?/gi, "")
    .replace(/\\end\{(?!lstlisting|verbatim|tcolorbox|tryit|pythoncode|javascriptcode|nodecode).*?\}/gi, "")
    .replace(/\\begin\{(?:itemize|enumerate|description)\}/gi, "\n")
    .replace(/\\end\{(?:itemize|enumerate|description)\}/gi, "\n")
    .replace(/\\item\s+/gi, "* ")
    .replace(/\\item/gi, "* ")
    .trim();
}

export function compileInlineContent(text: string): string {
  try {
    if (!text) return "";

    let cleanText = text;
    const displayMath: string[] = [];
    const inlineMath: string[] = [];

    const displayMathRegex =
      /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\begin\s*\{(?:equation|align|gather|flalign|multiline|eqnarray)\*?\}([\s\S]*?)\\end\s*\{(?:equation|align|gather|flalign|multiline|eqnarray)\*?\}/gi;
    cleanText = cleanText.replace(displayMathRegex, (match, p1, p2, p3) => {
      const math = (p1 || p2 || p3).trim();
      const index = displayMath.length;
      try {
        const rendered = katex.renderToString(math, { displayMode: true, throwOnError: false });
        displayMath.push(`<div class="katex-display-wrapper my-6 overflow-x-auto">${rendered}</div>`);
      } catch {
        displayMath.push(match);
      }
      return `[[MATH_DISPLAY_${index}]]`;
    });

    const inlineMathRegex = /\$([^$\n]+?)\$|\\\(([\s\S]*?)\\\)/g;
    cleanText = cleanText.replace(inlineMathRegex, (match, p1, p2) => {
      const math = (p1 || p2).trim();
      const index = inlineMath.length;
      try {
        const rendered = katex.renderToString(math, { displayMode: false, throwOnError: false });
        inlineMath.push(rendered);
      } catch {
        inlineMath.push(match);
      }
      return `[[MATH_INLINE_${index}]]`;
    });

    cleanText = cleanText
      .replace(/\\(?:textbf|mathbf)\{([^}]*)\}/gi, "**$1**")
      .replace(/\\(?:textit|mathit|emph)\{([^}]*)\}/gi, "*$1*")
      .replace(/\\texttt\{([^}]*)\}/gi, "`$1`")
      .replace(/\\underline\{([^}]*)\}/gi, "<u>$1</u>")
      .replace(/\\href\{([^}]*)\}\{([^}]*)\}/gi, "[$2]($1)");

    let html = marked.parse(cleanText) as string;
    html = html.replace(/\[\[MATH_DISPLAY_(\d+)\]\]/g, (_, index) => displayMath[Number(index)] || "");
    html = html.replace(/\[\[MATH_INLINE_(\d+)\]\]/g, (_, index) => inlineMath[Number(index)] || "");
    return html;
  } catch {
    return text;
  }
}

export function parseContentToBlocks(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let remainingText = text;

  const videoRegex =
    /\\href\{(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)[^}]+)\}\{([^}]*)\}|\\href\{([^}]+\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?[^}]*)?)\}\{([^}]*)\}|\\video\{(https?:\/\/[^}]+)\}|\\video\{([^}]+\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?[^}]*)?)\}|\\video\{([^}]+)\}/gi;

  const regexes = [
    { type: "subsection", regex: /\\subsection\{([^}]+)\}/gi },
    { type: "subsubsection", regex: /\\subsubsection\{([^}]+)\}/gi },
    { type: "image", regex: /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/gi },
    { type: "video", regex: videoRegex },
    { type: "quiz", regex: /\\quiz\s*\{([\s\S]*?explanation\s*=\s*\{[\s\S]*?\}\s*)\}/gi },
    { type: "editor", regex: /\\begin\{lstlisting\}(?:\[(.*?)\])?\s*([\s\S]*?)\\end\{lstlisting\}/gi },
    { type: "output", regex: /\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/gi },
    { type: "example", regex: /\\begin\{tcolorbox\}(?:\[(.*?)\])?\s*([\s\S]*?)\\end\{tcolorbox\}/gi },
  ];

  while (remainingText.length > 0) {
    let earliestMatch: { type: string; regex: RegExp; match: RegExpExecArray } | null = null;
    let earliestIndex = Infinity;

    for (const r of regexes) {
      r.regex.lastIndex = 0;
      const match = r.regex.exec(remainingText);
      if (match && match.index < earliestIndex) {
        earliestIndex = match.index;
        earliestMatch = { ...r, match };
      }
    }

    if (earliestMatch) {
      if (earliestIndex > 0) {
        const textBefore = remainingText.substring(0, earliestIndex).trim();
        if (textBefore) {
          const cleanedText = cleanLatexBoilerplate(textBefore);
          if (cleanedText) {
            blocks.push({ type: "text", content: compileInlineContent(cleanedText) });
          }
        }
      }

      const m = earliestMatch.match;
      const fullMatch = m[0];

      if (earliestMatch.type === "subsection") {
        blocks.push({
          type: "subsection",
          title: m[1].trim(),
          id: m[1].trim().toLowerCase().replace(/[^a-z0-9]/g, "-"),
        });
      } else if (earliestMatch.type === "subsubsection") {
        blocks.push({
          type: "subsubsection",
          title: m[1].trim(),
          id: m[1].trim().toLowerCase().replace(/[^a-z0-9]/g, "-"),
        });
      } else if (earliestMatch.type === "image") {
        blocks.push({ type: "image", src: m[1].trim(), alt: m[1].trim() });
      } else if (earliestMatch.type === "video") {
        const embedUrl = m[1]?.trim();
        const fileHref = m[3]?.trim();
        const videoUrlCmd = m[5]?.trim();
        const videoFileCmd = m[6]?.trim();
        const videoGeneric = m[7]?.trim();
        const label = (m[2] || m[4] || "").trim();
        const ref = embedUrl || fileHref || videoUrlCmd || videoFileCmd || videoGeneric || "";
        if (ref) blocks.push(buildVideoBlock(ref, label || undefined));
      } else if (earliestMatch.type === "quiz") {
        const quizContent = m[1];
        const questionMatch = quizContent.match(/question\s*=\s*\{([\s\S]*?)\}/i);
        const optionsMatch = quizContent.match(/options\s*=\s*\{([\s\S]*?)\}/i);
        const correctMatch = quizContent.match(/correct\s*=\s*\{([\s\S]*?)\}/i);
        const explanationMatch = quizContent.match(/explanation\s*=\s*\{([\s\S]*?)\}/i);
        const options = optionsMatch
          ? optionsMatch[1]
              .split(/,|\n/)
              .map((o) => o.trim())
              .filter(Boolean)
          : [];
        blocks.push({
          type: "quiz",
          question: questionMatch ? questionMatch[1].trim() : "",
          options,
          correct: correctMatch ? correctMatch[1].trim() : "",
          explanation: explanationMatch ? explanationMatch[1].trim() : "",
        });
      } else if (earliestMatch.type === "editor") {
        let lang = "javascript";
        const options = (m[1] || "").toLowerCase();
        if (options.includes("python")) lang = "python";
        else if (options.includes("javascript") || options.includes("js")) lang = "javascript";
        else if (options.includes("node")) lang = "node";
        else if (options.includes("typescript") || options.includes("ts")) lang = "typescript";
        blocks.push({ type: "editor", language: lang, code: m[2].trim(), expectedOutput: "" });
      } else if (earliestMatch.type === "output") {
        let attached = false;
        if (blocks.length > 0 && blocks[blocks.length - 1].type === "editor") {
          blocks[blocks.length - 1].expectedOutput = m[1].trim();
          attached = true;
        }
        if (!attached) blocks.push({ type: "output", content: m[1].trim() });
      } else if (earliestMatch.type === "example") {
        blocks.push({
          type: "example",
          title: (m[1] || "Example").replace(/title=\{?([^\]\}]*)\}?/, "$1").trim(),
          content: compileInlineContent(cleanLatexBoilerplate(m[2].trim())),
        });
      }

      remainingText = remainingText.substring(earliestIndex + fullMatch.length);
    } else {
      const finalContent = cleanLatexBoilerplate(remainingText.trim());
      if (finalContent) {
        blocks.push({ type: "text", content: compileInlineContent(finalContent) });
      }
      remainingText = "";
    }
  }

  return blocks;
}

export function generateStructuredContent(text: string): { sections: Array<{ title: string; blocks: ContentBlock[] }> } {
  try {
    if (!text?.trim()) {
      return {
        sections: [
          {
            title: "Introduction",
            blocks: [{ type: "text", content: "Content is currently being prepared." }],
          },
        ],
      };
    }

    const segments = text.split(/(?=\\section\{|^#\s+)/m);
    const sections: Array<{ title: string; blocks: ContentBlock[] }> = [];

    segments.forEach((segment) => {
      if (!segment.trim()) return;
      const sectionMatch = segment.match(/\\section\{([^}]+)\}/) || segment.match(/^#\s+(.+)/m);
      const title = (sectionMatch?.[1] || "Introduction").trim();
      const content = segment.replace(/\\section\{[^}]+\}/g, "").replace(/^#\s+.+/m, "").trim();
      const blocks = parseContentToBlocks(content);
      if (blocks.length > 0 || title !== "Introduction") {
        sections.push({ title, blocks });
      }
    });

    if (sections.length === 0) {
      sections.push({ title: "Introduction", blocks: parseContentToBlocks(text) });
    }

    return { sections };
  } catch {
    return { sections: [] };
  }
}

export function compileLatexToHtml(latexContent: string): string {
  return compileInlineContent(cleanLatexBoilerplate(latexContent));
}

export function flattenStructuredSections(structured: {
  sections: Array<{ title: string; blocks: ContentBlock[] }>;
}): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const section of structured.sections) {
    if (section.title && section.title !== "Introduction") {
      blocks.push({
        type: "subsection",
        title: section.title,
        id: section.title.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      });
    }
    blocks.push(...section.blocks);
  }
  return blocks;
}
