import { Clock, FileQuestion, Target, BarChart3, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { QuizRoomPreview } from "@/lib/liveSession/types";

export function QuizRoomPreviewCard({ preview }: { preview: QuizRoomPreview }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <FileQuestion className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{preview.questionCount}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">~{preview.estimatedMinutes}m</p>
              <p className="text-xs text-muted-foreground">Est. Duration</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Target className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold capitalize">{preview.avgDifficulty}</p>
              <p className="text-xs text-muted-foreground">Difficulty</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <BarChart3 className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{preview.totalMarks}</p>
              <p className="text-xs text-muted-foreground">Total Marks</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            Question Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(preview.typeCounts).map(([type, count]) => (
              <Badge key={type} variant="secondary">
                {type.replace(/_/g, " ")} × {count}
              </Badge>
            ))}
          </div>
          {preview.topics.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Topics</p>
              <div className="flex flex-wrap gap-2">
                {preview.topics.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>#</span>
              <span>Question</span>
              <span>Type</span>
              <span>Marks</span>
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto">
              {preview.questions.map((q) => (
                <li key={q.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">{q.index}</span>
                  <span className="truncate">{q.text}</span>
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {q.type.replace(/_/g, " ")}
                  </Badge>
                  <span className="font-medium">{q.marks}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
