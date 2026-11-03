import { describe, it, expect } from "vitest";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import { calculateAutoFit } from "../autoFit";

describe("PDF Library Compatibility & Stress Audit", () => {
  const VIEWPORTS = {
    desktopFhd: { width: 1920, height: 992 },
    laptop: { width: 1366, height: 680 },
    tablet: { width: 1024, height: 768 },
    mobilePortrait: { width: 390, height: 750 },
    mobileLandscape: { width: 844, height: 320 },
  };

  it("1. Generates and validates a Simple 1-page PDF document", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4 Portrait
    page.drawText("THE GATEHUB — Simple Single Page Document", {
      x: 50,
      y: 780,
      size: 18,
    });
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(100);

    // Verify Auto-Fit across viewports
    const dims = { width: 595.28, height: 841.89, aspectRatio: 595.28 / 841.89 };
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      const fit = calculateAutoFit(vp, dims, { paddingX: 20, paddingY: 20 });
      expect(fit.fittedWidth).toBeLessThanOrEqual(fit.availableWidth);
      expect(fit.fittedHeight).toBeLessThanOrEqual(fit.availableHeight);
      expect(fit.scale).toBeGreaterThan(0);
    }
  });

  it("2. Generates and validates a Multi-page 17-page PDF document (matches AyurMitra)", async () => {
    const doc = await PDFDocument.create();
    for (let i = 1; i <= 17; i++) {
      const page = doc.addPage([960, 540]); // 16:9 Presentation slides in PDF
      page.drawText(`AyurMitra Slide ${i} of 17`, { x: 40, y: 500, size: 20 });
    }
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(17);

    // Verify 16:9 Slide PDF fitting
    const dims = { width: 960, height: 540, aspectRatio: 16 / 9 };
    const desktopFit = calculateAutoFit(VIEWPORTS.desktopFhd, dims);
    expect(desktopFit.fittedHeight).toBe(944); // exactly fits height without clipping
    expect(desktopFit.fittedWidth).toBe(1678);
  });

  it("3. Generates and stress-tests a Large 60-page PDF document", async () => {
    const doc = await PDFDocument.create();
    for (let i = 1; i <= 60; i++) {
      const page = doc.addPage([595.28, 841.89]);
      page.drawText(`Chapter ${i}: Advanced Computational Architectures`, {
        x: 50,
        y: 800,
        size: 14,
      });
      page.drawRectangle({
        x: 50,
        y: 400,
        width: 495,
        height: 350,
        color: rgb(0.95, 0.95, 0.98),
      });
    }
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(60);
    expect(bytes.byteLength).toBeGreaterThan(15000);
  });

  it("4. Generates and validates Text-Heavy and Diagram-Rich PDF", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]); // Letter

    // Draw structured diagrams and shapes
    page.drawRectangle({
      x: 50,
      y: 600,
      width: 512,
      height: 120,
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 2,
    });
    page.drawText("Architecture Workflow Block", { x: 70, y: 680, font, size: 14 });
    page.drawCircle({ x: 300, y: 450, size: 50, color: rgb(0.9, 0.4, 0.2) });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("5. Generates and validates Table-Structured PDF document", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);

    // Draw table header & grid
    const rows = 10;
    const colWidths = [120, 180, 195];
    const startY = 700;
    const rowH = 25;

    for (let r = 0; r <= rows; r++) {
      page.drawLine({
        start: { x: 50, y: startY - r * rowH },
        end: { x: 545, y: startY - r * rowH },
        color: rgb(0.7, 0.7, 0.7),
      });
    }
    page.drawText("Topic ID", { x: 55, y: startY - 18, font, size: 10 });
    page.drawText("Material Title", { x: 175, y: startY - 18, font, size: 10 });
    page.drawText("Status & Access", { x: 355, y: startY - 18, font, size: 10 });

    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it("6. Handles Mixed Page Dimensions & Orientations seamlessly", async () => {
    const doc = await PDFDocument.create();
    // Page 1: A4 Portrait
    doc.addPage([595.28, 841.89]);
    // Page 2: Widescreen 16:9 Landscape
    doc.addPage([1920, 1080]);
    // Page 3: Custom Square
    doc.addPage([800, 800]);

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(3);

    const p1 = loaded.getPage(0).getSize();
    const p2 = loaded.getPage(1).getSize();
    const p3 = loaded.getPage(2).getSize();

    expect(p1.width).toBeCloseTo(595.28, 1);
    expect(p2.width).toBe(1920);
    expect(p3.width).toBe(800);

    // Verify Auto-Fit adapts dynamically to every page size
    const fitP1 = calculateAutoFit(VIEWPORTS.desktopFhd, { width: p1.width, height: p1.height });
    const fitP2 = calculateAutoFit(VIEWPORTS.desktopFhd, { width: p2.width, height: p2.height });
    const fitP3 = calculateAutoFit(VIEWPORTS.desktopFhd, { width: p3.width, height: p3.height });

    expect(fitP1.fittedHeight).toBeLessThanOrEqual(fitP1.availableHeight);
    expect(fitP2.fittedWidth).toBeLessThanOrEqual(fitP2.availableWidth);
    expect(fitP3.fittedHeight).toBeLessThanOrEqual(fitP3.availableHeight);
  });

  it("7. Handles Rotated Pages (90, 180, 270 degrees)", async () => {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([600, 800]);
    p1.setRotation(degrees(90));

    const p2 = doc.addPage([600, 800]);
    p2.setRotation(degrees(180));

    const p3 = doc.addPage([600, 800]);
    p3.setRotation(degrees(270));

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);

    expect(loaded.getPage(0).getRotation().angle).toBe(90);
    expect(loaded.getPage(1).getRotation().angle).toBe(180);
    expect(loaded.getPage(2).getRotation().angle).toBe(270);
  });

  it("8. Validates Unicode metadata and multi-language support", async () => {
    const doc = await PDFDocument.create();
    doc.setTitle("आयुर्मित्र: Ayurvedic Knowledge Retrieval (Sanskrit / Hindi / English)");
    doc.setAuthor("N S Aishwarya — THE GATEHUB");
    doc.setSubject("Multi-lingual RAG System with Knowledge Graph Grounding");

    const page = doc.addPage([600, 800]);
    page.drawText("THE GATEHUB - Multilingual Knowledge Base", { x: 50, y: 750, size: 14 });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toContain("Ayurvedic Knowledge Retrieval");
    expect(loaded.getAuthor()).toBe("N S Aishwarya — THE GATEHUB");
  });

  it("9. Correctly flags invalid and corrupted PDF files", async () => {
    const invalidBuffer = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44]); // NOT a PDF header
    let failed = false;
    try {
      await PDFDocument.load(invalidBuffer);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});

