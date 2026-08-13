/**
 * Batch fidelity validation for PPTX corpus files.
 *
 * Usage:
 *   npx tsx backend/scripts/run-presentation-fidelity-suite.ts
 *   npx tsx backend/scripts/run-presentation-fidelity-suite.ts path/to/deck.pptx
 */

import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as powerPointParser from '../src/services/classroomStudio/powerPointParser.js';
import { renderPresentationSlides } from '../src/services/classroomStudio/presentationRenderService.js';
import {
  validateDeckFidelity,
  formatFidelityReport,
  type PersistedSlideLike,
} from '../src/services/classroomStudio/presentationFidelityValidator.js';
import { validateDeckVisualRegression } from '../src/services/classroomStudio/visualRegression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');

const DEFAULT_CORPUS = [
  path.join(BACKEND_ROOT, 'uploads/classroom-studio/cmsonzpyl0001qgvlwurhspqv/source/original.pptx'),
  path.join(BACKEND_ROOT, 'uploads/classroom-studio/cmson7jf90010fix1bpl4d0ro/source/original.pptx'),
];

interface SuiteResult {
  file: string;
  passed: boolean;
  slideCount: number;
  renderCount: number;
  fidelityPassed: boolean;
  visualRegressionPassed: boolean;
  issues: string[];
}

async function validatePptxFile(pptxPath: string): Promise<SuiteResult> {
  const issues: string[] = [];

  if (!existsSync(pptxPath)) {
    return {
      file: pptxPath,
      passed: false,
      slideCount: 0,
      renderCount: 0,
      fidelityPassed: false,
      visualRegressionPassed: false,
      issues: ['File not found'],
    };
  }

  const buffer = readFileSync(pptxPath);
  const importResult = await powerPointParser.parsePowerPoint(buffer);
  const slideCount = importResult.slides?.length ?? 0;

  if (slideCount === 0) {
    return {
      file: pptxPath,
      passed: false,
      slideCount: 0,
      renderCount: 0,
      fidelityPassed: false,
      visualRegressionPassed: false,
      issues: [`Parser returned zero slides (file may be invalid or empty: ${path.basename(pptxPath)})`],
    };
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), 'pptx-fidelity-'));
  const rendersDir = path.join(tempDir, 'renders');
  try {
    const renderResult = await renderPresentationSlides(buffer, rendersDir);
    if (!renderResult.success) {
      issues.push(...renderResult.errors);
    }

    const slides: PersistedSlideLike[] = (importResult.slides ?? []).map((s, index) => ({
      order: index + 1,
      title: s.title,
      content: {
        ...s.content,
        visual: renderResult.renders.some((r) => r.index === index)
          ? {
              type: 'svg',
              src: `asset://renders/slide-${String(index + 1).padStart(3, '0')}.svg`,
              slideIndex: index,
              width: s.content?.size?.width,
              height: s.content?.size?.height,
            }
          : {
              type: 'pptx',
              src: 'asset://source/original.pptx',
              slideIndex: index,
            },
      },
    }));

    const fidelity = validateDeckFidelity({
      slides,
      assetRoot: tempDir,
      sourceSlideCount: slideCount,
      originalPptxPath: pptxPath,
      validateAssetsResolved: false,
    });

    if (!fidelity.passed) {
      issues.push(...fidelity.issues.filter((i) => i.severity === 'error').map((i) => i.message));
    }

    const svgFiles = readdirSync(rendersDir)
      .filter((f) => f.endsWith('.svg'))
      .sort();
    const svgs = svgFiles.map((f) => readFileSync(path.join(rendersDir, f), 'utf8'));
    const visualRegression = await validateDeckVisualRegression(svgs);

    if (!visualRegression.passed) {
      issues.push(...visualRegression.issues);
    }

    console.log(formatFidelityReport(fidelity));
    console.log(`Visual regression: ${visualRegression.passed ? 'PASSED' : 'FAILED'}`);
    if (visualRegression.issues.length) {
      for (const v of visualRegression.issues.slice(0, 10)) console.log('  -', v);
    }

    return {
      file: pptxPath,
      passed: fidelity.passed && visualRegression.passed && renderResult.success,
      slideCount,
      renderCount: renderResult.renders.length,
      fidelityPassed: fidelity.passed,
      visualRegressionPassed: visualRegression.passed,
      issues,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length ? args.map((f) => path.resolve(f)) : DEFAULT_CORPUS.filter(existsSync);

  if (!files.length) {
    console.error('No PPTX files found to validate.');
    process.exit(1);
  }

  console.log('Presentation Fidelity Suite');
  console.log('Files:', files.length);
  console.log('');

  const results: SuiteResult[] = [];
  for (const file of files) {
    console.log('---', path.basename(file), '---');
    results.push(await validatePptxFile(file));
    console.log('');
  }

  const passed = results.filter((r) => r.passed).length;
  const totalSlides = results.reduce((s, r) => s + r.slideCount, 0);

  console.log('SUMMARY');
  console.log('=====');
  for (const r of results) {
    console.log(
      `${r.passed ? 'PASS' : 'FAIL'} | ${path.basename(r.file)} | slides=${r.slideCount} renders=${r.renderCount}`,
    );
  }
  console.log('');
  console.log(`Decks: ${passed}/${results.length} passed | Total slides tested: ${totalSlides}`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
