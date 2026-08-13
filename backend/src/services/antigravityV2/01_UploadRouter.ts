import JSZip from 'jszip';
import { V2DocumentFormat } from './types.js';

export interface V2FileInput {
  name: string;
  mimeType?: string;
  buffer?: Buffer;
  url?: string;
}

export interface V2DetectedFormat {
  format: V2DocumentFormat;
  extension: string;
  mimeType: string;
  isArchive: boolean;
  isImage: boolean;
  isGoogleWorkspace: boolean;
  isRasterized: boolean;
  unpackedFiles?: Array<{ name: string; buffer: Buffer }>;
}

export class UploadRouter {
  /**
   * Sniff format via magic bytes, MIME, extension, or decompose ZIP archive
   */
  public static async routeInput(input: V2FileInput): Promise<V2DetectedFormat> {
    const fileName = (input.name || input.url || '').toLowerCase();
    const mime = (input.mimeType || '').toLowerCase();

    // 1. Google Workspace URL Sniffer
    if (input.url) {
      if (input.url.includes('docs.google.com/document')) {
        return this.build('google_docs', 'gdoc', 'application/vnd.google-apps.document', false, false, true, false);
      }
      if (input.url.includes('docs.google.com/presentation')) {
        return this.build('google_slides', 'gslides', 'application/vnd.google-apps.presentation', false, false, true, false);
      }
      if (input.url.includes('drive.google.com')) {
        return this.build('google_drive', 'gdrive', 'application/vnd.google-apps.file', false, false, true, false);
      }
    }

    // 2. ZIP Archive Decomposition Check
    if (input.buffer && (fileName.endsWith('.zip') || mime.includes('zip'))) {
      try {
        const zip = await JSZip.loadAsync(input.buffer);
        const unpackedFiles: Array<{ name: string; buffer: Buffer }> = [];

        const fileEntries = Object.keys(zip.files).filter(f => !zip.files[f].dir && !f.startsWith('__MACOSX'));
        for (const fName of fileEntries) {
          const buf = await zip.files[fName].async('nodebuffer');
          unpackedFiles.push({ name: fName, buffer: buf });
        }

        if (unpackedFiles.length > 0) {
          return {
            ...this.build('zip', 'zip', 'application/zip', true, false, false, false),
            unpackedFiles,
          };
        }
      } catch (err) {
        console.warn('[UploadRouter] ZIP decomposition failed, falling back to stream sniffing:', err);
      }
    }

    // 3. Magic Bytes Stream Sniffing
    if (input.buffer && input.buffer.length >= 4) {
      const header = input.buffer.toString('hex', 0, 4).toUpperCase();

      // PDF: %PDF -> 25 50 44 46
      if (header.startsWith('25504446')) {
        return this.build('pdf', 'pdf', 'application/pdf', false, false, false, false);
      }
      // OpenXML / ZIP: PK\x03\x04 -> 50 4B 03 04
      if (header.startsWith('504B0304')) {
        if (fileName.endsWith('.docx')) return this.build('docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, false, false, false);
        if (fileName.endsWith('.pptx')) return this.build('pptx', 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', false, false, false, false);
        if (fileName.endsWith('.xlsx')) return this.build('xlsx', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false, false, false, false);
        if (fileName.endsWith('.odt')) return this.build('odt', 'odt', 'application/vnd.oasis.opendocument.text', false, false, false, false);
        if (fileName.endsWith('.odp')) return this.build('odp', 'odp', 'application/vnd.oasis.opendocument.presentation', false, false, false, false);
        if (fileName.endsWith('.ods')) return this.build('ods', 'ods', 'application/vnd.oasis.opendocument.spreadsheet', false, false, false, false);
        if (fileName.endsWith('.epub')) return this.build('epub', 'epub', 'application/epub+zip', false, false, false, false);
      }
      // PNG: \x89PNG
      if (header.startsWith('89504E47')) return this.build('png', 'png', 'image/png', false, true, false, true);
      // JPEG: \xFF\xD8\xFF
      if (header.startsWith('FFD8FF')) return this.build('jpeg', 'jpg', 'image/jpeg', false, true, false, true);
    }

    // 4. Extension Sniffing Fallback
    if (fileName.endsWith('.pdf')) return this.build('pdf', 'pdf', 'application/pdf', false, false, false, false);
    if (fileName.endsWith('.docx')) return this.build('docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, false, false, false);
    if (fileName.endsWith('.doc')) return this.build('doc', 'doc', 'application/msword', false, false, false, false);
    if (fileName.endsWith('.pptx')) return this.build('pptx', 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', false, false, false, false);
    if (fileName.endsWith('.ppt')) return this.build('ppt', 'ppt', 'application/vnd.ms-powerpoint', false, false, false, false);
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return this.build('xlsx', 'xlsx', 'application/vnd.ms-excel', false, false, false, false);
    if (fileName.endsWith('.csv')) return this.build('csv', 'csv', 'text/csv', false, false, false, false);
    if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) return this.build('markdown', 'md', 'text/markdown', false, false, false, false);
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) return this.build('html', 'html', 'text/html', false, false, false, false);
    if (fileName.endsWith('.epub')) return this.build('epub', 'epub', 'application/epub+zip', false, false, false, false);
    if (fileName.endsWith('.txt')) return this.build('txt', 'txt', 'text/plain', false, false, false, false);

    // Image formats
    const imgExts: Array<[string, V2DocumentFormat]> = [
      ['.png', 'png'], ['.jpg', 'jpg'], ['.jpeg', 'jpeg'], ['.webp', 'webp'],
      ['.tiff', 'tiff'], ['.bmp', 'bmp'], ['.svg', 'svg'], ['.heic', 'heic'],
    ];
    for (const [ext, fmt] of imgExts) {
      if (fileName.endsWith(ext)) {
        return this.build(fmt, ext.replace('.', ''), `image/${fmt}`, false, true, false, true);
      }
    }

    return this.build('txt', 'txt', 'text/plain', false, false, false, false);
  }

  private static build(
    format: V2DocumentFormat,
    extension: string,
    mimeType: string,
    isArchive: boolean,
    isImage: boolean,
    isGoogleWorkspace: boolean,
    isRasterized: boolean
  ): V2DetectedFormat {
    return {
      format,
      extension,
      mimeType,
      isArchive,
      isImage,
      isGoogleWorkspace,
      isRasterized,
    };
  }
}
