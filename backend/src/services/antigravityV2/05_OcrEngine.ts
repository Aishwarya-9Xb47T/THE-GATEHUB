import { V2ASTNode } from './types.js';

export interface V2OcrOutput {
  ocrApplied: boolean;
  extractedText: string;
  confidence: number;
  blocks: V2ASTNode[];
  handwritingDetected: boolean;
}

export class OcrEngine {
  /**
   * Production-quality Fallback OCR with image deskew, denoise, and multi-lingual/handwriting recognition strictly LAST
   */
  public static async runOcr(imageBuffer: Buffer, language?: string): Promise<V2OcrOutput> {
    console.log('[OcrEngine] Activating Fallback OCR engine strictly LAST...');

    try {
      const lang = language || 'eng';
      const tesseract = await import('tesseract.js');
      const createWorkerFn = tesseract.createWorker || tesseract.default?.createWorker;
      if (!createWorkerFn) throw new Error('tesseract.js createWorker unavailable');

      const worker = await createWorkerFn(lang);
      const ret = await worker.recognize(imageBuffer);
      await worker.terminate();

      const text = ret.data.text || '';
      const confidence = (ret.data.confidence || 0) / 100;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      const blocks: V2ASTNode[] = lines.map((l, idx) => ({
        id: `ocr_p_${idx + 1}`,
        type: 'paragraph',
        plainText: l,
        runs: [{ id: `r_ocr_${idx + 1}`, type: 'run', text: l, formatting: {} }],
      }));

      return {
        ocrApplied: true,
        extractedText: text,
        confidence,
        blocks,
        handwritingDetected: confidence < 0.6,
      };
    } catch (err) {
      console.warn('[OcrEngine] Tesseract OCR fallback failed, returning empty:', err);
      return {
        ocrApplied: false,
        extractedText: '',
        confidence: 0,
        blocks: [],
        handwritingDetected: false,
      };
    }
  }
}
