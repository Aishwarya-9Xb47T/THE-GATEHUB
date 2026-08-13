import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Zap,
  Laptop,
  Award,
  Microscope,
  Rocket,
  Crown,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export interface JourneyStep {
  label: string;
  description: string;
  icon: LucideIcon;
}

export const LEARNER_JOURNEY_STEPS: JourneyStep[] = [
  {
    label: "Learn",
    description: "Master concepts and foundations",
    icon: BookOpen,
  },
  {
    label: "Practice",
    description: "Apply knowledge through exercises",
    icon: Zap,
  },
  {
    label: "Build",
    description: "Create real-world projects",
    icon: Laptop,
  },
  {
    label: "Certify",
    description: "Validate your expertise",
    icon: Award,
  },
  {
    label: "Research",
    description: "Explore advanced technologies",
    icon: Microscope,
  },
  {
    label: "Innovate",
    description: "Develop impactful solutions",
    icon: Rocket,
  },
  {
    label: "Lead",
    description: "Become an industry leader",
    icon: Crown,
  },
];

function RoadmapConnector({
  index,
  reducedMotion,
}: {
  index: number;
  reducedMotion: boolean;
}) {
  return (
    <div
      className="learner-roadmap__connector"
      aria-hidden
      style={{ animationDelay: reducedMotion ? undefined : `${index * 0.45}s` }}
    >
      <span className="learner-roadmap__connector-line" />
      <span className="learner-roadmap__connector-glow" />
    </div>
  );
}

function RoadmapNode({
  step,
  index,
  reducedMotion,
}: {
  step: JourneyStep;
  index: number;
  reducedMotion: boolean;
}) {
  const Icon = step.icon;

  return (
    <motion.li
      className="learner-roadmap__node"
      initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.55,
        delay: reducedMotion ? 0 : index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="learner-roadmap__node-inner">
        <div className="learner-roadmap__icon-ring">
          <div className="learner-roadmap__icon-wrap">
            <Icon className="learner-roadmap__icon" strokeWidth={1.75} aria-hidden />
          </div>
        </div>
        <h3 className="learner-roadmap__title">{step.label}</h3>
        <p className="learner-roadmap__desc">{step.description}</p>
      </div>
    </motion.li>
  );
}

export function LearnerJourneyRoadmap() {
  const reducedMotion = useReducedMotion();

  return (
    <div
      className="learner-roadmap"
      role="list"
      aria-label="THE GATEHUB learner journey from knowledge to leadership"
    >
      <div className="learner-roadmap__flow-track" aria-hidden>
        <div className="learner-roadmap__flow-base" />
        <div
          className="learner-roadmap__flow-pulse"
          style={{ animationPlayState: reducedMotion ? "paused" : "running" }}
        />
      </div>

      <ol className="learner-roadmap__nodes">
        {LEARNER_JOURNEY_STEPS.map((step, index) => (
          <li key={step.label} className="learner-roadmap__step" role="presentation">
            <RoadmapNode step={step} index={index} reducedMotion={!!reducedMotion} />
            {index < LEARNER_JOURNEY_STEPS.length - 1 && (
              <RoadmapConnector index={index} reducedMotion={!!reducedMotion} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
