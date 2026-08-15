import { useEffect, useState } from "react";
import { ManagedMonacoEditor } from "../engine/ManagedMonacoEditor";
import { researchModelKey } from "../engine/monacoModelRegistry";
import { loadAuthenticatedPdfBlob, redactMediaUrl } from "@/lib/courseMediaUrls";
import type { useResearchEngine } from "./useResearchEngine";
import { FileTree } from "./components/FileTree";
import { EditorTabs } from "./components/EditorTabs";

export interface ResearchEngineViewProps {
  doc: ReturnType<typeof useResearchEngine>["doc"];
  activeFile: ReturnType<typeof useResearchEngine>["activeFile"];
  dirtyFileIds: Set<string>;
  searchQuery: string;
  replaceQuery: string;
  showSearch: boolean;
  pdfEpoch: number;
  setShowSearch: (v: boolean) => void;
  actions: ReturnType<typeof useResearchEngine>["actions"];
  onSave?: () => void;
}

export function ResearchEngineView({
  doc,
  activeFile,
  dirtyFileIds,
  searchQuery,
  replaceQuery,
  showSearch,
  pdfEpoch,
  setShowSearch,
  actions,
  onSave,
}: ResearchEngineViewProps) {
  const pdfUrl = doc.lastCompile?.pdfUrl ?? null;
  const logs = doc.lastCompile?.logs;
  const errors = doc.lastCompile?.errors;
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!pdfUrl) {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewError(null);
    console.log("[RESEARCH_PDF_URL] compile=", redactMediaUrl(pdfUrl));

    void loadAuthenticatedPdfBlob(`${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}t=${pdfEpoch}`)
      .then((blobUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        objectUrl = blobUrl;
        setPreviewBlobUrl(blobUrl);
        setPreviewLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPreviewError(err.message || "PDF load error");
        setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfUrl, pdfEpoch]);

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-56 shrink-0 border-r border-[#30363d] bg-[#161b22] overflow-hidden">
        <FileTree
          doc={doc}
          activeFileId={doc.activeFileId}
          dirtyFileIds={dirtyFileIds}
          onSelect={actions.openFile}
          onCreate={actions.createFile}
          onDelete={actions.deleteFile}
          onRename={actions.renameFile}
          onDuplicate={actions.duplicateFile}
          onReorder={actions.reorderFiles}
        />
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <EditorTabs
          tabs={doc.openTabs}
          files={doc.files}
          activeFileId={doc.activeFileId}
          dirtyFileIds={dirtyFileIds}
          onSelect={actions.openFile}
          onClose={actions.closeTab}
        />
        {showSearch && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#30363d] bg-[#161b22] text-xs">
            <input
              className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 flex-1"
              placeholder="Find"
              value={searchQuery}
              onChange={(e) => actions.setSearchQuery(e.target.value)}
            />
            <input
              className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 flex-1"
              placeholder="Replace"
              value={replaceQuery}
              onChange={(e) => actions.setReplaceQuery(e.target.value)}
            />
            <button type="button" className="text-[#58a6ff] hover:underline" onClick={() => actions.replaceInFile()}>
              Replace all
            </button>
            <button type="button" className="text-[#8b949e]" onClick={() => setShowSearch(false)}>
              Close
            </button>
          </div>
        )}
        {activeFile ? (
          <div className="flex-1 min-h-0">
            <ManagedMonacoEditor
              instanceKey={researchModelKey(activeFile.fileId)}
              language={activeFile.kind === "bib" ? "plaintext" : "latex"}
              source={activeFile.content}
              onSourceChange={(c) => actions.updateContentLive(activeFile.fileId, c)}
              onSourceCommit={(c) => actions.commitContent(activeFile.fileId, c)}
              onSave={onSave}
              height="100%"
              minimap
              wordWrap
              swapModelOnKeyChange
            />
          </div>
        ) : null}
      </div>
      <aside className="w-[min(420px,40%)] shrink-0 border-l border-[#30363d] bg-[#161b22] flex flex-col">
        <div className="px-3 py-2 border-b border-[#30363d] text-xs font-semibold uppercase tracking-wider text-[#8b949e]">
          PDF Preview
        </div>
        <div className="flex-1 min-h-0 bg-[#0d1117]">
          {previewLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-[#8b949e] p-6 text-center">
              Loading PDF preview...
            </div>
          ) : previewError ? (
            <div className="h-full flex items-center justify-center text-xs text-red-400 p-6 text-center">
              PDF load error: {previewError}
            </div>
          ) : previewBlobUrl ? (
            <iframe title="PDF preview" src={previewBlobUrl} className="w-full h-full border-0 bg-white" />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[#8b949e] p-6 text-center">
              Click Compile to generate your research paper PDF
            </div>
          )}
        </div>
        {(logs || (errors && errors.length > 0)) && (
          <div className="max-h-40 overflow-auto border-t border-[#30363d] p-3 font-mono text-[11px] whitespace-pre-wrap text-[#8b949e]">
            {errors?.map((e, i) => (
              <p key={i} className="text-red-400 mb-1">
                {e.line ? `Line ${e.line}: ` : ""}
                {e.message}
              </p>
            ))}
            {logs}
          </div>
        )}
      </aside>
    </div>
  );
}
