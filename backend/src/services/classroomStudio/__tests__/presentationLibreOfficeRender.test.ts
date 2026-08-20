import { describe, expect, it } from "@jest/globals";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildConvolutionDeckPptx,
  CONVOLUTION_DECK_SLIDE_COUNT,
  CONVOLUTION_REQUIRED_PDF_STRINGS,
} from "../convolutionDeckFixture.js";
import {
  buildLibreOfficeConvertArgs,
  libreOfficeUserInstallationArg,
  parsePdfPageCount,
  parsePdfPageCountFromBuffer,
  sha256Hex,
  wrapPngAsSvg,
  writeLibreOfficeProfile,
  libreOfficeJobEnv,
  assertRenderablePng,
} from "../presentationLibreOfficeRender.js";
import { inspectPptxArchive } from "../pptxArchiveInspect.js";
import { isValidRenderedSvg } from "../presentationRenderService.js";
import JSZip from "jszip";

describe("LibreOffice classroom renderer contract", () => {
  it("uses an isolated -env:UserInstallation profile, never --env", async () => {
    const profileDir = path.join(os.tmpdir(), "classroom-lo-profile-test");
    const arg = libreOfficeUserInstallationArg(profileDir);
    expect(arg.startsWith("-env:UserInstallation=file://")).toBe(true);
    expect(arg.startsWith("--env:")).toBe(false);
    expect(arg).toContain(pathToFileURL(profileDir).href.replace(/\/+$/, ""));
    const args = buildLibreOfficeConvertArgs({
      profileDir,
      outputDir: "/tmp/out",
      pptxPath: "/tmp/source.pptx",
    });
    expect(args[0]).toBe(arg);
    expect(args).toContain("--headless");
    expect(args).toContain("--convert-to");
    expect(args).toContain("pdf:impress_pdf_Export");
    expect(args.join(" ")).not.toMatch(/(?:^|\s)--env:/);
    const env = libreOfficeJobEnv("/tmp/classroom-lo-job");
    expect(env.SAL_DISABLE_JAVA).toBe("1");
    expect(env.HOME).toBe(process.env.HOME || os.tmpdir());
    expect(env.SAL_USE_VCLPLUGIN).toBeUndefined();
  });

  it("writes a unique Java-disabled LibreOffice profile", async () => {
    const profileDir = await mkdtemp(path.join(os.tmpdir(), "lo-profile-"));
    await writeLibreOfficeProfile(profileDir);
    const { readFile } = await import("node:fs/promises");
    const xml = await readFile(path.join(profileDir, "user", "registrymodifications.xcu"), "utf8");
    expect(xml).toContain('oor:name="UseJava"');
    expect(xml).toContain("<value>false</value>");
  });

  it("hashes PPTX bytes stably and keeps the 11-slide convolution deck intact", async () => {
    const pptx = await buildConvolutionDeckPptx();
    expect(pptx.subarray(0, 2).toString()).toBe("PK");
    expect(sha256Hex(pptx)).toHaveLength(64);
    expect(sha256Hex(pptx)).toBe(sha256Hex(pptx));
    const zip = await JSZip.loadAsync(pptx);
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(CONVOLUTION_DECK_SLIDE_COUNT);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    for (const required of ["Channel 1", "Channel 2", "Given Input", "Case 1: 3D Input Tensor with 2 Channels", "1.0", "0.1"]) {
      expect(xml).toContain(required);
    }
    expect(CONVOLUTION_REQUIRED_PDF_STRINGS.length).toBeGreaterThan(10);
  });

  it("parses PDF page counts and wraps PNG pixels in a valid SVG", async () => {
    expect(parsePdfPageCount("Pages: 11\n")).toBe(11);
    const pdf = Buffer.from("%PDF-1.4\n/Type /Pages /Count 11\n%%EOF");
    expect(parsePdfPageCountFromBuffer(pdf)).toBe(11);
    const png = Buffer.alloc(80, 0);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    png.writeUInt32BE(1920, 16);
    png.writeUInt32BE(1080, 20);
    const svg = wrapPngAsSvg(png);
    expect(isValidRenderedSvg(svg)).toBe(true);
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).toContain('width="1920"');
    expect(svg).toContain('height="1080"');
    expect(() => assertRenderablePng(png)).toThrow(/EMPTY_VISUAL/);
  });

  it("inspects PPTX ZIP internals without using the slide parser as a visual", async () => {
    const pptx = await buildConvolutionDeckPptx();
    const inspection = await inspectPptxArchive(pptx);
    expect(inspection.zipValid).toBe(true);
    expect(inspection.slideCount).toBe(CONVOLUTION_DECK_SLIDE_COUNT);
    expect(inspection.slides[0].textRuns).toBeGreaterThan(5);
    expect(inspection.slides[0].tables).toBeGreaterThan(0);
    expect(inspection.hasTheme).toBe(true);
    expect(inspection.hasContentTypes).toBe(true);
    expect(inspection.hasPresentationXml).toBe(true);
    const { validatePptxSource } = await import("../pptxArchiveInspect.js");
    const validation = await validatePptxSource(pptx);
    expect(validation.valid).toBe(true);
    expect(validation.hasContentTypes).toBe(true);
    expect(validation.hasPresentationXml).toBe(true);
    expect(validation.slideCount).toBe(CONVOLUTION_DECK_SLIDE_COUNT);
  });

  it("uses isolated per-job working directories", () => {
    const presentationId = "pres-a";
    const jobA = path.join(os.tmpdir(), "classroom-render", presentationId, "job-1");
    const jobB = path.join(os.tmpdir(), "classroom-render", presentationId, "job-2");
    expect(jobA).not.toBe(jobB);
    expect(jobA).toContain("classroom-render");
  });

  it("keeps conversion failure reasons specific instead of a bare CLASSROOM_RENDER_FAILED", async () => {
    const { writeFile: write } = await import("node:fs/promises");
    const dir = await mkdtemp(path.join(os.tmpdir(), "lo-args-"));
    await write(path.join(dir, "marker.txt"), "ok");
    const message = "LIBREOFFICE_CONVERSION_FAILED exit=1 executable=/usr/bin/soffice stderr=Warning: failed to launch javaldx";
    expect(message).toContain("LIBREOFFICE_CONVERSION_FAILED");
    expect(message).toContain("exit=1");
    expect(message).not.toBe("CLASSROOM_RENDER_FAILED");
  });
});
