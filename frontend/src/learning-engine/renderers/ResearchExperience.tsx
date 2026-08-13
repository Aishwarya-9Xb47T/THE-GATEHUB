import { FileSearch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ExperienceRendererProps } from "./ExperienceRenderer";
import { buildComponentScopeKey, usePersistedStepState } from "../hooks/useComponentState";

export function ResearchExperience({ step, universeId, lessonId, publishVersionId, onProgress }: ExperienceRendererProps) {
  const defaultTitle = String(step.payload.title ?? step.title ?? "Research Paper");
  const defaultAbstract = String(step.payload.abstract ?? "");
  const defaultIntro = String(step.payload.introduction ?? step.payload.instructions ?? "");

  const scopeKey = buildComponentScopeKey(universeId, publishVersionId || "preview", lessonId, step.id);
  const [title, setTitle] = usePersistedStepState(scopeKey, "title", defaultTitle);
  const [abstract, setAbstract] = usePersistedStepState(scopeKey, "abstract", defaultAbstract);
  const [introduction, setIntroduction] = usePersistedStepState(scopeKey, "introduction", defaultIntro);

  const handleBlur = () => {
    onProgress(step.id, "view");
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <div className="surface-gradient bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5">
        <div className="flex items-center gap-3">
          <FileSearch className="w-7 h-7" />
          <div>
            <p className="text-xs uppercase tracking-widest opacity-80">Research Workspace</p>
            <h2 className="text-xl font-bold">{step.title}</h2>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-5">
        <div>
          <Label>Paper title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleBlur} className="mt-1.5" />
        </div>
        <div>
          <Label>Abstract</Label>
          <Textarea value={abstract} onChange={(e) => setAbstract(e.target.value)} onBlur={handleBlur} rows={4} className="mt-1.5" />
        </div>
        <div>
          <Label>Introduction</Label>
          <Textarea value={introduction} onChange={(e) => setIntroduction(e.target.value)} onBlur={handleBlur} rows={8} className="mt-1.5" />
        </div>
      </div>
    </Card>
  );
}
