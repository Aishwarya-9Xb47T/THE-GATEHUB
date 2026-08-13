import { useCallback, useEffect, useMemo, useState } from "react";
import { Film, PlayCircle, Youtube } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { resolveLearningUniverseAsset } from "@/lib/resolveLearningUniverseAsset";
import {
  defaultVideoLabel,
  resolveVideoSource,
  type ResolvedVideoSource,
  type VideoSourceType,
} from "@/lib/videoSourceUtils";

export interface PlaylistVideoItem extends ResolvedVideoSource {
  id: string;
  label: string;
}

function progressStorageKey(universeId: string, stepId: string, videoId: string): string {
  return `lu-video-progress:${universeId}:${stepId}:${videoId}`;
}

function readStoredProgress(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function storeProgress(key: string, seconds: number): void {
  try {
    localStorage.setItem(key, String(Math.max(0, seconds)));
  } catch {
    /* ignore */
  }
}

function typeIcon(type: VideoSourceType) {
  if (type === "youtube") return Youtube;
  return Film;
}

function typeBadge(type: VideoSourceType): string {
  switch (type) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "external":
      return "Stream";
    default:
      return "Local";
  }
}

interface LessonVideoPlaylistProps {
  stepId: string;
  stepTitle: string;
  universeId: string;
  assets?: { filename: string; storedFilename: string }[];
  videos: Array<Record<string, unknown>>;
  onProgress: (event: string) => void;
}

export function LessonVideoPlaylist({
  stepId,
  stepTitle,
  universeId,
  assets,
  videos: rawVideos,
  onProgress,
}: LessonVideoPlaylistProps) {
  const resolveUpload = useCallback(
    (ref: string) => resolveLearningUniverseAsset(ref, universeId, assets).resolvedUrl,
    [universeId, assets]
  );

  const playlist = useMemo(() => {
    const items: PlaylistVideoItem[] = [];
    const seen = new Set<string>();
    rawVideos.forEach((raw, i) => {
      const resolved = resolveVideoSource(
        {
          url: typeof raw.url === "string" ? raw.url : undefined,
          file: typeof raw.file === "string" ? raw.file : undefined,
          type: typeof raw.type === "string" ? raw.type : undefined,
          title: typeof raw.title === "string" ? raw.title : undefined,
        },
        resolveUpload
      );
      if (!resolved) return;
      if (resolved.type === "youtube" && !resolved.youtubeId) return;
      if (!resolved.url && resolved.type !== "youtube") return;
      const key = `${resolved.type}:${resolved.youtubeId || resolved.vimeoId || resolved.url}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        ...resolved,
        id: typeof raw.id === "string" ? raw.id : `v-${i}`,
        label: resolved.title?.trim() || defaultVideoLabel(resolved.type, items.length),
      });
    });
    return items;
  }, [rawVideos, resolveUpload]);

  const [activeIndex, setActiveIndex] = useState(0);
  const active = playlist[activeIndex] ?? playlist[0];

  useEffect(() => {
    onProgress("view");
  }, [onProgress]);

  useEffect(() => {
    if (activeIndex >= playlist.length && playlist.length > 0) setActiveIndex(0);
  }, [activeIndex, playlist.length]);

  if (!playlist.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <p>No videos available for this lesson.</p>
      </Card>
    );
  }

  const activeProgressKey = active ? progressStorageKey(universeId, stepId, active.id) : "";

  return (
    <Card className="overflow-hidden w-full border-0 shadow-md">
      <div className="px-4 md:px-6 py-4 border-b bg-muted/20">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <PlayCircle className="w-5 h-5 text-primary shrink-0" />
          <h3 className="font-semibold text-lg">{stepTitle || "Lesson Videos"}</h3>
          {playlist.length > 1 && (
            <Badge variant="secondary" className="text-xs">
              {playlist.length} videos
            </Badge>
          )}
        </div>
        {playlist.length > 1 && (
          <p className="text-xs text-muted-foreground">Select a video — progress is saved separately for each.</p>
        )}
      </div>

      <div className="relative w-full bg-black min-h-[220px] md:min-h-[320px]">
        {active && (
          <VideoPlayer
            key={`${active.id}-${active.url}`}
            videoUrl={active.url}
            videoType={active.type === "external" ? "upload" : active.type}
            embedUrl={active.embedUrl}
            youtubeId={active.youtubeId}
            vimeoId={active.vimeoId}
            title={active.label}
            className="w-full min-h-[220px] md:min-h-[320px]"
            resumeAt={readStoredProgress(activeProgressKey)}
            onTimeUpdate={(seconds) => storeProgress(activeProgressKey, seconds)}
            onProgress={(pct) => {
              if (pct >= 90) onProgress("complete");
            }}
          />
        )}
      </div>

      {playlist.length > 1 && (
        <div className="border-t bg-muted/10 p-3 md:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {playlist.map((item, i) => {
              const Icon = typeIcon(item.type);
              const isActive = i === activeIndex;
              const saved = readStoredProgress(progressStorageKey(universeId, stepId, item.id));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <div className="relative shrink-0 w-20 h-12 rounded-md overflow-hidden bg-black/80">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white/70" />
                      </div>
                    )}
                    {saved > 0 && (
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/70 text-white px-1 rounded">
                        resume
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                        {typeBadge(item.type)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{item.label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
