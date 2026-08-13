import { useEffect, useState } from "react";
import { Sigma } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MathSegmentView } from "./mathSegments";

const EXAMPLES = [
  { label: "Fraction", latex: "\\frac{a}{b}" },
  { label: "Square root", latex: "\\sqrt{x^2 + y^2}" },
  { label: "Integral", latex: "\\int_0^1 x^2 \\, dx" },
  { label: "Summation", latex: "\\sum_{i=1}^{n} i" },
  { label: "Quadratic", latex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" },
];

interface FormulaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLatex?: string;
  initialDisplay?: "inline" | "block";
  /** When true, empty latex can be saved (edit existing block without deleting it). */
  allowEmpty?: boolean;
  onInsert: (latex: string, display: "inline" | "block") => void;
}

export function FormulaDialog({
  open,
  onOpenChange,
  initialLatex = "",
  initialDisplay = "inline",
  allowEmpty = false,
  onInsert,
}: FormulaDialogProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [display, setDisplay] = useState<"inline" | "block">(initialDisplay);

  useEffect(() => {
    if (open) {
      setLatex(initialLatex);
      setDisplay(initialDisplay);
    }
  }, [open, initialLatex, initialDisplay]);

  const trimmed = latex.trim();
  const canInsert = allowEmpty || trimmed.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Sigma className="h-5 w-5 text-primary" />
            Insert formula
          </DialogTitle>
          <DialogDescription>
            Type LaTeX — preview updates live. No need to add dollar signs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="flex gap-2">
            {(["inline", "block"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplay(mode)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  display === mode
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted/50"
                )}
              >
                {mode === "inline" ? "Inline" : "Block (centered)"}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="formula-latex">LaTeX expression</Label>
            <textarea
              id="formula-latex"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="e.g. E = mc^2  or  \frac{a}{b}"
              rows={3}
              className="w-full resize-none rounded-xl border border-border/60 bg-background px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Live preview
            </p>
            {trimmed ? (
              <div className="flex min-h-[3rem] items-center justify-center">
                <MathSegmentView
                  segment={{
                    kind: display === "block" ? "block" : "inline",
                    value: trimmed,
                  }}
                />
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">Your formula will appear here</p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setLatex(ex.latex)}
                className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/10 px-5 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canInsert}
            onClick={() => {
              onInsert(trimmed, display);
              onOpenChange(false);
            }}
          >
            {allowEmpty ? "Save formula" : "Insert formula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
