/**
 * V6 Part 3 — Knowledge graph generation (concept, prerequisite, skill graphs).
 */
import type { ArchitectBlueprint } from "../types.js";

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: "concept" | "skill" | "lesson" | "module";
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  relation: "prerequisite" | "depends-on" | "teaches" | "assesses";
}

export interface KnowledgeGraphData {
  conceptGraph: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  prerequisiteChain: string[];
  skillCoverage: string[];
  mermaidSummary: string;
}

export function buildKnowledgeGraph(blueprint: ArchitectBlueprint): KnowledgeGraphData {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const prerequisiteChain: string[] = [];
  const skillCoverage: string[] = [];

  blueprint.modules.forEach((mod, mi) => {
    nodes.push({ id: mod.id, label: mod.title, type: "module" });
    if (mi > 0) {
      edges.push({
        from: blueprint.modules[mi - 1].id,
        to: mod.id,
        relation: "prerequisite",
      });
    }
    mod.lessons.forEach((lesson, li) => {
      nodes.push({ id: lesson.id, label: lesson.title, type: "lesson" });
      edges.push({ from: mod.id, to: lesson.id, relation: "teaches" });
      if (li > 0) {
        edges.push({ from: mod.lessons[li - 1].id, to: lesson.id, relation: "depends-on" });
      }
      for (const obj of lesson.objectives ?? []) {
        const conceptId = `concept-${lesson.id}-${obj.slice(0, 20).replace(/\W/g, "")}`;
        nodes.push({ id: conceptId, label: obj, type: "concept" });
        edges.push({ from: lesson.id, to: conceptId, relation: "teaches" });
        skillCoverage.push(obj);
      }
      if (lesson.codingLab) skillCoverage.push(`lab:${lesson.title}`);
      if (lesson.quizQuestions?.length) skillCoverage.push(`quiz:${lesson.title}`);
    });
    prerequisiteChain.push(mod.title);
  });

  const mermaidLines = ["flowchart LR"];
  for (const edge of edges.slice(0, 40)) {
    const from = edge.from.replace(/[^a-zA-Z0-9_]/g, "_");
    const to = edge.to.replace(/[^a-zA-Z0-9_]/g, "_");
    mermaidLines.push(`  ${from} --> ${to}`);
  }

  return {
    conceptGraph: nodes.filter((n) => n.type === "concept"),
    edges,
    prerequisiteChain,
    skillCoverage: [...new Set(skillCoverage)].slice(0, 50),
    mermaidSummary: mermaidLines.join("\n"),
  };
}

export function attachKnowledgeGraphToBlueprint(blueprint: ArchitectBlueprint): ArchitectBlueprint {
  const graph = buildKnowledgeGraph(blueprint);
  return {
    ...blueprint,
    knowledgeGraph: graph.mermaidSummary,
    prerequisiteGraph: graph.prerequisiteChain.join(" → "),
  };
}
