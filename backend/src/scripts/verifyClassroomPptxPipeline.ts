/**
 * Real PowerPoint render pipeline check.
 * Usage: npx tsx src/scripts/verifyClassroomPptxPipeline.ts
 *
 * Creates a small (and a 20-slide) PPTX, runs puppeteer-pptx-svg when Chromium
 * is available, and verifies SVG files are written and valid.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { renderPresentationSlides } from "../services/classroomStudio/presentationRenderService.js";
import { isValidPptxBuffer } from "../services/classroomStudio/classroomSourceResolver.js";

function slideXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"/><a:t>${title}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

async function buildPptx(slideCount: number): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${Array.from({ length: slideCount }, (_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join("\n  ")}
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    ${Array.from({ length: slideCount }, (_, i) =>
      `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`,
    ).join("\n    ")}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${Array.from({ length: slideCount }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
  ).join("\n  ")}
</Relationships>`);
  for (let i = 0; i < slideCount; i += 1) {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(`Slide ${i + 1}`));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

function isSvg(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"));
}

async function main() {
  const twoSlide = await buildPptx(2);
  const twentySlide = await buildPptx(20);
  assert.equal(isValidPptxBuffer(twoSlide), true);
  assert.equal(isValidPptxBuffer(twentySlide), true);
  console.info("ok  generated PPTX buffers", { twoSlideBytes: twoSlide.length, twentySlideBytes: twentySlide.length });

  const outputDir = await mkdtemp(path.join(os.tmpdir(), "classroom-pptx-pipeline-"));
  try {
    const small = await renderPresentationSlides(twoSlide, outputDir);
    console.info("render 2-slide", {
      success: small.success,
      slideCount: small.slideCount,
      rendered: small.renders.length,
      method: small.method,
      errors: small.errors.slice(0, 3),
    });

    if (small.errors.some((error) => /Chromium was not found|pptx-svg renderer assets/i.test(error))) {
      console.warn("skip  puppeteer render — Chromium or pptx-svg missing in this environment");
      console.info("pipeline assertions passed (source + renderer contract; live Chromium render skipped)");
      process.exit(0);
    }

    assert.ok(small.renders.length >= 1, "expected at least one SVG for the 2-slide deck");
    for (const render of small.renders) {
      const file = path.join(outputDir, path.basename(render.path));
      const svg = await readFile(file, "utf8");
      assert.equal(isSvg(svg), true, `${render.path} is not SVG`);
      assert.ok(svg.length > 32, `${render.path} is empty`);
    }

    const skipDir = await mkdtemp(path.join(os.tmpdir(), "classroom-pptx-skip-"));
    try {
      await writeFile(path.join(skipDir, "slide-001.svg"), "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
      const skipped = await renderPresentationSlides(twoSlide, skipDir, { skipIndexes: [0] });
      assert.equal(skipped.renders.some((render) => render.index === 0), false);
      console.info("ok  skip already-rendered slide 1", { rendered: skipped.renders.map((r) => r.index) });
    } finally {
      await rm(skipDir, { recursive: true, force: true });
    }

    const twentyDir = await mkdtemp(path.join(os.tmpdir(), "classroom-pptx-20-"));
    try {
      const twenty = await renderPresentationSlides(twentySlide, twentyDir);
      console.info("render 20-slide", {
        success: twenty.success,
        slideCount: twenty.slideCount,
        rendered: twenty.renders.length,
        errors: twenty.errors.slice(0, 3),
      });
      if (twenty.renders.length) {
        const first = await readFile(path.join(twentyDir, path.basename(twenty.renders[0].path)), "utf8");
        assert.equal(isSvg(first), true);
      }
    } finally {
      await rm(twentyDir, { recursive: true, force: true });
    }

    console.info("pipeline assertions passed");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
