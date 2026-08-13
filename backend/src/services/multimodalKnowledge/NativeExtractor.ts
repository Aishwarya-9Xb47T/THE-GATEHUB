import mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import JSZip from 'jszip';
import { MultimodalBlock, PageOrSlide, SectionNode, StructuredTable, ExtractedImage, CodeBlock, MathFormula } from './types.js';

export interface NativeExtractionOutput {
  title: string;
  pages: PageOrSlide[];
  sections: SectionNode[];
  blocks: MultimodalBlock[];
  tables: StructuredTable[];
  images: ExtractedImage[];
  codeBlocks: CodeBlock[];
  equations: MathFormula[];
  speakerNotes: string[];
  rawText: string;
  isRasterized: boolean;
}

export class NativeExtractor {
  /**
   * Main entry point for native structural extraction
   */
  public static async extract(file: { buffer: Buffer; name: string; mimeType?: string }, sourceType: string): Promise<NativeExtractionOutput> {
    const fileName = file.name || 'Document';

    switch (sourceType) {
      case 'docx':
      case 'doc':
        return await this.extractDocx(file.buffer, fileName);
      case 'pptx':
      case 'ppt':
        return await this.extractPptx(file.buffer, fileName);
      case 'pdf':
        return await this.extractPdf(file.buffer, fileName);
      case 'excel':
      case 'csv':
      case 'ods':
        return await this.extractSpreadsheet(file.buffer, fileName);
      case 'markdown':
      case 'txt':
      case 'rtf':
      case 'html':
        return await this.extractTextBased(file.buffer, fileName, sourceType);
      default:
        return this.extractTextBased(file.buffer, fileName, 'txt');
    }
  }

  /**
   * Extract DOCX natively via OpenXML / Mammoth
   */
  private static async extractDocx(buffer: Buffer, fileName: string): Promise<NativeExtractionOutput> {
    const result = await mammoth.convertToHtml({ buffer });
    const rawResult = await mammoth.extractRawText({ buffer });
    const html = result.value || '';
    const rawText = rawResult.value || '';

    const blocks: MultimodalBlock[] = [];
    const tables: StructuredTable[] = [];
    const images: ExtractedImage[] = [];
    const codeBlocks: CodeBlock[] = [];
    const equations: MathFormula[] = [];

    // Parse extracted HTML into blocks & tables
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    let tableIdx = 1;
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[0];
      const rows: any[][] = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(tableHtml)) !== null) {
        const rowCells: any[] = [];
        const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let tdMatch;
        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
          const content = tdMatch[1].replace(/<[^>]+>/g, '').trim();
          rowCells.push({ rowIndex: rows.length, colIndex: rowCells.length, content });
        }
        if (rowCells.length > 0) rows.push(rowCells);
      }

      if (rows.length > 0) {
        const headers = rows[0].map((c: any) => c.content);
        const tableObj: StructuredTable = {
          id: `table_docx_${tableIdx++}`,
          rowCount: rows.length,
          columnCount: headers.length,
          headers,
          rows: rows.slice(1),
          html: tableHtml,
        };
        tables.push(tableObj);
        blocks.push({
          id: `block_table_${tableObj.id}`,
          type: 'table',
          table: tableObj,
        });
      }
    }

    // Extract text paragraphs
    const paragraphs = rawText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    paragraphs.forEach((p, idx) => {
      blocks.push({
        id: `block_p_${idx + 1}`,
        type: p.length < 60 && p.toUpperCase() === p ? 'title' : 'paragraph',
        text: p.trim(),
      });
    });

    const page: PageOrSlide = {
      index: 1,
      title: fileName,
      type: 'page',
      blocks,
    };

    return {
      title: fileName.replace(/\.[^/.]+$/, ''),
      pages: [page],
      sections: [{ id: 'sec_1', title: 'Main Content', level: 1, blocks }],
      blocks,
      tables,
      images,
      codeBlocks,
      equations,
      speakerNotes: [],
      rawText,
      isRasterized: rawText.trim().length < 50,
    };
  }

  /**
   * Extract PPTX natively via JSZip parsing OpenXML (slide shapes & notesSlide)
   */
  private static async extractPptx(buffer: Buffer, fileName: string): Promise<NativeExtractionOutput> {
    const zip = await JSZip.loadAsync(buffer);
    const pages: PageOrSlide[] = [];
    const allBlocks: MultimodalBlock[] = [];
    const speakerNotes: string[] = [];
    let fullRawText = '';

    // Find all slide XML files
    const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/i));
    slideFiles.sort((a, b) => {
      const matchA = a.match(/\d+/);
      const matchB = b.match(/\d+/);
      const numA = parseInt(matchA ? matchA[0] : '0', 10);
      const numB = parseInt(matchB ? matchB[0] : '0', 10);
      return numA - numB;
    });

    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = slideFiles[i];
      const slideNum = i + 1;
      const slideXml = await zip.files[slidePath].async('string');

      // Extract all text nodes <a:t>
      const textMatches = slideXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
      const slideTexts = textMatches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const slideTitle = slideTexts[0] || `Slide ${slideNum}`;

      // Check speaker notes for this slide (ppt/notesSlides/notesSlideX.xml)
      let notesText = '';
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
      if (zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('string');
        const notesMatches = notesXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
        notesText = notesMatches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(t => t !== slideNum.toString()).join('\n');
      }

      if (notesText) speakerNotes.push(notesText);

      const slideBlocks: MultimodalBlock[] = slideTexts.map((text, idx) => ({
        id: `slide_${slideNum}_block_${idx + 1}`,
        type: idx === 0 ? 'title' : 'paragraph',
        text,
        speakerNotes: idx === 0 ? notesText : undefined,
      }));

      pages.push({
        index: slideNum,
        title: slideTitle,
        type: 'slide',
        blocks: slideBlocks,
        speakerNotes: notesText,
      });

      allBlocks.push(...slideBlocks);
      fullRawText += `--- Slide ${slideNum}: ${slideTitle} ---\n${slideTexts.join('\n')}\n${notesText ? `[Notes]: ${notesText}\n` : ''}\n`;
    }

    return {
      title: fileName.replace(/\.[^/.]+$/, ''),
      pages,
      sections: pages.map(p => ({ id: `sec_slide_${p.index}`, title: p.title || `Slide ${p.index}`, level: 1, blocks: p.blocks })),
      blocks: allBlocks,
      tables: [],
      images: [],
      codeBlocks: [],
      equations: [],
      speakerNotes,
      rawText: fullRawText,
      isRasterized: fullRawText.trim().length < 30,
    };
  }

  /**
   */
  private static async extractPdf(buffer: Buffer, fileName: string): Promise<NativeExtractionOutput> {
    const pdfParseMod: any = await import('pdf-parse');
    const pdfParse = pdfParseMod.default || pdfParseMod;
    const data = await pdfParse(buffer);
    const rawText = data.text || '';
    const numPages = data.numpages || 1;

    const pageTexts = rawText.split('\n\n\n').filter(Boolean);
    const pages: PageOrSlide[] = [];
    const allBlocks: MultimodalBlock[] = [];

    for (let i = 0; i < Math.max(numPages, pageTexts.length); i++) {
      const pageText = pageTexts[i] || rawText;
      const paragraphs = pageText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      const pageBlocks: MultimodalBlock[] = paragraphs.map((p, pIdx) => ({
        id: `pdf_p${i + 1}_b${pIdx + 1}`,
        type: pIdx === 0 && p.length < 80 ? 'title' : 'paragraph',
        text: p.trim(),
      }));

      pages.push({
        index: i + 1,
        title: `Page ${i + 1}`,
        type: 'page',
        blocks: pageBlocks,
      });

      allBlocks.push(...pageBlocks);
    }

    const isRasterized = rawText.trim().length < 50;

    return {
      title: fileName.replace(/\.[^/.]+$/, ''),
      pages,
      sections: [{ id: 'sec_pdf_main', title: 'Document Body', level: 1, blocks: allBlocks }],
      blocks: allBlocks,
      tables: [],
      images: [],
      codeBlocks: [],
      equations: [],
      speakerNotes: [],
      rawText,
      isRasterized,
    };
  }

  /**
   * Extract Spreadsheets (Excel / CSV / ODS) natively
   */
  private static async extractSpreadsheet(buffer: Buffer, fileName: string): Promise<NativeExtractionOutput> {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const tables: StructuredTable[] = [];
    const blocks: MultimodalBlock[] = [];
    let fullRawText = '';

    workbook.SheetNames.forEach((sheetName, sIdx) => {
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      
      if (jsonRows.length > 0) {
        const headers = (jsonRows[0] || []).map(h => String(h || ''));
        const rows: any[][] = jsonRows.slice(1).map((r, rIdx) => 
          (r || []).map((val, cIdx) => ({
            rowIndex: rIdx,
            colIndex: cIdx,
            content: String(val || ''),
          }))
        );

        const tableObj: StructuredTable = {
          id: `sheet_table_${sIdx + 1}`,
          rowCount: jsonRows.length,
          columnCount: headers.length,
          headers,
          rows,
          caption: sheetName,
        };

        tables.push(tableObj);
        blocks.push({
          id: `block_sheet_${sIdx + 1}`,
          type: 'table',
          text: `Sheet: ${sheetName}`,
          table: tableObj,
        });

        fullRawText += `Sheet: ${sheetName}\n${headers.join(' | ')}\n` + jsonRows.slice(1).map(r => (r || []).join(' | ')).join('\n') + '\n\n';
      }
    });

    const page: PageOrSlide = {
      index: 1,
      title: fileName,
      type: 'page',
      blocks,
    };

    return {
      title: fileName.replace(/\.[^/.]+$/, ''),
      pages: [page],
      sections: [{ id: 'sec_sheets', title: 'Worksheets', level: 1, blocks }],
      blocks,
      tables,
      images: [],
      codeBlocks: [],
      equations: [],
      speakerNotes: [],
      rawText: fullRawText,
      isRasterized: false,
    };
  }

  /**
   * Extract Text / Markdown / HTML natively
   */
  private static async extractTextBased(buffer: Buffer, fileName: string, sourceType: string): Promise<NativeExtractionOutput> {
    const rawText = buffer.toString('utf-8');
    const paragraphs = rawText.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    const blocks: MultimodalBlock[] = [];
    const codeBlocks: CodeBlock[] = [];
    const tables: StructuredTable[] = [];

    // 1. Check for markdown code fences ```lang ... ```
    const codeFenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let codeMatch;
    let codeIdx = 1;
    while ((codeMatch = codeFenceRegex.exec(rawText)) !== null) {
      const codeObj: CodeBlock = {
        id: `code_${codeIdx++}`,
        language: codeMatch[1] || 'plaintext',
        code: codeMatch[2].trim(),
        indentationPreserved: true,
      };
      codeBlocks.push(codeObj);
      blocks.push({
        id: `block_code_${codeObj.id}`,
        type: 'code',
        code: codeObj,
      });
    }

    // 2. Check for Markdown Pipe Tables (| col1 | col2 |)
    const tableRegex = /(?:\|[^\n]+\|\n)+/g;
    let mdTableMatch;
    let mdTableIdx = 1;
    while ((mdTableMatch = tableRegex.exec(rawText)) !== null) {
      const tableLines = mdTableMatch[0].trim().split('\n').filter(Boolean);
      if (tableLines.length >= 2) {
        const parseRow = (line: string) => line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const headers = parseRow(tableLines[0]);
        const dataLines = tableLines.filter(l => !l.includes('---'));
        const rows = dataLines.slice(1).map((l, rIdx) => 
          parseRow(l).map((cell, cIdx) => ({
            rowIndex: rIdx,
            colIndex: cIdx,
            content: cell,
          }))
        );

        if (headers.length > 0) {
          const tableObj: StructuredTable = {
            id: `table_md_${mdTableIdx++}`,
            rowCount: rows.length + 1,
            columnCount: headers.length,
            headers,
            rows,
            markdown: mdTableMatch[0],
          };
          tables.push(tableObj);
          blocks.push({
            id: `block_table_${tableObj.id}`,
            type: 'table',
            table: tableObj,
          });
        }
      }
    }

    paragraphs.forEach((p, idx) => {
      let type: any = 'paragraph';
      if (p.startsWith('#')) type = 'heading';
      else if (p.startsWith('- ') || p.startsWith('* ')) type = 'list';
      else if (p.startsWith('>')) type = 'quote';

      blocks.push({
        id: `block_txt_${idx + 1}`,
        type,
        text: p.trim(),
      });
    });

    const page: PageOrSlide = {
      index: 1,
      title: fileName,
      type: 'page',
      blocks,
    };

    return {
      title: fileName.replace(/\.[^/.]+$/, ''),
      pages: [page],
      sections: [{ id: 'sec_txt_main', title: 'Content', level: 1, blocks }],
      blocks,
      tables,
      images: [],
      codeBlocks,
      equations: [],
      speakerNotes: [],
      rawText,
      isRasterized: rawText.trim().length < 10,
    };
  }
}
