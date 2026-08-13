import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagedMonacoEditor } from "../../engine/ManagedMonacoEditor";
import { notebookModelKey } from "../../engine/monacoModelRegistry";
import type { NotebookCell } from "../types";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { enhanceMarkdownPreview, renderMarkdownPreview } from "../runEngine";

interface MarkdownCellViewProps {
  cell: NotebookCell;
  index: number;
  isActive: boolean;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onActivate: () => void;
  onSourceChange: (source: string) => void;
  onSourceCommit: (source: string) => void;
  onSave?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onTogglePreview: () => void;
  onConvert: () => void;
}

export function MarkdownCellView({
  cell,
  index,
  isActive,
  canDelete,
  canMoveUp,
  canMoveDown,
  onActivate,
  onSourceChange,
  onSourceCommit,
  onSave,
  onDelete,
  onDuplicate,
  onCopy,
  onPaste,
  onMoveUp,
  onMoveDown,
  onToggleCollapse,
  onTogglePreview,
  onConvert,
}: MarkdownCellViewProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewRef.current) return;
    void enhanceMarkdownPreview(previewRef.current);
  }, [cell.source, cell.markdownPreview]);

  if (cell.collapsed) {
    return (
      <div
        className={`rounded-lg border overflow-hidden ${isActive ? "border-[#388bfd]" : "border-[#30363d]"}`}
        onClick={onActivate}
        data-cell-id={cell.cellId}
      >
        <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] text-xs text-[#8b949e] cursor-pointer">
          <span>Markdown · Cell {index + 1} (collapsed)</span>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}>
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border overflow-hidden ${isActive ? "border-[#388bfd]" : "border-[#30363d]"}`}
      data-cell-id={cell.cellId}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] text-xs text-[#8b949e] cursor-pointer"
        onClick={onActivate}
      >
        <span>Markdown · Cell {index + 1}</span>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onTogglePreview} title="Toggle preview">
            {cell.markdownPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onCopy} title="Copy cell">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onPaste} title="Paste cell below">
            <span className="text-[10px] font-bold">⎘</span>
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onDuplicate} title="Duplicate">
            <Copy className="w-3.5 h-3.5 opacity-60" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={!canMoveUp} onClick={onMoveUp}>
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={!canMoveDown} onClick={onMoveDown}>
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onToggleCollapse}>
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[10px]" onClick={onConvert} title="Convert to Code">
            C
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-400" disabled={!canDelete} onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {cell.markdownPreview ? (
        <div
          ref={previewRef}
          className="p-4 prose prose-invert prose-sm max-w-none min-h-[80px] bg-[#0d1117] cursor-pointer text-[#e6edf3] prose-headings:text-[#e6edf3] prose-p:text-[#e6edf3] prose-strong:text-[#f0f6fc] prose-li:text-[#e6edf3] prose-code:text-[#e6edf3] prose-a:text-[#58a6ff]"
          onClick={onActivate}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdownPreview(cell)) }}
        />
      ) : (
        <>
          <div onClick={onActivate}>
            <div onMouseDown={(e) => e.stopPropagation()}>
              <ManagedMonacoEditor
                instanceKey={notebookModelKey(cell.cellId)}
                language="markdown"
                source={cell.source}
                onSourceChange={onSourceChange}
                onSourceCommit={onSourceCommit}
                onSave={onSave}
                height="120px"
              />
            </div>
          </div>
          <div
            ref={previewRef}
            className="border-t border-[#30363d] p-4 prose prose-invert prose-sm max-w-none bg-[#0d1117]/50 text-[#e6edf3] prose-headings:text-[#e6edf3] prose-p:text-[#e6edf3] prose-strong:text-[#f0f6fc] prose-li:text-[#e6edf3] prose-code:text-[#e6edf3] prose-a:text-[#58a6ff]"
          >
            <p className="text-[10px] uppercase tracking-wider text-[#8b949e] mb-2 !mt-0">Live preview</p>
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdownPreview(cell)) }} />
          </div>
        </>
      )}
    </div>
  );
}
