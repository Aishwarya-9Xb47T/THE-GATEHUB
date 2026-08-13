/** Dev-only pipeline logging for Student Preview image debugging. */

export function logStudentPreviewImage(
  stage: string,
  details: Record<string, unknown>
): void {
  if (!import.meta.env.DEV) return;
  if (typeof window !== "undefined" && (window as unknown as { __LU_DEBUG_PREVIEW__?: boolean }).__LU_DEBUG_PREVIEW__ === false) {
    return;
  }
  console.info(`[StudentPreview:${stage}]`, details);
}
