/**
 * Structured paste/TXT/MD parsing — preserves tables and fenced code as AST nodes
 * instead of flattening everything to paragraphs.
 */

import type { V2ASTNode, V2CodeNode, V2ParagraphNode, V2TableCellNode, V2TableNode } from './types.js';
import { normalizePasteText } from './pasteTextNormalize.js';

export interface StructuredPasteResult {
  rawText: string;
  blocks: V2ASTNode[];
  tables: V2TableNode[];
  codeBlocks: V2CodeNode[];
}

function makeParagraph(id: string, text: string): V2ParagraphNode {
  return {
    id,
    type: 'paragraph',
    plainText: text,
    runs: [{ id: `${id}_r`, type: 'run', text, formatting: {} }],
  };
}

function makeCodeNode(id: string, language: string, code: string): V2CodeNode {
  const lines = code.replace(/\n$/, '').split('\n');
  return {
    id,
    type: 'code',
    language: language || detectLanguage(code),
    code: code.replace(/\n$/, ''),
    indentationPreserved: true,
    lineNumbers: lines.map((_, i) => i + 1),
    comments: lines.filter((l) => /^\s*(#|\/\/)/.test(l)),
  };
}

function detectLanguage(code: string): string {
  if (/^\s*<[!/?a-z]/i.test(code) || /<\/?[a-z][\s\S]*>/i.test(code)) return 'html';
  if (/\bdef\s+\w+\s*\(|\bimport\s+\w+|print\s*\(|elif\s+/i.test(code)) return 'python';
  if (/\bpublic\s+class\b|System\.out|void\s+main\s*\(/i.test(code)) return 'java';
  if (/#include\b|std::|int\s+main\s*\(/i.test(code)) return 'cpp';
  if (/\bSELECT\b|\bFROM\b|\bWHERE\b|\bINSERT\s+INTO\b/i.test(code)) return 'sql';
  if (/\b(const|let|var)\s+\w+|console\.log|=>|function\s*\(/i.test(code)) return 'javascript';
  return 'text';
}

function parsePipeRow(line: string): string[] {
  const parts = line.split('|').map((c) => c.trim());
  if (parts.length && parts[0] === '') parts.shift();
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function isSeparatorRow(line: string): boolean {
  const cells = parsePipeRow(line);
  if (!cells.length) return /^\s*\|?\s*:?-{2,}/.test(line);
  return cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));
}

function isMarkdownTableLine(line: string): boolean {
  return line.includes('|') && parsePipeRow(line).length >= 2;
}

function buildTableNode(id: string, headerLine: string, bodyLines: string[]): V2TableNode | null {
  const headers = parsePipeRow(headerLine);
  if (headers.length < 2) return null;
  const grid: V2TableCellNode[][] = bodyLines.map((line, rIdx) => {
    const cells = parsePipeRow(line);
    while (cells.length < headers.length) cells.push('');
    return headers.map((_, cIdx) => {
      const cell = cells[cIdx] || '';
      return {
        rowIndex: rIdx,
        colIndex: cIdx,
        paragraphs: [{
          id: `${id}_c_${rIdx}_${cIdx}`,
          type: 'paragraph' as const,
          plainText: cell,
          runs: [{ id: `${id}_r_${rIdx}_${cIdx}`, type: 'run' as const, text: cell, formatting: {} }],
        }],
      };
    });
  });
  if (!grid.length) return null;

  const htmlRows = [
    `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`,
    ...grid.map((row) =>
      `<tr>${row.map((cell) => `<td>${escapeHtml(cell.paragraphs.map((p) => p.plainText).join(' '))}</td>`).join('')}</tr>`,
    ),
  ].join('');

  return {
    id,
    type: 'table',
    rowCount: grid.length + 1,
    columnCount: headers.length,
    headers,
    grid,
    html: `<table class="v2-table" border="1" style="border-collapse:collapse;width:100%"><tbody>${htmlRows}</tbody></table>`,
    caption: '',
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** RFC4180-ish CSV split (handles quoted commas). */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function looksLikeCsvTable(lines: string[], start: number): boolean {
  const sample = lines.slice(start, Math.min(start + 6, lines.length)).filter((l) => l.trim());
  if (sample.length < 2) return false;
  const cols = sample.map((l) => splitCsvLine(l.trim()));
  if (cols[0].length < 3) return false;
  // Consistent column counts and quiz-ish header aliases
  const width = cols[0].length;
  if (!cols.every((c) => Math.abs(c.length - width) <= 1)) return false;
  const header = cols[0].join(' ').toLowerCase();
  return /question|prompt|problem|option|choice|answer|correct|marks|points/.test(header);
}

/** Tab-separated, CSV, or multi-space columns (≥3 columns, ≥2 data rows) */
function tryParseDelimitedTable(lines: string[], start: number): { table: V2TableNode; end: number } | null {
  const sample = lines.slice(start, Math.min(start + 12, lines.length));
  if (sample.length < 2) return null;

  const splitLine = (line: string): string[] => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    if (looksLikeCsvTable(lines, start) || (line.includes(',') && /["']/.test(line))) {
      return splitCsvLine(line);
    }
    if (line.includes(',') && looksLikeCsvTable(lines, start)) {
      return splitCsvLine(line);
    }
    // 2+ spaces as column separator (spreadsheet paste without tabs)
    if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    return [];
  };

  const first = splitLine(sample[0]);
  if (first.length < 3) return null;

  const rows: string[][] = [];
  let end = start;
  for (let i = start; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    if (cols.length < Math.max(2, Math.floor(first.length * 0.6))) break;
    // pad/truncate to header width
    while (cols.length < first.length) cols.push('');
    rows.push(cols.slice(0, first.length));
    end = i;
  }
  if (rows.length < 2) return null;

  const headers = rows[0];
  const body = rows.slice(1);
  const id = `tsv_tbl_${start + 1}`;
  const grid: V2TableCellNode[][] = body.map((r, rIdx) =>
    r.map((cell, cIdx) => ({
      rowIndex: rIdx,
      colIndex: cIdx,
      paragraphs: [{
        id: `${id}_c_${rIdx}_${cIdx}`,
        type: 'paragraph' as const,
        plainText: cell,
        runs: [{ id: `${id}_r_${rIdx}_${cIdx}`, type: 'run' as const, text: cell, formatting: {} }],
      }],
    })),
  );

  return {
    end,
    table: {
      id,
      type: 'table',
      rowCount: grid.length + 1,
      columnCount: headers.length,
      headers,
      grid,
      caption: '',
    },
  };
}

/**
 * Parse paste/markdown/txt into structured AST blocks with tables + fenced code preserved.
 */
export function parseStructuredPasteText(rawInput: string): StructuredPasteResult {
  // Preserve indentation inside code fences — normalize newlines/tabs outside only.
  const rawText = String(rawInput || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = rawText.split('\n');
  const blocks: V2ASTNode[] = [];
  const tables: V2TableNode[] = [];
  const codeBlocks: V2CodeNode[] = [];

  let i = 0;
  let pIdx = 1;
  let tIdx = 1;
  let cIdx = 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    const fenceOpen = trimmed.match(/^```([a-zA-Z0-9_+-]*)\s*$/);
    if (fenceOpen) {
      const lang = fenceOpen[1] || '';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        // Preserve exact indentation/content
        codeLines.push(lines[i]);
        i += 1;
      }
      // consume closing fence
      if (i < lines.length && /^\s*```\s*$/.test(lines[i])) i += 1;

      const code = codeLines.join('\n');
      if (code.trim().length > 0) {
        const node = makeCodeNode(`txt_code_${cIdx++}`, lang, code);
        codeBlocks.push(node);
        blocks.push(node);
      }
      continue;
    }

    // Markdown pipe table
    if (isMarkdownTableLine(trimmed)) {
      const headerLine = trimmed;
      const tableLines = [headerLine];
      let j = i + 1;
      while (j < lines.length && isMarkdownTableLine(lines[j].trim())) {
        tableLines.push(lines[j].trim());
        j += 1;
      }
      const bodyLines = tableLines.slice(1).filter((l) => !isSeparatorRow(l));
      if (bodyLines.length >= 1 && tableLines.length >= 2) {
        const table = buildTableNode(`txt_tbl_${tIdx++}`, headerLine, bodyLines);
        if (table) {
          tables.push(table);
          blocks.push(table);
          i = j;
          continue;
        }
      }
    }

    // Tab / CSV / multi-space delimited table
    if (
      trimmed.includes('\t')
      || /\S\s{2,}\S/.test(trimmed)
      || looksLikeCsvTable(lines, i)
    ) {
      const delim = tryParseDelimitedTable(lines, i)
        || tryParseDelimitedTable(lines.map((l) => l.trimEnd()), i);
      if (delim && delim.table.columnCount >= 3) {
        const id = `txt_tbl_${tIdx++}`;
        const table = { ...delim.table, id };
        tables.push(table);
        blocks.push(table);
        i = delim.end + 1;
        continue;
      }
    }

    // Skip empty lines
    if (!trimmed) {
      i += 1;
      continue;
    }

    // Normal paragraph / heading (normalize whitespace but keep content)
    const plain = normalizePasteText(trimmed);
    if (plain) {
      blocks.push(makeParagraph(`txt_p_${pIdx++}`, plain.startsWith('#') ? plain : plain));
      if (blocks[blocks.length - 1].type === 'paragraph' && plain.startsWith('#')) {
        (blocks[blocks.length - 1] as any).type = 'heading';
      }
    }
    i += 1;
  }

  return {
    rawText: normalizePasteText(rawText),
    blocks,
    tables,
    codeBlocks,
  };
}

/** Semantic header roles for quiz-like tables */
export type QuizTableColumnRole =
  | 'ignore'
  | 'number'
  | 'question'
  | 'option'
  | 'answer'
  | 'marks'
  | 'difficulty'
  | 'explanation'
  | 'type';

export interface QuizTableColumnMap {
  role: QuizTableColumnRole;
  optionLabel?: string; // A/B/C/D or Option 1
  header: string;
  index: number;
}

export function mapQuizTableHeaders(headers: string[]): QuizTableColumnMap[] {
  const usedOptions = new Set<string>();
  return headers.map((header, index) => {
    const h = header.trim().toLowerCase().replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ');

    if (/^(q\.?\s*no|qno|no\.?|s\.?\s*no|#|number|qid)$/i.test(h) || h === 'q') {
      return { role: 'number', header, index };
    }
    if (/^(question|question text|prompt|problem|stem|q text)$/i.test(h)) {
      return { role: 'question', header, index };
    }
    if (/^(correct(?:\s+answer)?|answer(?:\s+key)?|key|ans|solution key)$/i.test(h)) {
      return { role: 'answer', header, index };
    }
    if (/^(marks?|points?|score|weight)$/i.test(h)) {
      return { role: 'marks', header, index };
    }
    if (/^(difficulty|level|bloom)$/i.test(h)) {
      return { role: 'difficulty', header, index };
    }
    if (/^(explanation|reason|solution|feedback|why)$/i.test(h)) {
      return { role: 'explanation', header, index };
    }
    if (/^(type|question type)$/i.test(h)) {
      return { role: 'type', header, index };
    }

    // Option columns: A, B, Option A, Choice 1, etc.
    const optLetter = h.match(/^(?:option|choice|answer)?\s*([a-d])$/i) || h.match(/^([a-d])$/i);
    if (optLetter) {
      const label = optLetter[1].toUpperCase();
      if (!usedOptions.has(label)) {
        usedOptions.add(label);
        return { role: 'option', optionLabel: label, header, index };
      }
    }
    const optNum = h.match(/^(?:option|choice)\s*(\d+)$/i);
    if (optNum) {
      const n = parseInt(optNum[1], 10);
      const label = String.fromCharCode(64 + n); // 1->A
      if (n >= 1 && n <= 12 && !usedOptions.has(label)) {
        usedOptions.add(label);
        return { role: 'option', optionLabel: label, header, index };
      }
    }

    return { role: 'ignore', header, index };
  });
}

export function isQuizLikeTable(headers: string[]): boolean {
  const map = mapQuizTableHeaders(headers);
  const hasQuestion = map.some((m) => m.role === 'question');
  const optionCount = map.filter((m) => m.role === 'option').length;
  const hasAnswer = map.some((m) => m.role === 'answer');
  // Classic MCQ table OR Q+Answer(+marks) short-answer table
  return hasQuestion && (optionCount >= 2 || hasAnswer);
}

export interface MaterializedQuizRow {
  stem: string;
  options: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  points?: number;
  difficulty?: string;
  explanation?: string;
  sourceQuestionNumber?: number;
}

export function materializeQuizRowsFromTable(table: V2TableNode): MaterializedQuizRow[] {
  const map = mapQuizTableHeaders(table.headers || []);
  if (!isQuizLikeTable(table.headers || [])) return [];

  const qCol = map.find((m) => m.role === 'question');
  if (!qCol) return [];
  const optCols = map.filter((m) => m.role === 'option');
  const ansCol = map.find((m) => m.role === 'answer');
  const marksCol = map.find((m) => m.role === 'marks');
  const diffCol = map.find((m) => m.role === 'difficulty');
  const expCol = map.find((m) => m.role === 'explanation');
  const numCol = map.find((m) => m.role === 'number');

  const cellText = (row: V2TableCellNode[], idx: number): string =>
    (row[idx]?.paragraphs || []).map((p) => p.plainText).join(' ').trim();

  const rows: MaterializedQuizRow[] = [];
  for (const row of table.grid || []) {
    const stem = cellText(row, qCol.index);
    if (!stem || stem.length < 2) continue;

    const options = optCols
      .map((c) => ({ label: c.optionLabel || 'A', text: cellText(row, c.index) }))
      .filter((o) => o.text.length > 0);

    let correctAnswer = ansCol ? cellText(row, ansCol.index) : undefined;
    if (correctAnswer) {
      // Normalize "A" / "A." / "Paris"
      const letter = correctAnswer.match(/^([A-Da-d])\b/);
      if (letter) correctAnswer = letter[1].toUpperCase();
    }

    const marksRaw = marksCol ? cellText(row, marksCol.index) : '';
    const points = marksRaw && /^\d+(\.\d+)?$/.test(marksRaw) ? Math.round(parseFloat(marksRaw)) : undefined;
    const difficulty = diffCol ? cellText(row, diffCol.index) || undefined : undefined;
    const explanation = expCol ? cellText(row, expCol.index) || undefined : undefined;
    const numRaw = numCol ? cellText(row, numCol.index) : '';
    const sourceQuestionNumber = numRaw && /^\d+$/.test(numRaw) ? parseInt(numRaw, 10) : undefined;

    rows.push({
      stem,
      options,
      correctAnswer,
      points,
      difficulty,
      explanation,
      sourceQuestionNumber,
    });
  }
  return rows;
}
