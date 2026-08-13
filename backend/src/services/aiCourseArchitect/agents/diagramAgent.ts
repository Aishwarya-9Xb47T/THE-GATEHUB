/**
 * Agent 12 — Diagram Agent
 * Generates structured diagram data (nodes, edges) instead of Mermaid syntax.
 * Renderers will convert this to interactive SVG diagrams.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import type { VisualDiagramBlock, FlowchartBlock } from "../schemas/lessonBlockSchemas.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";


export interface DiagramOutput {
  visualDiagram: VisualDiagramBlock;
  flowchart: FlowchartBlock;
}

async function generateDiagrams(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<DiagramOutput> {
  if (!getOpenAi()) return buildHeuristicDiagrams(lesson.title);

  const prompt = `Generate structured diagram data for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts: ${plan.conceptOrder.join(", ")}

Return JSON with TWO diagrams:

1. Visual Diagram (process/hierarchy/comparison/cycle/network):
{
  "visualDiagram": {
    "type": "visual-diagram",
    "diagramType": "process|comparison|hierarchy|cycle|network",
    "title": "...",
    "description": "...",
    "nodes": [
      {"id": "n1", "label": "...", "position": {"x": 0, "y": 0}, "color": "...", "icon": "..."}
    ],
    "edges": [
      {"from": "n1", "to": "n2", "label": "...", "type": "solid|dashed|arrow"}
    ],
    "layout": "horizontal|vertical|circular|force",
    "interactive": true
  }
}

2. Flowchart (step-by-step process):
{
  "flowchart": {
    "type": "flowchart",
    "title": "...",
    "description": "...",
    "steps": [
      {"id": "s1", "label": "...", "type": "start|process|decision|end|connector", "position": {"x": 0, "y": 0}}
    ],
    "connections": [
      {"from": "s1", "to": "s2", "label": "..."}
    ]
  }
}

Generate REAL educational diagrams. No placeholders. No Mermaid syntax.`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("diagram"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 3000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicDiagrams(lesson.title);
    return JSON.parse(raw) as DiagramOutput;
  } catch {
    return buildHeuristicDiagrams(lesson.title);
  }
}

function buildHeuristicDiagrams(title: string): DiagramOutput {
  return {
    visualDiagram: {
      type: "visual-diagram",
      diagramType: "process",
      title: `Learning Path: ${title}`,
      description: "Step-by-step learning journey",
      nodes: [
        { id: "n1", label: "Start", position: { x: 0, y: 0 }, color: "#4CAF50", icon: "play" },
        { id: "n2", label: "Core Concept", position: { x: 200, y: 0 }, color: "#2196F3", icon: "book" },
        { id: "n3", label: "Practice", position: { x: 400, y: 0 }, color: "#FF9800", icon: "code" },
        { id: "n4", label: "Apply in Project", position: { x: 600, y: 0 }, color: "#9C27B0", icon: "rocket" },
        { id: "n5", label: "Lesson Complete", position: { x: 800, y: 0 }, color: "#4CAF50", icon: "check" },
      ],
      edges: [
        { from: "n1", to: "n2", type: "arrow" },
        { from: "n2", to: "n3", type: "arrow" },
        { from: "n3", to: "n4", type: "arrow" },
        { from: "n4", to: "n5", type: "arrow" },
      ],
      layout: "horizontal",
      interactive: true,
    },
    flowchart: {
      type: "flowchart",
      title: `Process Flow: ${title}`,
      description: "Step-by-step execution",
      steps: [
        { id: "s1", label: "Start", type: "start", position: { x: 0, y: 0 } },
        { id: "s2", label: "Learn Core Concept", type: "process", position: { x: 200, y: 0 } },
        { id: "s3", label: "Practice Exercises", type: "process", position: { x: 400, y: 0 } },
        { id: "s4", label: "Apply in Project", type: "process", position: { x: 600, y: 0 } },
        { id: "s5", label: "Complete", type: "end", position: { x: 800, y: 0 } },
      ],
      connections: [
        { from: "s1", to: "s2" },
        { from: "s2", to: "s3" },
        { from: "s3", to: "s4" },
        { from: "s4", to: "s5" },
      ],
    },
  };
}

function validateDiagrams(output: DiagramOutput): ArchitectQualityReport {
  const visualNodes = output?.visualDiagram?.nodes?.length ?? 0;
  const flowchartSteps = output?.flowchart?.steps?.length ?? 0;
  const checks = [
    {
      id: "visual-diagram",
      label: "Visual Diagram",
      status: visualNodes >= 2 ? ("pass" as const) : ("fail" as const),
      detail: `${visualNodes} nodes`,
    },
    {
      id: "flowchart",
      label: "Flowchart",
      status: flowchartSteps >= 2 ? ("pass" as const) : ("fail" as const),
      detail: `${flowchartSteps} steps`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 40),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid structured diagrams with nodes and steps"] : [],
  };
}

export async function runDiagramAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "diagram",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateDiagrams(l, c, p),
    validate: validateDiagrams,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}

export function applyDiagramsToLesson(
  lesson: ArchitectLessonBlueprint,
  output: DiagramOutput
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured blocks
    visualDiagramBlock: output.visualDiagram,
    flowchartBlock: output.flowchart,
  };
}
