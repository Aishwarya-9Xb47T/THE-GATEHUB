import { UnifiedDocumentAST, ExtractedMedia } from '../types.js';
import { TableExtractor } from '../extractors/TableExtractor.js';
import { MathFormulaEngine } from '../extractors/MathFormulaEngine.js';
import { CodeBlockExtractor } from '../extractors/CodeBlockExtractor.js';
import { FallbackOcrService } from '../../multimodalKnowledge/FallbackOcrService.js';

export class PdfExtractionEngine {
  /**
   * Parse PDF buffer into rich UnifiedDocumentAST and ExtractedMedia
   */
  public static async parse(buffer: Buffer, fileName: string): Promise<{ ast: UnifiedDocumentAST; media: ExtractedMedia[]; html: string }> {
    let rawText = '';
    let isScanned = false;
    const media: ExtractedMedia[] = [];

    try {
      // Import pdf-parse safely with ESM/CJS interop fallback
      const pdfParseModule: any = await import('pdf-parse');
      if (pdfParseModule.PDFParse) {
        const parser = new pdfParseModule.PDFParse({ data: buffer });
        const textObj = await parser.getText();
        rawText = typeof textObj === 'string' ? textObj : textObj?.text || '';
      } else {
        const pdfParse = pdfParseModule.default || pdfParseModule;
        if (typeof pdfParse === 'function') {
          const pdfData = await pdfParse(buffer);
          rawText = pdfData.text || '';
        }
      }
    } catch (err) {
      console.warn('[PdfExtractionEngine] Standard pdf-parse failed or non-searchable PDF, attempting OCR fallback:', err);
      isScanned = true;
    }

    // Extract native images (JPEG, PNG, FlateDecode/ASCII85 streams) directly from PDF binary buffer
    try {
      const { extractPdfImages } = await import('../../assessmentStudio/import/parsers/pdfImageExtract.js');
      const extractedImages = extractPdfImages(buffer);
      extractedImages.forEach((img, idx) => {
        media.push({
          id: img.id || `pdf_img_${idx + 1}`,
          fileName: `image_${idx + 1}.${img.mimeType === 'image/jpeg' ? 'jpg' : img.mimeType === 'image/png' ? 'png' : 'bmp'}`,
          mimeType: img.mimeType,
          dataUrl: img.dataUrl,
          buffer: img.buffer,
          byteSize: img.buffer?.length || 0,
        });
      });
      console.log(`[PdfExtractionEngine] Extracted ${media.length} image(s) from PDF binary stream.`);
    } catch (imgErr) {
      console.warn('[PdfExtractionEngine] Image extraction from PDF buffer warning:', imgErr);
    }

    // Determine if PDF is scanned or unsearchable (less than 30 characters for multi-page buffer)
    if (!rawText || rawText.trim().length < 30) {
      isScanned = true;
      try {
        const ocrResult = await FallbackOcrService.runOcr(buffer, 'image/png');
        rawText = ocrResult.extractedText || '';
      } catch (ocrErr) {
        console.error('[PdfExtractionEngine] OCR extraction failed:', ocrErr);
      }
    }

    const astNodes: UnifiedDocumentAST['nodes'] = [];
    const htmlParts: string[] = [];

    // 1. Extract Code Blocks from PDF text stream
    const codeExtraction = CodeBlockExtractor.extractCodeBlocks(rawText);
    let hasCode = false;
    if (codeExtraction.codeBlocks.length > 0) {
      hasCode = true;
      codeExtraction.codeBlocks.forEach(cb => {
        astNodes.push(cb);
        htmlParts.push(`<pre><code class="language-${cb.language}">${cb.content}</code></pre>`);
      });
    }

    // 2. Extract Math Formulas
    const mathFormulas = MathFormulaEngine.extractMathFormulas(codeExtraction.remainingText);
    let hasMath = false;
    if (mathFormulas.length > 0) {
      hasMath = true;
      mathFormulas.forEach(mf => {
        astNodes.push(mf);
        htmlParts.push(`<div class="math-formula">\\[${mf.latex}\\]</div>`);
      });
    }

    // 3. Extract Tables (detect HTML or markdown table patterns)
    const tableRegex = /(?:\|[^\n]+\|\r?\n)+/g;
    let hasTables = false;
    let textAfterTables = codeExtraction.remainingText.replace(tableRegex, (match, idx) => {
      hasTables = true;
      const tableNode = TableExtractor.parseHtmlTable(this.markdownTableToHtml(match), `tbl_pdf_${idx}`);
      astNodes.push(tableNode);
      htmlParts.push(this.tableToHtml(tableNode));
      return '';
    });

    // 4. Split remaining text into Paragraphs
    const paragraphs = textAfterTables.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    paragraphs.forEach((pText, idx) => {
      const pNode = {
        type: 'paragraph' as const,
        id: `p_pdf_${idx + 1}`,
        runs: [{ type: 'run' as const, text: pText, formatting: {} }],
        plainText: pText,
      };
      astNodes.push(pNode);
      htmlParts.push(`<p>${pText}</p>`);
    });

    const fullPlainText = astNodes.map(n => n.plainText).join('\n');
    const wordCount = fullPlainText.split(/\s+/).filter(Boolean).length;

    const ast: UnifiedDocumentAST = {
      title: fileName.replace(/\.[^/.]+$/, ''),
      metadata: {
        wordCount,
        hasCode,
        hasTables,
        hasMath,
        hasImages: media.length > 0 || isScanned,
      },
      nodes: astNodes,
      footnotes: [],
      endnotes: [],
      comments: [],
      headers: [],
      footers: [],
    };

    return {
      ast,
      media,
      html: htmlParts.join('\n'),
    };
  }

  private static markdownTableToHtml(mdTable: string): string {
    const lines = mdTable.trim().split(/\r?\n/).filter(l => l.includes('|'));
    const rows = lines.map(l => l.split('|').map(c => c.trim()).filter((_c, i, a) => i > 0 && i < a.length - 1));
    const trs = rows.map((r, idx) => {
      const cellTag = idx === 0 ? 'th' : 'td';
      return `<tr>${r.map(c => `<${cellTag}>${c}</${cellTag}>`).join('')}</tr>`;
    }).join('');
    return `<table><tbody>${trs}</tbody></table>`;
  }

  private static tableToHtml(tbl: any): string {
    const rowsHtml = tbl.rows.map((r: any) => {
      const cellsHtml = r.cells.map((c: any) => `<${r.isHeader ? 'th' : 'td'}>${c.plainText}</${r.isHeader ? 'th' : 'td'}>`).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');
    return `<table border="1"><tbody>${rowsHtml}</tbody></table>`;
  }
}
