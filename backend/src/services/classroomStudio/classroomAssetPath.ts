/**
 * Canonical Interactive Classroom storage paths.
 * Public URL: /uploads/classroom/<presentationId>/<rest>
 * B2 key:     uploads/classroom/<presentationId>/<rest>
 * API URL:    /api/classroom-studio/presentations/<presentationId>/assets/<rest>
 */

export const CLASSROOM_PREFIX = "classroom";
export const CLASSROOM_LEGACY_PREFIX = "classroom-studio";
export const CLASSROOM_SOURCE_REST = "source/original.pptx";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const SVG_MIME = "image/svg+xml";

export function paddedSlideFile(slideNumber: number): string {
  return `slide-${String(slideNumber).padStart(3, "0")}.svg`;
}

export function canonicalSourceRelative(presentationId: string): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/${CLASSROOM_SOURCE_REST}`;
}

export function canonicalSlideSvgRelative(presentationId: string, slideNumber: number): string {
  return `${CLASSROOM_PREFIX}/${presentationId}/renders/${paddedSlideFile(slideNumber)}`;
}

export function canonicalPublicPath(relative: string): string {
  return `/uploads/${relative.replace(/^\/+/, "").replace(/^uploads\//, "")}`;
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

  const slide = base.match(/^slide-(\d{1,4})\.svg$/i);
  if (!slide) return null;
  const n = Number(slide[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return { rest: `renders/${paddedSlideFile(n)}`, mime: SVG_MIME };
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
  if (base.endsWith(".svg")) return SVG_MIME;
  if (base.endsWith(".pptx")) return PPTX_MIME;
  return "application/octet-stream";
}
