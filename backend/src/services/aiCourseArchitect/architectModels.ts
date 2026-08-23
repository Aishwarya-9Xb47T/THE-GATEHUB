/**
 * V6 — Multi-provider model routing (OpenAI, Anthropic Claude, Google Gemini).
 * Override per phase: AI_ARCHITECT_MODEL_<PHASE> or AI_ARCHITECT_PROVIDER_<PHASE>
 */
import { architectAiProviderStatus } from "./openaiClient.js";
export type ArchitectPhase =
  | "research"
  | "structure"
  | "blueprint"
  | "planning"
  | "instructional-design"
  | "lesson"
  | "code"
  | "code-validation"
  | "regenerate"
  | "quiz"
  | "lab"
  | "assignment"
  | "project"
  | "reference"
  | "glossary"
  | "revision"
  | "interview"
  | "youtube"
  | "diagram"
  | "visual"
  | "qa";

export type ModelFamily = "openai" | "anthropic" | "google";

export interface ModelRoute {
  model: string;
  family: ModelFamily;
}

/** Recommended defaults per Part 2 spec — reasoning/writing/visual tiers. */
const DEFAULTS: Record<ArchitectPhase, ModelRoute> = {
  research: { model: "gpt-4o", family: "openai" },
  structure: { model: "gpt-4o", family: "openai" },
  blueprint: { model: "gpt-4o", family: "openai" },
  planning: { model: "gpt-4o", family: "openai" },
  "instructional-design": { model: "gpt-4o", family: "openai" },
  lesson: { model: "claude-sonnet-4-20250514", family: "anthropic" },
  code: { model: "gpt-4o", family: "openai" },
  "code-validation": { model: "gpt-4o-mini", family: "openai" },
  regenerate: { model: "gpt-4o", family: "openai" },
  quiz: { model: "gpt-4o", family: "openai" },
  lab: { model: "gpt-4o", family: "openai" },
  assignment: { model: "gpt-4o", family: "openai" },
  project: { model: "gpt-4o", family: "openai" },
  reference: { model: "gpt-4o-mini", family: "openai" },
  glossary: { model: "gpt-4o-mini", family: "openai" },
  revision: { model: "gpt-4o-mini", family: "openai" },
  interview: { model: "gpt-4o", family: "openai" },
  youtube: { model: "gpt-4o-mini", family: "openai" },
  diagram: { model: "gemini-2.5-flash", family: "google" },
  visual: { model: "gemini-2.5-flash", family: "google" },
  qa: { model: "gpt-4o", family: "openai" },
};

const FAMILY_PREFIX: Record<ModelFamily, string[]> = {
  openai: ["gpt-", "o1", "o3", "o4"],
  anthropic: ["claude"],
  google: ["gemini"],
};

export function inferModelFamily(model: string): ModelFamily {
  const m = model.toLowerCase();
  if (FAMILY_PREFIX.anthropic.some((p) => m.startsWith(p))) return "anthropic";
  if (FAMILY_PREFIX.google.some((p) => m.startsWith(p))) return "google";
  return "openai";
}

function providerOverride(phase: ArchitectPhase): ModelFamily | null {
  const key = `AI_ARCHITECT_PROVIDER_${phase.toUpperCase().replace(/-/g, "_")}`;
  const v = process.env[key]?.toLowerCase();
  if (v === "anthropic" || v === "claude") return "anthropic";
  if (v === "google" || v === "gemini") return "google";
  if (v === "openai" || v === "gpt") return "openai";
  return null;
}

function defaultModelForFamily(family: ModelFamily, phase: ArchitectPhase): string {
  const d = DEFAULTS[phase];
  if (d.family === family) return d.model;
  switch (family) {
    case "anthropic":
      return process.env.AI_ARCHITECT_ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    case "google":
      return process.env.AI_ARCHITECT_GEMINI_MODEL || "gemini-2.5-flash";
    default:
      return process.env.AI_ARCHITECT_OPENAI_MODEL || "gpt-4o";
  }
}

export function getArchitectModelRoute(phase: ArchitectPhase): ModelRoute {
  const envKey = `AI_ARCHITECT_MODEL_${phase.toUpperCase().replace(/-/g, "_")}`;
  const global = process.env.AI_ARCHITECT_MODEL;
  const explicit = process.env[envKey] || global;
  const provider = providerOverride(phase);

  if (explicit) {
    return { model: explicit, family: inferModelFamily(explicit) };
  }
  if (provider) {
    return { model: defaultModelForFamily(provider, phase), family: provider };
  }

  const preferred = DEFAULTS[phase];
  const status = architectAiProviderStatus();
  const familyConfigured = (family: ModelFamily): boolean => {
    if (family === "openai") return status.openai;
    if (family === "anthropic") return status.anthropic;
    return status.gemini;
  };
  if (familyConfigured(preferred.family)) return preferred;
  if (status.openai) return { model: defaultModelForFamily("openai", phase), family: "openai" };
  if (status.anthropic) return { model: defaultModelForFamily("anthropic", phase), family: "anthropic" };
  if (status.gemini) return { model: defaultModelForFamily("google", phase), family: "google" };
  return preferred;
}

/** @deprecated Use getArchitectModelRoute — returns model id only for backward compatibility. */
export function getArchitectModel(phase: ArchitectPhase): string {
  return getArchitectModelRoute(phase).model;
}

export function getLessonMaxTokens(): number {
  const n = parseInt(process.env.AI_ARCHITECT_LESSON_MAX_TOKENS || "4500", 10);
  return Number.isFinite(n) ? Math.min(16000, Math.max(2000, n)) : 4500;
}
