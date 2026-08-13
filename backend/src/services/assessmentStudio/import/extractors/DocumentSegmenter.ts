/**
 * Stage 4: Document Segmentation
 * Segments normalized text into content blocks (questions, options, answers, explanations)
 */

import { NormalizedText, SegmentedContent, ContentBlock } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import { randomUUID } from 'crypto';

export class DocumentSegmenter {
  private static readonly SECTION_PATTERNS = [
    /^Section\s+\d+[:\.\)]/i,
    /^Section\s+\d+/i,
  ];

  private static readonly QUESTION_PATTERNS = [
    /^Question\s+\d+/i, // "Question 1", "Question 2"
    /^Question\s+\d+[:\.\)]/i, // "Question 1:", "Question 2."
    /^Q\d+[:\.\)]\s+/i, // "Q1:", "Q2."
    /^Problem\s+\d+[:\.\)]?/i, // "Problem 1:"
    /^(\d+[\.\)]\s+)/i, // "1.", "2."
  ];

  private static readonly OPTION_PATTERNS = [
    /^[a-e][\.\)]\s+/i, // a. b. c. d. e.
    /^\(\s*[a-e]\s*\)\s+/i, // (a) (b) (c)
    /^\d+[\.\)]\s+/, // 1. 2. 3.
    /^\[\s*\d+\s*\]\s+/, // [1] [2]
    /^[-–•]\s+/, // Bullet points
  ];

  private static readonly ANSWER_KEY_PATTERNS = [
    /^Answer\s*[:\.\)]/i,
    /^Correct\s+Answer\s*[:\.\)]/i,
    /^Key\s*[:\.\)]/i,
    /^Solution\s*[:\.\)]/i,
  ];

  private static readonly EXPLANATION_PATTERNS = [
    /^Explanation\s*[:\.\)]/i,
    /^Reason\s*[:\.\)]/i,
    /^Why\s*[:\.\)]/i,
    /^Note\s*[:\.\)]/i,
  ];

  /**
   * Segment normalized text into content blocks
   */
  static segment(normalizedText: NormalizedText): SegmentedContent {
    console.log('=== DocumentSegmenter.segment ENTRY ===');
    console.log('INPUT:', {
      contentLength: normalizedText.content.length,
      imageCount: normalizedText.images.length,
      contentPreview: normalizedText.content.substring(0, 500)
    });

    try {
      const lines = normalizedText.content.split('\n');
      console.log('[DocumentSegmenter] Total lines:', lines.length);
      
      const blocks: ContentBlock[] = [];
      let currentBlock: ContentBlock | null = null;
      let questionNumber = 0;
      let inQuestionBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const blockType = this.detectBlockType(line, lines, i);
        console.log(`[DocumentSegmenter] Line ${i}: "${line.substring(0, 50)}..." → type: ${blockType}`);

        // If we found a new question block, save the previous one
        if (blockType === 'question' && currentBlock) {
          blocks.push(currentBlock);
          console.log('[DocumentSegmenter] Saved question block:', currentBlock.id);
          currentBlock = null;
          inQuestionBlock = false;
        }

        // If we found a section header, save current block and start new
        if (blockType === 'header' && currentBlock) {
          blocks.push(currentBlock);
          console.log('[DocumentSegmenter] Saved block before header:', currentBlock.id);
          currentBlock = null;
          inQuestionBlock = false;
        }

        // Create new block if needed
        if (!currentBlock) {
          currentBlock = {
            id: randomUUID(),
            type: blockType,
            text: line,
            order: blocks.length,
            metadata: {
              hasOptions: false,
              hasAnswerKey: false,
              hasExplanation: false,
            },
          };

          if (blockType === 'question') {
            questionNumber++;
            inQuestionBlock = true;
            if (currentBlock.metadata) {
              currentBlock.metadata.questionNumber = questionNumber;
            }
            console.log('[DocumentSegmenter] Created question block:', currentBlock.id, 'number:', questionNumber);
          }
        } else {
          // Append to current block
          currentBlock.text += '\n' + line;

          // Update metadata based on content
          if (currentBlock.metadata) {
            if (this.isOptionLine(line)) {
              currentBlock.metadata.hasOptions = true;
            }
            if (this.isAnswerKeyLine(line)) {
              currentBlock.metadata.hasAnswerKey = true;
            }
            if (this.isExplanationLine(line)) {
              currentBlock.metadata.hasExplanation = true;
            }
          }
        }
      }

      // Don't forget the last block
      if (currentBlock) {
        blocks.push(currentBlock);
        console.log('[DocumentSegmenter] Saved final block:', currentBlock.id, 'type:', currentBlock.type);
      }

      console.log('[DocumentSegmenter] Total blocks before merge:', blocks.length);
      console.log('[DocumentSegmenter] Block types:', blocks.map(b => b.type));

      // Post-process to merge related blocks
      const mergedBlocks = this.mergeRelatedBlocks(blocks);
      console.log('[DocumentSegmenter] Total blocks after merge:', mergedBlocks.length);

      const questionBlocks = mergedBlocks.filter(b => b.type === 'question');
      console.log('[DocumentSegmenter] Question blocks:', questionBlocks.length);

      const result = {
        blocks: mergedBlocks,
        images: normalizedText.images,
      };

      console.log('=== DocumentSegmenter.segment EXIT ===');
      console.log('OUTPUT:', {
        totalBlocks: result.blocks.length,
        questionBlocks: questionBlocks.length,
        blockTypes: result.blocks.map(b => b.type)
      });

      return result;
    } catch (error) {
      console.error('=== DocumentSegmenter.segment ERROR ===');
      console.error('ERROR DETAILS:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new AppError(500, `Document segmentation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect the type of content block
   */
  private static detectBlockType(line: string, allLines: string[], currentIndex: number): ContentBlock['type'] {
    // Check if it's a section header
    if (this.isSectionLine(line)) {
      return 'header';
    }

    // Check if it's a question
    if (this.isQuestionLine(line)) {
      return 'question';
    }

    // Check if it's an instruction
    if (this.isInstructionLine(line)) {
      return 'instruction';
    }

    // Check if it's a header (all caps or short line at start)
    if (this.isHeaderLine(line, currentIndex)) {
      return 'header';
    }

    // Default to content
    return 'content';
  }

  /**
   * Check if line is a section header
   */
  private static isSectionLine(line: string): boolean {
    return this.SECTION_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is a question
   */
  private static isQuestionLine(line: string): boolean {
    return this.QUESTION_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is an option
   */
  private static isOptionLine(line: string): boolean {
    return this.OPTION_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is an answer key
   */
  private static isAnswerKeyLine(line: string): boolean {
    return this.ANSWER_KEY_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is an explanation
   */
  private static isExplanationLine(line: string): boolean {
    return this.EXPLANATION_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is an instruction
   */
  private static isInstructionLine(line: string): boolean {
    const instructionKeywords = [
      'instructions', 'directions', 'read the following',
      'answer all questions', 'choose the correct answer',
      'select all that apply', 'fill in the blanks',
    ];
    const lowerLine = line.toLowerCase();
    return instructionKeywords.some(keyword => lowerLine.includes(keyword));
  }

  /**
   * Check if line is a header
   */
  private static isHeaderLine(line: string, index: number): boolean {
    if (this.isQuestionLine(line) || this.isOptionLine(line) || this.isAnswerKeyLine(line) || this.isExplanationLine(line)) {
      return false;
    }
    // All caps and short
    if (line === line.toUpperCase() && line.length < 50 && line.length > 3 && /[A-Z]/.test(line)) {
      return true;
    }
    return false;
  }

  /**
   * Merge related blocks (e.g., question with its options)
   */
  private static mergeRelatedBlocks(blocks: ContentBlock[]): ContentBlock[] {
    const merged: ContentBlock[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const current = blocks[i];

      // If this is a question, look ahead for options
      if (current.type === 'question') {
        let mergedText = current.text;
        let j = i + 1;

        // Merge consecutive option blocks
        while (j < blocks.length && this.isOptionLine(blocks[j].text.split('\n')[0])) {
          mergedText += '\n' + blocks[j].text;
          if (current.metadata) current.metadata.hasOptions = true;
          j++;
        }

        // Look for answer key
        if (j < blocks.length && this.isAnswerKeyLine(blocks[j].text.split('\n')[0])) {
          mergedText += '\n' + blocks[j].text;
          if (current.metadata) current.metadata.hasAnswerKey = true;
          j++;
        }

        // Look for explanation
        if (j < blocks.length && this.isExplanationLine(blocks[j].text.split('\n')[0])) {
          mergedText += '\n' + blocks[j].text;
          if (current.metadata) current.metadata.hasExplanation = true;
          j++;
        }

        merged.push({
          ...current,
          text: mergedText,
        });

        // Skip merged blocks
        i = j - 1;
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Extract question blocks only (for AI processing)
   */
  static extractQuestionBlocks(segmented: SegmentedContent): ContentBlock[] {
    return segmented.blocks.filter(block => block.type === 'question');
  }
}
