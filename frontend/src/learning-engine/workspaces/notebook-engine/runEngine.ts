import { api } from "@/lib/api";
import { marked } from "marked";
import type { NotebookCell, NotebookDocument } from "./types";
import type { NotebookStore } from "./notebookStore";

let activeAbort: AbortController | null = null;

export function interruptExecution(store: NotebookStore): void {
  activeAbort?.abort();
  activeAbort = null;
  store.getState().setRuntimeStatus("interrupted");
  const doc = store.getState().document();
  for (const cell of doc.cells) {
    if (cell.executionState === "running") {
      store.getState().setCellOutput(
        cell.cellId,
        { stderr: "Execution interrupted", status: "interrupted" },
        "interrupted"
      );
    }
  }
}

export function restartRuntime(store: NotebookStore): void {
  interruptExecution(store);
  store.getState().clearAllOutputs();
  store.getState().setRuntimeStatus("ready");
}

export async function executeCodeCell(
  store: NotebookStore,
  cellId: string,
  language: string
): Promise<void> {
  const doc = store.getState().document();
  const cell = doc.cells.find((c) => c.cellId === cellId);
  if (!cell || cell.cellType !== "code") return;

  const started = performance.now();
  const controller = new AbortController();
  activeAbort = controller;
  store.getState().setCellOutput(cellId, { stdout: "", stderr: "", status: "running" }, "running");
  store.getState().setRuntimeStatus("busy");

  try {
    const res = await api<{ success: boolean; output: string }>("/resources/execute", {
      method: "POST",
      body: { language, code: cell.source },
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    const elapsed = Math.round(performance.now() - started);
    const stdout = res.data?.output ?? "";
    const stderr = res.error ?? "";

    store.getState().setCellOutput(
      cellId,
      {
        stdout: res.data?.success ? stdout : "",
        stderr: res.data?.success ? "" : stderr || stdout || "Execution failed",
        executionTimeMs: elapsed,
        status: res.data?.success ? "success" : "error",
        result: stdout,
        renderedHtml: null,
      },
      res.data?.success ? "success" : "error",
      (cell.executionCount ?? 0) + 1
    );
  } catch (err: any) {
    if (controller.signal.aborted) return;
    store.getState().setCellOutput(
      cellId,
      {
        stderr: err instanceof Error ? err.message : "Execution failed",
        executionTimeMs: Math.round(performance.now() - started),
        status: "error",
      },
      "error"
    );
  } finally {
    if (activeAbort === controller) activeAbort = null;
    store.getState().setRuntimeStatus("ready");
  }
}

export async function runAllCodeCells(store: NotebookStore, doc: NotebookDocument): Promise<void> {
  for (const cell of doc.cells) {
    if (cell.cellType === "code") {
      await executeCodeCell(store, cell.cellId, doc.runtime.kernelLanguage);
      if (store.getState().document().runtime.status === "interrupted") break;
    }
  }
}

export async function runCellsAbove(store: NotebookStore, cellId: string, doc: NotebookDocument): Promise<void> {
  const idx = doc.cells.findIndex((c) => c.cellId === cellId);
  for (let i = 0; i < idx; i++) {
    const cell = doc.cells[i];
    if (cell.cellType === "code") await executeCodeCell(store, cell.cellId, doc.runtime.kernelLanguage);
  }
}

export async function runCellsBelow(store: NotebookStore, cellId: string, doc: NotebookDocument): Promise<void> {
  const idx = doc.cells.findIndex((c) => c.cellId === cellId);
  for (let i = idx; i < doc.cells.length; i++) {
    const cell = doc.cells[i];
    if (cell.cellType === "code") await executeCodeCell(store, cell.cellId, doc.runtime.kernelLanguage);
  }
}

marked.setOptions({ gfm: true, breaks: true });

const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  if (lang === "mermaid") {
    return `<pre class="mermaid">${text.replace(/</g, "&lt;")}</pre>`;
  }
  const escaped = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<pre><code class="language-${lang ?? ""}">${escaped}</code></pre>`;
};

export function renderMarkdownPreview(cell: NotebookCell): string {
  try {
    return marked.parse(cell.source, { async: false, renderer }) as string;
  } catch {
    return `<pre>${cell.source.replace(/</g, "&lt;")}</pre>`;
  }
}

export async function enhanceMarkdownPreview(root: HTMLElement): Promise<void> {
  const nodes = root.querySelectorAll("pre.mermaid");
  if (nodes.length === 0) return;
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: "dark" });
    for (const node of nodes) {
      const code = node.textContent ?? "";
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      try {
        const { svg } = await mermaid.render(id, code);
        node.outerHTML = svg;
      } catch {
        node.innerHTML = `<span class="text-red-400">Mermaid diagram error</span>`;
      }
    }
  } catch {
    // mermaid optional
  }
}
