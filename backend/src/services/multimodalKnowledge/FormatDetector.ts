import { DocumentSourceType } from './types.js';

export interface FileInput {
  name: string;
  mimeType?: string;
  buffer?: Buffer;
  url?: string;
}

export interface DetectedFormatInfo {
  sourceType: DocumentSourceType;
  extension: string;
  mimeType: string;
  isArchive: boolean;
  isImage: boolean;
  isGoogleWorkspace: boolean;
  isRasterized: boolean;
}

export class FormatDetector {
  /**
   * Detect format from file metadata, extension, magic bytes, or URL
   */
  public static detect(input: FileInput): DetectedFormatInfo {
    const fileName = (input.name || input.url || '').toLowerCase();
    const mime = (input.mimeType || '').toLowerCase();

    // 1. Google Workspace Check
    if (input.url) {
      if (input.url.includes('docs.google.com/document')) {
        return this.buildResult('google_docs', 'gdoc', 'application/vnd.google-apps.document', false, false, true, false);
      }
      if (input.url.includes('docs.google.com/presentation')) {
        return this.buildResult('google_slides', 'gslides', 'application/vnd.google-apps.presentation', false, false, true, false);
      }
      if (input.url.includes('drive.google.com')) {
        return this.buildResult('google_drive', 'gdrive', 'application/vnd.google-apps.file', false, false, true, false);
      }
    }

    // 2. Magic byte check if buffer is provided
    if (input.buffer && input.buffer.length >= 4) {
      const header = input.buffer.toString('hex', 0, 4).toUpperCase();
      
      // PDF: %PDF -> 25 50 44 46
      if (header.startsWith('25504446')) {
        return this.buildResult('pdf', 'pdf', 'application/pdf', false, false, false, false);
      }
      // ZIP / DOCX / PPTX / XLSX / ODT / ODP / ODS: PK\x03\x04 -> 50 4B 03 04
      if (header.startsWith('504B0304')) {
        if (fileName.endsWith('.docx')) return this.buildResult('docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, false, false, false);
        if (fileName.endsWith('.pptx')) return this.buildResult('pptx', 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', false, false, false, false);
        if (fileName.endsWith('.xlsx')) return this.buildResult('excel', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false, false, false, false);
        if (fileName.endsWith('.odt')) return this.buildResult('odt', 'odt', 'application/vnd.oasis.opendocument.text', false, false, false, false);
        if (fileName.endsWith('.odp')) return this.buildResult('odp', 'odp', 'application/vnd.oasis.opendocument.presentation', false, false, false, false);
        if (fileName.endsWith('.ods')) return this.buildResult('ods', 'ods', 'application/vnd.oasis.opendocument.spreadsheet', false, false, false, false);
        if (fileName.endsWith('.epub')) return this.buildResult('epub', 'epub', 'application/epub+zip', false, false, false, false);
        if (fileName.endsWith('.zip')) return this.buildResult('zip', 'zip', 'application/zip', true, false, false, false);
      }
      // PNG: \x89PNG -> 89 50 4E 47
      if (header.startsWith('89504E47')) {
        return this.buildResult('image', 'png', 'image/png', false, true, false, true);
      }
      // JPEG: \xFF\xD8\xFF -> FF D8 FF
      if (header.startsWith('FFD8FF')) {
        return this.buildResult('image', 'jpg', 'image/jpeg', false, true, false, true);
      }
    }

    // 3. Extension Sniffing Fallback
    if (fileName.endsWith('.pdf')) return this.buildResult('pdf', 'pdf', 'application/pdf', false, false, false, false);
    if (fileName.endsWith('.docx')) return this.buildResult('docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, false, false, false);
    if (fileName.endsWith('.doc')) return this.buildResult('doc', 'doc', 'application/msword', false, false, false, false);
    if (fileName.endsWith('.pptx')) return this.buildResult('pptx', 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', false, false, false, false);
    if (fileName.endsWith('.ppt')) return this.buildResult('ppt', 'ppt', 'application/vnd.ms-powerpoint', false, false, false, false);
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return this.buildResult('excel', 'xlsx', 'application/vnd.ms-excel', false, false, false, false);
    if (fileName.endsWith('.csv')) return this.buildResult('csv', 'csv', 'text/csv', false, false, false, false);
    if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) return this.buildResult('markdown', 'md', 'text/markdown', false, false, false, false);
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) return this.buildResult('html', 'html', 'text/html', false, false, false, false);
    if (fileName.endsWith('.epub')) return this.buildResult('epub', 'epub', 'application/epub+zip', false, false, false, false);
    if (fileName.endsWith('.txt')) return this.buildResult('txt', 'txt', 'text/plain', false, false, false, false);
    if (fileName.endsWith('.rtf')) return this.buildResult('rtf', 'rtf', 'application/rtf', false, false, false, false);
    if (fileName.endsWith('.zip')) return this.buildResult('zip', 'zip', 'application/zip', true, false, false, false);

    // Images
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp', '.svg'];
    if (imageExtensions.some(ext => fileName.endsWith(ext))) {
      const ext = fileName.substring(fileName.lastIndexOf('.') + 1);
      return this.buildResult('image', ext, mime || `image/${ext}`, false, true, false, true);
    }

    // Default Fallback
    return this.buildResult('txt', 'txt', 'text/plain', false, false, false, false);
  }

  private static buildResult(
    sourceType: DocumentSourceType,
    extension: string,
    mimeType: string,
    isArchive: boolean,
    isImage: boolean,
    isGoogleWorkspace: boolean,
    isRasterized: boolean
  ): DetectedFormatInfo {
    return {
      sourceType,
      extension,
      mimeType,
      isArchive,
      isImage,
      isGoogleWorkspace,
      isRasterized,
    };
  }
}
