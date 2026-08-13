import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MediaToolbar, type FormatAction, type MediaToolbarAction } from "./MediaToolbar";
import { MediaUploader, handleEditorMediaDrop, handleEditorMediaPaste } from "./MediaUploader";
import { FormulaDialog } from "./FormulaDialog";
import { CodeDialog } from "./CodeDialog";
import { TableDialog } from "./TableDialog";
import { VisualBlockCard } from "./VisualBlockCard";
import { MediaRenderer } from "./MediaRenderer";
import {
  type ContentBlock,
  insertBlockAfter,
  mergeAdjacentTextBlocks,
  newBlockId,
  parseContentBlocks,
  promoteStructuredInBlocks,
  reparseStructuredBlocks,
  serializeContentBlocks,
} from "./contentBlocks";
import type { MediaInsertKind } from "./types";
import { useToastStore } from "@/store/toastStore";

interface VisualBlockEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
  showTextFormats?: boolean;
  minimalToolbar?: boolean;
  inputId?: string;
  autoFocus?: boolean;
}

export function VisualBlockEditor({
  value,
  onChange,
  placeholder = "Click to type…",
  compact = false,
  showTextFormats = true,
  minimalToolbar = false,
  inputId,
  autoFocus,
}: VisualBlockEditorProps) {
  const toast = useToastStore((s) => s.add);
  const textRef = useRef<HTMLDivElement>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaKind, setMediaKind] = useState<MediaInsertKind>("image");
  const [replacingBlockId, setReplacingBlockId] = useState<string | null>(null);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<ContentBlock | null>(null);
  const [editingCode, setEditingCode] = useState<ContentBlock | null>(null);
  const [editingTable, setEditingTable] = useState<ContentBlock | null>(null);
  const [focused, setFocused] = useState(false);

  const blocks = useMemo(() => promoteStructuredInBlocks(parseContentBlocks(value)), [value]);
  const mediaBlocks = blocks.filter((b) => b.type !== "text");
  const textBlock = blocks.find((b) => b.type === "text") ?? { id: newBlockId(), type: "text" as const, content: "" };
  const textPreview = textBlock.content.trim();
  const isPlainTextPreview =
    Boolean(textPreview) &&
    !textPreview.startsWith("|") &&
    !textPreview.startsWith("```") &&
    !textPreview.includes("$$");

  const commitBlocks = useCallback(
    (next: ContentBlock[]) => {
      onChange(serializeContentBlocks(mergeAdjacentTextBlocks(next)));
    },
    [onChange]
  );

  const updateText = useCallback(
    (content: string) => {
      const nonText = blocks.filter((b) => b.type !== "text");
      const next: ContentBlock[] = content.trim()
        ? [{ ...textBlock, type: "text", content }, ...nonText]
        : [...nonText];
      if (!next.some((b) => b.type === "text")) {
        next.unshift({ id: textBlock.id, type: "text", content });
      }
      commitBlocks(next);
    },
    [blocks, commitBlocks, textBlock]
  );

  const commitFromEditorText = useCallback(
    (content: string) => {
      const nonText = blocks.filter((b) => b.type !== "text");
      const draft: ContentBlock[] = content.trim()
        ? [{ ...textBlock, type: "text", content }, ...nonText]
        : [...nonText];
      if (!draft.some((b) => b.type === "text")) {
        draft.unshift({ id: textBlock.id, type: "text", content });
      }
      commitBlocks(reparseStructuredBlocks(draft));
    },
    [blocks, commitBlocks, textBlock]
  );

  const insertMediaBlock = useCallback(
    (markdown: string, replaceId?: string | null) => {
      const parsed = parseContentBlocks(markdown).filter((b) => b.type !== "text");
      if (!parsed.length) return;
      if (replaceId) {
        // Replace the specific block in-place
        const idx = blocks.findIndex((b) => b.id === replaceId);
        if (idx >= 0) {
          const next = [...blocks];
          next.splice(idx, 1, ...parsed);
          commitBlocks(next);
          setReplacingBlockId(null);
          return;
        }
      }
      // Append at end
      const next = [...blocks];
      for (const b of parsed) next.push(b);
      commitBlocks(next);
      setReplacingBlockId(null);
    },
    [blocks, commitBlocks]
  );

  const insertCode = useCallback(
    (content: string, language: string) => {
      if (editingCode?.type === "code") {
        commitBlocks(
          blocks.map((b) =>
            b.id === editingCode.id ? { ...b, type: "code", content, language } : b
          )
        );
        setEditingCode(null);
        setCodeOpen(false);
        toast({ title: "Code block updated", variant: "success" });
        return;
      }
      commitBlocks([
        ...blocks,
        { id: newBlockId(), type: "code", content, language },
      ]);
      setCodeOpen(false);
      toast({ title: "Code block added", variant: "success" });
    },
    [blocks, commitBlocks, editingCode]
  );

  const insertTable = useCallback(
    (data: { headers: string[]; rows: string[][] }) => {
      if (editingTable?.type === "table") {
        commitBlocks(
          blocks.map((b) =>
            b.id === editingTable.id
              ? { ...b, type: "table", headers: data.headers, rows: data.rows }
              : b
          )
        );
        setEditingTable(null);
        setTableOpen(false);
        toast({ title: "Table updated", variant: "success" });
        return;
      }
      commitBlocks([
        ...blocks,
        { id: newBlockId(), type: "table", headers: data.headers, rows: data.rows },
      ]);
      setTableOpen(false);
      toast({ title: "Table added", variant: "success" });
    },
    [blocks, commitBlocks, editingTable]
  );

  const insertFormula = useCallback(
    (latex: string, display: "inline" | "block") => {
      if (editingFormula?.type === "formula") {
        commitBlocks(
          blocks.map((b) =>
            b.id === editingFormula.id ? { ...b, type: "formula", latex, display } : b
          )
        );
        setEditingFormula(null);
        return;
      }
      const block: ContentBlock = { id: newBlockId(), type: "formula", latex, display };
      commitBlocks(insertBlockAfter(blocks, textBlock.id, block));
    },
    [blocks, commitBlocks, editingFormula, textBlock.id]
  );

  const removeBlock = (id: string) => {
    const block = blocks.find((b) => b.id === id);
    if (!block || block.type === "text") return;
    const label =
      block.type === "code" ? "code block" : block.type === "table" ? "table" : "content block";
    if (!window.confirm(`Delete this ${label}?`)) return;
    commitBlocks(blocks.filter((b) => b.id !== id));
  };

  const duplicateBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const block = blocks[idx];
    if (idx < 0 || !block || block.type === "text") return;
    const copy = { ...block, id: newBlockId() } as ContentBlock;
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    commitBlocks(next);
    toast({ title: "Block duplicated", variant: "success" });
  };

  const applyFormat = (action: FormatAction) => {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    if (action.block) {
      document.execCommand("insertText", false, action.prefix);
    } else {
      document.execCommand(
        action.title === "Bold"
          ? "bold"
          : action.title === "Italic"
            ? "italic"
            : action.title === "Underline"
              ? "underline"
              : "insertText",
        false,
        action.title === "Bold" || action.title === "Italic" || action.title === "Underline"
          ? undefined
          : action.prefix
      );
      updateText(el.innerText);
    }
  };

  const handleMediaAction = (action: MediaToolbarAction) => {
    switch (action.kind) {
      case "math":
        setEditingFormula(null);
        setFormulaOpen(true);
        return;
      case "code":
        setEditingCode(null);
        setCodeOpen(true);
        return;
      case "table":
        setEditingTable(null);
        setTableOpen(true);
        return;
      case "link":
        setMediaKind("attachment");
        setMediaOpen(true);
        return;
      default:
        setMediaKind(action.kind);
        setMediaOpen(true);
    }
  };

  useEffect(() => {
    if (!textRef.current) return;
    if (document.activeElement !== textRef.current && textBlock.content !== textRef.current.innerText) {
      textRef.current.innerText = textBlock.content;
    }
  }, [textBlock.content]);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);

  const normalizedRef = useRef(false);
  useEffect(() => {
    if (normalizedRef.current || !value.trim()) return;
    const next = serializeContentBlocks(promoteStructuredInBlocks(parseContentBlocks(value)));
    if (next.trim() !== value.trim()) {
      normalizedRef.current = true;
      onChange(next);
    }
  }, [value, onChange]);

  return (
    <div
      className={cn(
        "visual-block-editor rounded-2xl border border-border/50 bg-card shadow-sm transition-shadow",
        focused && "border-primary/40 ring-2 ring-primary/10 shadow-md",
        compact && "rounded-xl"
      )}
    >
      <MediaToolbar
        onFormat={applyFormat}
        onMedia={handleMediaAction}
        showTextFormats={showTextFormats && !compact && !minimalToolbar}
        minimalMediaOnly={minimalToolbar}
        className="rounded-none border-0 border-b border-border/40 bg-muted/20"
      />

      <div className={cn("space-y-3", compact ? "p-2.5" : "p-4")}>
        {/* Live WYSIWYG canvas */}
        <div
          className={cn(
            "relative min-h-[2.5rem] rounded-xl bg-background/50 transition-colors",
            !compact && "min-h-[4rem] p-1",
            focused && "bg-background"
          )}
        >
          {isPlainTextPreview && !focused && !compact && (
            <div
              className="pointer-events-none absolute inset-0 z-0 overflow-x-auto overflow-y-visible rounded-xl px-3 py-2 opacity-100"
              aria-hidden
            >
              <MediaRenderer content={textPreview} className={cn(compact && "text-sm")} />
            </div>
          )}

          <div
            ref={textRef}
            id={inputId}
            role="textbox"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            data-placeholder={placeholder}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              setFocused(false);
              commitFromEditorText(e.currentTarget.innerText);
            }}
            onInput={(e) => updateText(e.currentTarget.innerText)}
            onPaste={async (e) => {
              const handled = await handleEditorMediaPaste(
                e as unknown as React.ClipboardEvent<HTMLTextAreaElement>,
                insertMediaBlock,
                (msg) => toast({ title: "Paste failed", description: msg, variant: "destructive" })
              );
              if (handled) {
                e.preventDefault();
                toast({ title: "Media added", variant: "success" });
              }
            }}
            onDrop={async (e) => {
              const handled = await handleEditorMediaDrop(
                e as unknown as React.DragEvent<HTMLTextAreaElement>,
                insertMediaBlock,
                (msg) => toast({ title: "Upload failed", description: msg, variant: "destructive" })
              );
              if (handled) toast({ title: "Media added", variant: "success" });
            }}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "relative z-10 min-h-[2.5rem] w-full whitespace-pre-wrap px-3 py-2 outline-none",
              compact ? "text-sm" : "text-base leading-relaxed",
              !focused && isPlainTextPreview && !compact && "text-transparent caret-primary",
              "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
            )}
          />
        </div>

        {/* Visual media blocks — never shown as markdown */}
        {mediaBlocks.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {mediaBlocks.map((block) => (
              <VisualBlockCard
                key={block.id}
                block={block}
                compact={compact}
                onEdit={
                  block.type === "formula"
                    ? () => {
                        setEditingFormula(block);
                        setFormulaOpen(true);
                      }
                    : block.type === "code"
                      ? () => {
                          setEditingCode(block);
                          setCodeOpen(true);
                        }
                      : block.type === "table"
                        ? () => {
                            setEditingTable(block);
                            setTableOpen(true);
                          }
                        : undefined
                }
                onReplace={
                  block.type === "image" || block.type === "video" || block.type === "audio"
                    ? () => {
                        setMediaKind(block.type === "image" ? "image" : block.type === "video" ? "video" : "audio");
                        setReplacingBlockId(block.id);
                        setMediaOpen(true);
                      }
                    : undefined
                }
                onRemove={() => removeBlock(block.id)}
                onDuplicate={() => duplicateBlock(block.id)}
              />
            ))}
          </div>
        )}
      </div>

      <MediaUploader
        open={mediaOpen}
        onOpenChange={(open) => {
          setMediaOpen(open);
          if (!open) setReplacingBlockId(null);
        }}
        defaultKind={mediaKind}
        onInsert={(md) => insertMediaBlock(md, replacingBlockId)}
      />
      <FormulaDialog
        open={formulaOpen}
        onOpenChange={(open) => {
          setFormulaOpen(open);
          if (!open) setEditingFormula(null);
        }}
        initialLatex={editingFormula?.type === "formula" ? editingFormula.latex : ""}
        initialDisplay={editingFormula?.type === "formula" ? editingFormula.display : "inline"}
        allowEmpty={editingFormula?.type === "formula"}
        onInsert={insertFormula}
      />
      <CodeDialog
        open={codeOpen}
        onOpenChange={(open) => {
          setCodeOpen(open);
          if (!open) setEditingCode(null);
        }}
        initialContent={editingCode?.type === "code" ? editingCode.content : ""}
        initialLanguage={editingCode?.type === "code" ? editingCode.language || "java" : "java"}
        allowEmpty={editingCode?.type === "code"}
        onInsert={insertCode}
      />
      <TableDialog
        open={tableOpen}
        onOpenChange={(open) => {
          setTableOpen(open);
          if (!open) setEditingTable(null);
        }}
        initialData={
          editingTable?.type === "table"
            ? { headers: editingTable.headers, rows: editingTable.rows }
            : undefined
        }
        onInsert={insertTable}
      />
    </div>
  );
}
