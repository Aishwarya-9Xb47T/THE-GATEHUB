import { useState } from "react";
import { Plus, Trash2, GripVertical, Image as ImageIcon, Sigma, Table as TableIcon, Code, Globe, List as ListIcon, Video as VideoIcon } from "lucide-react";
import { OptionCardList } from "@/components/quiz-builder/studio/OptionCardList";
import type { QuizQuestion } from "@/lib/quizBuilder/types";
import {
  CHOICE_TYPES,
  CODING_TYPES,
  CONTEXT_TYPES,
  MATCHING_TYPES,
  MEDIA_TYPES,
  ORDERING_TYPES,
  TEXT_ANSWER_TYPES,
} from "@/lib/quizBuilder/questionTypeUtils";
import { RichContentEditor, QuestionMediaField, MediaUploader } from "@/components/media";
import { parseContentBlocks, serializeContentBlocks, mergeAdjacentTextBlocks } from "@/components/media/contentBlocks";
import { extractPassageOrContextText } from "@/components/media/questionDisplay";
import { QuizSection } from "@/components/quiz-builder/studio/QuizSection";
import { QuestionAiAssist } from "@/components/quiz-builder/studio/QuestionAiAssist";
import { ManagedMonacoEditor } from "@/learning-engine/workspaces/engine/ManagedMonacoEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableTableComponent } from "@/components/quiz-builder/studio/EditableTableComponent";
import { EditableFormulaComponent } from "@/components/quiz-builder/studio/EditableFormulaComponent";
import { EditableImageComponent } from "@/components/quiz-builder/studio/EditableImageComponent";
import { EditableLinkComponent } from "@/components/quiz-builder/studio/EditableLinkComponent";
import { EditableListComponent } from "@/components/quiz-builder/studio/EditableListComponent";

interface QuestionTypeEditorProps {
  question: QuizQuestion;
  onChange: (patch: Partial<QuizQuestion>) => void;
  hideAiAssist?: boolean;
  autoFocusStem?: boolean;
}

export function hasValidTableData(question: any, meta: any): boolean {
  const contextData = (meta?.context || {}) as any;
  const rawTable =
    meta?.table ||
    (Array.isArray(meta?.tables) && meta.tables.length > 0 ? meta.tables[0] : null) ||
    question?.table ||
    question?.metadata?.table ||
    (Array.isArray(question?.tables) && question.tables.length > 0 ? question.tables[0] : null) ||
    contextData?.table ||
    (Array.isArray(contextData?.tables) && contextData.tables.length > 0 ? contextData.tables[0] : null);

  if (!rawTable) return false;

  if (typeof rawTable === "object" && rawTable !== null) {
    const headers = Array.isArray(rawTable.headers) ? rawTable.headers.filter((h: any) => String(h).trim().length > 0) : [];
    const rows = Array.isArray(rawTable.rows) ? rawTable.rows : Array.isArray(rawTable.cells) ? rawTable.cells : [];
    const validRows = Array.isArray(rows) ? rows.filter((r: any) => Array.isArray(r) && r.some((c: any) => String(c).trim().length > 0)) : [];
    const hasHtml = typeof rawTable.html === "string" && rawTable.html.trim().length > 0;
    
    return headers.length > 0 || validRows.length > 0 || hasHtml;
  }

  return false;
}

export function hasValidFormulaData(question: any, meta: any): boolean {
  const rawFormulas =
    meta?.formulas ??
    meta?.equations ??
    question?.formulas ??
    question?.metadata?.formulas ??
    (Array.isArray(meta?.equations) ? meta.equations : null) ??
    (Array.isArray(question?.equations) ? question.equations : null);

  // Presence of a formulas/equations slot keeps the editor mounted even while empty
  // (so clearing text to retype does not delete the component).
  if (Array.isArray(rawFormulas)) return rawFormulas.length > 0;
  if (typeof rawFormulas === "string") return true;
  return false;
}

export function hasValidImageData(question: any, meta: any): boolean {
  const isValidImageUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed || trimmed === "https://") return false;
    if (trimmed.startsWith("data:image/")) {
      const commaIdx = trimmed.indexOf(",");
      return commaIdx >= 0 && trimmed.length - commaIdx - 1 >= 32;
    }
    return trimmed.length > 0;
  };

  const resolvedUrl = String(
    meta?.mediaUrl ||
    (meta?.media as any)?.url ||
    (meta?.diagram as any)?.dataUrl ||
    (meta?.diagram as any)?.url ||
    (Array.isArray(meta?.images) ? meta.images[0]?.dataUrl || meta.images[0]?.url : undefined) ||
    (Array.isArray(question?.media) ? question.media[0]?.dataUrl || question.media[0]?.url : undefined) ||
    question?.media?.url ||
    question?.diagram?.dataUrl ||
    question?.diagram?.url ||
    ""
  ).trim();

  if (isValidImageUrl(resolvedUrl)) return true;

  const childImageUrl = (meta?.children || question?.metadata?.children || question?.children || [])
    .find((child: any) => child?.type === "image" && child?.imageUrl)?.imageUrl;
  if (childImageUrl && isValidImageUrl(String(childImageUrl))) return true;

  // Also check question.text for image content blocks
  if (question?.text) {
    return parseContentBlocks(String(question.text)).some((b) => b.type === "image");
  }

  return false;
}

export function hasValidCodeData(question: any, meta: any): boolean {
  const codeObj = (meta?.code || question?.code || question?.codeBlock || question?.metadata?.code || (Array.isArray(meta?.codeBlocks) ? meta.codeBlocks[0] : null)) as any;
  const starterCodeRaw = meta?.starterCode ?? question?.starterCode ?? (codeObj?.code ?? codeObj?.content);
  const starterCode = String(starterCodeRaw ?? "").trim();
  const fromChildren = Array.isArray(question?.children)
    ? question.children.some((c: any) => c?.type === "code")
    : false;
  const fromMetaChildren = Array.isArray(meta?.children)
    ? meta.children.some((c: any) => c?.type === "code")
    : false;
  const fromCodeBlocks = Array.isArray(meta?.codeBlocks) && meta.codeBlocks.length > 0;
  const hasCodeSlot =
    meta?.code != null ||
    meta?.starterCode != null ||
    question?.code != null ||
    question?.codeBlock != null ||
    question?.starterCode != null ||
    fromCodeBlocks ||
    fromChildren ||
    fromMetaChildren;
  const isCodingType = question?.type === "coding" || question?.type === "code_question" || question?.type === "coding_question" || question?.type === "sql";

  // Keep the code editor mounted while the slot exists, even if the source is temporarily empty.
  return hasCodeSlot || starterCode.length > 0 || isCodingType;
}

export function hasValidLinkData(question: any, meta: any): boolean {
  const rawLinks = meta?.hyperlinks || meta?.hyperlink || question?.hyperlinks || question?.hyperlink;
  if (Array.isArray(rawLinks) && rawLinks.length > 0) {
    return rawLinks.some((l: any) => typeof l === "string" ? l.trim().length > 0 : Boolean(l?.url || l?.text));
  }
  if (typeof rawLinks === "string" && rawLinks.trim().length > 0) {
    return true;
  }
  return false;
}

export function hasValidListData(question: any, meta: any): boolean {
  const rawList = meta?.lists || meta?.list || question?.lists || question?.list;
  if (Array.isArray(rawList) && rawList.length > 0) {
    const first = rawList[0];
    if (typeof first === "object" && first !== null && Array.isArray(first.items)) {
      return first.items.some((i: any) => String(i).trim().length > 0);
    }
    return rawList.some((item: any) => String(item.text || item).trim().length > 0);
  }
  if (typeof rawList === "string" && rawList.trim().length > 0) {
    return true;
  }
  return false;
}

export function QuestionTypeEditor({ question, onChange, hideAiAssist, autoFocusStem }: QuestionTypeEditorProps) {
  const meta = (question?.metadata || {}) as Record<string, unknown>;
  const updateMeta = (patch: Record<string, unknown>) =>
    onChange({ metadata: { ...meta, ...patch } });

  // State for the "Add Component" media insertion dialog
  const [addMediaOpen, setAddMediaOpen] = useState(false);
  const [addMediaKind, setAddMediaKind] = useState<"image" | "video">("image");

  /** Insert a media markdown block into question.text (the VisualBlockEditor content). */
  const insertIntoText = (markdown: string) => {
    const existing = parseContentBlocks(question.text || "");
    const newBlocks = parseContentBlocks(markdown).filter((b) => b.type !== "text");
    if (!newBlocks.length) return;
    const combined = [...existing, ...newBlocks];
    onChange({ text: serializeContentBlocks(mergeAdjacentTextBlocks(combined)) });
  };

  const hasTable = hasValidTableData(question, meta);
  const hasFormula = hasValidFormulaData(question, meta);
  const hasImage = hasValidImageData(question, meta);
  const hasCode = hasValidCodeData(question, meta);
  const hasLink = hasValidLinkData(question, meta);
  const hasList = hasValidListData(question, meta);

  return (
    <div className="space-y-8">
      {!hideAiAssist && <QuestionAiAssist question={question} onApply={onChange} />}

      <QuizSection title="Question" description="What students will see as the main prompt">
        <RichContentEditor
          value={question.text}
          onChange={(text) => onChange({ text })}
          placeholder="Type your question prompt here…"
          inputId={`question-stem-${question.id}`}
          autoFocus={autoFocusStem}
        />
        {/* Component Toolbar */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
          <span className="text-[11px] font-semibold text-muted-foreground mr-1">Add Component:</span>
          {!hasImage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 rounded-lg"
              onClick={() => {
                setAddMediaKind("image");
                setAddMediaOpen(true);
              }}
            >
              <ImageIcon className="h-3 w-3 text-emerald-500" /> Image
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 rounded-lg"
            onClick={() => {
              setAddMediaKind("video");
              setAddMediaOpen(true);
            }}
          >
            <VideoIcon className="h-3 w-3 text-sky-500" /> Video
          </Button>
          {!hasFormula && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 rounded-lg"
              onClick={() => updateMeta({ formulas: ["a^2 + b^2 = c^2"] })}
            >
              <Sigma className="h-3 w-3 text-purple-500" /> Formula
            </Button>
          )}
          {!hasTable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 rounded-lg"
              onClick={() =>
                updateMeta({
                  table: {
                    headers: ["Language", "Creator", "Year"],
                    rows: [
                      ["Python", "Guido", "1991"],
                      ["Java", "James", "1995"],
                    ],
                  },
                })
              }
            >
              <TableIcon className="h-3 w-3 text-blue-500" /> Table
            </Button>
          )}
          {!hasCode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 rounded-lg"
              onClick={() => updateMeta({ starterCode: "def solution():\n    pass", language: "python", code: { code: "def solution():\n    pass", language: "python" } })}
            >
              <Code className="h-3 w-3 text-amber-500" /> Code
            </Button>
          )}
          {!hasLink && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 rounded-lg"
              onClick={() => updateMeta({ hyperlinks: [{ text: "Reference Link", url: "https://example.com" }] })}
            >
              <Globe className="h-3 w-3 text-cyan-500" /> Link
            </Button>
          )}
          {!hasList && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 rounded-lg"
              onClick={() => updateMeta({ lists: [{ style: "unordered", items: ["Item 1", "Item 2"] }] })}
            >
              <ListIcon className="h-3 w-3 text-rose-500" /> List
            </Button>
          )}
        </div>
      </QuizSection>

      {/* 1. Reading Passage Component */}
      {(() => {
        const passageText = extractPassageOrContextText(meta.passage || meta.context);
        if (!passageText && !CONTEXT_TYPES.has(question.type)) return null;
        return (
          <QuizSection title="Reading Passage / Context" description="Passage or scenario linked above this question">
            <RichContentEditor
              value={passageText}
              onChange={(passageText) => updateMeta({ passage: passageText, context: passageText })}
              placeholder="Passage or case setup text…"
              inputId={`question-passage-${question.id}`}
            />
          </QuizSection>
        );
      })()}

      {/* 2. Native Image Component */}
      {hasImage && <EditableImageComponent question={question} meta={meta} updateMeta={updateMeta} />}

      {/* 3. Native Formula / Math Component */}
      {hasFormula && <EditableFormulaComponent question={question} meta={meta} updateMeta={updateMeta} />}

      {/* 4. Native Table Component */}
      {hasTable && <EditableTableComponent question={question} meta={meta} updateMeta={updateMeta} />}

      {/* 5. Native Code Component (Monaco) */}
      {hasCode && (
        <QuizSection title="Code Block Component" description="Structured code snippet for students to analyze or edit">
          <CodingEditor meta={meta} updateMeta={updateMeta} type={question.type} questionId={question.id} />
        </QuizSection>
      )}

      {/* 6. Native Hyperlink Component */}
      {hasLink && <EditableLinkComponent question={question} meta={meta} updateMeta={updateMeta} />}

      {/* 7. Native List Component */}
      {hasList && <EditableListComponent question={question} meta={meta} updateMeta={updateMeta} />}

      {(CHOICE_TYPES.has(question.type) || (Array.isArray(question.options) && question.options.length > 0) || question.type === "table_question" || question.type === "code_question" || question.type === "equation_question") && (
        <OptionCardList question={question} onChange={onChange} />
      )}

      {ORDERING_TYPES.has(question.type) && (
        <OrderingEditor question={question} onChange={onChange} />
      )}

      {MATCHING_TYPES.has(question.type) && (
        <MatchingEditor question={question} onChange={onChange} isMatrix={question.type === "matrix"} meta={meta} updateMeta={updateMeta} />
      )}

      {TEXT_ANSWER_TYPES.has(question.type) && (
        <TextAnswerEditor question={question} onChange={onChange} meta={meta} updateMeta={updateMeta} />
      )}

      {question.type === "hotspot" && (
        <HotspotEditor meta={meta} updateMeta={updateMeta} />
      )}

      <QuizSection title="Explanation" description="Shown after students answer — helps them learn from mistakes">
        <RichContentEditor
          value={question.explanation || ""}
          onChange={(explanation) => onChange({ explanation })}
          placeholder="Why is this the correct answer?"
          compact
        />
      </QuizSection>

      <QuizSection title="Hints" description="Optional clues for struggling students">
        <RichContentEditor
          value={question.hints.join("\n")}
          onChange={(hintsText) =>
            onChange({ hints: hintsText.split("\n").map((h) => h.trim()).filter(Boolean) })
          }
          placeholder="Add a hint…"
          compact
          inputId={`question-hints-${question.id}`}
        />
      </QuizSection>

      {/* MediaUploader dialog for "Add Component: Image / Video" buttons */}
      <MediaUploader
        open={addMediaOpen}
        onOpenChange={setAddMediaOpen}
        defaultKind={addMediaKind}
        onInsert={insertIntoText}
      />
    </div>
  );
}


function OrderingEditor({
  question,
  onChange,
}: {
  question: QuizQuestion;
  onChange: (patch: Partial<QuizQuestion>) => void;
}) {
  return (
    <QuizSection
      title="Items in order"
      description="Top = first. Students will drag these into the correct sequence."
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-full"
          onClick={() =>
            onChange({
              options: [
                ...question.options,
                { id: `o-${Date.now()}`, text: "", isCorrect: true, order: question.options.length },
              ],
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </Button>
      }
    >
      <div className="space-y-2">
        {question.options.map((opt, oi) => (
          <div
            key={opt.id}
            className="flex items-start gap-2 rounded-2xl border-2 border-border/50 bg-card p-2 transition-shadow hover:shadow-sm"
          >
            <div className="flex w-10 shrink-0 flex-col items-center gap-1 pt-2">
              <GripVertical className="h-4 w-4 text-muted-foreground/50" />
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                {oi + 1}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <RichContentEditor
                value={opt.text}
                onChange={(text) => {
                  const options = [...question.options];
                  options[oi] = { ...options[oi]!, text };
                  onChange({ options });
                }}
                placeholder={`Item ${oi + 1}`}
                compact
                showTextFormats={false}
                inputId={`ordering-${question.id}-${oi}`}
              />
            </div>
            {question.options.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 h-8 w-8 shrink-0 text-destructive"
                onClick={() => onChange({ options: question.options.filter((_, i) => i !== oi) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </QuizSection>
  );
}

function MatchingEditor({
  question,
  onChange,
  isMatrix,
  meta,
  updateMeta,
}: {
  question: QuizQuestion;
  onChange: (patch: Partial<QuizQuestion>) => void;
  isMatrix: boolean;
  meta: Record<string, unknown>;
  updateMeta: (patch: Record<string, unknown>) => void;
}) {
  const pairs = [];
  for (let i = 0; i < question.options.length; i += 2) {
    pairs.push({ left: question.options[i], right: question.options[i + 1] });
  }

  const updatePair = (pi: number, side: "left" | "right", text: string) => {
    const options = [...question.options];
    const idx = pi * 2 + (side === "right" ? 1 : 0);
    if (options[idx]) options[idx] = { ...options[idx]!, text };
    onChange({ options });
  };

  return (
    <QuizSection
      title={isMatrix ? "Matrix question" : "Matching pairs"}
      description={isMatrix ? "Define rows, columns, and cell matches" : "Left prompts match to right answers"}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-full"
          onClick={() => {
            const n = question.options.length;
            onChange({
              options: [
                ...question.options,
                { id: `l-${Date.now()}`, text: "", isCorrect: true, order: n },
                { id: `r-${Date.now()}`, text: "", isCorrect: false, order: n + 1 },
              ],
            });
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add pair
        </Button>
      }
    >
      {isMatrix && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <RichContentEditor
            compact
            label="Rows"
            placeholder="One row per line"
            value={((meta.matrixRows as string[]) || []).join("\n")}
            onChange={(text) => updateMeta({ matrixRows: text.split("\n").filter(Boolean) })}
            inputId={`matrix-rows-${question.id}`}
            showTextFormats={false}
          />
          <RichContentEditor
            compact
            label="Columns"
            placeholder="One column per line"
            value={((meta.matrixCols as string[]) || []).join("\n")}
            onChange={(text) => updateMeta({ matrixCols: text.split("\n").filter(Boolean) })}
            inputId={`matrix-cols-${question.id}`}
            showTextFormats={false}
          />
        </div>
      )}
      <div className="space-y-3">
        {pairs.map((pair, pi) => (
          <div
            key={pi}
            className="grid gap-2 rounded-2xl border-2 border-border/50 bg-card p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start"
          >
            <RichContentEditor
              value={pair.left?.text || ""}
              onChange={(text) => updatePair(pi, "left", text)}
              label={`Prompt ${pi + 1}`}
              placeholder="Left side"
              compact
              showTextFormats={false}
              inputId={`match-left-${question.id}-${pi}`}
            />
            <div className="hidden items-center justify-center pt-8 text-muted-foreground sm:flex">→</div>
            <RichContentEditor
              value={pair.right?.text || ""}
              onChange={(text) => updatePair(pi, "right", text)}
              label={`Match ${pi + 1}`}
              placeholder="Right side"
              compact
              showTextFormats={false}
              inputId={`match-right-${question.id}-${pi}`}
            />
          </div>
        ))}
      </div>
    </QuizSection>
  );
}

function TextAnswerEditor({
  question,
  onChange,
  meta,
  updateMeta,
}: {
  question: QuizQuestion;
  onChange: (patch: Partial<QuizQuestion>) => void;
  meta: Record<string, unknown>;
  updateMeta: (patch: Record<string, unknown>) => void;
}) {
  if (question.type === "essay") {
    return (
      <QuizSection title="Essay response" description="Students submit free-text answers for manual or AI grading">
        <div className="rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No answer key needed — responses are collected as written work.
        </div>
      </QuizSection>
    );
  }

  if (question.type === "numerical") {
    return (
      <QuizSection title="Numeric answer" description="Students enter a number; tolerance allows close matches">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Correct value</Label>
            <Input
              type="number"
              className="h-11 rounded-xl"
              value={String(meta.numericAnswer ?? "")}
              onChange={(e) => updateMeta({ numericAnswer: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tolerance (±)</Label>
            <Input
              type="number"
              className="h-11 rounded-xl"
              value={String(meta.numericTolerance ?? 0)}
              onChange={(e) => updateMeta({ numericTolerance: Number(e.target.value) })}
            />
          </div>
        </div>
      </QuizSection>
    );
  }

  return (
    <QuizSection title="Accepted answers" description="Separate variants with | — matching is case-insensitive">
      <Input
        className="h-11 rounded-xl"
        value={question.options[0]?.text || ""}
        onChange={(e) => {
          const val = e.target.value;
          const answers = val.split("|").map((s) => s.trim()).filter(Boolean);
          const options = question.options.length
            ? [{ ...question.options[0]!, text: val, isCorrect: true }]
            : [{ id: `a-${Date.now()}`, text: val, isCorrect: true, order: 0 }];
          onChange({
            options,
            metadata: {
              ...(question.metadata as object || {}),
              acceptableAnswers: answers,
            },
          });
        }}
        placeholder="e.g. photosynthesis | Photosynthesis"
      />
    </QuizSection>
  );
}

function resolveQuestionCodeSource(meta: Record<string, unknown>, questionId: string): { lang: string; code: string } {
  const topQ = (questionId ? (window as any)?.__quizQuestions?.find((q: any) => q.id === questionId) : null) as any;
  const codeObj = (meta.code || topQ?.code || topQ?.codeBlock || topQ?.metadata?.code || (Array.isArray(meta.codeBlocks) ? meta.codeBlocks[0] : null) || (Array.isArray(topQ?.codeBlocks) ? topQ.codeBlocks[0] : null)) as any;
  const childCodeBlocks = [
    ...(Array.isArray(meta.children) ? meta.children : []),
    ...(Array.isArray(topQ?.children) ? topQ.children : []),
    ...(Array.isArray(topQ?.metadata?.children) ? topQ.metadata.children : []),
  ].filter((c: any) => c?.type === "code");
  const fromChildren = childCodeBlocks
    .map((c: any) => String(c.code || c.content || "").replace(/\n$/, ""))
    .filter(Boolean)
    .join("\n\n");
  const lang = String(
    codeObj?.language ||
      meta.language ||
      childCodeBlocks[0]?.language ||
      "python",
  ).toLowerCase();
  const code = String(
    meta.starterCode ||
      topQ?.starterCode ||
      topQ?.metadata?.starterCode ||
      (codeObj?.code || codeObj?.content) ||
      topQ?.codeBlock?.content ||
      fromChildren ||
      (Array.isArray(meta.codeBlocks) ? meta.codeBlocks.map((c: any) => (typeof c === "string" ? c : c.code || c.content)).join("\n") : "") ||
      (Array.isArray(topQ?.codeBlocks) ? topQ.codeBlocks.map((c: any) => (typeof c === "string" ? c : c.code || c.content)).join("\n") : "") ||
      "",
  );
  return { lang, code };
}

function CodingEditor({
  meta,
  updateMeta,
  type,
  questionId,
}: {
  meta: Record<string, unknown>;
  updateMeta: (patch: Record<string, unknown>) => void;
  type: string;
  questionId: string;
}) {
  const { lang, code: initialCode } = resolveQuestionCodeSource(meta, questionId);

  const isCodingQuestion = type === "coding" || type === "code_question";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Language</Label>
        <select
          className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
          value={lang}
          onChange={(e) => updateMeta({ language: e.target.value })}
        >
          {["javascript", "typescript", "python", "java", "cpp", "c", "go", "rust", "kotlin", "sql"].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60">
        <p className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium font-mono text-primary">
          {isCodingQuestion ? `Starter Code (${lang})` : `Code Snippet (${lang})`}
        </p>
        <ManagedMonacoEditor
          instanceKey={`quiz-code-${questionId}`}
          language={lang === "cpp" ? "cpp" : lang}
          source={initialCode}
          onSourceChange={(starterCode) => updateMeta({ starterCode, code: { code: starterCode, language: lang } })}
          height={220}
          wordWrap
        />
      </div>
      {isCodingQuestion && (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <p className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium font-mono text-muted-foreground">
            Solution / Expected Output
          </p>
          <ManagedMonacoEditor
            instanceKey={`quiz-solution-${questionId}`}
            language={lang === "cpp" ? "cpp" : lang}
            source={String(meta.expectedOutput || meta.solutionCode || "")}
            onSourceChange={(v) => updateMeta({ solutionCode: v, expectedOutput: v })}
            height={140}
            wordWrap
          />
        </div>
      )}
    </div>
  );
}

function MediaFields({
  updateMeta,
  meta,
  questionType,
  question,
}: {
  updateMeta: (patch: Record<string, unknown>) => void;
  meta: Record<string, unknown>;
  questionType: string;
  question?: QuizQuestion;
}) {
  const defaultKind =
    questionType === "video_based" ? "video" : questionType === "audio_based" ? "audio" : "image";

  const resolvedMediaUrl = String(
    meta.mediaUrl ||
    (meta.media as any)?.url ||
    (meta.diagram as any)?.dataUrl ||
    (meta.diagram as any)?.url ||
    (Array.isArray(meta.images) ? meta.images[0]?.dataUrl || meta.images[0]?.url : undefined) ||
    (question as any)?.media?.url ||
    (question as any)?.diagram?.dataUrl ||
    (question as any)?.diagram?.url ||
    ""
  );

  return (
    <QuizSection
      title={
        questionType === "hotspot"
          ? "Background image"
          : questionType === "video_based"
            ? "Video stimulus"
            : questionType === "audio_based"
              ? "Audio stimulus"
              : "Question image"
      }
      description="Upload or link media — students see it with the question"
    >
      <QuestionMediaField
        mediaUrl={resolvedMediaUrl}
        onMediaUrlChange={(mediaUrl: string) => updateMeta({ mediaUrl, media: mediaUrl ? { url: mediaUrl, kind: "image" } : undefined })}
        defaultKind={defaultKind}
      />
    </QuizSection>
  );
}

function HotspotEditor({
  meta,
  updateMeta,
}: {
  meta: Record<string, unknown>;
  updateMeta: (patch: Record<string, unknown>) => void;
}) {
  const hotspots = (meta.hotspots as Array<{ label: string; x: number; y: number }>) || [];
  const correctHotspot = String(meta.correctHotspot || "");
  return (
    <QuizSection
      title="Hotspot regions"
      description="Clickable areas on the background image — mark which region is correct"
    >
      {hotspots.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Correct region</Label>
          <select
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            value={correctHotspot}
            onChange={(e) => updateMeta({ correctHotspot: e.target.value })}
          >
            <option value="">Select correct hotspot…</option>
            {hotspots.filter((h) => h.label.trim()).map((h) => (
              <option key={h.label} value={h.label}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        {hotspots.map((h, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 rounded-xl border border-border/40 bg-muted/10 p-2">
            <Input
              className="rounded-lg"
              value={h.label}
              onChange={(e) => {
                const next = [...hotspots];
                next[i] = { ...next[i]!, label: e.target.value };
                updateMeta({ hotspots: next });
              }}
              placeholder="Label"
            />
            <Input
              className="rounded-lg"
              type="number"
              value={h.x}
              onChange={(e) => {
                const next = [...hotspots];
                next[i] = { ...next[i]!, x: Number(e.target.value) };
                updateMeta({ hotspots: next });
              }}
              placeholder="X %"
            />
            <Input
              className="rounded-lg"
              type="number"
              value={h.y}
              onChange={(e) => {
                const next = [...hotspots];
                next[i] = { ...next[i]!, y: Number(e.target.value) };
                updateMeta({ hotspots: next });
              }}
              placeholder="Y %"
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => updateMeta({ hotspots: [...hotspots, { label: "", x: 50, y: 50 }] })}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add region
      </Button>
    </QuizSection>
  );
}
