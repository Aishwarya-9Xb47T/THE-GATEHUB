/**
 * Code Detection Engine
 * Detects code blocks non-regex via typography (monospace fonts), paragraph styles,
 * background shading, tabs, and indentation. Groups contiguous code elements into unified blocks.
 */

import { DocumentObject, DocumentObjectStyle } from './types.js';

export interface CodeBlockResult {
  language: string;
  code: string;
  linesCount: number;
  hasMonospace: boolean;
  hasShading: boolean;
  indentationLevel: number;
}

export class CodeDetectionEngine {
  private static readonly MONOSPACE_FONTS = new Set([
    'courier',
    'courier new',
    'consolas',
    'monaco',
    'menlo',
    'fira code',
    'dejavu sans mono',
    'source code pro',
    'ubuntu mono',
    'monospace',
    'fixedsys',
    'lucida console',
  ]);

  private static readonly LANGUAGE_KEYWORDS: Record<string, string[]> = {
    python: ['def ', 'import ', 'from ', 'class ', 'elif ', 'if __name__ ==', 'self.', 'print('],
    typescript: ['interface ', 'type ', 'const ', 'export ', 'function ', 'async ', 'import ', 'from '],
    javascript: ['const ', 'let ', 'var ', 'function ', 'console.log', 'async ', 'return '],
    java: ['public class', 'private static', 'public static void main', 'System.out.println'],
    cpp: ['#include', 'using namespace std;', 'int main()', 'std::cout'],
    sql: ['SELECT ', 'INSERT INTO ', 'UPDATE ', 'DELETE FROM ', 'CREATE TABLE ', 'JOIN ', 'WHERE '],
    html: ['<div', '<span', '<html', '<head', '<body', '</'],
    json: ['{"', '":', '": [', '": {'],
  };

  /**
   * Determine if a document object / node represents code
   */
  static isCodeObject(node: DocumentObject): boolean {
    if (node.type === 'CodeBlock' || node.type === 'InlineCode' || node.type === 'ProgrammingBlock' || node.type === 'SQLBlock') {
      return true;
    }

    const style = node.style;
    const text = node.content || '';

    // 1. Monospace font check
    if (style) {
      if (style.isMonospace) return true;
      if (style.fontFamily && this.isMonospaceFont(style.fontFamily)) return true;
      if (style.backgroundColor && style.backgroundColor !== 'transparent' && style.backgroundColor !== '#ffffff') {
        // Monospace or shaded block
        if (text.includes(';') || text.includes('{') || text.includes('}') || text.includes('def ') || text.includes('class ')) {
          return true;
        }
      }
    }

    // 2. Metadata / style class name check
    const styleName = (node.metadata?.styleName || node.metadata?.className || '').toLowerCase();
    if (styleName.includes('code') || styleName.includes('pre') || styleName.includes('source') || styleName.includes('program')) {
      return true;
    }

    // 3. Indentation & code tokens check
    if (style?.indentation && (style.indentation.left || 0) > 20) {
      if (this.detectLanguage(text) !== 'plaintext') {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if font family is monospace
   */
  static isMonospaceFont(fontFamily: string): boolean {
    if (!fontFamily) return false;
    const cleanFont = fontFamily.toLowerCase().trim().replace(/['"]/g, '');
    for (const mono of this.MONOSPACE_FONTS) {
      if (cleanFont.includes(mono)) return true;
    }
    return false;
  }

  /**
   * Detect programming language from snippet
   */
  static detectLanguage(text: string): string {
    if (!text || text.trim().length === 0) return 'plaintext';

    let bestLang = 'plaintext';
    let maxMatches = 0;

    for (const [lang, keywords] of Object.entries(this.LANGUAGE_KEYWORDS)) {
      let matches = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestLang = lang;
      }
    }

    return bestLang;
  }

  /**
   * Group contiguous code nodes into single unified CodeBlock nodes
   */
  static groupContiguousCodeNodes(nodes: DocumentObject[]): DocumentObject[] {
    const sorted = [...nodes].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return (a.readingOrder || 0) - (b.readingOrder || 0);
    });

    const result: DocumentObject[] = [];
    let currentCodeGroup: DocumentObject[] = [];

    const flushGroup = () => {
      if (currentCodeGroup.length === 0) return;

      if (currentCodeGroup.length === 1) {
        const single = currentCodeGroup[0];
        single.type = 'CodeBlock';
        single.metadata.language = this.detectLanguage(single.content || '');
        result.push(single);
      } else {
        const first = currentCodeGroup[0];
        const combinedContent = currentCodeGroup.map(n => n.content || '').join('\n');
        const language = this.detectLanguage(combinedContent);

        const combinedBbox = {
          x: Math.min(...currentCodeGroup.map(n => n.bbox.x)),
          y: Math.min(...currentCodeGroup.map(n => n.bbox.y)),
          width: Math.max(...currentCodeGroup.map(n => n.bbox.x + n.bbox.width)) - Math.min(...currentCodeGroup.map(n => n.bbox.x)),
          height: Math.max(...currentCodeGroup.map(n => n.bbox.y + n.bbox.height)) - Math.min(...currentCodeGroup.map(n => n.bbox.y)),
          page: first.page,
        };

        const mergedNode: DocumentObject = {
          id: first.id,
          type: 'CodeBlock',
          bbox: combinedBbox,
          page: first.page,
          confidence: 1.0,
          readingOrder: first.readingOrder,
          children: currentCodeGroup.map(n => n.id),
          relationships: [],
          style: first.style,
          metadata: {
            ...first.metadata,
            language,
            isGrouped: true,
            originalLineCount: currentCodeGroup.length,
          },
          content: combinedContent,
        };

        result.push(mergedNode);
      }
      currentCodeGroup = [];
    };

    for (const node of sorted) {
      if (this.isCodeObject(node)) {
        currentCodeGroup.push(node);
      } else {
        flushGroup();
        result.push(node);
      }
    }
    flushGroup();

    return result;
  }
}
