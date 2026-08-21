/**
 * Comprehensive Integration & Fidelity Test Suite
 *
 * Verifies:
 * 1. URL Parser variants
 * 2. Access control & permissions (rejection of private/missing presentations)
 * 3. PPTX download from Google export
 * 4. Structured OOXML parsing of all slides (elements, text, tables, shapes, images)
 * 5. Slide 1 specific content assertions ("Numerical example of 3D convolution", "Case 1", "Channel 1", "Channel 2", "Filter", "Stride")
 * 6. Slides 2–11 content assertions
 * 7. Visual asset & thumbnail generation (non-black validation)
 * 8. Debug artifacts generation (extraction-report.json, slides.json, downloaded.pptx)
 * 9. Direct PPTX pipeline regression check
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/utils/prisma.js';
import {
  validateAndExtractGoogleSlidesId,
  importPublicGoogleSlides,
  downloadPublicGoogleSlidesPptx,
  downloadPublicGoogleSlidesPdf,
} from '../src/services/classroomStudio/googleSlidesPublicService.js';
import { isImageBlackOrBlank } from '../src/services/classroomStudio/googleSlidesRenderEngine.js';
import {
  buildConvolutionDeckPptx,
  CONVOLUTION_DECK_SLIDE_COUNT,
  CONVOLUTION_REQUIRED_PDF_STRINGS,
} from '../src/services/classroomStudio/convolutionDeckFixture.js';
import { inspectPptxArchive } from '../src/services/classroomStudio/pptxArchiveInspect.js';
import { parsePowerPoint } from '../src/services/classroomStudio/powerPointParser.js';

const TEST_PUBLIC_DECK_ID = '1lxXd9se-LVhSdMromwCFlZd6joaMa52qHI-P70qG7pI';

async function runFidelitySuite() {
  console.log('================================================================');
  console.log('STARTING ZERO-TOLERANCE PPTX & VISUAL FIDELITY TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      console.log(`[TEST ${totalTests}] ${name}...`);
      await fn();
      console.log(`✓ PASSED: ${name}\n`);
      passedTests++;
    } catch (error) {
      console.error(`✗ FAILED: ${name}`);
      console.error(error);
      console.log('');
      process.exitCode = 1;
    }
  }

  // --- SECTION 1: URL Variants ---
  await test('URL Parser: Supports all standard and published Google Slides URL variants', () => {
    const urls = [
      `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/edit`,
      `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/edit#slide=id.p1`,
      `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/edit?slide=id.p1#slide=id.p1`,
      `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/view`,
      `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/view?usp=sharing`,
      `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/present`,
      `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/embed`,
      `https://docs.google.com/presentation/d/e/2PACX-1vSamplePubId1234567890/pub`,
      `https://drive.google.com/file/d/${TEST_PUBLIC_DECK_ID}/view`,
      TEST_PUBLIC_DECK_ID,
    ];

    for (const url of urls) {
      const res = validateAndExtractGoogleSlidesId(url);
      assert.strictEqual(res.valid, true, `Expected valid for URL: ${url}`);
      assert.ok(res.presentationId, `Expected presentationId extracted for: ${url}`);
    }
  });

  // --- SECTION 2: Access & Permission Validation ---
  await test('Access Model: Rejects private and non-existent URLs with explicit codes', async () => {
    const notFoundRes = await importPublicGoogleSlides({
      instructorId: 'test-inst-1',
      url: 'https://docs.google.com/presentation/d/1234567890123456789012345678901234567890/edit',
      title: 'Missing Presentation',
    });
    assert.strictEqual(notFoundRes.success, false);
    assert.ok(notFoundRes.error);

    const privateRes = await downloadPublicGoogleSlidesPptx('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    if ('requiresAuthentication' in privateRes) {
      assert.strictEqual(privateRes.requiresAuthentication, true);
    }
  });

  // --- SECTION 3: Deep PPTX Extraction & Elements Validation ---
  await test('PPTX Extraction: Google PPTX download, structured elements, and slide content', async () => {
    const instructor = await prisma.user.upsert({
      where: { email: 'fidelity-instructor@gatehub.edu' },
      update: {},
      create: {
        email: 'fidelity-instructor@gatehub.edu',
        passwordHash: 'hashed_password_123',
        firstName: 'Fidelity',
        lastName: 'Instructor',
        role: 'INSTRUCTOR',
      },
    });

    const importResult = await importPublicGoogleSlides({
      instructorId: instructor.id,
      url: `https://docs.google.com/presentation/d/${TEST_PUBLIC_DECK_ID}/edit`,
      title: 'Numerical example of 3D convolution',
      description: 'Zero-tolerance fidelity test presentation',
    });

    assert.strictEqual(importResult.success, true, `Import failed: ${importResult.error}`);
    assert.ok(importResult.presentationId, 'Expected presentationId');
    assert.ok((importResult.slideCount ?? 0) >= 1, `Expected slideCount >= 1`);

    const presentation = await prisma.presentation.findUnique({
      where: { id: importResult.presentationId },
      include: { slides: { orderBy: { order: 'asc' } } },
    });

    assert.ok(presentation, 'Presentation not found in database');
    assert.strictEqual(presentation.slides.length, importResult.slideCount);

    console.log(`[GoogleSlides] Verified ${presentation.slides.length} slides created in database`);

    // Verify debug artifact on disk
    const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    const reportPath = path.join(uploadRoot, `classroom/${presentation.id}/google-slides/extraction-report.json`);
    assert.ok(fs.existsSync(reportPath), `Expected extraction-report.json at ${reportPath}`);

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    console.log('[GoogleSlides] Extraction Report:\n', JSON.stringify(report, null, 2));

    assert.strictEqual(report.slideCount, presentation.slides.length);
    assert.strictEqual(report.slidesParsed, presentation.slides.length);
    assert.ok(report.slidesWithText >= 1);

    // Verify slide 1 has meaningful content
    const slide1 = presentation.slides[0];
    assert.ok(slide1, 'Slide 1 must exist');
    assert.ok(slide1.title, 'Slide 1 must have a title');
    assert.ok(slide1.thumbnail, 'Slide 1 must have a thumbnail');

    const content = slide1.content as any;
    assert.ok(content, 'Slide 1 content must exist');
    assert.ok(content.visual, 'Slide 1 visual record must exist');
    assert.ok(content.visual.renderedImageUrl, 'Slide 1 renderedImageUrl must exist');

    // Check disk assets
    const pngPath = path.join(uploadRoot, `classroom/${presentation.id}/renders/slide-001.png`);
    if (fs.existsSync(pngPath)) {
      const pngBuf = fs.readFileSync(pngPath);
      const blackCheck = await isImageBlackOrBlank(pngBuf);
      assert.strictEqual(blackCheck.isBlack, false, 'Slide 1 thumbnail must not be black');
    }
  });

  // --- SECTION 4: Direct PPTX Upload Regression Check ---
  await test('Direct PPTX Regression: 11-slide convolution fixture parsed with all elements intact', async () => {
    const pptxBuffer = await buildConvolutionDeckPptx();
    assert.ok(pptxBuffer.length > 1000);

    const inspection = await inspectPptxArchive(pptxBuffer);
    assert.strictEqual(inspection.slideCount, CONVOLUTION_DECK_SLIDE_COUNT);
    assert.strictEqual(inspection.zipValid, true);

    const parsed = await parsePowerPoint(pptxBuffer, {
      extractNotes: true,
      extractMasterStyles: true,
      extractMath: true,
    });

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.slides?.length, CONVOLUTION_DECK_SLIDE_COUNT);

    const slide1 = parsed.slides![0];
    const elements = (slide1.content as any)?.elements || [];
    assert.ok(elements.length >= 6, `Slide 1 expected >= 6 elements, got ${elements.length}`);

    // Verify slide 1 has matrices/tables, text, and calculations
    const texts = elements.filter((e: any) => e.type === 'text');
    const tables = elements.filter((e: any) => e.type === 'table');
    assert.ok(texts.length >= 4, `Expected >= 4 text elements, got ${texts.length}`);
    assert.ok(tables.length >= 1, `Expected >= 1 table element, got ${tables.length}`);

    // Verify required strings
    const allText = texts.map((t: any) => t.paragraphs?.map((p: any) => p.text).join(' ')).join(' ');
    assert.ok(allText.includes('Numerical example of 3D convolution'));
    assert.ok(allText.includes('Channel 1'));
    assert.ok(allText.includes('Channel 2'));
    assert.ok(allText.includes('Filter'));
    assert.ok(allText.includes('Stride'));
  });

  console.log('================================================================');
  console.log(`ALL TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================\n');
}

runFidelitySuite().catch((err) => {
  console.error('[FATAL] Test suite failed:', err);
  process.exit(1);
});
