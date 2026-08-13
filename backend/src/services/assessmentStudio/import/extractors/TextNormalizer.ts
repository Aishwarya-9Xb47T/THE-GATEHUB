/**
 * Stage 3: Text Normalization
 * Removes headers, footers, page numbers, watermarks, and other non-question content
 */

import { RawContent, NormalizedText } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';

export class TextNormalizer {
  private static readonly HEADER_PATTERNS = [
    /^(Chapter|Section|Part)\s+\d+/i,
    /^\d+\.\s+[A-Z][^.]+$/, // Numbered sections
    /^[A-Z][A-Z\s]{5,}$/, // All caps headers
    /^(Table of Contents|Contents|Index|Appendix|References|Bibliography)$/i,
  ];

  private static readonly FOOTER_PATTERNS = [
    /^(?:page|pg|p\.?)\s*\d+(?:\s*(?:to|-|of|\/|—)\s*\d+)?$/i,
    /^\d+\s+(?:of|to)\s+\d+$/i,
    /^\d+\s*(?:to|-|—)\s*\d+$/i,
    /^\d+\s*[\/\-—]\s*\d+$/,
    /^©\s+\d{4}/i, // Copyright
    /^(All rights reserved|Confidential)$/i,
  ];

  private static readonly PAGE_NUMBER_PATTERNS = [
    /^\d{1,4}$/,
    /^--?\s*\d+\s*(?:to|-|of|\/|—)?\s*\d*--?$/i,
    /^(?:page|pg|p\.?)\s*\d+(?:\s*(?:to|-|of|\/|—)\s*\d+)?$/i,
    /^\d+\s*(?:to|-|of|\/|—)\s*\d+$/i,
  ];

  private static readonly WATERMARK_PATTERNS = [
    /draft/i,
    /confidential/i,
    /do not distribute/i,
    /sample/i,
    /for review only/i,
  ];

  /**
   * Normalize raw content by removing non-question elements
   */
  static normalize(rawContent: RawContent): NormalizedText {
    try {
      const lines = rawContent.text.split('\n');
      const filteredLines: string[] = [];
      let removedHeaders = 0;
      let removedFooters = 0;
      let removedPageNumbers = 0;

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines (but preserve paragraph breaks)
        if (!trimmed) {
          filteredLines.push('');
          continue;
        }

        // Check for headers
        if (this.isHeader(trimmed)) {
          removedHeaders++;
          continue;
        }

        // Check for footers
        if (this.isFooter(trimmed)) {
          removedFooters++;
          continue;
        }

        // Check for page numbers
        if (this.isPageNumber(trimmed)) {
          removedPageNumbers++;
          continue;
        }

        // Check for watermarks
        if (this.isWatermark(trimmed)) {
          continue;
        }

        filteredLines.push(line);
      }

      // Normalize whitespace
      const normalizedText = this.normalizeWhitespace(filteredLines.join('\n'));

      return {
        content: normalizedText,
        images: rawContent.images,
        statistics: {
          originalLength: rawContent.text.length,
          normalizedLength: normalizedText.length,
          removedHeaders,
          removedFooters,
          removedPageNumbers,
        },
      };
    } catch (error) {
      throw new AppError(500, `Text normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if line is a header
   */
  private static isHeader(line: string): boolean {
    return this.HEADER_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is a footer
   */
  private static isFooter(line: string): boolean {
    return this.FOOTER_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is a page number
   */
  private static isPageNumber(line: string): boolean {
    return this.PAGE_NUMBER_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is a watermark
   */
  private static isWatermark(line: string): boolean {
    return this.WATERMARK_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Normalize whitespace (multiple spaces, tabs, etc.)
   */
  private static normalizeWhitespace(text: string): string {
    // Replace multiple spaces with single space
    let normalized = text.replace(/[ \t]+/g, ' ');
    // Replace multiple newlines with double newline (paragraph break)
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    // Trim leading/trailing whitespace
    normalized = normalized.trim();
    return normalized;
  }

  /**
   * Convert special characters to Unicode
   */
  private static convertSpecialChars(text: string): string {
    // Convert common special characters to their Unicode equivalents
    const charMap: Record<string, string> = {
      '\u2013': '-', // en dash
      '\u2014': '-', // em dash
      '\u2018': "'", // left single quote
      '\u2019': "'", // right single quote
      '\u201C': '"', // left double quote
      '\u201D': '"', // right double quote
      '\u2026': '...', // ellipsis
      '\u00A9': '(c)', // copyright
      '\u00AE': '(r)', // registered
      '\u2122': '(tm)', // trademark
    };

    let converted = text;
    for (const [special, replacement] of Object.entries(charMap)) {
      converted = converted.split(special).join(replacement);
    }
    return converted;
  }
}
