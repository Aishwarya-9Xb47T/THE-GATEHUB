import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TryItPlayground } from "@/components/learning/TryItPlayground";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function PracticeExperience({ step, onProgress }: ExperienceRendererProps) {
  const [done, setDone] = useState(false);
  const language = String(step.payload.language ?? "python");
  const initialCode = String(step.payload.initialCode ?? "");
  const expectedOutput = String(step.payload.expectedOutput ?? "");

  const handleComplete = () => {
    setDone(true);
    onProgress(step.id, "complete");
  };

  return (
    <Card className="overflow-hidden border-0 shadow-md w-full">
      <div className="surface-gradient bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4">
        <h2 className="text-lg font-semibold">{step.title}</h2>
        <p className="text-sm opacity-80 mt-1">Run the code and match the expected output.</p>
      </div>
      <div className="p-4">
        <TryItPlayground
          language={language}
          initialCode={initialCode}
          expectedOutput={expectedOutput}
          onSuccess={handleComplete}
        />
        {done && (
          <div className="mt-4 flex items-center gap-2 text-emerald-600 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Practice completed
          </div>
        )}
        {!done && (
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={handleComplete}>
            Mark as complete
          </Button>
        )}
      </div>
    </Card>
  );
}
