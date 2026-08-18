/**
 * Resolve Interactive Classroom media paths stored on disk / B2 / in slide JSON.
 * Production files live under /uploads/classroom/<presentationId>/...
 * Older imports used /uploads/classroom-studio/<presentationId>/...
 */

const ASSET_PROTOCOL = "asset://";

function normalizeRelative(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\//i, "");
}

/** Alternate object keys to try when a classroom asset 404s. */
export function classroomAssetLookupRelatives(relativePath: string): string[] {
  const normalized = normalizeRelative(relativePath);
  const match = normalized.match(/^(classroom(?:-studio)?)\/([^/]+)\/(.+)$/i);
  if (!match) return [normalized];

  const presentationId = match[2];
  const rest = match[3];
  const prefixes = ["classroom", "classroom-studio"] as const;
  const restVariants = new Set<string>([rest]);

  if (/^source\/original\.pptx$/i.test(rest)) {
    restVariants.add("source.pptx");
    restVariants.add("original.pptx");
  } else if (/^(source|original)\.pptx$/i.test(rest)) {
    restVariants.add("source/original.pptx");
  }

  const out: string[] = [];
  for (const prefix of prefixes) {
    for (const variant of restVariants) {
      const candidate = `${prefix}/${presentationId}/${variant}`;
      if (!out.includes(candidate)) out.push(candidate);
    }
  }
  return out;
}

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
      if (marker !== -1) {
        return pathName.slice(marker).split("?")[0];
      }
    }
  } catch {
    /* keep original */
  }

  if (trimmed.startsWith("/uploads/")) {
    return trimmed.split("?")[0];
  }

  return trimmed;
}

export function rewriteClassroomAssetTree(value: unknown, presentationId: string): unknown {
  if (typeof value === "string") return rewriteClassroomAssetRef(value, presentationId);
  if (Array.isArray(value)) return value.map((item) => rewriteClassroomAssetTree(item, presentationId));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        rewriteClassroomAssetTree(item, presentationId),
      ]),
    );
  }
  return value;
}

export function classroomPptxFallbackPaths(presentationId: string): string[] {
  return [
    `/uploads/classroom/${presentationId}/source/original.pptx`,
    `/uploads/classroom-studio/${presentationId}/source/original.pptx`,
    `/uploads/classroom/${presentationId}/source.pptx`,
    `/uploads/classroom-studio/${presentationId}/source.pptx`,
  ];
}
