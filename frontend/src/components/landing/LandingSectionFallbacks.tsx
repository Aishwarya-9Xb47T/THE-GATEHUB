import { LandingCatalogSkeleton } from "@/components/landing/LandingCatalogSkeleton";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";

export function LandingPathsSectionFallback() {
  return (
    <section className="landing-section landing-section--paths border-y border-border/60 bg-white/40 dark:bg-secondary/20 backdrop-blur-sm">
      <div className="landing-shell landing-shell--catalog">
        <div className="landing-paths-header landing-section-heading-wrap">
          <ShimmerHeading className="landing-section-heading font-display">Explore Learning Paths</ShimmerHeading>
          <p className="landing-subheading">
            Structured journeys designed to take you from fundamentals to job-ready expertise.
          </p>
        </div>
        <LandingCatalogSkeleton />
      </div>
    </section>
  );
}

export function LandingCoursesSectionFallback() {
  return (
    <section className="landing-section bg-transparent dark:bg-background relative overflow-hidden">
      <div className="landing-shell landing-shell--catalog relative z-10">
        <div className="landing-section-header landing-section-heading-wrap text-center">
          <ShimmerHeading className="landing-section-heading font-display">Featured Courses</ShimmerHeading>
          <p className="landing-subheading mx-auto">
            Expert-led programs built for depth, practice, and career outcomes.
          </p>
        </div>
        <LandingCatalogSkeleton />
      </div>
    </section>
  );
}
