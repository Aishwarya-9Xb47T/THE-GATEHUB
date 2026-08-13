/**
 * Moodle XML Parser - Extracts questions from Moodle XML format
 * Uses fast-xml-parser
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import { XMLParser } from 'fast-xml-parser';

export class MoodleXmlParser {
  static async extract(buffer: Buffer): Promise<RawContent> {
    try {
      const xml = buffer.toString('utf-8');
      
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        textNodeName: '#text',
      });
      
      const parsed = parser.parse(xml);
      
      const textLines: string[] = [];
      
      // Moodle XML structure: quiz -> question
      const quiz = parsed.quiz || parsed;
      const questions = Array.isArray(quiz.question) ? quiz.question : [quiz.question];
      
      for (const question of questions) {
        if (!question) continue;
        
        const questionText = question.questiontext?.text || question.name?.text || '';
        const questionType = question['@type'] || 'unknown';
        
        textLines.push(`[${questionType}] ${questionText}`);
        
        // Extract options
        if (question.answer) {
          const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
          for (const answer of answers) {
            const answerText = answer.text || answer['#text'] || '';
            const isCorrect = answer['@fraction'] === '100';
            textLines.push(`  ${isCorrect ? '[✓]' : '[ ]'} ${answerText}`);
          }
        }
        
        textLines.push(''); // Empty line between questions
      }

      const text = textLines.join('\n');

      return {
        text,
        images: [],
        metadata: {
          wordCount: text.split(/\s+/).length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `Moodle XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
