import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileQuestion,
  Video,
  FileText,
  HelpCircle,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { CurriculumSection } from "./wizardTypes";

interface CurriculumStepProps {
  courseTitle: string;
  sections: CurriculumSection[];
  selectedLectureId: string;
  selectedQuizId: string;
  onSelectQuiz: (lectureId: string, quizId: string, lectureTitle: string) => void;
  loading?: boolean;
}

function lectureIcon(type: string) {
  if (type === "quiz") return FileQuestion;
  if (type === "video") return Video;
  if (type === "notes") return FileText;
  return HelpCircle;
}

export function CurriculumStep({
  courseTitle,
  sections,
  selectedLectureId,
  selectedQuizId,
  onSelectQuiz,
  loading,
}: CurriculumStepProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(sections.map((s) => s.id)));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const quizLectures = sections.flatMap((s) =>
    s.lectures.filter((l) => l.type === "quiz" && l.quizId)
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Curriculum</h2>
        <p className="mt-1 text-white/60">
          Explore <span className="text-white">{courseTitle}</span> and pick a quiz lecture.
        </p>
      </div>

      {loading ? (
        <p className="text-white/50">Loading curriculum…</p>
      ) : quizLectures.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 py-12 text-center text-white/50">
          No quiz lectures in this course. Add a quiz lecture in the curriculum builder first.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <div className="border-b border-white/10 px-4 py-3 text-xs font-medium uppercase tracking-wide text-white/40">
            Course Explorer
          </div>
          <ul className="max-h-[min(60vh,520px)] overflow-y-auto p-2">
            {sections.map((section) => {
              const isOpen = expanded.has(section.id);
              return (
                <li key={section.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggle(section.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-white/90 hover:bg-white/5"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/50" />
                    )}
                    <Folder className="h-4 w-4 shrink-0 text-amber-400/80" />
                    <span className="truncate">{section.title}</span>
                    <span className="ml-auto text-xs text-white/30">{section.lectures.length}</span>
                  </button>
                  {isOpen && (
                    <ul className="ml-6 border-l border-white/10 pl-2">
                      {section.lectures.map((lecture) => {
                        const Icon = lectureIcon(lecture.type);
                        const isQuiz = lecture.type === "quiz" && lecture.quizId;
                        const selected = lecture.id === selectedLectureId && lecture.quizId === selectedQuizId;

                        return (
                          <li key={lecture.id}>
                            <button
                              type="button"
                              disabled={!isQuiz}
                              onClick={() =>
                                isQuiz && onSelectQuiz(lecture.id, lecture.quizId!, lecture.title)
                              }
                              className={cn(
                                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                                selected
                                  ? "bg-primary/20 text-primary-foreground"
                                  : isQuiz
                                    ? "text-white/80 hover:bg-white/5"
                                    : "cursor-default text-white/30"
                              )}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{lecture.title}</span>
                              {isQuiz && (
                                <Badge className="ml-auto bg-primary/20 text-[10px] text-primary">Quiz</Badge>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedQuizId && (
        <p className="text-sm text-emerald-400">✓ Quiz selected — continue to choose question source.</p>
      )}
    </div>
  );
}
