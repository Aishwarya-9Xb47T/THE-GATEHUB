/**
 * Resolve Interactive Classroom slide media URLs for the browser.
 * Mirrors backend classroomAssetUrls — keep the two lists in sync.
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

function swapClassroomPrefix(url: string): string | null {
  if (url.includes("/uploads/classroom-studio/")) {
    return url.replace("/uploads/classroom-studio/", "/uploads/classroom/");
  }
  if (url.includes("/uploads/classroom/")) {
    return url.replace("/uploads/classroom/", "/uploads/classroom-studio/");
  }
  return null;
}

function withPaddedSlideName(url: string): string[] {
  const match = url.match(/^(.*\/renders\/slide-)(\d+)(\.svg)$/i);
  if (!match) return [];
  const n = Number(match[2]);
  if (!Number.isFinite(n)) return [];
  return [
    `${match[1]}${String(n).padStart(3, "0")}${match[3]}`,
    `${match[1]}${n}${match[3]}`,
  ];
}

export function toClassroomApiAssetUrl(url: string): string | null {
  const cleaned = url.split("?")[0];
  const apiMatch = cleaned.match(/\/api\/classroom-studio\/presentations\/([^/]+)\/assets\/(.+)$/);
  if (apiMatch) return `/api/classroom-studio/presentations/${apiMatch[1]}/assets/${apiMatch[2]}`;
  const uploadMatch = cleaned.match(/\/uploads\/classroom(?:-studio)?\/([^/]+)\/(.+)$/);
  if (!uploadMatch) return null;
  return `/api/classroom-studio/presentations/${uploadMatch[1]}/assets/${uploadMatch[2]}`;
}

export function classroomVisualUrlCandidates(src: string | undefined, presentationId?: string): string[] {
  if (!src?.trim()) return [];
  const primary = rewriteClassroomAssetRef(src, presentationId);
  const urls: string[] = [primary];

  const swapped = swapClassroomPrefix(primary);
  if (swapped) urls.push(swapped);

  for (const current of [...urls]) {
    for (const padded of withPaddedSlideName(current)) {
      if (!urls.includes(padded)) urls.push(padded);
    }
  }

  if (/\.pptx($|\?)/i.test(primary)) {
    const withPptxName = (url: string, nextName: string): string | null => {
      if (/\/source\/original\.pptx$/i.test(url)) return url.replace(/\/source\/original\.pptx$/i, `/${nextName}`);
      if (/\/source\.pptx$/i.test(url)) return url.replace(/\/source\.pptx$/i, `/source/original.pptx`);
      return null;
    };
    for (const current of [...urls]) {
      const alt = withPptxName(current, "source.pptx");
      if (alt && !urls.includes(alt)) urls.push(alt);
    }
    if (presentationId) {
      for (const extra of [
        `/uploads/classroom/${presentationId}/source/original.pptx`,
        `/uploads/classroom-studio/${presentationId}/source/original.pptx`,
        `/uploads/classroom/${presentationId}/source.pptx`,
      ]) {
        if (!urls.includes(extra)) urls.push(extra);
      }
    }
  }

  return urls;
}

export function classroomVisualFetchUrls(
  src: string | undefined,
  presentationId?: string,
  kind: "svg" | "pptx" | "any" = "any",
): string[] {
  const storage = classroomVisualUrlCandidates(src, presentationId);
  const filtered = storage.filter((url) => {
    if (kind === "svg") return /\.svg($|\?)/i.test(url);
    if (kind === "pptx") return /\.pptx($|\?)/i.test(url);
    return true;
  });

  if (kind === "pptx" && presentationId) {
    for (const extra of [
      `/uploads/classroom/${presentationId}/source/original.pptx`,
      `/uploads/classroom-studio/${presentationId}/source/original.pptx`,
      `/uploads/classroom/${presentationId}/source.pptx`,
    ]) {
      if (!filtered.includes(extra)) filtered.push(extra);
    }
  }

  const out: string[] = [];
  for (const url of filtered) {
    const api = toClassroomApiAssetUrl(url);
    if (api && !out.includes(api)) out.push(api);
  }
  for (const url of filtered) {
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

export function isSvgMarkup(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"));
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
