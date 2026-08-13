/**
 * Mock Question Extractor for Development Testing
 * Returns mock questions without calling OpenAI
 * Enable by setting AI_EXTRACTION_MODE=mock in .env
 */

import { SegmentedContent, ExtractedQuestionDraft } from '../unifiedTypes.js';
import { randomUUID } from 'crypto';

export class MockQuestionExtractor {
  /**
   * Extract mock questions from segmented content
   * This is a development-only fallback that doesn't use AI
   */
  static async extract(segmentedContent: SegmentedContent): Promise<ExtractedQuestionDraft[]> {
    console.log('[MockQuestionExtractor] ENTRY', { 
      totalBlocks: segmentedContent.blocks.length,
      questionBlocks: segmentedContent.blocks.filter(b => b.type === 'question').length
    });

    const questionBlocks = segmentedContent.blocks.filter(block => block.type === 'question');

    if (questionBlocks.length === 0) {
      console.log('[MockQuestionExtractor] EXIT - no question blocks found');
      return [];
    }

    console.log('[MockQuestionExtractor] Generating mock questions for development');

    // Extract questions based on content blocks using deterministic parsing
    const mockQuestions: ExtractedQuestionDraft[] = questionBlocks.map((block, index) => {
      const lines = block.text.split('\n').map(l => l.trim()).filter(Boolean);
      const questionText = lines[0] || `Question ${index + 1}`;
      
      const options: { id: string; text: string; isCorrect: boolean; order: number }[] = [];
      const optionPattern = /^[a-eA-E][\.\)]\s*/;
      const answerPattern = /^Answer\s*[:\.\)]\s*([a-eA-E])/i;
      const explanationPattern = /^Explanation\s*[:\.\)]\s*(.*)/i;
      
      let correctAnswerLetter = '';
      let explanationText: string | undefined = undefined;

      lines.forEach((line) => {
        if (optionPattern.test(line)) {
          const optText = line.replace(optionPattern, '').trim();
          options.push({
            id: randomUUID(),
            text: optText,
            isCorrect: false,
            order: options.length
          });
        } else if (answerPattern.test(line)) {
          const match = line.match(answerPattern);
          if (match && match[1]) {
            correctAnswerLetter = match[1].toUpperCase();
          }
        } else if (explanationPattern.test(line)) {
          const match = line.match(explanationPattern);
          if (match && match[1]) {
            explanationText = match[1].trim();
          }
        }
      });

      // Mark correct answer based on letter match (e.g. 'A' -> index 0)
      if (correctAnswerLetter && options.length > 0) {
        const letterIdx = correctAnswerLetter.charCodeAt(0) - 65;
        if (letterIdx >= 0 && letterIdx < options.length) {
          options[letterIdx].isCorrect = true;
        } else {
          options[0].isCorrect = true;
        }
      } else if (options.length > 0) {
        options[0].isCorrect = true;
      }

      // If no options found, create standard options
      if (options.length === 0) {
        options.push(
          { id: randomUUID(), text: 'Option A', isCorrect: true, order: 0 },
          { id: randomUUID(), text: 'Option B', isCorrect: false, order: 1 },
          { id: randomUUID(), text: 'Option C', isCorrect: false, order: 2 },
          { id: randomUUID(), text: 'Option D', isCorrect: false, order: 3 }
        );
      }

      const correctAnswerText = options.find(o => o.isCorrect)?.text || options[0].text;

      return {
        id: randomUUID(),
        text: questionText,
        type: 'multiple_choice',
        options,
        correctAnswer: correctAnswerText,
        explanation: explanationText,
        difficulty: 'medium',
        bloomLevel: 'L2',
        tags: ['extracted'],
        confidence: 0.90,
        warnings: [],
        metadata: {
          originalBlockId: block.id,
          originalText: block.text
        }
      };
    });

    console.log('[MockQuestionExtractor] EXIT - success', { 
      totalExtracted: mockQuestions.length
    });

    return mockQuestions;
  }
}
