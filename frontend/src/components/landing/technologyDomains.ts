import type { LucideIcon } from "lucide-react";
import {
  Brain,
  BrainCircuit,
  Cog,
  Code2,
  Cpu,
  Layers,
  Monitor,
  Network,
  Sparkles,
  Atom,
} from "lucide-react";

export interface TechDomain {
  label: string;
  icon: LucideIcon;
}

export const MARQUEE_ROW_1: TechDomain[] = [
  { label: "Operating System", icon: Monitor },
  { label: "C Programming", icon: Code2 },
  { label: "Design and Analysis of Algorithms", icon: Layers },
  { label: "Compiler Design", icon: Cog },
];

export const MARQUEE_ROW_2: TechDomain[] = [
  { label: "Discrete Mathematics", icon: Atom },
  { label: "Theory of Computation", icon: Brain },
  { label: "Graph Theory", icon: Network },
  { label: "Data Structures", icon: Layers },
];

export const MARQUEE_ROW_3: TechDomain[] = [
  { label: "Algorithms", icon: BrainCircuit },
  { label: "Artificial Intelligence & Machine Learning (AI/ML)", icon: Sparkles },
  { label: "Deep Learning", icon: BrainCircuit },
  { label: "Machine Learning", icon: Cpu },
];

export const MARQUEE_ALL_DOMAINS: TechDomain[] = [
  ...MARQUEE_ROW_1,
  ...MARQUEE_ROW_2,
  ...MARQUEE_ROW_3,
];
