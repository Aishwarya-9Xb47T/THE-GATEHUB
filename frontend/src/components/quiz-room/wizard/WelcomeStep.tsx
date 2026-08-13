import { Clock, DoorOpen, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onContinue: () => void;
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-amber-500 shadow-2xl shadow-primary/30">
        <DoorOpen className="h-10 w-10 text-white" />
      </div>

      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Create Quiz Room
      </h1>
      <p className="mt-4 max-w-lg text-lg text-white/60">
        Host a real-time multiplayer quiz with live leaderboards, instant scoring, and
        classroom-grade engagement.
      </p>

      <div className="mt-10 grid w-full max-w-md gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <Clock className="mx-auto mb-2 h-5 w-5 text-primary" />
          <p className="text-2xl font-bold">~2 min</p>
          <p className="text-xs text-white/50">Setup time</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <Zap className="mx-auto mb-2 h-5 w-5 text-amber-400" />
          <p className="text-2xl font-bold">Live</p>
          <p className="text-xs text-white/50">Real-time</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
          <p className="text-2xl font-bold">AI</p>
          <p className="text-xs text-white/50">Ready</p>
        </div>
      </div>

      <Button size="lg" className="mt-12 h-12 px-10 text-base shadow-lg shadow-primary/25" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
