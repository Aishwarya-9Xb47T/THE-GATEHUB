/** Instant shell while the landing page chunk loads — never a blank screen. */
export function LandingRouteFallback() {
  return (
    <div className="landing-page bg-background text-foreground">
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

              <h1 className="landing-hero-heading landing-hero__heading font-display">
                Learning, Reimagined.
              </h1>

              <h2 className="landing-hero__supporting-heading">
                Explore Knowledge. Build Skills. Create What&apos;s Next.
              </h2>

              <p className="landing-subheading landing-hero__subheading">
                Go beyond traditional learning with technology-focused courses, hands-on projects, interactive
                experiences, and opportunities to turn ideas into real-world solutions.
              </p>

              <div className="landing-hero__actions flex flex-col sm:flex-row items-center justify-center gap-3">
                <span className="landing-btn landing-btn--primary w-full sm:w-auto opacity-90">Start Learning</span>
                <span className="landing-btn landing-btn--secondary w-full sm:w-auto opacity-90">
                  Explore Courses
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
