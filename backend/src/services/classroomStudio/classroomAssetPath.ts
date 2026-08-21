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
export const CLASSROOM_VISUAL_DIR = "visuals";
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

export function canonicalSourcePdfRelative(presentationId: string): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/source/original.pdf`;
}

export function canonicalSlidePngRelative(presentationId: string, slideNumber: number): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/renders/${paddedSlidePng(slideNumber)}`;
}

export function canonicalSlideThumbnailRelative(presentationId: string, slideNumber: number): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/renders/slide-${String(slideNumber).padStart(3, "0")}-thumb.png`;
}

export function canonicalSlideSvgRelative(presentationId: string, slideNumber: number): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/renders/${paddedSlideSvg(slideNumber)}`;
}

export function visualFile(slideNumber: number, ext: "png" | "svg" = "svg"): string {
  return `${Math.max(1, Math.floor(Number(slideNumber) || 1))}.${ext}`;
}

export function canonicalVisualRelative(
  presentationId: string,
  slideNumber: number,
  ext: "png" | "svg" = "svg",
): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/${CLASSROOM_VISUAL_DIR}/${visualFile(slideNumber, ext)}`;
}

export function canonicalVisualApi(
  presentationId: string,
  slideNumber: number,
  ext: "png" | "svg" = "svg",
): string {
  return `/api/classroom-studio/presentations/${presentationId}/assets/visuals/${visualFile(slideNumber, ext)}`;
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
export type PresentationRenderStatus = "rendering" | "rendering_partial" | "ready" | "render_failed";

export type OriginalVisualSource = "original_pptx" | "google_embed";

export function buildGoogleSlidesEmbedUrl(presentationId: string, slideNumber = 1): string {
  const id = String(presentationId || "").trim();
  const n = Math.max(1, Math.floor(Number(slideNumber) || 1));
  if (!id) return "";
  return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/embed?start=false&loop=false&delayms=3000000&slide=${n}`;
}

export const googleSlidesEmbedUrl = buildGoogleSlidesEmbedUrl;

export function isGoogleEmbedVisual(visual?: SlideVisualRecord | null): boolean {
  return visual?.visualSource === "google_embed" || visual?.type === "google_slides";
}

export function mergeExtractedSlideVisual(
  existing: SlideVisualRecord | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const keepGoogleEmbed = isGoogleEmbedVisual(existing)
    || next.visualSource === "google_embed"
    || next.type === "google_slides";
  if (!keepGoogleEmbed) return next;
  const googleSlidesId = existing?.googleSlidesId || next.googleSlidesId;
  const googleSlidesUrl = existing?.googleSlidesUrl || next.googleSlidesUrl;
  const slideIndex = Number(next.slideIndex ?? existing?.slideIndex ?? 0);
  const rebuiltEmbed = googleSlidesId
    ? buildGoogleSlidesEmbedUrl(String(googleSlidesId), slideIndex + 1)
    : undefined;
  const embedUrl = rebuiltEmbed || next.embedUrl || existing?.embedUrl;
  return {
    ...existing,
    ...next,
    type: existing?.type || "google_slides",
    visualSource: existing?.visualSource || "google_embed",
    embedUrl,
    googleSlidesId,
    googleSlidesUrl,
    src: existing?.src || embedUrl || next.src,
    renderedImageUrl: existing?.renderedImageUrl || next.renderedImageUrl,
    thumbnailUrl: existing?.thumbnailUrl || next.thumbnailUrl,
    svgUrl: existing?.svgUrl || next.svgUrl,
    availability: "available",
    renderStatus: "ready",
    extractionStatus: next.extractionStatus ?? existing?.extractionStatus ?? "complete",
    errorCode: undefined,
    errorMessage: undefined,
    renderError: null,
  };
}

export function preserveGoogleEmbedVisual(
  existing: SlideVisualRecord | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (isGoogleEmbedVisual(existing)) {
    return mergeExtractedSlideVisual(existing, next);
  }
  return next;
}

export type SlideVisualRecord = {
  type?: string;
  availability?: string;
  renderStatus?: string;
  visualSource?: OriginalVisualSource | "rendered_png";
  extractionStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  jobId?: string;
  attempt?: number;
  renderGeneration?: number;
  sourceHash?: string;
  renderedImageUrl?: string;
  originalFileUrl?: string;
  googleSlidesId?: string;
  googleSlidesUrl?: string;
  embedUrl?: string;
  slideIndex?: number;
};

export function readSlideVisual(content: unknown): SlideVisualRecord | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const visual = (content as { visual?: SlideVisualRecord | null }).visual;
  if (!visual || typeof visual !== "object") return null;
  return visual;
}

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
    renderGeneration?: number;
    rendererVersion?: string;
    visualSource?: OriginalVisualSource | "rendered_png";
    extractionStatus?: string;
    googleSlidesId?: string;
    googleSlidesUrl?: string;
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
    renderGeneration: extra?.renderGeneration,
    rendererVersion: extra?.rendererVersion,
    visualSource: extra?.visualSource,
    extractionStatus: extra?.extractionStatus,
    googleSlidesId: extra?.googleSlidesId,
    googleSlidesUrl: extra?.googleSlidesUrl,
    source,
  };
}

export function buildOriginalSlideVisual(
  presentationId: string,
  slideIndex: number,
  options: {
    sourceType: "powerpoint" | "google_slides";
    visualSource?: OriginalVisualSource;
    googleSlidesId?: string;
    googleSlidesUrl?: string;
    extractionStatus?: string;
  },
): Record<string, unknown> {
  const originalFileUrl = canonicalSourceApi(presentationId);
  const googleId = options.googleSlidesId;
  const embedUrl = googleId ? googleSlidesEmbedUrl(googleId, slideIndex + 1) : undefined;
  const visualSource: OriginalVisualSource = options.visualSource
    ?? (options.sourceType === "google_slides" && googleId ? "google_embed" : "original_pptx");
  return {
    type: visualSource === "google_embed" ? "google_slides" : "original_pptx",
    visualSource,
    src: embedUrl || originalFileUrl,
    originalFileUrl,
    googleSlidesId: googleId,
    googleSlidesUrl: options.googleSlidesUrl,
    embedUrl,
    renderedImageUrl: canonicalSlidePngApi(presentationId, slideIndex + 1),
    thumbnailUrl: canonicalSlidePngApi(presentationId, slideIndex + 1),
    visualCacheUrl: canonicalVisualApi(presentationId, slideIndex + 1, "svg"),
    storageKey: `uploads/${canonicalSourceRelative(presentationId)}`,
    mimeType: visualSource === "google_embed" ? "text/html" : PPTX_MIME,
    slideIndex,
    availability: "available",
    renderStatus: "ready",
    extractionStatus: options.extractionStatus ?? "pending",
    renderError: null,
    source: {
      type: "pptx",
      src: originalFileUrl,
      storageKey: `uploads/${canonicalSourceRelative(presentationId)}`,
      slideIndex,
    },
  };
}

export function isOriginalVisualSource(visual?: SlideVisualRecord | null): boolean {
  return visual?.visualSource === "original_pptx"
    || visual?.visualSource === "google_embed"
    || visual?.type === "original_pptx"
    || visual?.type === "google_slides";
}

export function slideVisualIsReady(content: unknown): boolean {
  const visual = readSlideVisual(content);
  if (!visual) return false;
  if (isOriginalVisualSource(visual) && visual.availability !== "failed") return true;
  return visual.availability === "available" || visual.renderStatus === "ready";
}

export function slideVisualIsInFlight(content: unknown): boolean {
  if (slideVisualIsReady(content)) return false;
  const visual = readSlideVisual(content);
  if (!visual) return false;
  if (isOriginalVisualSource(visual)) return false;
  if (visual.renderStatus === "failed" || visual.availability === "failed") return false;
  return visual.renderStatus === "pending"
    || visual.renderStatus === "rendering"
    || visual.availability === "missing"
    || !visual.renderStatus;
}

export function slideVisualIsFailed(content: unknown): boolean {
  if (slideVisualIsReady(content) || slideVisualIsInFlight(content)) return false;
  const visual = readSlideVisual(content);
  return visual?.renderStatus === "failed" || visual?.availability === "failed" || Boolean(visual?.errorCode);
}

export function isStaleSlideRenderWrite(
  existing: SlideVisualRecord | null | undefined,
  incoming: { jobId?: string; attempt?: number; renderGeneration?: number; renderStatus?: string },
): boolean {
  if (!existing) return false;
  const existingGeneration = existing.renderGeneration ?? 0;
  const incomingGeneration = incoming.renderGeneration ?? 0;
  if (incomingGeneration > 0 && existingGeneration > incomingGeneration) return true;
  if (existing.jobId && incoming.jobId && existing.jobId !== incoming.jobId) {
    if (existing.renderStatus === "ready" && incoming.renderStatus !== "ready") return true;
    if ((existing.attempt || 0) > (incoming.attempt || 0)) return true;
    if (existingGeneration > incomingGeneration) return true;
  }
  return false;
}

export function aggregatePresentationRenderStatus(args: {
  slides: Array<{ content?: unknown }>;
  exclusiveRunning?: boolean;
  jobStatus?: string | null;
}): PresentationRenderStatus {
  const total = args.slides.length;
  if (total === 0) return "ready";
  let ready = 0;
  let inflight = 0;
  let failed = 0;
  let visualSlides = 0;
  for (const slide of args.slides) {
    if (!readSlideVisual(slide.content)) continue;
    visualSlides += 1;
    if (slideVisualIsReady(slide.content)) ready += 1;
    else if (slideVisualIsInFlight(slide.content)) inflight += 1;
    else failed += 1;
  }
  if (visualSlides === 0) return "ready";
  const jobActive = Boolean(args.exclusiveRunning)
    || args.jobStatus === "PENDING"
    || args.jobStatus === "RENDERING";
  if (ready === visualSlides) return "ready";
  if (jobActive || inflight > 0) return ready > 0 ? "rendering_partial" : "rendering";
  if (failed > 0 || ready < visualSlides) return "render_failed";
  return "ready";
}

export function aggregateGoogleExtractionStatus(
  slides: Array<{ content?: unknown }>,
): "pending" | "complete" | "failed" | undefined {
  const visuals = slides.map((slide) => readSlideVisual(slide.content)).filter(isGoogleEmbedVisual);
  if (!visuals.length) return undefined;
  if (visuals.every((visual) => visual?.extractionStatus === "complete")) return "complete";
  if (visuals.every((visual) => visual?.extractionStatus === "failed")) return "failed";
  if (visuals.some((visual) => visual?.extractionStatus === "failed")
    && visuals.every((visual) => visual?.extractionStatus === "failed" || visual?.extractionStatus === "complete")) {
    return "failed";
  }
  return "pending";
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
  const safeKind = kind === "source" || kind === "renders" || kind === "visuals" ? kind : null;
  const raw = String(filename || "");
  if (!safeKind || !raw || /[\\/]/.test(raw) || raw.includes("..") || raw.includes("\0")) return null;
  const base = raw.split("?")[0].split("#")[0];
  if (!base) return null;

  if (safeKind === "source") {
    if (!/^(original|source)\.pptx$/i.test(base)) return null;
    return { rest: CLASSROOM_SOURCE_REST, mime: PPTX_MIME };
  }

  if (safeKind === "visuals") {
    const visual = base.match(/^(?:slide-)?(\d{1,4})\.(svg|png)$/i);
    if (!visual) return null;
    const n = Number(visual[1]);
    if (!Number.isFinite(n) || n < 1) return null;
    const ext = visual[2].toLowerCase() === "png" ? "png" : "svg";
    return {
      rest: `${CLASSROOM_VISUAL_DIR}/${n}.${ext}`,
      mime: ext === "png" ? PNG_MIME : SVG_MIME,
    };
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
