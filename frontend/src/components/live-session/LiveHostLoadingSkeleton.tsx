export function LiveHostLoadingSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-muted" />
      <div className="flex gap-2">
        <div className="h-6 w-24 rounded-full bg-muted" />
        <div className="h-6 w-20 rounded-full bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-48 rounded-2xl bg-muted" />
        <div className="h-48 rounded-2xl bg-muted" />
      </div>
      <p className="text-center text-sm text-muted-foreground">Connecting to live session…</p>
    </div>
  );
}
