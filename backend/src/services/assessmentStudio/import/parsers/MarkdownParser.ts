/**
 * Markdown Parser - Converts Markdown to text and extracts images
 * Uses marked library
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import { marked } from 'marked';

export class MarkdownParser {
  static async extract(buffer: Buffer): Promise<RawContent> {
    try {
      const markdown = buffer.toString('utf-8');
      
      // Configure marked to preserve some structure
      marked.setOptions({
        gfm: true,
        breaks: false,
      });

      // Convert markdown to HTML first
      const html = await marked.parse(markdown);
      
      // Extract images from markdown
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const images: RawContent['images'] = [];
      let match;
      
      while ((match = imageRegex.exec(markdown)) !== null) {
        images.push({
          id: `img-${images.length}`,
          data: '', // Images are external URLs in markdown
          mimeType: 'image/png',
          altText: match[1],
        });
      }

      // Convert HTML to plain text (simple approach)
      const text = html
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      return {
        text,
        images,
        metadata: {
          wordCount: text.split(/\s+/).length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `Markdown parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
