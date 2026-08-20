#!/usr/bin/env npx tsx
/**
 * Fail-loud PPTX classroom render diagnostic.
 *
 * Usage:
 *   npx tsx scripts/test-classroom-pptx-render.ts
 *   npx tsx scripts/test-classroom-pptx-render.ts "Unit-2 Discussion.pptx"
 *
 * Runs the SAME LibreOffice PDF pipeline used by Google Slides and uploaded PPTX
 * after source acquisition. Exits non-zero on any silent-looking failure.
 */
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CONVOLUTION_DECK_SLIDE_COUNT,
  buildConvolutionDeckPptx,
} from "../src/services/classroomStudio/convolutionDeckFixture.js";
import { validatePptxSource } from "../src/services/classroomStudio/pptxArchiveInspect.js";
import {
  describeLibreOfficeRuntime,
  describeLibreOfficeTools,
  renderPresentationSlidesLibreOffice,
} from "../src/services/classroomStudio/presentationLibreOfficeRender.js";

function fail(message: string): never {
  console.error(`[PPTX_DIAGNOSTIC] FAIL ${message}`);
  process.exit(1);
}

async function main() {
  const inputPath = process.argv[2];
  let pptx: Buffer;
  let sourceLabel = "convolution-fixture";
  if (inputPath) {
    const resolved = path.resolve(inputPath);
    pptx = await readFile(resolved);
    sourceLabel = resolved;
  } else {
    pptx = await buildConvolutionDeckPptx();
  }

  const originalBytes = pptx.length;
  const validation = await validatePptxSource(pptx, { maxSlideInspect: 11 });
  console.info("[PPTX_DIAGNOSTIC]", {
    source: sourceLabel,
    sourceType: "powerpoint",
    originalBytes,
    storedBytes: originalBytes,
    downloadedBytes: originalBytes,
    localBytes: originalBytes,
    pptxValid: validation.valid,
    zipValid: validation.zipValid,
    hasContentTypes: validation.hasContentTypes,
    hasPresentationXml: validation.hasPresentationXml,
    slideCount: validation.slideCount,
    reasons: validation.reasons,
  });
  if (!validation.valid) fail(`PPTX invalid: ${validation.reasons.join("; ")}`);
  if (inputPath && validation.slideCount !== 11) {
    console.warn(`[PPTX_DIAGNOSTIC] expected 11 slides, found ${validation.slideCount}`);
  }
  if (!inputPath && validation.slideCount !== CONVOLUTION_DECK_SLIDE_COUNT) {
    fail(`fixture slideCount=${validation.slideCount} expected=${CONVOLUTION_DECK_SLIDE_COUNT}`);
  }

  const tools = describeLibreOfficeTools();
  const runtime = await describeLibreOfficeRuntime();
  console.info("[PPTX_DIAGNOSTIC] libreoffice", {
    soffice: tools.soffice,
    pdftoppm: tools.pdftoppm,
    pdftocairo: tools.pdftocairo,
    javaldx: tools.javaldx,
    runtime: runtime.sofficeVersion,
  });
  if (!tools.soffice || !(tools.pdftoppm || tools.pdftocairo)) {
    fail("LibreOffice/poppler unavailable in this environment");
  }

  const outputDir = path.join(os.tmpdir(), `classroom-pptx-diagnostic-${Date.now()}`);
  const isolatedA = path.join(os.tmpdir(), "classroom-render", "diag-a", "job-a");
  const isolatedB = path.join(os.tmpdir(), "classroom-render", "diag-b", "job-b");
  if (isolatedA === isolatedB) fail("concurrent render directories collided");
  await mkdir(outputDir, { recursive: true });
  try {
    const started = Date.now();
    const result = await renderPresentationSlidesLibreOffice(pptx, outputDir, {
      presentationId: "pptx-diagnostic",
    });
    const durationMs = Date.now() - started;
    const expected = validation.slideCount;
    const slideFlags: Record<string, boolean> = {};
    for (let i = 1; i <= expected; i += 1) {
      slideFlags[`slide${i}RenderCompleted`] = result.renders.some((render) => render.index === i - 1);
    }
    console.info("[PPTX_DIAGNOSTIC]", {
      presentationId: "pptx-diagnostic",
      sourceType: "powerpoint",
      originalBytes,
      storedBytes: originalBytes,
      downloadedBytes: originalBytes,
      localBytes: originalBytes,
      pptxValid: true,
      slideCount: `${result.slideCount}/${expected}`,
      libreofficeStarted: true,
      libreofficeExitCode: result.success ? 0 : 1,
      pdfExists: (result.pdfBytes ?? 0) > 0,
      pdfBytes: result.pdfBytes ?? 0,
      pdfPages: result.slideCount,
      slide1RenderStarted: expected >= 1,
      ...slideFlags,
      overallRenderStatus: result.success ? "completed" : "failed",
      durationMs,
      errors: result.errors,
      outputDir,
    });
    if (!result.success) fail(result.errors[0] || "render failed");
    if (result.slideCount !== expected) fail(`pdfPages=${result.slideCount} expected=${expected}`);
    if (result.renders.length !== expected) fail(`rendered=${result.renders.length} expected=${expected}`);
    for (let i = 1; i <= expected; i += 1) {
      const file = path.join(outputDir, `slide-${String(i).padStart(3, "0")}.svg`);
      const info = await stat(file).catch(() => null);
      if (!info || info.size < 8_000) fail(`slide ${i} visual missing or too small`);
    }
    console.info("[PPTX_DIAGNOSTIC] PASS");
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
