/**
 * Formula Engine
 * Process and standardize mathematical expressions across Office Math (OMML),
 * MathML, LaTeX, and Unicode math into dedicated Equation/Formula components.
 */

import { DocumentObject } from './types.js';

export interface ProcessedFormula {
  id: string;
  latex: string;
  mathml?: string;
  unicode?: string;
  type: 'InlineFormula' | 'Formula' | 'Equation';
  isDisplayMode: boolean;
}

export class FormulaEngine {
  /**
   * Parse raw OMML math XML into LaTeX and MathML representations
   */
  static ommlToLatex(ommlXml: string): { latex: string; unicode: string } {
    if (!ommlXml) return { latex: '', unicode: '' };

    try {
      let unicode = ommlXml
        .replace(/<m:r>[\s\S]*?<m:t>([\s\S]*?)<\/m:t>[\s\S]*?<\/m:r>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();

      let tex = ommlXml;
      tex = tex.replace(/<m:t>([\s\S]*?)<\/m:t>/g, (_, inner) => inner.replace(/\s+/g, ' ').trim());
      tex = tex.replace(/<m:sup[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:sup>/g, (_, e) => `^{${this.stripTags(e)}}`);
      tex = tex.replace(/<m:sub[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:sub>/g, (_, e) => `_{${this.stripTags(e)}}`);
      tex = tex.replace(/<m:sSubSup[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSubSup>/g, (_, s, p) => `_{${this.stripTags(s)}}^{${this.stripTags(p)}}`);
      tex = tex.replace(/<m:f[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/g, (_, n, d) => `\\frac{${this.stripTags(n)}}{${this.stripTags(d)}}`);
      tex = tex.replace(/<m:rad[\s\S]*?<m:deg>([\s\S]*?)<\/m:deg>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/g, (_, d, e) => `\\sqrt[${this.stripTags(d)}]{${this.stripTags(e)}}`);
      tex = tex.replace(/<m:rad[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/g, (_, e) => `\\sqrt{${this.stripTags(e)}}`);

      const clean = this.stripTags(tex);
      const symbolMap: Record<string, string> = {
        'π': '\\pi', '∏': '\\prod', '∑': '\\sum', '∫': '\\int', '√': '\\sqrt',
        'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'λ': '\\lambda',
        'μ': '\\mu', 'θ': '\\theta', 'σ': '\\sigma', 'Ω': '\\Omega', 'Δ': '\\Delta',
        '∞': '\\infty', '±': '\\pm', '≠': '\\neq', '≤': '\\leq', '≥': '\\geq',
        '×': '\\times', '÷': '\\div',
      };

      let withSymbols = clean;
      for (const [u, l] of Object.entries(symbolMap)) {
        withSymbols = withSymbols.split(u).join(l);
      }

      return {
        latex: withSymbols.trim() || unicode,
        unicode,
      };
    } catch {
      return { latex: ommlXml, unicode: '' };
    }
  }

  /**
   * Convert inline math symbols in text to standard LaTeX `$ ... $` syntax
   */
  static normalizeTextEquations(text: string): { normalizedText: string; formulas: ProcessedFormula[] } {
    const formulas: ProcessedFormula[] = [];
    let count = 0;

    // Replace MathML tags <math>...</math>
    let normalizedText = text.replace(/<math[\s\S]*?<\/math>/gi, (match) => {
      count++;
      const id = `formula_${count}`;
      const latex = match.replace(/<[^>]+>/g, '').trim();
      formulas.push({
        id,
        latex,
        mathml: match,
        type: 'InlineFormula',
        isDisplayMode: false,
      });
      return `$${latex}$`;
    });

    // Extract block LaTeX equations $$...$$ or \[...\]
    normalizedText = normalizedText.replace(/(\$\$|\\\[)([\s\S]*?)(\$\$|\\\])/g, (_, open, body) => {
      count++;
      const id = `formula_display_${count}`;
      const latex = body.trim();
      formulas.push({
        id,
        latex,
        type: 'Formula',
        isDisplayMode: true,
      });
      return `\n$$ ${latex} $$\n`;
    });

    return { normalizedText, formulas };
  }

  private static stripTags(str: string): string {
    return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
}
