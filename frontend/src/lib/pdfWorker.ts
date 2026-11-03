import { pdfjs } from "react-pdf";

/**
 * Single Source of Truth for PDF.js Worker Configuration
 *
 * Ensures the Worker version strictly matches the API version (5.4.296)
 * from the exact same installed pdfjs-dist package.
 *
 * Vite resolves `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`
 * at build time and emits a content-hashed worker asset bundled directly with the application,
 * eliminating version drift, CDN failures, or cross-origin restrictions.
 */
export function setupPdfWorker(): void {
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
}

// Auto-initialize when this module is imported
setupPdfWorker();

