import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

marked.setOptions({ gfm: true, breaks: true });

const CALLOUT_RE =
  /^> \[!(TIP|NOTE|WARNING|IMPORTANT|SUCCESS|INFO)\]\s*(.*?)\r?\n((?:> .*\r?\n?)*)/gim;

const CALLOUT_LABELS: Record<string, string> = {
  TIP: "Tip",
  NOTE: "Note",
  WARNING: "Warning",
  IMPORTANT: "Important",
  SUCCESS: "Success",
  INFO: "Info",
};

function transformCallouts(md: string): string {
  return md.replace(CALLOUT_RE, (_, type: string, title: string, body: string) => {
    const kind = type.toLowerCase();
    const label = title.trim() || CALLOUT_LABELS[type] || type;
    const content = body
      .split("\n")
      .map((line) => line.replace(/^> ?/, ""))
      .join("\n")
      .trim();
    const parsedBody = marked.parse(content) as string;
    return `<div class="docs-callout docs-callout--${kind}"><div class="docs-callout__label">${label}</div><div class="docs-callout__body">${parsedBody}</div></div>\n\n`;
  });
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function enrichHeadings(html: string): string {
  return html
    .replace(/<h2>([^<]+)<\/h2>/g, (_, title) => `<h2 id="${slugify(title)}" class="docs-h2">${title}</h2>`)
    .replace(/<h3>([^<]+)<\/h3>/g, (_, title) => `<h3 id="${slugify(title)}" class="docs-h3">${title}</h3>`);
}

function enrichLists(html: string): string {
  return html.replace(/<ol>/g, '<ol class="docs-steps">').replace(/<table>/g, '<div class="docs-table-wrap"><table class="docs-table">').replace(/<\/table>/g, "</table></div>");
}

function enrichBlockquotes(html: string): string {
  return html.replace(/<blockquote>\s*<p><strong>(Tip|Note|Warning|Important|Success|Info):<\/strong>\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi, (_, kind, body) => {
    const type = kind.toLowerCase();
    return `<div class="docs-callout docs-callout--${type}"><div class="docs-callout__label">${kind}</div><div class="docs-callout__body"><p>${body.trim()}</p></div></div>`;
  });
}

function enrichCodeBlocks(html: string): string {
  return html.replace(/<pre><code class="language-(\w+)">/g, '<pre class="docs-code-block" data-lang="$1"><code class="language-$1">');
}

function enrichLinks(html: string): string {
  return html.replace(/<a href="(\/[^"]+)">/g, '<a class="docs-link" href="$1">');
}

/** Parse markdown into enriched HTML for the Help Center article body */
export function renderDocMarkdown(markdown: string): string {
  const withCallouts = transformCallouts(markdown);
  const raw = marked.parse(withCallouts) as string;
  return sanitizeHtml(
    enrichLinks(enrichCodeBlocks(enrichBlockquotes(enrichLists(enrichHeadings(raw)))))
  );
}
