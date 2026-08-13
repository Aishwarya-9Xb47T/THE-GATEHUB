import { Globe, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WaygroundPickerProps {
  onQuizSelect: (quizId: string, quizTitle: string) => void;
  theme?: "light" | "dark";
}

export function WaygroundPicker({ onQuizSelect, theme = "light" }: WaygroundPickerProps) {
  const isDark = theme === "dark";

  return (
    <div className="space-y-4">
      <div className={cn(
        "p-8 rounded-xl border text-center",
        isDark ? "border-white/10 bg-white/5" : "border-border bg-card"
      )}>
        <div className={cn(
          "mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4",
          isDark ? "bg-white/10" : "bg-primary/10"
        )}>
          <Globe className={cn("h-8 w-8", isDark ? "text-white" : "text-primary")} />
        </div>
        <h3 className={cn("text-lg font-semibold mb-2", isDark ? "text-white" : "text-foreground")}>
          Wayground Integration
        </h3>
        <p className={cn("text-sm mb-6", isDark ? "text-white/60" : "text-muted-foreground")}>
          Browse and import quizzes directly from the Wayground library
        </p>
        <Button
          variant="outline"
          className="w-full"
          disabled
          title="Wayground library browse is not available yet"
        >
          <Globe className="h-4 w-4 mr-2" />
          Browse Wayground Library
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Soon</span>
        </Button>
      </div>

      <div className={cn("text-xs", isDark ? "text-white/40" : "text-muted-foreground")}>
        <p className="font-medium mb-1">Wayground integration coming soon</p>
        <p>Connect to Wayground to browse their quiz library and import directly into your Question Bank.</p>
      </div>
    </div>
  );
}
