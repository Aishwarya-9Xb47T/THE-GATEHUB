import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import { V2PageNode, V2ASTNode, V2ParagraphNode, V2TextRunNode, V2TableNode, V2TableCellNode, V2CommentNode, V2SpeakerNoteNode, V2DocumentFormat, V2ImageNode } from './types.js';
import { parseStructuredPasteText } from './pasteStructuredParse.js';

export interface NativeParserOutput {
  title: string;
  pages: V2PageNode[];
  blocks: V2ASTNode[];
  tables: V2TableNode[];
  comments: V2CommentNode[];
  speakerNotes: V2SpeakerNoteNode[];
  rawText: string;
  isRasterized: boolean;
}

export class NativeParserEngine {
  /**
   * Parse document natively into a non-flattened AST document tree
   */
  public static async parse(
    buffer: Buffer,
    fileName: string,
    format: V2DocumentFormat
  ): Promise<NativeParserOutput> {
    const cleanTitle = fileName.replace(/\.[^/.]+$/, '');

    switch (format) {
      case 'docx':
      case 'doc':
        return await this.parseDocx(buffer, cleanTitle);
      case 'pptx':
      case 'ppt':
        return await this.parsePptx(buffer, cleanTitle);
      case 'pdf':
      case 'native_pdf':
      case 'scanned_pdf':
        return await this.parsePdf(buffer, cleanTitle);
      case 'xlsx':
      case 'xls':
      case 'csv':
      case 'ods':
        return await this.parseSpreadsheet(buffer, cleanTitle);
      case 'markdown':
      case 'html':
      case 'txt':
      case 'rtf':
      case 'epub':
      default:
        return await this.parseTextBased(buffer, cleanTitle, format);
    }
  }

  /**
   * Direct OpenXML DOCX DOM Parser
   */
  private static async parseDocx(buffer: Buffer, title: string): Promise<NativeParserOutput> {
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string') || '';
    const comments: V2CommentNode[] = [];
    const blocks: V2ASTNode[] = [];
    const tables: V2TableNode[] = [];
    const images: V2ImageNode[] = [];
    let fullRawText = '';

    // Extract Relationships (rId -> Target)
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    const relsMap = new Map<string, string>();
    if (relsXml) {
      const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gi;
      let rm;
      while ((rm = relRegex.exec(relsXml)) !== null) {
        relsMap.set(rm[1], rm[2]);
      }
    }

    // Extract Embedded Media Images
    const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'));
    for (const mf of mediaFiles) {
      const fileData = await zip.files[mf].async('base64');
      const ext = mf.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
      images.push({
        id: `img_${mf.replace(/[^a-zA-Z0-9]/g, '_')}`,
        type: 'image',
        relationshipId: mf,
        mimeType: mime,
        base64: `data:${mime};base64,${fileData}`,
        url: `data:${mime};base64,${fileData}`,
        caption: mf.split('/').pop() || mf,
      });
    }

    // Extract Comments (<w:comment w:id="1" w:author="Name">...)
    const commentsXml = await zip.file('word/comments.xml')?.async('string');
    if (commentsXml) {
      const cmMatches = commentsXml.match(/<w:comment[^>]*w:id="(\d+)"[^>]*w:author="([^"]*)"[\s\S]*?<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
      cmMatches.forEach(cm => {
        const idM = cm.match(/w:id="(\d+)"/);
        const autM = cm.match(/w:author="([^"]*)"/);
        const txtM = cm.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/i);
        if (idM && txtM) {
          comments.push({
            id: idM[1],
            type: 'comment',
            author: autM ? autM[1] : 'Author',
            text: txtM[1].replace(/<[^>]+>/g, '').trim(),
          });
        }
      });
    }

    // Process <w:p>, <w:tbl>, <m:oMathPara>, <m:oMath> nodes in document order
    const elementRegex = /<(w:p|w:tbl|m:oMathPara|m:oMath)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    let nodeIdx = 1;

    const rawDocBlocks: V2ASTNode[] = [];

    while ((match = elementRegex.exec(docXml)) !== null) {
      const tag = match[1];
      const xmlContent = match[0];

      if (tag === 'w:p') {
        // Check for embedded inline/anchor drawing first
        const drawingNode = this.extractDrawingFromParagraph(xmlContent, `img_p_${nodeIdx}`, relsMap, images);

        // Detect list item: <w:numPr> means this paragraph is a list bullet/number
        const numPrMatch = xmlContent.match(/<w:numPr[^>]*>[\s\S]*?<w:ilvl[^>]*w:val="(\d+)"[^>]*/i);
        const numIdMatch = xmlContent.match(/<w:numId[^>]*w:val="(\d+)"/i);
        const isListItem = !!(numPrMatch && numIdMatch);

        const pNode = this.parseDocxParagraph(xmlContent, `p_${nodeIdx++}`, relsMap);
        if (pNode.plainText.length > 0) {
          if (isListItem) {
            // Mark this paragraph as list item for grouping
            (pNode as any).isListItem = true;
            (pNode as any).listNumId = numIdMatch![1];
            (pNode as any).listLevel = parseInt(numPrMatch![1] || '0', 10);
            // Detect ordered vs bullet by checking the numFmt via numbering.xml (heuristic: numId style)
            const isOrdered = /<w:numFmt[^>]*w:val="decimal"/i.test(docXml) || /^(\d+|[a-z]|[ivx]+)$/i.test(xmlContent.match(/<w:lvlText[^>]*w:val="([^"]*)"/i)?.[1] || '');
            (pNode as any).listOrdered = isOrdered;
          }
          rawDocBlocks.push(pNode);
          fullRawText += `${pNode.plainText}\n`;
        }
        if (drawingNode) {
          rawDocBlocks.push(drawingNode);
          images.push(drawingNode);
        }
      } else if (tag === 'w:tbl') {
        const tableNode = this.parseDocxTable(xmlContent, `tbl_${nodeIdx++}`, relsMap);
        if (tableNode.rowCount > 0) {
          rawDocBlocks.push(tableNode);
          tables.push(tableNode);
          fullRawText += `[Table: ${tableNode.headers.join(' | ')}]\n`;
        }
      } else if (tag === 'm:oMathPara' || tag === 'm:oMath') {
        const latex = this.openXmlMathToLatex(xmlContent);
        if (latex) {
          const mathNode: V2ASTNode = {
            id: `math_${nodeIdx++}`,
            type: 'math' as any,
            latex,
            isDisplayMode: true,
          } as any;
          rawDocBlocks.push(mathNode);
          fullRawText += `$$${latex}$$\n`;
        }
      }
    }

    // Pass A: Group contiguous LIST paragraphs by numId into V2ListNode objects
    const listGroupedBlocks: V2ASTNode[] = [];
    let pendingListItems: string[] = [];
    let pendingListNumId: string | null = null;
    let pendingListOrdered = false;
    let listGroupIdx = 1;

    for (let i = 0; i < rawDocBlocks.length; i++) {
      const b = rawDocBlocks[i];
      if (b.type === 'paragraph' && (b as any).isListItem) {
        const pNode = b as V2ParagraphNode;
        const numId = (pNode as any).listNumId;
        if (pendingListNumId === null) pendingListNumId = numId;
        if (numId === pendingListNumId) {
          pendingListItems.push(pNode.plainText);
          pendingListOrdered = (pNode as any).listOrdered || false;
          continue;
        } else {
          // Different list — flush previous
          listGroupedBlocks.push({
            id: `list_group_${listGroupIdx++}`,
            type: 'list' as any,
            ordered: pendingListOrdered,
            items: pendingListItems,
          } as any);
          pendingListItems = [pNode.plainText];
          pendingListNumId = numId;
          pendingListOrdered = (pNode as any).listOrdered || false;
          continue;
        }
      }

      if (pendingListItems.length > 0) {
        listGroupedBlocks.push({
          id: `list_group_${listGroupIdx++}`,
          type: 'list' as any,
          ordered: pendingListOrdered,
          items: pendingListItems,
        } as any);
        pendingListItems = [];
        pendingListNumId = null;
      }
      listGroupedBlocks.push(b);
    }
    if (pendingListItems.length > 0) {
      listGroupedBlocks.push({
        id: `list_group_${listGroupIdx++}`,
        type: 'list' as any,
        ordered: pendingListOrdered,
        items: pendingListItems,
      } as any);
    }

    // Pass B: Group contiguous code paragraphs into a SINGLE V2CodeNode (Zero splitting)
    const groupedBlocks: V2ASTNode[] = [];
    let pendingCodeLines: string[] = [];
    let codeLanguage = 'python';

    for (let i = 0; i < listGroupedBlocks.length; i++) {
      const currentBlock = listGroupedBlocks[i];
      if (currentBlock.type === 'paragraph') {
        const pNode = currentBlock as V2ParagraphNode;
        const isCode = this.isCodeParagraph(pNode);
        if (isCode) {
          // Preserve original text including leading whitespace (indentation)
          pendingCodeLines.push(pNode.plainText);
          if (pNode.plainText.includes('SELECT') || pNode.plainText.includes('FROM')) codeLanguage = 'sql';
          else if (pNode.plainText.includes('function') || pNode.plainText.includes('const')) codeLanguage = 'javascript';
          continue;
        }
      }

      if (pendingCodeLines.length > 0) {
        groupedBlocks.push({
          id: `code_group_${nodeIdx++}`,
          type: 'code' as any,
          language: codeLanguage,
          code: pendingCodeLines.join('\n'),
          indentationPreserved: true,
        } as any);
        pendingCodeLines = [];
      }

      groupedBlocks.push(currentBlock);
    }

    if (pendingCodeLines.length > 0) {
      groupedBlocks.push({
        id: `code_group_${nodeIdx++}`,
        type: 'code' as any,
        language: codeLanguage,
        code: pendingCodeLines.join('\n'),
        indentationPreserved: true,
      } as any);
    }

    blocks.push(...groupedBlocks);

    // Fallback via Mammoth if XML extraction was minimal
    if (blocks.length === 0) {
      const result = await mammoth.extractRawText({ buffer });
      fullRawText = result.value || '';
      const paragraphs = fullRawText.split(/\n\s*\n/).filter(Boolean);
      paragraphs.forEach((p, idx) => {
        blocks.push({
          id: `p_fallback_${idx + 1}`,
          type: 'paragraph',
          plainText: p.trim(),
          runs: [{ id: `r_fb_${idx + 1}`, type: 'run', text: p.trim(), formatting: {} }],
        });
      });
    }

    const page: V2PageNode = {
      index: 1,
      title,
      type: 'page',
      children: blocks,
    };

    return {
      title,
      pages: [page],
      blocks,
      tables,
      comments,
      speakerNotes: [],
      rawText: fullRawText,
      isRasterized: fullRawText.trim().length < 30,
    };
  }

  /**
   * Determine if paragraph represents code by examining monospace fonts, shading, style, and syntax
   */
  private static isCodeParagraph(pNode: V2ParagraphNode): boolean {
    const text = pNode.plainText.trim();
    if (!text) return false;
    const isMonospace = pNode.runs.some(r => r.formatting.fontFamily && /Consolas|Courier|Monaco|Menlo|Source Code|Terminal|Lucida Console/i.test(r.formatting.fontFamily));
    const isSyntax = /^(?:def\s+\w+|class\s+\w+|import\s+\w+|from\s+\w+|return\b|if\s+.*:|else\s*:|for\s+.*:|while\s+.*:|public\s+class|function\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+|SELECT\s+.*FROM)/i.test(text);
    return isMonospace || (isSyntax && !text.endsWith('?'));
  }

  /**
   * Extract DrawingML or VML image structure from paragraph XML
   */
  private static extractDrawingFromParagraph(
    pXml: string,
    id: string,
    relsMap?: Map<string, string>,
    extractedImages?: V2ImageNode[]
  ): V2ImageNode | null {
    const blipMatch = pXml.match(/<a:blip[^>]*r:embed="([^"]+)"/i) || pXml.match(/<v:imagedata[^>]*r:id="([^"]+)"/i);
    if (!blipMatch) return null;
    const rId = blipMatch[1];
    const targetFile = relsMap?.get(rId);
    if (!targetFile || !extractedImages?.length) return null;

    const normalizedTarget = targetFile.replace(/^\.\.\//, '').replace(/^\/+/, '');
    const fileName = normalizedTarget.split('/').pop() || normalizedTarget;

    const found = extractedImages.find((img) => {
      const rel = img.relationshipId || '';
      const cap = img.caption || '';
      return (
        rel === normalizedTarget ||
        rel.endsWith(`/${normalizedTarget}`) ||
        rel.endsWith(normalizedTarget) ||
        rel.endsWith(fileName) ||
        cap === fileName ||
        rel.includes(fileName)
      );
    });

    const dataUrl = found?.base64 || found?.url;
    if (!dataUrl || dataUrl.length < 64 || dataUrl === 'data:image/png;base64,') {
      return null;
    }

    const docPrMatch = pXml.match(/<wp:docPr[^>]*name="([^"]*)"[^>]*descr="([^"]*)"/i) || pXml.match(/<wp:docPr[^>]*name="([^"]*)"/i);
    const caption = docPrMatch ? (docPrMatch[2] || docPrMatch[1]) : (found.caption || fileName);

    return {
      id,
      type: 'image',
      relationshipId: rId,
      mimeType: found.mimeType || 'image/png',
      url: dataUrl,
      base64: dataUrl,
      caption,
      altText: caption,
    };
  }

  /**
   * Convert OpenXML <m:oMath> math structure into clean LaTeX string
   */
  private static openXmlMathToLatex(xml: string): string {
    let mathXml = xml;
    // Replace fractions
    mathXml = mathXml.replace(/<m:f[^>]*>[\s\S]*?<m:num[^>]*>([\s\S]*?)<\/m:num>[\s\S]*?<m:den[^>]*>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/gi, (_, num, den) => {
      return `\\frac{${this.openXmlMathToLatex(num)}}{${this.openXmlMathToLatex(den)}}`;
    });
    // Replace superscripts
    mathXml = mathXml.replace(/<m:sSup[^>]*>[\s\S]*?<m:e[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup[^>]*>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/gi, (_, base, sup) => {
      return `${this.openXmlMathToLatex(base)}^{${this.openXmlMathToLatex(sup)}}`;
    });
    // Replace subscripts
    mathXml = mathXml.replace(/<m:sSub[^>]*>[\s\S]*?<m:e[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub[^>]*>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/gi, (_, base, sub) => {
      return `${this.openXmlMathToLatex(base)}_{${this.openXmlMathToLatex(sub)}}`;
    });

    const textMatches = mathXml.match(/<m:t[^>]*>([\s\S]*?)<\/m:t>/gi) || [];
    let txt = textMatches.map(m => m.replace(/<[^>]+>/g, '')).join('');
    if (!txt) txt = mathXml.replace(/<[^>]+>/g, '').trim();

    txt = txt.replace(/²/g, '^2').replace(/³/g, '^3').replace(/¹/g, '^1');
    return txt.trim();
  }

  /**
   * Direct OpenXML PPTX Slide & Speaker Notes Parser
   */
  private static async parsePptx(buffer: Buffer, title: string): Promise<NativeParserOutput> {
    const zip = await JSZip.loadAsync(buffer);
    const pages: V2PageNode[] = [];
    const allBlocks: V2ASTNode[] = [];
    const speakerNotes: V2SpeakerNoteNode[] = [];
    let fullRawText = '';

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

      const slideBlocks: V2ASTNode[] = [];
      const pMatches = slideXml.match(/<a:p[^>]*>([\s\S]*?)<\/a:p>/gi) || [];

      pMatches.forEach((pXml, pIdx) => {
        const pNode = this.parsePptxParagraph(pXml, `slide_${slideNum}_p_${pIdx + 1}`);
        if (pNode.plainText.length > 0) {
          slideBlocks.push(pNode);
          fullRawText += `${pNode.plainText}\n`;
        }
      });

      // Speaker Notes (ppt/notesSlides/notesSlideX.xml)
      let speakerNoteNode: V2SpeakerNoteNode | undefined = undefined;
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
      if (zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('string');
        const notesMatches = notesXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
        const notesText = notesMatches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join('\n');

        if (notesText) {
          speakerNoteNode = {
            id: `note_slide_${slideNum}`,
            type: 'speaker_note',
            slideIndex: slideNum,
            text: notesText,
            runs: [{ id: `r_note_${slideNum}`, type: 'run', text: notesText, formatting: {} }],
          };
          speakerNotes.push(speakerNoteNode);
          fullRawText += `[Speaker Note]: ${notesText}\n`;
        }
      }

      const pageNode: V2PageNode = {
        index: slideNum,
        title: slideBlocks[0] ? (slideBlocks[0] as V2ParagraphNode).plainText : `Slide ${slideNum}`,
        type: 'slide',
        children: slideBlocks,
        speakerNotes: speakerNoteNode,
      };

      pages.push(pageNode);
      allBlocks.push(...slideBlocks);
    }

    return {
      title,
      pages,
      blocks: allBlocks,
      tables: [],
      comments: [],
      speakerNotes,
      rawText: fullRawText,
      isRasterized: fullRawText.trim().length < 20,
    };
  }

  /**
   * PDF parser: structured layout blocks + embedded image extraction (parity with DOCX path)
   */
  private static async parsePdf(buffer: Buffer, title: string): Promise<NativeParserOutput> {
    const { PdfLayoutNormalizer } = await import('../assessmentStudio/import/parsers/PdfLayoutNormalizer.js');
    const { extractPdfImages } = await import('../assessmentStudio/import/parsers/pdfImageExtract.js');

    const { text: rawText, numpages: numPages } = await this.loadPdfText(buffer);
    const pdfBlocks = PdfLayoutNormalizer.normalize(rawText, numPages).filter(
      (b) => b.type !== 'page_decoration' && b.type !== 'decorative',
    );

    const extractedImages = extractPdfImages(buffer);
    const imageNodes: V2ImageNode[] = extractedImages
      .filter((img) => img.dataUrl && img.dataUrl.length > 64)
      .map((img) => ({
        id: img.id,
        type: 'image' as const,
        mimeType: img.mimeType,
        url: img.dataUrl,
        base64: img.dataUrl,
        caption: 'Question Image',
        altText: 'Question Image',
      }));

    const baseBlocks = pdfBlocks.map((block, idx) => this.pdfBlockToV2Node(block, idx));
    const allBlocks = this.injectPdfImagesIntoV2Blocks(baseBlocks, imageNodes);
    const tables = allBlocks.filter((b) => b.type === 'table') as V2TableNode[];
    const fullRawText = pdfBlocks.map((b) => b.text).join('\n');

    const pages: V2PageNode[] = [{
      index: 1,
      title: numPages > 1 ? `Pages 1-${numPages}` : 'Page 1',
      type: 'page',
      children: allBlocks,
    }];

    return {
      title,
      pages,
      blocks: allBlocks,
      tables,
      comments: [],
      speakerNotes: [],
      rawText: fullRawText || rawText,
      isRasterized: (fullRawText || rawText).trim().length < 40,
    };
  }

  private static async loadPdfText(buffer: Buffer): Promise<{ text: string; numpages: number }> {
    const mod: any = await import('pdf-parse');
    if (mod.PDFParse) {
      const parser = new mod.PDFParse({ data: buffer });
      if (typeof parser.getText === 'function') {
        const textObj = await parser.getText();
        const text = typeof textObj === 'string' ? textObj : textObj?.text || '';
        return { text, numpages: parser.pageCount || 1 };
      }
    }

    const pdfParse = mod.default || mod;
    if (typeof pdfParse === 'function') {
      const data = await pdfParse(buffer);
      return { text: data.text || '', numpages: data.numpages || 1 };
    }

    throw new Error('PDF parser unavailable');
  }

  private static pdfBlockToV2Node(block: import('../assessmentStudio/import/parsers/PdfLayoutNormalizer.js').PdfBlock, idx: number): V2ASTNode {
    const run = (text: string, id: string): V2TextRunNode => ({
      id,
      type: 'run',
      text,
      formatting: {},
    });

    if (block.type === 'heading') {
      return {
        id: `pdf_h_${idx + 1}`,
        type: 'heading',
        plainText: block.text,
        runs: [run(block.text, `r_pdf_h_${idx + 1}`)],
      };
    }

    if (block.type === 'code') {
      return {
        id: `pdf_code_${idx + 1}`,
        type: 'code',
        language: block.language || 'python',
        code: block.text,
        indentationPreserved: true,
      } as V2ASTNode;
    }

    if (block.type === 'table_row') {
      const tableNode = this.markdownTableToV2Node(block.text, `pdf_tbl_${idx + 1}`);
      if (tableNode) return tableNode;
    }

    let plainText = block.text;
    if (block.type === 'list_item') {
      const indent = '  '.repeat(block.listLevel ?? 0);
      const prefix = block.listOrdered ? `${indent}` : `${indent}• `;
      plainText = `${prefix}${block.text}`;
    }

    return {
      id: `pdf_p_${idx + 1}`,
      type: 'paragraph',
      plainText,
      runs: [run(plainText, `r_pdf_${idx + 1}`)],
    };
  }

  private static injectPdfImagesIntoV2Blocks(blocks: V2ASTNode[], images: V2ImageNode[]): V2ASTNode[] {
    if (images.length === 0) return blocks;

    const queue = [...images];
    const out: V2ASTNode[] = [];

    const paragraphText = (node: V2ASTNode): string =>
      node.type === 'paragraph' || node.type === 'heading'
        ? String((node as V2ParagraphNode).plainText || '').trim()
        : '';

    const isImageQuestionPrompt = (text: string): boolean =>
      /identify the object shown|shown in the (?:image|figure|diagram)|match the image|refer to the (figure|image|diagram)/i.test(
        text,
      );

    const nextImagePromptWithin = (startIdx: number, limit = 4): boolean => {
      for (let j = startIdx; j < Math.min(startIdx + limit, blocks.length); j++) {
        const nextText = paragraphText(blocks[j]);
        if (!nextText) continue;
        if (/^[A-E][.)]\s/i.test(nextText)) return false;
        if (/^Question:\s*$/i.test(nextText)) return false;
        return isImageQuestionPrompt(nextText);
      }
      return false;
    };

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const text = paragraphText(block);

      if (
        queue.length > 0 &&
        isImageQuestionPrompt(text) &&
        (i === 0 || !/^Question:\s*$/i.test(paragraphText(blocks[i - 1])))
      ) {
        out.push(queue.shift()!);
      }

      out.push(block);

      if (/^Question:\s*$/i.test(text) && queue.length > 0 && nextImagePromptWithin(i + 1)) {
        out.push(queue.shift()!);
      }
    }

    while (queue.length > 0) {
      out.push(queue.shift()!);
    }

    return out;
  }

  private static markdownTableToV2Node(text: string, id: string): V2TableNode | null {
    const lines = text
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;

    const parseRow = (line: string): string[] => {
      const parts = line.split('|').map((c) => c.trim());
      if (parts.length && parts[0] === '') parts.shift();
      if (parts.length && parts[parts.length - 1] === '') parts.pop();
      return parts.filter((c) => c.length > 0);
    };

    const pipeLines = lines.filter((l) => l.includes('|'));
    if (pipeLines.length < 2) return null;

    const headers = parseRow(pipeLines[0]);
    if (headers.length === 0) return null;

    const bodyLines = pipeLines.slice(1).filter((l) => !/^\|?\s*:?-{2,}/.test(l) && !/---/.test(l.replace(/\|/g, '')));
    if (bodyLines.length === 0) return null;

    const grid: V2TableCellNode[][] = bodyLines.map((line, rIdx) =>
      parseRow(line).map((cell, cIdx) => ({
        rowIndex: rIdx,
        colIndex: cIdx,
        paragraphs: [{
          id: `${id}_cell_${rIdx}_${cIdx}`,
          type: 'paragraph' as const,
          plainText: cell,
          runs: [{ id: `${id}_r_${rIdx}_${cIdx}`, type: 'run' as const, text: cell, formatting: {} }],
        }],
      })),
    );

    const htmlRows = [
      `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`,
      ...grid.map((row) =>
        `<tr>${row.map((cell) => `<td>${cell.paragraphs.map((p) => p.plainText).join(' ')}</td>`).join('')}</tr>`,
      ),
    ].join('');
    const html = `<table class="v2-table" border="1" style="border-collapse: collapse; width: 100%;"><tbody>${htmlRows}</tbody></table>`;

    return {
      id,
      type: 'table',
      rowCount: grid.length + 1,
      columnCount: headers.length,
      headers,
      grid,
      html,
      caption: '',
    };
  }

  /**
   * Spreadsheet (XLSX / CSV / ODS) Parser
   */
  private static async parseSpreadsheet(buffer: Buffer, title: string): Promise<NativeParserOutput> {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const tables: V2TableNode[] = [];
    const blocks: V2ASTNode[] = [];
    let fullRawText = '';

    workbook.SheetNames.forEach((sheetName, sIdx) => {
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 });

      if (jsonRows.length > 0) {
        const headers = (jsonRows[0] || []).map(h => String(h || ''));
        const grid: V2TableCellNode[][] = jsonRows.slice(1).map((r, rIdx) => 
          (r || []).map((val, cIdx) => ({
            rowIndex: rIdx,
            colIndex: cIdx,
            paragraphs: [{
              id: `cell_p_${rIdx}_${cIdx}`,
              type: 'paragraph',
              plainText: String(val || ''),
              runs: [{ id: `r_cell_${rIdx}_${cIdx}`, type: 'run', text: String(val || ''), formatting: {} }],
            }],
          }))
        );

        const tableNode: V2TableNode = {
          id: `sheet_tbl_${sIdx + 1}`,
          type: 'table',
          rowCount: jsonRows.length,
          columnCount: headers.length,
          headers,
          grid,
          caption: sheetName,
        };

        tables.push(tableNode);
        blocks.push(tableNode);
        fullRawText += `Sheet ${sheetName}:\n${headers.join(' | ')}\n`;
      }
    });

    return {
      title,
      pages: [{ index: 1, title, type: 'page', children: blocks }],
      blocks,
      tables,
      comments: [],
      speakerNotes: [],
      rawText: fullRawText,
      isRasterized: false,
    };
  }

  /**
   * Text / Markdown / HTML Parser
   */
  private static async parseTextBased(buffer: Buffer, title: string, format: V2DocumentFormat): Promise<NativeParserOutput> {
    // Structured parse: paragraphs + fenced code + markdown/TSV tables (not flattened prose).
    const structured = parseStructuredPasteText(buffer.toString('utf-8'));

    return {
      title,
      pages: [{ index: 1, title, type: 'page', children: structured.blocks }],
      blocks: structured.blocks,
      tables: structured.tables,
      comments: [],
      speakerNotes: [],
      rawText: structured.rawText,
      isRasterized: structured.rawText.trim().length < 10,
    };
  }

  private static parseDocxParagraph(pXml: string, id: string, relsMap?: Map<string, string>): V2ParagraphNode {
    const runs: V2TextRunNode[] = [];
    let plainText = '';
    let isHeading = false;
    let headingLevel: number | undefined = undefined;
    let fontFamily: string | undefined = undefined;

    // Check heading styles (<w:pStyle w:val="Heading1"/>)
    const styleMatch = pXml.match(/<w:pStyle[^>]*w:val="([^"]+)"/i);
    if (styleMatch) {
      const sVal = styleMatch[1];
      const hMatch = sVal.match(/Heading(\d)/i);
      if (hMatch) {
        isHeading = true;
        headingLevel = parseInt(hMatch[1], 10);
      }
    }

    // Check math tags inside paragraph (<m:oMath>)
    const mathNodes: string[] = [];
    const mathRegex = /<m:oMath[^>]*>([\s\S]*?)<\/m:oMath>/gi;
    let mMatch;
    while ((mMatch = mathRegex.exec(pXml)) !== null) {
      const latex = this.openXmlMathToLatex(mMatch[0]);
      if (latex) mathNodes.push(latex);
    }

    // Process runs & hyperlinks
    const runOrHyperlinkRegex = /<(w:r|w:hyperlink)[^>]*>([\s\S]*?)<\/\1>/gi;
    let rMatch;
    let rIdx = 1;

    while ((rMatch = runOrHyperlinkRegex.exec(pXml)) !== null) {
      const tag = rMatch[1];
      const xml = rMatch[0];

      let hyperlinkUrl: string | undefined = undefined;
      if (tag === 'w:hyperlink') {
        const ridMatch = xml.match(/r:id="([^"]+)"/i);
        if (ridMatch && relsMap) {
          hyperlinkUrl = relsMap.get(ridMatch[1]);
        }
      }

      const tMatches = xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
      tMatches.forEach(tXml => {
        const text = tXml.replace(/<[^>]+>/g, '');
        plainText += text;

        const fontMatch = xml.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/i);
        if (fontMatch) fontFamily = fontMatch[1];

        const colorMatch = xml.match(/<w:color[^>]*w:val="([^"]+)"/i);
        const highlightMatch = xml.match(/<w:highlight[^>]*w:val="([^"]+)"/i);

        runs.push({
          id: `${id}_r_${rIdx++}`,
          type: 'run',
          text,
          formatting: {
            bold: /<w:b(\/|\s[^>]*>|>)/i.test(xml) || undefined,
            italic: /<w:i(\/|\s[^>]*>|>)/i.test(xml) || undefined,
            underline: /<w:u(\/|\s[^>]*>|>)/i.test(xml) || undefined,
            fontFamily,
            color: colorMatch ? `#${colorMatch[1]}` : undefined,
            backgroundColor: highlightMatch ? highlightMatch[1] : undefined,
            hyperlinkUrl,
          },
        });
      });
    }

    if (runs.length === 0) {
      plainText = pXml.replace(/<[^>]+>/g, '').trim();
      if (plainText) runs.push({ id: `${id}_r_1`, type: 'run', text: plainText, formatting: {} });
    }

    // Append inline math representations to plainText if present
    if (mathNodes.length > 0) {
      const mathStr = mathNodes.map(m => `$${m}$`).join(' ');
      plainText = plainText ? `${plainText} ${mathStr}` : mathStr;
    }

    return {
      id,
      type: isHeading ? 'heading' : 'paragraph',
      headingLevel,
      runs,
      plainText: plainText.trimEnd(), // preserve leading whitespace for code indentation
    };
  }

  private static parsePptxParagraph(pXml: string, id: string): V2ParagraphNode {
    const runs: V2TextRunNode[] = [];
    let plainText = '';

    const runRegex = /<a:r[^>]*>([\s\S]*?)<\/a:r>/gi;
    let rMatch;
    let rIdx = 1;

    while ((rMatch = runRegex.exec(pXml)) !== null) {
      const rXml = rMatch[0];
      const tMatch = rXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/i);
      if (tMatch) {
        const text = tMatch[1].replace(/<[^>]+>/g, '');
        plainText += text;

        runs.push({
          id: `${id}_r_${rIdx++}`,
          type: 'run',
          text,
          formatting: {
            bold: /b="1"/i.test(rXml) || undefined,
            italic: /i="1"/i.test(rXml) || undefined,
          },
        });
      }
    }

    if (runs.length === 0) {
      plainText = pXml.replace(/<[^>]+>/g, '').trim();
      if (plainText) runs.push({ id: `${id}_r_1`, type: 'run', text: plainText, formatting: {} });
    }

    return {
      id,
      type: 'paragraph',
      runs,
      plainText,
    };
  }

  private static parseDocxTable(tblXml: string, id: string, relsMap?: Map<string, string>): V2TableNode {
    const grid: V2TableCellNode[][] = [];
    const headers: string[] = [];

    const trRegex = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/gi;
    let trMatch;
    let rIdx = 0;

    while ((trMatch = trRegex.exec(tblXml)) !== null) {
      const trXml = trMatch[1];
      const isHeaderRow = /<w:tblHeader\/>/i.test(trXml) || rIdx === 0;
      const rowCells: V2TableCellNode[] = [];
      const tcRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/gi;
      let tcMatch;
      let cIdx = 0;

      while ((tcMatch = tcRegex.exec(trXml)) !== null) {
        const tcXml = tcMatch[1];

        // Column Span & Row Span
        const gridSpanMatch = tcXml.match(/<w:gridSpan[^>]*w:val="(\d+)"/i);
        const colSpan = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : 1;

        const cellParagraphs: V2ParagraphNode[] = [];
        const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/gi;
        let pMatch;
        let pIdx = 1;

        while ((pMatch = pRegex.exec(tcXml)) !== null) {
          const pNode = this.parseDocxParagraph(pMatch[0], `${id}_cell_${rIdx}_${cIdx}_p_${pIdx++}`, relsMap);
          if (pNode.plainText) cellParagraphs.push(pNode);
        }

        const cellText = cellParagraphs.map(p => p.plainText).join(' ');
        if (rIdx === 0) headers.push(cellText);

        rowCells.push({
          rowIndex: rIdx,
          colIndex: cIdx,
          colSpan,
          paragraphs: cellParagraphs,
          isHeader: isHeaderRow,
        });
        cIdx++;
      }

      if (rowCells.length > 0) grid.push(rowCells);
      rIdx++;
    }

    const htmlRows = grid.map((row, rIdx) => {
      const cellTag = rIdx === 0 ? 'th' : 'td';
      const cellsHtml = row.map(cell => {
        const text = cell.paragraphs.map(p => p.plainText).join('<br/>');
        const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
        return `<${cellTag}${cs}>${text}</${cellTag}>`;
      }).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');
    const html = `<table class="v2-table" border="1" style="border-collapse: collapse; width: 100%;"><tbody>${htmlRows}</tbody></table>`;

    return {
      id,
      type: 'table',
      rowCount: grid.length,
      columnCount: headers.length,
      headers,
      grid,
      html,
    };
  }
}
