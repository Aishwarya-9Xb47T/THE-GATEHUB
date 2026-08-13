/**
 * Normalize pasted educational quiz text into line-oriented blocks.
 * Critical: single-newline pastes (Word/Notepad) must NOT collapse into one paragraph,
 * or option/answer regexes that anchor at ^ never match.
 */

export function normalizePasteText(raw: string): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, '  ')
    // Collapse runs of spaces but keep newlines
    .replace(/[^\S\n]+/g, ' ')
    // Cap extreme blank-line runs
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split normalized paste/TXT content into one semantic line per entry.
 * Empty lines are dropped (structure is preserved via option/question heuristics).
 */
export function splitPasteTextIntoLines(raw: string): string[] {
  const normalized = normalizePasteText(raw);
  if (!normalized) return [];
  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
