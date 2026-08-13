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
              <h1 className="landing-hero-heading landing-hero__heading font-display">
                Master Future Technologies Through Learning, Practice and Real-World Projects
              </h1>
              <p className="landing-subheading landing-hero__subheading">
                Join a next-generation learning platform where students master technology through structured
                learning paths, interactive coding labs, real-world projects, AI-powered guidance, and
                industry-recognized certifications.
              </p>
              <div className="landing-hero__actions flex flex-col sm:flex-row items-center justify-center gap-3">
                <span className="landing-btn landing-btn--primary w-full sm:w-auto opacity-90">Start Learning</span>
                <span className="landing-btn landing-btn--secondary w-full sm:w-auto opacity-90">
                  Explore Learning Paths
                </span>
              </div>
            </div>
          </div>
          <div className="landing-hero__domains border-t border-border/40 h-24 animate-pulse bg-muted/15" aria-hidden />
        </section>
      </main>
    </div>
  );
}
