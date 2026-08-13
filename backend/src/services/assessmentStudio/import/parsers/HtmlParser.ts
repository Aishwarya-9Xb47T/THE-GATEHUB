/**
 * HTML Parser - Extracts text and images from HTML
 * Simple HTML parsing without external dependencies
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';

export class HtmlParser {
  static async extractFromFile(buffer: Buffer): Promise<RawContent> {
    try {
      const html = buffer.toString('utf-8');
      return this.parseHtml(html);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `HTML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async extractFromUrl(url: string): Promise<RawContent> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new AppError(400, `Failed to fetch URL: ${response.statusText}`);
      }
      const html = await response.text();
      return this.parseHtml(html);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `HTML URL parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static parseHtml(html: string): RawContent {
    // Remove script and style tags
    let cleaned = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, '');
    
    // Remove navigation, footer, header elements
    cleaned = cleaned.replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, '');
    
    // Extract images
    const images: RawContent['images'] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    let imgIndex = 0;
    
    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1];
      const altMatch = match[0].match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '';
      
      images.push({
        id: `img-${imgIndex++}`,
        data: '', // External URL
        mimeType: 'image/png',
        altText: alt,
      });
    }
    
    // Convert HTML to plain text
    const text = cleaned
      .replace(/<[^>]*>/g, ' ') // Remove all HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return {
      text,
      images,
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  }
}
