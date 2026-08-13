interface LandingCatalogSkeletonProps {
  count?: number;
}

export function LandingCatalogSkeleton({ count = 4 }: LandingCatalogSkeletonProps) {
  return (
    <div className="landing-cards-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="course-card-skeleton border border-border bg-card/50 animate-pulse">
          <div className="course-card-skeleton__banner" />
          <div className="p-5 space-y-3">
            <div className="h-3 w-24 bg-muted/50 rounded" />
            <div className="h-4 w-full bg-muted/50 rounded" />
            <div className="h-3 w-3/4 bg-muted/50 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
