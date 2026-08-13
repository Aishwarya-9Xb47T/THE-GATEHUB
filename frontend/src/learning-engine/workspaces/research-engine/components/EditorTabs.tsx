import { X } from "lucide-react";
import type { OpenTab, ProjectFile } from "../types";

interface EditorTabsProps {
  tabs: OpenTab[];
  files: ProjectFile[];
  activeFileId: string | null;
  dirtyFileIds: Set<string>;
  onSelect: (fileId: string) => void;
  onClose: (fileId: string) => void;
}

export function EditorTabs({ tabs, files, activeFileId, dirtyFileIds, onSelect, onClose }: EditorTabsProps) {
  return (
    <div className="flex items-center gap-0 border-b border-[#30363d] bg-[#161b22] overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const file = files.find((f) => f.fileId === tab.fileId);
        if (!file) return null;
        const isActive = tab.fileId === activeFileId;
        return (
          <div
            key={tab.fileId}
            className={`group flex items-center gap-1 px-3 py-1.5 text-xs border-r border-[#30363d] cursor-pointer shrink-0 ${
              isActive ? "bg-[#0d1117] text-[#e6edf3]" : "text-[#8b949e] hover:bg-[#21262d]"
            }`}
            onClick={() => onSelect(tab.fileId)}
          >
            <span>
              {file.name}
              {dirtyFileIds.has(tab.fileId) && <span className="text-[#f0883e] ml-0.5">●</span>}
            </span>
            {!tab.pinned && (
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#30363d]"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.fileId);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
