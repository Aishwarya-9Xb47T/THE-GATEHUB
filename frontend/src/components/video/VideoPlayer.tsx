import { useState, memo } from "react";
import { Loader2 } from "lucide-react";
import { resolveCourseMediaUrl, resolveLectureVideoUrl, withUploadAuth, redactMediaUrl } from "@/lib/courseMediaUrls";
import { apiUrl } from "@/lib/api";
import { inferUploadVideoMime } from "@/lib/videoUtils";
import { UploadedVideoPlayer } from "@/components/video/UploadedVideoPlayer";
import { MediaInteractionGuard } from "@/components/video/MediaInteractionGuard";
import type { VideoCaptionTrack } from "@/lib/videoCaptions";
import {
  buildVimeoEmbedUrl,
  buildYouTubeEmbedUrl,
  detectVideoSourceType,
  extractVimeoId,
  extractYouTubeId,
  resolveVideoSource,
} from "@/lib/videoSourceUtils";

interface VideoPlayerProps {
  videoUrl?: string;
  url?: string;
  videoType?: string;
  type?: string;
  title?: string;
  className?: string;
  lectureId?: string;
  captions?: VideoCaptionTrack[] | unknown;
  onProgress?: (percent: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  resumeAt?: number;
  embedUrl?: string;
  youtubeId?: string;
  vimeoId?: string;
}

function YouTubeVideoEmbed({
  embedSrc,
  className,
  title,
  isLoading,
  handleLoad,
  handleError,
}: {
  embedSrc: string;
  className: string;
  title: string;
  isLoading: boolean;
  handleLoad: () => void;
  handleError: () => void;
}) {
  return (
    <MediaInteractionGuard mode="embed" className={`bg-black ${className}`} label={title || "YouTube video"}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10 pointer-events-none">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}
      <iframe
        src={embedSrc}
        className="w-full h-full border-0 aspect-video"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        onLoad={handleLoad}
        onError={handleError}
        title={title || "YouTube video"}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </MediaInteractionGuard>
  );
}

export function VideoPlayer(props: VideoPlayerProps) {
  const {
    videoUrl: videoUrlProp,
    url,
    videoType: videoTypeProp,
    type,
    title,
    className = "",
    lectureId,
    captions,
    onProgress,
    onTimeUpdate,
    resumeAt,
    embedUrl: embedUrlProp,
    youtubeId: youtubeIdProp,
    vimeoId: vimeoIdProp,
  } = props;
  const [isLoading, setIsLoading] = useState(true);

  const rawUrl = (videoUrlProp || url || "").replace(/[\r\n]+/g, "").trim();
  const resolved = resolveVideoSource(
    {
      url: rawUrl,
      type: videoTypeProp || type,
      youtubeId: youtubeIdProp,
      vimeoId: vimeoIdProp,
    },
    (ref) => resolveLectureVideoUrl(ref, "upload", lectureId) || resolveCourseMediaUrl(ref) || ref
  );

  const videoType = resolved?.type ?? detectVideoSourceType(rawUrl, videoTypeProp || type);
  const isPublishedLuUpload = /\/uploads\/learning-universes\//i.test(rawUrl);
  const resolvedUrl = isPublishedLuUpload
    ? resolveCourseMediaUrl(rawUrl) || rawUrl
    : resolveLectureVideoUrl(rawUrl, videoType === "external" ? "upload" : videoType, lectureId) ||
      resolveCourseMediaUrl(rawUrl) ||
      rawUrl;

  const streamFallback =
    !isPublishedLuUpload && lectureId ? withUploadAuth(apiUrl(`/api/lectures/video/${lectureId}`)) : undefined;
  const uploadMime = resolvedUrl ? inferUploadVideoMime(resolvedUrl) : "video/mp4";

  const effectiveYoutubeId = youtubeIdProp || resolved?.youtubeId || (videoType === "youtube" ? extractYouTubeId(rawUrl || resolvedUrl) : null);
  const effectiveVimeoId = vimeoIdProp || resolved?.vimeoId;

  const handleLoad = () => setIsLoading(false);
  const handleError = () => setIsLoading(false);

  if (!rawUrl && !effectiveYoutubeId && !effectiveVimeoId) {
    return (
      <div className={`w-full h-full bg-black flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground text-sm">No video available</p>
      </div>
    );
  }

  if (videoType === "vimeo" || effectiveVimeoId) {
    const videoId = effectiveVimeoId || extractVimeoId(resolvedUrl);
    if (!videoId) {
      return (
        <div className={`w-full h-64 bg-red-950/30 border border-red-500/30 rounded-xl flex items-center justify-center ${className}`}>
          <p className="text-red-400 text-sm">Invalid Vimeo URL</p>
        </div>
      );
    }

    const embedSrc = embedUrlProp || buildVimeoEmbedUrl(videoId);
    return (
      <MediaInteractionGuard mode="embed" className={`bg-black ${className}`} label={title || "Vimeo video"}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10 pointer-events-none">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
        <iframe
          src={embedSrc}
          className="w-full h-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          onLoad={handleLoad}
          onError={handleError}
          title={title || "Video"}
          loading="lazy"
        />
      </MediaInteractionGuard>
    );
  }

  if (videoType === "youtube" || effectiveYoutubeId) {
    const videoId = effectiveYoutubeId || resolved?.youtubeId || extractYouTubeId(resolvedUrl);
    if (!videoId) {
      return (
        <div className={`w-full h-64 bg-red-950/30 border border-red-500/30 rounded-xl flex items-center justify-center ${className}`}>
          <p className="text-red-400 text-sm">Invalid YouTube URL — check the link format</p>
        </div>
      );
    }

    const start = resumeAt && resumeAt > 5 ? Math.floor(resumeAt) : undefined;
    const embedSrc = embedUrlProp || buildYouTubeEmbedUrl(videoId, { start });

    return (
      <YouTubeVideoEmbed
        embedSrc={embedSrc}
        className={className}
        title={title || "YouTube video"}
        isLoading={isLoading}
        handleLoad={handleLoad}
        handleError={handleError}
      />
    );
  }

  const fallback =
    streamFallback && resolvedUrl !== streamFallback ? streamFallback : undefined;

  if (typeof window !== "undefined" && resolvedUrl) {
    console.log(
      "[VIDEO_DEBUG]",
      JSON.stringify({
        title: title || "",
        type: videoType,
        mime: uploadMime,
        src: redactMediaUrl(resolvedUrl),
      })
    );
  }

  return (
    <MediaInteractionGuard mode="native" className={`min-h-[220px] aspect-video ${className}`} label={title || "Uploaded video"}>
      <UploadedVideoPlayer
        src={resolvedUrl}
        fallbackSrc={fallback}
        mimeType={uploadMime}
        title={title}
        className="w-full h-full"
        captions={captions}
        onProgress={onProgress}
        onTimeUpdate={onTimeUpdate}
        resumeAt={resumeAt}
      />
    </MediaInteractionGuard>
  );
}

export const VideoPlayerComponent = memo(VideoPlayer);
