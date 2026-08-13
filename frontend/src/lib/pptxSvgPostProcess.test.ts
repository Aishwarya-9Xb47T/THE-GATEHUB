import { describe, expect, it } from 'vitest';
import { stripPptxSvgDefaultTableGridLines } from './pptxSvgPostProcess';

describe('stripPptxSvgDefaultTableGridLines', () => {
  it('removes pptx-svg default table grid lines', () => {
    const svg = '<svg><g data-ooxml-shape-type="table"><line x1="0" y1="0" x2="10" y2="0" stroke="#999999" stroke-width="1"/><text>ok</text></g></svg>';
    const out = stripPptxSvgDefaultTableGridLines(svg);
    expect(out).not.toContain('stroke="#999999"');
    expect(out).toContain('<text>ok</text>');
  });

  it('leaves non-table strokes unchanged', () => {
    const svg = '<svg><line stroke="#000000" stroke-width="2"/></svg>';
    expect(stripPptxSvgDefaultTableGridLines(svg)).toBe(svg);
  });
});
