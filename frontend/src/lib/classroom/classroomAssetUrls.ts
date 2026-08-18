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

export function classroomVisualUrlCandidates(src: string | undefined, presentationId?: string): string[] {
  if (!src?.trim()) return [];
  const primary = rewriteClassroomAssetRef(src, presentationId);
  const urls: string[] = [primary];

  const swapPrefix = (url: string): string | null => {
    if (url.includes("/uploads/classroom-studio/")) {
      return url.replace("/uploads/classroom-studio/", "/uploads/classroom/");
    }
    if (url.includes("/uploads/classroom/")) {
      return url.replace("/uploads/classroom/", "/uploads/classroom-studio/");
    }
    return null;
  };

  const swapped = swapPrefix(primary);
  if (swapped) urls.push(swapped);

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
    ]) {
      if (!urls.includes(extra)) urls.push(extra);
    }
  }

  return urls;
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
