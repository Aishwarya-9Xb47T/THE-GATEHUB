import { parseContentBlocks, promoteStructuredInBlocks } from "./contentBlocks";
import { codeLanguageLabel } from "./codeBlockLanguages";

/** Short label for question navigator / cards — never raw markdown tables or code fences. */
export function questionContentPreview(markdown: string, maxLen = 96): string {
  const blocks = promoteStructuredInBlocks(parseContentBlocks(markdown));
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text": {
        const plain = block.content.replace(/\s+/g, " ").trim();
        if (plain) parts.push(plain);
        break;
      }
      case "code":
        parts.push(`Code (${codeLanguageLabel(block.language)})`);
        break;
      case "table": {
        const cols = Math.max(block.headers.length, block.rows[0]?.length ?? 0, 1);
        parts.push(`Table (${block.rows.length}×${cols})`);
        break;
      }
      case "formula":
        parts.push(block.display === "block" ? "Formula" : "Math");
        break;
      case "image":
        parts.push("Image");
        break;
      case "video":
        parts.push("Video");
        break;
      case "audio":
        parts.push("Audio");
        break;
      case "attachment":
        parts.push("File");
        break;
      case "link":
        parts.push(block.label || "Link");
        break;
      default:
        break;
    }
  }

  const joined = parts.join(" · ");
  if (joined) {
    if (joined.length <= maxLen) return joined;
    return `${joined.slice(0, maxLen - 1)}…`;
  }

  if (markdown.trimStart().startsWith("|")) return "Table";
  if (markdown.trimStart().startsWith("```")) return "Code block";
  return "Untitled";
}
