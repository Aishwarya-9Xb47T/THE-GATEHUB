import { Progress } from "@/components/ui/progress";

export function PlayerProgress({
  current,
  total,
  percent,
}: {
  current: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="space-y-1" aria-label={`Question ${current} of ${total}`}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Question {current} / {total}
        </span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-2" />
    </div>
  );
}
