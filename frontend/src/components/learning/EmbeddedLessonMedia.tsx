import { LessonImageBlock } from "@/components/learning-universe/LessonImageBlock";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { resolveLearningUniverseAsset } from "@/lib/resolveLearningUniverseAsset";
import { resolveVideoSource } from "@/lib/videoSourceUtils";

export interface EmbeddedMediaItem {
  type: "image" | "video";
  file?: string;
  path?: string;
  url?: string;
  caption?: string;
  title?: string;
  youtubeId?: string;
  sourceType?: string;
}

function resolveImageSrc(
  item: EmbeddedMediaItem,
  universeId: string,
  assets?: { filename: string; storedFilename: string }[],
  resolveUrl?: (ref: string) => string
): string {
  const refs = [item.file, item.path, item.url].filter(Boolean).map(String);
  if (resolveUrl) {
    for (const ref of refs) {
      const hit = resolveUrl(ref);
      if (hit) return hit;
    }
    return "";
  }
  for (const ref of refs) {
    const hit = resolveLearningUniverseAsset(ref, universeId, assets);
    if (hit.resolvedUrl) return hit.resolvedUrl;
  }
  return "";
}

interface EmbeddedLessonMediaProps {
  items?: EmbeddedMediaItem[];
  universeId: string;
  assets?: { filename: string; storedFilename: string }[];
  className?: string;
  resolveUrl?: (ref: string) => string;
}

export function EmbeddedLessonMedia({
  items,
  universeId,
  assets,
  className = "space-y-4 my-6",
  resolveUrl,
}: EmbeddedLessonMediaProps) {
  if (!items?.length) return null;

  const resolveUpload = (ref: string) => {
    if (resolveUrl) return resolveUrl(ref);
    return resolveLearningUniverseAsset(ref, universeId, assets).resolvedUrl;
  };

  return (
    <div className={className}>
      {items.map((item, i) => {
        if (item.type === "image") {
          const src = resolveImageSrc(item, universeId, assets, resolveUrl);
          return (
            <LessonImageBlock
              key={`img-${i}-${item.file ?? item.path ?? i}`}
              src={src}
              alt=""
              caption={String(item.caption ?? "")}
            />
          );
        }

        const resolved = resolveVideoSource(
          {
            url: item.youtubeId ? `https://www.youtube.com/watch?v=${item.youtubeId}` : item.url,
            file: item.file || item.path,
            type: item.sourceType ?? (item.youtubeId ? "youtube" : "upload"),
            title: item.title,
            youtubeId: item.youtubeId,
          },
          resolveUpload
        );

        if (!resolved) return null;

        return (
          <div key={`vid-${i}-${item.url ?? item.file ?? i}`} className="space-y-2">
            {item.title ? <p className="text-sm font-medium">{item.title}</p> : null}
            <VideoPlayer
              videoUrl={resolved.url}
              videoType={resolved.type}
              title={String(item.title ?? resolved.title ?? "Video")}
              embedUrl={resolved.embedUrl}
              youtubeId={resolved.youtubeId}
              vimeoId={resolved.vimeoId}
              className="aspect-video w-full rounded-xl overflow-hidden"
            />
          </div>
        );
      })}
    </div>
  );
}

export function readEmbeddedMedia(payload: Record<string, unknown>): {
  before: EmbeddedMediaItem[];
  after: EmbeddedMediaItem[];
} {
  const before = (payload.embeddedMediaBefore as EmbeddedMediaItem[] | undefined) ?? [];
  const after = (payload.embeddedMediaAfter as EmbeddedMediaItem[] | undefined) ?? [];
  const legacy = (payload.embeddedMedia as EmbeddedMediaItem[] | undefined) ?? [];
  return {
    before: before.length ? before : legacy,
    after,
  };
}

export function readEmbeddedMediaFromBlockContent(
  content: Record<string, unknown> | string | undefined
): { before: EmbeddedMediaItem[]; after: EmbeddedMediaItem[] } {
  if (!content || typeof content === "string") return { before: [], after: [] };
  return readEmbeddedMedia(content);
}
