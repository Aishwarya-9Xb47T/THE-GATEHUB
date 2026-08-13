import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QUIZ_ICON_OPTIONS, type QuizIconId } from "@/lib/quizBranding/types";

interface QuizIconPickerProps {
  value: QuizIconId;
  customIcon?: string;
  onChange: (icon: QuizIconId, custom?: string) => void;
  dark?: boolean;
}

export function QuizIconPicker({ value, customIcon, onChange, dark }: QuizIconPickerProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {QUIZ_ICON_OPTIONS.map((icon) => (
          <button
            key={icon.id}
            type="button"
            onClick={() => onChange(icon.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border p-3 transition-all",
              dark ? "border-white/10 bg-white/5" : "border-border",
              value === icon.id && "ring-2 ring-primary"
            )}
          >
            <span className="text-2xl">{icon.emoji}</span>
            <span className={cn("text-[10px]", dark ? "text-white/60" : "text-muted-foreground")}>{icon.label}</span>
          </button>
        ))}
      </div>
      {value === "custom" && (
        <Input placeholder="Emoji" value={customIcon || ""} onChange={(e) => onChange("custom", e.target.value)} maxLength={4} className={dark ? "border-white/15 bg-white/5 text-white" : ""} />
      )}
    </div>
  );
}
