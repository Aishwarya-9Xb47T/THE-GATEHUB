import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BankQuestion } from "@/lib/assessmentStudio/types";
import { QUESTION_TYPE_LABELS, STATUS_LABELS } from "@/lib/assessmentStudio/types";
import { Sparkles, BarChart3, Clock } from "lucide-react";
import { AssessmentContentRenderer } from "@/components/assessment/AssessmentContentRenderer";

interface QuestionCardProps {
  question: BankQuestion;
  selected?: boolean;
  onClick?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_review: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  approved: "bg-sky-100 text-sky-800",
  archived: "bg-muted text-muted-foreground",
};

export function QuestionCard({ question, selected, onClick }: QuestionCardProps) {
  const tags = Array.isArray(question.tags) ? question.tags : [];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        selected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {QUESTION_TYPE_LABELS[question.type] || question.type}
          </Badge>
          <Badge className={cn("text-[10px]", STATUS_COLORS[question.status] || "")}>
            {STATUS_LABELS[question.status as keyof typeof STATUS_LABELS] || question.status}
          </Badge>
          {question.source === "ai" && (
            <Badge variant="secondary" className="text-[10px]">
              <Sparkles className="mr-1 h-3 w-3" />
              AI
            </Badge>
          )}
          {question.difficulty && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {question.difficulty}
            </Badge>
          )}
          {question.bloomLevel && (
            <Badge variant="outline" className="text-[10px]">
              Bloom {question.bloomLevel}
            </Badge>
          )}
        </div>

        <div className="line-clamp-3 text-sm font-medium leading-snug">
          <AssessmentContentRenderer content={question.stem} variant="stem" metadata={question.metadata as Record<string, unknown>} />
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {question.course && <span>{question.course.title}</span>}
          {question.analytics && (
            <>
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                {question.analytics.timesUsed} uses
              </span>
              <span>{Math.round(question.analytics.avgAccuracy)}% accuracy</span>
            </>
          )}
          {question.estimatedSeconds && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {question.estimatedSeconds}s
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
