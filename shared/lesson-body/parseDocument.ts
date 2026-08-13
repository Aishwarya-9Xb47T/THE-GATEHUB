import type { DocumentNode, LessonDocument } from "./documentTypes";
import { extractRichTextFromContent, parseLessonTexCommand } from "./parseTexCommand";
import { sanitizeDslContent } from "./sanitizeDslContent.js";
import {
  renderPdfCodingLabCard,
  renderPdfDownloadCard,
  renderPdfInteractiveCard,
  renderPdfQuizBlock,
  renderPdfResearchPaperCard,
  renderPdfUnsupportedNodeCard,
  renderPdfVideoCard,
  resolvePdfVideoWatchUrl,
  linkifyWatchMarkdownForPdf,
  buildLessonLearnUrl,
  buildVideoWatchUrl,
  buildWorkspaceLearnUrl,
  type PdfLinkContext,
} from "./pdfNodeCards";

export function parseIncludeGraphicsWidth(options: string | undefined): string | undefined {
  if (!options?.trim()) return undefined;
  const m = options.match(/width\s*=\s*([^,\]]+)/i);
  return m ? m[1].trim() : undefined;
}

function createStructuredNode(content: string): DocumentNode {
  const clean = sanitizeDslContent(content).trim();
  if (/^(flowchart\s+(TD|LR|TB|RL)|graph\s+(TD|LR|TB|RL)|sequenceDiagram|stateDiagram|classDiagram)/i.test(clean)) {
    return { kind: "text", type: "diagram", content: clean } as any;
  }
  if (!clean.includes("```") && /^\/\/\s*|\bconst\s+\w+\s*=|\bconsole\.log\(|\bdef\s+\w+\(/i.test(clean)) {
    return { kind: "code", type: "code", language: "typescript", content: clean };
  }
  return { kind: "text", type: "markdown", content: clean };
}

export function parseDocumentBody(raw: string): DocumentNode[] {
  if (!raw || !raw.trim()) return [];

  const nodes: DocumentNode[] = [];
  let remaining = raw.trim();

  while (remaining.length > 0) {
    const cmdMatch = remaining.match(/\\([a-zA-Z0-9_-]+)\s*(?:=\s*)?\{/);
    if (!cmdMatch || cmdMatch.index === undefined) {
      const cleanRemaining = sanitizeDslContent(remaining);
      if (cleanRemaining.trim()) {
        nodes.push(createStructuredNode(cleanRemaining));
      }
      break;
    }

    const beforeText = remaining.substring(0, cmdMatch.index).trim();
    if (beforeText) {
      const cleanBefore = sanitizeDslContent(beforeText);
      if (cleanBefore.trim()) {
        nodes.push(createStructuredNode(cleanBefore));
      }
    }

    const parsed = parseLessonTexCommand(remaining.substring(cmdMatch.index));
    if (parsed) {
      if (parsed.node) {
        const textContent = typeof parsed.node.content === "string" ? parsed.node.content : "";
        if (parsed.node.kind !== "text" || textContent.trim()) {
          nodes.push(parsed.node);
        }
      }
      remaining = parsed.remainder.trim();
    } else {
      const cleanRemaining = sanitizeDslContent(remaining);
      if (cleanRemaining.trim()) {
        nodes.push(createStructuredNode(cleanRemaining));
      }
      break;
    }
  }

  return nodes;
}

export function parseLessonDocument(texOrMarkdown: string): LessonDocument {
  if (!texOrMarkdown || !texOrMarkdown.trim()) {
    return { nodes: [] };
  }

  const nodes = parseDocumentBody(texOrMarkdown);
  return { nodes };
}

export function parseLessonDocumentFromContent(raw: string): LessonDocument {
  return parseLessonDocument(raw);
}

export function parseLessonBody(tex: string): LessonDocument {
  return parseLessonDocument(tex);
}

export function lessonBodyContainsImages(tex: string): boolean {
  if (!tex) return false;
  return /\\image\s*\{|\\includegraphics/i.test(tex);
}

export function renderDocumentAstToLatex(
  nodes: DocumentNode[] | undefined,
  linkContext?: PdfLinkContext
): string {
  if (!nodes || nodes.length === 0) return "";

  return nodes
    .map((node) => {
      const kind = node.kind || node.type || "text";
      switch (kind) {
        case "text":
        case "markdown": {
          const watchUrl = buildVideoWatchUrl(linkContext);
          return linkifyWatchMarkdownForPdf(node.content ?? "", watchUrl);
        }
        case "formula":
        case "equation":
          return `\n\n\\[\n${node.tex || node.latex || node.content || ""}\n\\]\n\n`;
        case "callout":
          return `\n\\callout{title={${node.title ?? "Note"}},type={${node.variant ?? node.typeVariant ?? "info"}},content={${node.content ?? ""}}}\n`;
        case "code":
          return `\n\\code{language={${node.language ?? "text"}},code={${node.code || node.content || ""}}}\n`;
        case "table": {
          const headersStr = (node.headers ?? []).join(",");
          const rowsStr = (node.rows ?? []).map((r) => r.join(",")).join(";");
          return `\n\\table{headers={${headersStr}},rows={${rowsStr}}}\n`;
        }
        case "diagram":
          return `\n\\diagram{type={${node.diagramType ?? "mermaid"}},code={${node.code || node.content || ""}}}\n`;
        case "image": {
          const url = node.url || node.ref || "";
          const caption = node.caption ? `,caption={${node.caption}}` : "";
          const options = node.options ? `,options={${node.options}}` : "";
          return `\n\\image{url={${url}}${caption}${options}}\n`;
        }
        case "video": {
          const rawUrl = node.url || node.ref || "";
          const title = node.title ?? "Video Lesson";
          const watchUrl = resolvePdfVideoWatchUrl({ url: rawUrl, title }, linkContext);
          return renderPdfVideoCard({ title, ref: rawUrl, watchUrl });
        }
        case "audio":
          return `\n\\audio{url={${node.url || node.ref || ""}}}${node.title ? `{title={${node.title}}}` : ""}\n`;
        case "quiz":
          return renderPdfQuizBlock({ title: node.title ?? "Quiz", onlineUrl: buildLessonLearnUrl(linkContext) });
        case "codinglab":
        case "coding-lab":
          return renderPdfCodingLabCard({
            title: node.title ?? "Coding Lab",
            language: node.language ?? "python",
            starterCode: node.starterCode,
            instructions: node.instructions,
            onlineUrl: buildWorkspaceLearnUrl(linkContext, "coding-lab"),
          });
        case "notebook":
          return `\n\\notebook{title={${node.title ?? "Jupyter Notebook"}},kernel={${node.kernel ?? "python"}},cells={${JSON.stringify(node.cells ?? [])}}}\n`;
        case "researchpaper":
        case "research-paper":
          return renderPdfResearchPaperCard({ title: node.title ?? "Research Paper", onlineUrl: buildWorkspaceLearnUrl(linkContext, "research") });
        case "mathproof":
          return `\n\\mathproof{title={${node.title ?? "Theorem"}},statement={${node.statement ?? ""}},proof={${node.proof ?? ""}}}\n`;
        case "casestudy":
          return `\n\\casestudy{title={${node.title ?? "Case Study"}},scenario={${node.scenario ?? ""}},solution={${node.solution ?? ""}}}\n`;
        case "audiolecture":
          return `\n\\audiolecture{title={${node.title ?? "Audio Lecture"}},url={${node.url || node.ref || ""}}}\n`;
        case "flashcards":
          return `\n\\flashcards{title={${node.title ?? "Flashcards"}},cards={${JSON.stringify(node.cards ?? [])}}}\n`;
        case "discussion":
          return `\n\\discussion{prompt={${node.prompt ?? ""}}}\n`;
        case "labexercise":
          return `\n\\labexercise{title={${node.title ?? "Lab Exercise"}},instructions={${node.instructions ?? ""}}}\n`;
        case "cheatsheet":
          return `\n\\cheatsheet{title={${node.title ?? "Cheat Sheet"}},items={${JSON.stringify(node.items ?? [])}}}\n`;
        case "summary":
          return `\n\\summary{title={${node.title ?? "Summary"}},points={${JSON.stringify(node.points ?? [])}}}\n`;
        default:
          return renderPdfUnsupportedNodeCard(String(kind));
      }
    })
    .join("\n\n");
}

export function renderLessonBodyAstToLatex(
  nodes: DocumentNode[] | undefined,
  linkContext?: PdfLinkContext
): string {
  return renderDocumentAstToLatex(nodes, linkContext);
}
