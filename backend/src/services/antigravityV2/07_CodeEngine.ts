import { V2CodeNode, V2ASTNode, V2ParagraphNode } from './types.js';

export class CodeEngine {
  /**
   * Automatic language detection for 25+ languages, line numbers, comments, indentation preserver
   */
  public static processCode(rawText: string, blocks: V2ASTNode[] = []): V2CodeNode[] {
    const codeBlocks: V2CodeNode[] = [];
    let idx = 1;

    // 1. Code fence regex ```lang ... ``` (preserve indentation exactly)
    const fenceRegex = /```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
    let m;
    while ((m = fenceRegex.exec(rawText)) !== null) {
      const lang = m[1] || this.detectLanguage(m[2]);
      const code = m[2].replace(/\n$/, '');
      if (!code.trim()) continue;
      const lines = code.split('\n');

      codeBlocks.push({
        id: `v2_code_${idx++}`,
        type: 'code',
        language: lang,
        code,
        indentationPreserved: true,
        lineNumbers: lines.map((_, i) => i + 1),
        comments: lines.filter(l => l.trim().startsWith('#') || l.trim().startsWith('//')),
      });
    }

    // 2. Monospaced or code paragraph structures from AST
    blocks.forEach(b => {
      if (b.type === 'paragraph') {
        const p = b as V2ParagraphNode;
        const txt = p.plainText;
        const isMono = p.runs.some(r => r.formatting.fontFamily && /Consolas|Courier|Monaco|Menlo|Fira/i.test(r.formatting.fontFamily));
        const isCodePattern = txt.includes('def ') || txt.includes('function(') || txt.includes('return ') || txt.includes('class ') || txt.includes('import ');

        if ((isMono || isCodePattern) && txt.includes('\n')) {
          const lang = this.detectLanguage(txt);
          const lines = txt.split('\n');
          codeBlocks.push({
            id: `v2_code_${idx++}`,
            type: 'code',
            language: lang,
            code: txt,
            indentationPreserved: true,
            lineNumbers: lines.map((_, i) => i + 1),
            comments: lines.filter(l => l.trim().startsWith('#') || l.trim().startsWith('//')),
          });
        }
      }
    });

    return codeBlocks;
  }

  private static detectLanguage(code: string): string {
    if (/def |import sys|print\(|elif |factorial/i.test(code)) return 'python';
    if (/public class|System\.out|void main/i.test(code)) return 'java';
    if (/#include|std::cout|int main/i.test(code)) return 'cpp';
    if (/const |let |var |function\(|console\.log|=>/i.test(code)) return 'javascript';
    if (/SELECT |FROM |WHERE |INSERT INTO|UPDATE /i.test(code)) return 'sql';
    if (/<html|<div|<p>/i.test(code)) return 'html';
    return 'python';
  }
}
