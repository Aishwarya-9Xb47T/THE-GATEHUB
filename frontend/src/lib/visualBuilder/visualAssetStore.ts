/**
 * In-memory store for visual authoring assets pending publish.
 * Files are keyed by original filename (must match contentBlocks file refs).
 */

const pendingFiles = new Map<string, File>();
const blobUrls = new Map<string, string>();

export function registerVisualAsset(filename: string, file: File): void {
  const prev = blobUrls.get(filename);
  if (prev) URL.revokeObjectURL(prev);
  pendingFiles.set(filename, file);
  blobUrls.set(filename, URL.createObjectURL(file));
}

export function removeVisualAsset(filename: string): void {
  pendingFiles.delete(filename);
  const url = blobUrls.get(filename);
  if (url) URL.revokeObjectURL(url);
  blobUrls.delete(filename);
}

export function getVisualAssetPreviewUrl(filename: string): string | null {
  return blobUrls.get(filename) || null;
}

export function getPendingVisualAssets(): File[] {
  return Array.from(pendingFiles.values());
}

export function hasPendingAsset(filename: string): boolean {
  return pendingFiles.has(filename);
}

export function clearVisualAssets(): void {
  for (const url of blobUrls.values()) URL.revokeObjectURL(url);
  pendingFiles.clear();
  blobUrls.clear();
}
