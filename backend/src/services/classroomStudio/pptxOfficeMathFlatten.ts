/**
 * LibreOffice 7.4 working-copy prep for uploaded PPTX.
 *
 * The stored B2 original.pptx stays byte-for-byte original.
 * PowerPoint / Google-exported decks store matrices and equations as Office Math
 * (m:oMath / a14:m), often inside mc:AlternateContent. LibreOffice Impress draws
 * surrounding shapes but drops those math objects (CASE C).
 *
 * This does NOT rebuild the slide from extracted titles. It only:
 *  1. unwraps AlternateContent toward an existing picture fallback when present
 *  2. paints remaining OMML as pictures (pdflatex, batched) or Unicode text
 *     at the original graphicFrame / text-run position
 * so the existing one-shot PPTX→PDF document renderer can include them.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const MATH_RE = /<(a14:m|m:oMathPara|m:oMath)\b[\s\S]*?<\/\1>/gi;
const FRAME_RE = /<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g;
const ALTERNATE_RE = /<mc:AlternateContent\b[^>]*>[\s\S]*?<\/mc:AlternateContent>/g;

export type PptxMathFlattenResult = {
  buffer: Buffer;
  originalBytes: number;
  flattenedBytes: number;
  slideCount: number;
  mathObjects: number;
  alternateContent: number;
  rasterized: number;
  inlined: number;
  pdflatex: boolean;
};

export function flattenAlternateContent(xml: string): { xml: string; unwrapped: number } {
  let unwrapped = 0;
  const xmlOut = xml.replace(ALTERNATE_RE, (block) => {
    unwrapped += 1;
    const choice = block.match(/<mc:Choice\b[^>]*>([\s\S]*?)<\/mc:Choice>/i)?.[1] ?? '';
    const fallback = block.match(/<mc:Fallback\b[^>]*>([\s\S]*?)<\/mc:Fallback>/i)?.[1] ?? '';
    const fallbackHasPicture = /<p:pic[\s>]/.test(fallback) || /<a:blip[\s>]/.test(fallback);
    if (fallbackHasPicture) return fallback;
    MATH_RE.lastIndex = 0;
    return choice || fallback;
  });
  return { xml: xmlOut, unwrapped };
}

export function ommlToLatex(ommlXml: string): string {
  let tex = ommlXml;
  tex = tex.replace(/<m:m\b[^>]*>([\s\S]*?)<\/m:m>/gi, (_match, body: string) => {
    const rows = [...String(body).matchAll(/<m:mr\b[^>]*>([\s\S]*?)<\/m:mr>/gi)].map((row) => {
      const cells = [...row[1].matchAll(/<m:e\b[^>]*>([\s\S]*?)<\/m:e>/gi)].map((cell) => ommlToLatex(cell[1]).trim());
      return cells.join(' & ');
    });
    return `\\begin{bmatrix}${rows.join(' \\\\ ')}\\end{bmatrix}`;
  });
  tex = tex.replace(
    /<m:d\b[^>]*>[\s\S]*?<m:begChr[^>]*m:val="([^"]*)"[^/]*\/>[\s\S]*?<m:endChr[^>]*m:val="([^"]*)"[^/]*\/>[\s\S]*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:d>/gi,
    (_match, beg: string, end: string, inner: string) => {
      const core = ommlToLatex(inner);
      if (beg === '[' && end === ']') return `\\left[${core}\\right]`;
      if (beg === '(' && end === ')') return `\\left(${core}\\right)`;
      return core;
    },
  );
  tex = tex.replace(
    /<m:f\b[^>]*>[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/gi,
    (_match, num: string, den: string) => `\\frac{${ommlToLatex(num)}}{${ommlToLatex(den)}}`,
  );
  tex = tex.replace(
    /<m:sSup\b[^>]*>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/gi,
    (_match, base: string, sup: string) => `${ommlToLatex(base)}^{${ommlToLatex(sup)}}`,
  );
  tex = tex.replace(
    /<m:sSub\b[^>]*>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/gi,
    (_match, base: string, sub: string) => `${ommlToLatex(base)}_{${ommlToLatex(sub)}}`,
  );
  tex = tex.replace(/<m:t\b[^>]*>([\s\S]*?)<\/m:t>/gi, (_match, inner: string) =>
    decodeXml(inner)
      .replace(/×/g, '\\times ')
      .replace(/−/g, '-')
      .replace(/[%#$]/g, ''),
  );
  tex = tex.replace(/<[^>]+>/g, ' ');
  return decodeXml(tex).replace(/\s+/g, ' ').trim();
}

export function ommlToPlain(ommlXml: string): string {
  return ommlToLatex(ommlXml)
    .replace(/\\begin\{bmatrix\}/g, '[')
    .replace(/\\end\{bmatrix\}/g, ']')
    .replace(/\\\\/g, '; ')
    .replace(/&/g, ' ')
    .replace(/\\times/g, '×')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\left\[/g, '[')
    .replace(/\\right\]/g, ']')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/[{}^\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function encodeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function countMatches(xml: string, pattern: RegExp): number {
  return (xml.match(pattern) || []).length;
}

function extractXfrm(frameXml: string): { off: string; ext: string } {
  const xfrm = frameXml.match(/<(?:p:xfrm|a:xfrm)\b[\s\S]*?<\/(?:p:xfrm|a:xfrm)>/i)?.[0] ?? '';
  const off = xfrm.match(/<(?:a:off)([^/]*)\/>/)?.[0] ?? '<a:off x="0" y="0"/>';
  const ext = xfrm.match(/<(?:a:ext)([^/]*)\/>/)?.[0] ?? '<a:ext cx="1828800" cy="914400"/>';
  return { off, ext };
}

function nextRelId(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="(rId\d+)"/g)].map((match) => Number(match[1].slice(3)));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function pdflatexPath(): string | null {
  const fromEnv = process.env.LATEX_PDFLATEX_PATH?.trim() || process.env.PDFLATEX_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync('/usr/bin/pdflatex')) return '/usr/bin/pdflatex';
  return null;
}

function pdfToPpmPath(): string | null {
  if (existsSync('/usr/bin/pdftoppm')) return '/usr/bin/pdftoppm';
  if (existsSync('/usr/local/bin/pdftoppm')) return '/usr/local/bin/pdftoppm';
  return null;
}

function run(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout ${path.basename(command)}`));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1 });
    });
  });
}

async function rasterizeLatexBatch(items: Array<{ latex: string; color: string }>): Promise<Array<Buffer | null>> {
  if (!items.length) return [];
  const texBin = pdflatexPath();
  const ppm = pdfToPpmPath();
  if (!texBin || !ppm) return items.map(() => null);
  const work = await mkdtemp(path.join(os.tmpdir(), 'classroom-omml-'));
  try {
    const body = items
      .map((item) => `\\begin{preview}\\color[HTML]{${item.color}}\\[${item.latex}\\]\\end{preview}`)
      .join('\n');
    const tex = `\\documentclass{article}
\\usepackage[active,tightpage]{preview}
\\usepackage{amsmath,amssymb,xcolor}
\\pagestyle{empty}
\\begin{document}
${body}
\\end{document}
`;
    await writeFile(path.join(work, 'eq.tex'), tex, 'utf8');
    const compiled = await run(texBin, ['-interaction=nonstopmode', '-halt-on-error', 'eq.tex'], work, 45_000);
    if (compiled.exitCode !== 0 || !existsSync(path.join(work, 'eq.pdf'))) {
      return items.map(() => null);
    }
    await run(ppm, ['-png', '-r', '180', 'eq.pdf', 'eq'], work, 30_000);
    const names = (await readdir(work)).filter((name) => /^eq-\d+\.png$/i.test(name)).sort((a, b) => {
      const na = Number(a.match(/(\d+)/)?.[1] || 0);
      const nb = Number(b.match(/(\d+)/)?.[1] || 0);
      return na - nb;
    });
    const pngs: Array<Buffer | null> = [];
    for (let index = 0; index < items.length; index += 1) {
      const file = names[index] ? path.join(work, names[index]) : '';
      if (!file || !existsSync(file)) {
        pngs.push(null);
        continue;
      }
      const png = await readFile(file);
      pngs.push(png.length > 200 ? png : null);
    }
    return pngs;
  } catch {
    return items.map(() => null);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

function pictureFrame(args: { id: number; name: string; rid: string; off: string; ext: string }): string {
  return `<p:pic>
  <p:nvPicPr>
    <p:cNvPr id="${args.id}" name="${args.name}"/>
    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
    <p:nvPr/>
  </p:nvPicPr>
  <p:blipFill>
    <a:blip r:embed="${args.rid}"/>
    <a:stretch><a:fillRect/></a:stretch>
  </p:blipFill>
  <p:spPr>
    <a:xfrm>${args.off}${args.ext}</a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  </p:spPr>
</p:pic>`;
}

function textFrame(args: { id: number; name: string; off: string; ext: string; text: string }): string {
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${args.id}" name="${args.name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm>${args.off}${args.ext}</a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:noFill/>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square"/><a:lstStyle/>
    <a:p><a:r><a:rPr lang="en-US" sz="1400"><a:solidFill><a:srgbClr val="E8C36A"/></a:solidFill><a:latin typeface="Cambria Math"/></a:rPr><a:t>${encodeXml(args.text)}</a:t></a:r></a:p>
  </p:txBody>
</p:sp>`;
}

function inlineMathRun(text: string, color: string): string {
  return `<a:r><a:rPr lang="en-US" sz="1400"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Cambria Math"/></a:rPr><a:t>${encodeXml(text)}</a:t></a:r>`;
}

function slideBackgroundIsDark(xml: string): boolean {
  const bg = xml.match(/<p:bg[\s\S]*?<\/p:bg>/i)?.[0] ?? '';
  const srgb = bg.match(/srgbClr[^>]*val="([0-9A-Fa-f]{6})"/i)?.[1];
  if (!srgb) return /<a:srgbClr[^>]*val="000000"/i.test(xml);
  const n = parseInt(srgb, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r + g + b) / 3 < 80;
}

function replaceOnce(haystack: string, needle: string, replacement: string): string {
  const at = haystack.indexOf(needle);
  if (at < 0) return haystack;
  return haystack.slice(0, at) + replacement + haystack.slice(at + needle.length);
}

export async function flattenPptxMathForLibreOffice(original: Buffer): Promise<PptxMathFlattenResult> {
  const zip = await JSZip.loadAsync(original);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));

  let mathObjects = 0;
  let alternateContent = 0;
  let rasterized = 0;
  let inlined = 0;
  const canRaster = Boolean(pdflatexPath() && pdfToPpmPath());
  let shapeId = 4000;

  type FrameJob = {
    slideName: string;
    frame: string;
    latex: string;
    plain: string;
    off: string;
    ext: string;
    color: string;
  };
  const frameJobs: FrameJob[] = [];
  const slideState = new Map<string, { xml: string; rels: string; relsName: string }>();

  for (const slideName of slideNames) {
    const file = zip.file(slideName);
    if (!file) continue;
    let xml = await file.async('string');
    const alt = flattenAlternateContent(xml);
    xml = alt.xml;
    alternateContent += alt.unwrapped;
    mathObjects += countMatches(xml, MATH_RE);
    MATH_RE.lastIndex = 0;

    const relsName = slideName.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const rels =
      (await zip.file(relsName)?.async('string')) ??
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const color = slideBackgroundIsDark(xml) ? 'E8C36A' : '111827';
    slideState.set(slideName, { xml, rels, relsName });

    const frames = [...xml.matchAll(FRAME_RE)].map((match) => match[0]);
    for (const frame of frames) {
      MATH_RE.lastIndex = 0;
      if (!MATH_RE.test(frame)) continue;
      MATH_RE.lastIndex = 0;
      const omml = frame.match(MATH_RE)?.[0] ?? '';
      const { off, ext } = extractXfrm(frame);
      frameJobs.push({
        slideName,
        frame,
        latex: ommlToLatex(omml),
        plain: ommlToPlain(omml),
        off,
        ext,
        color,
      });
    }
  }

  const pngs = canRaster
    ? await rasterizeLatexBatch(frameJobs.map((job) => ({ latex: job.latex, color: job.color })))
    : frameJobs.map(() => null);

  for (let index = 0; index < frameJobs.length; index += 1) {
    const job = frameJobs[index];
    const state = slideState.get(job.slideName);
    if (!state) continue;
    shapeId += 1;
    const png = pngs[index];
    if (png) {
      const mediaName = `ppt/media/classroom-math-${shapeId}.png`;
      zip.file(mediaName, png);
      const rid = nextRelId(state.rels);
      state.rels = state.rels.replace(
        '</Relationships>',
        `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/classroom-math-${shapeId}.png"/></Relationships>`,
      );
      state.xml = replaceOnce(
        state.xml,
        job.frame,
        pictureFrame({ id: shapeId, name: `Math ${shapeId}`, rid, off: job.off, ext: job.ext }),
      );
      rasterized += 1;
    } else {
      state.xml = replaceOnce(
        state.xml,
        job.frame,
        textFrame({
          id: shapeId,
          name: `Math ${shapeId}`,
          off: job.off,
          ext: job.ext,
          text: job.plain || job.latex,
        }),
      );
      inlined += 1;
    }
  }

  for (const [slideName, state] of slideState) {
    MATH_RE.lastIndex = 0;
    state.xml = state.xml.replace(MATH_RE, (omml) => {
      inlined += 1;
      const color = slideBackgroundIsDark(state.xml) ? 'E8C36A' : '111827';
      return inlineMathRun(ommlToPlain(omml) || ommlToLatex(omml), color);
    });
    zip.file(slideName, state.xml);
    zip.file(state.relsName, state.rels);
  }

  const typesName = '[Content_Types].xml';
  const types = await zip.file(typesName)?.async('string');
  if (types && !/Extension="png"/i.test(types)) {
    zip.file(typesName, types.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="png" ContentType="image/png"/>'));
  }

  const buffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return {
    buffer,
    originalBytes: original.length,
    flattenedBytes: buffer.length,
    slideCount: slideNames.length,
    mathObjects,
    alternateContent,
    rasterized,
    inlined,
    pdflatex: canRaster,
  };
}
