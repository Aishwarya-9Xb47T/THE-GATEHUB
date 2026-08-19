/**
 * Production-safe diagnostic: render ONLY slide 1 from a PPTX.
 * Usage:
 *   npx tsx src/scripts/renderClassroomSlide1.ts
 *   npx tsx src/scripts/renderClassroomSlide1.ts path/to/deck.pptx
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import {
  describeClassroomRenderer,
  isValidRenderedSvg,
  renderPresentationSlides,
} from "../services/classroomStudio/presentationRenderService.js";

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

async function buildPptx(slideCount: number, mediaBytes = 0): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="bin" ContentType="application/octet-stream"/>
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
  if (mediaBytes > 0) {
    zip.file("ppt/media/huge.bin", Buffer.alloc(mediaBytes, 7), { compression: "DEFLATE" });
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function main() {
  const env = describeClassroomRenderer();
  console.info("[CLASSROOM_RENDER] diagnostic", env);
  const inputPath = process.argv[2];
  const pptx = inputPath
    ? await readFile(inputPath)
    : await buildPptx(20, 2 * 1024 * 1024);
  console.info("[CLASSROOM_RENDER] source", { bytes: pptx.length, path: inputPath || "(synthetic 20-slide + 2MB deflate media)" });

  const outputDir = await mkdtemp(path.join(os.tmpdir(), "classroom-slide1-"));
  try {
    const result = await renderPresentationSlides(pptx, outputDir, {
      maxSlides: 1,
      presentationId: "diagnostic-slide-1",
    });
    console.info("[CLASSROOM_RENDER] slide1_result", {
      success: result.success,
      slideCount: result.slideCount,
      rendered: result.renders.length,
      errors: result.errors.slice(0, 5),
    });
    assert.ok(result.renders.length === 1, "expected exactly one SVG for the slide-1 diagnostic");
    const svg = result.renders[0].svgText || await readFile(path.join(outputDir, path.basename(result.renders[0].path)), "utf8");
    assert.equal(isValidRenderedSvg(svg), true, "slide 1 SVG failed validation");
    console.info("[CLASSROOM_RENDER] slide1_svg_ok", { bytes: svg.length, startsWithSvg: svg.trimStart().toLowerCase().startsWith("<svg") || svg.includes("<svg") });
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
