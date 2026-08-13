import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, Minus, Flame, Heart, Coins, Trophy } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/liveSession/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect, useState, useRef, useMemo } from "react";

interface LiveLeaderboardProps {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string | null;
  compact?: boolean;
  className?: string;
}

export function triggerConfetti() {
  const container = document.createElement("div");
  container.className = "pointer-events-none fixed inset-0 z-[100] overflow-hidden";
  document.body.appendChild(container);

  const colors = ["#fbbf24", "#f59e0b", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6"];
  for (let i = 0; i < 100; i++) {
    const el = document.createElement("div");
    const color = colors[Math.floor(Math.random() * colors.length)];
    el.style.position = "absolute";
    el.style.width = `${Math.floor(Math.random() * 8) + 6}px`;
    el.style.height = `${Math.floor(Math.random() * 12) + 6}px`;
    el.style.backgroundColor = color;
    el.style.left = `${Math.random() * 100}%`;
    el.style.top = `-${Math.random() * 20}px`;
    el.style.borderRadius = "2px";
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(el);

    const duration = Math.random() * 2 + 2;
    const drift = (Math.random() - 0.5) * 200;
    el.animate(
      [
        { transform: `translateY(0px) rotate(0deg)`, opacity: 1 },
        { transform: `translateY(105vh) translateX(${drift}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ],
      {
        duration: duration * 1000,
        easing: "ease-out"
      }
    );
  }
  setTimeout(() => container.remove(), 4000);
}

function MovementIcon({ movement, rankChange }: { movement: LeaderboardEntry["movement"]; rankChange?: number }) {
  const changeVal = rankChange ? Math.abs(rankChange) : 0;
  if (movement === "up") return <span className="flex items-center text-xs font-bold text-emerald-500"><ArrowUp className="h-3 w-3 mr-0.5" />{changeVal > 0 ? `+${changeVal}` : ""}</span>;
  if (movement === "down") return <span className="flex items-center text-xs font-bold text-red-500"><ArrowDown className="h-3 w-3 mr-0.5" />{changeVal > 0 ? `-${changeVal}` : ""}</span>;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function BadgeIcons({ badges }: { badges: string[] }) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((badge) => {
        let colorClass = "bg-muted text-muted-foreground border-transparent";
        let icon = "⭐";

        if (badge.includes("Champion")) {
          colorClass = "bg-amber-500/10 text-amber-600 border-amber-500/20";
          icon = "👑";
        } else if (badge.includes("Accuracy")) {
          colorClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
          icon = "🎯";
        } else if (badge.includes("Speed") || badge.includes("Lightning") || badge.includes("Thinker")) {
          colorClass = "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
          icon = "⚡";
        } else if (badge.includes("Consistency") || badge.includes("Streak")) {
          colorClass = "bg-orange-500/10 text-orange-600 border-orange-500/20";
          icon = "🔥";
        } else if (badge.includes("Climber") || badge.includes("Comeback")) {
          colorClass = "bg-violet-500/10 text-violet-600 border-violet-500/20";
          icon = "🚀";
        } else if (badge.includes("No Wrong")) {
          colorClass = "bg-blue-500/10 text-blue-600 border-blue-500/20";
          icon = "✓";
        }

        return (
          <span
            key={badge}
            title={badge}
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border capitalize select-none",
              colorClass
            )}
          >
            <span>{icon}</span>
            <span className="hidden md:inline text-[8px] tracking-tight">{badge}</span>
          </span>
        );
      })}
    </span>
  );
}

export function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  
  useEffect(() => {
    let start = displayValue;
    const end = value;
    if (start === end) return;
    
    const duration = 800;
    const startTime = performance.now();
    let frameId: number;
    
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress * (2 - progress);
      const current = Math.round(start + (end - start) * ease);
      setDisplayValue(current);
      
      if (progress < 1) {
        frameId = requestAnimationFrame(update);
      }
    };
    
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [value]);
  
  return <span>{displayValue.toLocaleString()}</span>;
}

interface FloatingAlert {
  id: string;
  text: string;
  color: string;
}

function LeaderboardRow({
  entry,
  highlightParticipantId,
  compact
}: {
  entry: LeaderboardEntry;
  highlightParticipantId?: string | null;
  compact?: boolean;
}) {
  const [alerts, setAlerts] = useState<FloatingAlert[]>([]);
  const prevScoreRef = useRef(entry.score);
  const prevCoinsRef = useRef((entry as any).coins || 0);
  const prevLivesRef = useRef((entry as any).lives ?? 3);

  useEffect(() => {
    const alertsList: FloatingAlert[] = [];
    const scoreDiff = Math.round(entry.score - prevScoreRef.current);
    if (scoreDiff > 0) {
      alertsList.push({ id: Math.random().toString(), text: `+${scoreDiff} pts`, color: "text-emerald-500 border-emerald-500/20 shadow-emerald-500/10" });
    } else if (scoreDiff < 0) {
      alertsList.push({ id: Math.random().toString(), text: `${scoreDiff} pts`, color: "text-red-500 border-red-500/20 shadow-red-500/10" });
    }

    const coinDiff = ((entry as any).coins || 0) - prevCoinsRef.current;
    if (coinDiff > 0) {
      alertsList.push({ id: Math.random().toString(), text: `+🪙${coinDiff}`, color: "text-amber-500 border-amber-500/20 shadow-amber-500/10" });
    }

    const liveDiff = ((entry as any).lives ?? 3) - prevLivesRef.current;
    if (liveDiff < 0) {
      alertsList.push({ id: Math.random().toString(), text: `💔 Lost Life`, color: "text-rose-500 border-rose-500/20 shadow-rose-500/10" });
    }

    if (alertsList.length > 0) {
      setAlerts((prev) => [...prev, ...alertsList]);
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => !alertsList.find((al) => al.id === a.id)));
      }, 1800);
    }

    prevScoreRef.current = entry.score;
    prevCoinsRef.current = (entry as any).coins || 0;
    prevLivesRef.current = (entry as any).lives ?? 3;
  }, [entry.score, (entry as any).coins, (entry as any).lives]);

  const isSelf = highlightParticipantId === entry.participantId;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-4 py-3 transition-all border",
        isSelf
          ? "bg-gradient-to-r from-purple-500/20 via-primary/10 to-transparent border-purple-500/40 shadow-lg shadow-purple-500/5 scale-[1.01]"
          : "bg-card hover:bg-muted/40 border-border/40",
        compact && "py-2.5"
      )}
    >
      {/* Floating Micro-Animations */}
      <div className="absolute right-12 -top-2 pointer-events-none flex flex-col gap-1 z-30">
        <AnimatePresence>
          {alerts.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 15, scale: 0.8 }}
              animate={{ opacity: 1, y: -25, scale: 1.1 }}
              exit={{ opacity: 0, y: -45, scale: 0.9 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className={cn("bg-background border px-2 py-0.5 rounded-full text-[10px] font-black shadow-md", alert.color)}
            >
              {alert.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <span className="w-6 text-center font-black text-sm text-foreground">{entry.rank}</span>
      <MovementIcon movement={entry.movement} rankChange={(entry as any).rankChange} />
      
      <div className="relative">
        <Avatar className="h-9 w-9 border-2 border-background shadow-inner">
          <AvatarImage src={entry.avatar || undefined} />
          <AvatarFallback className="font-bold text-xs bg-muted text-muted-foreground">
            {entry.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {isSelf && (
          <div className="absolute -inset-0.5 rounded-full bg-purple-500/20 animate-ping -z-10" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("truncate font-bold text-sm", isSelf ? "text-purple-600 dark:text-purple-400 font-black" : "text-foreground")}>
            {entry.displayName} {isSelf && <span className="text-[10px] text-purple-500 font-bold ml-1">(You)</span>}
          </span>
          <BadgeIcons badges={entry.badges} />
        </div>
        <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5">
          {entry.accuracy}% acc · streak {entry.streak}
          {(entry as any).combo > 0 && <span className="text-purple-500 font-black ml-1">Combo x{(entry as any).combo}</span>}
        </span>
      </div>

      <div className="text-right">
        <div className="font-extrabold text-sm tabular-nums text-foreground flex items-center gap-1.5 justify-end">
          <AnimatedCounter value={Math.round(entry.score)} />
          {entry.streak >= 3 && (
            <span className="flex items-center text-[10px] text-orange-500 font-black animate-pulse">
              <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500 shrink-0" /> {entry.streak}
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-2 justify-end mt-0.5">
          {entry.xp > 0 && <span className="text-violet-500">+{entry.xp} XP</span>}
          {(entry as any).coins > 0 && <span className="text-amber-500 font-bold flex items-center gap-0.5"><Coins className="h-3 w-3 inline text-amber-500 shrink-0" />{(entry as any).coins}</span>}
          {(entry as any).lives !== undefined && (entry as any).lives > 0 && <span className="text-red-500"><Heart className="h-3 w-3 inline fill-red-500 text-red-500 shrink-0" />{(entry as any).lives}</span>}
        </div>
      </div>
    </motion.div>
  );
}

export function LiveLeaderboard({ entries, highlightParticipantId, compact, className }: LiveLeaderboardProps) {
  useEffect(() => {
    if (!highlightParticipantId) return;
    const myEntry = entries.find((e) => e.participantId === highlightParticipantId);
    if (!myEntry) return;

    const currentRank = myEntry.rank;
    const prevRank = (myEntry as any).prevRank || (myEntry.rank + ((myEntry as any).rankChange || 0));

    if (currentRank <= 10 && (prevRank > 10 || !(myEntry as any).prevRank)) {
      triggerConfetti();
    }
  }, [entries, highlightParticipantId]);

  // Sort and assign ranks to ensure consistent display
  const rankedEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((entry, idx) => ({
        ...entry,
        rank: idx + 1
      }));
  }, [entries]);

  const top10 = useMemo(() => rankedEntries.slice(0, 10), [rankedEntries]);
  
  const myIndex = useMemo(() => {
    if (!highlightParticipantId) return -1;
    return rankedEntries.findIndex((e) => e.participantId === highlightParticipantId);
  }, [rankedEntries, highlightParticipantId]);

  const renderSpacerAndMe = myIndex >= 10;

  return (
    <div className={cn("space-y-1.5", className)}>
      <AnimatePresence mode="popLayout">
        {/* Render Top 10 */}
        {top10.map((entry) => (
          <LeaderboardRow
            key={entry.participantId}
            entry={entry}
            highlightParticipantId={highlightParticipantId}
            compact={compact}
          />
        ))}

        {/* Separator and Current Student (if outside Top 10) */}
        {renderSpacerAndMe && (
          <div key="separator-spacer" className="flex flex-col gap-1.5">
            <div className="text-center py-1 text-xs text-muted-foreground font-black tracking-widest animate-pulse">
              •••
            </div>
            <LeaderboardRow
              key={rankedEntries[myIndex].participantId}
              entry={rankedEntries[myIndex]}
              highlightParticipantId={highlightParticipantId}
              compact={compact}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
