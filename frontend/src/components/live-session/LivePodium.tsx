import { motion } from "framer-motion";
import { Crown, Medal, Trophy } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/liveSession/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface LivePodiumProps {
  entries: LeaderboardEntry[];
  className?: string;
}

const PODIUM_CONFIG = [
  { rank: 2, height: "h-28", medal: "silver", icon: Medal, color: "from-slate-300 to-slate-400" },
  { rank: 1, height: "h-36", medal: "gold", icon: Crown, color: "from-amber-400 to-yellow-500" },
  { rank: 3, height: "h-24", medal: "bronze", icon: Medal, color: "from-amber-600 to-orange-700" },
] as const;

export function LivePodium({ entries, className }: LivePodiumProps) {
  const top5 = entries.slice(0, 5);
  const fourthFifth = top5.filter((e) => e.rank === 4 || e.rank === 5);

  return (
    <div className={cn("space-y-8", className)}>
      <div className="flex items-end justify-center gap-3 px-4 sm:gap-6">
        {PODIUM_CONFIG.map((cfg) => {
          const entry = top5.find((e) => e.rank === cfg.rank);
          const Icon = cfg.icon;
          return (
            <motion.div
              key={cfg.rank}
              layout
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: cfg.rank === 1 ? 0 : cfg.rank * 0.1 }}
            >
              {entry ? (
                <>
                  <Avatar className={cn("mb-2 border-4", cfg.rank === 1 ? "h-20 w-20 border-amber-400" : "h-14 w-14 border-muted")}>
                    <AvatarImage src={entry.avatar || undefined} />
                    <AvatarFallback>{entry.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <p className="max-w-[100px] truncate text-center text-sm font-semibold">{entry.displayName}</p>
                  <p className="text-lg font-bold tabular-nums text-primary">{Math.round(entry.score).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{entry.accuracy}% · {entry.streak} streak</p>
                </>
              ) : (
                <div className="mb-2 h-14 w-14 rounded-full bg-muted" />
              )}
              <div
                className={cn(
                  "mt-3 flex w-20 flex-col items-center justify-end rounded-t-xl bg-gradient-to-b sm:w-24",
                  cfg.height,
                  cfg.color
                )}
              >
                <Icon className="mb-2 h-6 w-6 text-white drop-shadow" />
                <span className="pb-2 text-2xl font-black text-white">{cfg.rank}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {fourthFifth.length > 0 && (
        <div className="mx-auto flex max-w-md justify-center gap-6">
          {fourthFifth.map((entry) => (
            <motion.div
              key={entry.participantId}
              layout
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
            >
              <span className="text-lg font-bold text-muted-foreground">{entry.rank}</span>
              <Avatar className="h-10 w-10">
                <AvatarImage src={entry.avatar || undefined} />
                <AvatarFallback>{entry.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{entry.displayName}</p>
                <p className="text-sm text-muted-foreground">{Math.round(entry.score).toLocaleString()} pts</p>
              </div>
              <Trophy className="ml-auto h-4 w-4 text-muted-foreground" />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
