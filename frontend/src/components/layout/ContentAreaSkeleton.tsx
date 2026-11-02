export function PublicContentSkeleton() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse space-y-8">
      {/* Header shimmer */}
      <div className="space-y-3">
        <div className="h-8 w-64 bg-muted/70 rounded-lg" />
        <div className="h-4 w-96 bg-muted/50 rounded-md" />
      </div>

      {/* Filter / control bar shimmer */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-border/40">
        <div className="h-10 w-72 bg-muted/60 rounded-xl" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-muted/50 rounded-lg" />
          <div className="h-10 w-24 bg-muted/50 rounded-lg" />
        </div>
      </div>

      {/* Cards grid shimmer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/50 bg-card/60 p-5 space-y-4 overflow-hidden"
          >
            <div className="h-40 bg-muted/60 rounded-xl w-full" />
            <div className="space-y-2 pt-1">
              <div className="h-4 bg-muted/70 rounded w-1/3" />
              <div className="h-5 bg-muted rounded w-4/5" />
              <div className="h-3.5 bg-muted/50 rounded w-full" />
              <div className="h-3.5 bg-muted/50 rounded w-2/3" />
            </div>
            <div className="pt-2 flex items-center justify-between">
              <div className="h-4 w-16 bg-muted/60 rounded" />
              <div className="h-8 w-24 bg-muted/70 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardContentSkeleton() {
  return (
    <div className="w-full space-y-8 animate-pulse">
      {/* Title & subtitle shimmer */}
      <div className="space-y-2">
        <div className="h-8 w-56 bg-muted/70 rounded-lg" />
        <div className="h-4 w-80 bg-muted/50 rounded-md" />
      </div>

      {/* Metric summary cards shimmer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/50 bg-card/60 p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-muted/60 rounded" />
              <div className="h-8 w-8 bg-muted/50 rounded-lg" />
            </div>
            <div className="h-7 w-20 bg-muted/80 rounded" />
            <div className="h-3 w-32 bg-muted/40 rounded" />
          </div>
        ))}
      </div>

      {/* Content panel shimmer */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-6 space-y-4">
        <div className="h-6 w-44 bg-muted/70 rounded" />
        <div className="space-y-3">
          <div className="h-16 bg-muted/40 rounded-lg w-full" />
          <div className="h-16 bg-muted/40 rounded-lg w-full" />
          <div className="h-16 bg-muted/40 rounded-lg w-full" />
        </div>
      </div>
    </div>
  );
}

