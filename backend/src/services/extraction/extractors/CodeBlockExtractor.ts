import { CodeBlockNode } from '../types.js';

export class CodeBlockExtractor {
  private static readonly LANGUAGE_PATTERNS: { lang: string; pattern: RegExp }[] = [
    { lang: 'python', pattern: /^\s*(def |class |import |from |if __name__ ==|print\(|for \w+ in |while |elif |except |try:|with open)/m },
    { lang: 'java', pattern: /^\s*(public class|private class|public static void main|System\.out\.println|import java\.|protected |interface |@Override)/m },
    { lang: 'cpp', pattern: /^\s*(#include <|using namespace std;|int main\(\)|std::cout|std::vector|template <typename)/m },
    { lang: 'javascript', pattern: /^\s*(const |let |var |function\b|import .* from |export default|console\.log\(|=>\s*\{)/m },
    { lang: 'typescript', pattern: /^\s*(interface \w+|type \w+ =|export interface|implements \w+|namespace \w+|enum \w+)/m },
    { lang: 'sql', pattern: /^\s*(SELECT |INSERT INTO |UPDATE |DELETE FROM |CREATE TABLE |ALTER TABLE |JOIN |WHERE |GROUP BY)/i },
    { lang: 'html', pattern: /^\s*(<!DOCTYPE html|<html|<div|<head|<body|<script|<style|<title)/i },
    { lang: 'css', pattern: /^\s*(\.[a-zA-Z0-9_-]+\s*\{|#[a-zA-Z0-9_-]+\s*\{|body\s*\{|@media|display:|flex:|margin:)/m },
  ];

  /**
   * Extract code blocks enclosed in Markdown code fences (```lang ... ```) or indented code blocks
   * Preserves exact spaces, tabs, line breaks, comments, indentation without trimming or collapsing whitespace.
   */
  public static extractCodeBlocks(text: string): { codeBlocks: CodeBlockNode[]; remainingText: string } {
    const codeBlocks: CodeBlockNode[] = [];
    let idCounter = 1;

    // 1. Match standard fenced code blocks: ```lang ... ```
    const fenceRegex = /```([a-zA-Z0-9_+#-]*)\r?\n([\s\S]*?)```/g;
    let remainingText = text.replace(fenceRegex, (_match, lang, codeContent) => {
      const detectedLang = lang.trim() || this.detectLanguage(codeContent) || 'plaintext';
      const blockId = `code_block_${idCounter++}`;

      codeBlocks.push({
        type: 'code',
        id: blockId,
        language: detectedLang.toLowerCase(),
        content: codeContent, // Raw uncollapsed content preserving all spaces and indentation
        fontFamily: 'monospace',
      });

      return `\n[CODE_BLOCK:${blockId}]\n`;
    });

    // 2. Match multi-line indented code segments (e.g. 4+ leading spaces or tabs with code keywords)
    const lineLines = remainingText.split(/\r?\n/);
    const resultLines: string[] = [];
    let currentCodeLines: string[] = [];
    let currentIndentLang: string | null = null;

    for (let i = 0; i < lineLines.length; i++) {
      const line = lineLines[i];
      const isIndented = /^(\t| {4,})/.test(line) && line.trim().length > 0;
      const detectedLang = isIndented ? this.detectLanguage(line) : null;

      if (isIndented && (currentCodeLines.length > 0 || detectedLang)) {
        currentCodeLines.push(line);
        if (detectedLang && !currentIndentLang) currentIndentLang = detectedLang;
      } else {
        if (currentCodeLines.length >= 2 && currentIndentLang) {
          const blockId = `code_block_${idCounter++}`;
          const codeContent = currentCodeLines.join('\n');
          codeBlocks.push({
            type: 'code',
            id: blockId,
            language: currentIndentLang.toLowerCase(),
            content: codeContent,
            fontFamily: 'monospace',
          });
          resultLines.push(`[CODE_BLOCK:${blockId}]`);
          currentCodeLines = [];
          currentIndentLang = null;
        } else if (currentCodeLines.length > 0) {
          resultLines.push(...currentCodeLines);
          currentCodeLines = [];
          currentIndentLang = null;
        }
        resultLines.push(line);
      }
    }

    if (currentCodeLines.length >= 2 && currentIndentLang) {
      const blockId = `code_block_${idCounter++}`;
      const codeContent = currentCodeLines.join('\n');
      codeBlocks.push({
        type: 'code',
        id: blockId,
        language: currentIndentLang.toLowerCase(),
        content: codeContent,
        fontFamily: 'monospace',
      });
      resultLines.push(`[CODE_BLOCK:${blockId}]`);
    }

    return {
      codeBlocks,
      remainingText: resultLines.join('\n'),
    };
  }

  /**
   * Detect programming language from snippet content using regex heuristics
   */
  public static detectLanguage(snippet: string): string | null {
    for (const { lang, pattern } of this.LANGUAGE_PATTERNS) {
      if (pattern.test(snippet)) {
        return lang;
      }
    }
    return null;
  }
}
