/**
 * Stage 2: Raw Content Extraction
 * Extracts raw text and images from various source types
 */

import { SourceType, RawContent, ExtractedImage, ContentInput } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import { PdfParser } from '../parsers/PdfParser.js';
import { DocxParser } from '../parsers/DocxParser.js';
import { PptxParser } from '../parsers/PptxParser.js';
import { ImageOcrParser } from '../parsers/ImageOcrParser.js';
import { MarkdownParser } from '../parsers/MarkdownParser.js';
import { HtmlParser } from '../parsers/HtmlParser.js';
import { CsvParser } from '../parsers/CsvParser.js';
import { ExcelParser } from '../parsers/ExcelParser.js';
import { MoodleXmlParser } from '../parsers/MoodleXmlParser.js';
import { YoutubeParser } from '../parsers/YoutubeParser.js';
import { WebsiteParser } from '../parsers/WebsiteParser.js';

export class RawContentExtractor {
  /**
   * Extract raw content from input based on source type
   */
  static async extract(input: ContentInput, sourceType: SourceType): Promise<RawContent> {
    console.log('[RawContentExtractor] ENTRY', { sourceType, fileName: input.file?.name });
    try {
      let result: RawContent;
      switch (sourceType) {
        case SourceType.PDF:
          console.log('[RawContentExtractor] Using PDF parser');
          result = await this.extractFromPdf(input);
          break;
        case SourceType.DOCX:
          console.log('[RawContentExtractor] Using DOCX parser');
          result = await this.extractFromDocx(input);
          break;
        case SourceType.PPTX:
          console.log('[RawContentExtractor] Using PPTX parser');
          result = await this.extractFromPptx(input);
          break;
        case SourceType.IMAGE:
          console.log('[RawContentExtractor] Using Image OCR parser');
          result = await this.extractFromImage(input);
          break;
        case SourceType.MARKDOWN:
          console.log('[RawContentExtractor] Using Markdown parser');
          result = await this.extractFromMarkdown(input);
          break;
        case SourceType.TXT:
          console.log('[RawContentExtractor] Using TXT parser');
          result = await this.extractFromTxt(input);
          break;
        case SourceType.HTML:
          console.log('[RawContentExtractor] Using HTML parser');
          result = await this.extractFromHtml(input);
          break;
        case SourceType.CSV:
          console.log('[RawContentExtractor] Using CSV parser');
          result = await this.extractFromCsv(input);
          break;
        case SourceType.EXCEL:
          console.log('[RawContentExtractor] Using Excel parser');
          result = await this.extractFromExcel(input);
          break;
        case SourceType.MOODLE_XML:
          console.log('[RawContentExtractor] Using Moodle XML parser');
          result = await this.extractFromMoodleXml(input);
          break;
        case SourceType.GOOGLE_DOCS:
          console.log('[RawContentExtractor] Using Google Docs parser');
          result = await this.extractFromGoogleDocs(input);
          break;
        case SourceType.GOOGLE_FORMS:
          console.log('[RawContentExtractor] Using Google Forms parser');
          result = await this.extractFromGoogleForms(input);
          break;
        case SourceType.YOUTUBE:
          console.log('[RawContentExtractor] Using YouTube parser');
          result = await this.extractFromYoutube(input);
          break;
        case SourceType.WEBSITE:
          console.log('[RawContentExtractor] Using Website parser');
          result = await this.extractFromWebsite(input);
          break;
        default:
          console.log('[RawContentExtractor] ERROR - Unsupported source type', { sourceType });
          throw new AppError(400, `Unsupported source type for extraction: ${sourceType}`);
      }
      console.log('[RawContentExtractor] EXIT - success', { 
        textLength: result.text?.length || 0,
        imageCount: result.images?.length || 0
      });
      return result;
    } catch (error) {
      console.log('[RawContentExtractor] EXIT - error', { error });
      if (error instanceof AppError) throw error;
      throw new AppError(500, `Raw content extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract from PDF
   */
  private static async extractFromPdf(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'PDF extraction requires a file');
    }
    return await PdfParser.extract(input.file.buffer);
  }

  /**
   * Extract from DOCX
   */
  private static async extractFromDocx(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'DOCX extraction requires a file');
    }
    return await DocxParser.extract(input.file.buffer);
  }

  /**
   * Extract from PPTX
   */
  private static async extractFromPptx(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'PPTX extraction requires a file');
    }
    return await PptxParser.extract(input.file.buffer);
  }

  /**
   * Extract from Image (OCR)
   */
  private static async extractFromImage(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'Image extraction requires a file');
    }
    return await ImageOcrParser.extract(input.file.buffer, input.file.mimeType);
  }

  /**
   * Extract from Markdown
   */
  private static async extractFromMarkdown(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'Markdown extraction requires a file');
    }
    return await MarkdownParser.extract(input.file.buffer);
  }

  /**
   * Extract from TXT
   */
  private static async extractFromTxt(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'TXT extraction requires a file');
    }
    const text = input.file.buffer.toString('utf-8');
    return {
      text,
      images: [],
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  }

  /**
   * Extract from HTML
   */
  private static async extractFromHtml(input: ContentInput): Promise<RawContent> {
    if (input.file) {
      return await HtmlParser.extractFromFile(input.file.buffer);
    } else if (input.url) {
      return await HtmlParser.extractFromUrl(input.url);
    }
    throw new AppError(400, 'HTML extraction requires a file or URL');
  }

  /**
   * Extract from CSV
   */
  private static async extractFromCsv(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'CSV extraction requires a file');
    }
    return await CsvParser.extract(input.file.buffer);
  }

  /**
   * Extract from Excel
   */
  private static async extractFromExcel(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'Excel extraction requires a file');
    }
    return await ExcelParser.extract(input.file.buffer);
  }

  /**
   * Extract from Moodle XML
   */
  private static async extractFromMoodleXml(input: ContentInput): Promise<RawContent> {
    if (!input.file) {
      throw new AppError(400, 'Moodle XML extraction requires a file');
    }
    return await MoodleXmlParser.extract(input.file.buffer);
  }

  private static async extractFromGoogleDocs(input: ContentInput): Promise<RawContent> {
    throw new AppError(400, 'Google Docs must be processed via the unified analyze-google adapter endpoint');
  }

  private static async extractFromGoogleForms(input: ContentInput): Promise<RawContent> {
    throw new AppError(400, 'Google Forms must be processed via the unified analyze-google adapter endpoint');
  }

  /**
   * Extract from YouTube
   */
  private static async extractFromYoutube(input: ContentInput): Promise<RawContent> {
    if (!input.url) {
      throw new AppError(400, 'YouTube extraction requires a URL');
    }
    return await YoutubeParser.extract(input.url);
  }

  /**
   * Extract from Website
   */
  private static async extractFromWebsite(input: ContentInput): Promise<RawContent> {
    if (!input.url) {
      throw new AppError(400, 'Website extraction requires a URL');
    }
    return await WebsiteParser.extract(input.url);
  }
}
