/**
 * Website Parser - Extracts content from websites
 * Uses puppeteer for dynamic content
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import puppeteer from 'puppeteer';

export class WebsiteParser {
  static async extract(url: string): Promise<RawContent> {
    try {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Extract text content
      const text = await page.evaluate(() => {
        // Remove script, style, nav, footer, header elements
        const elementsToRemove = document.querySelectorAll('script, style, nav, footer, header, aside, iframe');
        elementsToRemove.forEach((el: any) => el.remove());
        
        // Get text from body
        return document.body?.innerText || '';
      });
      
      await browser.close();
      
      return {
        text,
        images: [],
        metadata: {
          wordCount: text.split(/\s+/).length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `Website parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
