/** Classify course banner URLs without loading storage/AI clients. */

export function isStoredBannerPath(url?: string | null): boolean {
  if (!url?.trim()) return false;
  try {
    const pathname = /^https?:\/\//i.test(url.trim())
      ? new URL(url.trim()).pathname
      : url.trim().split("?")[0];
    return /\/uploads\/(banners|images)\//i.test(pathname.replace(/\\/g, "/"));
  } catch {
    return /\/uploads\/(banners|images)\//i.test(url);
  }
}
