/**
 * PresentationAnalyzer - Extracts raw content from slides
 * 
 * This module analyzes slide content to extract:
 * - Text blocks with position and formatting
 * - Images with metadata
 * - Tables
 * - Layout information
 */

import { SlideAnalysis, TextBlock, ImageBlock, TableBlock } from './SlideAnalysis';

export class PresentationAnalyzer {
  /**
   * Analyze a slide and extract raw content
   */
  static analyzeSlide(slide: any): Partial<SlideAnalysis> {
    const content = slide.content || {};
    
    return {
      slideId: slide.id,
      title: slide.title || '',
      textBlocks: this.extractTextBlocks(content),
      images: this.extractImages(content),
      tables: this.extractTables(content),
      speakerNotes: slide.notes,
      hasMultipleColumns: this.detectMultipleColumns(content),
      hasHeader: this.detectHeader(content),
      hasFooter: this.detectFooter(content),
      hasSidebar: this.detectSidebar(content),
      layoutType: this.detectLayoutType(content),
      wordCount: this.countWords(content),
      hasImages: this.hasImages(content),
      hasTables: this.hasTables(content),
      hasDiagrams: this.hasDiagrams(content),
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract text blocks from slide content
   */
  private static extractTextBlocks(content: any): TextBlock[] {
    const blocks: TextBlock[] = [];
    let idCounter = 0;

    const processElement = (element: any, depth = 0) => {
      if (!element) return;

      // Text element
      if (element.type === 'text' && element.content) {
        blocks.push({
          id: `text-${idCounter++}`,
          text: element.content,
          type: this.inferTextType(element, depth),
          level: element.level || depth,
          position: element.position || { x: 0, y: 0, width: 100, height: 20 },
          fontSize: element.fontSize,
          isBold: element.bold || false,
          isItalic: element.italic || false,
        });
      }

      // Shape with text
      if (element.type === 'shape' && element.text) {
        blocks.push({
          id: `shape-${idCounter++}`,
          text: element.text,
          type: this.inferTextType(element, depth),
          position: element.position || { x: 0, y: 0, width: 100, height: 20 },
          fontSize: element.fontSize,
        });
      }

      // Process children
      if (element.children) {
        element.children.forEach((child: any) => processElement(child, depth + 1));
      }
    };

    if (content.elements) {
      content.elements.forEach((element: any) => processElement(element));
    }

    return blocks;
  }

  /**
   * Infer text type based on formatting and context
   */
  private static inferTextType(element: any, depth: number): TextBlock['type'] {
    // Check for bullet points
    if (element.bullet || element.listType === 'bullet') {
      return 'bullet';
    }

    // Check for numbered lists
    if (element.numbered || element.listType === 'numbered') {
      return 'numbered';
    }

    // Check for headings based on font size and position
    if (element.fontSize && element.fontSize > 24) {
      return 'heading';
    }

    // Check for footer based on position
    if (element.position && element.position.y > 500) {
      return 'footer';
    }

    // Check for caption based on size
    if (element.fontSize && element.fontSize < 12) {
      return 'caption';
    }

    // Default to paragraph
    return 'paragraph';
  }

  /**
   * Extract images from slide content
   */
  private static extractImages(content: any): ImageBlock[] {
    const images: ImageBlock[] = [];
    let idCounter = 0;

    const processElement = (element: any) => {
      if (!element) return;

      if (element.type === 'image' && element.src) {
        images.push({
          id: `image-${idCounter++}`,
          src: element.src,
          alt: element.alt || '',
          position: element.position || { x: 0, y: 0, width: 200, height: 200 },
          type: this.inferImageType(element),
        });
      }

      if (element.children) {
        element.children.forEach((child: any) => processElement(child));
      }
    };

    if (content.elements) {
      content.elements.forEach((element: any) => processElement(element));
    }

    return images;
  }

  /**
   * Infer image type from metadata
   */
  private static inferImageType(element: any): ImageBlock['type'] {
    const src = element.src?.toLowerCase() || '';
    
    if (src.includes('chart') || src.includes('graph')) {
      return 'chart';
    }
    if (src.includes('diagram') || src.includes('flow')) {
      return 'diagram';
    }
    if (src.includes('icon')) {
      return 'icon';
    }
    if (src.includes('screenshot')) {
      return 'screenshot';
    }
    
    return 'photo';
  }

  /**
   * Extract tables from slide content
   */
  private static extractTables(content: any): TableBlock[] {
    const tables: TableBlock[] = [];
    let idCounter = 0;

    const processElement = (element: any) => {
      if (!element) return;

      if (element.type === 'table' && element.rows) {
        tables.push({
          id: `table-${idCounter++}`,
          rows: element.rows,
          headers: element.headers || [],
          position: element.position || { x: 0, y: 0, width: 400, height: 200 },
        });
      }

      if (element.children) {
        element.children.forEach((child: any) => processElement(child));
      }
    };

    if (content.elements) {
      content.elements.forEach((element: any) => processElement(element));
    }

    return tables;
  }

  /**
   * Detect if slide has multiple columns
   */
  private static detectMultipleColumns(content: any): boolean {
    const textBlocks = this.extractTextBlocks(content);
    if (textBlocks.length < 2) return false;

    // Check if text blocks are arranged in columns
    const xPositions = textBlocks.map(block => block.position.x);
    const uniqueXPositions = new Set(xPositions.map(x => Math.round(x / 50) * 50));
    
    return uniqueXPositions.size > 1;
  }

  /**
   * Detect if slide has header
   */
  private static detectHeader(content: any): boolean {
    const textBlocks = this.extractTextBlocks(content);
    return textBlocks.some(block => 
      block.type === 'heading' && block.position.y < 100
    );
  }

  /**
   * Detect if slide has footer
   */
  private static detectFooter(content: any): boolean {
    const textBlocks = this.extractTextBlocks(content);
    return textBlocks.some(block => 
      block.type === 'footer' || block.position.y > 500
    );
  }

  /**
   * Detect if slide has sidebar
   */
  private static detectSidebar(content: any): boolean {
    const textBlocks = this.extractTextBlocks(content);
    if (textBlocks.length < 2) return false;

    // Check if there's a column on the left or right
    const leftColumn = textBlocks.filter(block => block.position.x < 100);
    const rightColumn = textBlocks.filter(block => block.position.x > 400);
    
    return leftColumn.length > 0 && rightColumn.length > 0;
  }

  /**
   * Detect layout type
   */
  private static detectLayoutType(content: any): SlideAnalysis['layoutType'] {
    const hasMultipleColumns = this.detectMultipleColumns(content);
    const hasHeader = this.detectHeader(content);
    const images = this.extractImages(content);
    
    if (images.length > 0 && images[0].position.width > 300) {
      return 'image-heavy';
    }
    
    if (hasMultipleColumns) {
      return 'two-column';
    }
    
    if (hasHeader) {
      return 'content';
    }
    
    const textBlocks = this.extractTextBlocks(content);
    if (textBlocks.length === 1 && textBlocks[0].type === 'heading') {
      return 'title';
    }
    
    return 'unknown';
  }

  /**
   * Count words in slide
   */
  private static countWords(content: any): number {
    const textBlocks = this.extractTextBlocks(content);
    return textBlocks.reduce((count, block) => {
      return count + block.text.split(/\s+/).filter(word => word.length > 0).length;
    }, 0);
  }

  /**
   * Check if slide has images
   */
  private static hasImages(content: any): boolean {
    return this.extractImages(content).length > 0;
  }

  /**
   * Check if slide has tables
   */
  private static hasTables(content: any): boolean {
    return this.extractTables(content).length > 0;
  }

  /**
   * Check if slide has diagrams
   */
  private static hasDiagrams(content: any): boolean {
    const images = this.extractImages(content);
    return images.some(img => img.type === 'diagram' || img.type === 'chart');
  }
}
