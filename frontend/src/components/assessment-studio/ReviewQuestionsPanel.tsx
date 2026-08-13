import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Edit2, Trash2, Eye, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ExtractedQuestion {
  id: string;
  text: string;
  type: "multiple_choice" | "multiple_select" | "true_false" | "short_answer";
  options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
  correctAnswer: string | string[];
  explanation?: string;
  difficulty: "easy" | "medium" | "hard";
  confidence: number;
  warnings: string[];
  images?: string[];
}

interface ReviewQuestionsPanelProps {
  questions: ExtractedQuestion[];
  onApprove: () => void;
  onEdit: (questionId: string) => void;
  onDelete: (questionId: string) => void;
  onBack: () => void;
}

export function ReviewQuestionsPanel({
  questions,
  onApprove,
  onEdit,
  onDelete,
  onBack,
}: ReviewQuestionsPanelProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  const getConfidenceLevel = (confidence: number): "high" | "medium" | "low" => {
    if (confidence >= 80) return "high";
    if (confidence >= 60) return "medium";
    return "low";
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "low":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  const getConfidenceIcon = (level: string) => {
    switch (level) {
      case "high":
        return <CheckCircle2 className="h-4 w-4" />;
      case "medium":
        return <AlertTriangle className="h-4 w-4" />;
      case "low":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const highConfidenceCount = questions.filter((q) => getConfidenceLevel(q.confidence) === "high").length;
  const mediumConfidenceCount = questions.filter((q) => getConfidenceLevel(q.confidence) === "medium").length;
  const lowConfidenceCount = questions.filter((q) => getConfidenceLevel(q.confidence) === "low").length;
  const questionsWithWarnings = questions.filter((q) => q.warnings.length > 0).length;
  const questionsWithImages = questions.filter((q) => q.images && q.images.length > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Review Questions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review extracted questions before adding to your Question Bank
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{questions.length}</div>
            <div className="text-xs text-muted-foreground">Questions Extracted</div>
          </CardContent>
        </Card>
        <Card className={cn("border-green-500/20", highConfidenceCount > 0 ? "bg-green-500/5" : "")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <div className="text-2xl font-bold text-green-600">{highConfidenceCount}</div>
            </div>
            <div className="text-xs text-muted-foreground">High Confidence</div>
          </CardContent>
        </Card>
        <Card className={cn("border-yellow-500/20", mediumConfidenceCount > 0 ? "bg-yellow-500/5" : "")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <div className="text-2xl font-bold text-yellow-600">{mediumConfidenceCount}</div>
            </div>
            <div className="text-xs text-muted-foreground">Medium Confidence</div>
          </CardContent>
        </Card>
        <Card className={cn("border-red-500/20", lowConfidenceCount > 0 ? "bg-red-500/5" : "")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <div className="text-2xl font-bold text-red-600">{lowConfidenceCount}</div>
            </div>
            <div className="text-xs text-muted-foreground">Low Confidence</div>
          </CardContent>
        </Card>
        <Card className={cn("border-orange-500/20", questionsWithWarnings > 0 ? "bg-orange-500/5" : "")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <div className="text-2xl font-bold text-orange-600">{questionsWithWarnings}</div>
            </div>
            <div className="text-xs text-muted-foreground">Has Warnings</div>
          </CardContent>
        </Card>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((question, index) => {
          const confidenceLevel = getConfidenceLevel(question.confidence);
          return (
            <Card
              key={question.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                selectedQuestion === question.id && "ring-2 ring-primary"
              )}
              onClick={() => setSelectedQuestion(question.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        Q{index + 1}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", getConfidenceColor(confidenceLevel))}
                      >
                        <span className="flex items-center gap-1">
                          {getConfidenceIcon(confidenceLevel)}
                          {confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1)} ({question.confidence}%)
                        </span>
                      </Badge>
                      {question.images && question.images.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Eye className="h-3 w-3 mr-1" />
                          {question.images.length} image{question.images.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium leading-relaxed">{question.text}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(question.id);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(question.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {question.warnings.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {question.warnings.map((warning, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-orange-600">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {questions.length} questions ready to add to Question Bank
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button onClick={onApprove} className="gap-2">
            Continue to Quiz Builder
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
