import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VisualLesson } from "@/lib/visualBuilder/converters";

interface LessonMetadataPanelProps {
  lesson: VisualLesson;
  onChange: (lesson: VisualLesson) => void;
}

export function LessonMetadataPanel({ lesson, onChange }: LessonMetadataPanelProps) {
  return (
    <Card className="mb-4">
      <CardHeader className="py-3">
        <CardTitle className="text-base">Lesson Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Description</Label>
          <Textarea
            value={lesson.description || ""}
            onChange={(e) => onChange({ ...lesson, description: e.target.value })}
            placeholder="What will students learn in this lesson?"
            className="min-h-20"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Estimated Time (minutes)</Label>
          <Input
            type="number"
            min={0}
            value={lesson.estimatedMinutes ?? ""}
            onChange={(e) => onChange({ ...lesson, estimatedMinutes: Number(e.target.value) || undefined })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Learning Outcomes</Label>
          <Textarea
            value={lesson.learningOutcomes || ""}
            onChange={(e) => onChange({ ...lesson, learningOutcomes: e.target.value })}
            placeholder="By the end of this lesson, students will be able to..."
            className="min-h-20"
          />
        </div>
      </CardContent>
    </Card>
  );
}
