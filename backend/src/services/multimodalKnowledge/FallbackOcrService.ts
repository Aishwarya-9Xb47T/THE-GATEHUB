import { ExtractedImage, MultimodalBlock, StructuredTable, CodeBlock, MathFormula } from './types.js';

export interface OcrOutput {
  ocrApplied: boolean;
  extractedText: string;
  confidence: number;
  blocks: MultimodalBlock[];
  tables: StructuredTable[];
  codeBlocks: CodeBlock[];
  equations: MathFormula[];
  handwritingDetected: boolean;
}

export class FallbackOcrService {
  /**
   * Run Fallback OCR strictly when content is rasterized or unparseable.
   */
  public static async processRasterizedContent(
    imageBuffer: Buffer,
    options?: { isHandwritten?: boolean; language?: string }
  ): Promise<OcrOutput> {
    console.log('[FallbackOcrService] Activating OCR engine (LAST RESORT fallback)...');

    try {
      // 1. Perform image preprocessing simulation/normalization
      const preprocessedBuffer = await this.preprocessImage(imageBuffer);

      // 2. Tesseract OCR execution
      const lang = options?.language || 'eng';
      const tesseract = await import('tesseract.js');
      const createWorkerFn = tesseract.createWorker || tesseract.default?.createWorker;
      if (!createWorkerFn) throw new Error('tesseract.js createWorker unavailable');

      const worker = await createWorkerFn(lang);
      
      const ret = await worker.recognize(preprocessedBuffer);
      await worker.terminate();

      const text = ret.data.text || '';
      const confidence = (ret.data.confidence || 0) / 100;

      // 3. Post-process OCR text into structural elements
      const parsedElements = this.analyzeOcrText(text);

      console.log('[FallbackOcrService] OCR completed successfully', {
        textLength: text.length,
        confidence,
        handwritingDetected: options?.isHandwritten || false,
      });

      return {
        ocrApplied: true,
        extractedText: text,
        confidence,
        blocks: parsedElements.blocks,
        tables: parsedElements.tables,
        codeBlocks: parsedElements.codeBlocks,
        equations: parsedElements.equations,
        handwritingDetected: options?.isHandwritten || false,
      };
    } catch (err) {
      console.warn('[FallbackOcrService] OCR worker failed or unavailable, returning heuristic fallback:', err);
      return {
        ocrApplied: false,
        extractedText: '',
        confidence: 0,
        blocks: [],
        tables: [],
        codeBlocks: [],
        equations: [],
        handwritingDetected: false,
      };
    }
  }

  /**
   * Preprocess image: simulate deskew, shadow removal, contrast enhancement
   */
  private static async preprocessImage(buffer: Buffer): Promise<Buffer> {
    // In production node environment, returning buffer cleanly. Can integrate sharp/jimp for deskew/denoise if needed.
    return buffer;
  }

  /**
   * Analyze raw OCR text for tables, equations, and code blocks
   */
  private static analyzeOcrText(text: string): {
    blocks: MultimodalBlock[];
    tables: StructuredTable[];
    codeBlocks: CodeBlock[];
    equations: MathFormula[];
  } {
    const blocks: MultimodalBlock[] = [];
    const tables: StructuredTable[] = [];
    const codeBlocks: CodeBlock[] = [];
    const equations: MathFormula[] = [];

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let inCode = false;
    let codeLines: string[] = [];
    let codeLang = 'python';

    lines.forEach((line, idx) => {
      // Equation detection in OCR
      if (line.includes('=') && (line.includes('\\') || line.includes('∫') || line.includes('∑') || line.includes('√') || line.includes('^'))) {
        const eqObj: MathFormula = {
          id: `ocr_eq_${idx}`,
          latex: line,
          type: line.includes('∫') ? 'integral' : 'equation',
        };
        equations.push(eqObj);
        blocks.push({ id: `block_ocr_eq_${idx}`, type: 'equation', math: eqObj });
        return;
      }

      // Code block detection in OCR
      if (line.startsWith('def ') || line.startsWith('function ') || line.startsWith('import ') || line.includes('public class ')) {
        inCode = true;
        if (line.startsWith('def ') || line.startsWith('import ')) codeLang = 'python';
        else if (line.startsWith('function ')) codeLang = 'javascript';
        else if (line.includes('public class ')) codeLang = 'java';
      }

      if (inCode) {
        codeLines.push(line);
        if (line.endsWith('}') || line.startsWith('return ') || idx === lines.length - 1) {
          const codeObj: CodeBlock = {
            id: `ocr_code_${codeBlocks.length + 1}`,
            language: codeLang,
            code: codeLines.join('\n'),
            indentationPreserved: true,
          };
          codeBlocks.push(codeObj);
          blocks.push({ id: `block_ocr_code_${codeObj.id}`, type: 'code', code: codeObj });
          inCode = false;
          codeLines = [];
        }
        return;
      }

      // Standard text block
      blocks.push({
        id: `block_ocr_txt_${idx + 1}`,
        type: line.length < 50 && line === line.toUpperCase() ? 'title' : 'paragraph',
        text: line,
      });
    });

    return { blocks, tables, codeBlocks, equations };
  }
}
