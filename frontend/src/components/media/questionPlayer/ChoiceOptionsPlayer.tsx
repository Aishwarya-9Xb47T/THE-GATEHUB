import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AssessmentContentRenderer } from "@/components/assessment/AssessmentContentRenderer";
import type { PlayerOption } from "./types";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

interface ChoiceOptionsPlayerProps {
  type: string;
  options: PlayerOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
}

export function ChoiceOptionsPlayer({ type, options, value, onChange, disabled }: ChoiceOptionsPlayerProps) {
  const isMulti = type === "multiple_select";

  return (
    <div className="grid gap-3 sm:gap-4" role={isMulti ? "group" : "radiogroup"} aria-label="Answer options">
      {options.map((opt, idx) => {
        const isSelected = isMulti
          ? Array.isArray(value) && value.includes(opt.id)
          : value === opt.id;
        const letter = LETTERS[idx] ?? String(idx + 1);

        return (
          <motion.button
            key={opt.id}
            type="button"
            disabled={disabled}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={() => {
              if (disabled) return;
              if (isMulti) {
                const arr = Array.isArray(value) ? value : [];
                onChange(arr.includes(opt.id) ? arr.filter((id) => id !== opt.id) : [...arr, opt.id]);
              } else {
                onChange(opt.id);
              }
            }}
            className={cn(
              "flex min-h-[3rem] w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all sm:min-h-[3.5rem] sm:p-4",
              isSelected
                ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                : "border-border/80 bg-card hover:border-primary/50 hover:bg-muted/40",
              disabled && "cursor-not-allowed opacity-60"
            )}
            aria-pressed={isSelected}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {letter}
            </span>
            {isMulti ? <Checkbox checked={isSelected} className="shrink-0" tabIndex={-1} /> : null}
            <Label className="flex-1 cursor-pointer text-base font-medium">
              <AssessmentContentRenderer content={opt.text || `Option ${idx + 1}`} variant="option" />
            </Label>
          </motion.button>
        );
      })}
    </div>
  );
}
