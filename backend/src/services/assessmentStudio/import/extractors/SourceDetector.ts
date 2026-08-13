/**
 * Stage 1: Source Type Detection
 * Detects the type of input source (file extension, URL pattern, MIME type)
 */

import { SourceType, ContentSource, SourceDetectionResult, ContentInput } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';

export class SourceDetector {
  private static readonly FILE_EXTENSIONS: Record<string, SourceType> = {
    '.pdf': SourceType.PDF,
    '.docx': SourceType.DOCX,
    '.doc': SourceType.DOCX,
    '.pptx': SourceType.PPTX,
    '.ppt': SourceType.PPTX,
    '.png': SourceType.IMAGE,
    '.jpg': SourceType.IMAGE,
    '.jpeg': SourceType.IMAGE,
    '.gif': SourceType.IMAGE,
    '.bmp': SourceType.IMAGE,
    '.tiff': SourceType.IMAGE,
    '.md': SourceType.MARKDOWN,
    '.markdown': SourceType.MARKDOWN,
    '.txt': SourceType.TXT,
    '.html': SourceType.HTML,
    '.htm': SourceType.HTML,
    '.csv': SourceType.CSV,
    '.xls': SourceType.EXCEL,
    '.xlsx': SourceType.EXCEL,
    '.xml': SourceType.MOODLE_XML,
  };

  private static readonly MIME_TYPES: Record<string, SourceType> = {
    'application/pdf': SourceType.PDF,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': SourceType.DOCX,
    'application/msword': SourceType.DOCX,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': SourceType.PPTX,
    'application/vnd.ms-powerpoint': SourceType.PPTX,
    'image/png': SourceType.IMAGE,
    'image/jpeg': SourceType.IMAGE,
    'image/gif': SourceType.IMAGE,
    'image/bmp': SourceType.IMAGE,
    'image/tiff': SourceType.IMAGE,
    'text/markdown': SourceType.MARKDOWN,
    'text/plain': SourceType.TXT,
    'text/html': SourceType.HTML,
    'text/csv': SourceType.CSV,
    'application/vnd.ms-excel': SourceType.EXCEL,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': SourceType.EXCEL,
    'text/xml': SourceType.MOODLE_XML,
    'application/xml': SourceType.MOODLE_XML,
  };

  private static readonly URL_PATTERNS: Array<{ pattern: RegExp; type: SourceType; priority: number }> = [
    { pattern: /docs\.google\.com\/document/i, type: SourceType.GOOGLE_DOCS, priority: 10 },
    { pattern: /docs\.google\.com\/forms/i, type: SourceType.GOOGLE_FORMS, priority: 10 },
    { pattern: /forms\.google\.com/i, type: SourceType.GOOGLE_FORMS, priority: 10 },
    { pattern: /youtube\.com\/watch/i, type: SourceType.YOUTUBE, priority: 10 },
    { pattern: /youtu\.be\//i, type: SourceType.YOUTUBE, priority: 10 },
    { pattern: /moodle\.org/i, type: SourceType.MOODLE_XML, priority: 5 },
    { pattern: /\.moodle\.org/i, type: SourceType.MOODLE_XML, priority: 5 },
  ];

  /**
   * Detect source type from input
   */
  static detect(input: ContentInput): SourceDetectionResult {
    try {
      switch (input.source) {
        case ContentSource.FILE:
          return this.detectFromFile(input.file!);
        case ContentSource.URL:
          return this.detectFromUrl(input.url!);
        case ContentSource.GOOGLE_DOCS:
          return {
            sourceType: SourceType.GOOGLE_DOCS,
            confidence: 1.0,
            metadata: { urlPattern: 'google_docs_api' },
          };
        case ContentSource.GOOGLE_FORMS:
          return {
            sourceType: SourceType.GOOGLE_FORMS,
            confidence: 1.0,
            metadata: { urlPattern: 'google_forms_api' },
          };
        default:
          throw new AppError(400, `Unsupported content source: ${input.source}`);
      }
    } catch (error) {
      throw new AppError(400, `Source detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect source type from uploaded file
   */
  private static detectFromFile(file: ContentInput['file']): SourceDetectionResult {
    if (!file) {
      throw new AppError(400, 'No file provided');
    }
    const { name, mimeType } = file;

    // Try MIME type first (highest confidence)
    if (mimeType && this.MIME_TYPES[mimeType]) {
      return {
        sourceType: this.MIME_TYPES[mimeType],
        confidence: 0.95,
        metadata: { mimeType, extension: this.getExtension(name) || undefined },
      };
    }

    // Fall back to file extension
    const extension = this.getExtension(name);
    if (extension && this.FILE_EXTENSIONS[extension]) {
      return {
        sourceType: this.FILE_EXTENSIONS[extension],
        confidence: 0.85,
        metadata: { extension: extension || undefined, mimeType },
      };
    }

    throw new AppError(400, `Unsupported file type: ${name} (extension: ${extension}, MIME: ${mimeType})`);
  }

  /**
   * Detect source type from URL
   */
  private static detectFromUrl(url: string): SourceDetectionResult {
    if (!url || !this.isValidUrl(url)) {
      throw new AppError(400, `Invalid URL: ${url}`);
    }

    // Check URL patterns (highest priority)
    for (const { pattern, type, priority } of this.URL_PATTERNS) {
      if (pattern.test(url)) {
        return {
          sourceType: type,
          confidence: 0.9,
          metadata: { urlPattern: pattern.source },
        };
      }
    }

    // Default to website
    return {
      sourceType: SourceType.WEBSITE,
      confidence: 0.7,
      metadata: { urlPattern: 'generic_website' },
    };
  }

  /**
   * Extract file extension from filename
   */
  private static getExtension(filename: string): string | null {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return null;
    return filename.substring(lastDot).toLowerCase();
  }

  /**
   * Validate URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate file size (50MB max)
   */
  static validateFileSize(size: number): boolean {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    return size <= MAX_SIZE;
  }

  /**
   * Get human-readable source type name
   */
  static getSourceTypeName(type: SourceType): string {
    const names: Record<SourceType, string> = {
      [SourceType.PDF]: 'PDF Document',
      [SourceType.DOCX]: 'Word Document',
      [SourceType.PPTX]: 'PowerPoint Presentation',
      [SourceType.IMAGE]: 'Image',
      [SourceType.MARKDOWN]: 'Markdown File',
      [SourceType.TXT]: 'Text File',
      [SourceType.HTML]: 'HTML File',
      [SourceType.CSV]: 'CSV Spreadsheet',
      [SourceType.EXCEL]: 'Excel Spreadsheet',
      [SourceType.MOODLE_XML]: 'Moodle XML',
      [SourceType.GOOGLE_DOCS]: 'Google Docs',
      [SourceType.GOOGLE_FORMS]: 'Google Forms',
      [SourceType.YOUTUBE]: 'YouTube Video',
      [SourceType.WEBSITE]: 'Website',
    };
    return names[type] || type;
  }
}
