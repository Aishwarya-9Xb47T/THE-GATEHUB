import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OriginalPresentationViewer, clearClassroomPptxBufferCache, prepareSlideSvg, fitSlideToStage } from "./OriginalPresentationViewer";
import { fetchAuthenticatedUpload } from "@/lib/courseMediaUrls";

vi.mock("pptx-svg", () => ({
  PptxRenderer: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    loadPptx: vi.fn().mockResolvedValue({ slideCount: 11 }),
    renderSlideSvg: vi.fn((index: number) => `<svg data-slide="${index + 1}"></svg>`),
  })),
}));
vi.mock("pptx-svg/wasm?url", () => ({ default: "/mock-pptx.wasm" }));
vi.mock("@/lib/courseMediaUrls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/courseMediaUrls")>();
  return {
    ...actual,
    fetchAuthenticatedUpload: vi.fn(),
  };
});

const mockedFetch = vi.mocked(fetchAuthenticatedUpload);

function pptxResponse() {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => name.toLowerCase() === "content-type"
        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        : name.toLowerCase() === "content-length" ? "8" : null,
    },
    arrayBuffer: async () => Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer,
  };
}

function htmlResponse() {
  const encoded = new TextEncoder().encode("<html>login</html>");
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => name.toLowerCase() === "content-type" ? "text/html" : null },
    arrayBuffer: async () => encoded.buffer,
  };
}

function missingResponse() {
  return {
    ok: false,
    status: 404,
    headers: { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null },
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ error: { code: "ORIGINAL_PPTX_UNAVAILABLE" } })).buffer,
  };
}

function svgResponse() {
  const encoded = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => name.toLowerCase() === "content-type" ? "image/svg+xml" : null },
    arrayBuffer: async () => encoded.buffer,
  };
}

describe("OriginalPresentationViewer", () => {
  beforeEach(() => {
    clearClassroomPptxBufferCache();
    mockedFetch.mockReset();
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it("embeds public Google Slides without fetching the PPTX", async () => {
    const { rerender } = render(
      <OriginalPresentationViewer
        presentationId="pres-g"
        slideNumber={1}
        sourceType="google_slides"
        sourceUrl="https://docs.google.com/presentation/d/abc123/edit"
        visualSource="google_embed"
      />,
    );
    let iframe = await screen.findByTestId("classroom-google-embed");
    expect(iframe.getAttribute("src")).toContain("/presentation/d/abc123/embed");
    expect(iframe.getAttribute("src")).toContain("slide=1");
    expect(iframe.getAttribute("src")).not.toContain("rm=minimal");
    expect(iframe.getAttribute("data-visual-source")).toBe("google_embed");
    expect(mockedFetch).not.toHaveBeenCalled();

    rerender(
      <OriginalPresentationViewer
        presentationId="pres-g"
        slideNumber={2}
        sourceType="google_slides"
        sourceUrl="https://docs.google.com/presentation/d/abc123/edit"
        visualSource="google_embed"
      />,
    );
    iframe = await screen.findByTestId("classroom-google-embed");
    expect(iframe.getAttribute("src")).toContain("slide=2");
    expect(iframe.getAttribute("src")).toContain("/presentation/d/abc123/embed");

    rerender(
      <OriginalPresentationViewer
        presentationId="pres-g"
        slideNumber={10}
        sourceType="google_slides"
        sourceUrl="https://docs.google.com/presentation/d/abc123/edit"
        visualSource="google_embed"
      />,
    );
    iframe = await screen.findByTestId("classroom-google-embed");
    expect(iframe.getAttribute("src")).toContain("slide=10");
    expect(iframe.getAttribute("src")).toContain("/presentation/d/abc123/embed");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("does not fall back to PPTX when a public Google iframe reports an error", async () => {
    render(
      <OriginalPresentationViewer
        presentationId="pres-g"
        slideNumber={1}
        sourceType="google_slides"
        sourceUrl="https://docs.google.com/presentation/d/abc123/edit"
        visualSource="google_embed"
      />,
    );
    const iframe = await screen.findByTestId("classroom-google-embed");
    iframe.dispatchEvent(new Event("error"));
    expect(screen.getByTestId("classroom-google-embed")).toBeTruthy();
    expect(screen.queryByTestId("classroom-original-pptx")).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("loads a PPTX once and reuses it for later slides", async () => {
    mockedFetch.mockResolvedValue(pptxResponse() as never);
    const { rerender } = render(
      <OriginalPresentationViewer presentationId="pres-a" slideNumber={1} sourceType="powerpoint" />,
    );
    expect(await screen.findByTestId("classroom-original-pptx")).toBeTruthy();
    rerender(<OriginalPresentationViewer presentationId="pres-a" slideNumber={5} sourceType="powerpoint" />);
    await waitFor(() => expect(document.querySelector('svg[data-slide="5"]')).toBeTruthy());
    const pptxCalls = mockedFetch.mock.calls.filter(([url]) => String(url).includes("original.pptx"));
    expect(pptxCalls).toHaveLength(1);
  });

  it("falls back to the visual cache when the original PPTX is missing", async () => {
    mockedFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("original.pptx")) return missingResponse() as never;
      if (String(url).includes("visuals/2.svg")) return svgResponse() as never;
      return missingResponse() as never;
    });
    render(
      <OriginalPresentationViewer presentationId="pres-missing" slideNumber={2} sourceType="powerpoint" />,
    );
    expect(await screen.findByTestId("classroom-original-pptx")).toBeTruthy();
    expect(screen.queryByText(/ORIGINAL_PPTX_UNAVAILABLE/)).toBeNull();
  });

  it("rejects an HTML 200 as an invalid PPTX response", async () => {
    mockedFetch.mockResolvedValue(htmlResponse() as never);
    render(
      <OriginalPresentationViewer presentationId="pres-html" slideNumber={1} sourceType="powerpoint" />,
    );
    const error = await screen.findByTestId("classroom-visual-error");
    expect(error.textContent).toContain("ORIGINAL_PPTX_INVALID_RESPONSE");
  });

  it("does not reuse presentation A when opening presentation B", async () => {
    mockedFetch.mockResolvedValue(pptxResponse() as never);
    const { rerender } = render(
      <OriginalPresentationViewer presentationId="pres-a" slideNumber={1} sourceType="powerpoint" />,
    );
    await screen.findByTestId("classroom-original-pptx");
    rerender(<OriginalPresentationViewer presentationId="pres-b" slideNumber={1} sourceType="powerpoint" />);
    await waitFor(() => {
      const pptxCalls = mockedFetch.mock.calls.filter(([url]) => String(url).includes("original.pptx"));
      expect(pptxCalls.some((call) => String(call[0]).includes("pres-b"))).toBe(true);
    });
  });

  it("injects viewBox and strips fixed width/height so slides scale responsively", () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" style="background:#000"><rect width="960" height="540" fill="#000"/></svg>';
    const prepared = prepareSlideSvg(rawSvg);
    expect(prepared.width).toBe(960);
    expect(prepared.height).toBe(540);
    expect(prepared.aspectRatio).toBeCloseTo(16 / 9);
    expect(prepared.markup).toContain('viewBox="0 0 960 540"');
    expect(prepared.markup).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(prepared.markup).not.toMatch(/<svg[^>]*\bwidth="960"/);
    expect(prepared.markup).not.toMatch(/<svg[^>]*\bheight="540"/);
    expect(prepared.markup).toContain('width:100%');
    expect(prepared.markup).toContain('height:100%');
    expect(prepared.markup).toContain('position:absolute');
    expect(prepared.markup).not.toContain('max-width:100%');
  });

  it("handles 4:3 slide dimensions correctly", () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720"><rect width="960" height="720"/></svg>';
    const prepared = prepareSlideSvg(rawSvg);
    expect(prepared.width).toBe(960);
    expect(prepared.height).toBe(720);
    expect(prepared.aspectRatio).toBeCloseTo(4 / 3);
    expect(prepared.markup).toContain('viewBox="0 0 960 720"');
  });

  it("extracts dimensions from data-ooxml-slide-cx/cy when width/height are absent", () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-ooxml-slide-cx="9144000" data-ooxml-slide-cy="5143500"><g></g></svg>';
    const prepared = prepareSlideSvg(rawSvg);
    expect(prepared.width).toBeCloseTo(960);
    expect(prepared.height).toBeCloseTo(540);
    expect(prepared.markup).toContain('viewBox="0 0 960 540"');
  });

  it("does not overwrite pptx-svg drawing size with EMU/9525", () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" data-ooxml-slide-cx="12192000" data-ooxml-slide-cy="6858000" data-ooxml-scale="12700"><rect width="960" height="540"/></svg>';
    const prepared = prepareSlideSvg(rawSvg);
    expect(prepared.width).toBe(960);
    expect(prepared.height).toBe(540);
    expect(prepared.aspectRatio).toBeCloseTo(16 / 9);
    expect(prepared.markup).toContain('viewBox="0 0 960 540"');
    expect(prepared.markup).not.toContain('viewBox="0 0 1280');
  });

  it("uses data-ooxml-scale when width/height are missing", () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-ooxml-slide-cx="12192000" data-ooxml-slide-cy="6858000" data-ooxml-scale="12700"><g></g></svg>';
    const prepared = prepareSlideSvg(rawSvg);
    expect(prepared.width).toBeCloseTo(960);
    expect(prepared.height).toBeCloseTo(540);
    expect(prepared.markup).toContain('viewBox="0 0 960 540"');
  });

  it("fits a 16:9 slide to a wide stage using full height", () => {
    const box = fitSlideToStage(1600, 700, 16 / 9);
    expect(box.height).toBe(700);
    expect(box.width).toBe(Math.floor(700 * (16 / 9)));
    expect(box.offsetY).toBe(0);
    expect(box.offsetX).toBeGreaterThan(0);
  });

  it("fits a 16:9 slide to a tall stage using full width", () => {
    const box = fitSlideToStage(1000, 900, 16 / 9);
    expect(box.width).toBe(1000);
    expect(box.height).toBe(Math.floor(1000 / (16 / 9)));
    expect(box.offsetX).toBe(0);
    expect(box.offsetY).toBeGreaterThan(0);
  });
});

