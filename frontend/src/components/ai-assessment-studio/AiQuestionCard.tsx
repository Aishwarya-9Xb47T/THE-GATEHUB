import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Trash2, Sparkles, ChevronDown, AlertTriangle } from "lucide-react";
import { useState } from "react";
import type { AiGeneratedQuestion } from "@/lib/aiAssessmentStudio";
import type { CopilotIntent } from "@/lib/aiAssessmentStudio/copilotTypes";
import { QUESTION_TYPE_LABELS } from "@/lib/assessmentStudio/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useAiAssessmentStore } from "@/lib/aiAssessmentStudio/store";
import { useAiCopilot } from "@/lib/aiAssessmentStudio/useAiCopilot";
import { cn } from "@/lib/utils";

const QUESTION_ACTIONS: Array<{ intent: CopilotIntent; label: string }> = [
  { intent: "rewrite", label: "Rewrite" },
  { intent: "simplify", label: "Simplify" },
  { intent: "harder", label: "Increase difficulty" },
  { intent: "easier", label: "Decrease difficulty" },
  { intent: "generate_similar", label: "Generate similar" },
  { intent: "generate_opposite", label: "Generate opposite" },
  { intent: "generate_numerical", label: "Numerical version" },
  { intent: "generate_coding", label: "Coding version" },
  { intent: "generate_scenario", label: "Scenario" },
  { intent: "generate_explanation", label: "Explanation" },
  { intent: "generate_hint", label: "Hint" },
  { intent: "improve_grammar", label: "Improve grammar" },
  { intent: "improve_distractors", label: "Improve distractors" },
  { intent: "regenerate", label: "Regenerate" },
];

interface AiQuestionCardProps {
  q: AiGeneratedQuestion;
  index: number;
  issues?: Array<{ message: string; severity: string }>;
  onToggle: (id: string, selected: boolean) => void;
  onUpdate: (id: string, patch: Partial<AiGeneratedQuestion>) => void;
  onDelete: (id: string) => void;
}

export function AiQuestionCard({ q, index, issues, onToggle, onUpdate, onDelete }: AiQuestionCardProps) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bulkSelected = useAiAssessmentStore((s) => s.bulkSelected);
  const toggleBulkSelect = useAiAssessmentStore((s) => s.toggleBulkSelect);
  const aiEditingIds = useAiAssessmentStore((s) => s.aiEditingIds);
  const { runAction, isBusy } = useAiCopilot();

  const isAiEditing = aiEditingIds.has(q.id);
  const isBulk = bulkSelected.has(q.id);

  const run = (intent: CopilotIntent) => {
    setMenuOpen(false);
    runAction(intent, [q.id]);
  };

  return (
    <motion.article
      layout
      animate={isAiEditing ? { boxShadow: "0 0 24px rgba(212,175,55,0.25)" } : { boxShadow: "none" }}
      className={cn(
        "rounded-2xl border p-5 backdrop-blur-sm transition-colors",
        isAiEditing ? "border-primary/50 bg-primary/5" : "border-white/10 bg-white/5",
        isBulk && "ring-1 ring-primary/40"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-2">
          <Checkbox checked={q.selected} onCheckedChange={(v) => onToggle(q.id, Boolean(v))} className="mt-1" />
          <Checkbox
            checked={isBulk}
            onCheckedChange={() => toggleBulkSelect(q.id)}
            title="Select for bulk AI"
            className="border-primary/40 data-[state=checked]:bg-primary/30"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-primary">Q{index + 1}</span>
            <Badge variant="outline" className="text-[10px]">{QUESTION_TYPE_LABELS[q.type] || q.type}</Badge>
            {q.difficulty && <Badge variant="secondary" className="text-[10px] capitalize">{q.difficulty}</Badge>}
            {q.bloomLevel && <Badge variant="secondary" className="text-[10px]">{q.bloomLevel}</Badge>}
            {q.confidence != null && (
              <Badge className="bg-emerald-500/15 text-[10px] text-emerald-400">{Math.round(q.confidence * 100)}%</Badge>
            )}
            {isAiEditing && (
              <Badge className="animate-pulse bg-primary/20 text-[10px] text-primary">
                <Sparkles className="mr-1 inline h-3 w-3" />
                AI editing
              </Badge>
            )}
          </div>
          {issues?.map((iss, i) => (
            <p key={i} className="mb-1 flex items-center gap-1 text-[10px] text-amber-400/90">
              <AlertTriangle className="h-3 w-3" />
              {iss.message}
            </p>
          ))}
          {editing ? (
            <Textarea
              value={q.stem}
              onChange={(e) => onUpdate(q.id, { stem: e.target.value })}
              rows={3}
              className="border-white/10 bg-white/5 text-white"
            />
          ) : (
            <p className="text-sm font-medium text-white">{q.stem}</p>
          )}

          {/* Attached Image / Media */}
          {(q.mediaUrl || q.images?.length || (q.metadata as any)?.mediaUrl) && (
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
              <img
                src={q.mediaUrl || (q.metadata as any)?.mediaUrl || (q.images && q.images[0]?.dataUrl)}
                alt="Question Asset"
                className="max-h-60 w-auto rounded-lg object-contain"
              />
            </div>
          )}

          {/* Code Block */}
          {(q.codeBlock || q.code || q.starterCode || (q.metadata as any)?.code) && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-xs text-emerald-300">
              <pre>{typeof (q.codeBlock || q.code || (q.metadata as any)?.code) === 'object' ? (q.codeBlock || q.code || (q.metadata as any)?.code).content : (q.code || q.starterCode || (q.metadata as any)?.code)}</pre>
            </div>
          )}

          {/* Table */}
          {(q.table || (q.metadata as any)?.table) && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs text-white"
                 dangerouslySetInnerHTML={{ __html: (q.table || (q.metadata as any)?.table)?.html || '' }} />
          )}

          {/* Formulas / Equations */}
          {(q.formulas?.length || q.equations?.length || (q.metadata as any)?.formulas) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(q.formulas || (q.metadata as any)?.formulas || []).map((f: string, i: number) => (
                <span key={i} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                  ${f}$
                </span>
              ))}
            </div>
          )}

          {/* Hyperlinks */}
          {(q.hyperlinks?.length || (q.metadata as any)?.hyperlinks) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(q.hyperlinks || (q.metadata as any)?.hyperlinks || []).map((link: any, i: number) => (
                <a
                  key={i}
                  href={link.url || link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300 hover:underline"
                >
                  🔗 {link.text || link.url || link}
                </a>
              ))}
            </div>
          )}

          {/* Lists (Ordered / Unordered / Checklist) */}
          {(q.lists?.length || (q.metadata as any)?.lists) && (
            <div className="mt-3 space-y-2 text-xs text-white/80">
              {(q.lists || (q.metadata as any)?.lists || []).map((list: any, liIdx: number) => (
                <div key={liIdx} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  {list.style === 'ordered' ? (
                    <ol className="list-decimal pl-5 space-y-1">
                      {list.items?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ol>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1">
                      {list.items?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {q.options && q.options.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-white/60">
              {q.options.map((o, i) => (
                <li key={i} className={o.isCorrect ? "text-emerald-400 font-medium" : ""}>
                  {o.isCorrect ? "✓ " : "○ "}{o.text}
                </li>
              ))}
            </ul>
          )}
          {q.hints?.length ? (
            <p className="mt-2 text-xs text-white/40">Hint: {q.hints[0]}</p>
          ) : null}
          {q.explanation && <p className="mt-2 text-xs text-white/40">Explanation: {q.explanation}</p>}

          {/* FRONTEND DEBUG LOG PANEL */}
          <div className="mt-4 rounded-lg border border-primary/20 bg-slate-950/80 p-2 text-[10px] text-slate-400 font-mono">
            <p className="font-bold text-primary">Frontend Debug Log</p>
            <p>Question ID: {q.id}</p>
            <p>Received Images: {q.mediaUrl || (q.metadata as any)?.mediaUrl ? '1 image attached' : '0 images'}</p>
            <p>Received Tables: {q.table || (q.metadata as any)?.table ? '1 table attached' : '0 tables'}</p>
            <p>Received Code: {q.codeBlock || q.code || (q.metadata as any)?.code ? '1 code block attached' : '0 code blocks'}</p>
            <p>Received Formula: {q.formulas?.length || (q.metadata as any)?.formulas?.length ? `${q.formulas?.length || (q.metadata as any)?.formulas?.length} formula(s)` : '0 formulas'}</p>
            <p>Received Lists: {q.lists?.length || (q.metadata as any)?.lists?.length ? 'List attached' : '0 lists'}</p>
            <p>Received Hyperlinks: {q.hyperlinks?.length || (q.metadata as any)?.hyperlinks?.length ? 'Hyperlink attached' : '0 hyperlinks'}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-primary/30 text-xs text-primary"
              disabled={isBusy}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              AI
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 py-1 shadow-xl"
                >
                  {QUESTION_ACTIONS.map((a) => (
                    <button
                      key={a.intent}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-primary/15 hover:text-white"
                      onClick={() => run(a.intent)}
                    >
                      {a.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(!editing)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(q.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
