import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuizIdentityPreview } from "./QuizIdentityPreview";
import type { QuizBrandingData, QuizDetailsData } from "@/lib/quizBranding/types";
import type { QuizCreationMethod } from "@/components/quiz-room/wizard/CreateMethodStep";
import { WORKFLOW_LABELS } from "@/lib/quizBranding/types";

interface QuizDetailsStepProps {
  workflow: QuizCreationMethod;
  branding: QuizBrandingData;
  details: QuizDetailsData;
  onChange: (details: QuizDetailsData) => void;
}

const fieldClass = "border-white/15 bg-white/5 text-white placeholder:text-white/40";

export function QuizDetailsStep({ workflow, branding, details, onChange }: QuizDetailsStepProps) {
  const [tagInput, setTagInput] = useState("");
  const patch = (p: Partial<QuizDetailsData>) => onChange({ ...details, ...p });

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || details.tags.includes(tag)) return;
    patch({ tags: [...details.tags, tag] });
    setTagInput("");
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">{WORKFLOW_LABELS[workflow]}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Quiz Details</h1>
        <p className="mt-3 text-white/60">Name and describe your quiz — preview updates live.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="space-y-2">
            <Label className="text-white/80">Quiz Name *</Label>
            <Input value={details.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Machine Learning Midterm" className={fieldClass} />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Subtitle</Label>
            <Input value={details.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} className={fieldClass} />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Description</Label>
            <Textarea value={details.description} onChange={(e) => patch({ description: e.target.value })} rows={3} className={fieldClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white/80">Subject</Label>
              <Input value={details.subject} onChange={(e) => patch({ subject: e.target.value })} className={fieldClass} />
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Difficulty</Label>
              <Select value={details.difficulty} onValueChange={(v) => patch({ difficulty: v })}>
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["easy", "medium", "hard", "mixed"].map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Estimated Time (min)</Label>
              <Input type="number" min={1} value={details.estimatedMinutes} onChange={(e) => patch({ estimatedMinutes: Number(e.target.value) || 30 })} className={fieldClass} />
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Passing Score (%)</Label>
              <Input type="number" min={0} max={100} value={details.passingScore} onChange={(e) => patch({ passingScore: Number(e.target.value) || 60 })} className={fieldClass} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Tags</Label>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} className={fieldClass} placeholder="Add tag" />
              <Button type="button" variant="outline" className="border-white/20 shrink-0" onClick={addTag}><Plus className="h-4 w-4" /></Button>
            </div>
            {details.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {details.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" onClick={() => patch({ tags: details.tags.filter((t) => t !== tag) })}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="sticky top-4">
            <QuizIdentityPreview branding={branding} details={details} />
          </div>
        </div>
      </div>
    </div>
  );
}
