import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  focusEditor,
  getOrCreateModel,
  initMonacoRegistry,
  registerEditor,
  swapEditorModel,
} from "./monacoModelRegistry";
import { registerMonacoPlainTextPaste } from "@/lib/latexEditor/registerMonacoPaste";
import { isTextEditorFocused, isTextEditorEventTarget } from "@/lib/latexEditor/editorFocus";

export interface ManagedMonacoEditorProps {
  instanceKey: string;
  language: string;
  source: string;
  onSourceChange: (source: string) => void;
  onSourceCommit?: (source: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  height?: string | number;
  minimap?: boolean;
  wordWrap?: boolean;
  className?: string;
  /** When true, one editor swaps models on instanceKey change (research tabs). */
  swapModelOnKeyChange?: boolean;
}

export interface ManagedMonacoEditorHandle {
  focus: () => void;
  getEditor: () => editor.IStandaloneCodeEditor | null;
}

export const ManagedMonacoEditor = forwardRef<ManagedMonacoEditorHandle, ManagedMonacoEditorProps>(
  function ManagedMonacoEditor(
    {
      instanceKey,
      language,
      source,
      onSourceChange,
      onSourceCommit,
      onSave,
      readOnly = false,
      height = "180px",
      minimap = false,
      wordWrap = false,
      className,
      swapModelOnKeyChange = false,
    },
    ref
  ) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
    const pasteCleanupRef = useRef<(() => void) | null>(null);
    const suppressChangeRef = useRef(false);
    const commitTimerRef = useRef<number | null>(null);
    const prevKeyRef = useRef<string | null>(null);
    const unregisterRef = useRef<(() => void) | null>(null);
    const onSourceChangeRef = useRef(onSourceChange);
    const onSourceCommitRef = useRef(onSourceCommit);
    const onSaveRef = useRef(onSave);

    onSourceChangeRef.current = onSourceChange;
    onSourceCommitRef.current = onSourceCommit;
    onSaveRef.current = onSave;

    useImperativeHandle(ref, () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      getEditor: () => editorRef.current,
    }));

    const scheduleCommit = useCallback((value: string) => {
      if (!onSourceCommitRef.current) return;
      if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = window.setTimeout(() => {
        onSourceCommitRef.current?.(value);
        commitTimerRef.current = null;
      }, 800);
    }, []);

    const attachModel = useCallback(
      (ed: editor.IStandaloneCodeEditor) => {
        const model = getOrCreateModel(instanceKey, language, source);
        if (ed.getModel() !== model) {
          suppressChangeRef.current = true;
          ed.setModel(model);
          suppressChangeRef.current = false;
        }
        prevKeyRef.current = instanceKey;
      },
      [instanceKey, language, source]
    );

    const handleMount: OnMount = useCallback(
      (ed, monaco) => {
        editorRef.current = ed;
        monacoRef.current = monaco;
        initMonacoRegistry(monaco);

        if (swapModelOnKeyChange) {
          swapEditorModel(ed, null, instanceKey, language, source);
        } else {
          attachModel(ed);
        }

        unregisterRef.current?.();
        unregisterRef.current = registerEditor(instanceKey, ed);

        pasteCleanupRef.current?.();
        pasteCleanupRef.current = registerMonacoPlainTextPaste(ed);

        ed.onDidChangeModelContent(() => {
          if (suppressChangeRef.current) return;
          const value = ed.getValue();
          onSourceChangeRef.current(value);
          scheduleCommit(value);
        });

        ed.onDidBlurEditorText(() => {
          onSourceCommitRef.current?.(ed.getValue());
        });

        ed.addAction({
          id: `gatehub-save-${instanceKey}`,
          label: "Save",
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
          run: () => {
            onSaveRef.current?.();
          },
        });

        ed.onMouseDown(() => {
          ed.focus();
        });
      },
      [instanceKey, language, source, swapModelOnKeyChange, attachModel, scheduleCommit]
    );

    useEffect(() => {
      const ed = editorRef.current;
      if (!ed || !swapModelOnKeyChange) return;
      if (prevKeyRef.current === instanceKey) return;

      suppressChangeRef.current = true;
      swapEditorModel(ed, prevKeyRef.current, instanceKey, language, getOrCreateModel(instanceKey, language, source).getValue());
      suppressChangeRef.current = false;

      unregisterRef.current?.();
      unregisterRef.current = registerEditor(instanceKey, ed);
      prevKeyRef.current = instanceKey;
    }, [instanceKey, language, swapModelOnKeyChange]);

    // Keep model in sync when parent source arrives asynchronously (quiz load / extraction import).
    useEffect(() => {
      const ed = editorRef.current;
      if (!ed) return;
      const model = ed.getModel();
      if (!model || model.isDisposed()) return;
      if (model.getValue() === source) return;
      // Do not clobber in-progress edits with an empty prop flash
      if (!source && model.getValue().trim().length > 0) return;
      suppressChangeRef.current = true;
      model.setValue(source ?? "");
      suppressChangeRef.current = false;
    }, [source, instanceKey]);

    useEffect(() => {
      return () => {
        if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
        pasteCleanupRef.current?.();
        unregisterRef.current?.();
      };
    }, []);

    return (
      <Editor
        key={swapModelOnKeyChange ? "swappable-editor" : instanceKey}
        className={className}
        height={height}
        language={language}
        theme="vs-dark"
        onMount={handleMount}
        options={{
          readOnly,
          minimap: { enabled: minimap },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: wordWrap ? "on" : "off",
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          folding: true,
          renderWhitespace: "selection",
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          find: { addExtraSpaceOnTop: false },
        }}
      />
    );
  }
);

export function focusMonacoInstance(instanceKey: string): boolean {
  return focusEditor(instanceKey);
}
