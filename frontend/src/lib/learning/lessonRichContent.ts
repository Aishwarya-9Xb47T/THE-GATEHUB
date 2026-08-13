import type { EmbeddedMediaItem } from "@/components/learning/EmbeddedLessonMedia";

export function videosOnly(items: EmbeddedMediaItem[]): EmbeddedMediaItem[] {
  return items.filter((item) => item.type === "video");
}
