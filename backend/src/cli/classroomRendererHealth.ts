/**
 * Production-container LibreOffice renderer health check.
 *   npx tsx src/cli/classroomRendererHealth.ts
 *   node dist/cli/classroomRendererHealth.js
 */
import assert from 'node:assert/strict';
import {
  CONVOLUTION_DECK_SLIDE_COUNT,
  CONVOLUTION_REQUIRED_PDF_STRINGS,
  buildConvolutionDeckPptx,
} from '../services/classroomStudio/convolutionDeckFixture.js';
import {
  describeLibreOfficeRuntime,
  describeLibreOfficeTools,
  runLibreOfficeRendererSmoke,
} from '../services/classroomStudio/presentationLibreOfficeRender.js';

async function main() {
  const runtime = await describeLibreOfficeRuntime();
  console.info('[CLASSROOM_RENDER] health_runtime', runtime);
  const tools = describeLibreOfficeTools();
  if (!tools.soffice) {
    console.error('LIBREOFFICE_UNAVAILABLE soffice is not installed');
    process.exit(1);
  }
  if (!tools.pdftoppm && !tools.pdftocairo) {
    console.error('PDF_RENDER_FAILED poppler-utils is not installed');
    process.exit(1);
  }

  const pptx = await buildConvolutionDeckPptx();
  const smoke = await runLibreOfficeRendererSmoke(pptx);
  console.info('[CLASSROOM_RENDER] health_smoke', {
    ok: smoke.ok,
    inputSha256: smoke.inputSha256,
    pdfPages: smoke.pdfPages,
    pdfBytes: smoke.pdfBytes,
    renderedSlides: smoke.renderedSlides,
    pngCount: smoke.pngCount,
    errors: smoke.errors,
  });
  assert.equal(smoke.ok, true, smoke.reason || 'renderer smoke failed');
  assert.equal(smoke.pdfPages, CONVOLUTION_DECK_SLIDE_COUNT, `expected ${CONVOLUTION_DECK_SLIDE_COUNT} PDF pages`);
  assert.equal(smoke.renderedSlides, CONVOLUTION_DECK_SLIDE_COUNT, `expected ${CONVOLUTION_DECK_SLIDE_COUNT} rendered slides`);
  assert.equal(smoke.pngCount, CONVOLUTION_DECK_SLIDE_COUNT, `expected ${CONVOLUTION_DECK_SLIDE_COUNT} PNG files`);
  const normalized = smoke.pdfText.replace(/\s+/g, ' ');
  const missing = CONVOLUTION_REQUIRED_PDF_STRINGS.filter((value) => !normalized.includes(value));
  if (missing.length) {
    console.warn('[CLASSROOM_RENDER] pdf_text_missing', { missing, sample: normalized.slice(0, 800) });
  }
  assert.ok(missing.length === 0, `PDF missing required content: ${missing.join(', ')}`);
  console.info('CLASSROOM RENDERER HEALTH: PASS');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
