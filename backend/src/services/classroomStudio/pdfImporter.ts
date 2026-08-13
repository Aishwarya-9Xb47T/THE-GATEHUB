/**
 * PDF Presentation Importer Service
 * Parses uploaded PDF presentation files into structured slide content
 */

import type { ImportResult } from './types.js';

export async function parsePDFPresentation(buffer: Buffer): Promise<ImportResult> {
  try {
    const pdfParseModule: any = await import('pdf-parse');
    const pdfParse = pdfParseModule.default || pdfParseModule;

    const pageTexts: string[] = [];

    // Custom pagerender to capture per-page text
    const options = {
      pagerender: (pageData: any) => {
        return pageData.getTextContent().then((textContent: any) => {
          let lastY: number | null = null;
          let text = '';
          for (const item of textContent.items) {
            if (lastY === null || Math.abs(lastY - item.transform[5]) > 5) {
              text += '\n' + item.str;
            } else {
              text += ' ' + item.str;
            }
            lastY = item.transform[5];
          }
          pageTexts.push(text.trim());
          return text;
        });
      },
    };

    const data = await pdfParse(buffer, options);
    const totalPages = data.numpages || pageTexts.length;

    const slides = pageTexts.map((rawPageText, index) => {
      const lines = rawPageText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const title = lines[0] || `Slide ${index + 1}`;
      const bodyLines = lines.slice(1);

      // Construct slide content format compatible with SlideRenderer & slideParser
      const paragraphs = bodyLines.map((line) => ({
        text: line,
      }));

      return {
        title,
        content: {
          title,
          text: bodyLines,
          paragraphs,
        },
      };
    });

    // Fallback if no pages extracted text
    if (slides.length === 0) {
      for (let i = 1; i <= totalPages; i++) {
        slides.push({
          title: `Slide ${i}`,
          content: {
            title: `Slide ${i}`,
            text: [],
            paragraphs: [],
          },
        });
      }
    }

    return {
      success: true,
      slides,
      metadata: {
        totalPages,
        info: data.info,
      },
    };
  } catch (error: any) {
    console.error('[PDF Importer] Error parsing PDF presentation:', error);
    return {
      success: false,
      error: error.message || 'Failed to parse PDF document',
    };
  }
}
