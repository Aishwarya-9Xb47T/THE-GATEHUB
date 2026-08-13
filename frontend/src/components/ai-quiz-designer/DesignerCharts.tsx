import { cn } from "@/lib/utils";

export function MiniBarChart({
  data,
  className,
}: {
  data: Record<string, number>;
  className?: string;
}) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div className={cn("space-y-2", className)}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-white/60">{k}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right tabular-nums text-white/50">{v}</span>
        </div>
      ))}
    </div>
  );
}
