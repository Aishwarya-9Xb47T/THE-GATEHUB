/**
 * SlideAnalyzer - Semantic structure extraction
 * 
 * This module analyzes extracted content to identify:
 * - Headings and their hierarchy
 * - Bullet points and numbered lists
 * - Paragraphs
 * - Semantic relationships between elements
 */

import { SlideAnalysis, TextBlock } from './SlideAnalysis';
import { PresentationAnalyzer } from './PresentationAnalyzer';

export class SlideAnalyzer {
  /**
   * Analyze semantic structure of a slide
   */
  static analyzeStructure(slide: any): Partial<SlideAnalysis> {
    const rawAnalysis = PresentationAnalyzer.analyzeSlide(slide);
    const textBlocks = rawAnalysis.textBlocks || [];
    
    return {
      ...rawAnalysis,
      headings: this.extractHeadings(textBlocks),
      bullets: this.extractBullets(textBlocks),
      paragraphs: this.extractParagraphs(textBlocks),
      numberedLists: this.extractNumberedLists(textBlocks),
    };
  }

  /**
   * Extract headings with hierarchy
   */
  private static extractHeadings(textBlocks: TextBlock[]): TextBlock[] {
    return textBlocks.filter(block => 
      block.type === 'heading' || 
      (block.fontSize && block.fontSize > 20) ||
      (block.isBold && block.position.y < 150)
    ).sort((a, b) => a.position.y - b.position.y);
  }

  /**
   * Extract bullet points
   */
  private static extractBullets(textBlocks: TextBlock[]): TextBlock[] {
    return textBlocks.filter(block => 
      block.type === 'bullet' ||
      this.startsWithBullet(block.text)
    ).sort((a, b) => a.position.y - b.position.y);
  }

  /**
   * Extract numbered lists
   */
  private static extractNumberedLists(textBlocks: TextBlock[]): TextBlock[] {
    return textBlocks.filter(block => 
      block.type === 'numbered' ||
      this.startsWithNumber(block.text)
    ).sort((a, b) => a.position.y - b.position.y);
  }

  /**
   * Extract paragraphs
   */
  private static extractParagraphs(textBlocks: TextBlock[]): TextBlock[] {
    return textBlocks.filter(block => 
      block.type === 'paragraph' &&
      !this.startsWithBullet(block.text) &&
      !this.startsWithNumber(block.text)
    ).sort((a, b) => a.position.y - b.position.y);
  }

  /**
   * Check if text starts with bullet character
   */
  private static startsWithBullet(text: string): boolean {
    const bulletPatterns = /^[•●○■▪▸→-]\s*/;
    return bulletPatterns.test(text.trim());
  }

  /**
   * Check if text starts with number
   */
  private static startsWithNumber(text: string): boolean {
    const numberPattern = /^\d+[.)]\s*/;
    return numberPattern.test(text.trim());
  }

  /**
   * Detect question sentences in text blocks
   */
  static detectQuestions(textBlocks: TextBlock[]): TextBlock[] {
    const questionIndicators = [
      /\?$/,
      /^(what|how|why|when|where|who|which|which)/i,
      /^(is|are|do|does|did|can|could|would|should|will)/i,
      /^(true|false)/i,
      /^(choose|select|pick)/i,
    ];

    return textBlocks.filter(block => 
      questionIndicators.some(pattern => pattern.test(block.text))
    );
  }

  /**
   * Detect option patterns in text blocks
   */
  static detectOptions(textBlocks: TextBlock[]): Array<{label: string; text: string; block: TextBlock}> {
    const options: Array<{label: string; text: string; block: TextBlock}> = [];
    
    // Pattern: A) text, B) text, etc.
    const letterPattern = /^([A-Z])[)\.\s]\s*(.+)$/;
    // Pattern: 1) text, 2) text, etc.
    const numberPattern = /^(\d+)[)\.\s]\s*(.+)$/;
    // Pattern: a. text, b. text, etc.
    const lowercasePattern = /^([a-z])[)\.\s]\s*(.+)$/;

    textBlocks.forEach(block => {
      let match = block.text.match(letterPattern);
      if (match) {
        options.push({ label: match[1], text: match[2].trim(), block });
        return;
      }

      match = block.text.match(numberPattern);
      if (match) {
        options.push({ label: match[1], text: match[2].trim(), block });
        return;
      }

      match = block.text.match(lowercasePattern);
      if (match) {
        options.push({ label: match[1].toUpperCase(), text: match[2].trim(), block });
        return;
      }
    });

    return options;
  }

  /**
   * Detect True/False patterns
   */
  static detectTrueFalse(textBlocks: TextBlock[]): boolean {
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    const trueFalsePatterns = [
      /\b(true|false)\b/i,
      /\b(t\/f)\b/i,
      /\btrue or false\b/i,
    ];

    return trueFalsePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect rating/scale patterns
   */
  static detectRating(textBlocks: TextBlock[]): boolean {
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    const ratingPatterns = [
      /\brate\b/i,
      /\bscore\b/i,
      /\bscale\b/i,
      /\b1-5\b/,
      /\b1 to 5\b/,
      /\bstars?\b/i,
    ];

    return ratingPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect reflection/open answer patterns
   */
  static detectReflection(textBlocks: TextBlock[]): boolean {
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    const reflectionPatterns = [
      /\bexplain\b/i,
      /\bdescribe\b/i,
      /\bdiscuss\b/i,
      /\bwhat do you think\b/i,
      /\byour opinion\b/i,
      /\bwrite\b/i,
      /\bessay\b/i,
    ];

    return reflectionPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect word cloud patterns
   */
  static detectWordCloud(textBlocks: TextBlock[]): boolean {
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    const wordCloudPatterns = [
      /\bkeywords?\b/i,
      /\bword cloud\b/i,
      /\bone word\b/i,
      /\bsingle word\b/i,
      /\bshort phrase\b/i,
    ];

    return wordCloudPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Analyze layout for interaction clues
   */
  static analyzeLayoutForInteraction(textBlocks: TextBlock[]): {
    hasQuestionAtTop: boolean;
    hasOptionsBelow: boolean;
    optionsAreAligned: boolean;
    optionsAreVertical: boolean;
  } {
    if (textBlocks.length < 2) {
      return {
        hasQuestionAtTop: false,
        hasOptionsBelow: false,
        optionsAreAligned: false,
        optionsAreVertical: false,
      };
    }

    // Sort by Y position
    const sortedBlocks = [...textBlocks].sort((a, b) => a.position.y - b.position.y);
    
    // Check if first block is a question
    const firstBlock = sortedBlocks[0];
    const hasQuestionAtTop = this.detectQuestions([firstBlock]).length > 0;

    // Check if remaining blocks are options
    const remainingBlocks = sortedBlocks.slice(1);
    const options = this.detectOptions(remainingBlocks);
    const hasOptionsBelow = options.length >= 2;

    // Check if options are aligned (similar X positions)
    const optionsAreAligned = options.length > 1 && 
      Math.max(...options.map(o => o.block.position.x)) - 
      Math.min(...options.map(o => o.block.position.x)) < 50;

    // Check if options are vertical (different Y positions)
    const optionsAreVertical = options.length > 1 &&
      new Set(options.map(o => Math.round(o.block.position.y / 20) * 20)).size > 1;

    return {
      hasQuestionAtTop,
      hasOptionsBelow,
      optionsAreAligned,
      optionsAreVertical,
    };
  }
}
