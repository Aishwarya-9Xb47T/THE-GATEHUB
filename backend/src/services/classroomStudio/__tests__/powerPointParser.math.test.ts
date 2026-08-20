import { describe, expect, it } from "@jest/globals";
import JSZip from "jszip";
import { buildConvolutionDeckPptx, CONVOLUTION_DECK_SLIDE_COUNT } from "../convolutionDeckFixture.js";
import {
  collectElementText,
  parsePowerPoint,
  salvageVisibleTextFromXml,
  scanTopLevelSlideShapes,
  summarizeSlideElements,
  unwrapAlternateContentForExtraction,
} from "../powerPointParser.js";

const OMML_MATRIX = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>
  <m:e><m:m>
    <m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr>
    <m:mr><m:e><m:r><m:t>0</m:t></m:r></m:e><m:e><m:r><m:t>1</m:t></m:r></m:e></m:mr>
  </m:m></m:e></m:d>
</m:oMath>`;

async function buildCanonicalMathPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="12192000" cy="6858000"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="274320" y="137160"/><a:ext cx="9144000" cy="548640"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Numerical example of 3D convolution</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:grpSp>
      <p:nvGrpSpPr><p:cNvPr id="3" name="Group 1"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="274320" y="822960"/><a:ext cx="8229600" cy="2743200"/><a:chOff x="0" y="0"/><a:chExt cx="8229600" cy="2743200"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Channel 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="365760"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Channel 1</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:graphicFrame>
        <p:nvGraphicFramePr><p:cNvPr id="5" name="Table 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
        <p:xfrm><a:off x="0" y="457200"/><a:ext cx="2743200" cy="914400"/></p:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
          <a:tbl>
            <a:tblGrid><a:gridCol w="1371600"/><a:gridCol w="1371600"/></a:tblGrid>
            <a:tr h="457200">
              <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>1</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>2</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
            </a:tr>
            <a:tr h="457200">
              <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>0</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>1</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
            </a:tr>
          </a:tbl>
        </a:graphicData></a:graphic>
      </p:graphicFrame>
    </p:grpSp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="6" name="Equation"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="274320" y="4000000"/><a:ext cx="8229600" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:t>Output(1,1) = </a:t></a:r></a:p>
        <a:p>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <a14:m><m:oMathPara>${OMML_MATRIX}</m:oMathPara></a14:m>
            </mc:Choice>
            <mc:Fallback></mc:Fallback>
          </mc:AlternateContent>
        </a:p>
        <a:p><a:r><a:t>(1 × 1) + (2 × 0) + (0 × 0) + (1 × −1)</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("PowerPoint canonical extractor", () => {
  it("keeps convolution table values and titles without LibreOffice", async () => {
    const result = await parsePowerPoint(await buildConvolutionDeckPptx());
    expect(result.success).toBe(true);
    expect(result.slides).toHaveLength(CONVOLUTION_DECK_SLIDE_COUNT);
    const first = result.slides![0];
    const text = collectElementText({ children: first.content.elements });
    expect(first.title).toContain("3D convolution");
    expect(text).toContain("Channel 1");
    expect(text).toContain("Channel 2");
    expect(text).toContain("1.0");
    expect(text).toContain("0.1");
    expect(text).toMatch(/-1|−1/);
    const stats = summarizeSlideElements(first.content.elements);
    expect(stats.tableCount).toBeGreaterThan(0);
    expect(stats.totalTextCharacters).toBeGreaterThan(40);
    expect(first.content.size.width).toBe(9144000);
    expect(first.content.size.height).toBe(5143500);
  });

  it("extracts OMML matrices, grouped tables, and equation text", async () => {
    const result = await parsePowerPoint(await buildCanonicalMathPptx());
    expect(result.success).toBe(true);
    const slide = result.slides![0];
    const text = collectElementText({ children: slide.content.elements });
    expect(text).toContain("Channel 1");
    expect(text).toContain("Output(1,1)");
    expect(text).toContain("1 × 1");
    expect(text).toMatch(/1/);
    expect(text).toMatch(/2/);
    const types = slide.content.elements.map((el: { type: string }) => el.type);
    expect(types).toContain("group");
    expect(types).toContain("text");
    const group = slide.content.elements.find((el: { type: string }) => el.type === "group");
    expect(group?.children?.some((child: { type: string }) => child.type === "table")).toBe(true);
    const stats = summarizeSlideElements(slide.content.elements);
    expect(stats.tableCount).toBe(1);
    expect(stats.totalTextCharacters).toBeGreaterThan(20);
    expect(stats.equationCount + stats.textElementCount).toBeGreaterThan(0);
  });

  it("scans slide drawing children in document order", () => {
    const xml = `<p:sld><p:cSld><p:spTree>
      <p:nvGrpSpPr/><p:grpSpPr/>
      <p:sp></p:sp>
      <p:pic></p:pic>
      <p:grpSp><p:sp></p:sp></p:grpSp>
      <p:graphicFrame></p:graphicFrame>
    </p:spTree></p:cSld></p:sld>`;
    expect(scanTopLevelSlideShapes(xml)).toEqual([
      { tag: "sp", nth: 0 },
      { tag: "pic", nth: 0 },
      { tag: "grpSp", nth: 0 },
      { tag: "graphicFrame", nth: 0 },
    ]);
  });

  it("unwraps AlternateContent so grouped text is not dropped", () => {
    const wrapped = `<p:spTree>
      <mc:AlternateContent>
        <mc:Choice Requires="p14"><p:grpSp><p:sp><p:txBody><a:p><a:r><a:t>Channel 1</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp></mc:Choice>
        <mc:Fallback></mc:Fallback>
      </mc:AlternateContent>
    </p:spTree>`;
    const unwrapped = unwrapAlternateContentForExtraction(wrapped);
    expect(unwrapped).toContain("<p:grpSp>");
    expect(unwrapped).toContain("Channel 1");
    expect(unwrapped).not.toContain("mc:Choice");
    expect(salvageVisibleTextFromXml(wrapped)).toEqual(["Channel 1"]);
  });

  it("extracts zero-size grouped text wrapped in AlternateContent", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
    );
    zip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>`,
    );
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
    );
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="12192000" cy="6858000"/></a:xfrm></p:grpSpPr>
    <mc:AlternateContent>
      <mc:Choice Requires="p14">
        <p:grpSp>
          <p:nvGrpSpPr><p:cNvPr id="3" name="Group 1"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
          <p:grpSpPr><a:xfrm><a:off x="274320" y="822960"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="8229600" cy="2743200"/></a:xfrm></p:grpSpPr>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="4" name="Channel 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
            <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="365760"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
            <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Channel 1</a:t></a:r></a:p></p:txBody>
          </p:sp>
        </p:grpSp>
      </mc:Choice>
      <mc:Fallback></mc:Fallback>
    </mc:AlternateContent>
  </p:spTree></p:cSld>
</p:sld>`,
    );
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );

    const result = await parsePowerPoint(await zip.generateAsync({ type: "nodebuffer" }));
    expect(result.success).toBe(true);
    const slide = result.slides![0];
    const text = collectElementText({ children: slide.content.elements });
    expect(text).toContain("Channel 1");
    expect(slide.title).toContain("Channel 1");
    expect(slide.content.elements.some((el: { type: string }) => el.type === "group")).toBe(true);
    const group = slide.content.elements.find((el: { type: string; position?: { width?: number } }) => el.type === "group");
    expect(Number(group?.position?.width ?? 0)).toBeGreaterThan(0);
  });
});
