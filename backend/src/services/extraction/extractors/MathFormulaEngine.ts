import { MathNode } from '../types.js';

export class MathFormulaEngine {
  /**
   * Convert Office Math Markup Language (OMML) <m:oMath> XML snippet into clean LaTeX
   */
  public static convertOmmlToLatex(ommlXml: string): string {
    let latex = ommlXml;

    // Fractions <m:f> -> \frac{num}{den}
    latex = latex.replace(/<m:f[^>]*>[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/gi, (_match, numXml, denXml) => {
      const numText = this.cleanXmlText(numXml);
      const denText = this.cleanXmlText(denXml);
      return `\\frac{${numText}}{${denText}}`;
    });

    // Radicals / Square Roots <m:rad> -> \sqrt[deg]{base}
    latex = latex.replace(/<m:rad[^>]*>(?:[\s\S]*?<m:deg>([\s\S]*?)<\/m:deg>)?[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/gi, (_match, degXml, eXml) => {
      const eText = this.cleanXmlText(eXml);
      const degText = degXml ? this.cleanXmlText(degXml) : '';
      return degText ? `\\sqrt[${degText}]{${eText}}` : `\\sqrt{${eText}}`;
    });

    // Subscript & Superscript <m:sSubSup>, <m:sSub>, <m:sSup>
    latex = latex.replace(/<m:sSubSup[^>]*>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSubSup>/gi, (_match, eXml, subXml, supXml) => {
      return `${this.cleanXmlText(eXml)}_{${this.cleanXmlText(subXml)}}^{${this.cleanXmlText(supXml)}}`;
    });

    latex = latex.replace(/<m:sSub[^>]*>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/gi, (_match, eXml, subXml) => {
      return `${this.cleanXmlText(eXml)}_{${this.cleanXmlText(subXml)}}`;
    });

    latex = latex.replace(/<m:sSup[^>]*>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/gi, (_match, eXml, supXml) => {
      return `${this.cleanXmlText(eXml)}^{${this.cleanXmlText(supXml)}}`;
    });

    // N-Ary Integrals & Summations <m:nary>
    latex = latex.replace(/<m:nary[^>]*>[\s\S]*?<m:chr\s+m:val="([^"]+)"\/>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:nary>/gi, (_match, chr, subXml, supXml, eXml) => {
      const symbol = chr === '∫' ? '\\int' : chr === '∑' ? '\\sum' : '\\int';
      return `${symbol}_{${this.cleanXmlText(subXml)}}^{${this.cleanXmlText(supXml)}} ${this.cleanXmlText(eXml)}`;
    });

    // Clean remaining XML tags
    latex = this.cleanXmlText(latex);

    // Map common mathematical symbols to LaTeX equivalents
    latex = latex
      .replace(/α/g, '\\alpha ')
      .replace(/β/g, '\\beta ')
      .replace(/γ/g, '\\gamma ')
      .replace(/θ/g, '\\theta ')
      .replace(/π/g, '\\pi ')
      .replace(/σ/g, '\\sigma ')
      .replace(/ω/g, '\\omega ')
      .replace(/Δ/g, '\\Delta ')
      .replace(/Σ/g, '\\Sigma ')
      .replace(/∫/g, '\\int ')
      .replace(/∑/g, '\\sum ')
      .replace(/√/g, '\\sqrt ')
      .replace(/±/g, '\\pm ')
      .replace(/≤/g, '\\le ')
      .replace(/≥/g, '\\ge ')
      .replace(/≠/g, '\\ne ')
      .replace(/∞/g, '\\infty ');

    return latex.trim();
  }

  /**
   * Helper to strip XML tags and normalize math text
   */
  private static cleanXmlText(xmlStr: string): string {
    if (!xmlStr) return '';
    return xmlStr
      .replace(/<m:r[^>]*>[\s\S]*?<m:t[^>]*>([\s\S]*?)<\/m:t>[\s\S]*?<\/m:r>/gi, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract Math nodes (LaTeX formulas) from text or OMML tags
   */
  public static extractMathFormulas(text: string, ommlXmlList: string[] = []): MathNode[] {
    const mathNodes: MathNode[] = [];
    let idCounter = 1;

    // 1. Process OMML XML elements
    ommlXmlList.forEach(omml => {
      const latex = this.convertOmmlToLatex(omml);
      if (latex) {
        mathNodes.push({
          type: 'math',
          id: `math_omml_${idCounter++}`,
          displayType: 'block',
          latex,
          ommlXml: omml,
        });
      }
    });

    // 2. Process LaTeX patterns in text: $$...$$ or $...$ or \[...\] or \(...\)
    const displayRegex = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
    let match;
    while ((match = displayRegex.exec(text)) !== null) {
      const latex = (match[1] || match[2]).trim();
      if (latex) {
        mathNodes.push({
          type: 'math',
          id: `math_display_${idCounter++}`,
          displayType: 'block',
          latex,
        });
      }
    }

    const inlineRegex = /(?:^|[^\$])\$([^\$\n]+?)\$(?:[^\$]|$)|\\\(([\s\S]+?)\\\)/g;
    while ((match = inlineRegex.exec(text)) !== null) {
      const latex = (match[1] || match[2]).trim();
      if (latex && !mathNodes.some(m => m.latex === latex)) {
        mathNodes.push({
          type: 'math',
          id: `math_inline_${idCounter++}`,
          displayType: 'inline',
          latex,
        });
      }
    }

    return mathNodes;
  }
}
