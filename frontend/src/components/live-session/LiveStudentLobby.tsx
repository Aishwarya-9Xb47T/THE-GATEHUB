import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Radio, Check, Sparkles, Smile, Search, Shuffle, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";
import { joinLiveSession } from "@/lib/liveSession/api";
import { cn } from "@/lib/utils";
import type { LiveSessionState, LeaderboardEntry } from "@/lib/liveSession/types";
import { AVATAR_CATEGORIES, getAvatarUrl, getRandomAvatar, getFallbackAvatarSvg } from "@/lib/avatarLibrary";

interface LiveStudentLobbyProps {
  sessionState: LiveSessionState;
  myEntry?: LeaderboardEntry;
  sessionId: string;
  stream?: MediaStream | null;
  hasCameraAccess?: boolean | null;
}

export function LiveStudentLobby({ sessionState, myEntry: propMyEntry, sessionId, stream, hasCameraAccess }: LiveStudentLobbyProps) {
  const myEntry = propMyEntry as any;
  const playerCount = sessionState.participants.length;
  const branding = sessionState.quizBranding;

  const [displayName, setDisplayName] = useState(myEntry?.displayName || "");
  const [selectedCategory, setSelectedCategory] = useState(myEntry?.avatarCategory || "minimal");
  const [selectedSeed, setSelectedSeed] = useState<string>("Mi1");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Initialize selectedSeed from avatar URL if exists
  useEffect(() => {
    if (myEntry?.displayName) {
      setDisplayName(myEntry.displayName);
    }
    if (myEntry?.avatarCategory) {
      setSelectedCategory(myEntry.avatarCategory);
    }
    if (myEntry?.avatar) {
      try {
        const url = new URL(myEntry.avatar);
        const seed = url.searchParams.get("seed");
        if (seed) {
          setSelectedSeed(seed);
        } else {
          // If not URL search param, try checking last segment
          const lastSegment = myEntry.avatar.substring(myEntry.avatar.lastIndexOf("/") + 1);
          if (lastSegment && !lastSegment.includes(".")) {
            setSelectedSeed(lastSegment);
          }
        }
      } catch {
        if (myEntry.avatar && !myEntry.avatar.includes("/")) {
          setSelectedSeed(myEntry.avatar);
        }
      }
    }
  }, [myEntry]);

  // Load favorites on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gatehub_avatar_favorites");
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}
  }, []);

  const currentAvatarUrl = getAvatarUrl(selectedCategory, selectedSeed);

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    setSuccess(false);
    try {
      await joinLiveSession(sessionId, displayName, currentAvatarUrl, selectedCategory);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: any) {
      console.error("Failed to update customization:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleShuffle = () => {
    const random = getRandomAvatar();
    setSelectedCategory(random.category);
    setSelectedSeed(random.seed);
    setSearchQuery("");
  };

  const toggleFavorite = (seed: string) => {
    const updated = favorites.includes(seed)
      ? favorites.filter((s) => s !== seed)
      : [...favorites, seed];
    setFavorites(updated);
    localStorage.setItem("gatehub_avatar_favorites", JSON.stringify(updated));
  };

  // Get seeds to render based on selection or search query
  const categorySeeds = useMemo(() => {
    const cat = AVATAR_CATEGORIES.find((c) => c.id === selectedCategory);
    return cat ? cat.seeds : [];
  }, [selectedCategory]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-muted/30 to-background dark:from-background dark:to-muted/10">
      {branding && (
        <QuizCoverBanner
          id={sessionState.id}
          bannerUrl={branding.bannerUrl}
          thumbnailUrl={branding.thumbnailUrl}
          coverImageUrl={branding.coverImageUrl}
          coverGradient={branding.coverGradient}
          theme={branding.theme}
          alt={sessionState.title}
          className="h-36 w-full shrink-0 sm:h-44"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute bottom-4 left-0 right-0 px-6 text-center">
            <h1 className="text-2xl font-bold text-white drop-shadow sm:text-3xl">{sessionState.title}</h1>
          </div>
        </QuizCoverBanner>
      )}

      <div className="h-1 bg-muted">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-amber-500"
          initial={{ width: "0%" }}
          animate={{ width: "10%" }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6 lg:flex-row lg:items-center">
        {/* Lobby State Info */}
        <div className="flex flex-1 flex-col justify-center text-center lg:text-left">
          {!branding && (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 lg:mx-0">
              <Radio className="h-8 w-8 text-primary animate-pulse" />
            </div>
          )}
          {!branding && <h1 className="text-3xl font-extrabold tracking-tight">{sessionState.title}</h1>}
          <p className={cn("text-lg text-muted-foreground mt-2", branding && "mt-0")}>
            Waiting for your instructor to start…
          </p>
          {sessionState.roomCode && (
            <div className="mt-4 flex justify-center lg:justify-start">
              <Badge className="font-mono text-lg px-4 py-1.5 tracking-widest bg-primary/10 text-primary border-primary/20" variant="outline">
                ROOM: {sessionState.roomCode}
              </Badge>
            </div>
          )}

          {/* Camera Preview Widget */}
          {sessionState.settings.cameraRequired && (
            <div className="mt-6 flex flex-col items-center lg:items-start">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Live Video Feed (Mandatory)</h3>
              <div className="relative w-48 h-36 rounded-lg overflow-hidden bg-black border-2 border-primary shadow-lg">
                {stream ? (
                  <video
                    ref={(video) => {
                      if (video && video.srcObject !== stream) {
                        video.srcObject = stream;
                        video.play().catch(() => {});
                      }
                    }}
                    className="w-full h-full object-cover scale-x-[-1]"
                    autoPlay
                    playsInline
                    muted
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-muted-foreground p-3 text-center">
                    <span className="animate-pulse">Loading camera...</span>
                    <span className="mt-1 text-red-500 font-semibold">Webcam permission is required.</span>
                  </div>
                )}
              </div>
              {hasCameraAccess === false && (
                <p className="text-xs text-red-500 font-bold mt-2 animate-bounce">
                  ⚠️ Permission Denied. Please enable camera in browser settings!
                </p>
              )}
            </div>
          )}

          <div className="mt-8 hidden space-y-4 lg:block">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-primary" />
              <span className="text-4xl font-black tabular-nums">{playerCount}</span>
              <span className="text-muted-foreground font-medium">competitors joined in lobby</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              Quiz starts automatically when the host advances. Feel free to personalize your name and avatar below while you wait!
            </p>
          </div>
        </div>

        {/* Premium Avatar & Profile Customizer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl rounded-2xl border bg-card/60 p-6 shadow-xl backdrop-blur-md space-y-6"
        >
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2">
              <Smile className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold">Personalize Competitor Card</h2>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" /> Live Lobby
            </span>
          </div>

          {/* Current Avatar display */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary to-amber-500 rounded-full blur-md opacity-45 group-hover:opacity-75 transition-opacity" />
              <img
                src={currentAvatarUrl}
                alt="Your Avatar"
                className="relative h-20 w-20 rounded-full border-2 border-primary bg-muted p-1 object-cover shadow-inner"
                onError={(e) => {
                  e.currentTarget.src = getFallbackAvatarSvg(displayName || "Player");
                }}
              />
            </div>
            <div className="flex-1 w-full space-y-2">
              <Label htmlFor="nickname" className="text-sm font-semibold">Enter Display Name</Label>
              <div className="flex gap-2">
                <Input
                  id="nickname"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Super Competitor"
                  className="bg-background/80"
                  maxLength={25}
                />
                <Button
                  onClick={handleSave}
                  disabled={saving || !displayName.trim()}
                  className={cn("transition-all duration-300 font-semibold", success && "bg-emerald-600 hover:bg-emerald-600")}
                >
                  {saving ? "Saving..." : success ? <Check className="h-5 w-5" /> : "Save"}
                </Button>
              </div>
            </div>
          </div>

          {/* Avatar categories & controls */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold">Avatar Categories</Label>
              <Button size="sm" variant="outline" onClick={handleShuffle} className="text-xs h-7 flex items-center gap-1">
                <Shuffle className="h-3 w-3" /> Shuffle
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {AVATAR_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setSelectedSeed(cat.seeds[0]!);
                  }}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-lg border capitalize font-medium transition-all",
                    selectedCategory === cat.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground border-transparent"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom keyword seed input */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Custom Keyword (Dynamic Seed)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Type any word (e.g. Dragon, Spark, Rocket)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim()) setSelectedSeed(e.target.value.trim());
                }}
                className="text-xs h-9 bg-background/80"
              />
            </div>
          </div>

          {/* Avatar Selector Grid */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground font-semibold">Select From Collection</Label>
            <div className="grid grid-cols-5 gap-2.5 max-h-36 overflow-y-auto pr-1">
              {categorySeeds.map((seed) => {
                const url = getAvatarUrl(selectedCategory, seed);
                const isSelected = selectedSeed === seed;
                const isFav = favorites.includes(seed);
                return (
                  <button
                    key={seed}
                    onClick={() => setSelectedSeed(seed)}
                    className={cn(
                      "relative rounded-xl border bg-background/50 hover:bg-muted p-1 transition-all overflow-hidden flex items-center justify-center aspect-square",
                      isSelected ? "border-2 border-primary ring-2 ring-primary/20 scale-95" : "border-border/60"
                    )}
                  >
                    <img
                      src={url}
                      alt={seed}
                      className="h-full w-full object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.src = getFallbackAvatarSvg(displayName || "Player");
                      }}
                    />
                    {isSelected && (
                      <div className="absolute right-1 top-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
                        <Check className="h-2 w-2" />
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(seed);
                      }}
                      className="absolute right-1 bottom-1 p-0.5 rounded-full bg-black/40 hover:bg-black/60 text-white"
                    >
                      <Heart className={cn("h-2.5 w-2.5", isFav ? "text-red-500 fill-red-500" : "text-white")} />
                    </button>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Lobby stats display for mobile */}
      <div className="p-6 border-t bg-muted/20 lg:hidden">
        <div className="flex items-center justify-between max-w-sm mx-auto">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-xl font-bold tabular-nums">{playerCount}</span>
            <span className="text-sm text-muted-foreground">in lobby</span>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-primary"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
