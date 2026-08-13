import { useRef } from "react";
import { ChevronDown, ChevronUp, Copy, Play, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagedMonacoEditor, type ManagedMonacoEditorHandle } from "../../engine/ManagedMonacoEditor";
import { notebookModelKey } from "../../engine/monacoModelRegistry";
import type { NotebookCell } from "../types";
import { CellOutputView } from "./CellOutputView";

interface CodeCellViewProps {
  cell: NotebookCell;
  index: number;
  isActive: boolean;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  hasNext: boolean;
  onActivate: () => void;
  onSourceChange: (source: string) => void;
  onSourceCommit: (source: string) => void;
  onSave?: () => void;
  onRun: () => void;
  onRunAbove: () => void;
  onRunBelow: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onConvert: () => void;
  onClearOutput: () => void;
  onSplit: (offset: number) => void;
  onMergeNext: () => void;
}

export function CodeCellView({
  cell,
  index,
  isActive,
  canDelete,
  canMoveUp,
  canMoveDown,
  hasNext,
  onActivate,
  onSourceChange,
  onSourceCommit,
  onSave,
  onRun,
  onRunAbove,
  onRunBelow,
  onDelete,
  onDuplicate,
  onCopy,
  onPaste,
  onMoveUp,
  onMoveDown,
  onToggleCollapse,
  onConvert,
  onClearOutput,
  onSplit,
  onMergeNext,
}: CodeCellViewProps) {
  const editorRef = useRef<ManagedMonacoEditorHandle>(null);

  if (cell.collapsed) {
    return (
      <div
        className={`rounded-lg border overflow-hidden ${isActive ? "border-[#388bfd]" : "border-[#30363d]"}`}
        onClick={onActivate}
        data-cell-id={cell.cellId}
      >
        <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] text-xs text-[#8b949e] cursor-pointer">
          <span>Code · Cell {index + 1} (collapsed)</span>
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
        <span>
          Code · Cell {index + 1}
          {cell.executionCount != null && <span className="ml-2 text-[#8b949e]">[{cell.executionCount}]</span>}
        </span>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onRun} title="Run cell">
            <Play className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[10px]" onClick={onRunAbove} title="Run above">
            ↑
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[10px]" onClick={onRunBelow} title="Run below">
            ↓
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onClearOutput} title="Clear output">
            <span className="text-[10px] font-bold">⌫</span>
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
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Split at cursor"
            onClick={() => {
              const ed = editorRef.current?.getEditor();
              const model = ed?.getModel();
              const pos = ed?.getPosition();
              if (!model || !pos) {
                onSplit(cell.source.length);
                return;
              }
              onSplit(model.getOffsetAt(pos));
            }}
          >
            <Scissors className="w-3.5 h-3.5" />
          </Button>
          {hasNext && (
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[10px]" onClick={onMergeNext} title="Merge with next">
              ⊕
            </Button>
          )}
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={!canMoveUp} onClick={onMoveUp}>
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={!canMoveDown} onClick={onMoveDown}>
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onToggleCollapse} title="Collapse">
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[10px]" onClick={onConvert} title="Convert to Markdown">
            M
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-400" disabled={!canDelete} onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div onClick={onActivate}>
        <div onMouseDown={(e) => e.stopPropagation()}>
          <ManagedMonacoEditor
            ref={editorRef}
            instanceKey={notebookModelKey(cell.cellId)}
            language={cell.language}
            source={cell.source}
            onSourceChange={onSourceChange}
            onSourceCommit={onSourceCommit}
            onSave={onSave}
            height="180px"
          />
        </div>
      </div>
      <CellOutputView outputs={cell.outputs} executionState={cell.executionState} executionCount={cell.executionCount} />
    </div>
  );
}
