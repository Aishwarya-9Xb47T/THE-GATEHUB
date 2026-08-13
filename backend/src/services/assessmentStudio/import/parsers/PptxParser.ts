/**
 * PPTX Parser - Extracts text and images from PowerPoint presentations
 * Uses adm-zip and XML parsing
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

export class PptxParser {
  static async extract(buffer: Buffer): Promise<RawContent> {
    try {
      const zip = new AdmZip(buffer);
      
      const textLines: string[] = [];
      const images: RawContent['images'] = [];
      
      // Parse slide XML files
      const slideFiles = zip.getEntries().filter((entry: any) => 
        entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')
      );
      
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        textNodeName: '#text',
      });
      
      for (const slideFile of slideFiles) {
        const slideXml = slideFile.getData().toString('utf-8');
        const parsed = parser.parse(slideXml);
        
        // Extract text from slide
        const slideText = this.extractTextFromSlide(parsed);
        if (slideText) {
          textLines.push(slideText);
        }
      }
      
      // Parse notes if available
      const notesFiles = zip.getEntries().filter((entry: any) => 
        entry.entryName.startsWith('ppt/notesSlides/notesSlide') && entry.entryName.endsWith('.xml')
      );
      
      for (const notesFile of notesFiles) {
        const notesXml = notesFile.getData().toString('utf-8');
        const parsed = parser.parse(notesXml);
        const notesText = this.extractTextFromSlide(parsed);
        if (notesText) {
          textLines.push(`[Notes]: ${notesText}`);
        }
      }

      const text = textLines.join('\n');

      return {
        text,
        images,
        metadata: {
          wordCount: text.split(/\s+/).length,
          pageCount: slideFiles.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `PPTX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static extractTextFromSlide(parsed: any): string {
    const textParts: string[] = [];
    
    const extractFromNode = (node: any) => {
      if (!node || typeof node !== 'object') return;
      
      if (node['#text']) {
        textParts.push(String(node['#text']).trim());
      }
      
      if (node['a:t']) {
        const text = Array.isArray(node['a:t']) ? node['a:t'] : [node['a:t']];
        text.forEach((t: any) => {
          if (typeof t === 'string') textParts.push(t.trim());
          else if (t && t['#text']) textParts.push(String(t['#text']).trim());
        });
      }
      
      // Recursively process child nodes
      Object.keys(node).forEach(key => {
        if (key !== '#text' && key !== 'a:t' && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) {
            node[key].forEach((child: any) => extractFromNode(child));
          } else {
            extractFromNode(node[key]);
          }
        }
      });
    };
    
    extractFromNode(parsed);
    return textParts.filter(t => t.length > 0).join(' ');
  }
}
