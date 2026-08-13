import type { TechDomain } from "./technologyDomains";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";
import { InfiniteMarqueeRow } from "@/components/landing/InfiniteMarqueeRow";
import {
  MARQUEE_ROW_1,
  MARQUEE_ROW_2,
  MARQUEE_ROW_3,
  MARQUEE_ALL_DOMAINS,
} from "./technologyDomains";

function DomainPill({ domain }: { domain: TechDomain }) {
  const Icon = domain.icon;
  return (
    <div className="domain-pill">
      <Icon className="domain-pill__icon" strokeWidth={1.75} aria-hidden />
      <span className="domain-pill__label">{domain.label}</span>
    </div>
  );
}

interface MarqueeBandProps {
  domains: TechDomain[];
  direction?: "left" | "right";
  speed?: number;
}

function MarqueeBand({ domains, direction = "left", speed = 28 }: MarqueeBandProps) {
  return (
    <InfiniteMarqueeRow
      items={domains}
      renderItem={(d) => <DomainPill domain={d} />}
      direction={direction}
      speed={speed}
    />
  );
}

export function TechnologyEcosystemMarquee() {
  return (
    <section id="domains" className="tech-ecosystem" aria-labelledby="tech-domains-heading">
      <div className="tech-ecosystem__container">
        <ShimmerHeading
          as="h2"
          id="tech-domains-heading"
          className="landing-section-heading landing-section-heading--sub tech-ecosystem__title font-display"
        >
          Explore High-Demand Technology Domains
        </ShimmerHeading>
      </div>

      <div className="tech-ecosystem__marquee-bleed">
        <div className="tech-ecosystem__rows tech-ecosystem__rows--mobile">
          <MarqueeBand domains={MARQUEE_ALL_DOMAINS} direction="left" speed={26} />
        </div>

        <div className="tech-ecosystem__rows tech-ecosystem__rows--tablet">
          <MarqueeBand domains={MARQUEE_ROW_1} direction="left" speed={30} />
          <MarqueeBand domains={[...MARQUEE_ROW_2, ...MARQUEE_ROW_3]} direction="right" speed={28} />
        </div>

        <div className="tech-ecosystem__rows tech-ecosystem__rows--desktop">
          <MarqueeBand domains={MARQUEE_ROW_1} direction="left" speed={32} />
          <MarqueeBand domains={MARQUEE_ROW_2} direction="right" speed={30} />
          <MarqueeBand domains={MARQUEE_ROW_3} direction="left" speed={28} />
        </div>
      </div>
    </section>
  );
}
