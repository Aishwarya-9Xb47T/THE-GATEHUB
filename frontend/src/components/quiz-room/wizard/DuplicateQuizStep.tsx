import { useQuery } from "@tanstack/react-query";
import { DoorOpen, Loader2 } from "lucide-react";
import { listQuizRooms } from "@/lib/liveSession/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DuplicateQuizStepProps {
  selectedQuizId: string;
  onSelect: (quizId: string, title: string) => void;
}

export function DuplicateQuizStep({ selectedQuizId, onSelect }: DuplicateQuizStepProps) {
  const { data: rooms, isLoading } = useQuery({
    queryKey: ["quiz-rooms-duplicate-pick"],
    queryFn: async () => {
      const res = await listQuizRooms();
      return res.data?.data || [];
    },
  });

  const uniqueQuizzes = new Map<string, { quizId: string; title: string; roomTitle: string }>();
  for (const room of rooms || []) {
    if (!uniqueQuizzes.has(room.quiz.id)) {
      uniqueQuizzes.set(room.quiz.id, {
        quizId: room.quiz.id,
        title: room.quiz.title,
        roomTitle: room.title,
      });
    }
  }

  const items = [...uniqueQuizzes.values()];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Duplicate an existing quiz</h2>
        <p className="mt-1 text-white/60">Pick a quiz you have used before.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-white/50">
          <DoorOpen className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>No quizzes yet. Import or create one first.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const selected = selectedQuizId === item.quizId;
            return (
              <button
                key={item.quizId}
                type="button"
                onClick={() => onSelect(item.quizId, item.title)}
                className={cn(
                  "rounded-2xl border p-5 text-left transition-all",
                  selected
                    ? "border-primary bg-primary/15 ring-2 ring-primary/30"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                )}
              >
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-xs text-white/50">Last room: {item.roomTitle}</p>
                {selected && <Badge className="mt-2 bg-primary/30 text-primary">Selected</Badge>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
