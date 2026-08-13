import { UnifiedExtractionResult, ExtractedMedia, ExtractedQuestion } from './types.js';
import { DocxOpenXmlParser } from './parsers/DocxOpenXmlParser.js';
import { PdfExtractionEngine } from './parsers/PdfExtractionEngine.js';
import { SemanticDocumentTree } from './pass1/SemanticDocumentTree.js';
import { EducationalGroupingEngine } from './pass2/EducationalGroupingEngine.js';
import { CodeBlockExtractor } from './extractors/CodeBlockExtractor.js';
import { MathFormulaEngine } from './extractors/MathFormulaEngine.js';
import { FallbackOcrService } from '../multimodalKnowledge/FallbackOcrService.js';

export interface ProcessUploadOptions {
  buffer?: Buffer;
  fileName: string;
  mimeType?: string;
  url?: string;
}

export class UnifiedExtractionEngine {
  /**
   * Primary Entry Point: Process any file upload or URL import through the Two-Pass Document Understanding Pipeline
   */
  public static async process(options: ProcessUploadOptions): Promise<UnifiedExtractionResult> {
    const { buffer, fileName, mimeType, url } = options;
    const ext = (fileName.split('.').pop() || '').toLowerCase();

    console.log(`[UnifiedExtractionEngine] Processing import through Two-Pass Pipeline: ${fileName} (ext: ${ext})`);

    let ast: UnifiedExtractionResult['ast'];
    let media: ExtractedMedia[] = [];
    let html = '';
    let rawText = '';
    let sourceType = ext || 'unknown';
    let questions: ExtractedQuestion[] = [];

    if (ext === 'docx' || mimeType?.includes('wordprocessingml')) {
      // OpenXML DOCX executes Two-Pass (Pass 1: Semantic Tree, Pass 2: Educational Grouping) inside DocxOpenXmlParser
      return await DocxOpenXmlParser.parse(buffer!, fileName);
    } else if (ext === 'pdf' || mimeType?.includes('pdf')) {
      sourceType = 'pdf';
      if (!buffer) throw new Error('PDF buffer is required for extraction');
      const pdfResult = await PdfExtractionEngine.parse(buffer, fileName);
      ast = pdfResult.ast;
      media = pdfResult.media;
      html = pdfResult.html;
      rawText = ast.nodes.map(n => n.plainText).join('\n');
    } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'gif'].includes(ext) || mimeType?.startsWith('image/')) {
      sourceType = 'image';
      if (!buffer) throw new Error('Image buffer is required for extraction');
      const ocrResult = await FallbackOcrService.runOcr(buffer, mimeType || 'image/png');
      rawText = ocrResult.extractedText || '';
      html = `<p>${rawText}</p>`;

      const dataUrl = `data:${mimeType || 'image/png'};base64,${buffer.toString('base64')}`;
      media.push({
        id: 'img_upload_1',
        fileName,
        mimeType: mimeType || 'image/png',
        dataUrl,
        buffer,
        byteSize: buffer.length,
      });

      ast = {
        title: fileName.replace(/\.[^/.]+$/, ''),
        metadata: { wordCount: rawText.split(/\s+/).length, hasCode: false, hasTables: false, hasMath: false, hasImages: true },
        nodes: [{ type: 'paragraph', id: 'p_img_1', runs: [{ type: 'run', text: rawText, formatting: {} }], plainText: rawText }],
        footnotes: [],
        endnotes: [],
        comments: [],
        headers: [],
        footers: [],
      };
    } else {
      sourceType = ext || 'text';
      rawText = buffer ? buffer.toString('utf-8') : '';
      html = `<p>${rawText}</p>`;

      const codeExtraction = CodeBlockExtractor.extractCodeBlocks(rawText);
      const mathFormulas = MathFormulaEngine.extractMathFormulas(codeExtraction.remainingText);

      ast = {
        title: fileName.replace(/\.[^/.]+$/, ''),
        metadata: {
          wordCount: rawText.split(/\s+/).length,
          hasCode: codeExtraction.codeBlocks.length > 0,
          hasTables: false,
          hasMath: mathFormulas.length > 0,
          hasImages: false,
        },
        nodes: [
          ...codeExtraction.codeBlocks,
          ...mathFormulas,
          { type: 'paragraph', id: 'p_txt_1', runs: [{ type: 'run', text: codeExtraction.remainingText, formatting: {} }], plainText: codeExtraction.remainingText },
        ],
        footnotes: [],
        endnotes: [],
        comments: [],
        headers: [],
        footers: [],
      };
    }

    // Build Pass 1 Semantic Document Tree for text/pdf/image formats
    const tree = new SemanticDocumentTree(fileName.replace(/\.[^/.]+$/, ''));
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    lines.forEach((line, idx) => {
      const isQMarker = /^(?:Q(?:uestion)?\s*\d+[\.\:\)]|\d+[\.\:\)])\s*/i.test(line);
      const isOption = /^(?:[\(\[]?[A-Za-z0-9]+[\.\)\:]|[*•\-])\s+/i.test(line) && !isQMarker;
      const isAnswer = /^(?:Answer|Ans|Correct Answer)[\:\s]+/i.test(line);
      const isExplanation = /^(?:Explanation|Solution)[\:\s]+/i.test(line);

      const blockId = `block_txt_${idx + 1}`;

      if (isQMarker) {
        tree.addBlock({ id: blockId, type: 'QuestionMarker', plainText: line });
      } else if (isOption) {
        tree.addBlock({ id: blockId, type: 'Option', plainText: line });
      } else if (isAnswer) {
        tree.addBlock({ id: blockId, type: 'Answer', plainText: line });
      } else if (isExplanation) {
        tree.addBlock({ id: blockId, type: 'Explanation', plainText: line });
      } else {
        tree.addBlock({ id: blockId, type: 'Paragraph', plainText: line });
      }
    });

    // Pass 2: Educational Grouping Engine
    questions = EducationalGroupingEngine.groupQuestions(tree);

    return {
      sourceType,
      rawContent: {
        text: rawText,
        html,
      },
      ast,
      questions,
      media,
      confidenceScore: 0.98,
    };
  }
}
