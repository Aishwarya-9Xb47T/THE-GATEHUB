import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { LearnerJourneyRoadmap } from "@/components/landing/LearnerJourneyRoadmap";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";

const fadeUp = (delay: number, reduced: boolean) =>
  reduced
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
        transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
      };

export function EcosystemValueSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-80px" });
  const reducedMotion = useReducedMotion();
  const motionOff = !!reducedMotion;

  return (
    <section
      id="features"
      ref={sectionRef}
      className="ecosystem-value relative border-t border-border"
    >
      <div className="ecosystem-value__bg" aria-hidden />
      <div className="ecosystem-value__spotlight ecosystem-value__spotlight--header" aria-hidden />
      <div className="ecosystem-value__spotlight ecosystem-value__spotlight--roadmap" aria-hidden />

      <div className="landing-shell landing-shell--ecosystem relative z-10">
        <header className="ecosystem-value__header landing-section-heading-wrap">
          <motion.div
            className="ecosystem-value__eyebrow-wrap"
            {...fadeUp(0, motionOff)}
          >
            <span className="ecosystem-value__eyebrow-glow" aria-hidden />
            <span className="ecosystem-value__eyebrow">
              <span className="ecosystem-value__eyebrow-inner">
                <span className="ecosystem-value__eyebrow-label">
                  <span className="ecosystem-value__eyebrow-text">Why THE GATEHUB</span>
                  <span className="ecosystem-value__eyebrow-shine" aria-hidden="true">
                    Why THE GATEHUB
                  </span>
                </span>
              </span>
            </span>
          </motion.div>

          <ShimmerHeading
            as={motion.h2}
            className="landing-section-heading ecosystem-value__headline font-display"
            initial={motionOff ? false : { opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            More Than Learning.
            <br />
            A Complete Technology Growth Ecosystem.
          </ShimmerHeading>

          <motion.p className="landing-subheading ecosystem-value__description mx-auto" {...fadeUp(0.08, motionOff)}>
            THE GATEHUB is designed to take learners beyond traditional courses. Master concepts,
            practice skills, build projects, earn certifications, conduct research, innovate
            solutions, and grow into future technology leaders.
          </motion.p>
        </header>

        <motion.div className="ecosystem-value__roadmap-wrap" {...fadeUp(0.16, motionOff)}>
          <LearnerJourneyRoadmap />
        </motion.div>
      </div>
    </section>
  );
}
