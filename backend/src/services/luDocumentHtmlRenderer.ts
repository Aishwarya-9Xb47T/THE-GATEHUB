/**
 * HTML rendering via Universal Content Engine — same AST as PDF and student view.
 */
import { marked } from "marked";
import type { DocumentNode } from "../../../shared/lesson-body/dist/documentTypes.js";
import {
  nodesFromContentBlock,
  renderContentBlockToLatex,
  titleFromContentBlock,
  type ContentBlockLike,
} from "../../../shared/lesson-body/dist/contentEngine.js";

function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderDocumentAstToHtml(
  nodes: DocumentNode[],
  resolveImageUrl?: (ref: string) => string
): string {
  const parts: string[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "markdown":
        parts.push(`<div class="lesson-body">${marked.parse(node.content) as string}</div>`);
        break;
      case "image": {
        const src = resolveImageUrl ? resolveImageUrl(node.ref) : node.ref;
        parts.push(
          `<div class="lesson-image" style="text-align:${node.centered ? "center" : "left"};margin:1rem 0;">` +
            `<img src="${escHtml(src)}" alt="" style="max-width:100%;border-radius:8px;" />` +
            `</div>`
        );
        break;
      }
      case "equation":
        parts.push(
          `<div class="equation${node.display ? " equation-display" : ""}"><code>${escHtml(node.latex)}</code></div>`
        );
        break;
      case "code":
        parts.push(`<pre class="code-block"><code>${escHtml(node.content)}</code></pre>`);
        break;
      case "table":
        parts.push(`<pre class="table-block">${escHtml(node.content)}</pre>`);
        break;
      case "list": {
        const tag = node.ordered ? "ol" : "ul";
        parts.push(
          `<${tag}>${node.items.map((i) => `<li>${marked.parseInline(i) as string}</li>`).join("")}</${tag}>`
        );
        break;
      }
      case "quote":
        parts.push(`<blockquote>${marked.parse(node.content) as string}</blockquote>`);
        break;
      case "callout":
        parts.push(
          `<div class="callout callout-${node.variant}">` +
            (node.title ? `<strong>${escHtml(node.title)}</strong> ` : "") +
            `${marked.parse(node.content) as string}</div>`
        );
        break;
      case "video":
        parts.push(
          `<div class="interactive-card video-card"><p><strong>🎥 ${escHtml(node.title || "Video")}</strong></p>` +
            `<p><a href="${escHtml(node.ref)}">${escHtml(node.ref)}</a></p></div>`
        );
        break;
      case "link":
        parts.push(
          `<p><a href="${escHtml(node.url)}" target="_blank" rel="noopener">${escHtml(node.label || node.url)}</a></p>`
        );
        break;
      case "download":
        parts.push(
          `<div class="download-card"><p><strong>📥 ${escHtml(node.title)}</strong></p>` +
            `<p><a href="${escHtml(node.url || node.ref)}">${escHtml(node.ref)}</a></p></div>`
        );
        break;
      default:
        parts.push(`<div class="unsupported-node">${escHtml((node as { type: string }).type)}</div>`);
        break;
    }
  }
  return parts.join("\n");
}

/** Render any content block to HTML — document AST first, interactive fallbacks match PDF cards. */
export function renderUniversalBlockToHtml(
  block: ContentBlockLike,
  resolveImageUrl?: (ref: string) => string
): string {
  const nodes = nodesFromContentBlock(block);
  if (nodes?.length) {
    const title = titleFromContentBlock(block);
    const titleHtml = title ? `<h4>${escHtml(title)}</h4>` : "";
    return `${titleHtml}${renderDocumentAstToHtml(nodes, resolveImageUrl)}`;
  }

  const latex = renderContentBlockToLatex(block);
  if (!latex.trim()) return "";
  return `<pre class="compiled-fallback">${escHtml(latex)}</pre>`;
}
