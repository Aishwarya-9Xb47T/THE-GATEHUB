import { describe, expect, it } from "@jest/globals";
import JSZip from "jszip";
import {
  flattenAlternateContent,
  ommlToLatex,
  ommlToPlain,
  flattenPptxMathForLibreOffice,
} from "../pptxOfficeMathFlatten.js";

describe("PPTX Office Math flatten for LibreOffice", () => {
  it("converts OMML matrices and arithmetic into LaTeX", () => {
    const omml = `<m:oMath>
      <m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>
      <m:e><m:m>
        <m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr>
        <m:mr><m:e><m:r><m:t>0</m:t></m:r></m:e><m:e><m:r><m:t>1</m:t></m:r></m:e></m:mr>
      </m:m></m:e></m:d>
    </m:oMath>`;
    expect(ommlToLatex(omml)).toContain("bmatrix");
    expect(ommlToLatex(omml)).toContain("1 & 2");
    expect(ommlToPlain(omml)).toMatch(/1/);
    const step = `<m:oMath><m:r><m:t>(1 × 1) + (2 × 0)</m:t></m:r></m:oMath>`;
    expect(ommlToLatex(step)).toContain("1");
    expect(ommlToLatex(step)).toContain("\\times");
  });

  it("unwraps AlternateContent toward a picture fallback when present", () => {
    const xml = `<p:spTree>
      <mc:AlternateContent>
        <mc:Choice Requires="a14"><a14:m><m:oMath><m:r><m:t>1</m:t></m:r></m:oMath></a14:m></mc:Choice>
        <mc:Fallback><p:pic><p:blipFill><a:blip r:embed="rId9"/></p:blipFill></p:pic></mc:Fallback>
      </mc:AlternateContent>
    </p:spTree>`;
    const flattened = flattenAlternateContent(xml);
    expect(flattened.unwrapped).toBe(1);
    expect(flattened.xml).toContain("<p:pic>");
    expect(flattened.xml).not.toContain("mc:Choice");
  });

  it("inlines Google-style a14:m AlternateContent into drawable text", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
    );
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:p><a:r><a:t>Channel 1:</a:t></a:r></a:p>
        <a:p>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <a14:m><m:oMathPara><m:oMath>
                <m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>
                <m:e><m:m>
                  <m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr>
                  <m:mr><m:e><m:r><m:t>0</m:t></m:r></m:e><m:e><m:r><m:t>1</m:t></m:r></m:e></m:mr>
                </m:m></m:e></m:d>
              </m:oMath></m:oMathPara></a14:m>
            </mc:Choice>
            <mc:Fallback></mc:Fallback>
          </mc:AlternateContent>
        </a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
    );
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    const original = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const flattened = await flattenPptxMathForLibreOffice(original);
    const zipOut = await JSZip.loadAsync(flattened.buffer);
    const xml = await zipOut.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).not.toMatch(/a14:m|m:oMath/);
    expect(xml).toContain("Channel 1:");
    expect(xml).toMatch(/1/);
    expect(xml).toMatch(/2/);
  });

  it("keeps original PPTX bytes distinct from the LibreOffice working copy when math exists", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
    );
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <p:cSld><p:spTree>
    <p:graphicFrame>
      <p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm>
      <a:graphic><a:graphicData>
        <m:oMath><m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr></m:m></m:oMath>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`,
    );
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    const original = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const flattened = await flattenPptxMathForLibreOffice(original);
    expect(flattened.slideCount).toBe(1);
    expect(flattened.mathObjects).toBeGreaterThan(0);
    expect(flattened.originalBytes).toBe(original.length);
    expect(flattened.inlined + flattened.rasterized).toBeGreaterThan(0);
  });
});
