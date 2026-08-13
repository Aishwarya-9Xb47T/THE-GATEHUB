import { motion } from "framer-motion";
import { LiveLeaderboard } from "./LiveLeaderboard";
import type { LeaderboardEntry } from "@/lib/liveSession/types";
import { Trophy, Sparkles, Star } from "lucide-react";

interface LiveLeaderboardRevealProps {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string | null;
}

export function LiveLeaderboardReveal({ entries, highlightParticipantId }: LiveLeaderboardRevealProps) {
  const topPlayer = entries[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 backdrop-blur-md sm:items-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="w-full max-w-md rounded-2xl border border-primary/20 bg-card/90 p-6 shadow-2xl backdrop-blur-md space-y-4"
      >
        {/* Animated Header */}
        <div className="text-center relative">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center justify-center bg-primary text-primary-foreground rounded-full p-2.5 shadow-lg border-2 border-background">
            <Trophy className="h-6 w-6 text-amber-300 animate-pulse" />
          </div>
          <h3 className="pt-2 text-xl font-black text-foreground flex items-center justify-center gap-1.5 mt-2">
            <Sparkles className="h-4 w-4 text-amber-500 animate-spin" /> Leaderboard Standings
          </h3>
          <p className="text-xs text-muted-foreground">Live ranking changes after this round</p>
        </div>

        {/* Podium highlighting first place */}
        {topPlayer && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-amber-500/10 p-3 text-center"
          >
            <div className="absolute -right-2 -top-2 text-6xl opacity-10 select-none">👑</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-amber-500">👑 #1</span>
                <span className="font-bold text-foreground text-sm truncate max-w-[150px]">{topPlayer.displayName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-extrabold text-sm">
                <Star className="h-4 w-4 fill-current animate-pulse" />
                {topPlayer.score} Marks
              </div>
            </div>
          </motion.div>
        )}

        <div className="max-h-[300px] overflow-y-auto pr-1">
          <LiveLeaderboard entries={entries.slice(0, 8)} highlightParticipantId={highlightParticipantId} compact />
        </div>
      </motion.div>
    </motion.div>
  );
}
