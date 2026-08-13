import JSZip from 'jszip';
import { HierarchicalDocumentTree, ParagraphNode, TextRunNode, TableNode, TableCellNode, CommentNode, SpeakerNoteNode, ASTNode } from './HierarchicalDocumentTree.js';

export class OpenXmlNativeParser {
  /**
   * Parse DOCX or PPTX OpenXML buffer directly into a HierarchicalDocumentTree AST
   */
  public static async parse(buffer: Buffer, fileName: string, sourceType: 'docx' | 'pptx'): Promise<HierarchicalDocumentTree> {
    const tree = new HierarchicalDocumentTree(fileName.replace(/\.[^/.]+$/, ''));
    const zip = await JSZip.loadAsync(buffer);

    if (sourceType === 'docx') {
      await this.parseDocxOpenXml(zip, tree);
    } else if (sourceType === 'pptx') {
      await this.parsePptxOpenXml(zip, tree);
    }

    return tree;
  }

  /**
   * Direct XML AST parser for DOCX OpenXML
   */
  private static async parseDocxOpenXml(zip: JSZip, tree: HierarchicalDocumentTree): Promise<void> {
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) return;

    // Parse Comments if available (word/comments.xml)
    const commentsXml = await zip.file('word/comments.xml')?.async('string');
    if (commentsXml) {
      const commentMatches = commentsXml.match(/<w:comment[^>]*w:id="(\d+)"[^>]*w:author="([^"]*)"[\s\S]*?<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
      commentMatches.forEach((cm, idx) => {
        const idMatch = cm.match(/w:id="(\d+)"/);
        const authorMatch = cm.match(/w:author="([^"]*)"/);
        const textMatch = cm.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/i);
        if (idMatch && textMatch) {
          tree.comments.push({
            id: idMatch[1],
            author: authorMatch ? authorMatch[1] : 'Author',
            text: textMatch[1].replace(/<[^>]+>/g, '').trim(),
          });
        }
      });
    }

    // Extract Paragraphs & Tables from document.xml
    const childrenNodes: ASTNode[] = [];

    // Table regex matcher <w:tbl>...</w:tbl>
    const pOrTableRegex = /<(w:p|w:tbl)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    let nodeIdx = 1;

    while ((match = pOrTableRegex.exec(docXml)) !== null) {
      const tag = match[1];
      const content = match[0];

      if (tag === 'w:p') {
        const pNode = this.parseParagraphXml(content, `p_${nodeIdx++}`);
        if (pNode.plainText.length > 0) {
          childrenNodes.push(pNode);
        }
      } else if (tag === 'w:tbl') {
        const tableNode = this.parseTableXml(content, `tbl_${nodeIdx++}`);
        if (tableNode.rowCount > 0) {
          childrenNodes.push(tableNode);
        }
      }
    }

    tree.pages.push({
      index: 1,
      title: tree.title,
      type: 'page',
      children: childrenNodes,
    });

    tree.sections.push({
      id: 'sec_docx_main',
      title: 'Document Body',
      level: 1,
      children: childrenNodes,
    });
  }

  /**
   * Direct XML AST parser for PPTX OpenXML slides & notes
   */
  private static async parsePptxOpenXml(zip: JSZip, tree: HierarchicalDocumentTree): Promise<void> {
    const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/i));
    slideFiles.sort((a, b) => {
      const numA = parseInt((a.match(/\d+/) || ['0'])[0], 10);
      const numB = parseInt((b.match(/\d+/) || ['0'])[0], 10);
      return numA - numB;
    });

    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = slideFiles[i];
      const slideNum = i + 1;
      const slideXml = await zip.files[slidePath].async('string');

      const slideChildren: ASTNode[] = [];

      // Extract shapes <p:sp> -> <a:p>
      const pMatches = slideXml.match(/<a:p[^>]*>([\s\S]*?)<\/a:p>/gi) || [];
      pMatches.forEach((pXml, pIdx) => {
        const pNode = this.parsePptxParagraphXml(pXml, `slide_${slideNum}_p_${pIdx + 1}`);
        if (pNode.plainText.length > 0) {
          slideChildren.push(pNode);
        }
      });

      // Speaker Notes (ppt/notesSlides/notesSlideX.xml)
      let speakerNoteNode: SpeakerNoteNode | undefined = undefined;
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
      if (zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('string');
        const notesPMatches = notesXml.match(/<a:p[^>]*>([\s\S]*?)<\/a:p>/gi) || [];
        const notesTexts = notesPMatches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        const fullNotesText = notesTexts.join('\n');

        if (fullNotesText) {
          speakerNoteNode = {
            id: `note_slide_${slideNum}`,
            slideIndex: slideNum,
            text: fullNotesText,
            runs: [{ id: `run_note_${slideNum}`, type: 'run', text: fullNotesText, formatting: {} }],
          };
          tree.speakerNotes.push(speakerNoteNode);
        }
      }

      tree.pages.push({
        index: slideNum,
        title: slideChildren[0] ? (slideChildren[0] as ParagraphNode).plainText : `Slide ${slideNum}`,
        type: 'slide',
        children: slideChildren,
        speakerNotes: speakerNoteNode,
      });
    }
  }

  /**
   * Parse DOCX `<w:p>` into a ParagraphNode with formatted runs `<w:r>`
   */
  private static parseParagraphXml(pXml: string, id: string): ParagraphNode {
    const runs: TextRunNode[] = [];
    let plainText = '';

    // Check for Hyperlink wrapper <w:hyperlink r:id="...">
    const hyperlinkMatch = pXml.match(/<w:hyperlink[^>]*>/i);
    const hyperlinkUrl = hyperlinkMatch ? 'embedded_hyperlink' : undefined;

    // Check for Comment reference <w:commentReference w:id="1"/>
    const commentMatch = pXml.match(/<w:commentReference[^>]*w:id="(\d+)"/i);
    const commentId = commentMatch ? commentMatch[1] : undefined;

    // Extract text runs <w:r>
    const runRegex = /<w:r[^>]*>([\s\S]*?)<\/w:r>/gi;
    let rMatch;
    let runIdx = 1;

    while ((rMatch = runRegex.exec(pXml)) !== null) {
      const rXml = rMatch[0];
      const tMatch = rXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/i);
      if (tMatch) {
        const text = tMatch[1].replace(/<[^>]+>/g, '');
        plainText += text;

        const isBold = /<w:b(\/|\s[^>]*>|>)/i.test(rXml);
        const isItalic = /<w:i(\/|\s[^>]*>|>)/i.test(rXml);
        const isUnderline = /<w:u(\/|\s[^>]*>|>)/i.test(rXml);
        const colorMatch = rXml.match(/<w:color[^>]*w:val="([^"]*)"/i);

        runs.push({
          id: `${id}_r_${runIdx++}`,
          type: 'run',
          text,
          formatting: {
            bold: isBold || undefined,
            italic: isItalic || undefined,
            underline: isUnderline || undefined,
            color: colorMatch ? `#${colorMatch[1]}` : undefined,
            hyperlinkUrl,
            commentId,
          },
        });
      }
    }

    if (runs.length === 0) {
      plainText = pXml.replace(/<[^>]+>/g, '').trim();
      if (plainText) {
        runs.push({
          id: `${id}_r_1`,
          type: 'run',
          text: plainText,
          formatting: { hyperlinkUrl, commentId },
        });
      }
    }

    return {
      id,
      type: plainText.length < 60 && plainText.toUpperCase() === plainText ? 'heading' : 'paragraph',
      runs,
      plainText,
      hyperlinkUrl,
      commentId,
    };
  }

  /**
   * Parse PPTX `<a:p>` into a ParagraphNode with formatted runs `<a:r>`
   */
  private static parsePptxParagraphXml(pXml: string, id: string): ParagraphNode {
    const runs: TextRunNode[] = [];
    let plainText = '';

    const runRegex = /<a:r[^>]*>([\s\S]*?)<\/a:r>/gi;
    let rMatch;
    let runIdx = 1;

    while ((rMatch = runRegex.exec(pXml)) !== null) {
      const rXml = rMatch[0];
      const tMatch = rXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/i);
      if (tMatch) {
        const text = tMatch[1].replace(/<[^>]+>/g, '');
        plainText += text;

        const isBold = /b="1"/i.test(rXml);
        const isItalic = /i="1"/i.test(rXml);

        runs.push({
          id: `${id}_r_${runIdx++}`,
          type: 'run',
          text,
          formatting: {
            bold: isBold || undefined,
            italic: isItalic || undefined,
          },
        });
      }
    }

    if (runs.length === 0) {
      plainText = pXml.replace(/<[^>]+>/g, '').trim();
      if (plainText) {
        runs.push({ id: `${id}_r_1`, type: 'run', text: plainText, formatting: {} });
      }
    }

    return {
      id,
      type: 'paragraph',
      runs,
      plainText,
    };
  }

  /**
   * Parse DOCX `<w:tbl>` into a TableNode AST
   */
  private static parseTableXml(tblXml: string, id: string): TableNode {
    const grid: TableCellNode[][] = [];
    const headers: string[] = [];

    const trRegex = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/gi;
    let trMatch;
    let rIdx = 0;

    while ((trMatch = trRegex.exec(tblXml)) !== null) {
      const trXml = trMatch[1];
      const rowCells: TableCellNode[] = [];
      const tcRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/gi;
      let tcMatch;
      let cIdx = 0;

      while ((tcMatch = tcRegex.exec(trXml)) !== null) {
        const tcXml = tcMatch[1];
        const cellParagraphs: ParagraphNode[] = [];
        const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/gi;
        let pMatch;
        let pIdx = 1;

        while ((pMatch = pRegex.exec(tcXml)) !== null) {
          const pNode = this.parseParagraphXml(pMatch[0], `${id}_cell_${rIdx}_${cIdx}_p_${pIdx++}`);
          if (pNode.plainText) cellParagraphs.push(pNode);
        }

        const cellText = cellParagraphs.map(p => p.plainText).join(' ');
        if (rIdx === 0) headers.push(cellText);

        rowCells.push({
          rowIndex: rIdx,
          colIndex: cIdx,
          paragraphs: cellParagraphs,
          isHeader: rIdx === 0,
        });
        cIdx++;
      }

      if (rowCells.length > 0) grid.push(rowCells);
      rIdx++;
    }

    return {
      id,
      type: 'table',
      rowCount: grid.length,
      columnCount: headers.length,
      headers,
      grid,
    };
  }
}
