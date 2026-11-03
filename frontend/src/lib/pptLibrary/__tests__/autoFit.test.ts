import { describe, it, expect } from "vitest";
import {
  calculateAutoFit,
  extractSvgDimensions,
  normalizeSlideSvg,
} from "../autoFit";

describe("Document Auto-Fit Calculations", () => {
  const standard16by9Slide = { width: 960, height: 540, aspectRatio: 16 / 9 };
  const standard4by3Slide = { width: 960, height: 720, aspectRatio: 4 / 3 };
  const a4PortraitPdf = { width: 595.28, height: 841.89, aspectRatio: 595.28 / 841.89 };
  const letterLandscapePdf = { width: 792, height: 612, aspectRatio: 792 / 612 };

  describe("Device Viewport Fitting Verification", () => {
    it("fits 16:9 slide on 1920x1080 desktop fullscreen without clipping", () => {
      // Fullscreen stage: 1920w, 1080h minus toolbar (44px) and bottom dots (44px) = ~992px
      const container = { width: 1920, height: 992 };
      const result = calculateAutoFit(container, standard16by9Slide, {
        paddingX: 24,
        paddingY: 24,
      });

      expect(result.fittedWidth).toBeLessThanOrEqual(result.availableWidth);
      expect(result.fittedHeight).toBeLessThanOrEqual(result.availableHeight);
      expect(result.fittedHeight).toBe(944); // (992 - 48) exactly fits height
      expect(result.fittedWidth).toBe(1678); // 944 * 16/9
      // Aspect ratio preserved within 0.1%
      expect(result.fittedWidth / result.fittedHeight).toBeCloseTo(16 / 9, 2);
    });

    it("fits 16:9 slide on 1366x768 laptop screen without clipping bottom text", () => {
      // Available stage: 1366w, 680h
      const container = { width: 1366, height: 680 };
      const result = calculateAutoFit(container, standard16by9Slide, {
        paddingX: 20,
        paddingY: 20,
      });

      expect(result.fittedWidth).toBeLessThanOrEqual(result.availableWidth);
      expect(result.fittedHeight).toBeLessThanOrEqual(result.availableHeight);
      expect(result.fittedHeight).toBe(640);
      expect(result.fittedWidth).toBe(1138);
      expect(result.isWidthConstrained).toBe(false); // height constrained, so height never cuts off!
    });

    it("fits 16:9 slide and 4:3 slide on 1024x768 tablet", () => {
      const container = { width: 1024, height: 768 };

      const result16x9 = calculateAutoFit(container, standard16by9Slide, {
        paddingX: 16,
        paddingY: 16,
      });
      expect(result16x9.fittedWidth).toBeLessThanOrEqual(result16x9.availableWidth);
      expect(result16x9.fittedHeight).toBeLessThanOrEqual(result16x9.availableHeight);

      const result4x3 = calculateAutoFit(container, standard4by3Slide, {
        paddingX: 16,
        paddingY: 16,
      });
      expect(result4x3.fittedWidth).toBeLessThanOrEqual(result4x3.availableWidth);
      expect(result4x3.fittedHeight).toBeLessThanOrEqual(result4x3.availableHeight);
      expect(result4x3.fittedWidth / result4x3.fittedHeight).toBeCloseTo(4 / 3, 2);
    });

    it("fits on 390x844 mobile phone portrait orientation", () => {
      const container = { width: 390, height: 750 };
      const result = calculateAutoFit(container, standard16by9Slide, {
        paddingX: 12,
        paddingY: 12,
      });

      expect(result.fittedWidth).toBeLessThanOrEqual(result.availableWidth);
      expect(result.fittedHeight).toBeLessThanOrEqual(result.availableHeight);
      expect(result.isWidthConstrained).toBe(true); // width-constrained on mobile portrait
      expect(result.fittedWidth).toBe(366); // 390 - 24
      expect(result.fittedHeight).toBe(206); // 366 / (16/9)
    });

    it("fits on 844x390 mobile phone landscape orientation", () => {
      const container = { width: 844, height: 320 };
      const result = calculateAutoFit(container, standard16by9Slide, {
        paddingX: 12,
        paddingY: 12,
      });

      expect(result.fittedWidth).toBeLessThanOrEqual(result.availableWidth);
      expect(result.fittedHeight).toBeLessThanOrEqual(result.availableHeight);
      expect(result.isWidthConstrained).toBe(false); // height-constrained on mobile landscape
      expect(result.fittedHeight).toBe(296); // 320 - 24
      expect(result.fittedWidth).toBe(526); // 296 * (16/9)
    });

    it("fits A4 portrait PDF on 1920x1080 desktop without vertical overflow", () => {
      const container = { width: 1920, height: 1000 };
      const result = calculateAutoFit(container, a4PortraitPdf, {
        paddingX: 24,
        paddingY: 24,
      });

      expect(result.fittedWidth).toBeLessThanOrEqual(result.availableWidth);
      expect(result.fittedHeight).toBeLessThanOrEqual(result.availableHeight);
      expect(result.fittedHeight).toBe(952); // fits vertical viewport
      expect(result.fittedWidth).toBe(673);
      expect(result.fittedWidth / result.fittedHeight).toBeCloseTo(a4PortraitPdf.aspectRatio, 2);
    });

    it("fits landscape PDF document without clipping", () => {
      const container = { width: 1366, height: 700 };
      const result = calculateAutoFit(container, letterLandscapePdf, {
        paddingX: 20,
        paddingY: 20,
      });

      expect(result.fittedWidth).toBeLessThanOrEqual(result.availableWidth);
      expect(result.fittedHeight).toBeLessThanOrEqual(result.availableHeight);
    });
  });

  describe("SVG Extraction & Normalization", () => {
    it("extracts viewBox dimensions accurately", () => {
      const svg = `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;
      const dims = extractSvgDimensions(svg);
      expect(dims.width).toBe(1920);
      expect(dims.height).toBe(1080);
      expect(dims.aspectRatio).toBeCloseTo(16 / 9, 2);
    });

    it("extracts width and height attributes when viewBox is omitted", () => {
      const svg = `<svg width="720px" height="540px" xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;
      const dims = extractSvgDimensions(svg);
      expect(dims.width).toBe(720);
      expect(dims.height).toBe(540);
      expect(dims.aspectRatio).toBeCloseTo(4 / 3, 2);
    });

    it("normalizes SVG with preserveAspectRatio, viewBox, and 100% dimensions", () => {
      const rawSvg = `<svg width="960" height="540"><path d="M0 0"/></svg>`;
      const normalized = normalizeSlideSvg(rawSvg);
      expect(normalized).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(normalized).toContain('viewBox="0 0 960 540"');
      expect(normalized).toContain('width="100%"');
      expect(normalized).toContain('height="100%"');
    });
  });
});

