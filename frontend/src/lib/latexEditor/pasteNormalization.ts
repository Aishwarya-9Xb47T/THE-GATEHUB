/** Normalize clipboard text pasted into LaTeX editors (web pages often use smart quotes / NBSP). */
import { normalizeLatexTextContent } from "./contentSanitizer";
export const normalizePastedLatexText = normalizeLatexTextContent;

/** Strip HTML clipboard payloads (common when copying from documentation sites). */
export function clipboardHtmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return normalizePastedLatexText(doc.body.textContent ?? "");
}
