/**
 * Image OCR Parser - Extracts text from images using OCR
 * Uses OpenAI Vision API
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import OpenAI from 'openai';

export class ImageOcrParser {
  static async extract(buffer: Buffer, mimeType: string): Promise<RawContent> {
    try {
      const getOpenAi = (): OpenAI | null => {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
};
      
      if (!process.env.OPENAI_API_KEY) {
        throw new AppError(500, 'OPENAI_API_KEY not configured for OCR');
      }

      const base64Image = buffer.toString('base64');
      
      const response = await getOpenAi()!.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this image. Return only the text content, no explanations or descriptions.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
      });

      const text = response.choices[0]?.message?.content || '';

      return {
        text,
        images: [{
          id: 'img-0',
          data: base64Image,
          mimeType,
        }],
        metadata: {
          wordCount: text.split(/\s+/).length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `Image OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
