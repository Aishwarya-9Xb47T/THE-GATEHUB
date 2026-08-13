import { V2MathNode } from './types.js';

export class MathematicalEngine {
  /**
   * Isolate LaTeX, MathML, symbolic expressions, matrices, integrals, chemical & physics formulas
   */
  public static processMath(rawText: string): V2MathNode[] {
    const equations: V2MathNode[] = [];

    // Math regex patterns ($...$, $$...$$, \begin{equation}...\end{equation})
    const inlineRegex = /\$([^$\n]+)\$/g;
    const displayRegex = /\$\$([\s\S]+?)\$\$/g;
    const envRegex = /\\begin\{(equation|align|gather|matrix|bmatrix)\}([\s\S]*?)\\end\{\1\}/g;

    let m;
    let idx = 1;

    while ((m = displayRegex.exec(rawText)) !== null) {
      equations.push({
        id: `v2_math_disp_${idx++}`,
        type: 'math',
        latex: m[1].trim(),
        isDisplayMode: true,
      });
    }

    while ((m = envRegex.exec(rawText)) !== null) {
      equations.push({
        id: `v2_math_env_${idx++}`,
        type: 'math',
        latex: m[0].trim(),
        isDisplayMode: true,
      });
    }

    while ((m = inlineRegex.exec(rawText)) !== null) {
      const latex = m[1].trim();
      if (latex.length > 1 && !latex.includes(' ')) {
        equations.push({
          id: `v2_math_inline_${idx++}`,
          type: 'math',
          latex,
          isDisplayMode: false,
        });
      }
    }

    return equations;
  }
}
