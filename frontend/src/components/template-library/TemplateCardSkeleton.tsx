import { cn } from "@/lib/utils";

export function TemplateCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 animate-pulse",
        className
      )}
    >
      <div className="aspect-[16/10] bg-white/10" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-3/4 rounded bg-white/10" />
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="flex gap-2">
          <div className="h-5 w-12 rounded-full bg-white/10" />
          <div className="h-5 w-12 rounded-full bg-white/10" />
          <div className="h-5 w-16 rounded-full bg-white/10" />
        </div>
        <div className="flex gap-2 pt-2">
          <div className="h-8 flex-1 rounded-lg bg-white/10" />
          <div className="h-8 flex-1 rounded-lg bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function TemplateLibrarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <TemplateCardSkeleton key={i} />
      ))}
    </div>
  );
}
