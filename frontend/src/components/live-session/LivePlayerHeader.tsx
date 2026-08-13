import { Trophy, Flame, Zap, Target, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/lib/liveSession/types";
import type { ConnectionPhase } from "@/lib/liveSession/playerStateMachine";

interface LivePlayerHeaderProps {
  title: string;
  questionIndex: number;
  questionCount: number;
  myEntry?: LeaderboardEntry | null;
  connectionPhase?: ConnectionPhase;
  settings?: any;
  className?: string;
}

export function LivePlayerHeader({
  title,
  questionIndex,
  questionCount,
  myEntry,
  connectionPhase = "connected",
  settings,
  className,
}: LivePlayerHeaderProps) {
  const progress = questionCount > 0 ? ((questionIndex + 1) / questionCount) * 100 : 0;

  return (
    <header className={cn("sticky top-0 z-20 border-b bg-background/95 shadow-sm backdrop-blur-md", className)}>
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-gradient-to-r from-primary to-amber-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{title}</p>
          <p className="text-sm font-bold sm:text-base">
            Question {questionIndex + 1}
            <span className="font-normal text-muted-foreground"> / {questionCount}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs sm:gap-3 sm:text-sm">
          {connectionPhase === "reconnecting" && (
            <span
              className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-400"
              aria-live="polite"
            >
              <WifiOff className="h-3.5 w-3.5 animate-pulse" />
              <span className="sr-only sm:not-sr-only">Reconnecting</span>
            </span>
          )}
          {connectionPhase === "failed" && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-destructive">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">Offline</span>
            </span>
          )}
          {connectionPhase === "connected" && (
            <span className="hidden items-center gap-1 text-emerald-600 sm:flex" title="Connected">
              <Wifi className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          {myEntry && (
            <>
            {settings?.lives > 0 && (myEntry as any).lives != null && (
              <span className="flex items-center gap-0.5" title="Lives">
                {Array.from({ length: Math.max(0, (myEntry as any).lives) }).map((_, i) => (
                  <span key={i} className="text-sm">❤️</span>
                ))}
                {(myEntry as any).lives <= 0 && <span className="text-[10px] text-destructive font-black">ELIMINATED</span>}
              </span>
            )}
            {settings?.coinsEnabled && (myEntry as any).coins != null && (
              <span className="flex items-center gap-0.5 text-amber-500 font-bold" title="Coins">
                🪙{(myEntry as any).coins}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 font-semibold text-amber-700 dark:text-amber-400">
              <Trophy className="h-3.5 w-3.5" /> #{myEntry.rank}
            </span>
            <span className="hidden font-bold tabular-nums sm:inline">
              {Math.round(myEntry.score).toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              {myEntry.accuracy}%
            </span>
            {myEntry.streak > 0 && (
              <span className="flex items-center gap-1 text-orange-600">
                <Flame className="h-3.5 w-3.5" /> {myEntry.streak}
              </span>
            )}
            <span className="flex items-center gap-1 text-violet-600">
              <Zap className="h-3.5 w-3.5" /> {myEntry.xp}
            </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
