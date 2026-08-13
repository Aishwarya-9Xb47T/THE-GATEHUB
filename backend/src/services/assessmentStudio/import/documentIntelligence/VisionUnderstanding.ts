/**
 * Vision Understanding Pipeline
 * Converts documents into visual understanding with OCR and layout detection
 */

import { PdfParser } from '../parsers/PdfParser.js';
import { DocxParser } from '../parsers/DocxParser.js';
import { PptxParser } from '../parsers/PptxParser.js';
import { ImageOcrParser } from '../parsers/ImageOcrParser.js';
import type { PdfBlock } from '../parsers/PdfLayoutNormalizer.js';
import {
  VisionUnderstandingOutput,
  VisionRegion,
  LayoutAnalysis,
  BBox,
} from './types.js';

export class VisionUnderstanding {
  /**
   * Process document and extract visual understanding
   */
  static async process(
    file: { buffer: Buffer; name: string; mimeType: string }
  ): Promise<VisionUnderstandingOutput> {
    console.log('=== VisionUnderstanding.process ENTRY ===');
    console.log('INPUT:', {
      fileName: file.name,
      mimeType: file.mimeType,
      fileSize: file.buffer.length,
      bufferLength: file.buffer.length
    });

    try {
      // Determine file type and use appropriate parser
      const fileType = this.detectFileType(file.name, file.mimeType);
      console.log('[VisionUnderstanding] File type detected:', fileType);

      let rawContent;
      const parserStartTime = Date.now();
      
      switch (fileType) {
        case 'pdf':
          console.log('[VisionUnderstanding] Using PdfParser');
          rawContent = await PdfParser.extract(file.buffer);
          break;
        case 'docx':
          console.log('[VisionUnderstanding] Using DocxParser');
          rawContent = await DocxParser.extract(file.buffer);
          break;
        case 'pptx':
          console.log('[VisionUnderstanding] Using PptxParser');
          rawContent = await PptxParser.extract(file.buffer);
          break;
        case 'image':
          console.log('[VisionUnderstanding] Using ImageOcrParser');
          rawContent = await ImageOcrParser.extract(file.buffer, file.mimeType);
          break;
        case 'txt':
        case 'markdown':
        case 'text':
          console.log('[VisionUnderstanding] Using Plain Text Parser');
          const textStr = file.buffer.toString('utf-8');
          rawContent = {
            text: textStr,
            images: [],
            metadata: { wordCount: textStr.split(/\s+/).length },
          };
          break;
        default:
          console.log('[VisionUnderstanding] Falling back to text conversion for file type:', fileType);
          const fallbackText = file.buffer.toString('utf-8');
          rawContent = {
            text: fallbackText,
            images: [],
            metadata: { wordCount: fallbackText.split(/\s+/).length },
          };
      }

      const parserDuration = Date.now() - parserStartTime;
      console.log('[VisionUnderstanding] Parser completed', {
        duration: `${parserDuration}ms`,
        textLength: rawContent.text?.length || 0,
        imageCount: rawContent.images?.length || 0,
        textPreview: rawContent.text?.substring(0, 200) || 'NO TEXT'
      });

      // Analyze layout
      const layoutStartTime = Date.now();
      const layout = this.analyzeLayout(rawContent.text || '');
      const layoutDuration = Date.now() - layoutStartTime;
      console.log('[VisionUnderstanding] Layout analyzed', {
        duration: `${layoutDuration}ms`,
        columns: layout.columns,
        orientation: layout.orientation,
        regionCount: layout.regions.length
      });

      // Detect regions from text, html tables, images, and equations
      const regionsStartTime = Date.now();
      const regions = this.detectRegions(rawContent, layout);
      const regionsDuration = Date.now() - regionsStartTime;
      console.log('[VisionUnderstanding] Regions detected', {
        duration: `${regionsDuration}ms`,
        regionCount: regions.length,
        regionTypes: this.getRegionTypeCounts(regions)
      });

      // Calculate overall confidence
      const confidence = this.calculateConfidence(rawContent, layout, regions);
      console.log('[VisionUnderstanding] Overall confidence:', confidence);

      const output = {
        regions,
        layout,
        ocrText: rawContent.text || '',
        ocrConfidence: 0.9, // Placeholder - would come from actual OCR engine
        confidence,
      };

      console.log('=== VisionUnderstanding.process EXIT ===');
      console.log('OUTPUT:', {
        regionCount: output.regions.length,
        ocrTextLength: output.ocrText.length,
        confidence: output.confidence
      });

      return output;
    } catch (error) {
      console.error('=== VisionUnderstanding.process ERROR ===');
      console.error('ERROR DETAILS:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fileName: file.name,
        fileSize: file.buffer.length
      });
      throw error;
    }
  }

  /**
   * Get region type counts for logging
   */
  private static getRegionTypeCounts(regions: VisionRegion[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const region of regions) {
      const type = region.type;
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Detect file type from filename and MIME type
   */
  private static detectFileType(filename: string, mimeType: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mime = mimeType.toLowerCase();

    if (ext === 'pdf' || mime.includes('pdf')) return 'pdf';
    if (ext === 'docx' || mime.includes('word')) return 'docx';
    if (ext === 'pptx' || mime.includes('presentation')) return 'pptx';
    if (['txt', 'text'].includes(ext || '') || mime.includes('text/plain')) return 'txt';
    if (['md', 'markdown'].includes(ext || '') || mime.includes('markdown')) return 'markdown';
    if (
      ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'].includes(ext || '') ||
      mime.startsWith('image/')
    )
      return 'image';

    return 'txt';
  }

  /**
   * Analyze document layout
   */
  private static analyzeLayout(text: string): LayoutAnalysis {
    const lines = text.split('\n');
    const columns = this.detectColumns(lines);
    const orientation = this.detectOrientation(lines);
    const readingOrder = this.detectReadingOrder(lines);

    return {
      columns,
      orientation,
      readingOrder,
      regions: [], // Will be populated by detectRegions
      confidence: 0.85,
    };
  }

  /**
   * Detect number of columns in document
   */
  private static detectColumns(lines: string[]): number {
    // Simple heuristic: look for patterns that suggest multiple columns
    // In production, this would use vision AI to analyze actual layout
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const maxLineLength = Math.max(...lines.map(line => line.length));

    // If max is significantly higher than average, likely single column
    // If similar, might be multiple columns
    if (maxLineLength > avgLineLength * 2) {
      return 1;
    }

    // More sophisticated detection would go here
    return 1; // Default to single column
  }

  /**
   * Detect document orientation
   */
  private static detectOrientation(lines: string[]): 'portrait' | 'landscape' {
    // Simple heuristic based on line lengths
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;

    // In production, this would use vision AI
    return avgLineLength > 100 ? 'landscape' : 'portrait';
  }

  /**
   * Detect reading order of regions
   */
  private static detectReadingOrder(lines: string[]): string[] {
    // Simple heuristic: top-to-bottom, left-to-right
    // In production, this would use vision AI
    return lines.map((_, index) => `region-${index}`);
  }

  /**
   * Build VisionRegions from structured PdfBlock array (PDF-only path).
   * Each block type maps directly to the correct region type so DocumentGraph
   * never needs to guess layout from raw text.
   */
  private static regionsFromPdfBlocks(
    pdfBlocks: PdfBlock[],
    rawImages: any[]
  ): VisionRegion[] {
    const regions: VisionRegion[] = [];
    let currentY = 0;

    // Inject standalone images near text referencing images or at reading order position
    let imagesInjected = false;
    const finalRegions: VisionRegion[] = [];

    for (let i = 0; i < pdfBlocks.length; i++) {
      const block = pdfBlocks[i];
      const page = block.page;

      let regionType: VisionRegion['type'];
      switch (block.type) {
        case 'page_decoration':
        case 'decorative':    regionType = 'footer';   break;
        case 'heading':       regionType = 'header';   break;
        case 'table_row':     regionType = 'table';    break;
        case 'code':          regionType = 'code';     break;
        case 'equation':      regionType = 'equation'; break;
        case 'list_item':     regionType = 'text';     break;
        case 'fill_answer':   regionType = 'text';     break;
        default:              regionType = 'text';     break;
      }

      let content = block.text;
      if (block.type === 'list_item') {
        const indent = '  '.repeat(block.listLevel ?? 0);
        const bullet = block.listOrdered ? `${indent}` : `${indent}• `;
        content = `${bullet}${block.text}`;
      } else if (block.type === 'fill_answer') {
        content = `[ANSWER] ${block.text}`;
      } else if (block.type === 'equation') {
        content = block.text;
      } else if (block.type === 'code') {
        content = block.text;
      }

      const height = block.type === 'table_row' ? 80 : block.type === 'code' ? 60 : 25;

      finalRegions.push({
        id: `pdf-block-${i}`,
        type: regionType,
        bbox: {
          x: 0,
          y: currentY,
          width: Math.max(content.length * 8, 100),
          height,
          page,
        },
        confidence: 0.9,
        content,
      });

      currentY += height + 5;

      // Check if this block is a question prompt referencing an image
      const isImageAnchor = /Identify\s+the\s+object\s+shown|Match\s+the\s+image|question\s*:\s*identify/i.test(block.text);
      if (!imagesInjected && isImageAnchor && rawImages.length > 0) {
        rawImages.forEach((img: any, idx: number) => {
          const dataUrl = img.dataUrl || img.url || (typeof img.buffer === 'object' ? `data:${img.mimeType || 'image/png'};base64,${Buffer.from(img.buffer).toString('base64')}` : undefined);
          finalRegions.push({
            id: `region-image-${img.id || idx + 1}`,
            type: 'image',
            bbox: { x: 0, y: currentY, width: img.width || 400, height: img.height || 300, page },
            confidence: 0.95,
            content: dataUrl ? `<img src="${dataUrl}" alt="Image ${idx + 1}" class="rounded-lg max-w-full my-2 inline-block" />` : '',
            attributes: { dataUrl, mimeType: img.mimeType || 'image/png' },
          } as any);
          currentY += 310;
        });
        imagesInjected = true;
      }
    }

    // Fallback if not injected near anchor text
    if (!imagesInjected && rawImages.length > 0) {
      rawImages.forEach((img: any, idx: number) => {
        const dataUrl = img.dataUrl || img.url || (typeof img.buffer === 'object' ? `data:${img.mimeType || 'image/png'};base64,${Buffer.from(img.buffer).toString('base64')}` : undefined);
        finalRegions.push({
          id: `region-image-${img.id || idx + 1}`,
          type: 'image',
          bbox: { x: 0, y: currentY, width: img.width || 400, height: img.height || 300, page: 1 },
          confidence: 0.95,
          content: dataUrl ? `<img src="${dataUrl}" alt="Image ${idx + 1}" class="rounded-lg max-w-full my-2 inline-block" />` : '',
          attributes: { dataUrl, mimeType: img.mimeType || 'image/png' },
        } as any);
        currentY += 310;
      });
    }

    return finalRegions;
  }

  /**
   * Detect regions in document from rawContent in exact sequential reading order
   */
  private static detectRegions(rawInput: any, layout: LayoutAnalysis): VisionRegion[] {
    const regions: VisionRegion[] = [];
    const text = typeof rawInput === 'string' ? rawInput : (rawInput.text || '');
    const html = typeof rawInput === 'object' && rawInput ? (rawInput.html || '') : '';
    const rawImages = typeof rawInput === 'object' && rawInput && Array.isArray(rawInput.images) ? rawInput.images : [];
    const rawEquations = typeof rawInput === 'object' && rawInput && Array.isArray(rawInput.equations) ? rawInput.equations : [];

    let currentPage = 1;
    let currentY = 0;

    // 0. PDF structured path — use pre-classified PdfBlock array
    if (rawInput?.isPdf && Array.isArray(rawInput.pdfBlocks) && rawInput.pdfBlocks.length > 0) {
      return this.regionsFromPdfBlocks(rawInput.pdfBlocks, rawImages);
    }

    // 1. If structured HTML is available, extract blocks sequentially in reading order
    if (html && (html.includes('<p') || html.includes('<table') || html.includes('<ul') || html.includes('<ol') || html.includes('<h'))) {
      const blockRegex = /<(h[1-6]|p|table|pre|ul|ol|blockquote)[^>]*>([\s\S]*?)<\/\1>|<img[^>]+>/gi;
      let match;
      let bIdx = 0;

      while ((match = blockRegex.exec(html)) !== null) {
        const blockHtml = match[0].trim();
        const tagName = match[1] ? match[1].toLowerCase() : (blockHtml.startsWith('<img') ? 'img' : 'p');
        const innerText = blockHtml.replace(/<[^>]+>/g, '').trim();
        if (!innerText && tagName !== 'table' && tagName !== 'img' && !blockHtml.includes('<img')) continue;

        let regionType: VisionRegion['type'] = 'text';

        if (tagName === 'table') {
          regionType = 'table';
        } else if (tagName === 'pre' || blockHtml.includes('<code')) {
          regionType = 'code';
        } else if (tagName === 'img' || blockHtml.includes('<img')) {
          regionType = 'image';
        } else if (tagName.startsWith('h') || /^Section\s+\d+/i.test(innerText)) {
          regionType = 'header';
        } else if (this.isEquation(innerText) || blockHtml.includes('<math')) {
          regionType = 'equation';
        } else if (this.isCode(innerText, bIdx, [])) {
          regionType = 'code';
        }

        let content = regionType === 'table' || regionType === 'image' || blockHtml.includes('<a') || blockHtml.includes('<b') || blockHtml.includes('<strong') || blockHtml.includes('<i') || blockHtml.includes('<em') || blockHtml.includes('<u') || blockHtml.includes('<code') || blockHtml.includes('<sub') || blockHtml.includes('<sup') ? blockHtml : innerText;

        if (tagName === 'ul' || tagName === 'ol') {
          const liMatches = blockHtml.match(/<li[\s\S]*?<\/li>/gi) || [];
          if (liMatches.length > 0) {
            const formattedItems = liMatches.map((li, idx) => {
              const cleanTxt = li.replace(/<[^>]+>/g, '').trim();
              return tagName === 'ul' ? `• ${cleanTxt}` : `${idx + 1}. ${cleanTxt}`;
            });
            content = formattedItems.join('\n');
          }
        }

        regions.push({
          id: `region-${bIdx++}`,
          type: regionType,
          bbox: {
            x: 0,
            y: currentY,
            width: Math.max(innerText.length * 10, 100),
            height: tagName === 'table' ? 200 : 25,
            page: currentPage,
          },
          confidence: 0.9,
          content,
        });

        currentY += tagName === 'table' ? 210 : 30;

        if (innerText.includes('---') || innerText.includes('Page Break')) {
          currentPage++;
          currentY = 0;
        }
      }
    }

    // 2. Intelligent block-aware text parsing if HTML block extraction produced zero regions
    if (regions.length === 0) {
      regions.push(...this.parsePlainTextDocument(text));
    }

    // 3. Inject standalone images if not already matched
    rawImages.forEach((img: any, imgIdx: number) => {
      if (!regions.some(r => r.type === 'image' && (r.content || '').includes(img.dataUrl))) {
        regions.push({
          id: `region-image-${img.id || imgIdx + 1}`,
          type: 'image',
          bbox: { x: 0, y: currentY, width: img.width || 400, height: img.height || 300, page: img.position?.pageIndex || 1 },
          confidence: 0.95,
          content: `<img src="${img.dataUrl || img.data}" alt="Image ${imgIdx + 1}" class="rounded-lg max-w-full my-2 inline-block" />`,
        });
        currentY += 310;
      }
    });

    // 4. Inject standalone equations if not already matched
    rawEquations.forEach((eq: any, eqIdx: number) => {
      if (!regions.some(r => r.type === 'equation' && (r.content || '').includes(eq.latex))) {
        regions.push({
          id: `region-eq-${eqIdx + 1}`,
          type: 'equation',
          bbox: { x: 0, y: currentY, width: 300, height: 40, page: 1 },
          confidence: 0.95,
          content: eq.latex || eq.unicode || '',
        });
        currentY += 50;
      }
    });

    return regions;
  }

  /**
   * Parse plain text document into structured block regions (code, tables, math, headers, lists)
   */
  private static parsePlainTextDocument(text: string): VisionRegion[] {
    const regions: VisionRegion[] = [];
    const normalizedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '•')
      .replace(/\u00A0/g, ' ');

    const rawLines = normalizedText.split('\n');
    let currentPage = 1;
    let currentY = 0;
    let i = 0;

    while (i < rawLines.length) {
      const line = rawLines[i].trim();

      if (!line) {
        i++;
        continue;
      }

      // 1. Code fence block (```lang ... ```)
      if (line.startsWith('```')) {
        const lang = line.replace(/^```/, '').trim();
        const codeLines: string[] = [];
        i++;
        while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
          codeLines.push(rawLines[i]);
          i++;
        }
        if (i < rawLines.length && rawLines[i].trim().startsWith('```')) {
          i++;
        }
        const codeContent = codeLines.join('\n');
        regions.push({
          id: `region-code-${regions.length}`,
          type: 'code',
          bbox: { x: 0, y: currentY, width: 400, height: 100, page: currentPage },
          confidence: 0.95,
          content: codeContent,
          attributes: { language: lang || 'python', code: codeContent },
        } as any);
        currentY += 110;
        continue;
      }

      // 2. Multi-line Table block (pipe, ASCII, tab, or multi-space aligned)
      const isTableLine = (str: string) => {
        if (!str) return false;
        if (/^\s*[\u2022•\-\*]/m.test(str) || /^\(?\d+[\.\)]\s*/.test(str)) return false;
        if (str.includes('|')) return true;
        if (/^\+[-+]+\+$/.test(str) || /^\|?[-:\s|]+\|?$/.test(str)) return true;
        if (str.includes('\t') && str.split('\t').length >= 2) return true;
        if (/\s{2,}/.test(str) && str.split(/\s{2,}/).length >= 2) return true;
        return false;
      };

      if (isTableLine(line)) {
        const tableLines: string[] = [];
        while (i < rawLines.length && isTableLine(rawLines[i].trim())) {
          tableLines.push(rawLines[i].trim());
          i++;
        }

        if (tableLines.length >= 2 || (tableLines.length === 1 && tableLines[0].includes('|'))) {
          const parsedRows: string[][] = [];
          for (const tLine of tableLines) {
            if (/^\+[-+]+\+$/.test(tLine) || /^\|?[-:\s|]+\|?$/.test(tLine)) continue;
            let cells: string[] = [];
            if (tLine.includes('|')) {
              const parts = tLine.split('|');
              if (parts.length >= 2 && parts[0] === '' && parts[parts.length - 1] === '') {
                cells = parts.slice(1, -1).map(c => c.trim());
              } else {
                cells = parts.map(c => c.trim()).filter(Boolean);
              }
            } else if (tLine.includes('\t')) {
              cells = tLine.split('\t').map(c => c.trim()).filter(Boolean);
            } else if (/\s{2,}/.test(tLine)) {
              cells = tLine.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
            } else {
              cells = [tLine.trim()];
            }
            if (cells.length > 0) parsedRows.push(cells);
          }

          if (parsedRows.length > 0) {
            const headers = parsedRows[0];
            const rows = parsedRows.length > 1 ? parsedRows.slice(1) : [];
            const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
            const rowsHtml = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
            const tableHtml = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;

            regions.push({
              id: `region-table-${regions.length}`,
              type: 'table',
              bbox: { x: 0, y: currentY, width: 400, height: 150, page: currentPage },
              confidence: 0.95,
              content: tableHtml,
              attributes: { headers, rows, bodyRows: rows, allRows: parsedRows, cells: parsedRows },
            } as any);
            currentY += 160;
            continue;
          }
        }
      }

      // 3. Header / Passage line
      const isHeaderLine = this.isHeader(line, i) || /^Passage:|^Read\s+the\s+following|^Case\s+Study:/i.test(line);
      const regionType = isHeaderLine ? 'header' : this.detectRegionType(line, i, rawLines);

      regions.push({
        id: `region-${i}`,
        type: regionType,
        bbox: {
          x: 0,
          y: currentY,
          width: line.length * 10,
          height: 20,
          page: currentPage,
        },
        confidence: 0.85,
        content: line,
      });

      currentY += 25;
      if (line.includes('---') || line.includes('Page Break')) {
        currentPage++;
        currentY = 0;
      }
      i++;
    }

    return regions;
  }

  /**
   * Detect type of a region based on content
   */
  private static detectRegionType(
    line: string,
    index: number,
    allLines: string[]
  ): VisionRegion['type'] {
    const lowerLine = line.toLowerCase();

    // Header detection
    if (this.isHeader(line, index)) {
      return 'header';
    }

    // Footer detection
    if (this.isFooter(line, index, allLines.length)) {
      return 'footer';
    }

    // Table detection
    if (this.isTable(line)) {
      return 'table';
    }

    // Equation detection
    if (this.isEquation(line)) {
      return 'equation';
    }

    // Code detection
    if (this.isCode(line, index, allLines)) {
      return 'code';
    }

    // Diagram detection
    if (lowerLine.includes('[diagram]') || lowerLine.includes('[chart]')) {
      return 'diagram';
    }

    // Default to text
    return 'text';
  }

  /**
   * Check if line is a header
   */
  private static isHeader(line: string, index: number): boolean {
    // All caps and short
    if (line === line.toUpperCase() && line.length < 50 && line.length > 3) {
      return true;
    }

    // Very early in document
    if (index < 5 && line.length < 30) {
      return true;
    }

    // Contains header keywords
    const headerKeywords = ['chapter', 'section', 'part', 'unit'];
    if (headerKeywords.some(keyword => line.toLowerCase().includes(keyword))) {
      return true;
    }

    return false;
  }

  /**
   * Check if line is a footer
   */
  private static isFooter(line: string, index: number, totalLines: number): boolean {
    const trimmed = line.trim();

    // Page number patterns (e.g. "6 to 8", "Page 6 of 8", "6", "6/8", "6-8")
    if (
      /^\d{1,4}$/.test(trimmed) ||
      /^(?:page|pg|p\.?)\s*\d+(?:\s*(?:to|-|of|\/|—)\s*\d+)?$/i.test(trimmed) ||
      /^\d+\s+(?:of|to)\s+\d+$/i.test(trimmed) ||
      /^\d+\s*(?:to|-|—)\s*\d+$/i.test(trimmed) ||
      /^\d+\s*[\/\-—]\s*\d+$/.test(trimmed) ||
      /^--?\s*\d+\s*(?:to|-|of|\/|—)?\s*\d*--?$/i.test(trimmed)
    ) {
      return true;
    }

    // Very late in document
    if (index > totalLines - 5 && line.length < 30) {
      return true;
    }

    // Copyright
    if (/^©\s*\d{4}/i.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Check if line is part of a table
   */
  private static isTable(line: string): boolean {
    if (line.includes('\t')) return true;
    if ((line.match(/\|/g) || []).length >= 2) return true;
    // Check for column-like multiple space gaps: "Language    Creator    Year"
    const parts = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) return true;
    return false;
  }

  /**
   * Check if line is an equation
   */
  private static isEquation(line: string): boolean {
    // LaTeX delimiters
    if (line.includes('$') || line.includes('\\[') || line.includes('\\]')) {
      return true;
    }

    // Math symbols
    const mathSymbols = ['∫', '∑', '√', 'π', 'θ', '≠', '≤', '≥'];
    if (mathSymbols.some(symbol => line.includes(symbol))) {
      return true;
    }

    // Superscript characters (², ³, etc.)
    if (/[²³¹⁴⁵⁶⁷⁸⁹⁰]/.test(line)) {
      return true;
    }

    // Mathematical patterns: X = Y with operators
    if (/^[a-zA-Z]+\s*[=+\-*\/]\s*[a-zA-Z0-9²³]+/.test(line)) {
      return true;
    }

    return false;
  }

  /**
   * Check if line is a numbered list item
   */
  private static isNumberedList(line: string): boolean {
    // Pattern: "1. Text", "2. Text", etc.
    return /^\d+\.\s+.+$/.test(line);
  }

  /**
   * Check if line is code
   */
  private static isCode(line: string, index: number, allLines: string[]): boolean {
    // Check if in code block
    const beforeLines = allLines.slice(Math.max(0, index - 5), index);
    const afterLines = allLines.slice(index + 1, Math.min(allLines.length, index + 5));

    const hasCodeFence = [...beforeLines, ...afterLines].some(l =>
      l.trim().startsWith('```')
    );

    if (hasCodeFence) {
      return true;
    }

    // Code-like patterns
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /class\s+\w+/,
      /def\s+\w+\s*\(/,
      /import\s+/,
      /#include/,
    ];

    if (codePatterns.some(pattern => pattern.test(line))) {
      return true;
    }

    return false;
  }

  /**
   * Calculate overall confidence
   */
  private static calculateConfidence(
    rawContent: any,
    layout: LayoutAnalysis,
    regions: VisionRegion[]
  ): number {
    const ocrConfidence = 0.9; // Would come from actual OCR engine
    const layoutConfidence = layout.confidence;
    const regionConfidence = regions.length > 0 ? 0.85 : 0.5;

    // Weighted average
    return (
      ocrConfidence * 0.4 +
      layoutConfidence * 0.3 +
      regionConfidence * 0.3
    );
  }
}
