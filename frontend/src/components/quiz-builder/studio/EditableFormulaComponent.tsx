import { useState, useEffect } from "react";
import { Trash2, Plus, Sigma } from "lucide-react";
import { QuizSection } from "@/components/quiz-builder/studio/QuizSection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseMathSegments, MathSegmentView } from "@/components/media/mathSegments";

interface EditableFormulaComponentProps {
  question?: Record<string, any>;
  meta: Record<string, any>;
  updateMeta: (patch: Record<string, any>) => void;
}

const FORMULA_SNIPPETS = [
  { label: "Fraction", latex: "\\frac{a}{b}" },
  { label: "Exponent", latex: "x^{n}" },
  { label: "Subscript", latex: "x_{n}" },
  { label: "Square Root", latex: "\\sqrt{x}" },
  { label: "Summation", latex: "\\sum_{i=1}^{n} x_i" },
  { label: "Integral", latex: "\\int_{a}^{b} f(x) dx" },
  { label: "Matrix (2x2)", latex: "\\begin{matrix} a & b \\\\ c & d \\end{matrix}" },
  { label: "Chemical", latex: "\\ce{H2O}" },
  { label: "±", latex: "\\pm" },
  { label: "≠", latex: "\\neq" },
  { label: "≤", latex: "\\le" },
  { label: "≥", latex: "\\ge" },
  { label: "π", latex: "\\pi" },
  { label: "θ", latex: "\\theta" },
  { label: "α", latex: "\\alpha" },
  { label: "β", latex: "\\beta" },
  { label: "Δ", latex: "\\Delta" },
  { label: "∞", latex: "\\infty" },
];

export function EditableFormulaComponent({ question, meta, updateMeta }: EditableFormulaComponentProps) {
  const safeQ = question || {};
  const rawFormulas =
    meta.formulas ||
    meta.equations ||
    safeQ.formulas ||
    safeQ.metadata?.formulas ||
    (Array.isArray(meta.equations) ? meta.equations.map((e: any) => e.formula || e.content || e.latex) : null) ||
    (Array.isArray(safeQ.equations) ? safeQ.equations.map((e: any) => e.formula || e.content || e.latex) : null);

  const getInitialFormulas = (): string[] => {
    if (Array.isArray(rawFormulas) && rawFormulas.length > 0) {
      return rawFormulas.map((f: any) => (typeof f === "string" ? f : f.latex || f.content || String(f)));
    }
    if (typeof rawFormulas === "string" && rawFormulas.trim()) {
      return [rawFormulas.trim()];
    }
    // Default initial formula snippet if activated
    return ["E = mc^2"];
  };

  const [formulas, setFormulas] = useState<string[]>(getInitialFormulas);
  const [activeIdx, setActiveIdx] = useState<number>(0);

  useEffect(() => {
    setFormulas(getInitialFormulas());
  }, [JSON.stringify(rawFormulas)]);

  const saveFormulas = (next: string[]) => {
    setFormulas(next);
    // Keep empty formula slots so clearing text to retype does not remove the component.
    updateMeta({
      formulas: next,
      equations: next.map((latex, i) => ({
        id: `eq-${i}`,
        latex,
        format: "latex",
      })),
    });
  };

  const updateFormulaText = (index: number, text: string) => {
    const next = [...formulas];
    next[index] = text;
    saveFormulas(next);
  };

  const insertSnippet = (latexSnippet: string) => {
    const current = formulas[activeIdx] || "";
    const updated = current ? `${current} ${latexSnippet}` : latexSnippet;
    updateFormulaText(activeIdx, updated);
  };

  const addFormula = () => {
    const next = [...formulas, ""];
    saveFormulas(next);
    setActiveIdx(next.length - 1);
  };

  const removeFormula = (index: number) => {
    if (formulas.length <= 1) {
      updateMeta({ formulas: null, equations: null });
      return;
    }
    const next = formulas.filter((_, i) => i !== index);
    saveFormulas(next);
    setActiveIdx(Math.max(0, index - 1));
  };

  return (
    <QuizSection
      title="Native Editable Formula Component"
      description="Click symbol shortcuts to build complex math & chemical expressions. Live rendered in real time."
      action={
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={addFormula} className="h-8 gap-1 rounded-full text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Formula
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeFormula(activeIdx)}
            className="h-8 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Symbol Insertion Toolbar */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <Sigma className="h-3.5 w-3.5 text-primary" /> Symbol Shortcuts (inserts into active formula field):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FORMULA_SNIPPETS.map((snippet, idx) => (
              <Button
                key={idx}
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs font-mono bg-card border border-border/50 hover:border-primary/50 hover:bg-primary/5"
                onClick={() => insertSnippet(snippet.latex)}
                title={`Insert ${snippet.label}`}
              >
                {snippet.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Formulas list */}
        {formulas.map((formulaStr, idx) => (
          <div
            key={idx}
            className={`space-y-3 rounded-xl border p-3 transition-all ${
              idx === activeIdx ? "border-primary/60 bg-card shadow-sm ring-1 ring-primary/20" : "border-border/60 bg-card/50"
            }`}
            onClick={() => setActiveIdx(idx)}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground font-mono">Formula #{idx + 1} (LaTeX)</span>
              {formulas.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFormula(idx);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>

            <Textarea
              value={formulaStr}
              onChange={(e) => updateFormulaText(idx, e.target.value)}
              placeholder="e.g. \\frac{a}{b} = c^2"
              className="font-mono text-sm min-h-[60px] resize-y"
            />

            {/* Live KaTeX Preview */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-center min-h-[50px] flex items-center justify-center">
              {formulaStr.trim() ? (
                <div className="text-lg font-serif text-primary flex items-center justify-center gap-1">
                  {parseMathSegments(`$${formulaStr.replace(/^\$+|\$+$/g, "")}$`).map((seg, sIdx) => (
                    <MathSegmentView key={sIdx} segment={seg} />
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">Live preview will appear here…</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </QuizSection>
  );
}
