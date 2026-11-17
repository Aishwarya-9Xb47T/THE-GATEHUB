import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PptViewerPage } from "../PptViewerPage";
import * as pptApi from "@/lib/pptLibrary/api";

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as any;

// Mock URL.createObjectURL and revokeObjectURL for jsdom
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:https://thegatehub.com/mock-pdf-url");
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = vi.fn();
}

// Spies for renderer calls
const mockRenderSlideSvg = vi.fn((index: number) => `<svg viewBox="0 0 960 540" data-slide="${index}"><text>Slide ${index + 1}</text></svg>`);
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockLoadPptx = vi.fn().mockResolvedValue({ slideCount: 5 });

vi.mock("pptx-svg", () => ({
  PptxRenderer: vi.fn().mockImplementation(() => ({
    init: mockInit,
    loadPptx: mockLoadPptx,
    renderSlideSvg: mockRenderSlideSvg,
  })),
}));

vi.mock("pptx-svg/wasm?url", () => ({ default: "/mock-pptx.wasm" }));

// Mock react-pdf Document and Page
vi.mock("react-pdf", () => ({
  Document: ({ children, onLoadSuccess }: any) => {
    React.useEffect(() => {
      onLoadSuccess?.({ numPages: 10 });
    }, [onLoadSuccess]);
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber, width, onLoadSuccess }: any) => {
    React.useEffect(() => {
      onLoadSuccess?.({
        getViewport: () => ({ width: 960, height: 540 }),
      });
    }, [onLoadSuccess, pageNumber]);
    return (
      <div data-testid={`pdf-page-${pageNumber}`} data-width={width}>
        <span>Page {pageNumber} Content</span>
      </div>
    );
  },
  pdfjs: { GlobalWorkerOptions: {} },
  PasswordResponses: { INCORRECT_PASSWORD: 1, NEED_PASSWORD: 2 },
}));

const mockPptxResource = {
  id: "test-pptx-id",
  title: "Team 3 Presentation",
  description: "Ayurmitra project slides",
  topicId: "topic-1",
  subtopicId: "sub-1",
  instructorId: "inst-1",
  originalFileName: "presentation.pptx",
  fileType: "pptx",
  storageKey: "/uploads/presentation.pptx",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  fileSize: 2048000,
  thumbnailUrl: null,
  status: "published",
  language: "en",
  tags: ["ai", "nlp"],
  academicLevel: "Undergraduate",
  slideCount: 5,
  pageCount: null,
  downloadCount: 3,
  viewCount: 12,
  createdAt: new Date().toISOString(),
  topic: { id: "topic-1", name: "AI", slug: "ai" },
  subtopic: { id: "sub-1", name: "NLP", slug: "nlp" },
  instructor: { id: "inst-1", firstName: "N", lastName: "Aish", avatar: null, designation: "Instructor" },
};

const mockPdfResource = {
  ...mockPptxResource,
  id: "test-pdf-id",
  title: "AyurMitra RVU Document",
  originalFileName: "document.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  slideCount: null,
  pageCount: 10,
};

describe("PptViewerPage Navigation Performance & Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/preview")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...new Array(100).fill(0)]).buffer, // %PDF-1.4 >64 bytes
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      });
    }) as any;
  });

  describe("PPT/PPTX Slide Navigation & In-Memory Caching", () => {
    it("renders slide 1 immediately, preheats adjacent slides, and reuses cached slides without re-parsing", async () => {
      vi.spyOn(pptApi, "fetchResourceDetail").mockResolvedValue(mockPptxResource as any);

      render(
        <MemoryRouter initialEntries={["/ppt-library/test-pptx-id/view"]}>
          <Routes>
            <Route path="/ppt-library/:pptId/view" element={<PptViewerPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for deck to load
      await waitFor(() => {
        expect(screen.getByText("Slide 1 of 5")).toBeTruthy();
      });

      // Verify slide 0 was rendered
      expect(mockRenderSlideSvg).toHaveBeenCalledWith(0);
      const initialCallCountForSlide0 = mockRenderSlideSvg.mock.calls.filter(([arg]) => arg === 0).length;
      expect(initialCallCountForSlide0).toBe(1);

      // Navigate to Slide 2 using Next button
      const nextBtn = screen.getByRole("button", { name: /Next Slide/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Slide 2 of 5")).toBeTruthy();
      });

      // Navigate back to Slide 1 using Previous button
      const prevBtn = screen.getByRole("button", { name: /Previous Slide/i });
      fireEvent.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByText("Slide 1 of 5")).toBeTruthy();
      });

      // CRITICAL PERFORMANCE ASSERTION:
      // Navigating backwards to Slide 1 must reuse the in-memory cache without re-invoking renderSlideSvg(0)!
      const finalCallCountForSlide0 = mockRenderSlideSvg.mock.calls.filter(([arg]) => arg === 0).length;
      expect(finalCallCountForSlide0).toBe(1);
    });

    it("preserves manual zoom level when navigating between slides", async () => {
      vi.spyOn(pptApi, "fetchResourceDetail").mockResolvedValue(mockPptxResource as any);

      render(
        <MemoryRouter initialEntries={["/ppt-library/test-pptx-id/view"]}>
          <Routes>
            <Route path="/ppt-library/:pptId/view" element={<PptViewerPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Slide 1 of 5")).toBeTruthy();
      });

      // Zoom in: click Zoom In twice (+15% each -> 130%)
      const zoomInBtn = screen.getByTitle("Zoom In");
      fireEvent.click(zoomInBtn);
      fireEvent.click(zoomInBtn);

      await waitFor(() => {
        expect(screen.getByText("130%")).toBeTruthy();
      });

      // Navigate to Slide 2
      const nextBtn = screen.getByRole("button", { name: /Next Slide/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Slide 2 of 5")).toBeTruthy();
      });

      // Zoom level must still be 130% (preserved across slides, not reset to Fit)
      expect(screen.getByText("130%")).toBeTruthy();
    });
  });

  describe("PDF Windowed Pre-Rendering & Instant Page Navigation", () => {
    it("maintains a bounded adjacent window of preloaded pages and toggles visibility instantaneously", async () => {
      vi.spyOn(pptApi, "fetchResourceDetail").mockResolvedValue(mockPdfResource as any);

      render(
        <MemoryRouter initialEntries={["/ppt-library/test-pdf-id/view"]}>
          <Routes>
            <Route path="/ppt-library/:pptId/view" element={<PptViewerPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for PDF document to load
      await waitFor(() => {
        expect(screen.getByText("Page 1 of 10")).toBeTruthy();
      });

      // In Single Mode on Page 1:
      // Page 1 is active (opacity: 1), Page 2 is preloaded in the background (opacity: 0)
      const page1Container = screen.getByTestId("pdf-page-1").parentElement!;
      const page2Container = screen.getByTestId("pdf-page-2").parentElement!;
      expect(page1Container.style.opacity).toBe("1");
      expect(page1Container.style.position).toBe("relative");
      expect(page2Container.style.opacity).toBe("0");
      expect(page2Container.style.position).toBe("absolute");

      // Page 3 is not yet mounted (outside window [1, 2])
      expect(screen.queryByTestId("pdf-page-3")).toBeNull();

      // Navigate to Page 2
      const nextBtn = screen.getByRole("button", { name: /Next Page/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Page 2 of 10")).toBeTruthy();
      });

      // Now Page 2 is active, Page 1 is cached in background, and Page 3 is mounted for preloading
      expect(screen.getByTestId("pdf-page-2").parentElement!.style.opacity).toBe("1");
      expect(screen.getByTestId("pdf-page-2").parentElement!.style.position).toBe("relative");
      expect(screen.getByTestId("pdf-page-1").parentElement!.style.opacity).toBe("0");
      expect(screen.getByTestId("pdf-page-1").parentElement!.style.position).toBe("absolute");
      expect(screen.getByTestId("pdf-page-3")).toBeTruthy();

      // Navigate to Page 3
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Page 3 of 10")).toBeTruthy();
      });

      // MEMORY BOUNDING: Page 1 is now outside the window [2, 3, 4] and is unmounted
      expect(screen.queryByTestId("pdf-page-1")).toBeNull();
      expect(screen.getByTestId("pdf-page-2")).toBeTruthy();
      expect(screen.getByTestId("pdf-page-3").parentElement!.style.opacity).toBe("1");
      expect(screen.getByTestId("pdf-page-4")).toBeTruthy();
    });

    it("preserves zoom setting when navigating between PDF pages", async () => {
      vi.spyOn(pptApi, "fetchResourceDetail").mockResolvedValue(mockPdfResource as any);

      render(
        <MemoryRouter initialEntries={["/ppt-library/test-pdf-id/view"]}>
          <Routes>
            <Route path="/ppt-library/:pptId/view" element={<PptViewerPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Page 1 of 10")).toBeTruthy();
      });

      // Zoom in
      const zoomInBtn = screen.getByTitle("Zoom In");
      fireEvent.click(zoomInBtn);

      await waitFor(() => {
        expect(screen.getByText("115%")).toBeTruthy();
      });

      // Navigate to next page
      const nextBtn = screen.getByRole("button", { name: /Next Page/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Page 2 of 10")).toBeTruthy();
      });

      // Zoom level must be retained
      expect(screen.getByText("115%")).toBeTruthy();
    });
  });
});
