import { describe, expect, it } from '@jest/globals';
import {
  validateElementGeometry,
  validateSlideContent,
  validateDeckFidelity,
} from '../presentationFidelityValidator.js';

describe('presentationFidelityValidator', () => {
  it('flags unresolved asset:// references', () => {
    const issues = validateElementGeometry(
      { id: 1, type: 'image', transform: { x: 0, y: 0, width: 100, height: 100 }, src: 'asset://media/image1.png' },
      12_192_000,
      6_858_000,
      1,
    );
    expect(issues.some((i) => i.code === 'unresolved_asset')).toBe(true);
  });

  it('validates slide visual index parity', () => {
    const result = validateSlideContent(
      {
        version: 2,
        format: 'ooxml',
        size: { width: 12_192_000, height: 6_858_000 },
        visual: { type: 'svg', src: '/uploads/x/renders/slide-001.svg', slideIndex: 0 },
        elements: [{ id: 1, type: 'text', transform: { x: 0, y: 0, width: 100, height: 100 }, paragraphs: [{ runs: [{ text: 'Hi' }] }] }],
      },
      1,
    );
    expect(result.issues.some((i) => i.code === 'slide_index_mismatch')).toBe(false);
  });

  it('requires full deck visual coverage', () => {
    const result = validateDeckFidelity({
      slides: [
        { order: 1, content: { version: 2, size: { width: 100, height: 100 }, visual: { type: 'pptx', slideIndex: 0 }, elements: [] } },
        { order: 2, content: { version: 2, size: { width: 100, height: 100 }, visual: { type: 'pptx', slideIndex: 1 }, elements: [] } },
      ],
      sourceSlideCount: 2,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'svg_visual_count_mismatch')).toBe(true);
  });
});
