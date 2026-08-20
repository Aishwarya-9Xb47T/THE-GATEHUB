import { render, screen } from '@testing-library/react';
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
  const payload = bytes
    ? Uint8Array.from(bytes)
    : new TextEncoder().encode(init.text ?? '');
  return {
    ok: init.ok ?? true,
    status: init.status ?? (init.ok === false ? 404 : 200),
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? init.contentType ?? null : null),
    },
    text: vi.fn().mockResolvedValue(init.text ?? ''),
    arrayBuffer: vi.fn().mockResolvedValue(payload.buffer),
    blob: vi.fn().mockImplementation(async () => {
      const file = new Blob([payload], { type: init.contentType || 'application/octet-stream' });
      if (typeof (file as Blob).arrayBuffer !== 'function') {
        Object.defineProperty(file, 'arrayBuffer', {
          value: async () => payload.buffer,
        });
      }
      return file;
    }),
    clone() {
      return mockResponse(init);
    },
  };
}

const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(1)];
const svgMarkup = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"></svg>';

function importedContent(overrides?: Record<string, unknown>) {
  return {
    version: 2,
    format: 'ooxml',
    size: { width: 12_192_000, height: 6_858_000 },
    background: { type: 'solid', color: '#ffffff' },
    visual: {
      type: 'image',
      src: '/uploads/classroom/demo/renders/slide-001.png',
      slideIndex: 0,
    },
    elements: [],
    ...overrides,
  };
}

describe('SlideRenderer', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.unstubAllGlobals();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    URL.createObjectURL = vi.fn(() => 'blob:mock-slide-visual') as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    clearClassroomPptxBufferCache();
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

  it('renders the source PNG as the classroom visual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      contentType: 'image/png',
      bytes: pngBytes,
    })));

    const content = importedContent({
      elements: [{ id: 'table-1', type: 'table', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 }, columns: [1], rows: [] }],
    });

    render(
      <SlideRenderer content={content as any} title="PNG slide" slideNumber={1} presentationId="demo" />,
    );

    const image = await screen.findByTestId('classroom-slide-visual');
    expect(image.getAttribute('src')).toContain('/api/classroom-studio/presentations/demo/assets/renders/slide-001.png');
    expect(image.style.objectFit).toBe('contain');
    expect(document.querySelector('[id="table-1"]')).toBeNull();
  });

  it('can still display a stored SVG visual as an image, never extracted HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      contentType: 'image/svg+xml',
      text: svgMarkup,
    })));

    const content = importedContent({
      visual: {
        type: 'svg',
        src: '/uploads/classroom/demo/renders/slide-001.svg',
        slideIndex: 0,
      },
      elements: [{ id: 'table-1', type: 'table', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 }, columns: [1], rows: [] }],
    });

    render(<SlideRenderer content={content as any} title="SVG slide" slideNumber={1} presentationId="demo" />);

    const image = await screen.findByTestId('classroom-slide-visual');
    expect(image.getAttribute('src')).toContain('slide-001.png');
    expect(document.querySelector('[id="table-1"]')).toBeNull();
  });

  it('does not reconstruct extracted HTML when the visual is still missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      ok: false,
      status: 404,
      contentType: 'application/json',
      text: JSON.stringify({ error: { code: 'CLASSROOM_ASSET_NOT_FOUND', message: 'missing' } }),
    })));

    const content = importedContent({
      visual: {
        type: 'svg',
        src: '/uploads/classroom/demo/renders/slide-002.svg',
        slideIndex: 1,
      },
      elements: [{ id: 'fake-html', type: 'text', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }],
    });

    render(
      <SlideRenderer content={content as any} title="Missing visual" slideNumber={2} presentationId="demo" />,
    );

    expect(await screen.findByTestId('classroom-slide-visual')).toBeTruthy();
    expect(document.getElementById('fake-html')).toBeNull();
  });

  it('shows rendering progress instead of extracted matrices while visuals are being generated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      ok: false,
      status: 404,
      contentType: 'application/json',
      text: JSON.stringify({ error: { code: 'CLASSROOM_ASSET_NOT_FOUND', message: 'missing' } }),
    })));

    const content = importedContent({
      visual: {
        type: 'svg',
        src: '/uploads/classroom/demo/renders/slide-002.svg',
        slideIndex: 1,
      },
      elements: [
        {
          id: 'channel-1',
          type: 'text',
          transform: { x: 0, y: 0, width: 6_000_000, height: 1_500_000, rotation: 0, flipH: false, flipV: false },
          zIndex: 1,
          paragraphs: [
            {
              text: 'Channel 1',
              level: 0,
              runs: [{ text: 'Channel 1', style: { sz: 1800 } }],
              style: {},
            },
          ],
        },
      ],
    });

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
    expect(document.getElementById('channel-1')).toBeNull();
  });

  it('shows a per-slide failure instead of a generic storage error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      ok: false,
      status: 404,
      contentType: 'application/json',
      text: JSON.stringify({ error: { code: 'CLASSROOM_ASSET_NOT_FOUND', message: 'missing' } }),
    })));

    const content = importedContent({
      visual: {
        type: 'pptx',
        src: '/uploads/classroom/demo/source/original.pptx',
        slideIndex: 6,
        availability: 'failed',
        errorCode: 'CLASSROOM_RENDER_SLIDE_FAILED',
        errorMessage: 'Slide visual unavailable',
      },
    });

    render(
      <SlideRenderer
        content={content as any}
        title="Failed slide"
        slideNumber={7}
        presentationId="demo"
        canRepair
        onRepair={() => undefined}
        pipelineStatus="rendering_partial"
        slideCount={20}
      />,
    );

    const error = await screen.findByTestId('classroom-visual-error');
    expect(error.textContent).toContain('CLASSROOM_RENDER_SLIDE_FAILED');
    expect(error.textContent).toContain('Slide visual rendering failed. Retry.');
    expect(error.textContent).toContain('Retry this slide');
    expect(error.textContent).not.toContain('Presentation asset unavailable');
  });

  it('does not use extracted equations as the visual when the PNG cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      ok: false,
      status: 404,
      contentType: 'application/json',
      text: JSON.stringify({ error: { code: 'CLASSROOM_ASSET_NOT_FOUND', message: 'Presentation asset not found' } }),
    })));

    const content = importedContent({
      visual: { type: 'pptx', src: '/uploads/classroom/demo/source/original.pptx', slideIndex: 1 },
      elements: [
        {
          id: 'equation-1',
          type: 'equation',
          transform: { x: 0, y: 0, width: 6_000_000, height: 1_500_000, rotation: 0, flipH: false, flipV: false },
          zIndex: 1,
          paragraphs: [
            {
              text: 'Output(1,1) = 2',
              level: 0,
              runs: [{ text: 'Output(1,1) = 2', style: { latin: 'Cambria Math' } }],
              style: {},
            },
          ],
        },
      ],
    });

    render(<SlideRenderer content={content as any} title="Broken slide" slideNumber={2} presentationId="demo" />);

    expect(await screen.findByTestId('classroom-slide-visual')).toBeTruthy();
    expect(screen.queryByTestId('classroom-visual-status')).toBeNull();
    expect(document.getElementById('equation-1')).toBeNull();
  });

  it('renders grouped text even when the group extent is 0', () => {
    const content = {
      version: 2,
      size: { width: 12_192_000, height: 6_858_000 },
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        {
          id: 'group-1',
          type: 'group',
          transform: { x: 274320, y: 822960, width: 0, height: 0, rotation: 0, flipH: false, flipV: false },
          childExtent: { width: 8_229_600, height: 2_743_200 },
          zIndex: 1,
          children: [
            {
              id: 'channel-1',
              type: 'text',
              transform: { x: 0, y: 0, width: 4_000_000, height: 365_760, rotation: 0, flipH: false, flipV: false },
              zIndex: 1,
              paragraphs: [
                {
                  text: 'Channel 1',
                  level: 0,
                  runs: [{ text: 'Channel 1', style: { sz: 1800 } }],
                  style: {},
                },
              ],
            },
          ],
        },
      ],
    };

    render(<SlideRenderer content={content as any} title="Grouped slide" />);
    expect(document.getElementById('channel-1')?.textContent).toContain('Channel 1');
    expect(screen.queryByTestId('classroom-visual-error')).toBeNull();
  });
});
