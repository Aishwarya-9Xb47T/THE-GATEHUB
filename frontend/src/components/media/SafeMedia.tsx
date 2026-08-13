import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "./mediaMarkdown";
import { extractYouTubeId, buildYouTubeEmbedUrl } from "@/lib/videoSourceUtils";
import { MediaInteractionGuard } from "@/components/video/MediaInteractionGuard";

function MediaFallback({
  label,
  detail,
  onRetry,
}: {
  label: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="my-2 flex flex-col items-start gap-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {label}
      </div>
      {detail ? <p className="text-xs opacity-80 break-all">{detail}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-background"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function SafeImage({
  url,
  alt = "",
  className,
}: {
  url?: string | null;
  alt?: string;
  className?: string;
}) {
  const resolved = resolveMediaUrl(url || "") || "";
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  if (!resolved) {
    return <MediaFallback label="Image unavailable" detail="Missing image URL" />;
  }
  if (failed) {
    return (
      <MediaFallback
        label="Image failed to load"
        detail={resolved}
        onRetry={() => {
          setFailed(false);
          setNonce((n) => n + 1);
        }}
      />
    );
  }

  return (
    <img
      key={nonce}
      src={resolved}
      alt={alt}
      loading="lazy"
      className={cn("my-2 max-h-[min(420px,60vh)] w-auto max-w-full rounded-lg object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}

export function SafeVideo({ url, className }: { url?: string | null; className?: string }) {
  const resolved = resolveMediaUrl(url || "") || "";
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  if (!resolved) {
    return <MediaFallback label="Video unavailable" detail="Missing video URL" />;
  }

  const ytId = extractYouTubeId(resolved);
  if (ytId) {
    return (
      <div className={cn("my-2 aspect-video w-full max-w-full overflow-hidden rounded-xl bg-black", className)}>
        <MediaInteractionGuard mode="embed" className="h-full w-full" label="YouTube video">
          <iframe
            src={buildYouTubeEmbedUrl(ytId)}
            className="h-full w-full border-0"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            title="YouTube video"
          />
        </MediaInteractionGuard>
      </div>
    );
  }

  if (failed) {
    return (
      <MediaFallback
        label="Video failed to load"
        detail={resolved}
        onRetry={() => {
          setFailed(false);
          setNonce((n) => n + 1);
        }}
      />
    );
  }

  return (
    <MediaInteractionGuard mode="native" className="my-2 w-full max-w-full" label="Course video">
      <video
        key={nonce}
        src={resolved}
        controls
        controlsList="nodownload"
        playsInline
        className={cn("w-full max-w-full rounded-lg", className)}
        onError={() => setFailed(true)}
      />
    </MediaInteractionGuard>
  );
}

export function SafeAudio({ url, className }: { url?: string | null; className?: string }) {
  const resolved = resolveMediaUrl(url || "") || "";
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  if (!resolved) {
    return <MediaFallback label="Audio unavailable" detail="Missing audio URL" />;
  }
  if (failed) {
    return (
      <MediaFallback
        label="Audio failed to load"
        detail={resolved}
        onRetry={() => {
          setFailed(false);
          setNonce((n) => n + 1);
        }}
      />
    );
  }

  return (
    <audio
      key={nonce}
      src={resolved}
      controls
      className={cn("my-2 w-full max-w-md", className)}
      onError={() => setFailed(true)}
    />
  );
}
