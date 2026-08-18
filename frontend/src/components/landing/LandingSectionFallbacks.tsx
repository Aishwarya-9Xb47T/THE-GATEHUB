import { LandingCatalogSkeleton } from "@/components/landing/LandingCatalogSkeleton";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";

export function LandingExploreSectionFallback() {
  return (
    <section className="landing-section landing-section--paths border-y border-border/60 bg-white/40 dark:bg-secondary/20 backdrop-blur-sm">
      <div className="landing-shell landing-shell--catalog">
        <div className="landing-section-header landing-section-heading-wrap text-center">
          <ShimmerHeading className="landing-section-heading font-display">Explore Courses</ShimmerHeading>
          <p className="landing-subheading mx-auto">
            Structured learning paths and expert-led programs — all in one place.
          </p>
        </div>
        <LandingCatalogSkeleton />
      </div>
    </section>
  );
}

/** @deprecated Use LandingExploreSectionFallback */
export function LandingPathsSectionFallback() {
  return <LandingExploreSectionFallback />;
}

/** @deprecated Use LandingExploreSectionFallback */
export function LandingCoursesSectionFallback() {
  return <LandingExploreSectionFallback />;
}
