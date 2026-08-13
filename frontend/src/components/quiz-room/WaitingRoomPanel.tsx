import {
  Users,
  Wifi,
  UserCheck,
  Activity,
  Signal,
  MessageSquare,
  Megaphone,
  Copy,
  KeyRound,
  Hash,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LeaderboardEntry } from "@/lib/liveSession/types";
import { useToastStore } from "@/store/toastStore";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";
import { cn } from "@/lib/utils";

interface WaitingRoomPanelProps {
  roomCode: string | null;
  pin: string | null;
  joinUrl: string;
  participants: LeaderboardEntry[];
  onStart?: () => void;
  canStart?: boolean;
  quizTitle?: string;
  quizBranding?: {
    bannerUrl?: string | null;
    thumbnailUrl?: string | null;
    coverImageUrl?: string | null;
    coverGradient?: string | null;
    theme?: string | null;
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WaitingRoomPanel({
  roomCode,
  pin,
  joinUrl,
  participants,
  onStart,
  canStart,
  quizTitle,
  quizBranding,
}: WaitingRoomPanelProps) {
  const toast = useToastStore((s) => s.add);
  const joined = participants.length;
  const ready = joined;
  const waiting = 0;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied`, variant: "success" });
  };

  if (!roomCode && !pin) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 py-12 text-center text-muted-foreground">
        Launch this room to generate PIN, QR code, and invite link.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {quizBranding && (
        <QuizCoverBanner
          bannerUrl={quizBranding.bannerUrl}
          thumbnailUrl={quizBranding.thumbnailUrl}
          coverImageUrl={quizBranding.coverImageUrl}
          coverGradient={quizBranding.coverGradient}
          theme={quizBranding.theme}
          alt={quizTitle || "Quiz"}
          className="h-32 w-full rounded-2xl"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          {quizTitle && (
            <div className="absolute bottom-3 left-4">
              <p className="text-lg font-bold text-white drop-shadow">{quizTitle}</p>
            </div>
          )}
        </QuizCoverBanner>
      )}
      {/* Room health bar */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Room health", value: "Excellent", icon: Activity, color: "text-emerald-500" },
          { label: "Network", value: "Good", icon: Signal, color: "text-sky-500" },
          { label: "Players", value: String(joined), icon: Users, color: "text-primary" },
          { label: "Ready", value: `${ready}/${joined}`, icon: UserCheck, color: "text-amber-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border bg-card/80 p-4 shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className={cn("h-4 w-4", color)} />
              {label}
            </div>
            <p className="mt-1 text-xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Invite hero */}
        <div className="space-y-4 xl:col-span-2">
          <div className="overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-amber-500/5 p-6 shadow-lg">
            <p className="text-center text-sm font-medium text-muted-foreground">Room PIN</p>
            {pin && (
              <p className="mt-2 text-center font-mono text-5xl font-bold tracking-[0.35em] text-primary">
                {pin}
              </p>
            )}
            {roomCode && (
              <p className="mt-3 text-center font-mono text-lg tracking-widest text-muted-foreground">
                Code {roomCode}
              </p>
            )}
            <div className="mx-auto mt-6 flex justify-center rounded-xl bg-white p-3 shadow-inner">
              <QRCodeSVG value={joinUrl} size={140} level="M" />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {pin && (
                <Button size="sm" variant="outline" onClick={() => copy(pin, "PIN")}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Copy PIN
                </Button>
              )}
              {roomCode && (
                <Button size="sm" variant="outline" onClick={() => copy(roomCode, "Code")}>
                  <Hash className="mr-2 h-4 w-4" />
                  Copy Code
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => copy(joinUrl, "Link")}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card/80 p-4 text-center backdrop-blur-sm">
              <p className="text-2xl font-bold text-emerald-600">{ready}</p>
              <p className="text-xs text-muted-foreground">Ready</p>
            </div>
            <div className="rounded-xl border bg-card/80 p-4 text-center backdrop-blur-sm">
              <p className="text-2xl font-bold text-amber-600">{waiting}</p>
              <p className="text-xs text-muted-foreground">Waiting</p>
            </div>
          </div>
        </div>

        {/* Participants */}
        <div className="xl:col-span-3">
          <div className="rounded-2xl border bg-card/80 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="flex items-center gap-2 font-semibold">
                <Wifi className="h-4 w-4 text-emerald-500" />
                Participants
                <Badge variant="secondary">{joined}</Badge>
              </h3>
              {onStart && (
                <Button size="lg" onClick={onStart} disabled={!canStart}>
                  Start Quiz
                </Button>
              )}
            </div>

            {joined === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                <Users className="h-12 w-12 opacity-30" />
                <p>Waiting for students to join…</p>
                <p className="text-xs">Share the PIN or QR code above</p>
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {participants.map((p) => (
                  <div
                    key={p.participantId}
                    className="flex items-center gap-3 rounded-xl border bg-background/60 p-3 transition-shadow hover:shadow-md"
                  >
                    <Avatar className="h-11 w-11 ring-2 ring-emerald-500/30">
                      {p.avatar ? <AvatarImage src={p.avatar} alt={p.displayName} /> : null}
                      <AvatarFallback>{initials(p.displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.displayName}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Connected
                        </span>
                        {p.xp > 0 && <span>XP {p.xp}</span>}
                        {p.streak > 0 && <span>🔥 {p.streak}</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-emerald-500/30 text-emerald-700">
                      Ready
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed bg-muted/30 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Megaphone className="h-4 w-4" />
                Announcements
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Coming in Phase 2</p>
            </div>
            <div className="rounded-xl border border-dashed bg-muted/30 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                Lobby chat
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Coming in Phase 2</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
