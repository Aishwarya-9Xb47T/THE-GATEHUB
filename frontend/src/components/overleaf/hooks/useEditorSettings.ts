import { useCallback, useEffect, useState } from "react";
import type { EditorSettings } from "../types";
import { DEFAULT_EDITOR_SETTINGS } from "../types";

const STORAGE_KEY = "gatehub-editor-settings";

export function useEditorSettings() {
  const [settings, setSettings] = useState<EditorSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EditorSettings>;
        return {
          ...DEFAULT_EDITOR_SETTINGS,
          ...parsed,
          // Always keep autosave on — instructors should never lose work across files.
          autoSave: true,
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_EDITOR_SETTINGS;
  });

  const updateSettings = useCallback((patch: Partial<EditorSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch, autoSave: true };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return { settings, updateSettings };
}
