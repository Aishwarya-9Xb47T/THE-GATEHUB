/**
 * Client-side LaTeX text normalization — mirrors backend latexContentSanitizer.ts.
 * Applied before autosave and manual save.
 */

const CONTROL_CHAR_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const ZERO_WIDTH_RE = /[\u200b-\u200d\ufeff\u2060]/g;

const TEXT_LIKE_EXT = /\.(tex|bib|md|txt|json|xml|csv|sty|cls)$/i;

export function isTextLikeProjectPath(filePath: string): boolean {
  return TEXT_LIKE_EXT.test(filePath);
}

export function normalizeLatexTextContent(content: string): string {
  if (typeof content !== "string") return "";

  let result = content
    .replace(/\u00a0/g, " ")
    .replace(ZERO_WIDTH_RE, "")
    .replace(CONTROL_CHAR_RE, "")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/\u2013/g, "--")
    .replace(/\u2014/g, "---")
    .replace(/\u2026/g, "...")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  try {
    result = result.normalize("NFC");
  } catch {
    // ignore
  }

  return result;
}

export function sanitizeProjectFileContent(filePath: string, content: string): string {
  if (!isTextLikeProjectPath(filePath)) return content;
  return normalizeLatexTextContent(content);
}
