import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import { extractPdfImages } from './pdfImageExtract.js';

export class PdfParser {
  static async extract(buffer: Buffer): Promise<RawContent & { documentGraph?: any }> {
    console.log('[PdfParser] ENTRY', { bufferSize: buffer.length });
    try {
      // 1. Primary Native Multi-Layer Pipeline Execution
      const { PdfNativePipeline } = await import('./PdfNativePipeline.js');
      const nativeResult = await PdfNativePipeline.process(buffer);

      console.log('[PdfParser] PdfNativePipeline completed:', {
        pagesCount: nativeResult.pagesCount,
        nativeImages: nativeResult.images.length,
        nodes: nativeResult.documentGraph.getAllNodes().length,
      });
      const mod: any = await import('pdf-parse');
      let data: any;
      if (mod.PDFParse) {
        const p = new mod.PDFParse({ data: buffer });
        console.log('[PdfParser] p instance:', {
          keys: Object.keys(p),
          protoKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(p))
        });
        if (typeof p.getText === 'function') {
          const textObj = await p.getText();
          data = { text: typeof textObj === 'string' ? textObj : textObj?.text || JSON.stringify(textObj), numpages: p.pageCount || 1 };
        } else if (typeof p.extractText === 'function') {
          const textObj = await p.extractText();
          data = { text: textObj, numpages: p.pageCount || 1 };
        } else if (typeof p.asBuffer === 'function') {
          data = await p.asBuffer();
        } else {
          data = await p;
        }
      }
      console.log('[PdfParser] PDF parsed', { 
        textLength: data.text?.length || 0,
        pageCount: data.numpages,
        hasText: !!data.text
      });
      
      if (!data.text) {
        throw new Error('PDF parsing returned no text - possibly invalid PDF file');
      }

      // ── PDF-specific image extraction ──────────────────────────────────
      const pdfImages = extractPdfImages(buffer);
      console.log('[PdfParser] Extracted PDF images:', { count: pdfImages.length });

      // ── PDF-specific layout normalisation ─────────────────────────────
      const { PdfLayoutNormalizer } = await import('./PdfLayoutNormalizer.js');
      const pdfBlocks = PdfLayoutNormalizer.normalize(data.text, data.numpages || 1);

      const educationalBlocks = pdfBlocks.filter(
        b => b.type !== 'page_decoration' && b.type !== 'decorative'
      );

      const normalisedLines: string[] = [];
      for (const b of educationalBlocks) {
        switch (b.type) {
          case 'list_item': {
            const indent = '  '.repeat(b.listLevel ?? 0);
            const prefix = b.listOrdered ? `${indent}` : `${indent}• `;
            normalisedLines.push(`${prefix}${b.text}`);
            break;
          }
          case 'table_row':
            normalisedLines.push(b.text);
            break;
          case 'code':
            normalisedLines.push('```');
            normalisedLines.push(b.text);
            normalisedLines.push('```');
            break;
          case 'equation':
            normalisedLines.push(b.text);
            break;
          case 'fill_answer':
            normalisedLines.push(b.text);
            break;
          default:
            normalisedLines.push(b.text);
        }
      }

      const normalisedText = normalisedLines.join('\n');

      const rawContent = {
        text: normalisedText || nativeResult.text,
        images: pdfImages.length > 0 ? pdfImages : nativeResult.images,
        documentGraph: nativeResult.documentGraph.toSerializable(),
        metadata: {
          wordCount: (normalisedText || nativeResult.text).split(/\s+/).length,
          pageCount: data.numpages || nativeResult.pagesCount,
        },
        isPdf: true as const,
        pdfBlocks,
      };

      console.log('[PdfParser] TRACE - PARSER OUTPUT:', {
        inputBufferSize: buffer.length,
        extractedTextLength: data.text.length,
        normalisedTextLength: normalisedText.length,
        imageCount: pdfImages.length,
        imageIDs: pdfImages.map(img => img.id),
        mimeTypes: pdfImages.map(img => img.mimeType),
        byteSizes: pdfImages.map(img => img.buffer?.length),
        status: pdfImages.length > 0 ? 'SUCCESS' : 'NO_IMAGES_FOUND',
      });
      return rawContent as any;
    } catch (error) {
      console.log('[PdfParser] EXIT - error', { error });
      if (error instanceof AppError) throw error;
      throw new AppError(500, `PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
