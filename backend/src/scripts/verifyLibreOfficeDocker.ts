/**
 * Prove PPTX → LibreOffice → PDF → PNG inside the production-like Debian image.
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
import {
  CONVOLUTION_DECK_SLIDE_COUNT,
  CONVOLUTION_REQUIRED_PDF_STRINGS,
  buildConvolutionDeckPptx,
} from '../services/classroomStudio/convolutionDeckFixture.js';
import { isValidRenderedSvg } from '../services/classroomStudio/presentationRenderService.js';
import { sha256Hex, wrapPngAsSvg } from '../services/classroomStudio/presentationLibreOfficeRender.js';

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

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const work = await mkdtemp(path.join(os.tmpdir(), 'classroom-lo-docker-'));
  try {
    const pptx = await buildConvolutionDeckPptx();
    const sha256 = sha256Hex(pptx);
    await writeFile(path.join(work, 'source.pptx'), pptx);
    await writeFile(
      path.join(work, 'registrymodifications.xcu'),
      `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="UseJava" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
`,
      'utf8',
    );
    console.info('[CLASSROOM_SOURCE]', { bytes: pptx.length, sha256, slides: CONVOLUTION_DECK_SLIDE_COUNT });

    const build = await run('docker', [
      'build',
      '-f',
      'backend/Dockerfile.classroom-render',
      '-t',
      'gatehub-classroom-render',
      '.',
    ], 20 * 60_000, repoRoot);
    if (build.exitCode !== 0) {
      throw new Error(`docker build failed\n${build.stderr.slice(-3000)}\n${build.stdout.slice(-1000)}`);
    }

    const winWork = work.replace(/\\/g, '/');
    const convert = await run('docker', [
      'run',
      '--rm',
      '-e',
      'HOME=/tmp',
      '-e',
      'JAVA_HOME=/usr/lib/jvm/default-java',
      '-v',
      `${winWork}:/work`,
      'gatehub-classroom-render',
      'bash',
      '-lc',
      [
        'set -euo pipefail',
        'echo EXECUTABLE=$(command -v soffice)',
        'soffice --headless --version || true',
        'echo JAVA=$(command -v java || true)',
        'java -version || true',
        'echo JAVA_HOME=${JAVA_HOME:-unset}',
        'echo JAVALDX=$(ls /usr/lib/libreoffice/program/javaldx 2>/dev/null || true)',
        'echo PATH=$PATH',
        'echo HOME=$HOME',
        'echo TEMP=${TEMP:-unset} TMP=${TMP:-unset} TMPDIR=${TMPDIR:-/tmp}',
        'echo USER=$(id -u -n) CWD=$(pwd)',
        'echo INPUT=/work/source.pptx',
        'sha256sum /work/source.pptx',
        'mkdir -p /work/profile/user /work/output',
        'cp /work/registrymodifications.xcu /work/profile/user/registrymodifications.xcu',
        'soffice -env:UserInstallation=file:///work/profile --headless --norestore --nolockcheck --nodefault --nofirststartwizard --nologo --convert-to pdf --outdir /work/output /work/source.pptx',
        'test -f /work/output/source.pdf',
        'pdfinfo /work/output/source.pdf',
        'pdftotext -layout /work/output/source.pdf /work/output/source.txt',
        'for i in $(seq 1 11); do pdftoppm -png -singlefile -r 144 -f $i -l $i /work/output/source.pdf /work/output/slide-$(printf %03d $i); done',
        'ls -l /work/output',
      ].join(' && '),
    ], 180_000);

    console.info(convert.stdout);
    if (convert.stderr) console.info(convert.stderr);
    if (convert.exitCode !== 0) {
      throw new Error(`docker convert failed exit=${convert.exitCode}\n${convert.stderr.slice(-4000)}\n${convert.stdout.slice(-2000)}`);
    }

    const pdf = await readFile(path.join(work, 'output', 'source.pdf'));
    const text = await readFile(path.join(work, 'output', 'source.txt'), 'utf8');
    assert.match(convert.stdout, /Pages:\s+11/);
    const missing = CONVOLUTION_REQUIRED_PDF_STRINGS.filter((value) => !text.replace(/\s+/g, ' ').includes(value));
    assert.equal(missing.length, 0, `PDF missing required content: ${missing.join(', ')}\n${text.slice(0, 1500)}`);

    for (let i = 1; i <= CONVOLUTION_DECK_SLIDE_COUNT; i += 1) {
      const pngPath = path.join(work, 'output', `slide-${String(i).padStart(3, '0')}.png`);
      assert.equal(existsSync(pngPath), true, `missing ${pngPath}`);
      const png = await readFile(pngPath);
      const svg = wrapPngAsSvg(png);
      assert.equal(isValidRenderedSvg(svg), true, `slide ${i} PNG wrap invalid`);
    }

    console.info('[CLASSROOM_RENDER] docker_pptx_to_pdf', { status: 'success', pdfBytes: pdf.length, pdfPages: 11, sha256 });
    console.info('REAL 11-SLIDE DECK (Docker LibreOffice): PPTX→PDF PASS, PDF→PNG 11/11, matrix content VISIBLE');
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
