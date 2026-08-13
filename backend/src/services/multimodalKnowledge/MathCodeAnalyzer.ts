import { CodeBlock, MathFormula, MultimodalBlock } from './types.js';

export class MathCodeAnalyzer {
  /**
   * Process raw text and blocks to detect and structure math formulas and programming code
   */
  public static analyze(
    blocks: MultimodalBlock[],
    rawText: string
  ): {
    codeBlocks: CodeBlock[];
    equations: MathFormula[];
    updatedBlocks: MultimodalBlock[];
  } {
    const codeBlocks: CodeBlock[] = [];
    const equations: MathFormula[] = [];
    const updatedBlocks: MultimodalBlock[] = [...blocks];

    // 1. Math Equation Isolation Regex ($...$, $$...$$, \begin{equation}...\end{equation})
    const inlineMathRegex = /\$([^$\n]+)\$/g;
    const displayMathRegex = /\$\$([\s\S]+?)\$\$/g;
    const latexEnvRegex = /\\begin\{(equation|align|gather|matrix|bmatrix)\}([\s\S]*?)\\end\{\1\}/g;

    let mathMatch;
    let mathIdx = 1;

    // Display Math
    while ((mathMatch = displayMathRegex.exec(rawText)) !== null) {
      const latex = mathMatch[1].trim();
      const mathObj: MathFormula = {
        id: `math_disp_${mathIdx++}`,
        latex,
        type: latex.includes('matrix') ? 'matrix' : latex.includes('frac') ? 'fraction' : 'equation',
      };
      equations.push(mathObj);
    }

    // LaTeX Environments
    while ((mathMatch = latexEnvRegex.exec(rawText)) !== null) {
      const envType = mathMatch[1];
      const latex = mathMatch[0].trim();
      const mathObj: MathFormula = {
        id: `math_env_${mathIdx++}`,
        latex,
        type: envType.includes('matrix') ? 'matrix' : 'equation',
      };
      equations.push(mathObj);
    }

    // Inline Math
    while ((mathMatch = inlineMathRegex.exec(rawText)) !== null) {
      const latex = mathMatch[1].trim();
      if (latex.length > 1 && !latex.includes(' ')) {
        const mathObj: MathFormula = {
          id: `math_inline_${mathIdx++}`,
          latex,
          type: 'inline',
        };
        equations.push(mathObj);
      }
    }

    // 2. Automatic Programming Language Detection & Code Block Parsing
    const lines = rawText.split('\n');
    let currentCode: string[] = [];
    let detectedLang = '';
    let isCodeActive = false;

    lines.forEach((line, idx) => {
      const lang = this.detectLanguageFromLine(line);
      if (lang && !isCodeActive) {
        isCodeActive = true;
        detectedLang = lang;
        currentCode.push(line);
      } else if (isCodeActive) {
        currentCode.push(line);
        // Code termination heuristic
        if (line.trim() === '}' || line.trim() === ']' || line.trim() === '```' || (idx < lines.length - 1 && lines[idx + 1].trim().length === 0)) {
          const codeStr = currentCode.join('\n');
          if (codeStr.length > 15) {
            const codeObj: CodeBlock = {
              id: `code_auto_${codeBlocks.length + 1}`,
              language: detectedLang,
              code: codeStr,
              indentationPreserved: true,
              lineNumbers: currentCode.map((_, i) => i + 1),
              comments: currentCode.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#')),
            };
            codeBlocks.push(codeObj);
          }
          isCodeActive = false;
          currentCode = [];
        }
      }
    });

    return { codeBlocks, equations, updatedBlocks };
  }

  /**
   * Detect programming language from signature code lines
   */
  private static detectLanguageFromLine(line: string): string | null {
    const trimmed = line.trim();
    if (trimmed.startsWith('import React') || trimmed.startsWith('export default function') || trimmed.includes('<div className=')) return 'react';
    if (trimmed.startsWith('import ') && trimmed.includes('from \'next/')) return 'nextjs';
    if (trimmed.startsWith('def ') || (trimmed.startsWith('import ') && !trimmed.includes('from')) || trimmed.startsWith('class ') && trimmed.endsWith(':')) return 'python';
    if (trimmed.startsWith('public class ') || trimmed.startsWith('private final ') || trimmed.includes('System.out.println')) return 'java';
    if (trimmed.startsWith('#include <') || trimmed.includes('std::cout') || trimmed.startsWith('int main(')) return 'cpp';
    if (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('function ') || trimmed.includes('=> {')) return 'javascript';
    if (trimmed.includes(': string') || trimmed.includes(': number') || trimmed.includes('interface ') || trimmed.includes('type ')) return 'typescript';
    if (trimmed.startsWith('SELECT ') || trimmed.startsWith('INSERT INTO ') || trimmed.startsWith('CREATE TABLE ')) return 'sql';
    if (trimmed.startsWith('package main') || trimmed.startsWith('func ')) return 'go';
    if (trimmed.startsWith('fn main()') || trimmed.startsWith('let mut ')) return 'rust';
    if (trimmed.startsWith('#!/bin/bash') || trimmed.startsWith('sudo ') || trimmed.startsWith('npm run ') || trimmed.startsWith('docker run')) return 'shell';
    if (trimmed.startsWith('resource "') || trimmed.startsWith('provider "')) return 'terraform';
    if (trimmed.startsWith('FROM ') && trimmed.includes('AS ')) return 'docker';
    return null;
  }
}
