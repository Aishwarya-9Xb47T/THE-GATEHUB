/**
 * Deterministic PowerPoint visuals for production:
 *   PPTX → LibreOffice Impress headless → PDF → per-page SVG (pdftocairo)
 *   PNG fallback (pdftoppm) wrapped in a valid SVG so the editor still uses slide-NNN.svg.
 *
 * pptx-svg + Chromium cannot load a 17.6 MB deck in Render: CDP freezes after browser launch.
 * LibreOffice is the converter already intended for this class of file.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isValidRenderedSvg, withDeadline, type PresentationRenderResult, type SlideRenderResult } from './presentationRenderService.js';

const PDF_CONVERT_TIMEOUT_MS = 120_000;
const PAGE_RENDER_TIMEOUT_MS = 45_000;

function classroomRenderLog(fields: Record<string, string | number | boolean | undefined | null>) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`);
  console.info(`[CLASSROOM_RENDER] ${parts.join(' ')}`);
}

function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

export function libreOfficeExecutable(): string | null {
  const fromEnv = process.env.LIBREOFFICE_PATH?.trim() || process.env.SOFFICE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return firstExisting([
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    '/usr/bin/libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ]);
}

export function pdfToCairoExecutable(): string | null {
  const fromEnv = process.env.PDFTOCAIRO_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return firstExisting(['/usr/bin/pdftocairo', '/usr/local/bin/pdftocairo']);
}

export function pdfToPpmExecutable(): string | null {
  const fromEnv = process.env.PDFTOPPM_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return firstExisting(['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm']);
}

export function pdfInfoExecutable(): string | null {
  return firstExisting(['/usr/bin/pdfinfo', '/usr/local/bin/pdfinfo']);
}

export function describeLibreOfficeTools() {
  return {
    soffice: libreOfficeExecutable(),
    pdftocairo: pdfToCairoExecutable(),
    pdftoppm: pdfToPpmExecutable(),
    pdfinfo: pdfInfoExecutable(),
    available: Boolean(libreOfficeExecutable() && (pdfToCairoExecutable() || pdfToPpmExecutable())),
  };
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options?.cwd,
      env: options?.env ?? process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error(`CLASSROOM_RENDER_TIMEOUT command=${path.basename(command)} after ${timeoutMs}ms`);
      (error as Error & { code?: string }).code = 'CLASSROOM_RENDER_TIMEOUT';
      reject(error);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8').slice(0, 8000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8').slice(0, 8000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function parsePdfPageCount(info: string): number {
  const match = info.match(/Pages:\s+(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export function pngDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 24 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error('CLASSROOM_RENDER_INVALID_SVG not a PNG buffer');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function wrapPngAsSvg(png: Buffer): string {
  const { width, height } = pngDimensions(png);
  const href = `data:image/png;base64,${png.toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${href}" xlink:href="${href}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

function previewSvg(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 200);
}

async function renderPdfPageToSvg(args: {
  pdfPath: string;
  page: number;
  outputDir: string;
  pdftocairo: string | null;
  pdftoppm: string | null;
}): Promise<{ svg: string; via: 'pdftocairo' | 'pdftoppm-png' }> {
  const prefix = path.join(args.outputDir, `page-${String(args.page).padStart(3, '0')}`);
  if (args.pdftocairo) {
    const result = await runCommand(
      args.pdftocairo,
      ['-svg', '-singlefile', '-f', String(args.page), '-l', String(args.page), args.pdfPath, prefix],
      PAGE_RENDER_TIMEOUT_MS,
    );
    const candidates = [
      `${prefix}.svg`,
      `${prefix}.svg.svg`,
      `${prefix}-1.svg`,
      `${prefix}.svg-1.svg`,
      `${prefix}-${args.page}.svg`,
      prefix,
    ];
    let svgPath = candidates.find((c) => existsSync(c));
    if (!svgPath) {
      try {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(args.outputDir);
        const match = files.find(
          (f) => f.startsWith(`page-${String(args.page).padStart(3, '0')}`) && f.endsWith('.svg'),
        );
        if (match) svgPath = path.join(args.outputDir, match);
      } catch {
        /* ignore readdir failure */
      }
    }
    if (result.exitCode === 0 && svgPath && existsSync(svgPath)) {
      const svg = await readFile(svgPath, 'utf8');
      if (isValidRenderedSvg(svg)) {
        return { svg, via: 'pdftocairo' };
      }
    }
  }
  if (!args.pdftoppm) {
    throw new Error('CLASSROOM_RENDER_SLIDE_FAILED pdftocairo produced invalid SVG and pdftoppm is missing');
  }
  const pngPrefix = `${prefix}-png`;
  const pngResult = await runCommand(
    args.pdftoppm,
    ['-png', '-singlefile', '-r', '144', '-f', String(args.page), '-l', String(args.page), args.pdfPath, pngPrefix],
    PAGE_RENDER_TIMEOUT_MS,
  );
  const pngCandidates = [
    `${pngPrefix}.png`,
    `${pngPrefix}-${args.page}.png`,
    `${pngPrefix}-1.png`,
    `${pngPrefix}-01.png`,
    `${pngPrefix}-000001.png`,
    pngPrefix,
  ];
  let pngPath = pngCandidates.find((c) => existsSync(c));
  if (!pngPath) {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(args.outputDir);
      const match = files.find(
        (f) => f.startsWith(`page-${String(args.page).padStart(3, '0')}`) && f.endsWith('.png'),
      );
      if (match) pngPath = path.join(args.outputDir, match);
    } catch {
      /* ignore */
    }
  }
  if (pngResult.exitCode !== 0 || !pngPath || !existsSync(pngPath)) {
    throw new Error(
      `CLASSROOM_RENDER_SLIDE_FAILED pdftoppm failed page=${args.page} exit=${pngResult.exitCode} ${pngResult.stderr.slice(0, 160)}`,
    );
  }
  const png = await readFile(pngPath);
  const svg = wrapPngAsSvg(png);
  if (!isValidRenderedSvg(svg)) {
    throw new Error('CLASSROOM_RENDER_INVALID_SVG PNG wrap did not produce valid SVG');
  }
  return { svg, via: 'pdftoppm-png' };
}

export async function renderPresentationSlidesLibreOffice(
  pptxBuffer: Buffer,
  outputDir: string,
  options?: {
    skipIndexes?: Iterable<number>;
    onProgress?: (event: { slide: number; total: number }) => void | Promise<void>;
    onSlideRendered?: (render: SlideRenderResult) => void | Promise<void>;
    presentationId?: string;
    maxSlides?: number;
    pdfBuffer?: Buffer;
  },
): Promise<PresentationRenderResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const method = 'libreoffice-pdf' as const;
  const skipIndexes = new Set([...(options?.skipIndexes ?? [])]);
  const presentationId = options?.presentationId;
  const tools = describeLibreOfficeTools();
  const log = (fields: Record<string, string | number | boolean | undefined | null>) =>
    classroomRenderLog({ presentation: presentationId, method, ...fields });

  log({ stage: 'RENDER_START', status: 'start', pptxBytes: pptxBuffer.length, directPdf: Boolean(options?.pdfBuffer) });
  if (!options?.pdfBuffer && !tools.soffice) {
    const error = 'CLASSROOM_OFFICE_RENDERER_UNAVAILABLE LibreOffice (soffice) is not installed in this image';
    log({ stage: 'RENDER_START', status: 'failure', errorCode: 'CLASSROOM_OFFICE_RENDERER_UNAVAILABLE', errorMessage: error });
    return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
  }
  if (!tools.pdftocairo && !tools.pdftoppm) {
    const error = 'CLASSROOM_OFFICE_RENDERER_UNAVAILABLE poppler-utils (pdftocairo/pdftoppm) is not installed in this image';
    log({ stage: 'RENDER_START', status: 'failure', errorCode: 'CLASSROOM_OFFICE_RENDERER_UNAVAILABLE', errorMessage: error });
    return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
  }

  if (!options?.pdfBuffer && (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b)) {
    log({ stage: 'PPTX_VALIDATED', status: 'failure', errorCode: 'CLASSROOM_RENDER_SOURCE_FAILED', errorMessage: 'Invalid PPTX buffer (missing ZIP signature)' });
    return {
      success: false,
      slideCount: 0,
      renders: [],
      warnings,
      errors: ['CLASSROOM_RENDER_SOURCE_FAILED: Invalid PPTX buffer (missing ZIP signature)'],
      method,
    };
  }

  await mkdir(outputDir, { recursive: true });
  const workDir = path.join(os.tmpdir(), `classroom-lo-${presentationId || 'anon'}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  let pdfPath = path.join(workDir, 'source.pdf');

  if (options?.pdfBuffer && options.pdfBuffer.length > 100 && options.pdfBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
    await writeFile(pdfPath, options.pdfBuffer);
    log({ stage: 'DIRECT_PDF_LOADED', status: 'success', bytes: options.pdfBuffer.length });
  } else {
    const crypto = await import('node:crypto');
    const sha256 = crypto.createHash('sha256').update(pptxBuffer).digest('hex');
    const pptxPath = path.join(workDir, 'source.pptx');
    await writeFile(pptxPath, pptxBuffer);
    log({ stage: 'PPTX_SOURCE_LOADED', status: 'success', bytes: pptxBuffer.length, sha256, soffice: tools.soffice });
    log({ stage: 'PPTX_VALIDATED', status: 'success', bytes: pptxBuffer.length, sha256 });

    const convertStarted = Date.now();
    log({ stage: 'LIBREOFFICE_CONVERT_START', status: 'start', sha256 });
    const profileDir = path.join(workDir, 'lo_profile').replace(/\\/g, '/');
    const convertArgs = (filter: string) => [
      `--env:UserInstallation=file://${profileDir}`,
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      '--nofirststartwizard',
      '--convert-to',
      filter,
      '--outdir',
      workDir,
      pptxPath,
    ];
  const sofficeEnv = { ...process.env, HOME: workDir, SAL_USE_VCLPLUGIN: 'svp' };
  let convert: { stdout: string; stderr: string; exitCode: number };
  try {
    convert = await withDeadline(
      runCommand(tools.soffice, convertArgs('pdf:impress_pdf_Export'), PDF_CONVERT_TIMEOUT_MS, {
        cwd: workDir,
        env: sofficeEnv,
      }),
      PDF_CONVERT_TIMEOUT_MS + 5_000,
      'CLASSROOM_RENDER_TIMEOUT',
      'CLASSROOM_RENDER_TIMEOUT stage=LIBREOFFICE_CONVERT',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log({
      stage: 'LIBREOFFICE_CONVERT',
      status: 'failure',
      errorCode: 'CLASSROOM_RENDER_TIMEOUT',
      errorMessage: message.slice(0, 220),
      durationMs: Date.now() - convertStarted,
    });
    return { success: false, slideCount: 0, renders: [], warnings, errors: [message], method };
  }
  let pdfPath = path.join(workDir, 'source.pdf');
  if (!existsSync(pdfPath)) {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(workDir);
      const match = files.find((f) => f.endsWith('.pdf'));
      if (match) pdfPath = path.join(workDir, match);
    } catch {
      /* ignore */
    }
  }
  if ((convert.exitCode !== 0 || !existsSync(pdfPath)) && existsSync(pptxPath)) {
    convert = await withDeadline(
      runCommand(tools.soffice, convertArgs('pdf'), PDF_CONVERT_TIMEOUT_MS, {
        cwd: workDir,
        env: sofficeEnv,
      }),
      PDF_CONVERT_TIMEOUT_MS + 5_000,
      'CLASSROOM_RENDER_TIMEOUT',
      'CLASSROOM_RENDER_TIMEOUT stage=LIBREOFFICE_CONVERT',
    );
    if (!existsSync(pdfPath)) {
      try {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(workDir);
        const match = files.find((f) => f.endsWith('.pdf'));
        if (match) pdfPath = path.join(workDir, match);
      } catch {
        /* ignore */
      }
    }
  }
    if (convert.exitCode !== 0 || !existsSync(pdfPath)) {
      const message = `LibreOffice PDF export failed exit=${convert.exitCode} ${convert.stderr.slice(0, 180)}`;
      log({
        stage: 'LIBREOFFICE_CONVERT',
        status: 'failure',
        errorCode: 'CLASSROOM_RENDER_FAILED',
        errorMessage: message,
        durationMs: Date.now() - convertStarted,
      });
      return { success: false, slideCount: 0, renders: [], warnings, errors: [message], method };
    }
    log({
      stage: 'LIBREOFFICE_CONVERT',
      status: 'success',
      durationMs: Date.now() - convertStarted,
      pdfBytes: (await readFile(pdfPath)).length,
    });
  }

  let pageCount = 0;
  if (tools.pdfinfo) {
    const info = await runCommand(tools.pdfinfo, [pdfPath], 15_000);
    pageCount = parsePdfPageCount(info.stdout + info.stderr);
  }
  if (pageCount < 1) {
    pageCount = 1;
    warnings.push('pdfinfo did not report a page count; rendering until a page fails');
  }
  const lastPage = Math.min(pageCount, options?.maxSlides && options.maxSlides > 0 ? options.maxSlides : pageCount);
  log({ stage: 'PDF_READY', status: 'success', pages: pageCount, requested: lastPage });

  const renders: SlideRenderResult[] = [];
  for (let index = 0; index < lastPage; index += 1) {
    const slide = index + 1;
    if (skipIndexes.has(index)) {
      log({ stage: 'SLIDE_COMPLETE', slide, skipped: true, status: 'success' });
      continue;
    }
    const started = Date.now();
    log({ stage: 'RENDER_API_CALLED', slide, status: 'start' });
    try {
      await options?.onProgress?.({ slide, total: pageCount });
      const pageSvg = await renderPdfPageToSvg({
        pdfPath,
        page: slide,
        outputDir: workDir,
        pdftocairo: tools.pdftocairo,
        pdftoppm: tools.pdftoppm,
      });
      log({
        stage: 'RENDER_OUTPUT_RECEIVED',
        slide,
        status: 'success',
        bytes: pageSvg.svg.length,
        via: pageSvg.via,
        preview: previewSvg(pageSvg.svg),
      });
      if (!isValidRenderedSvg(pageSvg.svg)) {
        throw new Error('CLASSROOM_RENDER_INVALID_SVG output failed validation');
      }
      log({ stage: 'SVG_VALIDATED', slide, status: 'success', bytes: pageSvg.svg.length });
      const fileName = `slide-${String(slide).padStart(3, '0')}.svg`;
      const diskPath = path.join(outputDir, fileName);
      await writeFile(diskPath, pageSvg.svg, 'utf8');
      const render: SlideRenderResult = {
        index,
        path: `renders/${fileName}`,
        svgLength: pageSvg.svg.length,
        svgText: pageSvg.svg,
      };
      renders.push(render);
      if (options?.onSlideRendered) {
        log({ stage: 'B2_UPLOAD_STARTED', slide, status: 'start' });
        const uploadStarted = Date.now();
        await options.onSlideRendered(render);
        log({ stage: 'B2_UPLOAD_COMPLETE', slide, status: 'success', durationMs: Date.now() - uploadStarted });
      }
      log({
        stage: 'SLIDE_COMPLETE',
        slide,
        total: pageCount,
        status: 'success',
        durationMs: Date.now() - started,
        bytes: render.svgLength,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = /TIMEOUT/.test(message)
        ? 'CLASSROOM_RENDER_TIMEOUT'
        : /INVALID_SVG/.test(message)
          ? 'CLASSROOM_RENDER_INVALID_SVG'
          : 'CLASSROOM_RENDER_SLIDE_FAILED';
      errors.push(`${code} slide=${slide} reason=${message.slice(0, 180)}`);
      log({
        stage: 'SLIDE_COMPLETE',
        slide,
        status: 'failure',
        errorCode: code,
        errorMessage: message.slice(0, 220),
        durationMs: Date.now() - started,
      });
    }
  }

  const newlyExpected = lastPage - [...skipIndexes].filter((index) => index >= 0 && index < lastPage).length;
  log({
    complete: true,
    requested: newlyExpected,
    rendered: renders.length,
    failed: errors.length,
    skipped: skipIndexes.size,
    method,
    status: renders.length === newlyExpected && errors.length === 0 ? 'success' : 'failure',
  });
  return {
    success: renders.length === newlyExpected && errors.length === 0,
    slideCount: pageCount,
    renders,
    warnings,
    errors,
    method,
  };
}
