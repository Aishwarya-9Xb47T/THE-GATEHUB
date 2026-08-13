import { useRef, useEffect, useState, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, getWsConnectTarget } from '@/lib/api';
import {
  getCachedModel,
  getOrCreateModel,
  markModelSaved,
} from '@/lib/luAuthoring/monacoModelCache';
import { registerMonacoPlainTextPaste } from '@/lib/latexEditor/registerMonacoPaste';

const FETCH_TIMEOUT_MS = 8000;
const LOG = '[Academic Studio]';

function getYjsWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const { protocol, host } = getWsConnectTarget();
  return `${protocol}://${host}/yjs/`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

interface LatexMonacoProps {
  projectId: string;
  fileId: string;
  filePath?: string;
  fallbackContent?: string;
  /** Reuse Monaco models across file switches (undo/cursor preserved). */
  persistModels?: boolean;
  onSave?: () => void;
  onContentChange?: () => void;
  onModelReady?: (fileId: string) => void;
  token?: string;
  username: string;
  color?: string;
  onEditorMount?: (editor: any) => void;
}

export function LatexMonaco({
  projectId,
  fileId,
  filePath = '',
  fallbackContent = '',
  persistModels = false,
  onSave,
  onContentChange,
  onModelReady,
  token,
  username,
  color = "#ff7f50",
  onEditorMount,
}: LatexMonacoProps) {
  const monaco = useMonaco();
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const editorRef = useRef<any>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const pasteCleanupRef = useRef<(() => void) | null>(null);
  const fetchGenerationRef = useRef(0);
  const isYjsReadyRef = useRef(false);
  const activeFileIdRef = useRef(fileId);

  const [loadPhase, setLoadPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialDbContent, setInitialDbContent] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const onModelReadyRef = useRef(onModelReady);
  onModelReadyRef.current = onModelReady;

  const retryLoad = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  // Cached-model mode: swap models without remounting the editor
  useEffect(() => {
    if (!persistModels || !monaco || !editorInstance) return;
    activeFileIdRef.current = fileId;

    const cached = getCachedModel(fileId);
    if (cached) {
      editorInstance.setModel(cached.model);
      setLoadPhase('ready');
      setLoadError(null);
      setInitialDbContent(cached.model.getValue());
      onModelReadyRef.current?.(fileId);
      return;
    }

    const generation = ++fetchGenerationRef.current;
    let cancelled = false;

    async function loadFile() {
      setLoadPhase('loading');
      setLoadError(null);

      try {
        const res = await withTimeout(
          api<{ success: boolean; file: { content: string } }>(
            `/latex-projects/${projectId}/files/content?fileId=${fileId}`
          ),
          FETCH_TIMEOUT_MS
        );

        if (cancelled || generation !== fetchGenerationRef.current) return;
        if (res.error) throw new Error(res.error);

        const content = res.data?.file?.content;
        const resolved =
          content && content.trim().length > 0
            ? content
            : fallbackContent || '% Empty document\n';

        const entry = getOrCreateModel(monaco!, fileId, filePath || fileId, resolved);
        editorInstance.setModel(entry.model);
        setInitialDbContent(resolved);
        setLoadPhase('ready');
        onModelReadyRef.current?.(fileId);
      } catch (err: any) {
        if (cancelled || generation !== fetchGenerationRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load document';
        const resolved = fallbackContent || '% Empty document\n';
        setLoadError(message);
        const entry = getOrCreateModel(monaco!, fileId, filePath || fileId, resolved);
        editorInstance.setModel(entry.model);
        setInitialDbContent(resolved);
        setLoadPhase('ready');
        onModelReadyRef.current?.(fileId);
      }
    }

    void loadFile();
    return () => { cancelled = true; };
  }, [persistModels, monaco, editorInstance, fileId, filePath, projectId, fallbackContent, retryCount]);

  // Standard mode: fetch on file change (remount editor)
  useEffect(() => {
    if (persistModels) return;

    const generation = ++fetchGenerationRef.current;
    let cancelled = false;

    async function fetchSourceOfTruth() {
      setLoadPhase('loading');
      setLoadError(null);
      setInitialDbContent(null);
      isYjsReadyRef.current = false;

      try {
        const res = await withTimeout(
          api<{ success: boolean; file: { content: string } }>(
            `/latex-projects/${projectId}/files/content?fileId=${fileId}`
          ),
          FETCH_TIMEOUT_MS
        );

        if (cancelled || generation !== fetchGenerationRef.current) return;
        if (res.error) throw new Error(res.error);

        const content = res.data?.file?.content;
        const resolved =
          content && content.trim().length > 0
            ? content
            : fallbackContent || '% Empty document\n';

        setInitialDbContent(resolved);
        setLoadPhase('ready');
      } catch (err: any) {
        if (cancelled || generation !== fetchGenerationRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load document';
        const resolved = fallbackContent || '\\documentclass{article}\n\\begin{document}\n\\end{document}\n';
        setLoadError(message);
        setInitialDbContent(resolved);
        setLoadPhase(fallbackContent ? 'ready' : 'error');
      }
    }

    void fetchSourceOfTruth();
    return () => { cancelled = true; };
  }, [persistModels, projectId, fileId, fallbackContent, retryCount]);

  useEffect(() => {
    if (persistModels) return;
    setEditorInstance(null);
    bindingRef.current?.destroy();
    bindingRef.current = null;
  }, [persistModels, fileId]);

  // Yjs collab (non-persistModels mode only)
  useEffect(() => {
    if (persistModels) return;
    if (!editorInstance || !monaco || initialDbContent === null || loadPhase === 'loading') return;

    editorRef.current = editorInstance;
    const roomName = `project/${projectId}/file/${fileId}`;
    const wsUrl = getYjsWsUrl();

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('monaco');

    if (initialDbContent && ytext.length === 0) {
      ydoc.transact(() => { ytext.insert(0, initialDbContent); });
    }

    const provider = new WebsocketProvider(wsUrl, roomName, ydoc, {
      connect: true,
      params: token ? { auth: token } : {},
    });
    providerRef.current = provider;
    provider.awareness.setLocalStateField('user', { name: username, color });

    const initBinding = () => {
      if (!editorInstance || bindingRef.current) return;
      const model = editorInstance.getModel();
      if (model) {
        bindingRef.current = new MonacoBinding(
          ytext,
          model,
          new Set([editorInstance]),
          provider.awareness
        );
      }
    };

    if (!isYjsReadyRef.current) {
      isYjsReadyRef.current = true;
      initBinding();
    }

    const autosaveTimer = setInterval(() => {
      if (!token || !editorInstance || !isYjsReadyRef.current) return;
      const content = editorInstance.getValue();
      if (content && content.length >= 5) {
        api(`/latex-projects/${projectId}/files/content`, {
          method: 'PUT',
          body: { fileId, content },
        }).catch((err) => console.error(`${LOG} Autosave failed:`, err));
      }
    }, 5000);

    return () => {
      isYjsReadyRef.current = false;
      clearInterval(autosaveTimer);
      bindingRef.current?.destroy();
      bindingRef.current = null;
      provider.disconnect();
      ydoc.destroy();
    };
  }, [persistModels, projectId, fileId, monaco, editorInstance, initialDbContent, loadPhase, token, username, color]);

  const handleEditorDidMount = (editor: any) => {
    setEditorInstance(editor);
    onEditorMount?.(editor);

    pasteCleanupRef.current?.();
    pasteCleanupRef.current = registerMonacoPlainTextPaste(editor);

    editor.onDidChangeModelContent(() => {
      onContentChange?.();
    });

    editor.addCommand(
      // @ts-expect-error monaco key codes optional until mount
      monaco?.KeyMod?.CtrlCmd | monaco?.KeyCode?.KeyS,
      () => { onSave?.(); }
    );
  };

  useEffect(() => {
    return () => {
      pasteCleanupRef.current?.();
      pasteCleanupRef.current = null;
    };
  }, []);

  const showEditor = persistModels
    ? true
    : initialDbContent !== null && loadPhase !== 'loading';

  return (
    <div className="relative w-full h-full bg-[#1e1e1e]">
      {loadPhase === 'loading' && !(persistModels && editorInstance) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e1e]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <span className="text-slate-400 text-sm font-medium">Loading document...</span>
          </div>
        </div>
      )}

      {loadPhase === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e1e]/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <div>
              <p className="text-slate-200 font-medium">Failed to load document</p>
              <p className="text-slate-400 text-sm mt-1">{loadError}</p>
            </div>
            <Button type="button" variant="outline" onClick={retryLoad} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {loadError && loadPhase === 'ready' && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-md bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400">
          <span>Editing local copy</span>
          <button type="button" className="text-blue-400 hover:text-blue-300" onClick={retryLoad}>
            Sync
          </button>
        </div>
      )}

      {showEditor && (
        <Editor
          key={persistModels ? 'persisted-editor' : `${fileId}-${retryCount}`}
          height="100%"
          defaultLanguage="latex"
          theme="vs-dark"
          defaultValue={persistModels ? '' : initialDbContent ?? ''}
          options={{
            minimap: { enabled: true, renderCharacters: false, scale: 0.75 },
            wordWrap: 'on',
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
            renderWhitespace: 'boundary',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
          }}
          onMount={handleEditorDidMount}
          loading={
            <div className="flex h-full items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          }
        />
      )}
    </div>
  );
}

/** Mark a file as saved in the model cache after a successful PUT. */
export function notifyFileSaved(fileId: string, content: string): void {
  markModelSaved(fileId, content);
}
