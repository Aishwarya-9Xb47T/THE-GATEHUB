/**
 * Google Slides Adapter Service
 * Integrate with Google Slides API for presentation import
 */

import { google } from 'googleapis';
import { getValidAccessToken } from '../googleWorkspace/googleOAuth.js';
import { exportSlidesToPptxBuffer, exportSlidesToPdfBuffer } from '../googleWorkspace/googleDriveAPI.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { ImportResult, GoogleSlidesImportOptions } from './types.js';

export interface GoogleSlide {
  slideId: string;
  title: string;
  content: any;
  notes?: string;
  order: number;
  thumbnailUrl?: string;
}

// ─── EMU Conversion Helpers ───────────────────────────────────────────────────

/**
 * Google Slides API size magnitudes are always in PT.
 * EMU = PT × 914400 / 72 = PT × 12700
 * If the unit field says EMU, the magnitude is already in EMU.
 */
function ptToEmu(magnitude: number, unit: string): number {
  if (unit === 'EMU') return magnitude;
  // PT (or any other unit treated as PT)
  return Math.round(magnitude * 12700);
}

/**
 * Google Slides API transform.translateX/Y are ALWAYS in EMU.
 * They do NOT follow the size unit. Never multiply by 12700.
 *
 * The AffineTransform in Google Slides API:
 *   translateX, translateY  — position in EMU
 *   scaleX, scaleY          — scale component of the 2×2 affine matrix
 *   shearX, shearY          — shear component
 *
 * Element size.width/height are the LOGICAL dimensions in PT (usually).
 * The visual size is: width * scaleX × height * scaleY,
 * but the API already bakes this into the size fields when it matters.
 * For standard (non-rotated, non-sheared) elements: treat size as final.
 * Convert size from PT→EMU. Position is already in EMU.
 */
function googleTransform(element: any): {
  x: number; y: number; width: number; height: number;
  rotation: number; flipH: boolean; flipV: boolean;
} {
  const transform = element.transform || {};
  const size = element.size || {};

  // Position: always EMU in Google Slides API
  const translateX = typeof transform.translateX === 'number' ? transform.translateX : 0;
  const translateY = typeof transform.translateY === 'number' ? transform.translateY : 0;

  // Size: magnitude in PT (or EMU if unit says so)
  const sizeUnit = size.width?.unit ?? 'PT';
  const rawWidth  = size.width?.magnitude  ?? 0;
  const rawHeight = size.height?.magnitude ?? 0;
  const widthEmu  = ptToEmu(rawWidth,  sizeUnit);
  const heightEmu = ptToEmu(rawHeight, sizeUnit);

  // scaleX / scaleY from the affine matrix affect visual size.
  // When Google returns a non-identity scale (e.g. a resized element that
  // hasn't been fully committed), apply it. Otherwise it is 1.
  const scaleX = typeof transform.scaleX === 'number' ? transform.scaleX : 1;
  const scaleY = typeof transform.scaleY === 'number' ? transform.scaleY : 1;

  // Rotation: stored in radians in Google API (field: "rotation" on element, NOT on transform)
  // However some Google Slides responses put it in transform. Check both.
  const rotationRad = typeof element.rotation === 'number' ? element.rotation
    : typeof transform.rotation === 'number' ? transform.rotation : 0;
  const rotationDeg = rotationRad * (180 / Math.PI);

  return {
    x: Math.round(translateX),
    y: Math.round(translateY),
    width:  Math.round(widthEmu  * scaleX),
    height: Math.round(heightEmu * scaleY),
    rotation: rotationDeg,
    flipH: false,
    flipV: false,
  };
}

export async function importGoogleSlides(
  presentationId: string,
  userId: string,
  options: GoogleSlidesImportOptions = {
    extractNotes: true,
    generateThumbnails: true,
    syncChanges: false,
  }
): Promise<ImportResult> {
  try {
    // Get user's Google tokens
    const user = await (await import('../../utils/prisma.js')).prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleAccessToken: true,
        googleRefreshToken: true,
        googleTokenExpiry: true,
      },
    });

    if (!user?.googleAccessToken || !user.googleRefreshToken) {
      return {
        success: false,
        error: 'Google account not connected. Please connect your Google account in Settings.',
      };
    }

    // Refresh token if needed
    const tokens = await getValidAccessToken({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
      expiry_date: user.googleTokenExpiry?.getTime() || 0,
    });

    // Create Google Slides API client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const slides = google.slides({ version: 'v1', auth });

    // Get presentation
    const presentation = await slides.presentations.get({
      presentationId,
    });

    if (!presentation.data) {
      return {
        success: false,
        error: 'Failed to retrieve presentation from Google Slides',
      };
    }

    // ── Read the actual page size from the presentation. NEVER hardcode. ──
    // Google Slides default: 10" × 7.5" = 9,144,000 × 5,143,500 EMU
    const pageSize = presentation.data.pageSize;
    const slideWidthEmu = pageSize?.width?.magnitude != null
      ? ptToEmu(pageSize.width.magnitude, pageSize.width.unit ?? 'PT')
      : 9_144_000;
    const slideHeightEmu = pageSize?.height?.magnitude != null
      ? ptToEmu(pageSize.height.magnitude, pageSize.height.unit ?? 'PT')
      : 5_143_500;

    // Parse slides into unified SlideDocument format
    const parsedSlides: GoogleSlide[] = [];
    
    if (presentation.data.slides) {
      for (let i = 0; i < presentation.data.slides.length; i++) {
        const slide = presentation.data.slides[i];
        const parsedSlide = await parseGoogleSlide(
          slide,
          i + 1,
          presentationId,
          auth,
          options,
          slideWidthEmu,
          slideHeightEmu,
        );
        parsedSlides.push(parsedSlide);
      }
    }

    return {
      success: true,
      slides: parsedSlides.map((slide) => ({
        title: slide.title,
        content: slide.content,
        notes: slide.notes,
      })),
    };
  } catch (error) {
    console.error('Google Slides import error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import Google Slides',
    };
  }
}

// googleTransform is now defined above importGoogleSlides

/**
 * Convert an RGB object from Google Slides API (values 0–1) to a hex color string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`;
}

/**
 * Resolve a Google Slides API OptionalColor or ColorStyle to a hex string.
 */
function resolveGoogleColor(colorStyle: any): string | undefined {
  if (!colorStyle) return undefined;
  // rgbColor directly
  const rgb = colorStyle?.rgbColor ?? colorStyle?.opaqueColor?.rgbColor;
  if (rgb) return rgbToHex(rgb.red ?? 0, rgb.green ?? 0, rgb.blue ?? 0);
  // themeColor — leave unresolved (renderer handles theme)
  return undefined;
}

/**
 * Parse Google Slides text content array into normalized paragraph/run format.
 *
 * Google Slides API textElement.content is a flat list of StrucuralElement objects.
 * Each StrucuralElement is either:
 *   - textRun: { content, style }  — a run of text
 *   - paragraphMarker: { style, bullet } — marks the END of a paragraph
 * Paragraphs accumulate runs until a paragraphMarker is encountered.
 *
 * Font size: Google Slides returns fontSize.magnitude in PT.
 * Renderer expects sz in half-points. Conversion: sz = pt * 2.
 * (Previously this was pt * 200 — 100× too large — causing enormous text.)
 */
function parseGoogleText(textElement: any) {
  if (!textElement?.content) return [];
  const paragraphs: any[] = [];
  let currentRuns: any[] = [];

  for (const item of textElement.content) {
    // A textRun contains the actual characters
    if (item.textRun) {
      const runText: string = item.textRun.content ?? '';
      // Strip the trailing newline that Google adds at paragraph end (handled by paragraphMarker)
      const cleanText = runText.replace(/\n$/, '');
      const style = item.textRun.style || {};

      // Font size: PT → half-points (sz). Default: 18pt = 36 half-pts (Google Slides body default)
      const sz = style.fontSize?.magnitude != null
        ? Math.round(style.fontSize.magnitude * 2)
        : undefined;  // undefined = inherit/default; renderer will use 2400 (24pt) fallback

      const colorObj = style.foregroundColor?.opaqueColor?.rgbColor
        ?? style.foregroundColor?.rgbColor;
      const hexColor = colorObj
        ? rgbToHex(colorObj.red ?? 0, colorObj.green ?? 0, colorObj.blue ?? 0)
        : undefined;

      currentRuns.push({
        text: cleanText,
        style: {
          sz,
          b: style.bold ? '1' : '0',
          i: style.italic ? '1' : '0',
          u: style.underline ? 'sng' : 'none',
          strike: style.strikethrough ? 'sngStrike' : 'noStrike',
          latin: style.fontFamily || undefined,
          color: hexColor,
        },
      });
    }

    // A paragraphMarker ends the current paragraph and carries paragraph-level style
    if (item.paragraphMarker) {
      const pStyle = item.paragraphMarker.style || {};
      const bullet = item.paragraphMarker.bullet;

      // Alignment: Google uses ALIGNMENT_UNSPECIFIED / START / CENTER / END / JUSTIFIED
      const alignMap: Record<string, string> = {
        START: 'l', CENTER: 'ctr', END: 'r', JUSTIFIED: 'just',
      };
      const algn = alignMap[pStyle.alignment] ?? 'l';

      // Space before/after: in PT, convert to hundredths-of-pt (OOXML spcBef encoding).
      // Renderer uses: spcBef > 0 → percentage thousandths; < 0 → exact hundredths-pt.
      // We store exact hundredths-pt as a positive number and mark with special sign.
      // Actually: renderer already handles spcBef as exact by using negative values.
      // So: spcBef = -(pt * 100) for exact pt values.
      const spcBef = pStyle.spaceAbove?.magnitude != null
        ? -(Math.round(pStyle.spaceAbove.magnitude * 100))
        : undefined;
      const spcAft = pStyle.spaceBelow?.magnitude != null
        ? -(Math.round(pStyle.spaceBelow.magnitude * 100))
        : undefined;

      // Line spacing: lineSpacing is a percentage (100 = single, 150 = 1.5x).
      // Renderer lnSpc > 0 = percent thousandths (100% = 100000).
      const lnSpc = pStyle.lineSpacing != null
        ? Math.round(pStyle.lineSpacing * 1000)
        : undefined;

      // Indentation
      const indentUnit = pStyle.indentStart?.unit ?? 'PT';
      const marL = pStyle.indentStart?.magnitude != null
        ? ptToEmu(pStyle.indentStart.magnitude, indentUnit)
        : undefined;
      const indent = pStyle.indentFirstLine?.magnitude != null
        ? ptToEmu(pStyle.indentFirstLine.magnitude, pStyle.indentFirstLine?.unit ?? 'PT')
        : undefined;

      const text = currentRuns.map((r: any) => r.text).join('');

      // Only emit paragraph if it has runs or is non-empty
      // (Empty paragraphs = spacer lines — keep them for correct spacing)
      paragraphs.push({
        text,
        level: bullet?.nestingLevel ?? 0,
        runs: currentRuns,
        bullet: bullet ? 'bullet' : undefined,
        bulletChar: bullet?.glyph || undefined,
        style: {
          algn,
          lnSpc,
          spcBef,
          spcAft,
          marL,
          indent,
        },
      });
      currentRuns = [];
    }
  }

  // Any trailing runs without a paragraphMarker (shouldn't happen in well-formed data)
  if (currentRuns.length > 0) {
    const text = currentRuns.map((r: any) => r.text).join('');
    if (text) {
      paragraphs.push({ text, level: 0, runs: currentRuns, style: {} });
    }
  }

  return paragraphs;
}

/**
 * Parse a Google Slides background into a normalized fill descriptor.
 */
function parseGoogleBackground(slide: any): any {
  const bg = slide.pageProperties?.pageBackgroundFill;
  if (!bg) return '#ffffff';
  if (bg.solidFill) {
    const color = resolveGoogleColor(bg.solidFill.color);
    return color ?? '#ffffff';
  }
  if (bg.stretchedPictureFill) {
    return { type: 'image', src: bg.stretchedPictureFill.contentUrl };
  }
  return '#ffffff';
}

/**
 * Parse a Google Slides border line into the normalized BorderLine format.
 * Google API TableBorderProperties: borderFill.solidFill.color, weight.magnitude (PT)
 */
function parseGoogleBorderLine(borderProps: any): any | null {
  if (!borderProps) return null;
  const fill = borderProps.tableBorderFill;
  if (!fill) return null;
  const color = resolveGoogleColor(fill.solidFill?.color) ?? '#000000';
  const widthPx = borderProps.weight?.magnitude != null
    ? borderProps.weight.magnitude  // already in PT, renderer uses px — at 96dpi 1pt≈1.333px but slide canvas is 72dpi so 1pt=1px
    : 1;
  return { color, width: widthPx };
}

async function parseGoogleSlide(
  slide: any,
  order: number,
  presentationId: string,
  auth: any,
  options: GoogleSlidesImportOptions,
  slideWidthEmu: number,
  slideHeightEmu: number,
): Promise<GoogleSlide> {
  const elements: any[] = [];

  // Extract page elements into standard SlideElement objects
  if (slide.pageElements) {
    for (const element of slide.pageElements) {
      const position = googleTransform(element);

      // ── Shape (text boxes, labels, shape-with-text) ──────────────────────
      if (element.shape) {
        const paragraphs = element.shape.text ? parseGoogleText(element.shape.text) : [];
        const shapeProps = element.shape.shapeProperties ?? {};

        // Shape fill
        let fill: any = { type: 'none' };
        const bgFill = shapeProps.shapeBackgroundFill;
        if (bgFill?.solidFill) {
          const color = resolveGoogleColor(bgFill.solidFill.color);
          fill = color ? { type: 'solid', color } : { type: 'none' };
        }

        // Text body insets (contentAlignment + autoFit handled separately)
        // Google Slides textBody insets are in PT; convert to EMU for renderer
        const textBody = element.shape.text ? (() => {
          const tb = element.shape.text;
          const style = tb.textStyle ?? {};
          // autoFit: NONE / TEXT_AUTOFIT / SHAPE_AUTOFIT
          const insets = style.contentAlignment ? {} : {};
          // Google puts content padding in shapeProperties.contentAlignment
          // and actual inset in shape.placeholder or auto. Default is:
          // lIns=91440, rIns=91440, tIns=45720, bIns=45720 EMU (≈ 0.1"/0.05")
          return {
            lIns: 91440,
            rIns: 91440,
            tIns: 45720,
            bIns: 45720,
            anchor: 't', // Google default: top
          };
        })() : undefined;

        elements.push({
          id: element.objectId,
          type: paragraphs.length > 0 ? 'text' : 'shape',
          position,
          paragraphs: paragraphs.length > 0 ? paragraphs : undefined,
          fill,
          textBody,
          geometry: element.shape.shapeType?.toLowerCase() ?? 'rect',
        });
      }

      // ── Image ──────────────────────────────────────────────────────────────
      if (element.image) {
        elements.push({
          id: element.objectId,
          type: 'image',
          src: element.image.contentUrl || element.image.sourceUrl,
          position,
        });
      }

      // ── Table ─────────────────────────────────────────────────────────────
      if (element.table) {
        const table = element.table;

        // ── Column widths: read from columnProperties, convert PT→EMU ────────
        // This is the most critical fix — previously columns were never read,
        // causing the renderer to divide table width equally (wrong).
        const columns: number[] = (table.columns ?? []).map((col: any) => {
          const mag = col.columnWidth?.magnitude ?? 0;
          const unit = col.columnWidth?.unit ?? 'PT';
          return ptToEmu(mag, unit);
        });

        const rows: any[] = [];
        for (const row of table.tableRows || []) {
          const rowHeightMag = row.rowHeight?.magnitude ?? 0;
          const rowHeightUnit = row.rowHeight?.unit ?? 'PT';
          const rowHeightEmu = ptToEmu(rowHeightMag, rowHeightUnit);

          const cells: any[] = [];
          for (const cell of row.tableCells || []) {
            const paragraphs = cell.text ? parseGoogleText(cell.text) : [];

            // Cell borders — read from tableBorderProperties
            // In Google API, borders come from table.tableBorderRows/Columns, not per-cell.
            // For now use the cell's tableRowProperties if available.
            const borders: any = {};

            // Cell fill
            let cellFill: any = undefined;
            const tcFill = cell.tableCellProperties?.tableCellBackgroundFill;
            if (tcFill?.solidFill) {
              const color = resolveGoogleColor(tcFill.solidFill.color);
              cellFill = color ? { type: 'solid', color } : undefined;
            }

            // Cell content alignment
            const contentAlignment = cell.tableCellProperties?.contentAlignment;
            const anchorMap: Record<string, string> = {
              TOP: 't', MIDDLE: 'ctr', BOTTOM: 'b', CONTENT_ALIGNMENT_UNSPECIFIED: 't',
            };
            const anchor = anchorMap[contentAlignment ?? ''] ?? 't';

            cells.push({
              paragraphs,
              text: paragraphs.map((p: any) => p.text).join('\n'),
              rowSpan: cell.rowSpan ?? 1,
              colSpan: cell.columnSpan ?? 1,
              fill: cellFill,
              borders,
              anchor,
              // Google Slides default cell inset: 3pt ≈ 38100 EMU
              marL: 38100,
              marR: 38100,
              marT: 19050,
              marB: 19050,
            });
          }
          rows.push({ cells, height: rowHeightEmu });
        }

        elements.push({
          id: element.objectId,
          type: 'table',
          position,
          rows,
          columns,
        });
      }

      // ── Line / connector ──────────────────────────────────────────────────
      if (element.line) {
        const lineFill = element.line.lineProperties;
        const color = resolveGoogleColor(lineFill?.lineFill?.solidFill?.color) ?? '#000000';
        const weight = lineFill?.weight?.magnitude ?? 1;
        elements.push({
          id: element.objectId,
          type: 'connector',
          position,
          fill: { type: 'none' },
          line: { color, width: weight },
        });
      }
    }
  }

  // Slide notes
  let notes: string | undefined;
  if (options.extractNotes && slide.slideProperties) {
    notes = extractSlideNotes(slide.slideProperties);
  }

  // Slide thumbnail
  let thumbnailUrl: string | undefined;
  if (options.generateThumbnails) {
    thumbnailUrl = await getSlideThumbnail(presentationId, slide.objectId, auth);
  }

  const titleText = extractSlideTitle(slide, order);
  const background = parseGoogleBackground(slide);

  return {
    slideId: slide.objectId,
    title: titleText,
    content: {
      version: 2,
      format: 'google_slides',
      // Use actual presentation pageSize passed in from importGoogleSlides
      size: { width: slideWidthEmu, height: slideHeightEmu },
      background,
      elements,
    },
    notes,
    order,
    thumbnailUrl,
  };
}

function extractSlideTitle(slide: any, order: number): string {
  if (slide.pageElements) {
    for (const element of slide.pageElements) {
      if (element.shape && element.shape.text) {
        const paragraphs = parseGoogleText(element.shape.text);
        if (paragraphs.length > 0 && paragraphs[0].text?.trim()) {
          return paragraphs[0].text.trim();
        }
      }
    }
  }
  return `Slide ${order}`;
}

function extractSlideNotes(slideProperties: any): string {
  if (slideProperties?.notesPage?.pageElements) {
    const texts: string[] = [];
    for (const element of slideProperties.notesPage.pageElements) {
      if (element.shape && element.shape.text) {
        const paragraphs = parseGoogleText(element.shape.text);
        texts.push(...paragraphs.map((p: any) => p.text));
      }
    }
    return texts.join('\n').trim();
  }
  return '';
}

async function getSlideThumbnail(
  presentationId: string,
  slideId: string,
  auth: any
): Promise<string | undefined> {
  try {
    const slides = google.slides({ version: 'v1', auth });
    const response = await slides.presentations.pages.getThumbnail({
      presentationId,
      pageObjectId: slideId,
    });
    return response.data.contentUrl ?? undefined;
  } catch {
    return undefined;
  }
}

async function getGoogleTokensForUser(userId: string) {
  const user = await (await import('../../utils/prisma.js')).prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  });

  if (!user?.googleAccessToken || !user.googleRefreshToken) {
    return null;
  }

  return getValidAccessToken({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime() || 0,
  });
}

/**
 * Export a Google Slides presentation to PPTX using the user's OAuth credentials.
 * Used to route authenticated imports through the canonical OOXML parser pipeline.
 */
export async function exportGoogleSlidesToPptxForUser(
  presentationId: string,
  userId: string,
): Promise<{ fileBuffer: Buffer; pdfBuffer?: Buffer } | { error: string }> {
  try {
    const tokens = await getGoogleTokensForUser(userId);
    if (!tokens) {
      return { error: 'Google account not connected. Please connect your Google account in Settings.' };
    }

    const fileBuffer = await exportSlidesToPptxBuffer(tokens, presentationId);
    if (fileBuffer.length < 100 || !fileBuffer.subarray(0, 2).equals(Buffer.from('PK'))) {
      return { error: 'Google Slides export did not return a valid PPTX file.' };
    }

    let pdfBuffer: Buffer | undefined;
    try {
      pdfBuffer = await exportSlidesToPdfBuffer(tokens, presentationId);
      if (pdfBuffer.length < 100 || !pdfBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
        pdfBuffer = undefined;
      }
    } catch (pdfErr) {
      console.warn('[Google Slides export] Direct PDF export not available, will use LibreOffice conversion', pdfErr);
    }

    console.info('[Google Slides export] Authenticated presentation downloaded', {
      presentationId,
      pptxBytes: fileBuffer.length,
      pdfBytes: pdfBuffer?.length,
    });
    return { fileBuffer, pdfBuffer };
  } catch (error) {
    console.error('[Google Slides export] Failed:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to export Google Slides presentation',
    };
  }
}

export async function listGooglePresentations(userId: string): Promise<any[]> {
  try {
    const user = await (await import('../../utils/prisma.js')).prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleAccessToken: true,
        googleRefreshToken: true,
        googleTokenExpiry: true,
      },
    });

    if (!user?.googleAccessToken || !user.googleRefreshToken) {
      throw new AppError(400, 'Google account not connected');
    }

    const tokens = await getValidAccessToken({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
      expiry_date: user.googleTokenExpiry?.getTime() || 0,
    });

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.presentation'",
      fields: 'files(id, name, createdTime, modifiedTime, thumbnailLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    });

    return response.data.files || [];
  } catch (error) {
    console.error('Failed to list Google presentations:', error);
    throw new AppError(500, 'Failed to retrieve Google presentations');
  }
}

export async function watchGooglePresentationChanges(
  presentationId: string,
  userId: string,
  webhookUrl: string
): Promise<string> {
  try {
    const user = await (await import('../../utils/prisma.js')).prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleAccessToken: true,
        googleRefreshToken: true,
        googleTokenExpiry: true,
      },
    });

    if (!user?.googleAccessToken || !user.googleRefreshToken) {
      throw new AppError(400, 'Google account not connected');
    }

    const tokens = await getValidAccessToken({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
      expiry_date: user.googleTokenExpiry?.getTime() || 0,
    });

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.watch({
      fileId: presentationId,
      requestBody: {
        kind: 'api#channel',
        id: `presentation-${presentationId}-${Date.now()}`,
        type: 'web_hook',
        address: webhookUrl,
      },
    });

    return response.data.resourceId || '';
  } catch (error) {
    console.error('Failed to watch presentation changes:', error);
    throw new AppError(500, 'Failed to set up change notifications');
  }
}