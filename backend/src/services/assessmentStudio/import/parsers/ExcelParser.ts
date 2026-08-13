/**
 * Excel Parser - Extracts structured data from Excel files
 * Uses xlsx library
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import * as XLSX from 'xlsx';

export class ExcelParser {
  static async extract(buffer: Buffer): Promise<RawContent> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      const textLines: string[] = [];
      
      // Process each sheet
      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length === 0) return;
        
        textLines.push(`Sheet: ${sheetName}`);
        
        // Add headers
        if (jsonData[0]) {
          textLines.push('Headers: ' + jsonData[0].join(', '));
        }
        
        // Add data rows
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row && row.length > 0) {
            const rowText = row.map((val: any, idx: number) => {
              const header = jsonData[0][idx] || `Column ${idx + 1}`;
              return `${header}: ${val}`;
            }).join(' | ');
            textLines.push(`Row ${i}: ${rowText}`);
          }
        }
        
        textLines.push(''); // Empty line between sheets
      });

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
      throw new AppError(500, `Excel parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
