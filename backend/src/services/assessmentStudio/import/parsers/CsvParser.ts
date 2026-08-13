/**
 * CSV Parser - Extracts structured data from CSV files
 * Simple CSV parsing without external dependencies
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';

export class CsvParser {
  static async extract(buffer: Buffer): Promise<RawContent> {
    try {
      const csvText = buffer.toString('utf-8');
      
      // Simple CSV parsing
      const lines = csvText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new AppError(400, 'CSV file is empty');
      }

      // Parse each line
      const parsedLines: string[][] = [];
      for (const line of lines) {
        const values: string[] = [];
        let currentValue = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim());
        parsedLines.push(values);
      }

      // Convert to readable text format
      const textLines: string[] = [];
      
      if (parsedLines.length > 0) {
        // Headers
        textLines.push('Headers: ' + parsedLines[0].join(', '));
        
        // Data rows
        for (let i = 1; i < parsedLines.length; i++) {
          const rowText = parsedLines[i].map((val, idx) => {
            const header = parsedLines[0][idx] || `Column ${idx + 1}`;
            return `${header}: ${val}`;
          }).join(' | ');
          textLines.push(`Row ${i}: ${rowText}`);
        }
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
      throw new AppError(500, `CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
