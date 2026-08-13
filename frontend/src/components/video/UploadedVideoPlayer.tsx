import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Settings,
  Subtitles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatPlaybackTime,
  formatVideoQualityLabel,
  buildAvailableVideoQualities,
  resolveQualityCapPx,
  PLAYBACK_SPEEDS,
  readStoredPlaybackSpeed,
  storePlaybackSpeed,
  readStoredVideoQuality,
  storeVideoQuality,
  type VideoQualityId,
} from "@/lib/videoUtils";
import {
  parseVideoCaptions,
  readStoredCaptionLanguage,
  resolveCaptionTrackUrl,
  storeCaptionLanguage,
  type VideoCaptionTrack,
} from "@/lib/videoCaptions";

interface UploadedVideoPlayerProps {
  src: string;
  fallbackSrc?: string;
  mimeType?: string;
  title?: string;
  className?: string;
  captions?: VideoCaptionTrack[] | unknown;
  onProgress?: (percent: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  resumeAt?: number;
}

export function UploadedVideoPlayer({
  src,
  fallbackSrc,
  mimeType,
  title,
  className = "",
  captions: captionsProp,
  onProgress,
  onTimeUpdate,
  resumeAt = 0,
}: UploadedVideoPlayerProps) {
  const captionTracks = useMemo(() => parseVideoCaptions(captionsProp), [captionsProp]);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeSrc, setActiveSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(readStoredPlaybackSpeed);
  const [selectedQuality, setSelectedQuality] = useState<VideoQualityId>(readStoredVideoQuality);
  const [sourceSize, setSourceSize] = useState({ w: 0, h: 0 });
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [selectedCaption, setSelectedCaption] = useState(readStoredCaptionLanguage);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [didResume, setDidResume] = useState(false);

  const availableQualities = useMemo(
    () => buildAvailableVideoQualities(sourceSize.w, sourceSize.h),
    [sourceSize.w, sourceSize.h]
  );
  const sourceLabel = useMemo(
    () => (sourceSize.w && sourceSize.h ? formatVideoQualityLabel(sourceSize.w, sourceSize.h) : "Auto"),
    [sourceSize.w, sourceSize.h]
  );
  const qualityCapPx = useMemo(
    () => resolveQualityCapPx(selectedQuality, sourceSize.w, sourceSize.h),
    [selectedQuality, sourceSize.w, sourceSize.h]
  );
  const activeQualityLabel = useMemo(() => {
    if (selectedQuality === "auto") return `Auto (${sourceLabel})`;
    return availableQualities.find((q) => q.id === selectedQuality)?.label || sourceLabel;
  }, [selectedQuality, sourceLabel, availableQualities]);

  useEffect(() => {
    setActiveSrc(src);
    setTriedFallback(false);
    setHasError(false);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);
    setDidResume(false);
    setIsPortrait(false);
    setSourceSize({ w: 0, h: 0 });
  }, [src]);

  useEffect(() => {
    if (!availableQualities.some((q) => q.id === selectedQuality)) {
      setSelectedQuality("auto");
      storeVideoQuality("auto");
    }
  }, [availableQualities, selectedQuality]);

  useEffect(() => {
    if (!captionTracks.length) {
      setSelectedCaption("off");
      return;
    }
    const stored = readStoredCaptionLanguage();
    if (stored !== "off" && captionTracks.some((c) => c.language === stored)) {
      setSelectedCaption(stored);
      return;
    }
    const defaultTrack = captionTracks.find((c) => c.default) || captionTracks[0];
    setSelectedCaption(defaultTrack.language);
  }, [src, captionTracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      track.mode =
        selectedCaption !== "off" && track.language === selectedCaption ? "showing" : "hidden";
    }
  }, [selectedCaption, activeSrc, captionTracks]);

  const changeCaption = (language: string) => {
    setSelectedCaption(language);
    storeCaptionLanguage(language);
    setShowCaptions(false);
  };

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
        setShowSettings(false);
        setShowCaptions(false);
      }
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate, activeSrc]);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
        revealControls();
      } catch {
        setHasError(true);
      }
    } else {
      video.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  }, [revealControls]);

  const handleSeek = (value: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(duration)) return;
    const next = Math.max(0, Math.min(value, duration));
    video.currentTime = next;
    setCurrentTime(next);
  };

  const handleVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(value, 1));
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setIsMuted(next === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !isMuted;
    video.muted = next;
    setIsMuted(next);
    if (!next && volume === 0) {
      video.volume = 1;
      setVolume(1);
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackRate(speed);
    storePlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  };

  const changeQuality = (qualityId: VideoQualityId) => {
    setSelectedQuality(qualityId);
    storeVideoQuality(qualityId);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  };

  const retry = () => {
    if (!triedFallback && fallbackSrc && activeSrc !== fallbackSrc) {
      setTriedFallback(true);
      setActiveSrc(fallbackSrc);
      setHasError(false);
      setIsLoading(true);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setHasError(false);
    setIsLoading(true);
    video.load();
  };

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }
      const video = videoRef.current;
      if (!video || hasError) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSeek(video.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSeek(video.currentTime + 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolume(Math.min(1, volume + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolume(Math.max(0, volume - 0.1));
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasError, togglePlay, volume]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full bg-black overflow-hidden group select-none", className)}
      onMouseMove={revealControls}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
    >
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 pointer-events-none">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}

      {hasError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black text-white z-20">
          <p className="text-sm text-red-300">Failed to load video</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : (
        <>
          {isPortrait && (
            <div
              className="absolute inset-0 bg-gradient-to-br from-muted/90 via-background to-primary/15 pointer-events-none"
              aria-hidden
            />
          )}
          <div
            className={cn(
              "relative z-[1] mx-auto h-full flex items-center justify-center",
              isPortrait ? "max-w-[min(100%,420px)]" : "w-full"
            )}
          >
          <video
            ref={videoRef}
            key={activeSrc}
            className={cn(
              "[&::cue]:bg-black/75 [&::cue]:text-white [&::cue]:text-base object-contain",
              qualityCapPx ? "w-auto h-auto max-w-full mx-auto" : "w-full h-full",
              isPortrait && !qualityCapPx ? "max-h-full" : undefined
            )}
            style={
              qualityCapPx
                ? {
                    maxHeight: qualityCapPx,
                    width: "auto",
                    height: "auto",
                  }
                : undefined
            }
            preload="metadata"
            playsInline
            controlsList="nodownload"
            title={title}
            onContextMenu={(e) => e.preventDefault()}
            onClick={togglePlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setDuration(v.duration || 0);
              setSourceSize({ w: v.videoWidth || 0, h: v.videoHeight || 0 });
              setIsPortrait(v.videoHeight > v.videoWidth * 1.05);
              if (!didResume && resumeAt > 3 && v.duration > resumeAt) {
                v.currentTime = resumeAt;
                setCurrentTime(resumeAt);
                setDidResume(true);
              }
              setIsLoading(false);
            }}
            onCanPlay={() => setIsLoading(false)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              setCurrentTime(v.currentTime);
              onTimeUpdate?.(v.currentTime);
              if (v.duration > 0) {
                onProgress?.(Math.round((v.currentTime / v.duration) * 100));
              }
            }}
            onProgress={(e) => {
              const v = e.currentTarget;
              if (v.buffered.length > 0) {
                setBufferedEnd(v.buffered.end(v.buffered.length - 1));
              }
            }}
            onError={() => {
              if (!triedFallback && fallbackSrc && activeSrc !== fallbackSrc) {
                setTriedFallback(true);
                setActiveSrc(fallbackSrc);
                setIsLoading(true);
                return;
              }
              setIsLoading(false);
              setHasError(true);
            }}
          >
            <source src={activeSrc} type={mimeType} />
            {captionTracks.map((cap) => (
              <track
                key={`${cap.language}-${cap.url}`}
                kind="subtitles"
                src={resolveCaptionTrackUrl(cap.url)}
                srcLang={cap.language}
                label={cap.label}
                default={cap.default}
              />
            ))}
          </video>
          </div>

          {!isPlaying && !isLoading && (
            <button
              type="button"
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center z-10"
              aria-label="Play video"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white ring-2 ring-white/30 backdrop-blur-sm transition-transform hover:scale-105">
                <Play className="h-8 w-8 ml-1" fill="currentColor" />
              </span>
            </button>
          )}

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-4 pt-10 transition-opacity duration-300",
              showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            <div className="relative mb-3 h-1.5 cursor-pointer rounded-full bg-white/20 group/seek">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                style={{ width: `${bufferPercent}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${progressPercent}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Seek"
              />
            </div>

            <div className="flex items-center gap-3 text-white">
              <button type="button" onClick={togglePlay} className="p-1.5 hover:text-primary transition-colors" aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" />}
              </button>

              <button type="button" onClick={toggleMute} className="p-1.5 hover:text-primary transition-colors" aria-label={isMuted ? "Unmute" : "Mute"}>
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolume(Number(e.target.value))}
                className="w-20 accent-primary hidden sm:block"
                aria-label="Volume"
              />

              <span className="text-xs tabular-nums text-white/80 min-w-[88px]">
                {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
              </span>

              <span className="flex-1" />

              {captionTracks.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCaptions((v) => !v);
                      setShowSettings(false);
                    }}
                    className={cn(
                      "p-1.5 transition-colors",
                      selectedCaption !== "off" ? "text-primary" : "hover:text-primary text-white"
                    )}
                    aria-label="Captions"
                  >
                    <Subtitles className="w-5 h-5" />
                  </button>

                  {showCaptions && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-white/10 bg-black/95 p-2 shadow-2xl backdrop-blur-md">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 px-2 py-1">
                        Captions
                      </p>
                      <button
                        type="button"
                        onClick={() => changeCaption("off")}
                        className={cn(
                          "w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors",
                          selectedCaption === "off" ? "bg-primary text-primary-foreground" : "text-white/80 hover:bg-white/10"
                        )}
                      >
                        Off
                      </button>
                      {captionTracks.map((cap) => (
                        <button
                          key={cap.language}
                          type="button"
                          onClick={() => changeCaption(cap.language)}
                          className={cn(
                            "w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors",
                            selectedCaption === cap.language
                              ? "bg-primary text-primary-foreground"
                              : "text-white/80 hover:bg-white/10"
                          )}
                        >
                          {cap.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  className="p-1.5 hover:text-primary transition-colors"
                  aria-label="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>

                {showSettings && (
                  <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-white/10 bg-black/95 p-3 shadow-2xl backdrop-blur-md max-h-[70vh] overflow-y-auto">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Playback speed</p>
                    <div className="grid grid-cols-4 gap-1 mb-3">
                      {PLAYBACK_SPEEDS.map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() => changeSpeed(speed)}
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                            playbackRate === speed ? "bg-primary text-primary-foreground" : "text-white/80 hover:bg-white/10"
                          )}
                        >
                          {speed === 1 ? "Normal" : `${speed}x`}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Quality</p>
                    <div className="grid grid-cols-3 gap-1 mb-1">
                      {availableQualities.map((q) => {
                        const isSource =
                          q.id !== "auto" && q.height === Math.min(sourceSize.w, sourceSize.h);
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => changeQuality(q.id)}
                            className={cn(
                              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                              selectedQuality === q.id
                                ? "bg-primary text-primary-foreground"
                                : "text-white/80 hover:bg-white/10"
                            )}
                            title={isSource ? "Original upload resolution" : q.label}
                          >
                            {q.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-white/40 mb-3">
                      {selectedQuality === "auto"
                        ? `Playing at source ${sourceLabel}`
                        : `Capped at ${activeQualityLabel}`}
                    </p>

                    {captionTracks.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Captions</p>
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => changeCaption("off")}
                            className={cn(
                              "w-full rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                              selectedCaption === "off" ? "bg-primary text-primary-foreground" : "text-white/80 hover:bg-white/10"
                            )}
                          >
                            Off
                          </button>
                          {captionTracks.map((cap) => (
                            <button
                              key={cap.language}
                              type="button"
                              onClick={() => changeCaption(cap.language)}
                              className={cn(
                                "w-full rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                                selectedCaption === cap.language
                                  ? "bg-primary text-primary-foreground"
                                  : "text-white/80 hover:bg-white/10"
                              )}
                            >
                              {cap.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {document.pictureInPictureEnabled && (
                <button type="button" onClick={togglePiP} className="p-1.5 hover:text-primary transition-colors hidden md:block" aria-label="Picture in picture">
                  <PictureInPicture2 className="w-5 h-5" />
                </button>
              )}

              <button type="button" onClick={toggleFullscreen} className="p-1.5 hover:text-primary transition-colors" aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
