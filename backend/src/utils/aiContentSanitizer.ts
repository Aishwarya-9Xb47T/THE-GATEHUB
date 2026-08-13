
/**
 * Centralized sanitization for AI-generated content before it's written to .tex files
 */

export interface ScanIssue {
  type: "invalid-utf8" | "zero-width" | "smart-quotes" | "curly-apostrophe" | "unicode-bullet" | "control-char" | "en-dash" | "em-dash";
  text: string;
  index: number;
  char: string;
}

export function scanAIContent(text: string): ScanIssue[] {
  const issues: ScanIssue[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // C1 control chars / mojibake from broken UTF-8
    if (code >= 0x80 && code <= 0x9f) {
      issues.push({ type: "invalid-utf8", text, index: i, char });
    }

    // Check zero-width characters
    if ([0x200B, 0x200C, 0x200D, 0xFEFF, 0x2060].includes(code)) {
      issues.push({ type: "zero-width", text, index: i, char });
    }

    // Check smart quotes
    if ([0x2018, 0x2019].includes(code)) {
      issues.push({ type: "curly-apostrophe", text, index: i, char });
    }
    if ([0x201C, 0x201D, 0x201E, 0x201F].includes(code)) {
      issues.push({ type: "smart-quotes", text, index: i, char });
    }

    // Check dashes
    if ([0x2013, 0x2012].includes(code)) {
      issues.push({ type: "en-dash", text, index: i, char });
    }
    if (code === 0x2014) {
      issues.push({ type: "em-dash", text, index: i, char });
    }

    // Check unicode bullets
    if ([0x2022, 0x2023, 0x2043, 0x204C, 0x204D].includes(code)) {
      issues.push({ type: "unicode-bullet", text, index: i, char });
    }

    // Check control chars
    if ((code < 0x20 || code === 0x7F) && ![0x0A, 0x0D, 0x09].includes(code)) {
      issues.push({ type: "control-char", text, index: i, char });
    }
  }

  return issues;
}

export function sanitizeAIContentForLaTeX(text: string | undefined | null): string {
  if (!text) return "";

  let sanitized = text;

  // Remove zero-width characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF\u2060\u200C]/g, "");

  // Step 3: Replace smart quotes with ASCII quotes
  sanitized = sanitized
    .replace(/[\u2018\u2019]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes
    .replace(/[\u201E\u201F]/g, '"'); // double low/high quotes

  // Step 4: Replace long dashes
  sanitized = sanitized
    .replace(/[\u2013\u2014]/g, "-") // en dash, em dash → hyphen
    .replace(/[\u2012]/g, "-"); // figure dash

  // Step 5: Replace Unicode bullets
  sanitized = sanitized
    .replace(/[\u2022\u2023\u2043\u204C\u204D]/g, "-");

  // Step 6: Replace non-breaking spaces with regular spaces
  sanitized = sanitized.replace(/\u00A0/g, " ");

  // Remove C1 control characters (often from mojibake)
  sanitized = sanitized.replace(/[\u0080-\u009F]/g, "");

  // Remove unsupported control characters (except CR, LF, TAB)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Step 8: Escape LaTeX reserved characters
  sanitized = sanitized
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/%/g, "\\%")
    .replace(/&/g, "\\&")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\$/g, "\\$")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");

  return sanitized;
}

export function sanitizeAIContentForJSON(text: string | undefined | null): string {
  if (!text) return "";

  let sanitized = text;

  // Remove zero-width characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF\u2060\u200C]/g, "");

  // Step 3: Replace smart quotes with ASCII quotes
  sanitized = sanitized
    .replace(/[\u2018\u2019]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes
    .replace(/[\u201E\u201F]/g, '"'); // double low/high quotes

  // Step 4: Replace long dashes
  sanitized = sanitized
    .replace(/[\u2013\u2014]/g, "-") // en dash, em dash → hyphen
    .replace(/[\u2012]/g, "-"); // figure dash

  // Step 5: Replace Unicode bullets
  sanitized = sanitized
    .replace(/[\u2022\u2023\u2043\u204C\u204D]/g, "-");

  // Step 6: Replace non-breaking spaces with regular spaces
  sanitized = sanitized.replace(/\u00A0/g, " ");

  // Remove C1 control characters (often from mojibake)
  sanitized = sanitized.replace(/[\u0080-\u009F]/g, "");

  // Remove unsupported control characters (except CR, LF, TAB)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}
