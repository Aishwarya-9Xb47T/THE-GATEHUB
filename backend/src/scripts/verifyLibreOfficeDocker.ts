/**
 * Prove PPTX → LibreOffice → PDF → SVG inside the production-like Debian image.
 * Usage (from repo root):
 *   npx tsx backend/src/scripts/verifyLibreOfficeDocker.ts
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { isValidRenderedSvg } from '../services/classroomStudio/presentationRenderService.js';
import { wrapPngAsSvg } from '../services/classroomStudio/presentationLibreOfficeRender.js';

function run(command: string, args: string[], timeoutMs: number, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout ${command}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

async function buildPptx(slideCount: number): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${Array.from({ length: slideCount }, (_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join('\n  ')}
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    ${Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('\n    ')}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${Array.from({ length: slideCount }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
  ).join('\n  ')}
</Relationships>`);
  for (let i = 0; i < slideCount; i += 1) {
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"/><a:t>Slide ${i + 1}</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function main() {
  const png = Buffer.alloc(80, 0);
  png[0] = 0x89; png[1] = 0x50; png[2] = 0x4e; png[3] = 0x47;
  png.writeUInt32BE(64, 16);
  png.writeUInt32BE(48, 20);
  const wrapped = wrapPngAsSvg(png);
  assert.equal(isValidRenderedSvg(wrapped), true);
  console.info('ok  PNG-wrap SVG validation', { bytes: wrapped.length });

  const work = await mkdtemp(path.join(os.tmpdir(), 'classroom-lo-docker-'));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  try {
    await writeFile(path.join(work, 'source.pptx'), await buildPptx(20));
    const build = await run('docker', [
      'build',
      '-f',
      'backend/Dockerfile.classroom-render',
      '-t',
      'gatehub-classroom-render',
      'backend',
    ], 20 * 60_000, repoRoot);
    if (build.exitCode !== 0) {
      throw new Error(`docker build failed\n${build.stderr.slice(-2000)}`);
    }
    const winWork = work.replace(/\\/g, '/');
    const convert = await run('docker', [
      'run',
      '--rm',
      '-e',
      'HOME=/tmp',
      '-v',
      `${winWork}:/work`,
      'gatehub-classroom-render',
      'bash',
      '-lc',
      [
        'set -euo pipefail',
        'soffice --headless --norestore --nolockcheck --nodefault --nofirststartwizard --convert-to pdf --outdir /work /work/source.pptx',
        'pdfinfo /work/source.pdf',
        'pdftocairo -svg -f 1 -l 1 /work/source.pdf /work/slide-001',
        'pdftocairo -svg -f 20 -l 20 /work/source.pdf /work/slide-020',
        'pdfinfo /work/source.pdf | sed -n "s/Pages: *//p"',
      ].join(' && '),
    ], 180_000);
    console.info(convert.stdout);
    if (convert.exitCode !== 0) {
      throw new Error(`docker convert failed\n${convert.stderr.slice(-2000)}`);
    }
    const svg1Path = existsSync(path.join(work, 'slide-001.svg'))
      ? path.join(work, 'slide-001.svg')
      : path.join(work, 'slide-001');
    const svg20Path = existsSync(path.join(work, 'slide-020.svg'))
      ? path.join(work, 'slide-020.svg')
      : path.join(work, 'slide-020');
    const svg1 = await readFile(svg1Path, 'utf8');
    const svg20 = await readFile(svg20Path, 'utf8');
    assert.equal(isValidRenderedSvg(svg1), true, 'slide 1 SVG invalid');
    assert.equal(isValidRenderedSvg(svg20), true, 'slide 20 SVG invalid');
    const pagesLine = convert.stdout.split('\n').find((line) => /Pages:\s+\d+/.test(line)) || '';
    assert.match(pagesLine, /Pages:\s+20/);
    console.info('[CLASSROOM_RENDER] docker_slide1', {
      bytes: svg1.length,
      preview: svg1.replace(/\s+/g, ' ').slice(0, 200),
    });
    console.info('[CLASSROOM_RENDER] docker_slide20', { bytes: svg20.length });
    console.info('REAL PPTX TEST (Docker LibreOffice): 20 PDF pages, slide 1 and 20 SVG verified');
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
