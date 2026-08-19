import { createHash } from 'node:crypto';
import JSZip from 'jszip';

export type PptxSlideInspection = {
  path: string;
  xmlBytes: number;
  textRuns: number;
  shapes: number;
  pictures: number;
  groups: number;
  tables: number;
  math: number;
  charts: number;
};

export type PptxArchiveInspection = {
  bytes: number;
  sha256: string;
  zipValid: boolean;
  mime: string;
  slideCount: number;
  mediaCount: number;
  chartCount: number;
  embeddingCount: number;
  notesCount: number;
  masterCount: number;
  layoutCount: number;
  hasTheme: boolean;
  hasContentTypes: boolean;
  slides: PptxSlideInspection[];
};

function count(xml: string, pattern: RegExp): number {
  return (xml.match(pattern) || []).length;
}

function inspectSlideXml(pathName: string, xml: string): PptxSlideInspection {
  return {
    path: pathName,
    xmlBytes: Buffer.byteLength(xml),
    textRuns: count(xml, /<a:t[\s>]/g),
    shapes: count(xml, /<p:sp[\s>]/g),
    pictures: count(xml, /<p:pic[\s>]/g),
    groups: count(xml, /<p:grpSp[\s>]/g),
    tables: count(xml, /<a:tbl[\s>]/g),
    math: count(xml, /<(?:m:oMath|m:oMathPara|a14:m)[\s>]/g),
    charts: count(xml, /<c:chart[\s>]/g),
  };
}

export async function inspectPptxArchive(buffer: Buffer): Promise<PptxArchiveInspection> {
  const bytes = buffer.length;
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const zipValid = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const empty: PptxArchiveInspection = {
    bytes,
    sha256,
    zipValid,
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    slideCount: 0,
    mediaCount: 0,
    chartCount: 0,
    embeddingCount: 0,
    notesCount: 0,
    masterCount: 0,
    layoutCount: 0,
    hasTheme: false,
    hasContentTypes: false,
    slides: [],
  };
  if (!zipValid) return empty;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { ...empty, zipValid: false };
  }

  const names = Object.keys(zip.files);
  const slideNames = names
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
      return na - nb;
    });

  const slides: PptxSlideInspection[] = [];
  for (const name of slideNames) {
    const xml = await zip.file(name)?.async('string');
    if (xml) slides.push(inspectSlideXml(name, xml));
  }

  return {
    bytes,
    sha256,
    zipValid: true,
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    slideCount: slides.length,
    mediaCount: names.filter((name) => name.startsWith('ppt/media/')).length,
    chartCount: names.filter((name) => name.startsWith('ppt/charts/')).length,
    embeddingCount: names.filter((name) => name.startsWith('ppt/embeddings/')).length,
    notesCount: names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name)).length,
    masterCount: names.filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name)).length,
    layoutCount: names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name)).length,
    hasTheme: names.some((name) => name.startsWith('ppt/theme/')),
    hasContentTypes: names.includes('[Content_Types].xml'),
    slides,
  };
}

export function formatPptxInspectionLog(label: string, inspection: PptxArchiveInspection): string {
  const slide1 = inspection.slides[0];
  return [
    `[${label}]`,
    `bytes=${inspection.bytes}`,
    `sha256=${inspection.sha256}`,
    `zipValid=${inspection.zipValid}`,
    `mime=${inspection.mime}`,
    `slides=${inspection.slideCount}`,
    `media=${inspection.mediaCount}`,
    `charts=${inspection.chartCount}`,
    `embeddings=${inspection.embeddingCount}`,
    `notes=${inspection.notesCount}`,
    `masters=${inspection.masterCount}`,
    `layouts=${inspection.layoutCount}`,
    `theme=${inspection.hasTheme}`,
    slide1
      ? `slide1 textRuns=${slide1.textRuns} shapes=${slide1.shapes} pics=${slide1.pictures} groups=${slide1.groups} tables=${slide1.tables} math=${slide1.math}`
      : 'slide1=missing',
  ].join(' ');
}
