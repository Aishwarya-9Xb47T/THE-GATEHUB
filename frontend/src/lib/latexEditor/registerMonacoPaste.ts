import type { editor } from "monaco-editor";
import { clipboardHtmlToPlainText, normalizePastedLatexText } from "./pasteNormalization";

function insertPlainText(ed: editor.IStandaloneCodeEditor, raw: string): void {
  const normalized = normalizePastedLatexText(raw);
  if (!normalized) return;
  const selection = ed.getSelection();
  if (!selection) return;
  ed.executeEdits("external-paste", [
    {
      range: selection,
      text: normalized,
      forceMoveMarkers: true,
    },
  ]);
}

function readSyncClipboardText(e: ClipboardEvent): string {
  const clipboard = e.clipboardData;
  if (!clipboard) return "";

  let text = clipboard.getData("text/plain");
  if (text.trim()) return text;

  const html = clipboard.getData("text/html");
  if (html) return clipboardHtmlToPlainText(html);

  return "";
}

/**
 * Ensures pastes from external websites insert plain, LaTeX-safe text into Monaco.
 * Also reads the async clipboard API when the browser omits clipboardData (context-menu paste).
 */
export function registerMonacoPlainTextPaste(ed: editor.IStandaloneCodeEditor): () => void {
  const domNode = ed.getDomNode();
  if (!domNode) return () => {};

  const onPaste = (e: ClipboardEvent) => {
    const syncText = readSyncClipboardText(e);
    if (syncText) {
      e.preventDefault();
      insertPlainText(ed, syncText);
      return;
    }

    // Some browsers omit clipboardData on context-menu paste — read async instead
    e.preventDefault();
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (text) insertPlainText(ed, text);
      })
      .catch(() => {
        /* user denied clipboard permission — ignore */
      });
  };

  domNode.addEventListener("paste", onPaste as EventListener, true);
  const textArea = domNode.querySelector("textarea.inputarea");
  textArea?.addEventListener("paste", onPaste as EventListener, true);

  return () => {
    domNode.removeEventListener("paste", onPaste as EventListener, true);
    textArea?.removeEventListener("paste", onPaste as EventListener, true);
  };
}
