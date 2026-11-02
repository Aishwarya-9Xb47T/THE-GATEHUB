import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";
import { useUserStore } from "@/store/userStore";
import { LandingExploreCoursesSection } from "@/pages/public/landing/LandingExploreCoursesSection";

export function LandingPage() {
  const { user } = useUserStore();
  const ctaDestination = user ? "/resources" : "/register";

  return (
    <div className="landing-page bg-background text-foreground selection:bg-primary/20">
      <main className="landing-main">
        <section className="landing-hero relative">
          <div className="landing-hero__glow" aria-hidden />
          <div className="landing-hero__glow landing-hero__glow--secondary" aria-hidden />
          <div className="landing-hero__shell relative">
            <div className="landing-hero__content">
              <div className="landing-hero__eyebrow-container mb-4 inline-flex items-center justify-center">
                <span className="landing-hero__eyebrow">
                  <span className="landing-hero__eyebrow-dot" aria-hidden="true" />
                  THE FUTURE OF TECHNOLOGY LEARNING
                </span>
              </div>

              <ShimmerHeading as="h1" className="landing-hero-heading landing-hero__heading font-display">
                Learning, Reimagined.
              </ShimmerHeading>

              <h2 className="landing-hero__supporting-heading">
                Explore Knowledge. Build Skills. Create What&apos;s Next.
              </h2>

              <p className="landing-subheading landing-hero__subheading">
                Go beyond traditional learning with technology-focused courses, hands-on projects, interactive
                experiences, and opportunities to turn ideas into real-world solutions.
              </p>

              <div className="landing-hero__actions flex flex-col sm:flex-row items-center justify-center">
                <Link to={ctaDestination} className="landing-btn landing-btn--primary w-full sm:w-auto">
                  Start Learning
                </Link>
                <a href="#courses" className="landing-btn landing-btn--secondary w-full sm:w-auto">
                  Explore Courses
                </a>
              </div>
            </div>
          </div>
        </section>

        <LandingExploreCoursesSection />

        <section className="landing-section-compact bg-transparent dark:bg-background transition-colors border-t border-border/40">
          <div className="landing-shell text-center">
            <Link to="/resources" className="landing-btn landing-btn--primary">
              Free Learning Resources <ArrowRight className="w-5 h-5 ml-1" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="landing-cta relative overflow-hidden text-center bg-transparent dark:bg-background transition-colors border-t border-border/40">
          <div className="landing-cta__glow" aria-hidden />
          <div className="landing-shell relative z-10">
            <div className="landing-section-heading-wrap mx-auto">
              <ShimmerHeading as="h2" className="landing-section-heading landing-cta__heading font-display">
                Your Next Chapter in Technology Starts Here.
              </ShimmerHeading>
            </div>
            <h3 className="landing-cta__supporting-heading">
              Learn with purpose. Build real skills. Turn your ideas into impact.
            </h3>
            <p className="landing-subheading landing-cta__description">
              Discover a platform designed to help you grow from curious learner to confident creator.
            </p>
            <Link to={ctaDestination} className="landing-btn landing-btn--primary">
              Get Started for Free <ArrowRight className="w-5 h-5 ml-1" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
