import { buildComponentScopeKey, usePersistedStepState } from "../hooks/useComponentState";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function ReflectionJournal({
  step,
  onProgress,
  universeId,
  lessonId,
  publishVersionId,
}: ExperienceRendererProps) {
  const scopeKey = buildComponentScopeKey(
    universeId,
    publishVersionId || "preview",
    lessonId,
    step.id
  );
  const [entry, setEntry] = usePersistedStepState(scopeKey, "reflection", "");
  const prompt = String(step.payload.prompt ?? step.payload.instructions ?? "What did you learn from this lesson?");

  return (
    <Card className="p-6 border-l-4 border-l-indigo-500">
      <h2 className="text-lg font-semibold mb-2">{step.title}</h2>
      <p className="text-sm text-muted-foreground mb-4">{prompt}</p>
      <Textarea
        value={entry}
        onChange={(e) => setEntry(e.target.value)}
        rows={5}
        placeholder="Write your reflection..."
        className="mb-4"
        aria-label="Reflection journal entry"
      />
      <Button
        type="button"
        size="sm"
        onClick={() => onProgress(step.id, "complete")}
        disabled={!entry.trim()}
      >
        Save reflection
      </Button>
    </Card>
  );
}
