/**
 * Canonical Interactive Classroom storage paths.
 * Public URL: /uploads/classroom/<presentationId>/<rest>
 * B2 key:     uploads/classroom/<presentationId>/<rest>
 * API URL:    /api/classroom-studio/presentations/<presentationId>/assets/<rest>
 */

export const CLASSROOM_PREFIX = "classroom";
export const CLASSROOM_LEGACY_PREFIX = "classroom-studio";
export const CLASSROOM_SOURCE_REST = "source/original.pptx";
export const CLASSROOM_EXPORT_PDF_REST = "source/export.pdf";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const PDF_MIME = "application/pdf";
export const SVG_MIME = "image/svg+xml";
export const PNG_MIME = "image/png";

export function paddedSlideFile(slideNumber: number, ext: "png" | "svg" = "png"): string {
  return `slide-${String(slideNumber).padStart(3, "0")}.${ext}`;
}

export function paddedSlidePng(slideNumber: number): string {
  return paddedSlideFile(slideNumber, "png");
}

export function paddedSlideSvg(slideNumber: number): string {
  return paddedSlideFile(slideNumber, "svg");
}

export function canonicalSourceRelative(presentationId: string): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/${CLASSROOM_SOURCE_REST}`;
}

/** Canonical B2 object key for the uploaded original PPTX. */
export function getClassroomSourceKey(presentationId: string): string {
  return `uploads/${canonicalSourceRelative(presentationId)}`;
}

export function canonicalExportPdfRelative(presentationId: string): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/${CLASSROOM_EXPORT_PDF_REST}`;
}

export function canonicalSlidePngRelative(presentationId: string, slideNumber: number): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/renders/${paddedSlidePng(slideNumber)}`;
}

export function canonicalSlideSvgRelative(presentationId: string, slideNumber: number): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/renders/${paddedSlideSvg(slideNumber)}`;
}

export function canonicalSlidePngApi(presentationId: string, slideNumber: number): string {
  return `/api/classroom-studio/presentations/${presentationId}/assets/renders/${paddedSlidePng(slideNumber)}`;
}

export function canonicalSlideSvgApi(presentationId: string, slideNumber: number): string {
  return `/api/classroom-studio/presentations/${presentationId}/assets/renders/${paddedSlideSvg(slideNumber)}`;
}

export function canonicalSourceApi(presentationId: string): string {
  return `/api/classroom-studio/presentations/${presentationId}/assets/source/original.pptx`;
}

export function canonicalPublicPath(relative: string): string {
  return `/uploads/${relative.replace(/^\/+/, "").replace(/^uploads\//, "")}`;
}

export type SlideRenderStatus = "pending" | "rendering" | "ready" | "failed";

export function buildSlideVisual(
  presentationId: string,
  slideIndex: number,
  hasRenderedImage: boolean,
  error?: { code?: string; message?: string },
  extra?: {
    renderStatus?: SlideRenderStatus;
    sourceHash?: string;
    jobId?: string;
    attempt?: number;
    rendererVersion?: string;
  },
): Record<string, unknown> {
  const renderedImageUrl = canonicalSlidePngApi(presentationId, slideIndex + 1);
  const source = {
    type: "pptx",
    src: canonicalSourceApi(presentationId),
    storageKey: `uploads/${canonicalSourceRelative(presentationId)}`,
    slideIndex,
  };
  const renderStatus: SlideRenderStatus = extra?.renderStatus
    ?? (hasRenderedImage ? "ready" : error?.code ? "failed" : "pending");
  return {
    type: "image",
    src: renderedImageUrl,
    renderedImageUrl,
    storageKey: `uploads/${canonicalSlidePngRelative(presentationId, slideIndex + 1)}`,
    mimeType: PNG_MIME,
    slideIndex,
    availability: hasRenderedImage ? "available" : error?.code ? "failed" : "missing",
    renderStatus,
    renderError: error?.code ? { code: error.code, message: error.message } : null,
    errorCode: error?.code,
    errorMessage: error?.message,
    sourceHash: extra?.sourceHash,
    jobId: extra?.jobId,
    attempt: extra?.attempt,
    rendererVersion: extra?.rendererVersion,
    source,
  };
}

export function slideVisualIsReady(content: unknown): boolean {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  const visual = (content as { visual?: { availability?: string; renderStatus?: string } }).visual;
  if (!visual || typeof visual !== "object") return false;
  return visual.availability === "available" || visual.renderStatus === "ready";
}

export function computeClassroomRenderProgress(
  slides: Array<{ order: number; content?: unknown }>,
): { rendered: number; total: number; currentSlide: number; stage?: string } {
  const ordered = [...slides].sort((a, b) => a.order - b.order);
  const rendered = ordered.filter((slide) => slideVisualIsReady(slide.content)).length;
  const firstMissing = ordered.find((slide) => !slideVisualIsReady(slide.content));
  return {
    rendered,
    total: ordered.length,
    currentSlide: firstMissing?.order ?? Math.max(ordered.length, 0),
  };
}

export function sanitizeClassroomAssetRest(raw: string): string | null {
  const cleaned = String(raw || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("?")[0]
    .split("#")[0];
  if (!cleaned) return null;
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((part) => part === ".." || part === "." || part.includes("\0"))) return null;
  return parts.join("/");
}

export function parseClassroomAssetFilename(kind: string, filename: string): { rest: string; mime: string } | null {
  const safeKind = kind === "source" || kind === "renders" ? kind : null;
  const raw = String(filename || "");
  if (!safeKind || !raw || /[\\/]/.test(raw) || raw.includes("..") || raw.includes("\0")) return null;
  const base = raw.split("?")[0].split("#")[0];
  if (!base) return null;

  if (safeKind === "source") {
    if (!/^(original|source)\.pptx$/i.test(base)) return null;
    return { rest: CLASSROOM_SOURCE_REST, mime: PPTX_MIME };
  }

  const slide = base.match(/^slide-(\d{1,4})\.(svg|png)$/i);
  if (!slide) return null;
  const n = Number(slide[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  const ext = slide[2].toLowerCase() === "png" ? "png" : "svg";
  return {
    rest: `renders/${paddedSlideFile(n, ext)}`,
    mime: ext === "png" ? PNG_MIME : SVG_MIME,
  };
}

export function classroomStorageRelatives(presentationId: string, rest: string): string[] {
  const safeRest = sanitizeClassroomAssetRest(rest);
  if (!safeRest) return [];
  return [
    `${CLASSROOM_PREFIX}/${presentationId}/${safeRest}`,
    `${CLASSROOM_LEGACY_PREFIX}/${presentationId}/${safeRest}`,
  ];
}

export function requestedAssetBasename(rest: string): string {
  const safe = sanitizeClassroomAssetRest(rest) || rest;
  const parts = safe.split("/");
  return parts[parts.length - 1] || "";
}

export function classroomAssetMime(rest: string): string {
  const base = requestedAssetBasename(rest).toLowerCase();
  if (base.endsWith(".png")) return PNG_MIME;
  if (base.endsWith(".svg")) return SVG_MIME;
  if (base.endsWith(".pptx")) return PPTX_MIME;
  if (base.endsWith(".pdf")) return PDF_MIME;
  return "application/octet-stream";
}
