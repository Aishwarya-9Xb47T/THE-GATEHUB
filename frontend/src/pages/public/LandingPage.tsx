import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";
import { LandingExploreSectionFallback } from "@/components/landing/LandingSectionFallbacks";

const TechnologyEcosystemMarquee = lazy(() =>
  import("@/components/landing/TechnologyEcosystemMarquee").then((m) => ({
    default: m.TechnologyEcosystemMarquee,
  }))
);

const EcosystemValueSection = lazy(() =>
  import("@/components/landing/EcosystemValueSection").then((m) => ({
    default: m.EcosystemValueSection,
  }))
);

const LandingExploreCoursesSection = lazy(() =>
  import("@/pages/public/landing/LandingExploreCoursesSection").then((m) => ({
    default: m.LandingExploreCoursesSection,
  }))
);

function HeroMarqueeFallback() {
  return (
    <div className="landing-hero__domains border-t border-border/40 h-24 animate-pulse bg-muted/15" aria-hidden />
  );
}

function EcosystemFallback() {
  return (
    <section className="ecosystem-value relative border-t border-border min-h-[320px] animate-pulse bg-muted/10" aria-hidden />
  );
}

export function LandingPage() {
  return (
    <div className="landing-page bg-background text-foreground selection:bg-primary/20">
      <main className="landing-main">
        <section className="landing-hero relative">
          <div className="landing-hero__glow" aria-hidden />
          <div className="landing-hero__glow landing-hero__glow--secondary" aria-hidden />
          <div className="landing-hero__shell relative">
            <div className="landing-hero__content">
              <ShimmerHeading as="h1" className="landing-hero-heading landing-hero__heading font-display">
                Master Future Technologies Through Learning, Practice and Real-World Projects
              </ShimmerHeading>

              <p className="landing-subheading landing-hero__subheading">
                Join a next-generation learning platform where students master technology through structured learning
                paths, interactive coding labs, real-world projects, AI-powered guidance, and industry-recognized
                certifications.
              </p>

              <div className="landing-hero__actions flex flex-col sm:flex-row items-center justify-center">
                <Link to="/register" className="landing-btn landing-btn--primary w-full sm:w-auto">
                  Start Learning
                </Link>
                <a href="#courses" className="landing-btn landing-btn--secondary w-full sm:w-auto">
                  Explore Courses
                </a>
              </div>
            </div>
          </div>

          <Suspense fallback={<HeroMarqueeFallback />}>
            <div className="landing-hero__domains border-t border-border/40">
              <TechnologyEcosystemMarquee />
            </div>
          </Suspense>
        </section>

        <Suspense fallback={<EcosystemFallback />}>
          <EcosystemValueSection />
        </Suspense>

        <Suspense fallback={<LandingExploreSectionFallback />}>
          <LandingExploreCoursesSection />
        </Suspense>

        <section className="landing-section-compact bg-transparent dark:bg-background transition-colors border-t border-border/40">
          <div className="landing-shell text-center">
            <Link to="/resources" className="landing-btn landing-btn--primary">
              Free Learning Resources <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        <section className="landing-cta relative overflow-hidden text-center bg-transparent dark:bg-background transition-colors border-t border-border/40">
          <div className="landing-cta__glow" aria-hidden />
          <div className="landing-shell relative z-10">
            <div className="landing-section-heading-wrap app-lead-width mx-auto">
              <ShimmerHeading className="landing-section-heading landing-cta__heading font-display">
                Start your journey with a platform built for serious technologists.
              </ShimmerHeading>
            </div>
            <p className="landing-subheading landing-cta__description">
              Learn with purpose. Build with confidence. Graduate with credentials that matter.
            </p>
            <Link to="/register" className="landing-btn landing-btn--primary">
              Get Started for Free <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
