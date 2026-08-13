/**
 * Content Analysis Engine Tests
 * Tests for the content analysis pipeline
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContentAnalysisEngine } from '../ContentAnalysisEngine.js';
import { ContentInput, ContentSource } from '../unifiedTypes.js';

describe('ContentAnalysisEngine', () => {
  describe('validateInput', () => {
    it('should validate file input', () => {
      const input: ContentInput = {
        source: ContentSource.FILE,
        file: {
          name: 'test.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('test'),
          size: 4,
        },
      };

      expect(() => ContentAnalysisEngine.validateInput(input)).not.toThrow();
    });

    it('should reject file input without file', () => {
      const input: ContentInput = {
        source: ContentSource.FILE,
      };

      expect(() => ContentAnalysisEngine.validateInput(input)).toThrow();
    });

    it('should validate URL input', () => {
      const input: ContentInput = {
        source: ContentSource.URL,
        url: 'https://example.com',
      };

      expect(() => ContentAnalysisEngine.validateInput(input)).not.toThrow();
    });

    it('should reject URL input without URL', () => {
      const input: ContentInput = {
        source: ContentSource.URL,
      };

      expect(() => ContentAnalysisEngine.validateInput(input)).toThrow();
    });

    it('should reject invalid URL', () => {
      const input: ContentInput = {
        source: ContentSource.URL,
        url: 'not-a-url',
      };

      expect(() => ContentAnalysisEngine.validateInput(input)).toThrow();
    });
  });

  describe('getSupportedSourceTypes', () => {
    it('should return list of supported sources', () => {
      const sources = ContentAnalysisEngine.getSupportedSourceTypes();
      
      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it('should include common source types', () => {
      const sources = ContentAnalysisEngine.getSupportedSourceTypes();
      
      expect(sources).toContain('pdf');
      expect(sources).toContain('docx');
      expect(sources).toContain('txt');
    });
  });
});
