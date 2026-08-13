import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { Card } from "@/components/ui/card";
import { LessonImageBlock } from "@/components/learning-universe/LessonImageBlock";
import { LessonVideoPlaylist } from "@/components/video/LessonVideoPlaylist";
import { resolveLearningUniverseAsset } from "@/lib/resolveLearningUniverseAsset";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function MediaSection({ step, universeId, assets, onProgress }: ExperienceRendererProps) {
  const [editorHeight, setEditorHeight] = useState(320);

  useEffect(() => {
    const update = () => setEditorHeight(Math.min(Math.max(window.innerHeight * 0.42, 240), 520));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (step.kind !== "video") {
      onProgress(step.id, "view");
    }
  }, [step.id, step.kind, onProgress]);

  if (step.kind === "image") {
    const refs = [
      String(step.payload.file ?? ""),
      String(step.payload.path ?? ""),
      String(step.payload.url ?? ""),
    ].filter(Boolean);
    let resolved = "";
    for (const ref of refs) {
      const hit = resolveLearningUniverseAsset(ref, universeId, assets);
      if (hit.resolvedUrl) {
        resolved = hit.resolvedUrl;
        break;
      }
    }
    return (
      <Card className="p-4 overflow-hidden w-full">
        <LessonImageBlock src={resolved} caption={String(step.payload.caption ?? "")} alt="" />
      </Card>
    );
  }

  if (step.kind === "video") {
    const playlist = Array.isArray(step.payload.videos)
      ? (step.payload.videos as Array<Record<string, unknown>>)
      : [step.payload as Record<string, unknown>];

    return (
      <LessonVideoPlaylist
        stepId={step.id}
        stepTitle={step.title}
        universeId={universeId}
        assets={assets}
        videos={playlist}
        onProgress={(event) => onProgress(step.id, event)}
      />
    );
  }

  const code = String(step.payload.code ?? "");
  const language = String(step.payload.language ?? "python");
  const output = String(step.payload.output ?? "");

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/40">
        <h3 className="font-semibold text-sm">{step.title}</h3>
        <p className="text-xs text-muted-foreground">{language}</p>
      </div>
      <Editor
        height={`${editorHeight}px`}
        language={language}
        value={code}
        theme="vs-dark"
        options={{ readOnly: true, minimap: { enabled: false }, automaticLayout: true }}
      />
      {output && (
        <div className="px-4 py-3 bg-slate-950 text-emerald-400 font-mono text-xs border-t">
          <p className="text-slate-500 mb-1">Output</p>
          <pre>{output}</pre>
        </div>
      )}
    </Card>
  );
}
