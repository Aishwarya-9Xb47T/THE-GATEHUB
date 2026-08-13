import type { NotebookStore } from "./notebookStore";
import type { useNotebookEngine } from "./useNotebookEngine";
import { NotebookSidebar } from "./components/NotebookSidebar";
import { CodeCellView } from "./components/CodeCellView";
import { MarkdownCellView } from "./components/MarkdownCellView";

export interface NotebookEngineViewProps {
  doc: ReturnType<typeof useNotebookEngine>["doc"];
  activeCellId: string | null;
  store: NotebookStore;
  updateSourceLive: (cellId: string, source: string) => void;
  commitSource: (cellId: string, source: string) => void;
  onSave?: () => void;
  actions: ReturnType<typeof useNotebookEngine>["actions"];
}

export function NotebookEngineView({
  doc,
  activeCellId,
  store,
  updateSourceLive,
  commitSource,
  onSave,
  actions,
}: NotebookEngineViewProps) {
  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-56 shrink-0 border-r border-[#30363d] bg-[#161b22] overflow-hidden flex flex-col">
        <NotebookSidebar
          cells={doc.cells}
          activeCellId={activeCellId}
          onSelect={actions.setActiveCell}
          onAdd={(type) => actions.insertCell(activeCellId, type)}
          onDelete={actions.deleteCell}
          onDuplicate={actions.duplicateCell}
          onReorder={actions.reorderCell}
          onMoveUp={(id) => actions.moveCell(id, -1)}
          onMoveDown={(id) => actions.moveCell(id, 1)}
          onCopy={actions.copyCell}
          onPaste={actions.pasteCell}
        />
      </aside>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {doc.cells.map((cell, index) => {
          const common = {
            cell,
            index,
            isActive: cell.cellId === activeCellId,
            canDelete: doc.cells.length > 1,
            canMoveUp: index > 0,
            canMoveDown: index < doc.cells.length - 1,
            onActivate: () => actions.setActiveCell(cell.cellId),
            onSourceChange: (s: string) => updateSourceLive(cell.cellId, s),
            onSourceCommit: (s: string) => commitSource(cell.cellId, s),
            onSave,
            onDelete: () => actions.deleteCell(cell.cellId),
            onDuplicate: () => actions.duplicateCell(cell.cellId),
            onCopy: () => actions.copyCell(cell.cellId),
            onPaste: () => actions.pasteCell(cell.cellId),
            onMoveUp: () => actions.moveCell(cell.cellId, -1),
            onMoveDown: () => actions.moveCell(cell.cellId, 1),
            onConvert: () => actions.convertCell(cell.cellId),
          };

          if (cell.cellType === "code") {
            return (
              <CodeCellView
                key={cell.cellId}
                {...common}
                onRun={() => void actions.runCell(cell.cellId)}
                onRunAbove={() => void actions.runAbove(cell.cellId)}
                onRunBelow={() => void actions.runBelow(cell.cellId)}
                onClearOutput={() => store.getState().clearOutput(cell.cellId)}
                onToggleCollapse={() => store.getState().toggleCollapsed(cell.cellId)}
                onSplit={(offset) => actions.splitCell(cell.cellId, offset)}
                onMergeNext={() => actions.mergeWithNext(cell.cellId)}
                hasNext={index < doc.cells.length - 1}
              />
            );
          }
          return (
            <MarkdownCellView
              key={cell.cellId}
              {...common}
              onTogglePreview={() => store.getState().toggleMarkdownPreview(cell.cellId)}
              onToggleCollapse={() => store.getState().toggleCollapsed(cell.cellId)}
            />
          );
        })}
      </div>
    </div>
  );
}
