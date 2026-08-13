import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TryItPlayground } from "@/components/learning/TryItPlayground";
import type { ExperienceRendererProps } from "./ExperienceRenderer";
import { buildComponentScopeKey, usePersistedStepState } from "../hooks/useComponentState";
import type { CodingLabConfig } from "@/types/codingLabTypes";

export function CodingLabExperience({ step, universeId, lessonId, publishVersionId, onProgress }: ExperienceRendererProps) {
  const payload = step.payload || {};
  const config = (payload.config as CodingLabConfig) || {
    title: step.title,
    description: String(payload.instructions || payload.description || ""),
    language: String(payload.language || "python"),
    starterCode: String(payload.starterCode || payload.initialCode || "# Write your solution here\n"),
    publicTestCases: (payload.publicTestCases as CodingLabConfig["publicTestCases"]) || [
      {
        id: "pub-1",
        name: "Public Test 1",
        input: String(payload.sampleInput || ""),
        expectedOutput: String(payload.expectedOutput || ""),
        isHidden: false,
      },
    ],
    hiddenTestCases: (payload.hiddenTestCases as CodingLabConfig["hiddenTestCases"]) || [],
    missionSteps: (payload.missionSteps as CodingLabConfig["missionSteps"]) || [],
    hints: Array.isArray(payload.hints) ? payload.hints.map(String) : [],
  };

  const scopeKey = buildComponentScopeKey(universeId, publishVersionId || "preview", lessonId, step.id);
  const [savedCode] = usePersistedStepState(scopeKey, "code", config.starterCode);
  const [done, setDone] = usePersistedStepState(scopeKey, "done", false);

  const handleComplete = () => {
    setDone(true);
    onProgress(step.id, "submit");
  };

  return (
    <Card className="overflow-hidden border-0 shadow-xl bg-slate-950">
      <div className="surface-gradient bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-5 text-white">
        <p className="text-xs uppercase tracking-widest opacity-80 mb-1 font-semibold">Interactive Coding Lab</p>
        <h2 className="text-xl font-bold">{step.title}</h2>
        {config.description && <p className="text-sm opacity-90 mt-2 max-w-3xl line-clamp-3">{config.description}</p>}
      </div>
      <div className="p-4">
        <TryItPlayground
          title={step.title}
          language={config.language}
          initialCode={savedCode}
          config={config}
          onSuccess={handleComplete}
          learningUniverseId={universeId}
          publishVersionId={publishVersionId}
          lessonId={lessonId}
          stepId={step.id}
        />
        {done && (
          <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Coding lab completed
          </div>
        )}
        {!done && (
          <Button type="button" variant="outline" size="sm" className="mt-4 border-slate-700 text-slate-300" onClick={handleComplete}>
            Mark as complete
          </Button>
        )}
      </div>
    </Card>
  );
}
