import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlideRenderer, clearClassroomPptxBufferCache } from './SlideRenderer';

vi.mock('pptx-svg', () => ({
  PptxRenderer: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    loadPptx: vi.fn().mockResolvedValue({ slideCount: 1 }),
    renderSlideSvg: vi.fn(() => '<svg data-testid="native-slide-svg"></svg>'),
  })),
}));

function mockResponse(init: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  text?: string;
  bytes?: number[];
}) {
  const bytes = init.bytes;
  return {
    ok: init.ok ?? true,
    status: init.status ?? (init.ok === false ? 404 : 200),
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? init.contentType ?? null : null),
    },
    text: vi.fn().mockResolvedValue(init.text ?? ''),
    arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array(bytes ?? []).buffer),
    clone() {
      return mockResponse(init);
    },
  };
}

const pptxBytes = [0x50, 0x4b, 0x03, 0x04, ...new Array(100).fill(0)];

describe('SlideRenderer', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    clearClassroomPptxBufferCache();
    vi.unstubAllGlobals();
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      contentType: 'image/svg+xml',
      text: '<svg data-testid="native-slide-svg" xmlns="http://www.w3.org/2000/svg"></svg>',
    })));

    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      visual: {
        type: 'svg',
        src: '/uploads/classroom/demo/renders/slide-001.svg',
        slideIndex: 0,
      },
      elements: [{ id: 'table-1', type: 'table', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 }, columns: [1], rows: [] }],
    };

    render(<SlideRenderer content={content as any} title="SVG slide" slideNumber={1} presentationId="demo" />);

    expect(await screen.findByTestId('native-slide-svg')).toBeTruthy();
    expect(document.querySelector('[id="table-1"]')).toBeNull();
  });

  it('falls back to cached PPTX WASM when the SVG is missing', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/renders/')) {
        return mockResponse({
          ok: false,
          status: 404,
          contentType: 'application/json',
          text: JSON.stringify({ error: { code: 'CLASSROOM_ASSET_NOT_FOUND', message: 'missing' } }),
        });
      }
      return mockResponse({
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        bytes: pptxBytes,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      visual: {
        type: 'svg',
        src: '/uploads/classroom/demo/renders/slide-002.svg',
        slideIndex: 1,
        source: { type: 'pptx', src: '/uploads/classroom/demo/source/original.pptx' },
      },
      elements: [{ id: 'fake-html', type: 'text', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }],
    };

    const { rerender } = render(
      <SlideRenderer content={content as any} title="PPTX fallback" slideNumber={2} presentationId="demo" />,
    );
    expect(await screen.findByTestId('native-slide-svg')).toBeTruthy();
    expect(document.getElementById('fake-html')).toBeNull();

    rerender(
      <SlideRenderer
        content={{ ...content, visual: { ...content.visual, slideIndex: 0 } } as any}
        title="PPTX fallback"
        slideNumber={1}
        presentationId="demo"
      />,
    );
    expect(await screen.findByTestId('native-slide-svg')).toBeTruthy();
    const pptxCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/assets/source/original.pptx'));
    expect(pptxCalls.length).toBe(1);
  });

  it('shows rendering progress instead of unavailable while visuals are being generated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      ok: false,
      status: 404,
      contentType: 'application/json',
      text: JSON.stringify({ error: { code: 'CLASSROOM_ASSET_NOT_FOUND', message: 'missing' } }),
    })));

    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      visual: {
        type: 'svg',
        src: '/uploads/classroom/demo/renders/slide-002.svg',
        slideIndex: 1,
      },
      elements: [],
    };

    render(
      <SlideRenderer
        content={content as any}
        title="Rendering slide"
        slideNumber={2}
        presentationId="demo"
        pipelineStatus="rendering"
        slideCount={20}
        renderProgressSlide={2}
      />,
    );

    const error = await screen.findByTestId('classroom-visual-error');
    expect(error.textContent).toContain('CLASSROOM_RENDERING');
    expect(error.textContent).toContain('Rendering slide 2 of 20');
    expect(error.textContent).not.toContain('Regenerate slide visuals');
  });

  it('renders native PPTX SVG when a slide visual source is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      bytes: pptxBytes,
    })));

    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      visual: { type: 'pptx', src: '/uploads/classroom/demo/source/original.pptx' },
      elements: [],
    };

    render(<SlideRenderer content={content as any} title="PPTX slide" slideNumber={1} presentationId="demo" />);

    expect(await screen.findByTestId('native-slide-svg')).toBeTruthy();
  });

  it('shows a diagnostic error instead of fake HTML when the PPTX cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      ok: false,
      status: 404,
      contentType: 'application/json',
      text: JSON.stringify({ error: { code: 'CLASSROOM_ASSET_NOT_FOUND', message: 'Presentation asset not found' } }),
    })));

    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      visual: { type: 'pptx', src: '/uploads/classroom/demo/source/original.pptx' },
      elements: [{ id: 'fake-html', type: 'text', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }],
    };

    render(<SlideRenderer content={content as any} title="Broken slide" slideNumber={2} presentationId="demo" />);

    const error = await screen.findByTestId('classroom-visual-error');
    expect(error.textContent).toContain('CLASSROOM_ASSET_NOT_FOUND');
    expect(error.textContent).toContain('Slide: 2');
    expect(error.textContent).toContain('demo');
    expect(document.getElementById('fake-html')).toBeNull();
  });
});
