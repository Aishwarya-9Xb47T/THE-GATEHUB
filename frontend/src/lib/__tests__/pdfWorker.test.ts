import { describe, it, expect, beforeEach } from "vitest";

// Polyfill DOMMatrix at file-level for Node test runner before importing pdfjs
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-ignore
  globalThis.DOMMatrix = class DOMMatrix {};
}

describe("PDF.js Worker Configuration", () => {
  it("unconditionally overrides React-PDF dummy worker string 'pdf.worker.mjs'", async () => {
    const { pdfjs } = await import("react-pdf");
    const { setupPdfWorker } = await import("../pdfWorker");

    // Simulate react-pdf's default behavior of setting workerSrc = 'pdf.worker.mjs'
    pdfjs.GlobalWorkerOptions.workerSrc = "pdf.worker.mjs";
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("pdf.worker.mjs");

    const assignedUrl = setupPdfWorker();

    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toBe("pdf.worker.mjs");
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(assignedUrl);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain("pdf.worker.min.mjs");
  });

  it("assigns a non-empty string as workerSrc in browser environment", async () => {
    const { pdfjs } = await import("react-pdf");
    const { setupPdfWorker } = await import("../pdfWorker");

    setupPdfWorker();
    expect(typeof pdfjs.GlobalWorkerOptions.workerSrc).toBe("string");
    expect(pdfjs.GlobalWorkerOptions.workerSrc.length).toBeGreaterThan(0);
  });
});
