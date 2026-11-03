import { pdfjs } from "react-pdf";

/**
 * Single Source of Truth for PDF.js Worker Configuration
 *
 * Ensures the Worker version strictly matches the API version (5.4.296)
 * from the exact same installed pdfjs-dist package.
 *
 * react-pdf initializes GlobalWorkerOptions.workerSrc to the bare specifier 'pdf.worker.mjs'.
 * We unconditionally override it with Vite's bundled, content-hashed worker asset URL
 * so the browser loads the real worker file from /assets/ instead of attempting
 * to resolve bare 'pdf.worker.mjs'.
 */
export function setupPdfWorker(): string {
  if (typeof window !== "undefined") {
    const workerUrl = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return workerUrl;
  }
  return "";
}

// Auto-initialize immediately when this module is imported
setupPdfWorker();
