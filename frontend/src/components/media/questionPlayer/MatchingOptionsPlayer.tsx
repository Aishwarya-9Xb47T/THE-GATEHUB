import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AssessmentContentRenderer } from "@/components/assessment/AssessmentContentRenderer";
import type { PlayerOption } from "./types";

interface MatchingOptionsPlayerProps {
  options: PlayerOption[];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
  isMatrix?: boolean;
  metadata?: Record<string, unknown> | null;
}

export function MatchingOptionsPlayer({
  options,
  value,
  onChange,
  disabled,
  isMatrix,
  metadata,
}: MatchingOptionsPlayerProps) {
  const pairs: Array<{ left: PlayerOption; right: PlayerOption }> = [];
  for (let i = 0; i < options.length; i += 2) {
    if (options[i] && options[i + 1]) pairs.push({ left: options[i]!, right: options[i + 1]! });
  }

  const rightChoices = pairs.map((p) => p.right);

  return (
    <div className="space-y-3" aria-label={isMatrix ? "Matrix responses" : "Match each item"}>
      {isMatrix && (
        <div className="grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
          <AssessmentContentRenderer content={(metadata?.matrixRows as string[])?.join("\n") || ""} variant="plain" />
          <AssessmentContentRenderer content={(metadata?.matrixCols as string[])?.join("\n") || ""} variant="plain" />
        </div>
      )}
      {pairs.map((pair, pi) => (
        <div key={pair.left.id} className="grid gap-2 rounded-xl border border-border/60 p-3 sm:grid-cols-2 sm:items-center">
          <div>
            <Label className="mb-1 text-xs text-muted-foreground">Prompt {pi + 1}</Label>
            <AssessmentContentRenderer content={pair.left.text || `Left ${pi + 1}`} variant="option" />
          </div>
          <div>
            <Label className="mb-1 text-xs text-muted-foreground">Match</Label>
            <select
              className={cn(
                "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm",
                disabled && "opacity-60"
              )}
              disabled={disabled}
              value={value[pair.left.id] || ""}
              onChange={(e) => onChange({ ...value, [pair.left.id]: e.target.value })}
            >
              <option value="">Select match…</option>
              {rightChoices.map((r) => (
                <option key={r.id} value={r.id}>
                  {stripMarkdown(r.text) || "Option"}
                </option>
              ))}
            </select>
            {value[pair.left.id] && (
              <div className="mt-2 rounded-lg bg-muted/30 p-2">
                <AssessmentContentRenderer content={rightChoices.find((r) => r.id === value[pair.left.id])?.text || ""} variant="option" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function stripMarkdown(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]+\)/g, "[image]").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_#>`]/g, "").trim();
}
