import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlideRenderer } from './SlideRenderer';

vi.mock('pptx-svg', () => ({
  PptxRenderer: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    loadPptx: vi.fn().mockResolvedValue({ slideCount: 1 }),
    renderSlideSvg: vi.fn(() => '<svg data-testid="native-slide-svg"></svg>'),
  })),
}));

describe('SlideRenderer', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('keeps text boxes from clipping their content', () => {
    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        {
          id: 'text-1',
          type: 'text',
          transform: { x: 0, y: 0, width: 6_000_000, height: 1_500_000, rotation: 0, flipH: false, flipV: false },
          zIndex: 1,
          paragraphs: [
            {
              text: 'This should remain fully visible in the box',
              level: 0,
              runs: [{ text: 'This should remain fully visible in the box', style: { sz: 2800 } }],
              style: {},
            },
          ],
          textBody: { anchor: 't', lIns: 0, rIns: 0, tIns: 0, bIns: 0 },
        },
      ],
    };

    render(<SlideRenderer content={content as any} title="Test slide" />);

    const textBox = document.getElementById('text-1');
    expect(textBox).toBeTruthy();
    expect(textBox?.style.overflow).toBe('visible');
  });

  it('renders pre-rendered SVG visual when available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('<svg data-testid="native-slide-svg" xmlns="http://www.w3.org/2000/svg"></svg>'),
    }));

    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      visual: {
        type: 'svg',
        src: '/uploads/classroom-studio/demo/renders/slide-001.svg',
        slideIndex: 0,
      },
      elements: [{ id: 'table-1', type: 'table', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 }, columns: [1], rows: [] }],
    };

    render(<SlideRenderer content={content as any} title="SVG slide" slideNumber={1} />);

    expect(await screen.findByTestId('native-slide-svg')).toBeTruthy();
    expect(document.querySelector('[id="table-1"]')).toBeNull();
  });

  it('renders native PPTX SVG when a slide visual source is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(100).fill(0)]).buffer),
    }));

    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      visual: { type: 'pptx', src: '/uploads/classroom-studio/demo/source.pptx' },
      elements: [],
    };

    render(<SlideRenderer content={content as any} title="PPTX slide" slideNumber={1} />);

    expect(await screen.findByTestId('native-slide-svg')).toBeTruthy();
  });
});
