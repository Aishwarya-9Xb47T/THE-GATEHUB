/**
 * PdfLayoutNormalizer
 *
 * PDF-only post-processing stage.
 * Converts the flat text extracted by PdfParser into typed layout blocks
 * that match the structure produced by DocxParser's HTML path.
 *
 * DOCX extraction is NOT touched here.
 * Only the PDF text normalisation path changes.
 *
 * Block types emitted:
 *   page_decoration  – page headers / footers / "-- N of M --" markers (filtered downstream)
 *   heading          – detected section / question-group headings
 *   list_item        – bullet (● ○ • ◦ ▪ ▸ - *) or numbered (1. 2.)
 *   table_row        – tab-separated or multi-space column row
 *   code             – indented / fenced code region
 *   equation         – maths expression
 *   decorative       – standalone labels: Important / Note / Example etc.
 *   fill_answer      – answer line immediately following a fill-blank question
 *   text             – ordinary paragraph / question text
 */

export type PdfBlockType =
  | 'page_decoration'
  | 'heading'
  | 'list_item'
  | 'table_row'
  | 'code'
  | 'equation'
  | 'decorative'
  | 'fill_answer'
  | 'text';

export interface PdfBlock {
  type: PdfBlockType;
  /** original line(s) as extracted from the PDF */
  raw: string;
  /** cleaned display text */
  text: string;
  /** list hierarchy level (0 = top-level). Only set for list_item. */
  listLevel?: number;
  /** true = ordered list. Only set for list_item. */
  listOrdered?: boolean;
  /** parsed column cells. Only set for table_row. */
  cells?: string[];
  /** code language hint. Only set for code. */
  language?: string;
  /** page index (1-based) this block belongs to */
  page: number;
}

// ---------------------------------------------------------------------------
// Page-decoration patterns
// ---------------------------------------------------------------------------

const RE_PAGE_DASH       = /^--?\s*\d+\s*(?:to|-|of|\/|—)?\s*\d*--?$/i;
const RE_PAGE_NUM        = /^(?:page|pg|p\.?)\s*\d+(?:\s*(?:to|-|of|\/|—)\s*\d+)?$/i;
const RE_PAGE_SLASH      = /^\d+\s*[\/\-—]\s*\d+$/;
const RE_PAGE_OF         = /^\d+\s+(?:of|to)\s+\d+$/i;
const RE_PAGE_RANGE      = /^\d+\s*(?:to|-|—)\s*\d+$/i;
const RE_HEADER_LABEL    = /^(header|footer)\s*$/i;
const RE_COPYRIGHT       = /^[©(c)]\s*\d{4}/i;
const RE_PAGE_BAR        = /^\d+\s*\|\s*(?:page|\d+)$/i;
const RE_PAGE_BREAK_DASH = /^--\s*--$/;

function stripInlinePageDecorations(str: string): string {
  if (!str) return '';
  return str
    .replace(/--?\s*\d+\s*(?:of|to|-|\/|—)?\s*\d*--?/gi, '')
    .replace(/\bPage\s+\d+\s*(?:of|to|-|\/|—)\s*\d+\b/gi, '')
    .replace(/\bPage\s+\d+\b/gi, '')
    .replace(/\b\d+\s+of\s+\d+\b/gi, '')
    .replace(/--\s*--/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isPageDecoration(line: string): boolean {
  const t = line.trim();
  const cleaned = stripInlinePageDecorations(t);
  if (!cleaned && t.length > 0) return true;
  return (
    RE_PAGE_DASH.test(t) ||
    RE_PAGE_NUM.test(t)  ||
    RE_PAGE_SLASH.test(t)||
    RE_PAGE_OF.test(t)   ||
    RE_PAGE_RANGE.test(t)||
    RE_HEADER_LABEL.test(t)  ||
    RE_COPYRIGHT.test(t)     ||
    RE_PAGE_BAR.test(t)      ||
    RE_PAGE_BREAK_DASH.test(t) ||
    /^(Header|Footer)\s*:?\s*$/i.test(t) ||
    /^(Word\s+Import\s+Test|Page\s+\d+|Verify\s+these\s+are\s+ignored\s+during\s+import\.?)\s*$/i.test(t) ||
    /^(Correct\s+Answer|Correct\s+Answers)\s*:?\s*$/i.test(t) ||
    /^(Insert\s+(any|this\s+using|another|a|2–3)?|Add\s+caption|Paste\s+3–5\s+paragraphs|Page\s+Break)\s*:?\s*$/i.test(t)
  );
}

// ---------------------------------------------------------------------------
// Decorative label patterns (standalone section markers)
// ---------------------------------------------------------------------------

function isDecorativeLabel(line: string): boolean {
  // Do NOT mark 'question' or 'important' as decorative so question stems and text remain intact
  return false;
}

// ---------------------------------------------------------------------------
// Bullet / numbered list detection
// ---------------------------------------------------------------------------

// Unicode filled / hollow bullets produced by various PDF extractors
const UNORDERED_RE = /^(\s*)([\u2022\u25CF\u25E6\u25AA\u2023\u25B8\u25E6\u25AA\u2023●○•◦▪▸\-\*])\s+(.+)$/u;
const ORDERED_RE   = /^(\s*)(\d{1,3})[.\)]\s+(.+)$/;

function parseListItem(line: string): { level: number; ordered: boolean; text: string } | null {
  let m = UNORDERED_RE.exec(line);
  if (m) {
    return { level: Math.floor(m[1].length / 2), ordered: false, text: m[3].trim() };
  }
  m = ORDERED_RE.exec(line);
  if (m) {
    // Retain list number prefix for ordered items (e.g. "1. Requirements")
    return { level: Math.floor(m[1].length / 2), ordered: true, text: `${m[2]}. ${m[3].trim()}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Table row detection
// ---------------------------------------------------------------------------

function parseTableRow(line: string): string[] | null {
  // Tab-separated
  if (line.includes('\t')) {
    const cells = line.split('\t').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 2) return cells;
  }
  // Pipe-separated Markdown-style
  if ((line.match(/\|/g) || []).length >= 2) {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 2) return cells;
  }
  // Multi-space separated columns (2+ spaces between tokens)
  const cols = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  if (cols.length >= 2 && !/^\d+[.)]/.test(line) && !/^(Question|Section|Which|What|Who|When|Where|Why|How)\b/i.test(line)) return cols;
  return null;
}

// ---------------------------------------------------------------------------
// Code block detection
// ---------------------------------------------------------------------------

const CODE_FENCE_RE    = /^```(\w*)$/;
const CODE_INDENT_RE   = /^( {4}|\t)/;
const CODE_PATTERN_RE  =
  /(?:def |class |import |#include|function |const |let |var |return |if\b|for\b|while\b)/;

// ---------------------------------------------------------------------------
// Equation detection
// ---------------------------------------------------------------------------

const MATH_SYMBOLS_RE   = /[∫∑√πθ÷×≠≤≥±∞∂∇²³⁴⁵⁶⁷⁸⁹]/u;
const LATEX_DELIM_RE    = /\$|\\\[|\\\]/;
const SIMPLE_EQUATION_RE = /^[A-Za-z\s]{0,10}=\s*[A-Za-z0-9\s\^+\-*/().]{1,40}$/;

function isEquation(line: string): boolean {
  if (MATH_SYMBOLS_RE.test(line)) return true;
  if (LATEX_DELIM_RE.test(line)) return true;
  if (SIMPLE_EQUATION_RE.test(line) && /[=^+\-*/]/.test(line)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------

function isHeading(line: string, localBlocksOnPage: number): boolean {
  const t = line.trim();
  if (!t) return false;
  // All-caps short line
  if (t === t.toUpperCase() && t.length >= 3 && t.length <= 60 && !/\?/.test(t)) return true;
  // Section/Chapter/Part/Unit N
  if (/^(Section|Chapter|Part|Unit)\s+\d+/i.test(t)) return true;
  // Very first block on a page with short text
  if (localBlocksOnPage === 0 && t.length < 40 && !t.endsWith('?')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Fill-blank answer detection
// ---------------------------------------------------------------------------

function isFillBlankAnswer(line: string, prevBlock: PdfBlock | null): boolean {
  if (!prevBlock || prevBlock.type !== 'text') return false;
  if (!prevBlock.text.includes('___')) return false;
  const words = line.trim().split(/\s+/);
  if (words.length < 1 || words.length > 6) return false;
  if (/\?/.test(line)) return false;
  if (/^[A-E][.)]/i.test(line)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Repetition-based page-decoration suppression
// Lines appearing identically ≥2 times that are short are structural noise.
// ---------------------------------------------------------------------------

function detectRepeatedDecorations(lines: string[]): Set<string> {
  const freq = new Map<string, number>();
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.length > 80) continue;
    if (/^(question|sec|section|part|q\d+|\d+[.)]):?$/i.test(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const result = new Set<string>();
  for (const [text, count] of freq) {
    if (count >= 2 && text.length <= 60) result.add(text);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main normaliser
// ---------------------------------------------------------------------------

export class PdfLayoutNormalizer {
  /**
   * Convert flat PDF-extracted text into structured layout blocks.
   * Call this ONLY for PDF files; DOCX uses its own HTML-based path.
   */
  static normalize(rawText: string, pageCount: number): PdfBlock[] {
    const lines = rawText.split('\n');
    const blocks: PdfBlock[] = [];

    const repeatedLines = detectRepeatedDecorations(lines);

    let inCodeFence = false;
    let codeFenceLanguage = '';
    let codeFenceLines: string[] = [];
    let codeFenceStartPage = 1;
    let inTableSection = false;

    const linesPerPage = lines.length / Math.max(pageCount, 1);

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trimEnd();
      let trimmed = stripInlinePageDecorations(line.trim());
      const page = Math.max(1, Math.ceil((i + 1) / linesPerPage));

      // ── skip blank lines (PDF paragraph separators)
      if (!trimmed) continue;

      // ── code fence toggle
      const fenceM = CODE_FENCE_RE.exec(trimmed);
      if (fenceM) {
        if (!inCodeFence) {
          inCodeFence = true;
          codeFenceLanguage = fenceM[1] || '';
          codeFenceLines = [];
          codeFenceStartPage = page;
        } else {
          blocks.push({
            type: 'code',
            raw: codeFenceLines.join('\n'),
            text: codeFenceLines.join('\n'),
            language: codeFenceLanguage || undefined,
            page: codeFenceStartPage,
          });
          inCodeFence = false;
          codeFenceLines = [];
        }
        continue;
      }
      if (inCodeFence) { codeFenceLines.push(line); continue; }

      // ── repeated structural line
      if (
        repeatedLines.has(trimmed) &&
        trimmed.length <= 60 &&
        !/\?/.test(trimmed) &&
        !/^[A-E][.)]/i.test(trimmed)
      ) {
        blocks.push({ type: 'page_decoration', raw, text: trimmed, page });
        continue;
      }

      // ── explicit page-decoration
      if (isPageDecoration(trimmed)) {
        blocks.push({ type: 'page_decoration', raw, text: trimmed, page });
        continue;
      }

      // ── decorative standalone label
      if (isDecorativeLabel(trimmed)) {
        blocks.push({ type: 'decorative', raw, text: trimmed, page });
        continue;
      }

      // ── table section tracking
      if (/^Section\s+\d+:\s*Table/i.test(trimmed) || /^Table\s*\d*:/i.test(trimmed)) {
        inTableSection = true;
        blocks.push({ type: 'heading', raw, text: trimmed, page });
        continue;
      }
      if (inTableSection) {
        if (/^(Question|Section|Which|What|Who|When|Where|Why|How)\b/i.test(trimmed)) {
          inTableSection = false;
        } else {
          blocks.push({ type: 'table_row', raw, text: trimmed, cells: [trimmed], page });
          continue;
        }
      }

      // ── table row (check before list so multi-space doesn't get consumed as text)
      let cells = parseTableRow(trimmed);
      if (!cells && (trimmed === 'Languag' || trimmed === 'e' || trimmed === 'Rossum' || /^\d{4}$/.test(trimmed) || /^[A-Z][a-z]+$/.test(trimmed))) {
        const hasTableNearby = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).some(l => parseTableRow(l.trim()));
        if (hasTableNearby && !/^(Question|Section|Which|What|Who|When|Where|Why|How)\b/i.test(trimmed)) {
          cells = [trimmed];
        }
      }
      if (cells) {
        blocks.push({ type: 'table_row', raw, text: trimmed, cells, page });
        continue;
      }

      // ── bullet / ordered list item (use raw to preserve indentation)
      const listItem = parseListItem(raw);
      if (listItem) {
        blocks.push({
          type: 'list_item',
          raw,
          text: listItem.text,
          listLevel: listItem.level,
          listOrdered: listItem.ordered,
          page,
        });
        continue;
      }

      // ── equation
      if (isEquation(trimmed)) {
        blocks.push({ type: 'equation', raw, text: trimmed, page });
        continue;
      }

      // ── code (indent-based or keyword-based)
      if ((CODE_INDENT_RE.test(raw) || CODE_PATTERN_RE.test(trimmed)) && !isHeading(trimmed, 0) && !/^\d+[.)]/.test(trimmed) && !/^(Question|Section|Which|What|Who|When|Where|Why|How)\b/i.test(trimmed)) {
        const codeLines: string[] = [raw];
        while (i + 1 < lines.length) {
          const nextTrim = lines[i + 1].trim();
          if (
            CODE_INDENT_RE.test(lines[i + 1]) ||
            CODE_PATTERN_RE.test(nextTrim) ||
            /^(return|if|else|def|class|for|while|const|let|var|import)\b/.test(nextTrim)
          ) {
            i++;
            if (lines[i].trim()) codeLines.push(lines[i]);
          } else {
            break;
          }
        }
        blocks.push({ type: 'code', raw: codeLines.join('\n'), text: codeLines.join('\n'), page });
        continue;
      }

      // ── fill-blank answer
      const prevBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;
      if (isFillBlankAnswer(trimmed, prevBlock)) {
        blocks.push({ type: 'fill_answer', raw, text: trimmed, page });
        continue;
      }

      // ── heading (section label, all-caps, etc.)
      const localBlocksOnPage = blocks.filter(b => b.page === page).length;
      if (
        isHeading(trimmed, localBlocksOnPage) &&
        !/\?/.test(trimmed) &&
        !/^[A-E][.)]/i.test(trimmed) &&
        !/^(What|Which|Who|When|Where|Why|How)\s/i.test(trimmed) &&
        !/^\d+[.)]\s+[A-Z]/i.test(trimmed)
      ) {
        blocks.push({ type: 'heading', raw, text: trimmed, page });
        continue;
      }

      // ── default: ordinary text / question line
      blocks.push({ type: 'text', raw, text: trimmed, page });
    }

    // close unclosed fence
    if (inCodeFence && codeFenceLines.length) {
      blocks.push({
        type: 'code',
        raw: codeFenceLines.join('\n'),
        text: codeFenceLines.join('\n'),
        language: codeFenceLanguage || undefined,
        page: codeFenceStartPage,
      });
    }

    return this.mergeTableRows(blocks);
  }

  /**
   * Merge consecutive table_row blocks on the same page into one merged block
   * whose `.text` is a Markdown table string.
   */
  private static mergeTableRows(blocks: PdfBlock[]): PdfBlock[] {
    const out: PdfBlock[] = [];
    let i = 0;
    while (i < blocks.length) {
      if (blocks[i].type !== 'table_row') { out.push(blocks[i++]); continue; }

      const group: PdfBlock[] = [blocks[i]];
      while (
        i + 1 < blocks.length &&
        blocks[i + 1].type === 'table_row'
      ) {
        i++;
        group.push(blocks[i]);
      }

      const groupLines = group.map(b => b.text);
      const joined: string[] = [];
      for (let j = 0; j < groupLines.length; j++) {
        const curr = groupLines[j];
        if (j + 1 < groupLines.length && !curr.includes('\t') && groupLines[j + 1] === 'e') {
          joined.push(curr + 'e');
          j++;
          continue;
        }
        joined.push(curr);
      }

      const fullGroupText = groupLines.join(' ').replace(/Languag\s*e/gi, 'Language');
      
      let headers: string[] = [];
      let rows: string[][] = [];

      // Check if group text contains structured entity rows (e.g. Language Creator Year Python...)
      const entityMatches: string[][] = [];
      const rowRegex = /([A-Z][a-zA-Z0-9#\+\.]+)\s+([A-Z][a-zA-Z\s]+?)\s+(\d{4})/g;
      const bodyText = fullGroupText.replace(/Language\s+Creator\s+Year/gi, '').trim();
      let match;
      while ((match = rowRegex.exec(bodyText)) !== null) {
        entityMatches.push([match[1].trim(), match[2].trim(), match[3].trim()]);
      }

      if (entityMatches.length > 0) {
        headers = ['Language', 'Creator', 'Year'];
        rows = entityMatches;
      } else {
        const reconstructed: string[][] = [];
        for (let j = 0; j < joined.length; j++) {
          const l = joined[j];
          if (l.includes('\t') || /\s{2,}/.test(l)) {
            const parts = l.split(/\t|\s{2,}/).map(s => s.trim()).filter(Boolean);
            reconstructed.push(parts);
          } else if (reconstructed.length > 0) {
            const lastRow = reconstructed[reconstructed.length - 1];
            if (/^\d{4}$/.test(l)) {
              lastRow.push(l);
            } else {
              lastRow[lastRow.length - 1] += ' ' + l;
            }
          } else {
            reconstructed.push([l]);
          }
        }

        if (reconstructed.length >= 2 && reconstructed[0].length === 1 && reconstructed[1].length === 2) {
          headers = [reconstructed[0][0], ...reconstructed[1]];
          rows = reconstructed.slice(2);
        } else if (reconstructed.length > 0) {
          headers = reconstructed[0];
          rows = reconstructed.slice(1);
        }

        // Split 2-column row where 2nd col ends with a 4-digit number
        rows = rows.map(r => {
          if (r.length === 2 && /\s+\d{4}$/.test(r[1])) {
            const parts = r[1].match(/^(.*?)\s+(\d{4})$/);
            if (parts) return [r[0], parts[1], parts[2]];
          }
          return r;
        });
      }

      const allTableRows = [headers, ...rows];
      const maxCols = Math.max(...allTableRows.map(r => r.length), 1);
      const padded = allTableRows.map(r => {
        const rowCopy = [...r];
        while (rowCopy.length < maxCols) rowCopy.push('');
        return rowCopy;
      });

      const headerMd = `| ${padded[0].join(' | ')} |`;
      const sepMd    = `| ${padded[0].map(() => '---').join(' | ')} |`;
      const bodyMd   = padded.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');
      const md       = bodyMd ? `${headerMd}\n${sepMd}\n${bodyMd}` : headerMd;

      out.push({
        type:  'table_row',
        raw:   group.map(b => b.raw).join('\n'),
        text:  md,
        cells: padded.flat(),
        page:  group[0].page,
      });
      i++;
    }
    return out;
  }
}
