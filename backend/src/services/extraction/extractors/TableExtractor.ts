import { TableNode, TableRowNode, TableCellNode } from '../types.js';

export class TableExtractor {
  /**
   * Parse OpenXML `<w:tbl>` snippet into structured TableNode
   */
  public static parseOpenXmlTable(tblXml: string, tableId: string): TableNode {
    const rows: TableRowNode[] = [];
    // Match rows <w:tr>
    const trMatches = tblXml.match(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/gi) || [];
    let maxCols = 0;

    trMatches.forEach((trXml, rIdx) => {
      const isHeader = rIdx === 0 || /<w:tblHeader\/>/i.test(trXml);
      const cells: TableCellNode[] = [];
      // Match cells <w:tc>
      const tcMatches = trXml.match(/<w:tc[^>]*>([\s\S]*?)<\/w:tc>/gi) || [];

      let cIdx = 0;
      tcMatches.forEach((tcXml) => {
        // Grid span (colspan)
        const gridSpanMatch = tcXml.match(/<w:gridSpan\s+w:val="(\d+)"/i);
        const colSpan = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : 1;

        // Vertical merge (rowspan)
        const vMergeMatch = tcXml.match(/<w:vMerge\s+(?:w:val="([^"]+)")?/i);
        let rowSpan = 1;
        if (vMergeMatch) {
          const vMergeVal = vMergeMatch[1] || 'continue';
          if (vMergeVal === 'restart') {
            rowSpan = 1; // Restart marker
          } else {
            rowSpan = 0; // Merged with upper cell
          }
        }

        // Shading / Cell background color <w:shd w:fill="HEX"/>
        const shdMatch = tcXml.match(/<w:shd[^>]*w:fill="([A-Fa-f0-9]{6}|auto)"/i);
        const backgroundColor = shdMatch && shdMatch[1] !== 'auto' ? `#${shdMatch[1]}` : undefined;

        // Alignment <w:jc w:val="center|left|right"/>
        const jcMatch = tcXml.match(/<w:jc\s+w:val="([^"]+)"/i);
        const alignment = (jcMatch ? jcMatch[1].toLowerCase() : 'left') as 'left' | 'center' | 'right';

        // Extract cell paragraph texts <w:t>
        const tMatches = tcXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
        const plainText = tMatches.map(t => t.replace(/<[^>]+>/g, '')).join(' ').trim();

        const cellNode: TableCellNode = {
          id: `${tableId}_r${rIdx}_c${cIdx}`,
          rowIndex: rIdx,
          colIndex: cIdx,
          rowSpan,
          colSpan,
          backgroundColor,
          alignment,
          children: [
            {
              type: 'paragraph',
              id: `${tableId}_r${rIdx}_c${cIdx}_p`,
              alignment,
              runs: [{ type: 'run', text: plainText, formatting: {} }],
              plainText,
            },
          ],
          plainText,
        };

        cells.push(cellNode);
        cIdx += colSpan;
      });

      if (cIdx > maxCols) maxCols = cIdx;

      rows.push({
        id: `${tableId}_tr_${rIdx}`,
        rowIndex: rIdx,
        isHeader,
        cells,
      });
    });

    const tablePlainText = rows
      .map(r => r.cells.map(c => c.plainText).join(' | '))
      .join('\n');

    return {
      type: 'table',
      id: tableId,
      rowCount: rows.length,
      colCount: maxCols,
      rows,
      plainText: tablePlainText,
    };
  }

  /**
   * Parse HTML `<table>` string into structured TableNode
   */
  public static parseHtmlTable(htmlTable: string, tableId: string): TableNode {
    const rows: TableRowNode[] = [];
    const trMatches = htmlTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    let maxCols = 0;

    trMatches.forEach((trXml, rIdx) => {
      const isHeader = rIdx === 0 || /<th/i.test(trXml);
      const cells: TableCellNode[] = [];
      const cellMatches = trXml.match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi) || [];

      let cIdx = 0;
      cellMatches.forEach((cellXml) => {
        const colspanMatch = cellXml.match(/colspan=["']?(\d+)["']?/i);
        const rowspanMatch = cellXml.match(/rowspan=["']?(\d+)["']?/i);
        const colSpan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;
        const rowSpan = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1;

        const bgMatch = cellXml.match(/(?:style=["'][^"']*background(?:-color)?:\s*([^;]+)|bgcolor=["']?([^"'\s>]+))/i);
        const backgroundColor = bgMatch ? (bgMatch[1] || bgMatch[2]).trim() : undefined;

        const plainText = cellXml.replace(/<[^>]+>/g, '').trim();

        cells.push({
          id: `${tableId}_r${rIdx}_c${cIdx}`,
          rowIndex: rIdx,
          colIndex: cIdx,
          rowSpan,
          colSpan,
          backgroundColor,
          children: [
            {
              type: 'paragraph',
              id: `${tableId}_r${rIdx}_c${cIdx}_p`,
              runs: [{ type: 'run', text: plainText, formatting: {} }],
              plainText,
            },
          ],
          plainText,
        });

        cIdx += colSpan;
      });

      if (cIdx > maxCols) maxCols = cIdx;
      rows.push({ id: `${tableId}_tr_${rIdx}`, rowIndex: rIdx, isHeader, cells });
    });

    const plainText = rows.map(r => r.cells.map(c => c.plainText).join(' | ')).join('\n');

    return {
      type: 'table',
      id: tableId,
      rowCount: rows.length,
      colCount: maxCols,
      rows,
      plainText,
    };
  }
}
