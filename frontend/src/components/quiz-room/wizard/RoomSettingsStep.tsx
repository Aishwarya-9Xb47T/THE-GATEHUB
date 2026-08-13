import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LiveSessionSettings, LiveSessionType, WizardExtraSettings } from "./wizardTypes";
import { SESSION_TYPE_LABELS } from "@/lib/liveSession/types";
import { apiUrl, api } from "@/lib/api";
import {
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  Edit2,
  Plus,
  Check,
  Loader2,
  Volume2,
  Trash2,
  Music,
  Upload
} from "lucide-react";

type FullSettings = LiveSessionSettings & WizardExtraSettings;

interface RoomSettingsStepProps {
  title: string;
  sessionType: LiveSessionType;
  settings: FullSettings;
  scheduledAt?: string | null;
  onTitleChange: (title: string) => void;
  onSessionTypeChange: (type: LiveSessionType) => void;
  onSettingsChange: (settings: FullSettings) => void;
  onScheduledAtChange?: (date: string | null) => void;
}

interface SettingSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function SettingSection({ title, description, children }: SettingSectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <h3 className="font-semibold text-white">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-white/50">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function ToggleCard({
  label,
  description,
  checked,
  onChange,
  disabled,
  badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        disabled && "cursor-not-allowed opacity-40",
        checked ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:bg-white/5"
      )}
    >
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-white/40">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {badge && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">{badge}</span>}
        <div
          className={cn(
            "h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors",
            checked ? "bg-primary" : "bg-white/20"
          )}
        >
          <div
            className={cn(
              "h-5 w-5 rounded-full bg-white shadow transition-transform",
              checked && "translate-x-5"
            )}
          />
        </div>
      </div>
    </button>
  );
}

export const DEFAULT_BUILTIN_TRACKS = [
  { id: "calm_piano", name: "Calm Piano", url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3" },
  { id: "chill_beat", name: "Chill Beat", url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=chill-abstract-intention-12099.mp3" },
  { id: "epic_adventure", name: "Epic Adventure", url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=epic-cinematic-trailer-113884.mp3" },
  { id: "electronic_focus", name: "Electronic Focus", url: "https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=deep-ambient-124408.mp3" },
  { id: "upbeat_pop", name: "Upbeat Pop", url: "https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3?filename=upbeat-fun-pop-119053.mp3" },
  { id: "lofi_study", name: "Lofi Study", url: "https://cdn.pixabay.com/download/audio/2022/05/16/audio_db6591201e.mp3?filename=soft-lofi-111634.mp3" },
  { id: "energetic_synth", name: "Energetic Synth", url: "https://cdn.pixabay.com/download/audio/2022/03/24/audio_33b8273646.mp3?filename=synthwave-80s-11004.mp3" },
  { id: "ambient_space", name: "Ambient Space", url: "https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1e5f.mp3?filename=ambient-space-11424.mp3" },
];

export function RoomSettingsStep({
  title,
  sessionType,
  settings,
  scheduledAt,
  onTitleChange,
  onSessionTypeChange,
  onSettingsChange,
  onScheduledAtChange,
}: RoomSettingsStepProps) {
  const patch = (partial: Partial<FullSettings>) => onSettingsChange({ ...settings, ...partial });

  const [defaultTracks, setDefaultTracks] = useState<any[]>([]);
  const [uploadedTracks, setUploadedTracks] = useState<any[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Calm");
  const [previewTrackUrl, setPreviewTrackUrl] = useState<string | null>(null);
  const [editingTrackIndex, setEditingTrackIndex] = useState<number | null>(null);
  const [editingTrackName, setEditingTrackName] = useState("");

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (previewTrackUrl) {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.src = previewTrackUrl;
      previewAudioRef.current.play().catch(() => {});
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    }
  }, [previewTrackUrl]);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const fetchTracks = async () => {
    setLoadingTracks(true);
    try {
      const defRes = await api<any>("/live-sessions/music/default");
      const defaultList = defRes.data && Array.isArray((defRes.data as any).tracks)
        ? (defRes.data as any).tracks
        : [];
      setDefaultTracks(defaultList);

      const upRes = await api<any>("/live-sessions/music/list");
      const uploadedList = upRes.data && Array.isArray((upRes.data as any).tracks)
        ? (upRes.data as any).tracks
        : [];
      setUploadedTracks(uploadedList);
    } catch (err: any) {
      console.error("Failed to fetch tracks:", err);
      setDefaultTracks([]);
      setUploadedTracks([]);
    } finally {
      setLoadingTracks(false);
    }
  };

  useEffect(() => {
    if (settings.musicEnabled) {
      void fetchTracks();
    }
  }, [settings.musicEnabled]);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    
    const onLoadedMetadata = async () => {
      const duration = audio.duration || 180;
      try {
        const token = localStorage.getItem("lms_token");
        const res = await fetch(apiUrl(`/api/live-sessions/music/upload?duration=${duration}`), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        const result = await res.json();
        if (result.success && result.track) {
          const trackData = result.track;
          const uploaded = {
            id: trackData.id || trackData.filename,
            name: trackData.filename || trackData.name || "Custom Uploaded Audio",
            url: `/uploads/${trackData.storageKey || trackData.filename}`,
          };
          patch({ uploadedTrack: uploaded, selectedTrack: uploaded });
        }
      } catch (err: any) {
        console.error("Upload error:", err);
      } finally {
        setUploading(false);
        URL.revokeObjectURL(objectUrl);
      }
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("error", () => {
      console.warn("Failed to load metadata, fallback to default duration");
      void onLoadedMetadata();
    });
    audio.src = objectUrl;
  };

  const handleDeleteTrack = async (trackId: string) => {
    try {
      const res = await api<any>(`/live-sessions/music/${trackId}`, { method: "DELETE" });
      if (res.data && (res.data as any).success) {
        setUploadedTracks((prev) => (Array.isArray(prev) ? prev : []).filter((t) => t.id !== trackId));
        const playlist = (Array.isArray(settings.playlist) ? settings.playlist : []).filter(
          (t: any) => !t.url.includes(trackId)
        );
        patch({ playlist });
      }
    } catch (err: any) {
      console.error("Delete error:", err);
    }
  };

  const moveTrack = (index: number, direction: "up" | "down") => {
    const playlist = [...(settings.playlist || [])];
    if (direction === "up" && index > 0) {
      const temp = playlist[index]!;
      playlist[index] = playlist[index - 1]!;
      playlist[index - 1] = temp;
    } else if (direction === "down" && index < playlist.length - 1) {
      const temp = playlist[index]!;
      playlist[index] = playlist[index + 1]!;
      playlist[index + 1] = temp;
    }
    patch({ playlist });
  };

  const renameTrack = (index: number, newName: string) => {
    const playlist = [...(settings.playlist || [])];
    if (playlist[index]) {
      playlist[index].name = newName;
      patch({ playlist });
    }
    setEditingTrackIndex(null);
  };

  const deleteFromPlaylist = (index: number) => {
    const playlist = (settings.playlist || []).filter((_: any, idx: number) => idx !== index);
    patch({ playlist });
  };

  const addToPlaylist = (track: { name: string; url: string; duration: number }) => {
    const playlist = [...(settings.playlist || [])];
    if (playlist.some((t: any) => t.url === track.url)) return;
    playlist.push(track);
    patch({ playlist });
  };

  const assignEventTrack = (eventKey: string, trackUrl: string) => {
    const eventTracks = { ...(settings.eventTracks || {}) } as any;
    if (trackUrl === "") {
      delete eventTracks[eventKey];
    } else {
      eventTracks[eventKey] = trackUrl;
    }
    patch({ eventTracks });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Room settings</h2>
        <p className="mt-1 text-white/60">Fine-tune timing, scoring, security, and gamification.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-white/70">Room name</Label>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Week 3 Live Review"
            className="border-white/10 bg-white/5 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-white/70">Session type</Label>
          <select
            value={sessionType}
            onChange={(e) => onSessionTypeChange(e.target.value as LiveSessionType)}
            className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
          >
            {Object.entries(SESSION_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k} className="bg-slate-900">
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-white/70">Schedule (optional)</Label>
          <Input
            type="datetime-local"
            value={scheduledAt || ""}
            onChange={(e) => onScheduledAtChange?.(e.target.value)}
            className="border-white/10 bg-white/5 text-white"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingSection title="Timing" description="Control pace and flow">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-white/50">Question time (sec)</Label>
              <Input
                type="number"
                min={5}
                max={300}
                value={settings.questionTimerSeconds}
                onChange={(e) => patch({ questionTimerSeconds: Number(e.target.value) })}
                className="mt-1 border-white/10 bg-white/5 text-white"
              />
            </div>
            <div>
              <Label className="text-xs text-white/50">Break time (sec)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={settings.breakBetweenQuestionsSeconds ?? 5}
                onChange={(e) => patch({ breakBetweenQuestionsSeconds: Number(e.target.value) })}
                className="mt-1 border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>
          <ToggleCard
            label="Countdown"
            description="3-2-1 before each question"
            checked={settings.countdownEnabled ?? true}
            onChange={(v) => patch({ countdownEnabled: v })}
          />
        </SettingSection>

        <SettingSection title="Scoring" description="Points and bonuses">
          <ToggleCard
            label="Speed bonus"
            checked={(settings.scoring?.speedWeight ?? 0) > 0}
            onChange={(v) =>
              patch({
                scoring: { ...settings.scoring, speedWeight: v ? 500 : 0 },
              })
            }
          />
          <ToggleCard
            label="Streak bonus"
            checked={(settings.scoring?.streakBonus ?? 0) > 0}
            onChange={(v) =>
              patch({
                scoring: { ...settings.scoring, streakBonus: v ? 100 : 0 },
              })
            }
          />
          <ToggleCard
            label="Negative marks"
            checked={settings.negativeMarking}
            onChange={(v) => patch({ negativeMarking: v })}
          />
          <ToggleCard label="XP" checked={settings.xpEnabled ?? true} onChange={(v) => patch({ xpEnabled: v })} />
          <ToggleCard label="Coins" checked={settings.coinsEnabled ?? false} onChange={(v) => patch({ coinsEnabled: v })} />
          <ToggleCard
            label="Achievements"
            checked={settings.achievementsEnabled ?? false}
            onChange={(v) => patch({ achievementsEnabled: v })}
          />
        </SettingSection>

        <SettingSection title="Security" description="Access and anti-cheat">
          <ToggleCard
            label="Room password"
            checked={!!settings.roomPassword}
            onChange={(v) => patch({ roomPassword: v ? "room" : undefined })}
          />
          <ToggleCard label="Browser lock" checked={!!settings.browserLock} onChange={(v) => patch({ browserLock: v })} />
          <ToggleCard label="Lock late join" checked={settings.lockLateJoin} onChange={(v) => patch({ lockLateJoin: v })} />
          <ToggleCard label="Guest mode" checked={settings.guestMode ?? false} onChange={(v) => patch({ guestMode: v })} />
          <ToggleCard label="Camera required" checked={!!settings.cameraRequired} onChange={(v) => patch({ cameraRequired: v })} />
          <ToggleCard label="Fullscreen lock" checked={!!settings.fullscreenLock} onChange={(v) => patch({ fullscreenLock: v })} />
          <ToggleCard label="Tab detection" checked={!!settings.tabDetection} onChange={(v) => patch({ tabDetection: v })} />
        </SettingSection>

        <SettingSection title="Gamification" description="Engagement layers">
          <ToggleCard label="Leaderboard" checked={settings.showLeaderboard} onChange={(v) => patch({ showLeaderboard: v })} />
          <ToggleCard label="Lives" checked={(settings.lives ?? 0) > 0} onChange={(v) => patch({ lives: v ? 3 : 0 })} />
          <ToggleCard label="Powerups" checked={!!settings.powerupsEnabled} onChange={(v) => patch({ powerupsEnabled: v })} />
          <ToggleCard
            label="Music"
            checked={!!settings.musicEnabled}
            onChange={(v) =>
              patch({
                musicEnabled: v,
                selectedTrack: v ? (settings.selectedTrack || DEFAULT_BUILTIN_TRACKS[0]) : null,
              })
            }
          />
          {settings.musicEnabled && (
            <div className="mt-4 border border-white/10 rounded-xl p-4 bg-black/30 space-y-4 text-white text-xs col-span-full">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-sm text-primary flex items-center gap-1.5">
                  <Music className="h-4 w-4" /> Background Music
                </span>
                <span className="text-[10px] bg-primary/20 text-primary font-black px-2 py-0.5 rounded-full">
                  Enabled
                </span>
              </div>

              {/* Built-in Royalty-Free Library */}
              <div className="space-y-2">
                <Label className="text-white/70 font-semibold uppercase tracking-wider text-[10px]">
                  Choose Music (Default Library)
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DEFAULT_BUILTIN_TRACKS.map((track) => {
                    const isSelected = settings.selectedTrack?.id === track.id;
                    const isPreviewing = previewTrackUrl === track.url;
                    return (
                      <div
                        key={track.id}
                        onClick={() => patch({ selectedTrack: track })}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                          isSelected
                            ? "bg-primary/15 border-primary text-white shadow-sm"
                            : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                              isSelected ? "border-primary bg-primary text-black" : "border-white/30"
                            )}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                          </div>
                          <span className="font-semibold text-xs truncate">🎵 {track.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewTrackUrl(isPreviewing ? null : track.url);
                            }}
                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-all text-white/80 text-[10px] font-bold flex items-center gap-1"
                          >
                            {isPreviewing ? <Pause className="h-3 w-3 text-amber-400" /> : <Play className="h-3 w-3" />}
                            {isPreviewing ? "Pause" : "Preview"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upload Your Own Music */}
              <div className="border-t border-white/10 pt-3 space-y-3">
                <Label className="text-white/70 font-semibold uppercase tracking-wider text-[10px]">
                  OR Upload Your Own Music
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    id="music-upload-input"
                    accept=".mp3,.wav,.ogg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => document.getElementById("music-upload-input")?.click()}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-white/20 hover:border-primary/50 py-3 rounded-lg bg-white/5 hover:bg-primary/5 transition-all text-white/70 font-semibold"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Uploading Audio file..." : "📁 Upload MP3"}
                  </button>
                </div>

                {settings.uploadedTrack && (
                  <div
                    onClick={() => patch({ selectedTrack: settings.uploadedTrack })}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                      settings.selectedTrack?.id === settings.uploadedTrack.id
                        ? "bg-primary/15 border-primary text-white"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-semibold text-xs truncate">🎵 {settings.uploadedTrack.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewTrackUrl(previewTrackUrl === settings.uploadedTrack?.url ? null : settings.uploadedTrack!.url);
                        }}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold flex items-center gap-1"
                      >
                        {previewTrackUrl === settings.uploadedTrack?.url ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        {previewTrackUrl === settings.uploadedTrack?.url ? "Pause" : "Preview"}
                      </button>
                      {settings.selectedTrack?.id === settings.uploadedTrack.id && (
                        <span className="text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded">
                          ✓ Selected
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <ToggleCard label="Confetti" checked={settings.confettiEnabled ?? true} onChange={(v) => patch({ confettiEnabled: v })} />
          <ToggleCard label="Animations" checked={settings.animationsEnabled ?? true} onChange={(v) => patch({ animationsEnabled: v })} />
        </SettingSection>

        <SettingSection title="AI" description="Live AI assistance">
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleCard label="Generate extra questions" checked={!!settings.aiGenerateExtra} onChange={(v) => patch({ aiGenerateExtra: v })} />
            <ToggleCard label="AI hint" checked={!!settings.aiHint} onChange={(v) => patch({ aiHint: v })} />
            <ToggleCard label="AI explanation" checked={settings.showExplanations} onChange={(v) => patch({ showExplanations: v })} />
            <ToggleCard label="Adaptive difficulty" checked={!!settings.adaptiveDifficulty} onChange={(v) => patch({ adaptiveDifficulty: v })} />
            <ToggleCard label="Auto remediation" checked={!!settings.autoRemediation} onChange={(v) => patch({ autoRemediation: v })} />
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
