import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QUIZ_ACCENT_OPTIONS, type QuizAccentId } from "@/lib/quizBranding/types";

interface AccentColorPickerProps {
  value: QuizAccentId;
  customAccent?: string;
  onChange: (accent: QuizAccentId, custom?: string) => void;
  dark?: boolean;
}

export function AccentColorPicker({ value, customAccent, onChange, dark }: AccentColorPickerProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUIZ_ACCENT_OPTIONS.map((accent) => (
          <button
            key={accent.id}
            type="button"
            onClick={() => onChange(accent.id)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              dark ? "border-white/10 bg-white/5 text-white/80" : "border-border",
              value === accent.id && "ring-2 ring-primary"
            )}
          >
            <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: accent.color }} />
            {accent.label}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <Input type="color" value={customAccent || "#6366f1"} onChange={(e) => onChange("custom", e.target.value)} className="h-10 w-24" />
      )}
    </div>
  );
}
