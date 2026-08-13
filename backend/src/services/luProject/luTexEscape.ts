import {
  sanitizeAIContentForJSON,
  sanitizeAIContentForLaTeX,
} from "../../utils/aiContentSanitizer.js";

/** Escape user text for LaTeX brace-argument fields. */
export function escLatex(s: string): string {
  return sanitizeAIContentForLaTeX(s);
}

/** Escape text inside nested brace arguments (e.g. \\question{...} fields). */
export function escQuizField(s: string): string {
  const sanitized = sanitizeAIContentForJSON(s);
  return sanitized
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "\\&")
    .replace(/#/g, "\\#")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/}/g, "\\}");
}

/** Reverse escLatex for display in student UI (titles, hero banners). */
export function unescapeLatex(s: string): string {
  return s
    .replace(/\\&/g, "&")
    .replace(/\\#/g, "#")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\\/g, "\\");
}

/** Escape `}` in nested LaTeX fragments embedded inside a single `{...}` argument. */
export function escNestedLatexBraces(fragment: string): string {
  return escQuizField(fragment);
}

/** Sanitize text embedded inside lstlisting blocks (ASCII only, no LaTeX escaping). */
export function sanitizeForListings(text: string): string {
  const withAsciiDash = text.replace(/[\u2013\u2014\u2012]/g, "--");
  return sanitizeAIContentForJSON(withAsciiDash);
}
