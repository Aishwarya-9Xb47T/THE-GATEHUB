import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Trophy,
  RotateCcw,
  Copy,
  BarChart3,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LivePodium } from "./LivePodium";
import { duplicateQuizRoom, launchQuizRoom } from "@/lib/liveSession/api";
import type { LeaderboardEntry } from "@/lib/liveSession/types";
import { useToastStore } from "@/store/toastStore";

interface LiveHostSessionCompleteProps {
  sessionId: string;
  title: string;
  leaderboard: LeaderboardEntry[];
  questionCount: number;
  participantCount: number;
}

export function LiveHostSessionComplete({
  sessionId,
  title,
  leaderboard,
  questionCount,
  participantCount,
}: LiveHostSessionCompleteProps) {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [hostingAgain, setHostingAgain] = useState(false);

  const avgAccuracy =
    leaderboard.length > 0
      ? Math.round(leaderboard.reduce((s, e) => s + e.accuracy, 0) / leaderboard.length)
      : 0;

  const handleHostAgain = async () => {
    setHostingAgain(true);
    try {
      const dup = await duplicateQuizRoom(sessionId, false);
      if (dup.error || !dup.data?.data?.id) throw new Error(dup.error ?? "Could not duplicate session");
      const newId = dup.data.data.id;
      const launch = await launchQuizRoom(newId);
      if (launch.error) throw new Error(launch.error);
      navigate(`/instructor/quiz-room/${newId}/host`);
      toast({ title: "New room ready", description: "Share the join link with students.", variant: "success" });
    } catch {
      toast({ title: "Could not restart", description: "Try again from Quiz Room.", variant: "destructive" });
    } finally {
      setHostingAgain(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <Card className="overflow-hidden border-2 border-primary/15 shadow-lg">
        <CardContent className="py-8 text-center">
          <Trophy className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-3 text-2xl font-bold">Session complete</h2>
          <p className="mt-1 text-muted-foreground">{title}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm">
            <div>
              <p className="text-2xl font-bold">{participantCount}</p>
              <p className="text-muted-foreground">Players</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{questionCount}</p>
              <p className="text-muted-foreground">Questions</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{avgAccuracy}%</p>
              <p className="text-muted-foreground">Avg accuracy</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <LivePodium entries={leaderboard} />

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleHostAgain} disabled={hostingAgain}>
          {hostingAgain ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Host again
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate(`/instructor/quiz-room/${sessionId}/report`)}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          View report & export
        </Button>
        <Button variant="outline" onClick={handleHostAgain} disabled={hostingAgain}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate & host
        </Button>
        <Button variant="ghost" onClick={() => navigate("/instructor/quiz-room")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Quiz Room
        </Button>
      </div>
    </motion.div>
  );
}
