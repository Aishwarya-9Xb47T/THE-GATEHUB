import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OriginalPresentationViewer, clearClassroomPptxBufferCache } from "./OriginalPresentationViewer";
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
  });

  it("embeds public Google Slides without fetching the PPTX", async () => {
    render(
      <OriginalPresentationViewer
        presentationId="pres-g"
        slideNumber={3}
        sourceType="google_slides"
        sourceUrl="https://docs.google.com/presentation/d/abc123/edit"
        visualSource="google_embed"
      />,
    );
    const iframe = await screen.findByTestId("classroom-google-embed");
    expect(iframe.getAttribute("src")).toContain("/presentation/d/abc123/embed");
    expect(iframe.getAttribute("src")).toContain("slide=3");
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
});
