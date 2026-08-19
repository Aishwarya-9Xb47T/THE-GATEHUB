import { describe, expect, it } from "@jest/globals";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONVOLUTION_DECK_SLIDE_COUNT,
  CONVOLUTION_REQUIRED_PDF_STRINGS,
  buildConvolutionDeckPptx,
} from "../convolutionDeckFixture.js";
import {
  describeLibreOfficeTools,
  renderPresentationSlidesLibreOffice,
} from "../presentationLibreOfficeRender.js";
import { inspectPptxArchive } from "../pptxArchiveInspect.js";

const tools = describeLibreOfficeTools();
const canConvert = Boolean(tools.soffice && (tools.pdftoppm || tools.pdftocairo));

describe("LibreOffice PPTX to PNG conversion", () => {
  it("converts the 11-slide convolution deck and keeps matrix text", async () => {
    if (!canConvert) {
      console.warn("Skipping live LibreOffice conversion: soffice/poppler not installed on this machine");
      return;
    }
    const pptx = await buildConvolutionDeckPptx();
    const inspection = await inspectPptxArchive(pptx);
    expect(inspection.slideCount).toBe(CONVOLUTION_DECK_SLIDE_COUNT);
    const dir = await mkdtemp(path.join(os.tmpdir(), "lo-conv-"));
    try {
      const result = await renderPresentationSlidesLibreOffice(pptx, dir, {
        presentationId: "convolution-live",
      });
      expect(result.method).toBe("libreoffice-pdf");
      expect(result.success).toBe(true);
      expect(result.slideCount).toBe(CONVOLUTION_DECK_SLIDE_COUNT);
      expect(result.renders).toHaveLength(CONVOLUTION_DECK_SLIDE_COUNT);
      const normalized = (result.pdfText || "").replace(/\s+/g, " ");
      const missing = CONVOLUTION_REQUIRED_PDF_STRINGS.filter((value) => !normalized.includes(value));
      expect(missing).toEqual([]);
      const png = await readFile(path.join(dir, "slide-001.png"));
    expect(png.length).toBeGreaterThan(8_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it("converts a second real PPTX from the test corpus", async () => {
    if (!canConvert) return;
    const candidates = [
      path.join(process.cwd(), "test-corpus", "ai_deep_learning.pptx"),
      path.join(process.cwd(), "backend", "test-corpus", "ai_deep_learning.pptx"),
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../backend/test-corpus/ai_deep_learning.pptx"),
    ];
    const pptxPath = candidates.find((candidate) => existsSync(candidate));
    if (!existsSync(pptxPath)) {
      console.warn("Skipping second PPTX: test-corpus/ai_deep_learning.pptx not found");
      return;
    }
    const pptx = await readFile(pptxPath);
    const inspection = await inspectPptxArchive(pptx);
    expect(inspection.zipValid).toBe(true);
    expect(inspection.slideCount).toBeGreaterThan(0);
    const dir = await mkdtemp(path.join(os.tmpdir(), "lo-second-"));
    try {
      const result = await renderPresentationSlidesLibreOffice(pptx, dir, {
        presentationId: "second-pptx",
        maxSlides: Math.min(inspection.slideCount, 11),
      });
      expect(result.success).toBe(true);
      expect(result.renders.length).toBeGreaterThan(0);
      expect(result.renders[0].svgLength).toBeGreaterThan(8_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
