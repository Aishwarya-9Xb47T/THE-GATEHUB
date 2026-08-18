/**
 * Safe relative paths under a presentation's classroom upload prefix.
 */

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

export function classroomStorageRelatives(presentationId: string, rest: string): string[] {
  const safeRest = sanitizeClassroomAssetRest(rest);
  if (!safeRest) return [];
  return [
    `classroom/${presentationId}/${safeRest}`,
    `classroom-studio/${presentationId}/${safeRest}`,
  ];
}

export function requestedAssetBasename(rest: string): string {
  const safe = sanitizeClassroomAssetRest(rest) || rest;
  const parts = safe.split("/");
  return parts[parts.length - 1] || "";
}
