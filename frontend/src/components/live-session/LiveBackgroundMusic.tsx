import { useEffect, useRef, useState } from "react";
import { VolumeX } from "lucide-react";
import { mediaApiBase } from "@/lib/latexEditor/projectAssetResolver";

interface LiveBackgroundMusicProps {
  settings: {
    musicEnabled?: boolean;
    musicPlaying?: boolean;
    selectedTrack?: { id: string; name: string; url: string } | null;
    playlist?: Array<{ name: string; url: string }>;
  };
  phase?: string;
  countdown?: number | null;
  compact?: boolean;
  sessionType?: string;
}

export function LiveBackgroundMusic({ settings, phase }: LiveBackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const musicEnabled = settings?.musicEnabled ?? false;
  const musicPlaying = settings?.musicPlaying ?? false;
  
  // Track can come from selectedTrack or fallback to first item in playlist
  const track = settings?.selectedTrack || settings?.playlist?.[0] || null;

  const autoplayBlockedRef = useRef(autoplayBlocked);
  const musicPlayingRef = useRef(musicPlaying);
  const musicEnabledRef = useRef(musicEnabled);

  useEffect(() => {
    autoplayBlockedRef.current = autoplayBlocked;
    musicPlayingRef.current = musicPlaying;
    musicEnabledRef.current = musicEnabled;
  }, [autoplayBlocked, musicPlaying, musicEnabled]);

  useEffect(() => {
    const handleInteraction = () => {
      if (autoplayBlockedRef.current && audioRef.current && musicPlayingRef.current && musicEnabledRef.current) {
        audioRef.current.play()
          .then(() => setAutoplayBlocked(false))
          .catch(() => {});
      }
    };

    window.addEventListener("click", handleInteraction);
    window.addEventListener("keydown", handleInteraction);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log("[LiveBackgroundMusic RENDER]", {
      musicEnabled,
      musicPlaying,
      phase,
      selectedTrack: track,
      audioSrc: audio.src,
    });

    if (!musicEnabled || !musicPlaying || !track?.url || phase === "QUIZ_FINISHED") {
      console.log("[LiveBackgroundMusic] Music inactive/paused. musicEnabled:", musicEnabled, "musicPlaying:", musicPlaying);
      audio.pause();
      return;
    }

    let srcUrl = track.url;
    if (srcUrl.startsWith("/uploads")) {
      srcUrl = `${mediaApiBase()}${srcUrl}`;
    }

    if (audio.src !== srcUrl) {
      console.log("[LiveBackgroundMusic] Updating audio src to:", srcUrl);
      audio.src = srcUrl;
      audio.load();
    }

    console.log("[LiveBackgroundMusic PRE-PLAY]", {
      audioSrc: audio.src,
      readyState: audio.readyState,
      networkState: audio.networkState,
    });

    audio.play()
      .then(() => {
        console.log("[LiveBackgroundMusic] PLAY SUCCESS: Audio is playing for user.");
        setAutoplayBlocked(false);
      })
      .catch((err) => {
        console.error("[LiveBackgroundMusic] PLAY FAILED:", err.name, err.message);
        if (err.name === "NotAllowedError") {
          setAutoplayBlocked(true);
        }
      });
  }, [track, musicEnabled, musicPlaying, phase]);

  if (!musicEnabled || !track) return null;

  let srcUrl = track.url;
  if (srcUrl.startsWith("/uploads")) {
    srcUrl = `${mediaApiBase()}${srcUrl}`;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[999] pointer-events-auto">
      <audio
        ref={audioRef}
        src={srcUrl}
        loop
        playsInline
        preload="auto"
        className="hidden"
      />
      {autoplayBlocked && (
        <button
          type="button"
          onClick={() => {
            if (audioRef.current) {
              audioRef.current.play()
                .then(() => setAutoplayBlocked(false))
                .catch((e) => console.error("[LiveBackgroundMusic] Fallback click play error:", e));
            }
          }}
          className="flex items-center gap-2 bg-amber-500/90 border border-amber-400 text-black font-extrabold px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-md text-xs animate-bounce cursor-pointer"
        >
          <VolumeX className="h-4 w-4" />
          <span>Tap to play quiz music 🎵</span>
        </button>
      )}
    </div>
  );
}
