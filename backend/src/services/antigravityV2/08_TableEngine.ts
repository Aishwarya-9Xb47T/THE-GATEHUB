import { V2TableNode, V2TableCellNode } from './types.js';

function normalizeHeaders(headers: string[]): string {
  return (headers || []).map((h) => String(h || '').trim().toLowerCase()).join('|');
}

function rowKey(row: V2TableCellNode[]): string {
  return row
    .map((cell) => cell.paragraphs.map((p) => p.plainText).join(' ').trim().toLowerCase())
    .join('\t');
}

function tableSignature(table: Pick<V2TableNode, 'headers' | 'grid'>): string {
  return `${normalizeHeaders(table.headers || [])}::${(table.grid || []).map(rowKey).join('\n')}`;
}

function isSubsetOrDuplicate(
  candidate: Pick<V2TableNode, 'headers' | 'grid'>,
  existing: Pick<V2TableNode, 'headers' | 'grid'>,
): boolean {
  if (normalizeHeaders(candidate.headers || []) !== normalizeHeaders(existing.headers || [])) {
    return false;
  }
  const existingRows = new Set((existing.grid || []).map(rowKey));
  const candidateRows = (candidate.grid || []).map(rowKey);
  if (candidateRows.length === 0) return true;
  // Exact duplicate or partial re-parse (common when last markdown row lacks trailing newline)
  return candidateRows.every((r) => existingRows.has(r));
}

export class TableEngine {
  /**
   * Table grid matrix construction, merged cell span resolution, and nested table unspooling.
   * Never re-adds a markdown table that NativeParser / structured paste already extracted.
   */
  public static processTables(existingTables: V2TableNode[], rawText: string): V2TableNode[] {
    const tables: V2TableNode[] = [...existingTables];

    // Allow final row without trailing newline (paste buffers often omit it)
    const tableRegex = /(?:\|[^\n]+\|(?:\n|$))+/g;
    let m;
    let idx = tables.length + 1;

    while ((m = tableRegex.exec(rawText)) !== null) {
      const lines = m[0].trim().split('\n').filter(Boolean);
      if (lines.length >= 2) {
        const parseRow = (line: string) => line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        const headers = parseRow(lines[0]);
        // Skip markdown separator rows; keep all body rows (incl. final row w/o trailing newline)
        const bodyLines = lines.slice(1).filter((l) => !/^\s*\|?\s*:?-{2,}[\s|:-]*\|?\s*$/.test(l));
        const grid: V2TableCellNode[][] = bodyLines.map((l, rIdx) => 
          parseRow(l).map((cell, cIdx) => ({
            rowIndex: rIdx,
            colIndex: cIdx,
            paragraphs: [{
              id: `md_cell_p_${rIdx}_${cIdx}`,
              type: 'paragraph' as const,
              plainText: cell,
              runs: [{ id: `r_md_${rIdx}_${cIdx}`, type: 'run' as const, text: cell, formatting: {} }],
            }],
          }))
        );

        if (headers.length > 0 && grid.length > 0) {
          const candidate: V2TableNode = {
            id: `v2_tbl_${idx++}`,
            type: 'table',
            rowCount: grid.length + 1,
            columnCount: headers.length,
            headers,
            grid,
            caption: `Table ${idx}`,
          };
          if (tables.some((t) => isSubsetOrDuplicate(candidate, t))) continue;
          tables.push(candidate);
        }
      }
    }

    return tables;
  }
}
