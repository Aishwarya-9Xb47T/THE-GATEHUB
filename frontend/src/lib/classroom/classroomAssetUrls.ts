/**
 * Canonical Interactive Classroom slide media URLs.
 * Storage: /uploads/classroom/<presentationId>/source/original.pptx
 *          /uploads/classroom/<presentationId>/renders/slide-NNN.svg
 * Browser: /api/classroom-studio/presentations/<id>/assets/{source|renders}/<file>
 */

const ASSET_PROTOCOL = "asset://";

export function rewriteClassroomAssetRef(value: string, presentationId?: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith(ASSET_PROTOCOL)) {
    if (!presentationId) return trimmed;
    const rest = trimmed.slice(ASSET_PROTOCOL.length).replace(/^\/+/, "");
    if (!rest || rest.split("/").some((part) => part === ".." || part === "")) return trimmed;
    return `/uploads/classroom/${presentationId}/${rest}`;
  }

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const pathName = new URL(trimmed).pathname;
      const marker = pathName.indexOf("/uploads/");
      if (marker !== -1) return pathName.slice(marker).split("?")[0];
    }
  } catch {
    /* keep */
  }

  if (trimmed.startsWith("/uploads/")) return trimmed.split("?")[0];
  return trimmed;
}

function paddedSlideFile(slideNumber: number): string {
  return `slide-${String(slideNumber).padStart(3, "0")}.svg`;
}

export function canonicalClassroomApiAsset(
  presentationId: string,
  kind: "source" | "renders",
  filename: string,
): string {
  return `/api/classroom-studio/presentations/${presentationId}/assets/${kind}/${filename}`;
}

export function classroomVisualFetchUrls(
  src: string | undefined,
  presentationId?: string,
  kind: "svg" | "pptx" | "any" = "any",
): string[] {
  if (kind === "pptx") {
    if (!presentationId) return [];
    return [canonicalClassroomApiAsset(presentationId, "source", "original.pptx")];
  }

  const rewritten = rewriteClassroomAssetRef(src || "", presentationId);
  const apiRender = rewritten.match(/\/api\/classroom-studio\/presentations\/([^/]+)\/assets\/renders\/slide-(\d+)\.svg$/i);
  if (kind === "svg" || apiRender) {
    const match = rewritten.match(/\/uploads\/classroom(?:-studio)?\/([^/]+)\/renders\/slide-(\d+)\.svg$/i);
    const id = apiRender?.[1] || match?.[1] || presentationId;
    const n = Number(apiRender?.[2] || match?.[2]);
    if (!id || !Number.isFinite(n) || n < 1) {
      if (kind === "svg") return [];
    } else {
      return [canonicalClassroomApiAsset(id, "renders", paddedSlideFile(n))];
    }
  }

  const uploadMatch = rewritten.match(/\/uploads\/classroom(?:-studio)?\/([^/]+)\/(source|renders)\/([^/]+)$/i);
  if (uploadMatch) {
    const kindPart = uploadMatch[2].toLowerCase() === "source" ? "source" : "renders";
    return [canonicalClassroomApiAsset(uploadMatch[1], kindPart, uploadMatch[3])];
  }
  return rewritten ? [rewritten] : [];
}

export function isSvgMarkup(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"));
}

export function isCompatibleSvgContentType(contentType: string | null): boolean {
  const type = (contentType || "").toLowerCase();
  if (!type) return true;
  if (type.includes("json") || type.includes("html") || type.includes("text/plain")) return false;
  return type.includes("image/svg") || type.includes("xml") || type.includes("octet-stream");
}

export function isCompatiblePptxContentType(contentType: string | null): boolean {
  const type = (contentType || "").toLowerCase();
  if (!type) return true;
  if (type.includes("json") || type.includes("html")) return false;
  return (
    type.includes("presentationml") ||
    type.includes("pptx") ||
    type.includes("octet-stream") ||
    type.includes("zip")
  );
}

export function classroomAssetErrorFromBody(body: unknown): { code: string; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return { code: "CLASSROOM_ASSET_ERROR", message: error };
  if (error && typeof error === "object" && "code" in error) {
    const rec = error as { code?: string; message?: string };
    return { code: String(rec.code || "CLASSROOM_ASSET_ERROR"), message: String(rec.message || "Presentation asset unavailable") };
  }
  return null;
}

export function decodeSlideAltText(text: string): string {
  return text
    .replace(/&#x0*A;/gi, " ")
    .replace(/&#x0*D;/gi, "")
    .replace(/&#10;/g, " ")
    .replace(/&#13;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function isOfficeGeneratedAlt(text: string): boolean {
  return /description automatically generated/i.test(text);
}
