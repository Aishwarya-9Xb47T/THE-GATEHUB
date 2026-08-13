import { cn } from "@/lib/utils";
import { QUIZ_THEME_OPTIONS, type QuizThemeId } from "@/lib/quizBranding/types";

interface ThemePickerProps {
  value: QuizThemeId;
  onChange: (theme: QuizThemeId) => void;
  dark?: boolean;
}

export function ThemePicker({ value, onChange, dark }: ThemePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
      {QUIZ_THEME_OPTIONS.map((theme) => (
        <button
          key={theme.id}
          type="button"
          onClick={() => onChange(theme.id)}
          className={cn(
            "rounded-xl border p-3 text-left transition-all",
            dark ? "border-white/10 bg-white/5 hover:border-white/20" : "border-border hover:border-primary/40",
            value === theme.id && "ring-2 ring-primary border-primary/50"
          )}
        >
          <div className={cn("mb-2 h-10 w-full rounded-lg", theme.preview)} />
          <p className={cn("text-xs font-medium", dark ? "text-white/80" : "text-foreground")}>{theme.label}</p>
        </button>
      ))}
    </div>
  );
}
