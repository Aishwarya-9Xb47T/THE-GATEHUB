/** Extract persisted quiz branding from metadata JSON. */
export function extractQuizBrandingFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  quizId?: string
) {
  const meta = metadata || {};
  const nested = (meta.identity && typeof meta.identity === "object" ? meta.identity : {}) as Record<string, unknown>;
  const bannerUrl =
    String(meta.bannerUrl || nested.bannerUrl || meta.coverImageUrl || nested.coverImageUrl || "").trim() || null;
  const thumbnailUrl =
    String(meta.thumbnailUrl || nested.thumbnailUrl || meta.bannerThumbnail || nested.bannerThumbnail || "").trim() ||
    null;
  const theme = String(nested.theme || "dark");
  const coverGradient = String(meta.coverGradient || "").trim() || null;

  return {
    bannerUrl,
    thumbnailUrl,
    coverImageUrl: bannerUrl,
    coverGradient,
    theme,
    quizId: quizId || null,
  };
}
