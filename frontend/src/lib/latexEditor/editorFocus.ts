/** True when keyboard/paste should go to a text editor, not global LU explorer shortcuts. */
export function isTextEditorFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.closest(".monaco-editor")) return true;
  if (active.tagName === "INPUT" || active.tagName === "TEXTAREA") return true;
  if (active.isContentEditable) return true;
  return false;
}

export function isTextEditorEventTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest(".monaco-editor")) return true;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

/** True when the LU course explorer sidebar owns focus (structure copy/paste shortcuts). */
export function isLuExplorerFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return !!active?.closest("[data-lu-explorer]");
}
