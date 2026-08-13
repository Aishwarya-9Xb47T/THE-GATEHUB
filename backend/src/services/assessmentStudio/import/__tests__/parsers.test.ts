/**
 * Import Parser Tests
 * Tests for all source type parsers
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DocxParser } from '../parsers/DocxParser.js';
import { MarkdownParser } from '../parsers/MarkdownParser.js';
import { CsvParser } from '../parsers/CsvParser.js';
import { ExcelParser } from '../parsers/ExcelParser.js';
import { HtmlParser } from '../parsers/HtmlParser.js';
import { MoodleXmlParser } from '../parsers/MoodleXmlParser.js';

describe('DocxParser', () => {
  it('should extract text from DOCX buffer', async () => {
    const mockBuffer = Buffer.from('mock docx content');
    // This is a placeholder - in real tests, you'd use actual DOCX files
    // For now, we'll just test that the function exists and doesn't crash
    expect(DocxParser).toBeDefined();
    expect(typeof DocxParser.extract).toBe('function');
  });
});

describe('MarkdownParser', () => {
  it('should extract text from markdown buffer', async () => {
    const markdown = '# Test\n\nThis is a test markdown file.';
    const buffer = Buffer.from(markdown, 'utf-8');
    
    const result = await MarkdownParser.extract(buffer);
    
    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe('string');
    expect(result.images).toBeDefined();
    expect(Array.isArray(result.images)).toBe(true);
  });

  it('should extract images from markdown', async () => {
    const markdown = '# Test\n\n![Alt text](image.png)';
    const buffer = Buffer.from(markdown, 'utf-8');
    
    const result = await MarkdownParser.extract(buffer);
    
    expect(result.images.length).toBeGreaterThan(0);
    expect(result.images[0].altText).toBe('Alt text');
  });
});

describe('CsvParser', () => {
  it('should extract text from CSV buffer', async () => {
    const csv = 'Name,Age,City\nJohn,30,NYC\nJane,25,LA';
    const buffer = Buffer.from(csv, 'utf-8');
    
    const result = await CsvParser.extract(buffer);
    
    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.text).toContain('Name');
    expect(result.text).toContain('John');
  });

  it('should handle empty CSV', async () => {
    const csv = '';
    const buffer = Buffer.from(csv, 'utf-8');
    
    await expect(CsvParser.extract(buffer)).rejects.toThrow();
  });
});

describe('ExcelParser', () => {
  it('should extract text from Excel buffer', async () => {
    // Placeholder test - would need actual Excel file
    expect(ExcelParser).toBeDefined();
    expect(typeof ExcelParser.extract).toBe('function');
  });
});

describe('HtmlParser', () => {
  it('should extract text from HTML buffer', async () => {
    const html = '<html><body><h1>Test</h1><p>Content</p></body></html>';
    const buffer = Buffer.from(html, 'utf-8');
    
    const result = await HtmlParser.extractFromFile(buffer);
    
    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.text).toContain('Test');
    expect(result.text).toContain('Content');
  });

  it('should remove script tags', async () => {
    const html = '<html><body><script>alert("test");</script><p>Content</p></body></html>';
    const buffer = Buffer.from(html, 'utf-8');
    
    const result = await HtmlParser.extractFromFile(buffer);
    
    expect(result.text).not.toContain('alert');
    expect(result.text).toContain('Content');
  });
});

describe('MoodleXmlParser', () => {
  it('should extract questions from Moodle XML', async () => {
    const xml = `<?xml version="1.0"?>
    <quiz>
      <question type="multichoice">
        <name><text>Q1</text></name>
        <questiontext><text>What is 2+2?</text></questiontext>
        <answer fraction="100" format="html">
          <text>4</text>
        </answer>
        <answer fraction="0" format="html">
          <text>5</text>
        </answer>
      </question>
    </quiz>`;
    const buffer = Buffer.from(xml, 'utf-8');
    
    const result = await MoodleXmlParser.extract(buffer);
    
    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.text).toContain('What is 2+2?');
  });
});
