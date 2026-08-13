/**
 * V6 Part 4 — Content versioning metadata.
 */
import type { ArchitectBlueprint } from "../types.js";
import { ORCHESTRATOR_VERSION } from "../orchestrator/contracts.js";

export interface ContentVersionMeta {
  version: string;
  generatedAt: string;
  orchestratorVersion: string;
  modelVersions: Record<string, string>;
  agentVersions: Record<string, string>;
  knowledgeSourceSnapshot: string;
  changeLog: string[];
  regenerationHistory: Array<{ component: string; at: string; reason: string }>;
}

export function buildContentVersion(
  blueprint: ArchitectBlueprint,
  opts?: { regenerationHistory?: ContentVersionMeta["regenerationHistory"] }
): ContentVersionMeta {
  const sourceCount = blueprint.modules
    .flatMap((m) => m.lessons)
    .reduce((n, l) => n + (l.researchPapers?.length ?? 0) + (l.lessonReferences?.length ?? 0), 0);

  return {
    version: blueprint.orchestratorManifest?.version ?? ORCHESTRATOR_VERSION,
    generatedAt: blueprint.orchestratorManifest?.completedAt ?? new Date().toISOString(),
    orchestratorVersion: ORCHESTRATOR_VERSION,
    modelVersions: {
      lesson: process.env.AI_ARCHITECT_MODEL_LESSON ?? "default",
      qa: process.env.AI_ARCHITECT_MODEL ?? "gpt-4o",
      embedding: process.env.AI_ARCHITECT_EMBEDDING_MODEL ?? "text-embedding-3-small",
    },
    agentVersions: { orchestrator: ORCHESTRATOR_VERSION },
    knowledgeSourceSnapshot: `${sourceCount} references across ${blueprint.modules.reduce((n, m) => n + m.lessons.length, 0)} lessons`,
    changeLog: [`Generated ${new Date().toISOString()}`],
    regenerationHistory: opts?.regenerationHistory ?? [],
  };
}
