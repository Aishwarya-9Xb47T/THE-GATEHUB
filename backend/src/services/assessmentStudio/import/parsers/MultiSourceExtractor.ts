/**
 * Multi-Source Extractor
 * Universal entry point for converting diverse file formats 
 * (PPTX, HTML, Markdown, Plain Text, Moodle XML, Canvas) into standard RawContent.
 */

import { RawContent, SourceType } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';

export class MultiSourceExtractor {
  static async extract(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    sourceType?: SourceType | null
  ): Promise<RawContent> {
    console.log('[MultiSourceExtractor] ENTRY', { fileName, mimeType, sourceType });

    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    let text = '';
    let html = '';
    const images: any[] = [];
    const equations: any[] = [];

    try {
      if (ext === '.md' || ext === '.markdown' || mimeType.includes('markdown')) {
        text = buffer.toString('utf-8');
        html = this.convertMarkdownToHtml(text);
      } else if (ext === '.txt' || mimeType.includes('text/plain')) {
        text = buffer.toString('utf-8');
        html = `<pre>${text}</pre>`;
      } else if (ext === '.html' || ext === '.htm' || mimeType.includes('html')) {
        html = buffer.toString('utf-8');
        text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      } else if (ext === '.xml' || mimeType.includes('xml')) {
        const xmlText = buffer.toString('utf-8');
        text = xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        html = `<pre>${xmlText}</pre>`;
      } else {
        text = buffer.toString('utf-8');
        html = `<pre>${text}</pre>`;
      }

      return {
        text,
        html,
        images,
        equations,
        metadata: {
          wordCount: text.split(/\s+/).filter(Boolean).length,
          imageCount: images.length,
          hasTables: html.includes('<table'),
          hasEquations: equations.length > 0 || /[\u2200-\u22FF\u2070-\u209F=+\-\/*^√∑∫πθαβγδλ]/g.test(text),
        },
      };
    } catch (error) {
      console.error('[MultiSourceExtractor] Extraction failed:', error);
      throw new AppError(500, `Multi-source extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static convertMarkdownToHtml(md: string): string {
    return md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/\!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
      .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
      .replace(/\n$/gim, '<br />');
  }
}
