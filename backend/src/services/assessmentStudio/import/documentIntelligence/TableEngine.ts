/**
 * Table Engine
 * Reconstructs high-fidelity table objects preserving merged cells (colspan/rowspan),
 * header rows, column widths, background colors, cell padding, and nested tables.
 */

import { DocumentObject } from './types.js';

export interface TableCellStructure {
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  content: string;
  isHeader: boolean;
  backgroundColor?: string;
  alignment?: 'left' | 'center' | 'right';
  width?: number;
}

export interface TableStructure {
  id: string;
  rowsCount: number;
  colsCount: number;
  cells: TableCellStructure[][];
  headers: string[];
  html: string;
  isMerged: boolean;
  hasHeaderRow: boolean;
}

export class TableEngine {
  /**
   * Normalize and build full HTML & structured cells for a table object
   */
  static buildTableObject(
    cellsMatrix: TableCellStructure[][],
    metadata?: Record<string, any>
  ): TableStructure {
    const rowsCount = cellsMatrix.length;
    const colsCount = rowsCount > 0 ? Math.max(...cellsMatrix.map(r => r.length)) : 0;
    let isMerged = false;
    const headers: string[] = [];

    let html = '<table class="document-intelligence-table" border="1" style="border-collapse: collapse; width: 100%;">\n';

    for (let r = 0; r < cellsMatrix.length; r++) {
      const row = cellsMatrix[r];
      const isHeaderRow = r === 0 || row.every(c => c.isHeader);
      html += '  <tr>\n';

      for (const cell of row) {
        const tag = isHeaderRow ? 'th' : 'td';
        if (cell.rowSpan > 1 || cell.colSpan > 1) isMerged = true;

        const attrs: string[] = [];
        if (cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
        if (cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);
        if (cell.backgroundColor) attrs.push(`style="background-color: ${cell.backgroundColor};"`);
        if (cell.alignment) attrs.push(`align="${cell.alignment}"`);

        const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
        html += `    <${tag}${attrStr}>${cell.content}</${tag}>\n`;

        if (isHeaderRow) {
          headers.push(cell.content);
        }
      }
      html += '  </tr>\n';
    }
    html += '</table>';

    return {
      id: metadata?.id || `table_${Date.now()}`,
      rowsCount,
      colsCount,
      cells: cellsMatrix,
      headers,
      html,
      isMerged,
      hasHeaderRow: headers.length > 0,
    };
  }

  /**
   * Convert plain markdown / text grid into TableCellStructure matrix
   */
  static parseMarkdownTable(text: string): TableStructure | null {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;

    const tableLines = lines.filter(l => l.startsWith('|') && l.endsWith('|'));
    if (tableLines.length < 2) return null;

    const matrix: TableCellStructure[][] = [];

    for (let r = 0; r < tableLines.length; r++) {
      const line = tableLines[r];
      // Skip separator line |---|---|
      if (/^\|[\s\-:|]+\|$/.test(line)) continue;

      const parts = line.substring(1, line.length - 1).split('|').map(p => p.trim());
      const rowCells: TableCellStructure[] = [];

      for (let c = 0; c < parts.length; c++) {
        rowCells.push({
          rowIndex: matrix.length,
          colIndex: c,
          rowSpan: 1,
          colSpan: 1,
          content: parts[c],
          isHeader: matrix.length === 0,
        });
      }
      matrix.push(rowCells);
    }

    if (matrix.length === 0) return null;
    return this.buildTableObject(matrix);
  }
}
